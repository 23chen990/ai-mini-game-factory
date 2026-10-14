import test from 'node:test';
import assert from 'node:assert/strict';
import {springLane,riderFeel,cameraTarget} from './feel.mjs';
import {unsafeFishLanes, hazardForecast, pedestrianZAtArrival, LANES} from './safety.mjs';
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
console.log('Pelican feel/safety spec loaded');