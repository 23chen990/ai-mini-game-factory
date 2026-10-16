import test from 'node:test';
import assert from 'node:assert/strict';
import {newRun} from './adventure.mjs';
import {rewardExitWarning} from './safety.mjs';

test('earned jump gold warns of the actual subsequent oncoming car, not fabricated deaths',()=>{
 const run=newRun(1);
 run.distance=148;run.laneIndex=1;
 assert.match(rewardExitWarning(run),/前方来车.*换到空车道/);
 run.laneIndex=0;
 assert.equal(rewardExitWarning(run),null,'safe adjacent lane must not inherit the center vehicle warning');
 run.laneIndex=1;run.distance=5;
 assert.equal(rewardExitWarning(run),null,'distant traffic is not an immediate reward-exit hazard');
});
test('reward warning has no side effects and ignores already passed vehicles',()=>{
 const run=newRun(1);run.distance=148;run.laneIndex=1;
 const snapshot=JSON.stringify(run.obstacles);
 assert.ok(rewardExitWarning(run));
 assert.equal(JSON.stringify(run.obstacles),snapshot);
 for(const vehicle of run.obstacles.filter(o=>['car','van'].includes(o.kind)))vehicle.passed=true;
 assert.equal(rewardExitWarning(run),null);
 assert.equal(rewardExitWarning(null),null);
});
