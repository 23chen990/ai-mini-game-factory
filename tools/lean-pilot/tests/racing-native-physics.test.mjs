/* global process */
// Fixture-only engineering truth; never counted as a natural race or perceptual QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RaceDriver } from '../../../templates/web-lite/h5-source-mobile-v1/racing/driver.mjs';
const project = process.env.RACE_NATIVE_PROJECT;
const load = async name => import(pathToFileURL(path.join(project, 'src', name)).href);
let PlayerCar, Track, LAYOUTS;
if (project) { ({ PlayerCar } = await load('vehicle.js'));({ Track } = await load('track.js'));({ LAYOUTS } = await load('layouts.js')); }
const fixture = () => { const track = new Track(LAYOUTS.city), p = new PlayerCar(track, {}, 'engineering-fixture');p.s = 32;return { track, p, driver: new RaceDriver(), events: [] }; };
const step = (f, raw = {}, dt = 1 / 60) => { const inp = f.driver.frame(dt, raw, f.p, f.track, 'race');f.p.update(dt / 2, inp, true, false);f.p.update(dt / 2, { ...inp, upPressed: false, wPressed: false, nitroPressed: false }, true, false);f.events.push(...f.p.events);f.p.events.length = 0;return inp; };
test('原生 endDrift 窗口经适配器产生真实小喷事件且只能消费一次', { skip: !project }, () => {
  const f = fixture(), p = f.p;
  Object.assign(p, { drifting: true, driftDir: 1, driftTime: .6 });
  f.driver.frame(.02, { left: true }, p, f.track, 'race');f.driver.frame(.02, {}, p, f.track, 'race');
  p.endDrift(true);p.steer = .1;
  for (let i = 0; i < 10; i++) step(f);
  assert.equal(f.events.filter(e => e.type === 'smallBoost').length, 1);
  assert.equal(f.events.find(e => e.type === 'smallBoost').data.perfect, true);
  assert.equal(p.smallWindow, 0);assert.ok(p.smallBoost > 0);
});
test('普通出弯仍由原生0.5秒窗口判定，不自动升级完美奖励', { skip: !project }, () => {
  const f = fixture(), p = f.p, hd = p.h;
  Object.assign(p, { drifting: true, driftDir: 1, driftTime: .6, h: hd + .4 });
  f.driver.frame(.02, { left: true }, p, f.track, 'race');
  p.endDrift(true);p.h = hd + .2;p.steer = .1;
  for (let i = 0; i < 22; i++) step(f);
  assert.equal(f.events.filter(e => e.type === 'smallBoost').length, 1);
  assert.equal(f.events.find(e => e.type === 'smallBoost').data.perfect, false);
});
test('原生氮气库存实际减少；144Hz输入/120Hz物理没有丢失或重复边沿', { skip: !project }, () => {
  const f = fixture();f.p.reset(120, 0);f.p.s = 32;f.p.nitroCount = 1;
  assert.ok(Math.abs(f.track.curv[f.p.hint]) < .0045, '氮气测试必须位于真实稳定直道分支');
  let acc = 0;
  for (let frame = 0; frame < 144; frame++) {
    const dt = 1 / 144, inp = f.driver.frame(dt, {}, f.p, f.track, 'race', { canStep: acc + dt >= 1 / 120 });
    acc += dt;let first = true;
    while (acc >= 1 / 120) { acc -= 1 / 120;f.p.update(1 / 120, first ? inp : { ...inp, upPressed: false, wPressed: false, nitroPressed: false }, true, false);first = false; }
    f.events.push(...f.p.events);f.p.events.length = 0;
  }
  assert.equal(f.events.filter(e => e.type === 'nitro').length, 1);
  assert.equal(f.p.nitroCount, 0);assert.ok(f.p.nitroTime > 1.5);
});
