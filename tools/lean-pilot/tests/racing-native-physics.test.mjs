/* global process */
// Native physics on the exact built pinned game. No AI driving or synthetic win is
// counted as real-player validation. The previous two-key auto driver is deleted.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ManualRaceDriver, TouchActions } from '../../../templates/web-lite/h5-source-mobile-v1/racing/driver.mjs';

const project=process.env.RACE_NATIVE_PROJECT;
const load=async name=>import(pathToFileURL(path.join(project,'src',name)).href);
let PlayerCar,Track,LAYOUTS;
if(project){
  ({PlayerCar}=await load('vehicle.js'));
  ({Track}=await load('track.js'));
  ({LAYOUTS}=await load('layouts.js'));
}
const fixture=()=>{
  const track=new Track(LAYOUTS.city),p=new PlayerCar(track,{},'native-manual-input-fixture');
  p.s=32;
  const actions=new TouchActions(),driver=new ManualRaceDriver(actions);
  // Avoid the one-time starting throttle boost consuming a later drift spray.
  driver.frame({steerAxis:0},p,'race',{track,canStep:true});
  return {track,p,actions,driver,events:[],time:0};
};
const step=(f,{itemMode=false,dt=1/120}={})=>{
  const inp=f.driver.frame({steerAxis:0},f.p,'race',{
    track:f.track,itemMode,canStep:true,now:f.time,
  });
  f.p.update(dt,inp,true,itemMode);
  f.time+=dt;
  f.events.push(...f.p.events);f.p.events.length=0;
  return inp;
};
test('manual small spray emits exactly one real boost only after player presses', {skip:!project},()=>{
  const f=fixture(),p=f.p;
  Object.assign(p,{drifting:true,driftDir:1,driftTime:.6});
  p.endDrift(true);
  assert.equal(p.smallWindow>0,true);
  for(let i=0;i<4;i++)step(f);
  assert.equal(f.events.filter(e=>e.type==='smallBoost').length,0,
    'no automatic perfect spray after drift');
  f.actions.press(1,'small',f.time);f.actions.release(1);
  const pressed=step(f);
  assert.equal(pressed.wPressed,true);
  for(let i=0;i<8;i++)step(f);
  assert.equal(f.events.filter(e=>e.type==='smallBoost').length,1);
  assert.equal(p.smallWindow,0);
  assert.ok(p.smallBoost>0);
});
test('late manual spray respects native non-perfect window, no free upgrade', {skip:!project},()=>{
  const f=fixture(),p=f.p;
  Object.assign(p,{drifting:true,driftDir:1,driftTime:.6});
  p.endDrift(true);
  // Advance the actual native physics well past the 0.2-second perfect threshold.
  for(let i=0;i<36;i++)step(f);
  assert.equal(f.events.filter(e=>e.type==='smallBoost').length,0);
  assert.ok(p.smallWindow>0,'native short boost window still open');
  f.actions.press(2,'small',f.time);f.actions.release(2);
  step(f);
  const boosts=f.events.filter(e=>e.type==='smallBoost');
  assert.equal(boosts.length,1);
  assert.equal(boosts[0].data.perfect,false);
});
test('earned nitro stock decreases once, 144Hz input does not repeat 120Hz physics edge', {skip:!project},()=>{
  const f=fixture();f.p.reset(120,0);f.p.s=32;f.p.nitroCount=1;
  const dt=1/144,STEP=1/120;
  let acc=0;f.actions.press(3,'nitro',0);f.actions.release(3);
  for(let frame=0;frame<144;frame++){
    const input=f.driver.frame({steerAxis:0},f.p,'race',{
      track:f.track,canStep:acc+dt>=STEP,now:frame*dt,
    });
    acc+=dt;let first=true;
    while(acc>=STEP){
      acc-=STEP;
      f.p.update(STEP,first?input:{...input,upPressed:false,wPressed:false,
        nitroPressed:false,manualNitroPressed:false},true,false);
      first=false;
    }
    f.events.push(...f.p.events);f.p.events.length=0;
  }
  assert.equal(f.events.filter(e=>e.type==='nitro').length,1);
  assert.equal(f.p.nitroCount,0);
  assert.ok(f.p.nitroTime>1.5);
});
test('item race consumes earned nitro via independent manual edge, item tap is not auto-use', {skip:!project},()=>{
  const f=fixture();f.p.reset(120,0);f.p.s=32;f.p.nitroCount=1;
  for(let i=0;i<10;i++){
    const noTap=step(f,{itemMode:true});
    assert.equal(noTap.nitroPressed,false);
    assert.equal(noTap.manualNitroPressed,false);
  }
  f.actions.press(4,'nitro',f.time);f.actions.release(4);
  const booster=step(f,{itemMode:true});
  assert.equal(booster.nitroPressed,false);
  assert.equal(booster.manualNitroPressed,true);
  assert.equal(f.p.nitroCount,0);
  assert.equal(f.events.filter(e=>e.type==='nitro').length,1);
  f.actions.press(5,'item',f.time);f.actions.release(5);
  const item=step(f,{itemMode:true});
  assert.equal(item.nitroPressed,true);
  assert.equal(item.manualNitroPressed,false);
  assert.equal(f.events.filter(e=>e.type==='nitro').length,1,
    'item button cannot silently grant a second earned nitro');
});
