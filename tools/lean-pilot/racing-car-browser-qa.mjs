/* global window, document, performance */
import { chromium, devices } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

// This is read-only instrumentation plus normal visible controls, not a seeded
// victory or a terminal/replay proof. Physical phones remain a separate gate.
const [url, output, expectedSha, angle] = process.argv.slice(2);
assert.match(expectedSha, /^[a-f0-9]{64}$/u);
assert.ok(['metal', 'swiftshader'].includes(angle));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=' + angle, '--enable-unsafe-swiftshader'] });
const report = { schemaVersion: 1, expectedSha, cases: [], errors: [], passed: false,
  scope: 'Real default startup/race model, PBR/pivots and visible controls; no settlement injection',
  naturalTerminalReplay: 'NOT_RUN', physicalAndroid: 'NOT_RUN', physicalIphone: 'NOT_RUN' };

async function audit(page, phase) {
  const data = await page.evaluate(phase => {
    const g = window.game;
    const cars = g.racers.map(r => {
      const materialNames = new Set(); let triangles = 0, meshes = 0;
      r.model.traverse(n => {
        if (!n.isMesh) return;
        for (const material of Array.isArray(n.material) ? n.material : [n.material]) materialNames.add(material.name);
        triangles += (n.geometry.index ? n.geometry.index.count : n.geometry.attributes.position.count) / 3; meshes++;
      });
      return { isPlayer: r.isPlayer, identity: r.model.userData.assetIdentity, materials: [...materialNames], triangles, meshes,
        wheels: r.model.userData.wheels.map(w => ({ front: w.front, outerParent: w.steer.parent === r.model,
          position: w.steer.position.toArray(), spin: w.spin.rotation.x, steer: w.steer.rotation.y })) };
    });
    return { phase, nativeState: g.state, cars, physicsSpeed: g.player?.s,
      stageCount: document.querySelectorAll('#race-stage option:not([value="daily"])').length,
      railCount: document.querySelectorAll('.race-stage-choice').length, railHidden: document.querySelector('#race-stage-rail').hidden,
      layout: document.querySelector('#race-kit').getBoundingClientRect().toJSON() };
  }, phase);
  assert.equal(data.cars.length, 6);
  for (const car of data.cars) {
    assert.equal(car.identity?.sha256, expectedSha, 'Exact generated model missing on ' + phase);
    for (const name of ['BodyPaint', 'Glass', 'Tire', 'Rim', 'Headlight', 'Taillight', 'Trim']) assert.ok(car.materials.includes(name), name);
    assert.equal(car.wheels.length, 4);
    assert.equal(car.wheels.filter(w => w.front).length, 2);
    assert.ok(car.wheels.every(w => w.outerParent), 'body lean must not move wheel pivots');
  }
  assert.equal(data.stageCount, 30);
  assert.equal(data.railCount, 30);
  assert.equal(data.railHidden, phase !== 'home');
  return data;
}
async function profile(page) {
  return page.evaluate(async () => {
    const g = window.game, samples = []; let last = performance.now();
    await new Promise(resolve => {
      const step = t => { samples.push(t - last); last = t; if (samples.length === 91) resolve(); else window.requestAnimationFrame(step); };
      window.requestAnimationFrame(step);
    });
    samples.shift(); samples.sort((a, b) => a - b);
    const info = g.renderer.info;
    info.autoReset = false; info.reset();
    await new Promise(window.requestAnimationFrame);
    const wholeFrame = { calls: info.render.calls, triangles: info.render.triangles };
    info.autoReset = true;
    const gl = g.renderer.getContext();
    return { medianFrameMs: samples[45], p95FrameMs: samples[85], textures: g.renderer.info.memory.textures,
      geometries: g.renderer.info.memory.geometries, wholeFrame,
      gpu: gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL),
      note: 'Desktop GPU, phone viewport emulation is not physical phone performance; wholeFrame temporarily disables counter autoReset across all render passes.' };
  });
}
try {
  for (const [name, options] of [
    ['desktop', { viewport: { width: 1440, height: 900 } }],
    ['phone-landscape', { ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 }],
    ['phone-portrait', { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }],
  ]) {
    const context = await browser.newContext(options), page = await context.newPage();
    page.on('pageerror', error => report.errors.push(name + ': ' + error.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(name + ': ' + message.text()); });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.racers.length === 6 && document.querySelector('#race-kit')?.dataset.loaded === 'true', null, { timeout: 90000 });
    const homeLayout = await page.evaluate(() => { const panel=document.querySelector('#race-panel').getBoundingClientRect(), start=document.querySelector('#race-start').getBoundingClientRect(); return {panel:panel.toJSON(),start:start.toJSON(),height:window.innerHeight,width:window.innerWidth}; });
    if (name !== 'phone-portrait') {
      assert.ok(homeLayout.panel.width <= homeLayout.width * .44, 'Home panel must leave the real car unobstructed');
      assert.ok(homeLayout.start.bottom <= homeLayout.panel.bottom && homeLayout.start.top >= homeLayout.panel.top, 'Start must fit without scrolling');
    }
    const item = { name, homeLayout, home: await audit(page, 'home'), homePerformance: await profile(page) };
    report.cases.push(item);
    await page.screenshot({ path: path.join(output, name + '-home.png') });
    if (name !== 'phone-portrait') {
      await page.locator('#race-start').click();
      await page.waitForFunction(() => window.game.state === 'race' && window.game.player, null, { timeout: 45000 });
      if (name === 'desktop') {
        await page.keyboard.down('ArrowUp'); await page.waitForTimeout(2200);
        await page.keyboard.down('ArrowLeft'); await page.keyboard.down('Shift'); await page.waitForTimeout(500);
      } else {
        await page.waitForTimeout(2200);
        const cdp = await context.newCDPSession(page), wheel = await page.locator('#race-joystick').boundingBox();
        const drift = await page.locator('[data-race-action="drift"]').boundingBox();
        const x = wheel.x + wheel.width / 2, y = wheel.y + wheel.height / 2, r = wheel.width * 0.34;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x, y: y - r }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: x + r * 0.87, y: y - r * 0.5 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: x + r * 0.87, y: y - r * 0.5 }, { id: 2, x: drift.x + drift.width / 2, y: drift.y + drift.height / 2 }] });
        await page.waitForTimeout(500);
        item.touchAudit = await audit(page, 'touch-steer-drift');
        assert.ok(item.touchAudit.cars.find(car => car.isPlayer).wheels.some(w => w.front && Math.abs(w.steer) > 0.01));
        await page.screenshot({ path: path.join(output, name + '-touch-steer.png') });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }
      item.race = await audit(page, 'race');
      assert.ok(item.race.cars.find(car => car.isPlayer).wheels.every(w => Math.abs(w.spin) > 0.1), 'normal player driving must spin all four wheels');
      await page.screenshot({ path: path.join(output, name + '-race.png') });
      if (name === 'desktop') {
        await page.keyboard.up('ArrowLeft'); await page.keyboard.up('Shift'); await page.keyboard.up('ArrowUp');
      }
      item.racePerformance = await profile(page);
    }
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
} finally {
  await browser.close();
  await writeFile(path.join(output, 'car-browser-qa.json'), JSON.stringify(report, null, 2) + '\n');
}
