/* global Buffer, process, console, window, document, localStorage, URL */
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
import { itemBoxPolicy, earnedResumeOrigin, earnedUpgradeOrigin, recoverVisibleHeading, qualifiedVisibleFinish, dailyRaceDayFromStart, needsVisibleItemPickup, visibleItemSteer } from './racing-visible-policy.mjs';
import { actionTouchPoints, planWheelGesture } from './racing-wheel-qa-input.mjs';
import { minimapPolicy } from './racing-minimap-observer.mjs';
import { VisibleWheelPolicy, VisibleActionPolicy, reconcileTouchContacts, visibleSteering } from './racing-visible-actions.mjs';
const require = createRequire(import.meta.url), testRequire = createRequire(require.resolve('@playwright/test'));
const playwrightRequire = createRequire(testRequire.resolve('playwright'));
const { PNG } = require(path.join(path.dirname(playwrightRequire.resolve('playwright-core/package.json')), 'lib/utilsBundle.js'));
const run = path.resolve('runs/h5-qq-mobile-20261013');
const root = path.join(run, 'workspace/game');
const label = process.env.RACE_QA_LABEL ?? 'v3-natural';
const out = path.join(run, 'evidence', label);
await mkdir(path.dirname(out), { recursive: true });
await mkdir(out); // Every labelled attempt preserves its own evidence.
const build = JSON.parse(await readFile(path.join(run, 'artifacts/build-racing.json')));
const resumeReport = process.env.RACE_QA_RESUME_REPORT ? JSON.parse(await readFile(process.env.RACE_QA_RESUME_REPORT)) : null;
const resumeStorage = resumeReport ? JSON.parse(await readFile(process.env.RACE_QA_RESUME_STORAGE)) : null;
const upgradeBuild = process.env.RACE_QA_UPGRADE_BUILD ? JSON.parse(await readFile(process.env.RACE_QA_UPGRADE_BUILD)) : null;
const resumeOrigin = upgradeBuild ? earnedUpgradeOrigin(resumeReport, resumeStorage, upgradeBuild, build.buildHash) : resumeReport ? earnedResumeOrigin(resumeReport, resumeStorage, build.buildHash) : null;
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
if (ciHeadless) await context.addInitScript({ content:
  "try { localStorage.setItem('h5-qq-mobile-20261013:graphics-quality:v1', 'low'); } catch {}" });
const page = await context.newPage();
const recordingAfterPageMs = Date.now();
const cdp = await context.newCDPSession(page);
const errors = [], races = [], controls = [];
const fuelWaits = [];
// Opt-in long-session observation, not an extended race/startup threshold.
// The shipping rule visibly regenerates one unit per real minute. Waiting in
// the lobby is normal play; changing fuel, Date or browser clocks is not.
async function waitForReady() {
  if (process.env.RACE_QA_WAIT_FUEL === '1') {
    await page.waitForFunction(() => document.querySelector('#race-fuel-box')?.classList.contains('empty') ||
      document.querySelector('#race-start')?.disabled === false, null, { timeout: 45000 });
    if (await page.locator('#race-fuel-box').evaluate(node => node.classList.contains('empty'))) {
      const started = Date.now(), before = await page.locator('#race-fuel-info').textContent();
      const number = fuelWaits.length + 1;
      await page.screenshot({ path: path.join(out, `fuel-wait-${number}.png`) });
      console.log(JSON.stringify({ status: 'WAITING_REAL_FUEL_REGENERATION', before }));
      await page.waitForFunction(() => !document.querySelector('#race-fuel-box').classList.contains('empty'), null,
        { timeout: 310000, polling: 1000 });
      const waited = { before, after: await page.locator('#race-fuel-info').textContent(), wallMs: Date.now() - started,
        clockModified: false, fuelInjected: false };
      fuelWaits.push(waited);
      await writeFile(path.join(out, 'fuel-waits.json'), JSON.stringify(fuelWaits, null, 2));
    }
  }
  await page.locator('#race-start:not([disabled])').waitFor({ timeout: 45000 });
}
let startIndex = 0;
page.on('pageerror', e => errors.push(e.message));
page.on('dialog', dialog => dialog.accept());
let touching = null, wheelBounds, actionBounds, wheelAngle = null;
let activeActionNames = [];
let contacts = [];
const useVisibleActions = ['visible', 'visible-exit'].includes(process.env.RACE_QA_ACTIONS);
const actionTiming = process.env.RACE_QA_ACTIONS === 'visible-exit' ? 'exit' : 'immediate';
const useDampedWheel = process.env.RACE_QA_WHEEL === 'analogue-damped';
const useAnalogueWheel = useDampedWheel || process.env.RACE_QA_WHEEL === 'analogue';
const visibleSteeringGain = Number(process.env.RACE_QA_STEER_GAIN ?? 3);
async function dispatchTouches(events) {
  for (const event of events) {
    await cdp.send('Input.dispatchTouchEvent', event);
    contacts = event.touchPoints;
  }
}
async function setActions(names) {
  const desired = [...contacts.filter(p => p.id === 1), ...actionTouchPoints(names, actionBounds)];
  await dispatchTouches(reconcileTouchContacts(contacts, desired));
  activeActionNames = names;
}
async function steer(direction) {
  if (direction === touching) return;
  const plan = planWheelGesture(direction, wheelBounds, actionTouchPoints(activeActionNames, actionBounds), wheelAngle);
  await dispatchTouches(plan.events);
  touching = direction;
  wheelAngle = plan.angle;
  controls.push({ at: Date.now(), direction });
}

async function observed(full = false) {
  return page.evaluate(full => {
    const g = window.game, p = g.player;
    return { phase: document.querySelector('#race-kit').dataset.phase, state: g.state, raceTime: g.raceTime,
      map: g.map.id, course: g.settings.course, laps: g.settings.laps, diff: g.settings.diff, mode: g.settings.mode,
      progress: p?.progress ?? 0, finished: !!p?.finished, finishTime: p?.finishTime ?? null,
      place: g.standings.indexOf(p) + 1, speed: p?.speedKmh ?? 0, lat: p?.lat ?? 0,
      spinSec: p?.spin ?? 0, wrongWaySec: p?.wrongWay ?? 0, forwardHeadingDot: p ? Math.cos(p.h - p.proj.hd) : null,
      firstFinish: g.firstFinish, racers: g.racers.map(r => ({ name: r.name, isPlayer: r.isPlayer, skill: r.skill ?? null,
        finished: !!r.finished, finishTime: r.finishTime, progress: r.progress,
        assetIdentity: r.model.userData.assetIdentity,
        wheelAngles: full ? r.model.userData.wheels.map(w => ({ front: w.front, spin: w.spin.rotation.x, steer: w.steer.rotation.y })) : undefined })),
      throttle: p?.throttle ?? null, stats: { ...p?.stats }, items: [...(p?.items ?? [])],
      render: { fpsEstimate: window.__RACE_EVIDENCE__.fpsEstimate,
        pixelRatio: g.renderer.getPixelRatio(), quality: g.settings.quality,
        touchSampleMs: window.__RACE_EVIDENCE__.touchToInputSampleMs },
      roadHint: document.querySelector('#race-road-hint')?.textContent ?? '',
      goal: document.querySelector('#race-compact-goal').textContent,
      feedback: document.querySelector('#msgs').textContent,
      events: full ? window.__RACE_EVIDENCE__.events : window.__RACE_EVIDENCE__.events.filter(e => ['driftEnd', 'smallBoost', 'nitro', 'crash', 'pad', 'item'].includes(e.type)).slice(-8),
      heading: document.querySelector('#race-heading').textContent,
      result: document.querySelector('#race-result-copy').textContent,
      resultCard: document.querySelector('#race-result-time')?.getClientRects().length ? {
        time:document.querySelector('#race-result-time').textContent,
        stars:document.querySelector('#race-result-stars small').textContent,
      } : null,
      resultStats: document.querySelector('#race-result-stats').textContent,
      saved: localStorage.getItem('h5-mobile:qq-speed:career:v1') };
  }, full);
}
function dailyStartSnapshot() {
  const wallMs = Date.now(), g = window.game;
  return { wallMs, monotonicMs: window.performance.now(), timeOrigin: window.performance.timeOrigin,
    timezoneOffsetMinutes: new Date(wallMs).getTimezoneOffset(), nativeState: g?.state,
    course: g?.settings?.course, map: g?.map?.id, laps: g?.settings?.laps,
    diff: g?.settings?.diff, mode: g?.settings?.mode };
}
try {
  await page.goto('http://127.0.0.1:' + server.address().port + '/');
  await waitForReady();
  await page.screenshot({ path: path.join(out, 'startup.png') });
  const limit = Number(process.env.RACE_QA_STAGES ?? 30);
  const count = limit + (limit === 30 ? 1 : 0);
  if (resumeReport) {
    const actualSaved = await page.evaluate(() => localStorage.getItem('h5-mobile:qq-speed:career:v1'));
    if (actualSaved !== resumeReport.races.at(-1).saved) throw Error('Browser did not restore the exact earned campaign');
    startIndex = Number(await page.locator('#race-stage').inputValue());
    races.push(...resumeReport.races.filter(r => !upgradeBuild && r.status === 'PASS' && Number(r.stage) <= startIndex).map(r => ({ ...r, inheritedEvidence: process.env.RACE_QA_RESUME_REPORT })));
    await writeFile(path.join(out, 'resume-provenance.json'), JSON.stringify({ buildHash: build.buildHash, report: process.env.RACE_QA_RESUME_REPORT, reportSha256: createHash('sha256').update(await readFile(process.env.RACE_QA_RESUME_REPORT)).digest('hex'), storage: process.env.RACE_QA_RESUME_STORAGE, storageSha256: createHash('sha256').update(await readFile(process.env.RACE_QA_RESUME_STORAGE)).digest('hex'), origin: resumeOrigin, startIndex, injectedProgress: false, profileJourney: upgradeBuild ? 'unmodified-previously-earned-profile-upgrade' : 'same-build-earned-resume', sourceBuildHash: resumeReport.buildHash, sourceErrorsPreserved: resumeReport.errors, earlierBuildWinsCountAsCurrent: false }, null, 2));
  }
  if (process.env.RACE_QA_REPLAY_STAGE) {
    const requested = Number(process.env.RACE_QA_REPLAY_STAGE) - 1;
    const option = page.locator('#race-stage option[value="' + requested + '"]');
    if (await option.isDisabled()) throw Error('Cannot replay an unearned stage');
    await page.locator('#race-stage').selectOption(String(requested));
    startIndex = requested;
  }
  for (let index = startIndex; index < count; index++) {
    const name = index === 30 ? 'daily' : String(index + 1).padStart(2, '0');
    if (index) {
      await page.locator('#race-stage').selectOption(index === 30 ? 'daily' : String(index));
      await waitForReady();
    }
    const entry = await page.locator('#race-stage option:checked').textContent();
    await page.bringToFront();
    const dailyStartBefore = name === 'daily' ? await page.evaluate(dailyStartSnapshot) : null;
    await page.locator('#race-start').tap(); // actual trusted UI touch, no stage manipulation
    try {
      // On Linux software WebGL, a native 3-second countdown can take >45s
      // wall clock even when the real native game started correctly.
      await page.waitForFunction(() => window.game.state === 'race', null,
        { timeout: ciHeadless ? 125000 : 45000 });
    } catch(error) {
      const snapshot=await page.evaluate(()=>{
        const g=window.game,root=document.querySelector('#race-kit');
        return {nativeState:g?.state,phase:root?.dataset.phase,
          nativeCountdown:g?.cdT,raceTime:g?.raceTime,
          note:document.querySelector('#race-note')?.textContent,
          map:g?.map?.id,settingsMap:g?.settings?.map,
          visible:document.visibilityState,focus:document.hasFocus(),
          pausedFrom:g?.pausedFrom,quality:g?.settings?.quality,
          startHidden:document.querySelector('#race-start')?.hidden,
          started:!!g?.player};
      });
      await writeFile(path.join(out,name+'-start-diagnostic.json'),
        JSON.stringify({snapshot,error:String(error)},null,2));
      await page.screenshot({path:path.join(out,name+'-start-timeout.png')});
      throw error;
    }
    const dailyStart = dailyStartBefore ? { before: dailyStartBefore, after: await page.evaluate(dailyStartSnapshot) } : null;
    const raceDay = dailyStart ? dailyRaceDayFromStart(dailyStart) : null;
    if (dailyStart) {
      await writeFile(path.join(out, 'daily-start-identity.json'), JSON.stringify({ dailyStart, raceDay }, null, 2));
      if (!raceDay) throw Error('Daily start identity is ambiguous or unverified');
    }
    wheelBounds = await page.locator('#race-joystick').boundingBox();
    actionBounds = await page.locator('[data-race-action]').evaluateAll(buttons => Object.fromEntries(buttons.map(button => {
      const rect = button.getBoundingClientRect();
      return [button.dataset.raceAction, { x: rect.x, y: rect.y, width: rect.width, height: rect.height }];
    })));
    const trace = [], captures = new Set(), actionPolicy = new VisibleActionPolicy(actionTiming), wheelPolicy = new VisibleWheelPolicy(visibleSteeringGain); let terminal = null, lastLog = 0;
    const diagnosticSeconds = Math.max(0,Number(process.env.RACE_QA_DIAGNOSTIC_RACE_SECS ?? 0));
    let diagnosticStop = false;
    const startedAt = Date.now(), deadline = startedAt + Math.max(30000, Math.min(600000, Number(process.env.RACE_QA_MAX_MS ?? 600000)));
    const visibleStageTag = await page.locator('#race-stage-tag').textContent();
    const isItemRace = visibleStageTag.includes('道具赛');
    const visibleLookahead = Number(process.env.RACE_QA_LOOKAHEAD ?? (isItemRace && entry.includes('雪地') ? 18 : 21));
    let lastBoxScan = 0, box = null; const visibleMemory = {}; let lastScene = 0, lastInventory = 0;
    console.log(JSON.stringify({ stage: index + 1, entry, status: 'DRIVING' }));
    while (Date.now() < deadline) {
      let policy = recoverVisibleHeading(await page.evaluate(minimapPolicy, visibleLookahead), visibleMemory, Date.now());
      const seekBox = isItemRace && needsVisibleItemPickup(await page.locator('#race-compact-goal').textContent());
      if (!seekBox) box = null;
      if (seekBox && Date.now() - lastBoxScan > 350) {
        lastBoxScan = Date.now();
        box = itemBoxPolicy(PNG.sync.read(await page.screenshot()));
      }
      policy = visibleItemSteer(policy, box);
      await steer(useDampedWheel ? wheelPolicy.frame(policy, Date.now()) : useAnalogueWheel ? visibleSteering(policy, visibleSteeringGain) : policy.direction);
      let actionHud = null;
      if (useVisibleActions) {
        actionHud = await page.evaluate(() => ({
          speedKmh: Number(document.querySelector('#race-speed-value').textContent),
          drifting: document.querySelector('#race-kit').classList.contains('drifting'),
          smallReady: document.querySelector('[data-race-action="small"]').classList.contains('ready'),
          nitroReady: document.querySelector('[data-race-action="nitro"]').classList.contains('ready'),
          itemReady: document.querySelector('[data-race-action="item"]').classList.contains('ready'),
        }));
        await setActions(actionPolicy.frame(policy, actionHud, Date.now()));
      }
      const o = await observed();
      const telemetry = { ...o }; delete telemetry.events; delete telemetry.saved;
      trace.push({ at: Date.now(), policy, touch: touching, actions: [...activeActionNames], actionHud, observed: telemetry });
      const capture = o.events.find(e => !captures.has(e.type) && ['driftEnd', 'smallBoost', 'nitro', 'crash', 'pad'].includes(e.type) && (e.type !== 'driftEnd' || e.clean));
      if (capture) { captures.add(capture.type); await page.screenshot({ path: path.join(out, `${name}-${capture.type}.png`) }); }
      const inventory = o.items.length;
      if (policy.reason === 'player-arrow-not-visible' && !captures.has('minimap-missing')) {
        captures.add('minimap-missing');
        const pixels = await page.locator('#mm').evaluate(c => c.toDataURL());
        await writeFile(path.join(out, name + '-minimap-missing.png'), Buffer.from(pixels.split(',')[1], 'base64'));
      }
      for (const [key, condition] of [['elimination', o.goal.includes('距离淘汰')], ['item-use', inventory < lastInventory && trace.slice(-4).some(frame => frame.actions.includes('item'))], ['pickup', inventory > lastInventory]]) {
        if (condition && !captures.has(key)) { captures.add(key); await page.waitForTimeout(180); await page.screenshot({ path: path.join(out, name + '-' + key + '.png') }); }
      }
      lastInventory = inventory;
      if (o.spinSec <= 0 && o.wrongWaySec > .2 && o.forwardHeadingDot < -.3 && !captures.has('wrong-way')) { captures.add('wrong-way'); await page.screenshot({ path: path.join(out, name + '-wrong-way.png') }); }
      if (captures.has('wrong-way') && o.spinSec <= 0 && o.wrongWaySec === 0 && o.forwardHeadingDot > .7 && !captures.has('recovered')) { captures.add('recovered'); await page.screenshot({ path: path.join(out, name + '-recovered.png') }); }
      if (name === '04' && o.raceTime >= lastScene + 5) { lastScene = Math.floor(o.raceTime / 5) * 5; await page.screenshot({ path: path.join(out, name + '-scene-' + lastScene + '.png') }); }
      if (o.raceTime - lastLog >= 20) { lastLog = o.raceTime; console.log(JSON.stringify({ stage: index + 1, time: +o.raceTime.toFixed(1), progress: Math.round(o.progress), place: o.place, goal: o.goal, crashes: o.stats.crash })); }
      if (o.phase === 'finished') { terminal = await observed(true); break; }
      if (diagnosticSeconds > 0 && o.raceTime >= diagnosticSeconds) {
        diagnosticStop = true;break; // Evidence-only: never spoof win/stars.
      }
      await page.waitForTimeout(40);
    }
    await setActions([]); await steer(null);
    await page.screenshot({ path: path.join(out,name+(terminal?'-terminal.png':'-diagnostic.png')) });
    const t = { ...(terminal ?? await observed()), stage: name, ...(dailyStart ? { raceDay, dailyStart } : {}) };
    const saved = JSON.parse(t.saved ?? '{}'), stars = name === 'daily' ? saved.daily?.stars ?? 0 : saved.stars?.[name] ?? 0;
    const terminalButtons = await page.evaluate(() => ['replay', 'next', 'lobby'].filter(id => !document.querySelector('#race-' + id).hidden).map(id => {
      const r = document.querySelector('#race-' + id).getBoundingClientRect();
      return { id, top: r.top, bottom: r.bottom, height: r.height };
    }));
    const race = { stage: name, entry, ...t, earnedStars: stars, wallDurationMs: Date.now() - startedAt,
      terminalButtons, actionsFit: terminalButtons.every(b => b.top >= 0 && b.bottom <= viewport.height && b.height >= 44),
      status: terminal ? (qualifiedVisibleFinish(t, stars) ? 'PASS' : 'BLOCKED') :
        diagnosticStop ? 'DIAGNOSTIC_ONLY' : 'BLOCKED', input: 'visible minimap + cyan cube pixels + visible wrong-way warning; trusted CDP touch only' + (useVisibleActions ? '; opt-in visible speed and resource-button action policy' : '; unchanged steering-only baseline'), forbiddenOperations: [] };
    races.push(race);
    await writeFile(path.join(out, name + '-trace.json'), JSON.stringify({ buildHash: build.buildHash, driverPolicy: race.input, inputTransport: 'CDP Input.dispatchTouchEvent', forbiddenOperations: [], controls: controls.splice(0), frames: trace, terminal: race }, null, 2));
    await writeFile(path.join(out, 'checkpoint.json'), JSON.stringify({ buildHash: build.buildHash, races, errors }, null, 2));
    await context.storageState({ path: path.join(out, 'natural-earned-storage.json') });
    console.log(JSON.stringify({ stage: name, status: race.status, finished: t.finished, time: t.finishTime, place: t.place, stars, result: t.result, resultStats: t.resultStats }));
    if (race.status !== 'PASS') {
      if (terminal && count === 1) {
        // Capture recovery from a real loss; campaign status stays BLOCKED.
        await page.locator('#race-replay').tap();
        await page.waitForFunction(() => window.game.state === 'race', null, { timeout: 45000 });
        await page.screenshot({ path: path.join(out, 'loss-replay.png') });
        await writeFile(path.join(out, 'loss-replay.json'), JSON.stringify(await observed(true), null, 2));
        await page.locator('#race-pause').tap();
      }
      break;
    }
    if (index === count - 1) {
      await page.locator('#race-replay').tap();
      await page.waitForFunction(() => window.game.state === 'race', null, { timeout: 45000 });
      await page.screenshot({ path: path.join(out, 'replay.png') });
      await writeFile(path.join(out, 'replay.json'), JSON.stringify(await observed(), null, 2));
      await page.locator('#race-pause').tap();
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForReady();
    const restored = await page.evaluate(() => localStorage.getItem('h5-mobile:qq-speed:career:v1'));
    if (restored !== t.saved) throw Error('earned campaign progress changed on reload');
  }
} catch (e) { errors.push(e.stack); }
finally {
  const Schema = z.object({ schemaVersion: z.literal(1), gameId: z.literal('qq-speed'), buildHash: z.string().length(64),
    viewport: z.object({ width: z.number(), height: z.number() }), naturalInputsOnly: z.literal(true), seededCampaign: z.literal(false),
    driverPolicy: z.string(), visibleInputParameters: z.object({ wheel: z.string(), steeringGain: z.number(), actionTiming: z.string(), lookaheadPixels: z.string() }), races: z.array(z.any()), errors: z.array(z.string()), passed: z.boolean(), checkedAt: z.string() });
  const report = Schema.parse({ schemaVersion: 1, gameId: 'qq-speed', buildHash: build.buildHash, viewport,
    naturalInputsOnly: true, seededCampaign: false,
    visibleInputParameters: { wheel: useDampedWheel ? 'analogue-damped' : useAnalogueWheel ? 'analogue' : 'full-turn', steeringGain: visibleSteeringGain, actionTiming,
      lookaheadPixels: process.env.RACE_QA_LOOKAHEAD ?? '21 (18 on snow item races)' },
    driverPolicy: 'visible minimap, cyan cube pixels and visible wrong-way warning; native state read only for assertions' + (useVisibleActions ? '; opt-in visible speed and resource-button action policy' : '; unchanged steering-only baseline') + (useAnalogueWheel ? '; opt-in analogue wheel from visible road angle, no native geometry/state decisions' : '; original full-turn wheel policy'),
    races, errors, passed: races.length === Number(process.env.RACE_QA_STAGES ?? 30) + (Number(process.env.RACE_QA_STAGES ?? 30) === 30 ? 1 : 0) && races.every(r => r.status === 'PASS' && r.actionsFit) && !errors.length, checkedAt: new Date().toISOString() });
  report.recordingTimebase = { beforePageMs: recordingBeforePageMs, afterPageMs: recordingAfterPageMs, uncertainty: 'Recorder starts during page creation; use visible clock and keep context around trimmed evidence' };
  report.fuelWaits = fuelWaits;
  report.profileJourney = upgradeBuild ? 'unmodified-previously-earned-profile-upgrade' : resumeReport ? 'same-build-earned-resume' : 'fresh';
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  const video = page.video(); await context.close(); if (video) await video.saveAs(path.join(out, 'natural-career.webm'));
  await browser.close(); server.close();
  console.log(JSON.stringify({ report: path.join(out, 'report.json'), sha256: createHash('sha256').update(JSON.stringify(report)).digest('hex'), passed: report.passed, races: races.length, errors }));
  if (!report.passed) process.exitCode = 1;
}
