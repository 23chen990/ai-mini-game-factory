import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBarrierPrizes, fishPoints, starRequirements, rateStars, nextStarTip, normalizeBest, updateBest, allStars } from './engagement.mjs';
const level = { id: 1, distance: 300, seconds: 55, goal: {count: 8, gold: 0}, mastery: {jumps: 1}};
const run = overrides => ({level,reason:'complete',hits:0,count:12,gold:2,jumpedBarriers:1,elapsed:40,score:20,rewardScore:35,...overrides});
test('prize is real, visible and behind a jumpable obstacle, never at obstacle center',()=>{
 const obstacles=[{id:'b1',kind:'barrier',x:225,lane:1},{id:'car',kind:'car',x:280,lane:0}];
 const prizes=makeBarrierPrizes(1,obstacles,300);
 assert.equal(prizes.length,1);assert.equal(prizes[0].x,234);assert.equal(prizes[0].lane,1);
 assert.equal(prizes[0].golden,true);assert.equal(prizes[0].bonus,true);assert.equal(fishPoints(prizes[0]),7);
});
test('no prize attached to a blocked path or beyond finish',()=>{
 const obstacles=[{id:'b1',kind:'barrier',x:225,lane:1},{id:'v',kind:'van',x:233,lane:1},{id:'b2',kind:'barrier',x:296,lane:2}];
 assert.equal(makeBarrierPrizes(1,obstacles,300).length,0);
});
test('gold stars require genuine jumping, surplus fish and gold, not merely short time',()=>{
 const req=starRequirements(level);assert.equal(req.gold,12);assert.equal(req.goldFish,1);assert.equal(req.jumps,1);
 assert.equal(rateStars(level,run({jumpedBarriers:0})),2);
 assert.equal(rateStars(level,run({gold:0})),2);
 assert.equal(rateStars(level,run({count:8})),1);
 assert.equal(rateStars(level,run({})),3);
});
test('short and concrete replay hints show the closest missing mastery',()=>{
 assert.match(nextStarTip(level,run({jumpedBarriers:0})),/跳过/);
 assert.match(nextStarTip(level,run({count:10})),/再抓/);
 assert.match(nextStarTip(level,run({hits:1})),/不碰撞/);
});
test('older saves remain compatible with normalised best data',()=>{
 const empty=normalizeBest(null);assert.equal(empty.length,5);assert.equal(empty[0].fish,0);
 const corrupt=normalizeBest([{fish:Infinity}, {}, {}, {}, {}]);assert.equal(corrupt[0].fish,0);
});
test('personal best is monotone and only completed runs count',()=>{
 const save={stars:[1,2,3,0,0],best:normalizeBest(null)};
 updateBest(save,run({count:13,score:40}));updateBest(save,run({count:8,reason:'vehicle',score:999}));
 assert.equal(save.best[0].fish,13);assert.equal(allStars(save),6);
});