/* global process, console, window, document, URL */
import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const out = path.join(ROOT, 'runs/h5-qq-mobile-20261013/evidence', process.env.RACE_CONTROLS_QA_LABEL ?? 'controls-final');await mkdir(out, { recursive: true });
const build = JSON.parse(await readFile(path.join(ROOT, 'runs/h5-qq-mobile-20261013/artifacts/build-racing.json')));
const browser = await chromium.launch({ headless: false, args: ['--use-angle=metal'] });
const cases = [], errors = [];
for (const [width, height] of [[844, 390], [852, 393], [740, 360]]) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage(), steps = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  const observe = () => { const g = window.game;return { phase: document.querySelector('#race-kit').dataset.phase, state: g.state, raceTime: g.raceTime, h: g.player.h, steer: g.player.steer, drifting: g.player.drifting, input: { ...g.input.touch }, stats: { ...g.player.stats }, held: [...document.querySelectorAll('[data-race-direction].held')].map(el => el.id), rotate: !document.querySelector('#race-rotate').hidden }; };
  const record = async action => { const observed = await page.evaluate(observe);steps.push({ action, observed });return observed; };
  const check = (name, passed) => checks.push({ name, passed });
  try {
    await page.goto(process.env.RACE_QA_URL ?? 'http://127.0.0.1:4334');await page.locator('#race-start:not([disabled])').waitFor({ timeout: 45000 });await page.locator('#race-start').tap();
    await page.waitForFunction(() => document.querySelector('#race-kit').dataset.phase === 'race', null, { timeout: 15000 });
    await page.evaluate(() => {
      window.racePointerObservations = [];
      for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click']) document.addEventListener(type, event => window.racePointerObservations.push({ type, id: event.pointerId, primary: event.isPrimary, target: event.target.closest('button')?.id, trusted: event.isTrusted }), true);
    });
    const cdp = await context.newCDPSession(page);
    const points = await page.evaluate(() => Object.fromEntries(['left', 'right', 'pause'].map(name => { const r = document.querySelector('#race-' + name).getBoundingClientRect();return [name, { x: r.x + r.width / 2, y: r.y + r.height / 2 }]; })));
    const point = (name, id) => ({ ...points[name], id, radiusX: 7, radiusY: 7, force: 1 });
    const touch = (type, names) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: names.map(([name, id]) => point(name, id)) });
    const before = await record('start default race');
    await page.locator('#race-left').tap();
    await page.waitForFunction(() => !window.game.input.touch.left && !window.game.input.touch.right && window.game.player.steer > .005, null, { timeout: 2000 });
    let o = await record('single short left tap and release');check('short-tap-turns-without-drift', Math.abs(o.h - before.h) > .005 && !o.drifting && !o.input.left && !o.input.right);
    await touch('touchStart', [['left', 1]]);await page.waitForTimeout(90);
    o = await record('hold left with one finger');check('single-finger-hold', o.input.left && !o.input.right);
    await touch('touchStart', [['left', 1], ['right', 2]]);await page.waitForTimeout(150);
    o = await record('hold both directions with two fingers');check('dual-finger-neutral', o.input.left && o.input.right && Math.abs(o.steer) < .25 && !o.drifting);
    await page.screenshot({ path: `${out}/dual-${width}x${height}.png` });
    // Verify the ended pointer's DOM target: this Chromium transport ends the supplied id.
    await touch('touchEnd', [['left', 1]]);await page.waitForTimeout(100);
    o = await record('release only left finger');check('independent-finger-release', !o.input.left && o.input.right);
    await touch('touchEnd', []);await page.waitForTimeout(100);
    for (let i = 0; i < 10; i++) { await touch('touchStart', [[i % 2 ? 'right' : 'left', 1]]);await page.waitForTimeout(50);await touch('touchEnd', []); }
    await page.waitForTimeout(160);o = await record('10 rapid alternations then release');check('rapid-alternations-no-stuck-or-drift', !o.input.left && !o.input.right && !o.drifting);
    await touch('touchStart', [['right', 1]]);await page.waitForTimeout(100);
    await touch('touchStart', [['right', 1], ['pause', 2]]);await touch('touchEnd', [['pause', 2]]);await page.waitForTimeout(80);
    const paused = await record('second finger taps pause while right remains held');check('pause-clears-held-input', paused.state === 'paused' && !paused.input.left && !paused.input.right && !paused.held.length);
    await page.screenshot({ path: `${out}/paused-${width}x${height}.png` });
    await page.waitForTimeout(250);o = await record('wait while paused');check('pause-freezes-race', o.raceTime === paused.raceTime);
    await touch('touchEnd', []);
    if (paused.state !== 'paused') { await page.locator('#race-pause').tap();await record('recover failed pause with a separate primary-finger tap; original failure retained'); }
    await page.locator('#race-resume').tap();await page.waitForTimeout(80);
    o = await record('tap resume');check('resume-no-sticky-direction', o.state === 'race' && !o.input.left && !o.input.right);
    await touch('touchStart', [['left', 1]]);await page.waitForTimeout(100);await page.setViewportSize({ width: 390, height: 844 });await page.waitForTimeout(100);
    o = await record('rotate to portrait while holding left');check('portrait-pauses-and-clears', o.state === 'paused' && o.rotate && !o.input.left && !o.input.right);
    await page.screenshot({ path: `${out}/portrait-from-${width}x${height}.png` });await touch('touchEnd', []);
    await page.setViewportSize({ width, height });await page.waitForTimeout(100);
    o = await record('return to landscape');check('landscape-requires-manual-resume', o.state === 'paused' && !o.rotate);
    await page.locator('#race-resume').tap();await page.waitForTimeout(80);o = await record('tap resume after rotation');check('rotation-resume-no-sticky-direction', o.state === 'race' && !o.input.left && !o.input.right);
    await page.screenshot({ path: `${out}/resumed-${width}x${height}.png` });
  } catch (error) { errors.push(`${width}x${height}: ${error.stack}`); }
  const pointerEvents = await page.evaluate(() => window.racePointerObservations ?? []).catch(() => []);
  cases.push({ viewport: { width, height }, checks, steps, pointerEvents });await context.close();
}
await browser.close();
const report = { buildHash: build.buildHash, inputTransport: 'normal touchscreen.tap and CDP Input.dispatchTouchEvent', forbiddenOperations: [], cases, errors, passed: cases.length === 3 && cases.every(c => c.checks.length === 11 && c.checks.every(check => check.passed)) && !errors.length, checkedAt: new Date().toISOString() };
await writeFile(out + '/report.json', JSON.stringify(report, null, 2));console.log(JSON.stringify({ ...report, cases: cases.map(c => ({ viewport: c.viewport, checks: c.checks })) }));if (!report.passed) process.exitCode = 1;
