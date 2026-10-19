import test from 'node:test';
import assert from 'node:assert/strict';
import {LEVELS,validateLevel} from './levels.mjs';
import {newRun,advance} from './adventure.mjs';

// Two cars at the same x require one route choice, not two independent
// decisions. Check authored encounter cadence instead of raw obstacle count.
// This is a physical engineering gate, never a claim about human engagement.
const seconds=(metres,speed)=>metres/speed;
function cadence(level){
 const xs=[...new Set(level.obstacles.map(o=>o.x))].sort((a,b)=>a-b);
 const gaps=[xs[0],...xs.slice(1).map((x,i)=>x-xs[i]),level.distance-xs.at(-1)];
 const early=level.obstacles.filter(o=>seconds(o.x,level.speed)<=15);
 const firstThirty=xs.filter(x=>seconds(x,level.speed)<=30);
 const moments=early.map(o=>({time:seconds(o.x,level.speed),lane:o.lane}));
 const followups=moments.filter((o,i)=>moments.some((p,j)=>
  i!==j&&Math.abs(o.time-p.time)<=3&&o.lane!==p.lane)).length;
 return {first:seconds(xs[0],level.speed),maxQuiet:seconds(Math.max(...gaps),level.speed),
  earlyLanes:[...new Set(early.map(o=>o.lane))].sort(),
  followups,decisionsFirstThirty:firstThirty.length};
}

test('V7 five-stage pressure is sustained instead of isolated ten-second obstacles',()=>{
 for(const level of LEVELS){
  const p=cadence(level);
  assert.ok(p.first>=3&&p.first<=5.2,
   `L${level.id}: first real hazard at ${p.first.toFixed(2)}s, not 3-5.2s`);
  assert.ok(p.maxQuiet<=5.6,
   `L${level.id}: ${p.maxQuiet.toFixed(2)}s empty road dilutes pressure`);
  assert.ok(p.decisionsFirstThirty>=8,
   `L${level.id}: too few distinct decisions in first 30 seconds`);
  assert.deepEqual(p.earlyLanes,[0,1,2],
   `L${level.id}: one unthreatened opening lane rewards idle riding`);
  assert.ok(p.followups>=3,
   `L${level.id}: opening has no genuinely different-lane follow-ups`);
  assert.deepEqual(validateLevel(level),[],
   `L${level.id}: higher density must retain a feasible physical route`);
 }
});

test('idle rider meets an actual opening hitbox, not a synthetic fail timer',()=>{
 for(const level of LEVELS){
  const r=newRun(level.id,{seed:20261019});
  for(let i=0;i<6*60&&r.phase==='running';i++)advance(r,1/60);
  assert.equal(r.phase,'finished',`L${level.id}: opening hazard must be real`);
  assert.ok(r.elapsed>=3&&r.elapsed<=5.7,`L${level.id}: unexpected first failure time`);
  assert.equal(r.reason,'barrier');
  assert.ok(r.obstacles.some(o=>o.id===r.lastCollisionId&&o.hit),
   'only a genuine physics collision qualifies');
 }
});
