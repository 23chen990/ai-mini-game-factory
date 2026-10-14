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
const run = path.resolve('runs/h5-qq-mobile-20261013');
const root = path.join(run, 'workspace/game');
const label = process.env.RACE_QA_LABEL ?? 'v3-natural';
const out = path.join(run, 'evidence', label);
await mkdir(out, { recursive: true });
const build = JSON.parse(await readFile(path.join(run, 'artifacts/build-racing.json')));
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
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const browser = await chromium.launch({ headless: process.env.RACE_QA_HEADLESS === '1', args: ['--use-angle=metal'] });
const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1,
  ...(process.env.RACE_QA_VIDEO === '1' ? { recordVideo: { dir: out, size: viewport } } : {}) });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const errors = [], races = [], controls = [];
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
  if (document.querySelector('#warn')?.textContent.includes('方向错误')) return { direction: 'left', reason: 'visible-wrong-way-recovery' };
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
  const targets = [];
  for (let y = Math.max(0, Math.floor(cy - radius - 2)); y < Math.min(H, cy + radius + 2); y++) for (let x = Math.max(0, Math.floor(cx - radius - 2)); x < Math.min(W, cx + radius + 2); x++) {
    const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy), i = (y * W + x) * 4;
    const white = rgba[i] > 205 && rgba[i + 1] > 205 && rgba[i + 2] > 205;
    const bridge = rgba[i] < 110 && rgba[i + 1] > 145 && rgba[i + 2] > 190;
    if (Math.abs(r - radius) < 1.5 && (hx * dx + hy * dy) / r > .35 && (white || bridge)) targets.push({ x: dx, y: dy });
  }
  if (!targets.length) return { direction: null, reason: 'ahead-road-not-visible' };
  const tx = targets.reduce((s, p) => s + p.x, 0) / targets.length, ty = targets.reduce((s, p) => s + p.y, 0) / targets.length;
  const angle = Math.atan2(hx * ty - hy * tx, hx * tx + hy * ty);
  return { direction: angle > .10 ? 'left' : angle < -.10 ? 'right' : null, angle, position: [cx, cy], target: [tx, ty] };
}
async function observed() {
  return page.evaluate(() => {
    const g = window.game, p = g.player;
    return { phase: document.querySelector('#race-kit').dataset.phase, state: g.state, raceTime: g.raceTime,
      map: g.map.id, laps: g.settings.laps, diff: g.settings.diff, mode: g.settings.mode,
      progress: p?.progress ?? 0, finished: !!p?.finished, finishTime: p?.finishTime ?? null,
      place: g.standings.indexOf(p) + 1, speed: p?.speedKmh ?? 0, lat: p?.lat ?? 0,
      firstFinish: g.firstFinish, racers: g.racers.map(r => ({ name: r.name, isPlayer: r.isPlayer, skill: r.skill ?? null,
        finished: !!r.finished, finishTime: r.finishTime, progress: r.progress })),
      stats: { ...p?.stats }, items: [...(p?.items ?? [])],
      goal: document.querySelector('#race-live-goal').textContent,
      feedback: document.querySelector('#msgs').textContent,
      events: window.__RACE_EVIDENCE__.events,
      heading: document.querySelector('#race-heading').textContent,
      result: document.querySelector('#race-result-copy').textContent,
      resultStats: document.querySelector('#race-result-stats').textContent,
      saved: localStorage.getItem('h5-mobile:qq-speed:career:v1') };
  });
}
try {
  await page.goto('http://127.0.0.1:' + server.address().port + '/');
  await page.locator('#race-start:not([disabled])').waitFor({ timeout: 45000 });
  await page.screenshot({ path: path.join(out, 'startup.png') });
  const limit = Number(process.env.RACE_QA_STAGES ?? 16);
  const count = limit + (limit === 16 ? 1 : 0);
  for (let index = 0; index < count; index++) {
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
    const startedAt = Date.now(), deadline = startedAt + 600000;
    console.log(JSON.stringify({ stage: index + 1, entry, status: 'DRIVING' }));
    while (Date.now() < deadline) {
      const policy = await page.evaluate(minimapPolicy, Number(process.env.RACE_QA_LOOKAHEAD ?? 21));
      await steer(policy.direction);
      const o = await observed();
      const telemetry = { ...o }; delete telemetry.events; delete telemetry.saved;
      trace.push({ at: Date.now(), policy, touch: touching, observed: telemetry });
      const capture = o.events.find(e => !captures.has(e.type) && ['driftEnd', 'nitro', 'crash', 'pad'].includes(e.type) && (e.type !== 'driftEnd' || e.clean));
      if (capture) { captures.add(capture.type); await page.screenshot({ path: path.join(out, `${name}-${capture.type}.png`) }); }
      for (const [key, condition] of [['elimination', o.goal.includes('距离淘汰')], ['item-use', o.feedback.includes('已使用')]]) {
        if (condition && !captures.has(key)) { captures.add(key); await page.screenshot({ path: path.join(out, name + '-' + key + '.png') }); }
      }
      if (o.raceTime - lastLog >= 20) { lastLog = o.raceTime; console.log(JSON.stringify({ stage: index + 1, time: +o.raceTime.toFixed(1), progress: Math.round(o.progress), place: o.place, goal: o.goal, crashes: o.stats.crash })); }
      if (o.phase === 'finished') { terminal = o; break; }
      await page.waitForTimeout(65);
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
      status: t.finished && stars > 0 ? 'PASS' : 'BLOCKED', input: 'visible-minimap-pixels + trusted CDP touch only', forbiddenOperations: [] };
    races.push(race);
    await writeFile(path.join(out, name + '-trace.json'), JSON.stringify({ buildHash: build.buildHash, driverPolicy: 'player-visible minimap pixels only', inputTransport: 'CDP Input.dispatchTouchEvent', forbiddenOperations: [], controls: controls.splice(0), frames: trace, terminal: race }, null, 2));
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
    naturalInputsOnly: true, seededCampaign: false, driverPolicy: 'player-visible minimap pixels only; native state read for assertions',
    races, errors, passed: races.length === Number(process.env.RACE_QA_STAGES ?? 16) + (Number(process.env.RACE_QA_STAGES ?? 16) === 16 ? 1 : 0) && races.every(r => r.status === 'PASS' && r.actionsFit) && !errors.length, checkedAt: new Date().toISOString() });
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  const video = page.video(); await context.close(); if (video) await video.saveAs(path.join(out, 'natural-career.webm'));
  await browser.close(); server.close();
  console.log(JSON.stringify({ report: path.join(out, 'report.json'), sha256: createHash('sha256').update(JSON.stringify(report)).digest('hex'), passed: report.passed, races: races.length, errors }));
  if (!report.passed) process.exitCode = 1;
}
