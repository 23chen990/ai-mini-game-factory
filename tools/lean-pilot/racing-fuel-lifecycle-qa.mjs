/* global window, document, localStorage, Storage, Event, URL, setTimeout, getComputedStyle */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { FUEL_KEY, newFuelState, saveFuel } from '../../templates/web-lite/h5-source-mobile-v1/fuel.mjs';

// Engineering fixtures for the actual V3 module. No physical-device/LIVE/natural-victory claim.
const platform = { status: 1, source: 'check_ads_status', appId: 'fixture-only', spaceId: 'fixture-only', screenOrientation: 1 };
async function setup(t, { amount = 30, delay = 0, denied = false } = {}) {
  const root = path.resolve('templates/web-lite/h5-source-mobile-v1');
  const html = '<!doctype html><html data-race-mobile><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}#native-start{position:fixed;right:0;top:0;z-index:1000}</style><link rel="stylesheet" href="/racing/mobile.css"></head><body><button id="native-start">Native fixture start</button><span id="gaugelbl"></span><div id="lapbox"><span class="s"></span></div><span id="n2o0"></span><span id="n2o1"></span><div id="msgs"></div><script type="module" src="/racing/mobile.mjs"></script></body></html>';
  const server = createServer(async (req, res) => {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
    try { const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname); if (!file.startsWith(root + path.sep)) throw Error('path'); res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(await readFile(file)); }
    catch { res.writeHead(404); res.end('missing'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(15000);
  const errors = []; page.on('pageerror', e => errors.push(e.message)); t.after(() => assert.deepEqual(errors, []));
  await page.addInitScript(({ key, value, denied }) => {
    localStorage.setItem(key, value);
    const gain = { value: 0, setValueAtTime() {} };
    const g = window.game = { state: 'menu', loading: false, track: {}, map: { id: 'city' }, starts: 0,
      settings: { quality: 'low' }, input: { down: new Set(), pressed: new Set(), touchPressed: new Set(), touch: {}, frame() { return {}; } },
      hud: { message() {}, countdown() {}, drawSpeedo() {} },
      audio: { init() {}, enabled: true, master: { gain }, ctx: { currentTime: 0 } },
      save() {}, setupQuality() {}, checkRaceEnd() {}, handleEvents() {}, onItemGet() {},
      async loadMap(id) { this.map = { id }; this.track = { length:2500, __RACE_COURSE_ID:this.settings.course }; }, startDemo() { this.state = 'menu'; this.player = null; },
      togglePause() { if (this.state === 'paused') this.state = this.pausedFrom; else { this.pausedFrom = this.state; this.state = 'paused'; } },
      startRace() { if (this.loading) return; this.starts++; this.state = 'countdown'; this.player = { isPlayer: true, stats: {}, events: [], finished: false }; this.racers = [this.player]; this.standings = [this.player]; },
    };
    window.tap = { createRewardedVideoAd() {} };
    document.addEventListener('DOMContentLoaded', () => document.getElementById('native-start').addEventListener('click', () => g.startRace()));
    if (denied) { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k === key) throw Error('quota fixture'); return original.call(this, k, v); }; }
  }, { key: FUEL_KEY, value: saveFuel({ ...newFuelState(), amount }), denied });
  await page.route('**/platform.json', async route => { if (delay) await new Promise(resolve => setTimeout(resolve, delay)); await route.fulfill({ json: platform }); });
  await page.goto('http://127.0.0.1:' + server.address().port + '/');
  await page.waitForFunction(() => window.game && document.querySelector('#race-kit'));
  return page;
}
const amount = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)).amount, FUEL_KEY);
const ready = page => page.waitForFunction(() => document.querySelector('#race-fuel-info').textContent.includes('每局 -5 · 每分钟 +1'));

test('V3 resolves fuel policy before accepting the first race', async t => {
  const page = await setup(t, { delay: 1200 });
  assert.equal(await page.locator('#race-start').isDisabled(), true);
  await ready(page); assert.equal(await page.locator('#race-start').isDisabled(), false);
});
test('V3 native entry cannot bypass zero fuel', async t => {
  const page = await setup(t, { amount: 0 }); await ready(page);
  await page.locator('#native-start').click();
  assert.equal(await page.evaluate(() => window.game.starts), 0);
  assert.equal(await amount(page), 0);
});
test('V3 zero fuel disables the primary action even with a 30-unit tank', async t => {
  const page = await setup(t, { amount: 0 }); await ready(page);
  assert.equal(await page.locator('#race-start').isDisabled(), true);
  assert.equal(await page.getByRole('meter').getAttribute('aria-valuenow'), '0');
});
test('V3 countdown double-start never spends the five-unit entry twice', async t => {
  const page = await setup(t); await ready(page); await page.locator('#race-start').tap();
  await page.locator('#native-start').click();
  assert.equal(await page.evaluate(() => window.game.starts), 1);
  assert.equal(await amount(page), 25);
});
test('V3 ignores background starts and requires explicit foreground input', async t => {
  const page = await setup(t); await ready(page);
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); // engineering lifecycle fixture
  await page.locator('#race-start').tap();
  assert.equal(await page.evaluate(() => window.game.starts), 0);
  assert.equal(await amount(page), 30);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.locator('#race-start').tap(); assert.equal(await amount(page), 25);
});
test('V3 failed native start preserves fuel and retry remains usable', async t => {
  const page = await setup(t); await ready(page);
  await page.evaluate(() => { window.game.loading = true; }); // engineering ignored-start fixture
  await page.locator('#native-start').click(); assert.equal(await amount(page), 30);
  await page.evaluate(() => { window.game.loading = false; });
  await page.locator('#race-start').tap(); assert.equal(await amount(page), 25);
});
test('V3 write denial keeps session free and exposes a visible storage warning', async t => {
  const page = await setup(t, { denied: true }); await ready(page); await page.locator('#race-start').tap();
  assert.equal(await amount(page), 30);
  assert.match(await page.locator('#race-fuel-info').textContent(), /存储.*不限油/);
  assert.equal(await page.getByRole('status').filter({ hasText: /存储|保存/ }).isVisible(), true);
});

test('V3 settlement actions fit both landscape sizes without requiring a panel scroll', async t => {
  const page = await setup(t); await ready(page);
  // Presentation fixture only. No racer state, rank, finish flag, stars or storage is modified.
  await page.evaluate(() => {
    document.querySelector('#race-kit').dataset.phase = 'finished';
    for (const id of ['guide', 'ready', 'start', 'stage-goal', 'note']) document.querySelector('#race-' + id).hidden = true;
    for (const id of ['result-copy', 'result-stats', 'results', 'replay', 'next', 'lobby']) document.querySelector('#race-' + id).hidden = false;
    document.querySelector('#race-heading').textContent = '挑战成功！★★★';
    document.querySelector('#race-result-copy').textContent = '第 1 名 · 01:26.31 · 最佳 01:26.31 · 累计 12 星 · 解锁车漆：黄金';
    document.querySelector('#race-result-stats').innerHTML = ['有效漂移', '弯道超车', '拾取道具', '小喷'].map(s => '<span><b>15</b>' + s + '</span>').join('');
    document.querySelector('#race-results').innerHTML = Array.from({ length: 6 }, (_, i) => '<li><span>' + (i + 1) + '</span><span>车手</span><span>01:26.31</span></li>').join('');
  });
  for (const viewport of [{ width: 844, height: 390 }, { width: 740, height: 360 }]) {
    await page.setViewportSize(viewport);
    const fit = await page.evaluate(() => {
      const panel = document.querySelector('#race-panel').getBoundingClientRect();
      return ['replay', 'next', 'lobby'].map(id => {
        const r = document.querySelector('#race-' + id).getBoundingClientRect();
        return { id, top: r.top, bottom: r.bottom, panelBottom: panel.bottom, height: r.height };
      });
    });
    for (const b of fit) assert.ok(b.top >= 0 && b.bottom <= viewport.height && b.bottom <= b.panelBottom && b.height >= 44, JSON.stringify({ viewport, button: b }));
  }
});
test('V4.4 analogue steering keeps large thumb targets at the edges with an unobstructed racing centre', async t => {
  const page = await setup(t); await ready(page);
  await page.locator('#race-start').tap();
  const geometry = await page.evaluate(() => {
    const wheel=document.querySelector('#race-joystick').getBoundingClientRect();
    const drift=document.querySelector('[data-race-action="drift"]').getBoundingClientRect();
    return {wheel:wheel.toJSON(),drift:drift.toJSON(),width:window.innerWidth};
  });
  assert.ok(geometry.wheel.width >= 100,JSON.stringify(geometry));
  assert.ok(geometry.drift.width >= 80,JSON.stringify(geometry));
  assert.ok(geometry.wheel.right < geometry.width *.35,JSON.stringify(geometry));
  assert.ok(geometry.drift.left > geometry.width *.65,JSON.stringify(geometry));
});
test('V3 boost tint cannot paint the full mobile frame and hit feedback stays on the edge', async t => {
  const page = await setup(t); await ready(page);
  const style = await page.evaluate(() => {
    const boost = document.createElement('div'); boost.id = 'vignette'; boost.style.opacity = '1';
    const hit = document.createElement('div'); hit.id = 'hitflash'; hit.style.opacity = '1';
    document.body.append(boost, hit);
    return { boost: getComputedStyle(boost).display, hit: getComputedStyle(hit).backgroundColor, edge: getComputedStyle(hit).boxShadow };
  });
  assert.equal(style.boost, 'none');
  assert.equal(style.hit, 'rgba(0, 0, 0, 0)');
  assert.match(style.edge, /inset/u);
});
