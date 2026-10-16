import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK_RESHAPES, applyTrackDesign } from '../racing/track-design.mjs';
import { WrongWayRecovery } from '../racing/recovery.mjs';
import { roadHint } from '../racing/road-coach.mjs';
import { chooseCornerSigns, installCornerSigns, disposeCornerSigns } from '../racing/corner-signs.mjs';
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
  assert.deepEqual(counts,{city:35,aegean:31,egypt:30,snow:25});
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
test('desert technical pass adds two independently anchored chicanes without touching original jump heights',()=>{
  const desert=TRACK_RESHAPES.egypt;
  assert.equal(desert.width,22);
  assert.equal(desert.cuts.length,4);
  assert.deepEqual(desert.cuts.map(c=>[c.start,c.end]),[[18,21],[15,17],[11,13],[7,10]]);
  const jump=desert.cuts.find(c=>c.start===7);
  assert.deepEqual(jump.first,[-30,215,0]);
  const input=fixture();
  assert.equal(input.egypt.points[2][2],0,'unpatched fixture stays independent');
  applyTrackDesign(input);
  assert.equal(input.egypt.points.length,30);
  assert.ok(input.egypt.points.some(p=>p[0]===65 && p[1]===388));
  assert.ok(input.egypt.points.some(p=>p[0]===275 && p[1]===-167));
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

test('V3.3 uses nonoverlapping descending native index cuts, preserves all four original anchors',()=>{
  for(const [key,plan] of Object.entries(TRACK_RESHAPES)){
    let prior=Infinity;
    for(const cut of plan.cuts){
      assert.ok(Number.isInteger(cut.start)&&cut.start>=0&&cut.end<plan.expected);
      assert.ok(cut.start<=cut.end&&cut.end<prior,key+' overlapping cuts');
      assert.ok(cut.points.length>=2);
      assert.ok(cut.points.every(p=>p.length===3&&p.every(Number.isFinite)));
      assert.ok(cut.first.length===3&&cut.last.length===3);
      prior=cut.start;
    }
  }
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



test('道具车道提示使用真实仍可拾取的原生盒子坐标，不看随机道具内容',()=>{
  const player={d:190,s:37,lat:4.5,wrongWay:0,airborne:false,finished:false};
  const left={x:-6,z:0,respawn:0,g:{visible:true}};
  const right={x:6,z:0,respawn:0,g:{visible:true}};
  const game={state:'race',player,itemMode:true,items:{boxes:[left,right]},
    track:{length:2500,halfW:12,curvAhead:()=>0,
      sample:()=>({x:0,z:0,tx:0,tz:1,rx:-1,rz:0})}};
  assert.match(roadHint(game),/左侧可拾取随机道具/);
  player.lat=-4.5;assert.match(roadHint(game),/右侧可拾取随机道具/);
  right.respawn=3;assert.match(roadHint(game),/左侧可拾取随机道具/);
  left.g.visible=false;assert.equal(roadHint(game),'','respawning or hidden boxes cannot be promised');
  left.g.visible=true;left.respawn=0;player.lat=4.5;
  game.track.curvAhead=()=>.03;assert.match(roadHint(game),/左急弯/,'dangerous curve always takes priority');
  game.track.curvAhead=()=>0;game.state='paused';assert.equal(roadHint(game),'');
  game.state='race';player.items=['nitro','shield'];
  assert.equal(roadHint(game),'','full item slots should not falsely promise a collectible');
  player.items=[];
  assert.equal(left.respawn,0,'read-only hint cannot change pickup availability');
  assert.equal(game.items.boxes.length,2,'hint must never spawn or grant items');
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


test('四张地图的路边转向标识采用曲率热点，每圈不超过7个且互不扎堆',()=>{
  const curv=new Float32Array(1500);
  for(const i of [160,320,480,640,800,960,1120,1280])curv[i]=i%320===0?-.028:.031;
  const track={curv,N:curv.length,ds:1.5,length:2250};
  const turns=chooseCornerSigns(track);
  assert.equal(turns.length,7);
  assert.ok(turns.every(s=>s.d>=170&&s.d<=track.length-140));
  assert.ok(turns.every((s,i)=>i===0||s.d-turns[i-1].d>=180));
  assert.ok(turns.some(s=>s.curve<0)&&turns.some(s=>s.curve>0));
  assert.deepEqual(chooseCornerSigns(null),[]);
});
test('弯道牌只建轻量 Sprite，换图时会释放图标材质/贴图而不修改物理',()=>{
  const tracker={texture:0,material:0,removed:0};
  const canvasContext={beginPath(){},roundRect(){},fill(){},stroke(){},save(){},restore(){},
    translate(){},scale(){},moveTo(){},lineTo(){},quadraticCurveTo(){},closePath(){}};
  const fakeDocument={createElement:()=>({getContext:()=>canvasContext})};
  const makeVec=()=>({set(x,y,z){this.value=[x,y,z];}});
  const THREE={
    SRGBColorSpace:'srgb',
    CanvasTexture:class {dispose(){tracker.texture++;}},
    SpriteMaterial:class {constructor(options){this.map=options.map;}dispose(){tracker.material++;}},
    Sprite:class {constructor(mat){this.material=mat;this.position=makeVec();this.scale=makeVec();this.parent=null;}},
  };
  const curv=new Float32Array(1400);for(const i of [160,320,480,640,800,960])curv[i]=.022;
  const level={objects:[],add(s){this.objects.push(s);s.parent=this;},
    remove(s){this.objects=this.objects.filter(x=>x!==s);s.parent=null;tracker.removed++;}};
  const track={curv,N:1400,ds:1.5,length:2100,halfW:11,
    sample(d){return{x:d,y:0,z:d,rx:-1,rz:0};}};
  const game={track,level};
  const a=installCornerSigns(game,THREE,fakeDocument);
  assert.equal(a,6);assert.equal(level.objects.length,6);
  assert.ok(level.objects.every(s=>s.position.value.length===3));
  const b=installCornerSigns(game,THREE,fakeDocument);
  assert.equal(b,6);assert.equal(level.objects.length,6);
  assert.equal(tracker.texture,2,'replace road signs frees old shared atlas textures');
  disposeCornerSigns(game);
  assert.equal(tracker.texture,4);assert.equal(tracker.material,4);
  assert.equal(level.objects.length,0);
});
