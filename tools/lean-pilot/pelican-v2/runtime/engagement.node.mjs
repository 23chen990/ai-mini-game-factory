import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBarrierPrizes, fishPoints, earnedPrizePrecedesRisk, starRequirements, rateStars, nextStarTip, normalizeBest, updateBest, allStars } from './engagement.mjs';
import {LEVELS,validateLevel,NIGHT_SAFE_FISH_TRAIL,V7_OPENING_WAVES} from './levels.mjs';
const level = { id: 1, distance: 300, seconds: 55, goal: {count: 8, gold: 0}, mastery: {jumps: 1}};
const run = overrides => ({level,reason:'complete',hits:0,count:12,gold:2,jumpedBarriers:1,bestStreak:8,elapsed:40,score:20,rewardScore:35,...overrides});
test('prize is real, visible and behind a jumpable obstacle, never at obstacle center',()=>{
 const obstacles=[{id:'b1',kind:'barrier',x:225,lane:1},{id:'car',kind:'car',x:280,lane:0}];
 const prizes=makeBarrierPrizes(1,obstacles,300);
 assert.equal(prizes.length,1);assert.equal(prizes[0].x,234);assert.equal(prizes[0].lane,1);
 assert.equal(prizes[0].golden,true);assert.equal(prizes[0].bonus,true);assert.equal(fishPoints(prizes[0]),7);
});
test('a genuinely earned gold prize outranks distant traffic but never hides an imminent collision',()=>{
 const barrier={id:'b',kind:'barrier',lane:1,jumped:true,passed:true};
 const run={speed:7.5,distance:142,obstacles:[barrier]};
 const prize={id:'reward',x:149,lane:1,bonus:true,sourceObstacleId:'b'};
 assert.equal(earnedPrizePrecedesRisk(run,prize,{seconds:4.1}),true);
 assert.equal(earnedPrizePrecedesRisk(run,prize,{seconds:1.2}),false);
 assert.equal(earnedPrizePrecedesRisk(run,{...prize,bonus:false},{seconds:4.1}),false);
 assert.equal(earnedPrizePrecedesRisk({...run,obstacles:[{...barrier,jumped:false}]},prize,{seconds:4.1}),false);
 assert.equal(earnedPrizePrecedesRisk({...run,distance:150},prize,{seconds:4.1}),false);
});
test('no prize attached to a blocked path or beyond finish',()=>{
 const obstacles=[{id:'b1',kind:'barrier',x:225,lane:1},{id:'v',kind:'van',x:233,lane:1},{id:'b2',kind:'barrier',x:296,lane:2}];
 assert.equal(makeBarrierPrizes(1,obstacles,300).length,0);
});
test('a crossing pedestrian origin cannot suppress a genuinely safe new left jump prize',()=>{
 const obstacles=[{id:'v4-left',kind:'barrier',x:75,lane:0},{id:'crossing',kind:'pedestrian',x:90,lane:0}];
 const prizes=makeBarrierPrizes(1,obstacles,300);
 assert.equal(prizes.length,1);assert.equal(prizes[0].sourceObstacleId,'v4-left');
 assert.equal(prizes[0].x,84);assert.equal(prizes[0].lane,0);
 // Opposite crossing ends in this reward lane, so it MUST suppress the lure.
 assert.equal(makeBarrierPrizes(1,[obstacles[0],{...obstacles[1],lane:2}],300).length,0);
});
test('gold stars require genuine jumping, fish, gold and an earned chain instead of a fixed-speed clock',()=>{
 const req=starRequirements(level);assert.equal(req.gold,12);assert.equal(req.goldFish,1);assert.equal(req.jumps,1);assert.equal(req.streak,4);assert.equal(req.time,undefined);
 assert.equal(rateStars(level,run({jumpedBarriers:0})),2);
 assert.equal(rateStars(level,run({gold:0})),2);
 assert.equal(rateStars(level,run({bestStreak:3})),2);
 assert.equal(rateStars(level,run({elapsed:54})),3,'fixed-speed timer cannot block earned mastery');
 assert.equal(rateStars(level,run({count:8})),1);
 assert.equal(rateStars(level,run({})),3);
});
test('short and concrete replay hints show the closest missing mastery',()=>{
 assert.match(nextStarTip(level,run({jumpedBarriers:0})),/跳过/);
 assert.match(nextStarTip(level,run({count:10})),/再抓/);
 assert.match(nextStarTip(level,run({hits:1})),/不碰撞/);
 assert.match(nextStarTip(level,run({bestStreak:2})),/连续抓到 4 条鱼/);
});
test('two-star replay advice names jumping AND missing fish, never implying fish alone earns 3 stars',()=>{
 const lateLevel={id:5,seconds:95,goal:{count:24,gold:3},mastery:{jumps:2}};
 const safeFinish={level:lateLevel,reason:'complete',hits:0,count:32,gold:6,jumpedBarriers:0,bestStreak:8,elapsed:75};
 const tip=nextStarTip(lateLevel,safeFinish);
 assert.match(tip,/跳过 2 个路障/);
 assert.match(tip,/再抓 2 条鱼/);
 assert.equal(rateStars(lateLevel,safeFinish),2);
 assert.ok(tip.length<45,'short enough to fit a compact result card');
 const completeMastery=nextStarTip(lateLevel,{...safeFinish,count:35,jumpedBarriers:2});
 assert.match(completeMastery,/三星达成/);
});
test('authored three-star jump mastery keeps its physical safe route and one-star fallback',()=>{
 assert.deepEqual(LEVELS.map(l=>starRequirements(l).jumps),[1,1,1,2,2]);
 for(const level of LEVELS.slice(2)){
  const req=starRequirements(level);
  const perfect={level,reason:'complete',hits:0,count:req.gold,gold:req.goldFish,
   jumpedBarriers:req.jumps,bestStreak:req.streak,elapsed:level.distance/level.speed};
  assert.equal(rateStars(level,perfect),3);
  assert.equal(rateStars(level,{...perfect,jumpedBarriers:req.jumps-1}),2,
   'without genuinely clearing the last authored barrier there is no free three-star rank');
  assert.equal(rateStars(level,{...perfect,count:req.bronze,jumpedBarriers:0}),1,
   'a genuine one-star finish still unlocks normal progression');
 }
});
test('older saves remain compatible with normalised best data',()=>{
 const empty=normalizeBest(null);assert.equal(empty.length,5);assert.equal(empty[0].fish,0);assert.equal(empty[0].streak,0);
 const corrupt=normalizeBest([{fish:Infinity}, {}, {}, {}, {}]);assert.equal(corrupt[0].fish,0);
 const legacy=normalizeBest([{fish:9,gold:2,jumps:1,score:40},{},{},{},{}]);assert.equal(legacy[0].fish,9);assert.equal(legacy[0].streak,0);
 const invalid=normalizeBest([{streak:-3},{},{},{},{}]);assert.equal(invalid[0].streak,0);
});
test('personal best is monotone and only completed runs count',()=>{
 const save={stars:[1,2,3,0,0],best:normalizeBest(null)};
 updateBest(save,run({count:13,bestStreak:7,score:40}));updateBest(save,run({count:8,bestStreak:999,reason:'vehicle',score:999}));
 assert.equal(save.best[0].fish,13);assert.equal(save.best[0].streak,7);assert.equal(allStars(save),6);
});

test('nightly fast paired-vehicle gates have an actual reachable public fish trail',()=>{
 const night=LEVELS[4];
 assert.equal(night.speed,9.6);
 assert.equal(night.obstacles.length,21+V7_OPENING_WAVES[5].length,'preserve all 13 legacy, 8 previous gates and exactly three new early hazards');
 assert.deepEqual([night.obstacles[8].x,night.obstacles[9].x],[475,475],
  'the 475m dual traffic gate preserves original l5-o8 and l5-o9 IDs');
 assert.deepEqual([night.obstacles[17].x,night.obstacles[18].x,night.obstacles[19].x,night.obstacles[20].x],
  [433,433,558,558],'four pressure threat IDs stay stable');
 assert.equal(558-475>=80,true,
  'two genuinely different open-lane gates need a legible transition');
 for(const [distance,index] of [[399,2],[495,1],[511,0],[527,0]]){
  const fish=night.fish.find(item=>item.id===`l5-f${(distance-15)/16}`);
  assert.ok(fish,'a real physical fish exists at '+distance);
  assert.equal(fish.x,distance);
  assert.equal(fish.lane,index,'visible fish guides toward the future open lane');
  assert.equal(fish.caught,undefined,'fish is not auto-awarded');
  assert.equal(NIGHT_SAFE_FISH_TRAIL[distance],index);
 }
 assert.deepEqual(validateLevel(night),[],
  'fish breadcrumbs must remain collision-safe and all obstacle groups escapable');
});

test('level two rewards staying on the earned last jump lane without granting three stars',()=>{
 const levelTwo=LEVELS[1];
 const extra=levelTwo.fish.find(f=>f.id==='l2-prize-trail-372');
 assert.ok(extra,'extra real physical pickup exists');
 assert.deepEqual({x:extra.x,lane:extra.lane,golden:extra.golden,shoal:extra.shoal},
  {x:372,lane:0,golden:false,shoal:true});
 assert.equal(starRequirements(levelTwo).gold,17,'three-star demand is unchanged');
 assert.deepEqual(validateLevel(levelTwo),[]);
});

test('first-level late four-catch sprint is a physical optional safe-lane reward, not a free star',()=>{
 const levelOne=LEVELS[0];
 const caughtInPlace=[260,264,267].map(x=>levelOne.fish.find(f=>f.id===`l1-clean-exit-${x}`));
 assert.equal(caughtInPlace.every(Boolean),true);
 assert.equal(caughtInPlace.every(f=>f.lane===0&&!f.golden&&f.shoal),true);
 assert.deepEqual(caughtInPlace.map(f=>f.x),[260,264,267]);
 assert.equal(starRequirements(levelOne).streak,4,'mastery target is unchanged');
 assert.equal(starRequirements(levelOne).gold,12,'fish mastery target is unchanged');
 assert.equal(rateStars(levelOne,{reason:'complete',hits:0,count:20,gold:7,jumpedBarriers:4,bestStreak:3}),2,
  'extra available fish never grants a star without a real streak');
 assert.deepEqual(validateLevel(levelOne),[]);
});
