import test from 'node:test';
import assert from 'node:assert/strict';
import * as feel from './feel.mjs';
import {newRun,advance} from './adventure.mjs';
test('render frames below20fps do not silently halve the gameplay clock',()=>{
 assert.equal(typeof feel.frameDelta,'function');
 for(const fps of [10,15,30,60,120]){const r=newRun(1);for(let n=0;n<fps*4;n++)advance(r,feel.frameDelta(1/fps));assert.ok(Math.abs(r.elapsed-4)<1e-8,`${fps}FPS elapsed ${r.elapsed}`);assert.ok(Math.abs(r.distance-r.level.speed*4)<1e-8);}
});
test('long suspension and invalid delta stay bounded; pause never catches up offscreen',()=>{
 assert.equal(typeof feel.frameDelta,'function');assert.equal(feel.frameDelta(8),.25);for(const dt of [NaN,Infinity,-1])assert.equal(feel.frameDelta(dt),0);const r=newRun(1);r.phase='paused';advance(r,feel.frameDelta(8));assert.equal(r.elapsed,0);
});
