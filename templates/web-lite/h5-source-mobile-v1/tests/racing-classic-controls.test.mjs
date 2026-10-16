import test from 'node:test';
import assert from 'node:assert/strict';
import { TouchSteering, TouchActions, ManualRaceDriver } from '../racing/driver.mjs';
import { patchCounterSteer, patchItemModeNitro, patchManualNitroEdge } from '../../../../tools/lean-pilot/racing-mobile-build.mjs';

const car = () => ({finished:false,nitroCount:1,items:['shield']});
test('opposite thumb overrides, and sliding a captured thumb changes direction',()=>{
  const p=new TouchSteering();
  p.press(1,'left',0);p.press(2,'right',8);
  assert.deepEqual(p.snapshot(9),{left:false,right:true});
  p.release(2,90);
  assert.deepEqual(p.snapshot(91),{left:true,right:false});
  assert.equal(p.move(1,'right'),true);
  assert.deepEqual(p.snapshot(92),{left:false,right:true});
});
test('drift hold and small spray do not share input; short taps survive release',()=>{
  const actions=new TouchActions(),driver=new ManualRaceDriver(actions),p=car();
  actions.press(1,'drift');
  const start=driver.frame({left:true,right:false},p,'race');
  assert.equal(start.shift,true);assert.equal(start.wPressed,false);
  actions.press(2,'small');actions.release(2);
  assert.equal(driver.frame({left:false,right:true},p,'race',{canStep:false}).wPressed,false);
  const exit=driver.frame({left:false,right:true},p,'race');
  assert.equal(exit.shift,true);assert.equal(exit.right,true);assert.equal(exit.wPressed,true);
  assert.equal(driver.frame({},p,'race').wPressed,false);
  actions.release(1);assert.equal(driver.frame({},p,'race').shift,false);
});
test('race and item boosts are separate edges, cancel and pause clear touch',()=>{
  const actions=new TouchActions(),driver=new ManualRaceDriver(actions),p=car();
  actions.press(1,'nitro');actions.release(1);
  const item=driver.frame({},p,'race',{itemMode:true});
  assert.equal(item.nitroPressed,false);assert.equal(item.manualNitroPressed,true);
  assert.equal(driver.frame({},p,'race',{itemMode:true}).manualNitroPressed,false);
  actions.press(2,'item');actions.release(2);
  assert.equal(driver.frame({},p,'race',{itemMode:true}).nitroPressed,true);
  actions.press(3,'nitro');actions.cancel(3);
  assert.equal(driver.frame({},p,'race',{itemMode:true}).manualNitroPressed,false);
  actions.press(4,'drift');driver.frame({},p,'paused');
  assert.equal(driver.frame({},p,'race').shift,false);
});
test('native patch rejects unknown pinned vehicle, preserves physical yaw and does not duplicate transforms',()=>{
  const yaw='const yaw = held ? T.driftYaw + T.driftYawAlign * align : (0.45 + 0.9 * align) * Math.exp(-2.2 * this.releaseTime);';
  const vehicle='this.driftDir * yaw;\n'+yaw+'\nconst held = inp.shift;\nif ((!held && (Math.abs(a) < 0.1 || (align < 0 && Math.abs(a) < 0.26))) || this.s < 7) this.endDrift(this.s >= 7);\nif (inp.nitroPressed && !itemMode) this.triggerNitro();\nif (!itemMode && onGround) {';
  const counter=patchCounterSteer(vehicle);
  assert.match(counter,/align < -0\.08 \? -T\.driftYawAlign/);
  assert.equal(patchCounterSteer(counter),counter);
  const both=patchItemModeNitro(counter);
  assert.match(both,/inp.manualNitroPressed && itemMode/);
  assert.match(both,/if \(onGround\)/);
  assert.equal(patchItemModeNitro(both),both);
  assert.throws(()=>patchCounterSteer('unknown'),/anchor changed/);
  assert.throws(()=>patchItemModeNitro('unknown'),/anchor changed/);
});
test('item mode special nitro edge is consumed only by first native physics step',()=>{
  const src='const noEdge = { ...pin, upPressed: false, wPressed: false, nitroPressed: false };';
  const out=patchManualNitroEdge(src);
  assert.match(out,/manualNitroPressed: false/);
  assert.equal(patchManualNitroEdge(out),out);
  assert.throws(()=>patchManualNitroEdge('bad'),/anchor changed/);
});
