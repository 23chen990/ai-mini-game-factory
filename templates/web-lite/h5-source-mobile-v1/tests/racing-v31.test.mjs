import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK_RESHAPES, applyTrackDesign } from '../racing/track-design.mjs';
import { WrongWayRecovery } from '../racing/recovery.mjs';

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
