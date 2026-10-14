import test from 'node:test';
import assert from 'node:assert/strict';
const api = await import('../racing/session.mjs').catch(() => ({}));
const need = name => { assert.equal(typeof api[name], 'function', name + ' 尚未实现'); return api[name]; };
test('原生大厅只有AI演示赛车时即可启动，不等待尚未创建的玩家', () => {
  const ready = need('raceReady');
  assert.equal(ready({ track: {}, input: {}, loading: false, state: 'menu', player: null }), true);
  assert.equal(ready({ track: {}, input: {}, loading: true }), false);
  assert.equal(ready({ input: {}, loading: false }), false);
});
test('切关加载失败或仍处于旧赛道时，禁止用错误赛道开新关并扣燃油',()=>{
  const ready=need('stageTrackReady');
  const game={ track:{ length:2500 }, map:{ id:'city' }, loading:false };
  const stage={ id:'02', map:'egypt' };
  assert.equal(ready(game,stage),false,'stale physical map is never good enough');
  game.map.id='egypt';assert.equal(ready(game,stage),true);
  game.loading=true;assert.equal(ready(game,stage),false);
  game.loading=false;game.track=null;assert.equal(ready(game,stage),false);
  assert.equal(ready(null,stage),false);
});
test('成绩读取真实玩家，不将AI冲线计为玩家完赛', () => {
  const summary = need('resultSummary'), player = { finished: false, progress: 200, stats: { small: 2, drift: 3, nitro: 1, perfect: 1 }, lapTimes: [], name: '我' }, ai = { finished: true, finishTime: 42, name: '对手', lapTimes: [42] };
  const g = { player, standings: [ai, player], track: { length: 400 }, settings: { laps: 1, map: 'city' }, raceTime: 50 };
  assert.deepEqual([summary(g).finished, summary(g).place, summary(g).time, summary(g).completion], [false, 2, null, .5]);
  player.finished = true; player.finishTime = 52;
  assert.deepEqual([summary(g).finished, summary(g).time], [true, 52]);
});
test('结算冻结原生模拟，重复调用不会从结算恢复模拟', () => {
  const settle = need('settleNative'), player = { finished: true, finishTime: 50, progress: 400, stats: {}, lapTimes: [50] };
  let calls = 0;
  const g = { player, standings: [player], settings: { laps: 1, map: 'city' }, track: { length: 400 }, state: 'finish', togglePause() { calls++; this.pausedFrom = this.state; this.state = 'paused'; } };
  settle(g); settle(g); assert.equal(calls, 1);assert.equal(g.state, 'paused');
});
test('输入释放同时清除触屏、键盘、两个边沿集合', () => {
  const clear = need('clearNativeInput');
  const input = { down: new Set(['ArrowLeft']), pressed: new Set(['KeyW']), touchPressed: new Set(['TouchNitro']), touch: { up: true, left: true, shift: true } };
  clear(input);assert.equal(input.down.size + input.pressed.size + input.touchPressed.size, 0);assert.ok(Object.values(input.touch).every(v => !v));
});
test('手机镜头FOV有温和速度反馈且不超过78度', () => {
  const fov = need('raceCameraFov');
  assert.ok(fov(55, true, false) > fov(55, false, false));
  assert.ok(fov(86, true, true) <= 78);assert.ok(fov(0, false, false) >= 66);
});
test('手机特效保持原生粒子事件与寿命，限制近镜头遮挡；安装一次且键盘模式恢复原参数', () => {
  const tune = need('tuneRaceFx'), calls = [];
  const pool = kind => ({ emit(...args) { calls.push({ kind, args });return 'native'; } });
  const g = { mobileMode: true, fx: { smoke: pool('smoke'), glow: pool('glow') } };
  const args = [0, 1, 2, 3, 4, 5, .6, 1.6, 5, 1, .6, .2, 1, 0, 3];
  tune(g);tune(g);
  assert.equal(g.fx.glow.emit(...args), 'native');g.fx.smoke.emit(...args);
  assert.equal(calls.length, 2, '不能增加粒子数或重复包装');
  for (const call of calls) {
    assert.deepEqual(call.args.slice(0, 7), args.slice(0, 7), '位置、速度和寿命保留');
    assert.deepEqual(call.args.slice(9, 12), args.slice(9, 12), '保留喷射颜色');
    assert.ok(call.args[7] > 0 && call.args[7] < args[7] * .7);
    assert.ok(call.args[8] > 0 && call.args[8] < args[8] * .7);
    assert.ok(call.args[12] > 0 && call.args[12] < .6);
    assert.deepEqual(call.args.slice(13), args.slice(13));
  }
  g.mobileMode = false;g.fx.glow.emit(...args);assert.deepEqual(calls.at(-1).args, args);
  const bloom = need('raceBloomStrength');assert.ok(bloom(true) > bloom(false));assert.ok(bloom(true) <= .4);
});
test('自适应只在持续低帧率后降一档；手选画质保留', () => {
  const Monitor = need('QualityMonitor'), q = new Monitor();
  for (let i = 0; i < 200; i++) assert.equal(q.frame(.016, 'mid'), null);
  let change;for (let i = 0; i < 180; i++) change = q.frame(.05, 'mid') ?? change;
  assert.equal(change, 'low');assert.equal(q.frame(.05, 'low'), null);
  const manual = new Monitor();manual.manual = true;
  for (let i = 0; i < 180; i++) assert.equal(manual.frame(.05, 'high'), null);
});
