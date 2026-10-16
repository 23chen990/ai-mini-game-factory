/* global process, console, document, window, URL */
// The driving policy observes only pixels of the player-visible minimap.
// Native state is read separately for assertions; it never selects steering.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const label = process.env.RACE_QA_LABEL ?? 'natural-race';
const out = path.join(ROOT, 'runs/h5-qq-mobile-20261013/evidence', label);
const viewport = { width: Number(process.env.RACE_QA_WIDTH ?? 844), height: Number(process.env.RACE_QA_HEIGHT ?? 390) };
await mkdir(out, { recursive: true });
const build = JSON.parse(await readFile(path.join(ROOT, 'runs/h5-qq-mobile-20261013/artifacts/build-racing.json')));
const browser = await chromium.launch({ headless: false, args: ['--use-angle=metal'] });
const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2, recordVideo: { dir: out, size: viewport } });
await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
const page = await context.newPage(), errors = [], trace = [], captured = new Set();
page.on('pageerror', error => errors.push(error.message));
const cdp = await context.newCDPSession(page);
let touching = null;
let wheel;
async function steer(direction) {
  // The thumb remains captured on ONE wheel. Changing its x coordinate is a
  // real analogue touchMove, not a second independent left/right key press.
  if (direction === touching) return;
  if (!direction) {
    if (touching) await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    touching = null;
    return;
  }
  const x=wheel.x+wheel.width*(direction==='left'?.18:.82);
  const contact={x,y:wheel.y+wheel.height*.5,id:1,radiusX:7,radiusY:7,force:1};
  await cdp.send('Input.dispatchTouchEvent',{
    type:touching?'touchMove':'touchStart',touchPoints:[contact]
  });
  touching=direction;
}
function minimapPolicy() {
  const c = document.querySelector('#mm');
  const W = c.width, H = c.height, rgba = c.getContext('2d').getImageData(0, 0, W, H).data;
  const yellow = new Uint8Array(W * H), seen = new Uint8Array(W * H), components = [];
  for (let i = 0; i < yellow.length; i++) yellow[i] = rgba[i * 4] > 235 && rgba[i * 4 + 1] > 175 && rgba[i * 4 + 1] < 235 && rgba[i * 4 + 2] < 95 ? 1 : 0;
  for (let i = 0; i < yellow.length; i++) {
    if (!yellow[i] || seen[i]) continue;
    const queue = [i], points = [];seen[i] = 1;
    for (let j = 0; j < queue.length; j++) {
      const p = queue[j], x = p % W, y = Math.floor(p / W);points.push({ x, y });
      for (const n of [p - W, p + W, x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1]) if (n >= 0 && n < yellow.length && yellow[n] && !seen[n]) { seen[n] = 1;queue.push(n); }
    }
    if (points.length > 70) components.push(points);
  }
  const arrows = components.filter(points => Math.max(Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)), Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y))) > 15);
  const points = arrows.sort((a, b) => b.length - a.length)[0];
  if (!points) return { direction: null, reason: 'player-arrow-not-visible', components: components.map(p => p.length) };
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length, cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  const xx = points.reduce((s, p) => s + (p.x - cx) ** 2, 0), yy = points.reduce((s, p) => s + (p.y - cy) ** 2, 0), xy = points.reduce((s, p) => s + (p.x - cx) * (p.y - cy), 0);
  const axis = .5 * Math.atan2(2 * xy, xx - yy);
  let hx = Math.cos(axis), hy = Math.sin(axis);
  const skew = points.reduce((s, p) => s + ((p.x - cx) * hx + (p.y - cy) * hy) ** 3, 0);
  if (skew < 0) { hx *= -1;hy *= -1; }
  const targets = [], radius = Number(document.documentElement.dataset.qaLookahead ?? 21);
  for (let y = Math.max(0, Math.floor(cy - radius - 2)); y < Math.min(H, cy + radius + 2); y++) for (let x = Math.max(0, Math.floor(cx - radius - 2)); x < Math.min(W, cx + radius + 2); x++) {
    const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy), i = (y * W + x) * 4;
    const white = rgba[i] > 205 && rgba[i + 1] > 205 && rgba[i + 2] > 205;
    const bridge = rgba[i] < 110 && rgba[i + 1] > 145 && rgba[i + 2] > 190;
    if (Math.abs(r - radius) < 1.5 && (hx * dx + hy * dy) / r > .35 && (white || bridge)) targets.push({ x: dx, y: dy });
  }
  if (!targets.length) return { direction: null, reason: 'ahead-road-not-visible', position: [cx, cy], heading: [hx, hy] };
  const tx = targets.reduce((s, p) => s + p.x, 0) / targets.length, ty = targets.reduce((s, p) => s + p.y, 0) / targets.length;
  const angle = Math.atan2(hx * ty - hy * tx, hx * tx + hy * ty);
  return { direction: angle > .10 ? 'left' : angle < -.10 ? 'right' : null, angle, position: [cx, cy], heading: [hx, hy], target: [tx, ty], roadPixels: targets.length };
}
let terminal, replay, next, gpu, lifecycle, metrics;
try {
  await page.goto(process.env.RACE_QA_URL ?? 'http://127.0.0.1:4334');
  await page.locator('#race-start:not([disabled])').waitFor({ timeout: 45000 });
  if (process.env.RACE_QA_MAP) { await page.locator('#race-map').selectOption(process.env.RACE_QA_MAP);await page.locator('#race-start:not([disabled])').waitFor(); }
  await page.screenshot({ path: out + '/entry.png' });
  await page.locator('#race-start').tap();
  await page.waitForFunction(() => document.querySelector('#race-kit').dataset.phase === 'race', null, { timeout: 45000 });
  wheel=await page.locator('#race-joystick').boundingBox();
  if(!wheel||wheel.width<100||await page.locator('#race-control-mode').count())
    throw Error('Only analogue wheel control is allowed for touch gameplay QA');
  gpu = await page.evaluate(() => { const gl = document.querySelector('canvas').getContext('webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info');return { vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) }; });
  const deadline = Date.now() + Number(process.env.RACE_QA_SECONDS ?? 240) * 1000;
  const metricPromise = page.evaluate(() => new Promise(resolve => { const samples = [];let previous;const sample = now => { if (previous !== undefined) samples.push(now - previous);previous = now;if (samples.length < 240) window.requestAnimationFrame(sample);else { const sorted = [...samples].sort((a, b) => a - b);resolve({ frames: samples.length, medianFrameMs: sorted[Math.floor(sorted.length / 2)], p95FrameMs: sorted[Math.floor(sorted.length * .95)], meanFps: 1000 / (samples.reduce((a, b) => a + b, 0) / samples.length) }); } };window.requestAnimationFrame(sample); }));
  let previousLog = 0;
  while (Date.now() < deadline) {
    const policy = await page.evaluate(minimapPolicy);
    await steer(policy.direction);
    const observed = await page.evaluate(() => { const g = window.game, p = g.player;return { phase: document.querySelector('#race-kit').dataset.phase, raceTime: g.raceTime, finished: p.finished ?? false, finishTime: p.finishTime ?? null, place: g.standings.indexOf(p) + 1, progress: p.progress, lapsDone: p.lapsDone, owed: p.owed, speed: p.s, h: p.h, lat: p.lat, drifting: p.drifting, stats: { ...p.stats }, gauge: p.gauge, nitroCount: p.nitroCount, nitroTime: p.nitroTime, events: window.__RACE_EVIDENCE__.events, quality: g.settings.quality, visibleFeedback: document.querySelector('#msgs').textContent, steeringAxis: window.__RACE_EVIDENCE__.steerAxis }; });
    trace.push({ wallTime: new Date().toISOString(), policy, touch: touching, observed });
    for (const event of observed.events) if (['driftStart', 'smallBoost', 'nitro', 'gaugeFull', 'crash'].includes(event.type)) {
      const key = event.type === 'smallBoost' ? 'smallBoost-' + (event.perfect ? 'perfect' : 'normal') : event.type;
      if (!captured.has(key)) { captured.add(key);await page.screenshot({ path: out + '/' + key + '.png' }); }
    }
    if (observed.raceTime - previousLog >= 10) { previousLog = observed.raceTime;console.log(JSON.stringify({ time: observed.raceTime.toFixed(1), progress: observed.progress, speed: observed.speed.toFixed(1), lat: observed.lat.toFixed(1), policy, stats: observed.stats }));await writeFile(out + '/checkpoint.json', JSON.stringify(trace.slice(-10)));await page.screenshot({ path: out + '/race-' + Math.floor(observed.raceTime) + '.png', timeout: 5000 }).catch(error => errors.push('optional-checkpoint: ' + error.message)); }
    if (observed.phase === 'finished') { terminal = observed;break; }
    await page.waitForTimeout(80);
  }
  await steer(null);
  await page.screenshot({ path: out + '/terminal.png' });
  metrics = await metricPromise;
  if (terminal) {
    const after = process.env.RACE_QA_AFTER === 'next' ? 'next' : 'replay';
    await page.locator('#race-' + after).tap();await page.waitForFunction(() => document.querySelector('#race-kit').dataset.phase === 'race', null, { timeout: 15000 });
    const observed = await page.evaluate(() => ({ phase: document.querySelector('#race-kit').dataset.phase, map: window.game.settings.map, raceTime: window.game.raceTime, playerFinished: !!window.game.player.finished, laps: window.game.player.lapsDone, stats: { ...window.game.player.stats } }));
    if (after === 'replay') replay = observed;else next = observed;
    await page.screenshot({ path: out + '/' + after + '.png' });
    // A real tab switch, not a synthetic blur event or game-state injection.
    await steer('right');await page.waitForTimeout(100);
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
    const other = await context.newPage(), otherCdp = await context.newCDPSession(other);await otherCdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });await other.goto('about:blank');await other.bringToFront();await page.waitForTimeout(300);
    const observeBackground = () => ({ focused: document.hasFocus(), visibility: document.visibilityState, phase: document.querySelector('#race-kit').dataset.phase, input: { ...window.game.input.touch }, state: window.game.state });
    let blurred = await page.evaluate(observeBackground), minimizedWindow;
    if (blurred.visibility !== 'hidden') {
      ({ windowId: minimizedWindow } = await cdp.send('Browser.getWindowForTarget'));
      await cdp.send('Browser.setWindowBounds', { windowId: minimizedWindow, bounds: { windowState: 'minimized' } });await page.waitForTimeout(300);
      blurred = await page.evaluate(observeBackground);
    }
    await writeFile(out + '/background-state.json', JSON.stringify(blurred, null, 2));
    if (minimizedWindow) await cdp.send('Browser.setWindowBounds', { windowId: minimizedWindow, bounds: { windowState: 'normal' } });
    await page.bringToFront();await steer(null);await other.close();await page.screenshot({ path: out + '/real-background-pause.png' });
    if (blurred.state === 'paused') await page.locator('#race-resume').tap({ timeout: 5000 });
    const resumed = await page.evaluate(() => ({ phase: document.querySelector('#race-kit').dataset.phase, input: { ...window.game.input.touch } }));
    lifecycle = { blurred, resumed, passed: !blurred.focused && blurred.visibility === 'hidden' && blurred.state === 'paused' && !blurred.input.left && !blurred.input.right && resumed.phase === 'race' && !resumed.input.left && !resumed.input.right };
  }
} catch (error) { errors.push(error.stack); }
finally {
  await writeFile(out + '/natural-input-trace.json', JSON.stringify({ buildHash: build.buildHash, driverPolicy: 'player-visible minimap pixels only; native state read for assertions only', inputTransport: 'CDP Input.dispatchTouchEvent', forbiddenOperations: [], frames: trace }, null, 2));
  const video = page.video();await context.tracing.stop({ path: out + '/playwright-trace.zip' });await context.close();
  if (video) await video.saveAs(out + '/natural-race.webm');
  await browser.close();
}
const coreJourneyPassed = !!terminal?.finished && !!terminal.finishTime && (replay ?? next)?.phase === 'race' && !(replay ?? next)?.playerFinished && !errors.length;
const result = { buildHash: build.buildHash, viewport, gpu, metrics, performanceScope: 'Desktop Apple M1 Pro browser only; physical phone performance unverified', normalTouchInput: true, forbiddenOperations: [], terminal, replay, next, lifecycle, captured: [...captured], errors, coreJourneyPassed, gates: { coreJourney: coreJourneyPassed ? 'PASS' : 'FAIL', realBackground: lifecycle?.passed ? 'PASS' : 'BLOCKED' }, passed: coreJourneyPassed && !!lifecycle?.passed, checkedAt: new Date().toISOString() };
await writeFile(out + '/report.json', JSON.stringify(result, null, 2));console.log(JSON.stringify({ ...result, terminal: terminal ? { ...terminal, events: terminal.events.length } : undefined }));if (!result.passed) process.exitCode = 1;
