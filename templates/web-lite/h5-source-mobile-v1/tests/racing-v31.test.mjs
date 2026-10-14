import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK_RESHAPES, applyTrackDesign } from '../racing/track-design.mjs';
import { WrongWayRecovery } from '../racing/recovery.mjs';
import { roadHint } from '../racing/road-coach.mjs';
import { applyLaneDesign, PAD_LANES } from '../racing/lane-design.mjs';

function fixture() {
  const layouts={};
  for(const [key,plan] of Object.entries(TRACK_RESHAPES)) {
    const points=Array.from({length:plan.expected},(_,i)=>[1000+i,2000+i,0]);
    for(const cut of plan.cuts) {points[cut.start]=[...cut.first];points[cut.end]=[...cut.last];}
    layouts[key]={width:key==='aegean'?24:26,points};
  }
  return layouts;
}
test('四图用固定源码控制点重新生成S弯，保留四种场景且不新增分支导航',()=>{
  const original=fixture(),snapshot=JSON.stringify(original);
  const counts=applyTrackDesign(original);
  assert.deepEqual(counts,{city:34,aegean:28,egypt:26,snow:24});
  for(const [key,plan] of Object.entries(TRACK_RESHAPES)) {
    assert.equal(original[key].width,plan.width);
    assert.equal(original[key].points.length,counts[key]);
    assert.ok(original[key].points.every(p=>p.length===3&&p.every(Number.isFinite)));
    const ranges=original[key].points.slice(0,5);
    assert.ok(ranges.length>0);
  }
  assert.equal(JSON.stringify(original).includes('__racingV31'),false,'no unnecessary JSON payload');
  assert.deepEqual(applyTrackDesign(original),counts,'build must be idempotent on generated source');
  assert.notEqual(JSON.stringify(original),snapshot);
});
test('源码坐标变动不能悄悄应用到别人的地图',()=>{
  const bad=fixture();
  bad.city.points[1]=[1,2,3];
  assert.throws(()=>applyTrackDesign(bad),/anchors changed/);
  const missing=fixture();delete missing.aegean;
  assert.throws(()=>applyTrackDesign(missing),/Missing pinned/);
  const short=fixture();short.snow.points.pop();
  assert.throws(()=>applyTrackDesign(short),/count changed/);
});
const game=()=>({
  state:'race',raceTime:0, resetCount:0,
  player:{s:32,d:18,h:0,wrongWay:0,airborne:false,finished:false},
  track:{sample(){return {hd:0};}},
  resetPlayer(){this.resetCount++;this.player.h=0;this.player.s=12;}
});
test('方向错误超过阈值自动回正，不增加任何按钮、不移动赛道进度',()=>{
  const assist=new WrongWayRecovery(),g=game();
  g.player.wrongWay=1.2;g.raceTime=2;
  assert.equal(assist.frame(g),'warning');
  assert.equal(assist.frame(g),null,'warn once, not every frame');
  g.raceTime=3;g.player.wrongWay=2.6;
  const oldDistance=g.player.d;
  assert.equal(assist.frame(g),'recovered');
  assert.equal(g.player.d,oldDistance);
  assert.equal(g.player.wrongWay,0);
  assert.equal(g.player.s,12);
  assert.equal(g.resetCount,1);
  g.player.wrongWay=3;g.raceTime=5;
  assert.equal(assist.frame(g),null,'prevent reset loops within 8 seconds');
  g.raceTime=13;assert.equal(assist.frame(g),'recovered');
});
test('完全停住但车头反向也能自动救援，不误判正常停住',()=>{
  const g=game(),assist=new WrongWayRecovery();
  g.player.s=0;g.player.h=Math.PI;
  assert.equal(assist.frame(g),null);
  g.raceTime=1.1;assert.equal(assist.frame(g),'warning');
  g.raceTime=3.1;assert.equal(assist.frame(g),'recovered');
  assert.equal(g.resetCount,1);
  assist.reset();
  g.player.h=0;g.player.wrongWay=0;g.raceTime=10;
  assert.equal(assist.frame(g),null);
  g.raceTime=15;assert.equal(assist.frame(g),null);
  assert.equal(g.resetCount,1);
});
test('空中、暂停、结束和没有原生复位接口时均不复位',()=>{
  const g=game(),assist=new WrongWayRecovery();
  g.player.wrongWay=9;g.player.airborne=true;
  assert.equal(assist.frame(g),null);
  g.player.airborne=false;g.state='paused';
  assert.equal(assist.frame(g),null);
  g.state='race';g.player.finished=true;
  assert.equal(assist.frame(g),null);
  g.player.finished=false;delete g.resetPlayer;
  assert.equal(assist.frame(g),null);
});

test('地形导向只在真正要过弯时提示左右，不占用驾驶按钮',()=>{
  let curvature=.018;
  const car={d:200,s:43,wrongWay:0,airborne:false,finished:false};
  const g={state:'race',player:car,track:{length:2400,curvAhead(){return curvature;}},itemMode:false};
  assert.match(roadHint(g),/左急弯/);
  curvature=-.02;assert.match(roadHint(g),/右急弯/);
  curvature=.004;assert.equal(roadHint(g),'');
  car.wrongWay=2;curvature=.03;assert.equal(roadHint(g),'');
  car.wrongWay=0;g.state='paused';assert.equal(roadHint(g),'');
});
test('道具路线提醒只说左右车道，不伪称随机道具已确定',()=>{
  const car={d:190,s:35,wrongWay:0,airborne:false,finished:false};
  const g={state:'race',player:car,track:{length:2500,curvAhead(){return 0;}},itemMode:true,
    items:{boxes:[{}]}};
  const hint=roadHint(g);
  assert.match(hint,/左右选择车道/);
  assert.ok(!/导弹|护盾|氮气/.test(hint));
  car.d=280;assert.equal(roadHint(g),'');
  g.itemMode=false;car.d=190;assert.equal(roadHint(g),'');
});


test('四图原生加速带不增加数量，偏移到合法左右车道形成真实路线抉择',()=>{
  const original=Object.entries(PAD_LANES).map(([id,pads])=>({
    id,track:{boostPads:pads.map(p=>({at:[...p.at]}))}
  }));
  assert.equal(applyLaneDesign(original),4);
  assert.equal(applyLaneDesign(original),4,'repeat build must be idempotent');
  for(const map of original) {
    const expected=PAD_LANES[map.id];
    assert.equal(map.track.boostPads.length,expected.length);
    assert.deepEqual(map.track.boostPads.map(p=>p.lat),expected.map(p=>p.lat));
    if(map.id!=='egypt')assert.ok(map.track.boostPads.some(p=>p.lat>0));
    assert.ok(map.track.boostPads.some(p=>p.lat<0));
  }
  const tampered=Object.entries(PAD_LANES).map(([id,pads])=>({
    id,track:{boostPads:pads.map(p=>({at:[...p.at]}))}
  }));
  tampered[0].track.boostPads[0].at[0]+=50;
  assert.throws(()=>applyLaneDesign(tampered),/anchor changed/);
  assert.throws(()=>applyLaneDesign([]),/list changed/);
});
test('左右加速带提示依照原生横向坐标，避免把右边说成左边',()=>{
  const p={d:0,s:28,wrongWay:0,airborne:false,finished:false};
  const g={state:'race',player:p,itemMode:false,track:{
    length:1000,curvAhead(){return 0;},
    boostPads:[{d:52,lat:5}],
  }};
  assert.match(roadHint(g),/左侧有加速带/);
  g.track.boostPads=[{d:63,lat:-5}];assert.match(roadHint(g),/右侧有加速带/);
  g.track.boostPads=[{d:300,lat:-5}];assert.equal(roadHint(g),'');
  g.track.boostPads=[{d:63,lat:0}];assert.equal(roadHint(g),'');
});


test('双键贴护栏持续无进展：先警告、6秒后原生脱困，不瞬移或改圈数',()=>{
  const g=game(),assist=new WrongWayRecovery();
  g.player.progress=980;g.player.lat=9;g.player.s=4;
  g.player.lapsDone=1;g.player.owed=true;g.player.half=true;
  g.raceTime=4;assert.equal(assist.frame(g),null);
  g.raceTime=7.6;assert.equal(assist.frame(g),'stuck-warning');
  g.raceTime=9;assert.equal(assist.frame(g),null,'only warn once');
  g.raceTime=10.1;assert.equal(assist.frame(g),'stuck-recovered');
  assert.equal(g.resetCount,1);
  assert.equal(g.player.progress,980);assert.equal(g.player.lapsDone,1);
  assert.equal(g.player.owed,true);assert.equal(g.player.half,true);
  g.raceTime=11;assert.equal(assist.frame(g),null,'cooldown blocks a second rescue');
});
test('正常通过慢弯或恢复前进时，不得错误判定被困',()=>{
  const g=game(),assist=new WrongWayRecovery();
  g.player.progress=100;g.player.s=3;g.raceTime=4;
  assert.equal(assist.frame(g),null);
  for(const [time,progress] of [[6,108],[8,119],[10,132],[13,145],[16,160]]){
    g.raceTime=time;g.player.progress=progress;
    assert.equal(assist.frame(g),null,'forward road progress resets stall timer');
  }
  assert.equal(g.resetCount,0);
});
