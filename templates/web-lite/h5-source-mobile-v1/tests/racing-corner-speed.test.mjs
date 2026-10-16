/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import { speedForCurvature, cornerSpeedIntent } from '../racing/corner-speed.mjs';
import { RaceDriver } from '../racing/driver.mjs';
const car = patch => ({s:52,d:130,hint:2,h:0,proj:{hd:0},steer:0,lat:0,
  drifting:false,airborne:false,spin:0,wrongWay:0,impact:0,slowTime:0,
  nitroCount:0,nitroTime:0,smallWindow:0,windowKind:'',
  stats:{crash:0},...patch});
const road = bend => ({curv:[0,0,0],hd:[0,0,0],halfW:11.5,
  curvAhead:()=>bend,sample:()=>({hd:0,i:2})});
test('straight and wide bends retain normal touch auto-throttle',()=>{
  for(const c of [0,.005,.017]) assert.equal(cornerSpeedIntent(car(),road(c)),null);
  assert.equal(speedForCurvature(.003),55);
});
test('dangerous bends select native brake then coast without any player mutation',()=>{
  const p=car(),tr=road(.035),before=structuredClone(p);
  assert.equal(cornerSpeedIntent(p,tr),'brake');
  assert.deepEqual(p,before);
  assert.equal(cornerSpeedIntent(car({s:39}),tr),'coast');
  assert.equal(cornerSpeedIntent(car({s:34}),tr),null);
});
test('greater curvature leads to lower target speed, never automatic reverse',()=>{
  assert.ok(speedForCurvature(.02)>speedForCurvature(.03));
  assert.ok(speedForCurvature(.03)>speedForCurvature(.05));
  assert.ok(speedForCurvature(.06)>=27);
  assert.equal(cornerSpeedIntent(car({s:32}),road(.06)),'coast');
});
test('brake intent never overrides rescue, spin, drift, collision recovery or airborne state',()=>{
  for(const p of [car({airborne:true}),car({spin:1}),car({drifting:true}),
    car({wrongWay:1}),car({impact:6}),car({s:12})])
    assert.equal(cornerSpeedIntent(p,road(.08)),null);
});
test('missing or invalid native geometry cannot invent a brake command',()=>{
  assert.equal(cornerSpeedIntent(car(),{}),null);
  assert.equal(cornerSpeedIntent(car({s:NaN}),road(.1)),null);
  assert.equal(cornerSpeedIntent(car(),road(NaN)),null);
});
test('actual two-key driver translates only throttle/brake; never edits player physics or steering',()=>{
  const d=new RaceDriver(),p=car({s:52,progress:380}),tr=road(.04);
  const snapshot=structuredClone(p);
  const first=d.frame(.016,{left:true,right:false},p,tr,'race');
  assert.equal(first.left,true);assert.equal(first.right,false);
  assert.equal(first.up,false);assert.equal(first.down,true);
  assert.equal(first.shift,false);
  assert.deepEqual(p,snapshot);
  p.s=35;const second=d.frame(.016,{left:false,right:false},p,tr,'race');
  assert.equal(second.up,false);assert.equal(second.down,false);
  p.s=28;const third=d.frame(.016,{left:false,right:false},p,tr,'race');
  assert.equal(third.up,true);assert.equal(third.down,false);
  d.frame(.016,{},p,tr,'paused');
  assert.equal(d.cornerSpeed,null);
});
