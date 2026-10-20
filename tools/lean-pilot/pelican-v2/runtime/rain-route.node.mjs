import test from 'node:test';
import assert from 'node:assert/strict';
import {newRun,input,advance,steerTo} from './adventure.mjs';
import {makeLevel,validateLevel} from './levels.mjs';
import {rateStars} from './engagement.mjs';

test('rain rewards follow the actual jump approach, landing and final exit',()=>{
 const level=makeLevel(4);
 assert.deepEqual([335,367,607].map(x=>level.fish.find(f=>f.x===x).lane),[1,1,2]);
 assert.deepEqual(validateLevel(level),[]);
});

test('observed rain inputs can earn unchanged three-star rules without air bonuses',()=>{
 // Attempt-2 Chromium risk trace, rounded to millimetres. Last old left exit
 // is intentionally omitted: the corrected visible fish continues RIGHT.
 // Engineering input replay only; natural browser QA remains mandatory.
 const actions=[[5.213,-1.18],[39.94,0],[60.03,1.18],[89.923,0],
  [150.726,1.18],[201.404,0],[216.965,'jump'],[342.164,'jump'],
  [406.871,1.18],[446.659,0],[462.217,-1.18],[555.374,0],
  [557.137,1.18],[584.585,'jump']];
 const run=newRun(4);let next=0;
 for(let frame=0;frame<5000&&run.phase==='running';frame++){
  while(next<actions.length&&run.distance>=actions[next][0]){
   const [,action]=actions[next++];
   if(action==='jump')input(run,action);else steerTo(run,action);
  }
  advance(run,1/60);
 }
 assert.equal(run.reason,'complete');
 assert.equal(run.hits,0);
 assert.equal(run.airCatches,0);
 assert.equal(run.jumpedBarriers,3);
 assert.ok(run.count>=28);
 assert.equal(rateStars(run.level,run),3);
});

test('crossing-level fish guide the early safe exit rather than reward a late touch',()=>{
 const level=makeLevel(2);
 assert.equal(level.fish.find(f=>f.id==='l2-f4').lane,0);
 assert.deepEqual(validateLevel(level),[]);
 const actions=[[4.272,-1.18],[37.128,0],[64,-1.18],[113.032,0],
  [143.056,-1.18],[199.536,0],[238.504,'jump'],[255.336,1.18],
  [315.472,0],[334.32,-1.18],[348.272,'jump']];
 const run=newRun(2);let next=0;
 for(let frame=0;frame<5000&&run.phase==='running';frame++){
  while(next<actions.length&&run.distance>=actions[next][0]){
   const [,action]=actions[next++];
   if(action==='jump')input(run,action);else steerTo(run,action);
  }
  advance(run,1/60);
 }
 assert.equal(run.reason,'complete');assert.equal(run.hits,0);
 assert.equal(run.jumpedBarriers,2);assert.ok(run.count>=17);
 assert.equal(rateStars(run.level,run),3);
});
