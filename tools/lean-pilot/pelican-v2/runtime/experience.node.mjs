import test from 'node:test';
import assert from 'node:assert/strict';
import {LEVELS,validateLevel,LANES} from './levels.mjs';
import {newRun,input,advance,settle,newSave} from './adventure.mjs';
import {starRequirements,starChallengeText,masteryStatus,BARREL_PRIZE_OFFSET} from './engagement.mjs';

test('replay challenge presents all authoritative per-level thresholds as numbers',()=>{
 for(const level of LEVELS){const t=starRequirements(level),text=starChallengeText(level);assert.ok(text.includes(t.gold+' 条鱼'));assert.ok(text.includes(t.goldFish+' 条金鱼'));assert.ok(text.includes(t.jumps+' 个路障'));assert.ok(text.includes('连续抓鱼 '+t.streak+' 条'));assert.equal(t.time,undefined);assert.ok(!text.includes('${'));}
});
test('live mastery and settlement share catch, gold, true barrier jumps, no-hit and longest real chain',()=>{
 const r=newRun(4),t=starRequirements(r.level),a=masteryStatus(r);assert.equal(a.catch.target,t.gold);assert.equal(a.gold.target,t.goldFish);assert.equal(a.jump.target,2);assert.equal(a.jump.done,false);assert.equal(a.noHit.done,true);assert.equal(a.streak.target,t.streak);assert.equal(a.streak.done,false);
 r.count=t.gold;r.gold=t.goldFish;r.jumpedBarriers=2;assert.equal(masteryStatus(r).catch.done,true);assert.equal(masteryStatus(r).gold.done,true);assert.equal(masteryStatus(r).jump.done,true);
 r.bestStreak=t.streak-1;assert.equal(masteryStatus(r).streak.done,false);
 r.bestStreak=t.streak;assert.equal(masteryStatus(r).streak.done,true);
 r.hits=1;r.elapsed=r.level.seconds-.1;assert.equal(masteryStatus(r).noHit.done,false);assert.equal(masteryStatus(r).streak.done,true,'clock must not counterfeit or reset a real achieved chain');
});
test('V3.2 first minute retains first fish, early gold, crossing decision, optional jump and settlement',()=>{
 const l=LEVELS[0];assert.ok(l.fish[0].x/l.speed<=2.5);assert.ok(l.fish.some(f=>f.golden&&f.x/l.speed<10));assert.ok(l.obstacles.some(o=>o.kind==='pedestrian'&&o.x/l.speed<=15));const b=l.obstacles.find(o=>o.kind==='barrier');assert.ok(b.x/l.speed<=32);assert.ok(l.fish.some(f=>f.sourceObstacleId===b.id&&f.bonus));assert.ok(l.distance/l.speed<=60);
});
test('every reward fish follows its exact barrier and has an ordinary safe detour',()=>{
 for(const l of LEVELS){assert.deepEqual(validateLevel(l),[]);for(const f of l.fish.filter(f=>f.bonus)){const b=l.obstacles.find(o=>o.id===f.sourceObstacleId);assert.equal(b.kind,'barrier');assert.equal(b.lane,f.lane);assert.equal(f.x-b.x,BARREL_PRIZE_OFFSET);assert.ok(!l.obstacles.some(o=>['car','van'].includes(o.kind)&&o.lane===f.lane&&Math.abs(o.x-f.x)<14));assert.ok([0,1,2].some(i=>i!==b.lane));}}
 assert.equal(new Set(LEVELS.map(l=>l.subtitle)).size,5);
});
test('first authored jump clears the exact barrier and catches its actual visible +7 prize',()=>{
 const r=newRun(1),b=r.obstacles.find(o=>o.kind==='barrier'&&o.x===35),prize=r.fishes.find(f=>f.sourceObstacleId===b.id);
 assert.ok(b&&prize,'V7 first physical obstacle has a genuine earned gold reward');
 for(let n=0;n<1200&&r.phase==='running'&&r.distance<b.x-3;n++)advance(r,1/120);
 assert.equal(r.phase,'running','must reach the real jump alive, never spin forever after death');
 input(r,'jump');
 for(let n=0;n<1200&&r.phase==='running'&&r.distance<prize.x+2;n++)advance(r,1/120);
 assert.equal(r.phase,'running');assert.equal(r.hits,0);assert.equal(r.jumpedBarriers,1);assert.ok(r.events.some(e=>e.type==='barrier-cleared'&&e.objectId===b.id&&e.jumped));assert.ok(r.events.some(e=>e.type==='fish-caught'&&e.objectId===prize.id&&e.golden&&e.bonus));assert.ok(Math.abs(r.lane-LANES[1])<.01);
});
test('ordinary catches and perfect safe detours do not counterfeit a three-star jump',()=>{
 for(const jumps of [0,1]){const r=newRun(1);r.phase='finished';r.reason='complete';r.count=18;r.gold=3;r.elapsed=40;r.jumpedBarriers=jumps;r.bestStreak=4;settle(newSave(),r);assert.equal(r.stars,jumps?3:2);}
 const noChain=newRun(1);noChain.phase='finished';noChain.reason='complete';noChain.count=18;noChain.gold=3;noChain.jumpedBarriers=1;noChain.bestStreak=3;noChain.elapsed=40;settle(newSave(),noChain);assert.equal(noChain.stars,2,'surplus fish and jump without a real chain stops at two stars');
 const r=newRun(1);r.phase='finished';r.reason='complete';r.count=r.level.goal.count;r.elapsed=40;settle(newSave(),r);assert.equal(r.stars,1);
});
