import test from 'node:test';
import assert from 'node:assert/strict';
import {
  V10_DRIVE_TUNE,v10SteerDamping,v10DriftYaw,v10MobileCameraPreset,
  v10MobileCameraYaw,v10MobileFov,v10TrackFacingLook
} from '../racing/v10-driving-feel.mjs';
const T={driftYaw:1.5,driftYawAlign:.85};
test('opposite wheel input commands faster actual wheel reversal without auto steering',()=>{
  assert.ok(v10SteerDamping(.8,-.85)>v10SteerDamping(.4,.85));
  assert.ok(v10SteerDamping(-.8,.85)>v10SteerDamping(-.4,-.85));
  assert.ok(v10SteerDamping(.4,0)>v10SteerDamping(.4,.8));
  assert.ok(V10_DRIVE_TUNE.mobileHighSpeedTurnRetention>.45);
  assert.throws(()=>v10SteerDamping(0,Infinity),/Non-finite/);
});
test('countersteering REALLY reverses drift yaw in both symmetric directions',()=>{
  const left=v10DriftYaw(-1,true,0,T),right=v10DriftYaw(1,true,0,T);
  assert.ok(left<-.9,'opposite lock must pull back');
  assert.ok(right>0.9,'held-in drift continues yaw');
  assert.equal(v10DriftYaw(-.7,true,0,T),v10DriftYaw(-.7,true,3,T));
  assert.ok(Math.abs(v10DriftYaw(-.7,false,.7,T))<Math.abs(v10DriftYaw(-.7,false,0,T)));
  assert.ok(v10DriftYaw(-.85,false,.15,T)<0,'drift release + opposite wheel still corrects');
  assert.throws(()=>v10DriftYaw(NaN,true,0,T),/Invalid drift/);
});
test('phone camera enlarges car, looks into upcoming bends, and tilts only subtly',()=>{
  const stand=v10MobileCameraPreset(0,false,0);
  const fast=v10MobileCameraPreset(60,false,0);
  const drift=v10MobileCameraPreset(60,true,.8);
  assert.ok(stand.dist<10&&stand.h<3.6,'12.5m high V9 camera must go');
  assert.ok(fast.look>stand.look);
  assert.ok(drift.look>fast.look,'drift must reveal exit');
  assert.ok(drift.roll>0&&drift.roll<=.048,'avoid motion sickness');
  assert.ok(Math.abs(v10MobileCameraYaw(.7,0,true,42))>
    Math.abs(v10MobileCameraYaw(.7,0,false,42)));
  assert.equal(v10MobileCameraYaw(-1,0,false,-2),-1);
});
test('handset speed response does not shrink the car into a wide-angle spectator shot',()=>{
  const low=v10MobileFov(0,false,false);
  assert.ok(low>=63&&low<=65);
  assert.ok(v10MobileFov(55,false,false)-low>3);
  assert.ok(v10MobileFov(65,true,false)<=70);
  assert.ok(v10MobileFov(90,true,true)<=V10_DRIVE_TUNE.maxCameraFov);
});
test('apex lookahead comes only from physical native path, never an assisted steering command',()=>{
  const trace=[];
  const track={sample(d){trace.push(d);return {x:d,y:5,z:3}}};
  const p={s:50,d:100,progress:100};
  assert.deepEqual(v10TrackFacingLook(p,track),{x:154,y:5,z:3,available:true});
  assert.equal(trace[0],154);
  assert.equal(v10TrackFacingLook(p,null).available,false);
});
