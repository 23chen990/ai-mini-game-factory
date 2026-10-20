import test from 'node:test';
import assert from 'node:assert/strict';
import * as safety from './safety.mjs';
test('distant traffic is visibly upcoming, not an already closed lane; imminent traffic remains red',()=>{
 assert.equal(typeof safety.hazardUrgency,'function');
 for(const kind of ['car','van','pedestrian']){
  assert.equal(safety.hazardUrgency({obstacle:{kind},seconds:4}),'warning');
  assert.equal(safety.hazardUrgency({obstacle:{kind},seconds:2}),'danger');
 }
 assert.equal(safety.hazardUrgency({obstacle:{kind:'barrier'},seconds:4}),'danger');
});
test('night opening has a physically reachable amber centre exit instead of three simultaneous red walls',()=>{
 assert.equal(typeof safety.hazardUrgency,'function');
 const forecasts=[
  {obstacle:{kind:'car'},seconds:2.5},
  {obstacle:{kind:'car'},seconds:4},
  {obstacle:{kind:'van'},seconds:1},
 ];
 assert.deepEqual(forecasts.map(safety.hazardUrgency),['danger','warning','danger']);
});
