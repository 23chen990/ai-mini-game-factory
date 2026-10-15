/* global process, console, window, document, localStorage, URL */
// Natural driving uses the existing player-visible minimap pixel policy.
// Native telemetry is read only for assertions, never to choose steering.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createRequire } from 'node:module';
import { itemBoxPolicy, earnedResumeOrigin, recoverVisibleHeading, qualifiedVisibleFinish, needsVisibleItemPickup, visibleItemSteer } from './racing-visible-policy.mjs';
const require = createRequire(import.meta.url), testRequire = createRequire(require.resolve('@playwright/test'));
const playwrightRequire = createRequire(testRequire.resolve('playwright'));
const { PNG } = require(path.join(path.dirname(playwrightRequire.resolve('playwright-core/package.json')), 'lib/utilsBundle.js'));
const run = path.resolve('runs/h5-qq-mobile-20261013');
const root = path.join(run, 'workspace/game');
const label = process.env.RACE_QA_LABEL ?? 'v3-natural';
const out = path.join(run, 'evidence', label);
await mkdir(out, { recursive: true });
const build = JSON.parse(await readFile(path.join(run, 'artifacts/build-racing.json')));
const resumeReport = process.env.RACE_QA_RESUME_REPORT ? JSON.parse(await readFile(process.env.RACE_QA_RESUME_REPORT)) : null;
const resumeStorage = resumeReport ? JSON.parse(await readFile(process.env.RACE_QA_RESUME_STORAGE)) : null;
const resumeOrigin = resumeReport ? earnedResumeOrigin(resumeReport, resumeStorage, build.buildHash) : null;
if (resumeReport && path.dirname(path.resolve(process.env.RACE_QA_RESUME_REPORT)) === out) throw Error('Resume must write a new evidence directory');
const viewport = { width: Number(process.env.RACE_QA_WIDTH ?? 844), height: Number(process.env.RACE_QA_HEIGHT ?? 390) };
const snapshot = new Map();
for (const entry of await readdir(root, { withFileTypes: true })) if (entry.isFile()) snapshot.set(path.join(root, entry.name), await readFile(path.join(root, entry.name)));
const server = createServer(async (req, res) => {
  try {
    const file = path.resolve(root, '.' + (new URL(req.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(root + path.sep)) throw Error('path');
    res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : 'text/html');
    if (!snapshot.has(file)) throw Error('not in immutable build snapshot');
    res.end(snapshot.get(file));
  } catch { res.writeHead(404); res.end('missing'); }
});
server.listen(resumeOrigin ? Number(new URL(resumeOrigin).port) : 0, '127.0.0.1'); await once(server, 'listening');
const ciHeadless = process.env.RACE_QA_HEADLESS === '1';
const browser = await chromium.launch({ headless: ciHeadless,
  args: ciHeadless ? ['--enable-webgl', '--enable-unsafe-swiftshader', '--use-gl=angle',
    '--use-angle=swiftshader', '--disable-gpu-sandbox'] : ['--use-angle=metal'] });
const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1,
  ...(resumeStorage ? { storageState: resumeStorage } : {}),
  ...(process.env.RACE_QA_VIDEO === '1' ? { recordVideo: { dir: out, size: viewport } } : {}) });
const recordingBeforePageMs = Date.now();
const page = await context.newPage();
const recordingAfterPageMs = Date.now();
const cdp = await context.newCDPSession(page);
const errors = [], races = [], controls = [];
let startIndex = 0;
page.on('pageerror', e => errors.push(e.message));
page.on('dialog', dialog => dialog.accept());
let touching = null, buttons;
async function steer(direction) {
  if (direction === touching) return;
  if (touching) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  if (direction) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...buttons[direction], id: 1, radiusX: 7, radiusY: 7, force: 1 }] });
  touching = direction;
  controls.push({ at: Date.now(), direction });
}
function minimapPolicy(radius) {
  // Recover from an item spin using the same visible wrong-way warning a player sees.
  // The former QA policy blindly followed its arrow backwards around the whole track.
  const warning = document.querySelector('#warn');
  const wrongWay = !!warning?.getClientRects().length && !warning.classList.contains('hidden') && warning.textContent.includes('方向错误');
  const c = document.querySelector('#mm');
  const W = c.width, H = c.height, rgba = c.getContext('2d').getImageData(0, 0, W, H).data;
  const yellow = new Uint8Array(W * H), seen = new Uint8Array(W * H), components = [];
  for (let i = 0; i < yellow.length; i++) yellow[i] = rgba[i * 4] > 235 && rgba[i * 4 + 1] > 175 && rgba[i * 4 + 1] < 235 && rgba[i * 4 + 2] < 95 ? 1 : 0;
  for (let i = 0; i < yellow.length; i++) {
    if (!yellow[i] || seen[i]) continue;
    const queue = [i], points = []; seen[i] = 1;
    for (let j = 0; j < queue.length; j++) {
      const p = queue[j], x = p % W, y = Math.floor(p / W); points.push({ x, y });
      for (const n of [p - W, p + W, x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1]) if (n >= 0 && n < yellow.length && yellow[n] && !seen[n]) { seen[n] = 1; queue.push(n); }
    }
    if (points.length > 70) components.push(points);
  }
  const arrows = components.filter(points => Math.max(Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)), Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y))) > 15);
  const points = arrows.sort((a, b) => b.length - a.length)[0];
  if (!points) return { direction: null, reason: 'player-arrow-not-visible' };
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length, cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  const xx = points.reduce((s, p) => s + (p.x - cx) ** 2, 0), yy = points.reduce((s, p) => s + (p.y - cy) ** 2, 0), xy = points.reduce((s, p) => s + (p.x - cx) * (p.y - cy), 0);
  const axis = .5 * Math.atan2(2 * xy, xx - yy); let hx = Math.cos(axis), hy = Math.sin(axis);
  if (points.reduce((s, p) => s + ((p.x - cx) * hx + (p.y - cy) * hy) ** 3, 0) < 0) { hx *= -1; hy *= -1; }
  const targets = [], roadPoints = [];
  for (let y = Math.max(0, Math.floor(cy - radius - 2)); y < Math.min(H, cy + radius + 2); y++) for (let x = Math.max(0, Math.floor(cx - radius - 2)); x < Math.min(W, cx + radius + 2); x++) {
    const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy), i = (y * W + x) * 4;
    const white = rgba[i] > 205 && rgba[i + 1] > 205 && rgba[i + 2] > 205;
    const bridge = rgba[i] < 110 && rgba[i + 1] > 145 && rgba[i + 2] > 190;
    if (Math.abs(r - radius) < 1.5 && (white || bridge)) {
      roadPoints.push([dx, dy]);
      if ((hx * dx + hy * dy) / r > .35) targets.push({ x: dx, y: dy });
    }
  }
  if (!targets.length) return { direction: null, reason: 'ahead-road-not-visible', heading: [hx, hy], wrongWay, roadPoints };
  const tx = targets.reduce((s, p) => s + p.x, 0) / targets.length, ty = targets.reduce((s, p) => s + p.y, 0) / targets.length;
  const angle = Math.atan2(hx * ty - hy * tx, hx * tx + hy * ty);
  return { direction: angle > .10 ? 'left' : angle < -.10 ? 'right' : null, angle, position: [cx, cy], target: [tx, ty], heading: [hx, hy], wrongWay, roadPoints };
}
async function observed(full = false) {
  return page.evaluate(full => {
    const g = window.game, p = g.player;
    return { phase: document.querySelector('#race-kit').dataset.phase, state: g.state, raceTime: g.raceTime,
      map: g.map.id, laps: g.settings.laps, diff: g.settings.diff, mode: g.settings.mode,
      progress: p?.progress ?? 0, finished: !!p?.finished, finishTime: p?.finishTime ?? null,
      place: g.standings.indexOf(p) + 1, speed: p?.speedKmh ?? 0, lat: p?.lat ?? 0,
      spinSec: p?.spin ?? 0, wrongWaySec: p?.wrongWay ?? 0, forwardHeadingDot: p ? Math.cos(p.h - p.proj.hd) : null,
      firstFinish: g.firstFinish, racers: g.racers.map(r => ({ name: r.name, isPlayer: r.isPlayer, skill: r.skill ?? null,
        finished: !!r.finished, finishTime: r.finishTime, progress: r.progress })),
      stats: { ...p?.stats }, items: [...(p?.items ?? [])],
      goal: document.querySelector('#race-live-goal').textContent,
      feedback: document.querySelector('#msgs').textContent,
      events: full ? window.__RACE_EVIDENCE__.events : window.__RACE_EVIDENCE__.events.filter(e => ['driftEnd', 'nitro', 'crash', 'pad', 'item'].includes(e.type)).slice(-8),
      heading: document.querySelector('#race-heading').textContent,
      result: document.querySelector('#race-result-copy').textContent,
      resultStats: document.querySelector('#race-result-stats').textContent,
      saved: localStorage.getItem('h5-mobile:qq-speed:career:v1') };
  }, full);
}
try {
  await page.goto('http://127.0.0.1:' + server.address().port + '/');
  await page.locator('#race-start:not([disabled])').waitFor({ timeout: 45000 });
  await page.screenshot({ path: path.join(out, 'startup.png') });
  const limit = Number(process.env.RACE_QA_STAGES ?? 16);
  const count = limit + (limit === 16 ? 1 : 0);
  if (resumeReport) {
    const actualSaved = await page.evaluate(() => localStorage.getItem('h5-mobile:qq-speed:career:v1'));
    if (actualSaved !== resumeReport.races.at(-1).saved) throw Error('Browser did not restore the exact earned campaign');
    startIndex = Number(await page.locator('#race-stage').inputValue());
    races.push(...resumeReport.races.filter(r => r.status === 'PASS' && Number(r.stage) <= startIndex).map(r => ({ ...r, inheritedEvidence: process.env.RACE_QA_RESUME_REPORT })));
    await writeFile(path.join(out, 'resume-provenance.json'), JSON.stringify({ buildHash: build.buildHash, report: process.env.RACE_QA_RESUME_REPORT, reportSha256: createHash('sha256').update(await readFile(process.env.RACE_QA_RESUME_REPORT)).digest('hex'), storage: process.env.RACE_QA_RESUME_STORAGE, storageSha256: createHash('sha256').update(await readFile(process.env.RACE_QA_RESUME_STORAGE)).digest('hex'), origin: resumeOrigin, startIndex, injectedProgress: false }, null, 2));
  }
  for (let index = startIndex; index < count; index++) {
    const name = index === 16 ? 'daily' : String(index + 1).padStart(2, '0');
    if (index) {
      await page.locator('#race-stage').selectOption(index === 16 ? 'daily' : String(index));
      await page.waitForFunction(() => !document.querySelector('#race-start').disabled, null, { timeout: 45000 });
    }
    const entry = await page.locator('#race-stage option:checked').textContent();
    await page.locator('#race-start').tap();
    await page.waitForFunction(() => window.game.state === 'race', null, { timeout: 45000 });
    buttons = await page.evaluate(() => Object.fromEntries(['left', 'right'].map(d => { const r = document.querySelector('#race-' + d).getBoundingClientRect(); return [d, { x: r.x + r.width / 2, y: r.y + r.height / 2 }]; })));
    const trace = [], captures = new Set(); let terminal = null, lastLog = 0;
    const startedAt = Date.now(), deadline = startedAt + Math.max(30000, Math.min(600000, Number(process.env.RACE_QA_MAX_MS ?? 600000)));
    const visibleStageTag = await page.locator('#race-stage-tag').textContent();
    const isItemRace = visibleStageTag.includes('道具赛');
    const visibleLookahead = Number(process.env.RACE_QA_LOOKAHEAD ?? (isItemRace && entry.includes('雪地') ? 18 : 21));
    let lastBoxScan = 0, box = null; const visibleMemory = {}; let lastScene = 0, lastPickups = 0;
    console.log(JSON.stringify({ stage: index + 1, entry, status: 'DRIVING' }));
    while (Date.now() < deadline) {
      let policy = recoverVisibleHeading(await page.evaluate(minimapPolicy, visibleLookahead), visibleMemory, Date.now());
      const seekBox = isItemRace && needsVisibleItemPickup(await page.locator('#race-live-goal').textContent());
      if (!seekBox) box = null;
      if (seekBox && Date.now() - lastBoxScan > 350) {
        lastBoxScan = Date.now();
        box = itemBoxPolicy(PNG.sync.read(await page.screenshot()));
      }
      policy = visibleItemSteer(policy, box);
      await steer(policy.direction);
      const o = await observed();
      const telemetry = { ...o }; delete telemetry.events; delete telemetry.saved;
      trace.push({ at: Date.now(), policy, touch: touching, observed: telemetry });
      const capture = o.events.find(e => !captures.has(e.type) && ['driftEnd', 'nitro', 'crash', 'pad'].includes(e.type) && (e.type !== 'driftEnd' || e.clean));
      if (capture) { captures.add(capture.type); await page.screenshot({ path: path.join(out, `${name}-${capture.type}.png`) }); }
      const pickups = Number(o.goal.match(/已拾取道具 (\d+)\//u)?.[1] ?? 0);
      for (const [key, condition] of [['elimination', o.goal.includes('距离淘汰')], ['item-use', pickups > 0 && o.feedback.includes('已使用')], ['pickup', pickups > lastPickups]]) {
        if (condition && !captures.has(key)) { captures.add(key); await page.waitForTimeout(180); await page.screenshot({ path: path.join(out, name + '-' + key + '.png') }); }
      }
      lastPickups = pickups;
      if (o.spinSec <= 0 && o.wrongWaySec > .2 && o.forwardHeadingDot < -.3 && !captures.has('wrong-way')) { captures.add('wrong-way'); await page.screenshot({ path: path.join(out, name + '-wrong-way.png') }); }
      if (captures.has('wrong-way') && o.spinSec <= 0 && o.wrongWaySec === 0 && o.forwardHeadingDot > .7 && !captures.has('recovered')) { captures.add('recovered'); await page.screenshot({ path: path.join(out, name + '-recovered.png') }); }
      if (name === '04' && o.raceTime >= lastScene + 5) { lastScene = Math.floor(o.raceTime / 5) * 5; await page.screenshot({ path: path.join(out, name + '-scene-' + lastScene + '.png') }); }
      if (o.raceTime - lastLog >= 20) { lastLog = o.raceTime; console.log(JSON.stringify({ stage: index + 1, time: +o.raceTime.toFixed(1), progress: Math.round(o.progress), place: o.place, goal: o.goal, crashes: o.stats.crash })); }
      if (o.phase === 'finished') { terminal = await observed(true); break; }
      await page.waitForTimeout(40);
    }
    await steer(null);
    await page.screenshot({ path: path.join(out, name + '-terminal.png') });
    const t = terminal ?? await observed();
    const saved = JSON.parse(t.saved ?? '{}'), stars = name === 'daily' ? saved.daily?.stars ?? 0 : saved.stars?.[name] ?? 0;
    const terminalButtons = await page.evaluate(() => ['replay', 'next', 'lobby'].filter(id => !document.querySelector('#race-' + id).hidden).map(id => {
      const r = document.querySelector('#race-' + id).getBoundingClientRect();
      return { id, top: r.top, bottom: r.bottom, height: r.height };
    }));
    const race = { stage: name, entry, ...t, earnedStars: stars, wallDurationMs: Date.now() - startedAt,
      terminalButtons, actionsFit: terminalButtons.every(b => b.top >= 0 && b.bottom <= viewport.height && b.height >= 44),
      status: qualifiedVisibleFinish(t, stars) ? 'PASS' : 'BLOCKED', input: 'visible minimap + cyan cube pixels + visible wrong-way warning; trusted CDP touch only', forbiddenOperations: [] };
    races.push(race);
    await writeFile(path.join(out, name + '-trace.json'), JSON.stringify({ buildHash: build.buildHash, driverPolicy: race.input, inputTransport: 'CDP Input.dispatchTouchEvent', forbiddenOperations: [], controls: controls.splice(0), frames: trace, terminal: race }, null, 2));
    await writeFile(path.join(out, 'checkpoint.json'), JSON.stringify({ buildHash: build.buildHash, races, errors }, null, 2));
    await context.storageState({ path: path.join(out, 'natural-earned-storage.json') });
    console.log(JSON.stringify({ stage: name, status: race.status, finished: t.finished, time: t.finishTime, place: t.place, stars, result: t.result, resultStats: t.resultStats }));
    if (race.status !== 'PASS') break;
    if (index === count - 1) {
      await page.locator('#race-replay').tap();
      await page.waitForFunction(() => window.game.state === 'race', null, { timeout: 45000 });
      await page.screenshot({ path: path.join(out, 'replay.png') });
      await writeFile(path.join(out, 'replay.json'), JSON.stringify(await observed(), null, 2));
      await page.locator('#race-pause').tap();
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#race-start:not([disabled])').waitFor({ timeout: 45000 });
    const restored = await page.evaluate(() => localStorage.getItem('h5-mobile:qq-speed:career:v1'));
    if (restored !== t.saved) throw Error('earned campaign progress changed on reload');
  }
} catch (e) { errors.push(e.stack); }
finally {
  const Schema = z.object({ schemaVersion: z.literal(1), gameId: z.literal('qq-speed'), buildHash: z.string().length(64),
    viewport: z.object({ width: z.number(), height: z.number() }), naturalInputsOnly: z.literal(true), seededCampaign: z.literal(false),
    driverPolicy: z.string(), races: z.array(z.any()), errors: z.array(z.string()), passed: z.boolean(), checkedAt: z.string() });
  const report = Schema.parse({ schemaVersion: 1, gameId: 'qq-speed', buildHash: build.buildHash, viewport,
    naturalInputsOnly: true, seededCampaign: false, driverPolicy: 'visible minimap, cyan cube pixels and visible wrong-way warning; native state read only for assertions',
    races, errors, passed: races.length === Number(process.env.RACE_QA_STAGES ?? 16) + (Number(process.env.RACE_QA_STAGES ?? 16) === 16 ? 1 : 0) && races.every(r => r.status === 'PASS' && r.actionsFit) && !errors.length, checkedAt: new Date().toISOString() });
  report.recordingTimebase = { beforePageMs: recordingBeforePageMs, afterPageMs: recordingAfterPageMs, uncertainty: 'Recorder starts during page creation; use visible clock and keep context around trimmed evidence' };
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  const video = page.video(); await context.close(); if (video) await video.saveAs(path.join(out, 'natural-career.webm'));
  await browser.close(); server.close();
  console.log(JSON.stringify({ report: path.join(out, 'report.json'), sha256: createHash('sha256').update(JSON.stringify(report)).digest('hex'), passed: report.passed, races: races.length, errors }));
  if (!report.passed) process.exitCode = 1;
}
