/* global process, console, window, document, innerWidth, innerHeight, setTimeout */
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { URL } from 'node:url';
import path from 'node:path';
import { actionTouchPoints, planWheelGesture } from '../../../tools/lean-pilot/racing-wheel-qa-input.mjs';
import { reconcileTouchContacts } from '../../../tools/lean-pilot/racing-visible-actions.mjs';

const run = path.resolve('runs/h5-qq-mobile-20261013'), game = run + '/workspace/game';
const build = JSON.parse(await readFile(run + '/artifacts/build-racing.json'));
const out = run + '/artifacts/internal-experience-20261020/touch-' + build.buildHash.slice(0, 12) + (process.env.RACE_TOUCH_LABEL ?? '');
await mkdir(out); // Each capture owns a fresh directory; never overwrite prior QA.
const files = new Map();
for (const file of await readdir(game, { withFileTypes: true }))
  if (file.isFile()) files.set('/' + file.name, await readFile(game + '/' + file.name));
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const name = pathname === '/' ? '/index.html' : pathname;
  if (!files.has(name)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', name.endsWith('.css') ? 'text/css' : name.endsWith('.json') ? 'application/json' : name.endsWith('.mjs') ? 'application/javascript' : 'text/html');
  res.end(files.get(name));
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const browser = await chromium.launch({ channel: 'chromium', headless: false, args: ['--use-angle=metal'] });
const report = { buildHash: build.buildHash, inputHash: build.inputHash, browser: browser.version(),
  physicalPhone: false, input: 'Trusted CDP touch and real Chromium window focus loss/restore with forced-focus emulation disabled; no synthetic DOM lifecycle events',
  rows: [], errors: [], passed: false };
try {
  for (const [width, height] of [[844, 390], [667, 375]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true,
      deviceScaleFactor: 1, recordVideo: { dir: out, size: { width, height } } });
    const page = await context.newPage(), cdp = await context.newCDPSession(page);
    page.on('pageerror', error => report.errors.push(error.message));
    const observe = () => page.evaluate(() => ({
      phase: window.__RACE_EVIDENCE__.phase, nativeState: window.game.state,
      axis: window.__RACE_EVIDENCE__.steerAxis, steer: window.game.player.steer,
      drifting: window.game.player.drifting, stats: window.game.player.stats,
      speed: window.game.player.speedKmh, viewport: [innerWidth, innerHeight],
      pixelRatio: window.game.renderer.getPixelRatio(),
    }));
    const shot = async name => { const file = `${width}-${name}.png`; await page.screenshot({ path: out + '/' + file }); return file; };
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.locator('#race-start:not([disabled])').waitFor({ timeout: 45000 });
    await page.locator('#race-start').tap();
    await page.waitForFunction(() => window.game.state === 'race', null, { timeout: 45000 });
    await page.waitForTimeout(3000);
    const wheel = await page.locator('#race-joystick').boundingBox();
    const bounds = await page.locator('[data-race-action]').evaluateAll(nodes => Object.fromEntries(nodes.map(node => [node.dataset.raceAction, node.getBoundingClientRect().toJSON()])));
    let contacts = [], angle = null, actions = [];
    const dispatch = async events => { for (const event of events) { await cdp.send('Input.dispatchTouchEvent', event); contacts = event.touchPoints; } };
    const setActions = async names => {
      await dispatch(reconcileTouchContacts(contacts, [...contacts.filter(p => p.id === 1), ...actionTouchPoints(names, bounds)]));
      actions = names;
    };
    const turn = async direction => {
      const plan = planWheelGesture(direction, wheel, actionTouchPoints(actions, bounds), angle);
      await dispatch(plan.events); angle = plan.angle;
    };
    await turn('left'); await setActions(['drift']); await page.waitForTimeout(300);
    const left = await observe(); assert.equal(left.drifting, true); assert.ok(left.axis > .5);
    report.rows.push({ width, case: 'held-left-drift', ...left, screenshot: await shot('left-drift') });
    await turn('right'); await page.waitForTimeout(120);
    const right = await observe(); assert.ok(right.axis < -.5); assert.ok(right.steer < 0);
    report.rows.push({ width, case: 'emergency-countersteer', ...right, screenshot: await shot('countersteer') });
    await setActions([]); await turn(null);
    await page.waitForFunction(() => !window.game.player.drifting, null, { timeout: 2000 });
    await page.waitForTimeout(100);
    const released = await observe(); assert.equal(released.axis, 0); assert.equal(released.drifting, false);
    report.rows.push({ width, case: 'release-centers-and-ends-drift', ...released, screenshot: await shot('released') });
    const targets = await page.locator('[data-race-action]').evaluateAll(nodes => nodes.filter(n => n.getClientRects().length).map(n => ({
      action: n.dataset.raceAction, label: n.getAttribute('aria-label'), ...n.getBoundingClientRect().toJSON(),
    })));
    for (const button of targets) {
      assert.ok(button.width >= 44 && button.height >= 44 && button.x >= 0 && button.y >= 0 && button.right <= width && button.bottom <= height);
      for (const other of targets) if (button.action !== other.action)
        assert.ok(button.right <= other.x || other.right <= button.x || button.bottom <= other.y || other.bottom <= button.y);
    }
    report.rows.push({ width, case: 'separate-visible-action-targets', targets });
    await turn('left'); await setActions(['drift']);
    await page.locator('#race-pause').tap(); await dispatch([{ type: 'touchEnd', touchPoints: [] }]); actions = []; angle = null;
    assert.equal((await observe()).axis, 0); assert.equal((await observe()).phase, 'paused');
    await page.locator('#race-resume').tap();
    await page.evaluate(() => {
      window.__LIFECYCLE_OBSERVATION__ = [];
      for (const type of ['visibilitychange', 'blur', 'focus']) window.addEventListener(type, () => {
        window.__LIFECYCLE_OBSERVATION__.push({ type, hidden: document.hidden, focused: document.hasFocus() });
      }, true);
    });
    await turn('left'); await setActions(['drift']);
    // Playwright forces focus by default. Restore browser focus behavior before
    // an actual window switch; do not dispatch synthetic lifecycle events.
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
    await page.bringToFront();
    await page.waitForFunction(() => document.hasFocus());
    const backgroundPage = await context.newPage();
    await backgroundPage.bringToFront();
    await new Promise(resolve => setTimeout(resolve, 800));
    const background = await page.evaluate(() => ({ hidden: document.hidden, events: window.__LIFECYCLE_OBSERVATION__ }));
    await backgroundPage.close(); await page.bringToFront();
    await page.waitForFunction(() => document.hasFocus());
    await dispatch([{ type: 'touchEnd', touchPoints: [] }]); actions = []; angle = null;
    const resumed = await observe();
    const emitted = background.events.some(e => e.hidden || (e.type === 'blur' && e.focused === false));
    report.rows.push({ width, case: 'actual-browser-window-background', status: emitted ? 'PASS' : 'NOT_OBSERVED',
      background, foreground: resumed, screenshot: await shot('foreground') });
    assert.equal(emitted, true, 'Browser must emit a real focus/visibility event; absence is not a pass');
    assert.equal(resumed.phase, 'paused'); assert.equal(resumed.axis, 0); await page.locator('#race-resume').tap();
    const afterResume = await observe();
    report.rows.push({ width, case: 'foreground-resume-click', ...afterResume,
      browser: await page.evaluate(() => ({ focused: document.hasFocus(), hidden: document.hidden, events: window.__LIFECYCLE_OBSERVATION__ })) });
    assert.equal(afterResume.phase, 'race', 'Foreground resume must start native simulation before measuring drift release');
    await page.waitForFunction(() => !window.game.player.drifting, null, { timeout: 2000 });
    report.rows.push({ width, case: 'background-resume-drift-released', ...await observe(),
      screenshot: await shot('background-drift-released') });
    await page.setViewportSize({ width: height, height: width }); await page.waitForTimeout(150);
    assert.equal(await page.locator('#race-rotate').isVisible(), true); assert.equal((await observe()).phase, 'paused');
    await page.setViewportSize({ width, height }); await page.locator('#race-resume').tap();
    await page.waitForFunction(() => !window.game.player.drifting, null, { timeout: 2000 });
    assert.equal((await observe()).axis, 0);
    report.rows.push({ width, case: 'rotate-resume-neutral', ...await observe(), screenshot: await shot('rotation-resume') });
    const video = page.video(); await context.close(); await video.saveAs(out + `/${width}-touch.webm`);
  }
  assert.deepEqual(report.errors, []); report.passed = true;
} catch (error) { report.errors.push(error.stack); process.exitCode = 1; }
finally {
  await writeFile(out + '/report.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close(); server.close();
}
console.log(JSON.stringify({ output: out, passed: report.passed, errors: report.errors }));
