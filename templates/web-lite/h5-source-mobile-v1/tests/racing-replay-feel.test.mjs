/* global structuredClone */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as driver from '../racing/driver.mjs';
import * as presentation from '../racing/presentation.mjs';
const player={drifting:true,driftTime:.3,s:40,smallWindow:0,windowKind:'drift',smallBoost:0,nitroCount:0,nitroTime:0,items:[]};
test('keyboard W just before a clean drift end survives until one physical step, not a render-only frame',()=>{
  assert.equal(typeof driver.bufferKeyboardSpray,'function');
  const actions=new driver.TouchActions(),raw={wPressed:true,up:true,steerAxis:-.8};
  const frame=(p,at,canStep=true,pressed=false)=>driver.bufferKeyboardSpray({...raw,wPressed:pressed},p,actions,{state:'race',now:at,canStep});
  assert.equal(frame(player,1,true,true).wPressed,false);
  const released={...player,drifting:false,smallWindow:.5};
  assert.equal(frame(released,1.14,false).wPressed,false);
  const output=frame(released,1.15);
  assert.equal(output.wPressed,true);assert.equal(output.steerAxis,-.8);assert.equal(output.up,true);
  assert.equal(frame(released,1.16).wPressed,false);
});
test('keyboard buffer expires and clears on pause; never fabricates a small boost or changes player state',()=>{
  assert.equal(typeof driver.bufferKeyboardSpray,'function');
  for(const state of ['race','paused']){
    const actions=new driver.TouchActions(),before=structuredClone(player);
    driver.bufferKeyboardSpray({wPressed:true},player,actions,{state:'race',now:1,canStep:true});
    const result=driver.bufferKeyboardSpray({wPressed:false},{...player,drifting:false,smallWindow:.5},actions,{state,now:1.3,canStep:true});
    assert.equal(result.wPressed,false);assert.deepEqual(player,before);
    assert.equal(actions.pending.size,0);
  }
});
test('small-spray button previews native clean-drift eligibility and counts down the actual window',()=>{
  const charging=presentation.raceActionView({...player,driftTime:.11}).small;
  assert.equal(charging.phase,'charging');assert.equal(charging.progress,.5);assert.equal(charging.ready,false);
  const armed=presentation.raceActionView(player).small;
  assert.equal(armed.phase,'armed');assert.equal(armed.progress,1);assert.equal(armed.ready,false);
  const ready=presentation.raceActionView({...player,drifting:false,smallWindow:.25}).small;
  assert.equal(ready.phase,'ready');assert.equal(ready.progress,.5);assert.equal(ready.ready,true);
  const landed=presentation.raceActionView({...player,drifting:false,smallWindow:.225,windowKind:'land'}).small;
  assert.equal(landed.progress,.5);
  const impact=presentation.raceActionView({...player,drifting:false,smallWindow:0}).small;
  assert.equal(impact.phase,'idle');assert.equal(impact.progress,0);
});
test('ready audio is a short native-mixer cue only for an earned clean drift, not collision or a tap',()=>{
  assert.equal(typeof presentation.playDriftReleaseCue,'function');
  const tones=[],audio={tone(...args){tones.push(args);}};
  for(const event of [{type:'driftStart',data:{}},{type:'driftEnd',data:{clean:false,time:1}},{type:'driftEnd',data:{clean:true,time:.2}}])presentation.playDriftReleaseCue(audio,event);
  assert.equal(tones.length,0);
  presentation.playDriftReleaseCue(audio,{type:'driftEnd',data:{clean:true,time:.3}});
  assert.equal(tones.length,2);assert.ok(tones.every(t=>t[1]<=.12&&t[3]<=.1));
});
