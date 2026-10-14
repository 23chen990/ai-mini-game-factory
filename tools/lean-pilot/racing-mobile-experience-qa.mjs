/* global process, console, window, document, localStorage, requestAnimationFrame, URL */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { earnedResumeOrigin } from './racing-visible-policy.mjs';

// Headed browser experience checks; no physical-phone, LIVE-ad or race-victory claim.
const run = path.resolve('runs/h5-qq-mobile-20261013'), root = path.join(run, 'workspace/game');
const build = JSON.parse(await readFile(path.join(run, 'artifacts/build-racing.json')));
const out = path.join(run, 'evidence/browser-experience-attempt' + build.attempt);
await mkdir(out, { recursive: true });
const sourceReport = process.env.RACE_QA_REPORT ?? path.join(run, 'evidence/final-attempt12/report.json');
const sourceStorage = process.env.RACE_QA_STORAGE ?? path.join(run, 'evidence/final-attempt12/natural-earned-storage.json');
const report = JSON.parse(await readFile(sourceReport)), storage = JSON.parse(await readFile(sourceStorage));
const origin = earnedResumeOrigin(report, storage, build.buildHash);
const checks = [], errors = [];
const server = createServer(async (req, res) => {
  try {
    const name = new URL(req.url, origin).pathname, file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(root + path.sep)) throw Error('path');
    res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : 'text/html');
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('missing'); }
});
server.listen(Number(new URL(origin).port), '127.0.0.1'); await once(server, 'listening');
const browser = await chromium.launch({ headless: false, args: ['--use-angle=metal'] });
const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, storageState: storage });
const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
const cdp = await context.newCDPSession(page);
const check = (id, observation, status = 'PASS') => checks.push({ id, status, observation });
const point = async id => page.locator('#race-' + id).evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
const pressed = () => page.evaluate(() => ['left', 'right'].map(id => document.querySelector('#race-' + id).getAttribute('aria-pressed')));
const paused = () => page.waitForFunction(() => window.game.state === 'paused');
async function resume() { await page.bringToFront(); await page.locator('#race-resume').tap(); await page.waitForFunction(() => window.game.state === 'race'); }
try {
  await page.goto(origin + '/'); await page.locator('#race-start:not([disabled])').waitFor({ timeout: 45000 });
  assert.equal(await page.evaluate(() => localStorage.getItem('h5-mobile:qq-speed:career:v1')), report.races.at(-1).saved);
  const fuel = await page.locator('#race-fuel-info').textContent();
  assert.match(fuel, /不限油/); check('pending-free-play', fuel);
  await page.locator('#race-stage').selectOption('0');
  await page.locator('#race-start:not([disabled])').waitFor({ timeout: 45000 });
  await page.locator('#race-start').tap(); await page.waitForFunction(() => window.game.state === 'race', null, { timeout: 45000 });
  const left = { ...await point('left'), id: 1 }, right = { ...await point('right'), id: 2 };
  await touch('touchStart', [left]); await page.waitForTimeout(1100); assert.deepEqual(await pressed(), ['true', 'false']);
  await touch('touchEnd', []); await page.waitForTimeout(120); assert.deepEqual(await pressed(), ['false', 'false']);
  await touch('touchStart', [right]); await page.waitForTimeout(1100); assert.deepEqual(await pressed(), ['false', 'true']);
  await touch('touchEnd', []); check('long-hold-left-right', 'Trusted touch holds1100ms each, then complete release observed.');
  for (let i = 0; i < 4; i++) { await touch('touchStart', [i % 2 ? right : left]); await page.waitForTimeout(110); await touch('touchEnd', []); }
  await touch('touchStart', [left]); await touch('touchStart', [left, right]); await page.waitForTimeout(180);
  assert.deepEqual(await pressed(), ['true', 'true']); await touch('touchEnd', [right]); await page.waitForTimeout(120);
  assert.deepEqual(await pressed(), ['false', 'true']); await touch('touchEnd', []);
  check('rapid-alternation-and-two-finger', 'Four alternating110ms presses; simultaneous left/right and independent finger release observed.');
  await touch('touchStart', [left]); await touch('touchStart', [left, { ...await point('pause'), id: 3 }]); await paused();
  assert.deepEqual(await pressed(), ['false', 'false']); await touch('touchEnd', []);
  check('second-finger-pause-clears-input', 'A second finger paused while left remained held; both visual held states cleared.');
  await page.screenshot({ path: path.join(out, 'pause-844x390.png') });
  await page.locator('#race-sound').tap();
  assert.equal(await page.locator('#race-sound').getAttribute('aria-pressed'), 'false');
  const audio = await page.evaluate(() => ({ enabled: window.game.audio.enabled, gain: window.game.audio.master.gain.value, preference: localStorage.getItem('h5-qq-mobile-20261013:audio-enabled:v1') }));
  assert.equal(audio.gain, 0); assert.equal(audio.preference, '0'); check('native-mixer-mute', JSON.stringify(audio));
  await resume();
  await page.setViewportSize({ width: 390, height: 844 }); await paused();
  assert.equal(await page.locator('#race-rotate').isVisible(), true);
  await page.screenshot({ path: path.join(out, 'portrait-pause.png') });
  await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.game.state), 'paused'); check('rotation-explicit-resume', 'Portrait resize pauses and shows rotation icon; landscape remains paused until normal Resume tap.');
  await resume(); await touch('touchStart', [left]);
  const beforeBackground = await page.evaluate(() => window.game.raceTime);
  const secondTab = await context.newPage(); await secondTab.goto('about:blank'); await secondTab.bringToFront(); await page.waitForTimeout(1800);
  const background = await page.evaluate(() => ({ hidden: document.hidden, focus: document.hasFocus(), state: window.game.state, raceTime: window.game.raceTime, pressed: ['left', 'right'].map(id => document.querySelector('#race-' + id).getAttribute('aria-pressed')) }));
  const delivered = background.hidden || !background.focus;
  if (delivered) { assert.equal(background.state, 'paused'); assert.deepEqual(background.pressed, ['false', 'false']); assert.ok(background.raceTime - beforeBackground < .5); }
  check('actual-browser-tab-background', JSON.stringify(background), delivered ? 'PASS' : 'BLOCKED');
  await page.bringToFront(); await secondTab.close(); await touch('touchEnd', []);
  if (background.state !== 'paused') await page.locator('#race-pause').tap();
  await resume();
  for (const quality of ['low', 'mid']) {
    await page.locator('#race-pause').tap(); await paused(); await page.locator('#race-quality').selectOption(quality); await resume();
    const frames = await page.evaluate(() => new Promise(resolve => { const deltas = []; let previous = null, start = null; const frame = now => { start ??= now; if (previous !== null) deltas.push(now - previous); previous = now; if (now - start >= 5000) resolve(deltas); else requestAnimationFrame(frame); }; requestAnimationFrame(frame); }));
    frames.sort((a, b) => a - b); const median = frames[Math.floor(frames.length / 2)], p95 = frames[Math.floor(frames.length * .95)];
    check('mac-metal-' + quality + '-render-sample', JSON.stringify({ samples: frames.length, medianMs: median, p95Ms: p95, medianFps: 1000 / median, scope: 'Mac headed Chromium, not phone performance' }));
  }
  await page.locator('#race-pause').tap(); await paused(); await page.locator('#race-quality').selectOption('low');
  await page.reload(); await page.locator('#race-start:not([disabled])').waitFor({ timeout: 45000 });
  const preferences = await page.evaluate(() => ({ quality: window.game.settings.quality, muted: !window.game.audio.enabled, storedMute: localStorage.getItem('h5-qq-mobile-20261013:audio-enabled:v1') }));
  assert.equal(preferences.quality, 'low'); assert.equal(preferences.storedMute, '0'); check('mute-and-quality-reload', JSON.stringify(preferences));
  check('physical-android-iphone', 'No physical phone attached. Browser touch, viewport and Mac FPS cannot establish phone feel, call interruption, sound audibility or cutout fit.', 'BLOCKED');
} catch (error) { errors.push(error.stack); }
finally {
  await writeFile(path.join(out, 'report.json'), JSON.stringify({ schemaVersion: 1, gameId: 'qq-speed', buildHash: build.buildHash, sourceReport, sourceStorage, syntheticCampaign: false, input: 'trusted CDP touches, normal UI, real browser tab focus and viewport resize', physicalDevice: false, liveAds: false, checks, errors, checkedAt: new Date().toISOString() }, null, 2));
  await context.close(); await browser.close(); server.close();
  console.log(JSON.stringify({ checks, errors })); if (errors.length) process.exitCode = 1;
}
