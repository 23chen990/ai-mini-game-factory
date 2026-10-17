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
  const game={ track:{ length:2500, __RACE_COURSE_ID:'race-01' },
    settings:{course:'race-01'}, map:{id:'city'},loading:false };
  const stage={ id:'02', map:'egypt',course:'race-02' };
  assert.equal(ready(game,stage),false,'stale physical environment is never good enough');
  game.map.id='egypt';assert.equal(ready(game,stage),false,'same environment but stale course is rejected');
  game.settings.course='race-02';assert.equal(ready(game,stage),false,'settings cannot spoof native geometry');
  game.track.__RACE_COURSE_ID='race-02';assert.equal(ready(game,stage),true);
  game.loading=true;assert.equal(ready(game,stage),false);
  game.loading=false;game.track=null;assert.equal(ready(game,stage),false);
  assert.equal(ready(null,stage),false);
});
test('画质偏好：首次使用均衡，用户选流畅后刷新仍优先流畅',()=>{
  const normalize=need('normalizeRaceQuality');
  for(const value of ['low','mid','high']) assert.equal(normalize(value),value);
  for(const value of [null,undefined,'','ultra','manual',{},0]) assert.equal(normalize(value),'mid');
});
test('暂停静音复用原生 WebAudio 总音量，支持启动前后调用与恢复',()=>{
  const mute=need('setRaceSound');
  assert.equal(mute(null,false),false);
  assert.equal(mute({master:null},false),false);
  const output={value:0.8,setTargetAtTime(value,time,fade){this.value=value;this.args=[time,fade];}};
  const audio={master:{gain:output},ctx:{currentTime:12}};
  assert.equal(mute(audio,false),true);
  assert.equal(output.value,0);assert.deepEqual(output.args,[12,.035]);
  assert.equal(mute(audio,true),true);assert.equal(output.value,.8);
  const fallback={master:{gain:{value:.8}},ctx:null};
  assert.equal(mute(fallback,false),true);assert.equal(fallback.master.gain.value,0);
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
test('手机镜头FOV温和跟速，不因氮气使车身过小', () => {
  const fov = need('raceCameraFov');
  assert.ok(fov(55, true, false) > fov(55, false, false));
  assert.ok(fov(86, true, true) <= 69);assert.ok(fov(0, false, false) >= 61);
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
  const bloom = need('raceBloomStrength');assert.equal(bloom(true), bloom(false));assert.ok(bloom(true) <= .3);
});
test('自适应只在持续低帧率后降一档；手选画质保留', () => {
  const Monitor = need('QualityMonitor'), q = new Monitor();
  for (let i = 0; i < 200; i++) assert.equal(q.frame(.016, 'mid'), null);
  let change;for (let i = 0; i < 180; i++) change = q.frame(.05, 'mid') ?? change;
  assert.equal(change, 'low');assert.equal(q.frame(.05, 'low'), null);
  const manual = new Monitor();manual.manual = true;
  for (let i = 0; i < 180; i++) assert.equal(manual.frame(.05, 'high'), null);
});


test('UI refresh at 30 Hz cannot throttle 120Hz physics or misread a backwards clock',()=>{
  const refresh=need('shouldRefreshRaceHud');
  assert.equal(refresh(0,-Infinity),true);
  assert.equal(refresh(100,80),false);
  assert.equal(refresh(115,80),true);
  assert.equal(refresh(12,80),true);
  const sequence=Array.from({length:120},(_,i)=>i*1000/120);
  let last=-Infinity,domPaints=0;
  for(const t of sequence)if(refresh(t,last)){last=t;domPaints++;}
  assert.ok(domPaints>=24 && domPaints<=32,'about 30 DOM paints per second');
});
test('phone quality drops on sustained <46FPS rather than isolated delayed frames',()=>{
  const Monitor=need('QualityMonitor'), q=new Monitor();
  for(let i=0;i<100;i++)assert.equal(q.frame(.016,'high'),null);
  assert.equal(q.frame(.12,'high'),null,'single WebGL stall cannot downgrade');
  let lower=null;
  for(let i=0;i<180;i++)lower=q.frame(.027,'high')??lower;
  assert.equal(lower,'mid');
  let again=null;
  for(let i=0;i<180;i++)again=q.frame(.027,'mid')??again;
  assert.equal(again,'low','can step down twice after separate slow windows');
  const manual=new Monitor();manual.manual=true;
  for(let i=0;i<200;i++)assert.equal(manual.frame(.05,'high'),null);
});

test('screen platform depends on input affordance, not CSS window width',()=>{
 const profile=need('raceScreenProfile');
 assert.equal(profile(844,390,{coarse:true,touchPoints:5}),'touch');
 assert.equal(profile(390,844,{coarse:true,touchPoints:5}),'touch');
 assert.equal(profile(844,390,{coarse:false,anyCoarse:false,touchPoints:0}),'desktop');
 assert.equal(profile(1920,1080,{coarse:false,anyCoarse:true,touchPoints:10}),'desktop');
});
test('phone follows closer car yet looks ahead on V9 technical bends',()=>{
 const camera=need('racePhoneCamera'),normal=camera(740,360),wide=camera(932,430);
 for(const view of [normal,wide]){
  assert.ok(view.dist>8.7&&view.dist<12.5);
  assert.ok(view.look>7&&view.h>3);
 }
 assert.equal(camera(844,390),wide);
});

test('first mobile frame uses safe rendering budget, saved user preference still wins',()=>{
  const quality=need('initialRaceQuality');
  assert.equal(quality(null,true),'low');
  assert.equal(quality(undefined,false),'mid');
  assert.equal(quality('high',true),'high');
  assert.equal(quality('mid',true),'mid');
  assert.equal(quality('low',false),'low');
});
test('phone downhill camera samples true road elevation, avoids airborne/fork guesses',()=>{
  const offset=need('racePhoneLookOffset');
  const road={halfW:10,sample(d){return {y:110-d*.12}}};
  const car={y:104,proj:{d:50,lat:1},airborne:false};
  assert.ok(offset(road,car,8)<0,'downhill road ahead lowers the look point');
  assert.equal(offset(road,{...car,airborne:true},8),0);
  assert.equal(offset(road,{...car,proj:{d:50,lat:60}},8),0);
  assert.equal(offset(null,car,8),0);
  assert.equal(offset({sample(){return {y:Infinity}}},car,8),0);
  const climb={halfW:9,sample(d){return {y:100+d*.6}}};
  assert.ok(offset(climb,{y:100,proj:{d:50,lat:1}},8)>0);
});
test('manual graphics cannot become unsteerable at sustained 14 FPS',()=>{
  const Monitor=need('QualityMonitor'),monitor=new Monitor();
  monitor.manual=true;let downgraded=null;
  for(let i=0;i<30;i++)downgraded=monitor.frame(.075,'high')??downgraded;
  assert.equal(downgraded,'mid','emergency one-level transient downgrade');
  assert.equal(monitor.manual,true,'do not rewrite stored preference');
});

test('input diagnostics are aggregate-only and do not claim display latency',()=>{
 const Metric=need('RaceInputHealth'),m=new Metric();
 m.touch(100,0,'press');m.touch(107,.8,'move');m.sample(114);
 m.touch(122,-.8,'move');m.sample(131);
 m.touch(140,0,'cancel');m.sample(144);
 m.frame(.016);m.frame(.06);
 const q=m.snapshot();
 assert.equal(q.touchEvents,4);assert.equal(q.touchMoves,2);
 assert.equal(q.touchCancels,1);assert.equal(q.directionReversals,1);
 assert.ok(q.inputSampleMsP95>=9 && q.inputSampleMsP95<=15);
 assert.equal(q.framesOver50ms,1);
 assert.equal(q.timingScope,'pointer-event-to-native-input-sample-and-overlay-RAF-only');
 assert.ok(!('coordinates' in q)&&!('pointerId' in q)&&!('userId' in q));
});
