import test from 'node:test';
import assert from 'node:assert/strict';
import {springLane,riderFeel,cameraTarget,duskRoadAmbient,DUSK_ROAD_AMBIENT} from './feel.mjs';
import {newRun,input,advance,steerTo,steerBy,FREE_ROAD_EDGE} from './adventure.mjs';
import {unsafeFishLanes, hazardForecast, pedestrianZAtArrival,pathRiskAtPosition} from './safety.mjs';
function travel(dt,events=[{at:0,target:1.7}],duration=1.1){
 const x={position:0,velocity:0,latAcc:0,lean:0,steer:0,yaw:0,elapsed:0,speed:8};
 let t=0,target=0,index=0,samples=[];
 while(t+1e-8<duration){while(index<events.length&&events[index].at<=t+1e-8){target=events[index].target;index++;}
  const h=Math.min(dt,duration-t);
  const before=x.velocity;Object.assign(x,{...springLane(x.position,x.velocity,target,h),laneV:0});
  x.laneV=x.velocity;x.elapsed+=h;riderFeel(x,before,h);t+=h;samples.push({...x,time:t});
 }
 return {x,samples};
}
test('no artificial first-frame teleport at 60Hz',()=>{const a=travel(1/60);assert.ok(a.samples[0].position<.07,`first frame ${a.samples[0].position}`);assert.ok(a.samples[0].position>0);});
test('good response and natural settle',()=>{const a=travel(1/120),at=.28;const pos=a.samples.find(s=>s.time>=at);assert.ok(pos.position>1.48);assert.ok(Math.abs(a.x.position-1.7)<.001);});
test('same continuous trajectory at 30/60/120 Hz',()=>{const a=travel(1/30),b=travel(1/60),c=travel(1/120);for(const [u,v] of [[a,b],[b,c]])assert.ok(Math.abs(u.x.position-v.x.position)<1e-6);});
test('reversing input retains bounded velocity, pose and returns to center',()=>{
 const a=travel(1/120,[{at:0,target:1.7},{at:.1,target:-1.7},{at:.25,target:0}],2);
 assert.ok(a.samples.every(s=>Number.isFinite(s.position)&&Math.abs(s.position)<=1.8));
 assert.ok(a.samples.every(s=>Math.abs(s.yaw)<=.21&&Math.abs(s.lean)<=.23&&Math.abs(s.steer)<=.26));
 assert.ok(Math.abs(a.x.position)<.004);
});
test('portrait camera follows lane without snap or alarming horizon',()=>{const a=cameraTarget(0,0,0,390/844);const b=cameraTarget(1.7,3.2,0,390/844);assert.ok(a.fov>=50&&a.fov<=54);assert.ok(Math.abs(b.position[2]-a.position[2])<1.3);assert.ok(b.look[0]>=8);assert.ok(Math.abs(b.look[2]-a.look[2])<1.3);});
test('jump camera shifts gently',()=>{const a=cameraTarget(0,0,0,.46),b=cameraTarget(0,0,1.2,.46);assert.ok(b.position[1]-a.position[1]<=.161);});
const mkPed=(x,lane)=>({kind:'pedestrian',x,lane,hit:false,passed:false,speed:0});
const mkRun=(distance,speed=7.5)=>({distance,speed,elapsed:0,level:{speed}});
test('first pedestrian ends in right lane, predicted 4s early',()=>{const o=mkPed(90,0),r=mkRun(60);const a=hazardForecast(o,r);assert.ok(a);assert.deepEqual(a.lanes,[2]);assert.ok(a.seconds>=3.9);assert.ok(Math.abs(pedestrianZAtArrival(o,r)-2.09)<.02);});
test('pedestrian coming from right ends in left lane',()=>{const o=mkPed(162,2),r=mkRun(134,8);assert.deepEqual(hazardForecast(o,r).lanes,[0]);});
test('fish routing never guides near predicted danger lane',()=>{assert.ok(unsafeFishLanes([mkPed(90,0)],79).has(2));assert.ok(!unsafeFishLanes([mkPed(90,0)],79).has(0));assert.ok(unsafeFishLanes([mkPed(162,2)],150).has(0));});
test('hazards forecast respects warning window',()=>{const o=mkPed(90,0);assert.equal(hazardForecast(o,mkRun(0)),null);assert.ok(hazardForecast(o,mkRun(65)));});
test('vehicle forecast includes closing speed',()=>{const o={kind:'car',x:100,lane:1,speed:1.7},r=mkRun(65,8.8);const v=hazardForecast(o,r);assert.ok(v);assert.equal(v.lanes[0],1);assert.ok(v.seconds<3.4);});
test('no hazard forecast after impact',()=>{const o=mkPed(90,0);o.hit=true;assert.equal(hazardForecast(o,mkRun(85)),null);});

test('original free steering is restored: real positions between lane centers persist',()=>{
 const r=newRun(1);
 assert.equal(r.laneTarget,0);
 input(r,'right');
 assert.ok(r.laneTarget>1.1&&r.laneTarget<1.3);
 for(let i=0;i<90;i++)advance(r,1/120);
 assert.ok(r.lane>.9&&r.lane<1.5);
 assert.ok(Math.abs(r.lane-1.7)>.2,'must not auto-snap to painted lane');
 assert.equal(steerTo(r,.38),true);
 for(let i=0;i<150;i++)advance(r,1/120);
 assert.ok(Math.abs(r.lane-.38)<.002);
 assert.ok(Math.abs(r.laneTarget-.38)<1e-6);
});
test('continuous steering clamps at road edges, ignores invalid input and remains stable on pause',()=>{
 const r=newRun(1);assert.equal(steerTo(r,99),true);assert.equal(r.laneTarget,FREE_ROAD_EDGE);
 advance(r,1);assert.ok(r.lane<=FREE_ROAD_EDGE);
 assert.equal(steerTo(r,Number.NaN),false);
 input(r,'pause');assert.equal(steerBy(r,-1),false);assert.equal(r.laneTarget,FREE_ROAD_EDGE);
 input(r,'resume');assert.equal(steerTo(r,-.43),true);
 advance(r,1);assert.ok(Math.abs(r.lane+.43)<.01);
});
test('continuous path genuinely avoids a car off-center and catches an authored fish',()=>{
 const r=newRun(1);
 r.obstacles=[{id:'car-free',kind:'car',x:45,lane:1,z:0,speed:1.7,hit:false,passed:false,triggerAt:null}];
 r.fishes=[{id:'fish-free',x:48,lane:2,golden:false,caught:false}];
 steerTo(r,1.27);
 for(let i=0;i<1050&&r.phase==='running';i++)advance(r,1/120);
 assert.equal(r.hits,0);assert.equal(r.phase,'running');assert.equal(r.count,1);
 assert.ok(r.events.some(e=>e.type==='near-miss'&&e.objectId==='car-free'));
});
test('actual consecutive caught fish earn a small streak reward; missed fish break it',()=>{
 const r=newRun(1);r.obstacles=[];r.fishes=[
  {id:'s1',x:15,lane:1,golden:false,caught:false},
  {id:'s2',x:31,lane:1,golden:false,caught:false},
  {id:'s3',x:47,lane:1,golden:false,caught:false},
  {id:'skip',x:63,lane:2,golden:false,caught:false}
 ];
 for(let i=0;i<780;i++)advance(r,1/120);
 assert.equal(r.count,3);assert.equal(r.bestStreak,3);assert.equal(r.score,5);
 assert.ok(r.events.some(e=>e.type==='fish-caught'&&e.streak===3&&e.comboPoints===2));
 for(let i=0;i<450;i++)advance(r,1/120);
 assert.equal(r.streak,0);assert.equal(r.bestStreak,3);
});

test('true fractional vehicle width warns between two paint lanes, not based on laneIndex',()=>{
 const bounds={car:{z:.63},van:{z:.66},barrier:{z:.59}};
 const car={seconds:2,obstacle:{kind:'car',lane:0,z:-1.7}};
 assert.equal(pathRiskAtPosition({lane:-.82,y:0,laneIndex:1},car,bounds),true);
 assert.equal(pathRiskAtPosition({lane:0,y:0,laneIndex:1},car,bounds),false);
 assert.equal(pathRiskAtPosition({lane:-1.2}, {...car,seconds:4.4},bounds),false);
 assert.equal(pathRiskAtPosition({lane:-1.2}, {...car,seconds:.1},bounds),false);
 const jump={seconds:2,obstacle:{kind:'barrier',lane:1,z:0}};
 assert.equal(pathRiskAtPosition({lane:.7,y:0},jump,bounds),true);
 assert.equal(pathRiskAtPosition({lane:.7,y:.4},jump,bounds),false);
 assert.equal(pathRiskAtPosition({lane:0},{seconds:2,obstacle:{kind:'pedestrian',lane:1,z:0}},bounds),false);
});

test('blue-hour readability fill exists only for the final dusk stage',()=>{
 for(const id of [1,2,3,4]){
  assert.equal(duskRoadAmbient({weather:id===4?'rain':'clear'}),0);
 }
 assert.ok(DUSK_ROAD_AMBIENT>.4&&DUSK_ROAD_AMBIENT<.8);
 assert.equal(duskRoadAmbient({weather:'dusk'}),DUSK_ROAD_AMBIENT);
 assert.equal(duskRoadAmbient(null),0);
});
