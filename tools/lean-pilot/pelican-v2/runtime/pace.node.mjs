import test from 'node:test';
import assert from 'node:assert/strict';
import {coastBeat} from './engagement.mjs';
import {newRun} from './adventure.mjs';
test('first level visibly progresses from teaching to optional jump, traffic and final surge',()=>{
 const r=newRun(1),beats=[];
 for(const distance of [0,60,105,205,285]){r.distance=distance;beats.push(coastBeat(r));}
 assert.deepEqual(beats.map(b=>b.id),['teaching','jump-choice','traffic','climax','finish']);
 assert.equal(new Set(beats.map(b=>b.label)).size,5);
 assert.ok(beats.every(b=>b.icon&&b.label.length<12));
 r.distance=205;r.phase='paused';assert.equal(coastBeat(r).id,'climax');
 assert.deepEqual(newRun(2).level.obstacles,newRun(2).obstacles.map(({id,x,kind,lane,speed})=>({id,x,kind,lane,speed})));
});
test('revive protection has priority and exposes a bounded visible countdown',()=>{
 const r=newRun(1);r.distance=220;r.reviveGrace=2.5;
 assert.equal(coastBeat(r).id,'protected');assert.match(coastBeat(r).label,/3/);
 r.reviveGrace=.01;assert.match(coastBeat(r).label,/1/);
 r.reviveGrace=0;assert.equal(coastBeat(r).id,'climax');
});
