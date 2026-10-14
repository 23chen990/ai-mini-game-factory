import test from 'node:test';
import assert from 'node:assert/strict';
const module = await import('../racing/driver.mjs').catch(() => ({}));
const make = () => { assert.equal(typeof module.RaceDriver, 'function', '双键适配器尚未实现'); return new module.RaceDriver(); };
const track = (bend = .008) => ({ N: 400, ds: 1.5, length: 600, halfW: 12, curv: Array(400).fill(bend), hd: Array(400).fill(0), sample: (d, out) => Object.assign(out, { hd: bend * d, i: Math.floor(d / 1.5) % 400 }) });
const car = (patch = {}) => ({ s: 32, h: 0, m: 0, d: 0, hint: 0, lat: 0, steer: .8, spin: 0, slowTime: 0, airborne: false, impact: 0, wrongWay: 0, drifting: false, driftDir: 1, driftTime: 0, driftAngle: 0, smallWindow: 0, windowKind: '', nitroCount: 0, nitroTime: 0, proj: { hd: 0 }, stats: { crash: 0 }, ...patch });
const left = { left: true, right: false };
const idle = { left: false, right: false };
const run = (driver, p, road, input = left, seconds = .4) => {
  const frames = [];
  for (let t = 0; t < seconds; t += 1 / 60) frames.push(driver.frame(1 / 60, input, p, road, 'race'));
  return frames;
};
test('比赛自动油门，倒计时、终局和暂停不驱动', () => {
  const d = make(), p = car();
  assert.equal(d.frame(.02, idle, p, track(), 'race').up, true);
  for (const state of ['menu', 'countdown', 'paused', 'finish']) assert.equal(d.frame(.02, left, p, track(), state).up, false);
  assert.equal(d.frame(.02, left, car({ finished: true }), track(), 'race').up, false);
});
test('自动油门的起步边沿每辆新赛车仅一次，暂停与无物理步不会重放', () => {
  const d = make(), p = car(), road = track(0);
  assert.equal(d.frame(.02, idle, p, road, 'countdown').upPressed, false);
  assert.equal(d.frame(.004, idle, p, road, 'race', { canStep: false }).upPressed, false);
  assert.equal(d.frame(.006, idle, p, road, 'race').upPressed, true);
  assert.ok(run(d, p, road, idle).every(f => !f.upPressed));
  d.frame(.02, idle, p, road, 'paused');
  assert.equal(d.frame(.02, idle, p, road, 'race').upPressed, false);
  assert.equal(d.frame(.02, idle, car(), road, 'race').upPressed, true);
});
test('轻点/长按直道微调不会漂移；不代替玩家转向', () => {
  const d = make(), p = car();
  assert.ok(run(d, p, track(), left, .10).every(f => !f.shift));
  assert.ok(run(d, p, track(0), left, 2).every(f => !f.shift));
  assert.ok(run(d, p, track(), idle).every(f => !f.left && !f.right && !f.shift));
});
test('连续同向弯道驾驶可进入原生shift分支', () => {
  assert.ok(run(make(), car(), track(), left).some(f => f.shift));
  assert.ok(run(make(), car(), track(-.008), { right: true }).some(f => f.shift));
  assert.ok(run(make(), car(), track(-.008), left).every(f => !f.shift));
});
test('低速、腾空、旋转、错误方向和墙边不触发', () => {
  for (const patch of [{ s: 10 }, { airborne: true }, { spin: 1 }, { wrongWay: 1 }, { lat: 11 }, { impact: 12 }]) assert.ok(run(make(), car(patch), track()).every(f => !f.shift), JSON.stringify(patch));
});
test('松手、反向与过大侧滑都释放shift', () => {
  for (const [p, input] of [[car({ drifting: true, driftAngle: .2 }), idle], [car({ drifting: true }), { right: true }], [car({ drifting: true, driftAngle: .8 }), left]]) assert.equal(make().frame(.02, input, p, track(), 'race').shift, false);
});
test('快速反向不能立刻开启另一段漂移', () => {
  const d = make(), p = car({ drifting: true, driftTime: .5 });
  d.frame(.02, left, p, track(), 'race');
  d.frame(.02, { right: true }, p, track(), 'race');
  p.drifting = false;
  assert.ok(run(d, p, track(-.008), { right: true }, .18).every(f => !f.shift));
});
test('有质量的松手出弯小喷只发一次边沿', () => {
  const d = make(), p = car({ drifting: true, driftTime: .6, driftAngle: .2 });
  d.frame(.02, left, p, track(), 'race'); d.frame(.02, idle, p, track(), 'race');
  Object.assign(p, { drifting: false, steer: .1, driftAngle: .05, smallWindow: .5, windowKind: 'drift' });
  const frames = run(d, p, track(0), idle, .1);
  assert.equal(frames.filter(f => f.wPressed).length, 1);
});
test('不好的出弯延迟到普通小喷窗口，不能总给完美', () => {
  const d = make(), p = car({ drifting: true, driftTime: .6, h: .4, driftAngle: .2 });
  d.frame(.02, left, p, track(), 'race');
  Object.assign(p, { drifting: false, steer: .1, h: .2, smallWindow: .5, windowKind: 'drift' });
  assert.equal(d.frame(.02, idle, p, track(0), 'race').wPressed, false);
  p.smallWindow = .26;
  assert.equal(d.frame(.02, idle, p, track(0), 'race').wPressed, true);
  assert.equal(d.frame(.02, idle, p, track(0), 'race').wPressed, false);
});
test('无有效漂移的松手不能凭空创建小喷', () => {
  const d = make();
  assert.ok(run(d, car({ smallWindow: .5, windowKind: 'drift' }), track(0), idle).every(f => !f.wPressed));
  assert.ok(run(d, car(), track(0), left).every(f => !f.wPressed));
});
test('碰撞中止的漂移无小喷，恢复期不自动氮气', () => {
  const d = make(), p = car({ drifting: true, driftTime: .7 });
  d.frame(.02, left, p, track(), 'race');
  Object.assign(p, { drifting: false, impact: 15, smallWindow: .5, windowKind: 'drift', nitroCount: 2 });
  assert.ok(run(d, p, track(0), idle).every(f => !f.wPressed && !f.nitroPressed));
});
test('氮气仅在稳定直道发一次，不凭空生产或反复消耗', () => {
  const d = make();
  assert.ok(run(d, car(), track(0), idle, 1).every(f => !f.nitroPressed));
  const p = car({ nitroCount: 1 });
  assert.equal(run(d, p, track(0), idle, 1).filter(f => f.nitroPressed).length, 1);
  assert.ok(run(make(), p, track(.02), idle, 1).every(f => !f.nitroPressed));
  assert.ok(run(make(), car({ nitroCount: 1, nitroTime: 2 }), track(0), idle, 1).every(f => !f.nitroPressed));
});
test('没有物理子步时保留小喷边沿直到可消费帧', () => {
  const d = make(), p = car({ drifting: true, driftTime: .6 });
  d.frame(.02, left, p, track(), 'race');d.frame(.02, idle, p, track(), 'race');
  Object.assign(p, { drifting: false, steer: .1, smallWindow: .5, windowKind: 'drift' });
  assert.equal(d.frame(.004, idle, p, track(0), 'race', { canStep: false }).wPressed, false);
  assert.equal(d.frame(.006, idle, p, track(0), 'race', { canStep: true }).wPressed, true);
});
test('暂停/恢复丢弃旧喷射边沿，经典键盘原输入保持', () => {
  const d = make(), p = car({ drifting: true, driftTime: .6 });
  d.frame(.02, left, p, track(), 'race');d.frame(.02, idle, p, track(), 'paused');
  Object.assign(p, { drifting: false, smallWindow: .4, windowKind: 'drift' });
  assert.ok(run(d, p, track(0), idle).every(f => !f.wPressed));
  d.enabled = false;
  const raw = { up: true, shift: true, wPressed: true, nitroPressed: true, left: true };
  assert.deepEqual(d.frame(.02, raw, p, track(), 'race'), raw);
});
test('触控支持双指、同方向多指、短按缓冲和彻底清空', () => {
  assert.equal(typeof module.TouchSteering, 'function', '触控生命周期尚未实现');
  const t = new module.TouchSteering();
  t.press(1, 'left', 0);t.press(2, 'right', 10);
  assert.deepEqual(t.snapshot(20), { left: true, right: true });
  t.release(1, 120); assert.deepEqual(t.snapshot(130), { left: false, right: true });
  t.press(3, 'right', 140);t.release(2, 160); assert.equal(t.snapshot(170).right, true);
  t.clear();assert.deepEqual(t.snapshot(180), idle);
  t.press(4, 'left', 200);t.release(4, 220);assert.equal(t.snapshot(240).left, true);assert.equal(t.snapshot(290).left, false);
  t.clear();t.press(5, 'left', 300);t.release(5, 310);t.press(6, 'right', 320);assert.deepEqual(t.snapshot(330), { left: false, right: true });
});
