/* global console */
// Deterministic engineering audit, NOT a simulated human or advertisement study.
// Uses real authored collisions, steering and jumps. Never changes run state,
// course data, hazard positions, stars, rewards or timers.
import assert from 'node:assert/strict';
import {LEVELS,validateLevel,makeLevel} from './runtime/levels.mjs';
import {newRun,input,advance} from './runtime/adventure.mjs';
import {starRequirements} from './runtime/engagement.mjs';
import {reviveOpportunity} from './runtime/replay-value.mjs';

function trial(id,strategy){
 const run=newRun(id,{seed:20261017});
 if(strategy==='hold-left'){input(run,'left');input(run,'left');}
 if(strategy==='hold-right'){input(run,'right');input(run,'right');}
 const seconds=run.level.seconds+12,frames=Math.ceil(seconds*60);
 for(let frame=0;frame<frames&&run.phase==='running';frame++){
  // The third negative baseline tries blind jumps rather than decisions.
  if(strategy==='blind-jump'&&frame>0&&frame%120===0)input(run,'jump');
  advance(run,1/60);
 }
 return {strategy,phase:run.phase,reason:run.reason,
  elapsedSec:Number(run.elapsed.toFixed(2)),
  distanceM:Number(run.distance.toFixed(1)),
  progressPct:Math.round(run.distance/Math.max(1,run.level.distance)*100),
  obstacle:run.lastCollisionId??null,fish:run.count,gold:run.gold,jumps:run.jumpedBarriers,
  rescueEligible:reviveOpportunity(run,0).eligible};
}

assert.equal(LEVELS.length,5);
assert.deepEqual(LEVELS.map(l=>starRequirements(l).jumps),[1,1,1,2,2],
 'authored mastery reflects independently validated physically playable routes');
const rows=LEVELS.map(level=>{
 assert.deepEqual(validateLevel(makeLevel(level.id)),[],
  `level ${level.id} must retain a traversable, physically fair route`);
 const baselines=['no-input','hold-left','hold-right','blind-jump'].map(x=>trial(level.id,x));
 assert.ok(baselines.every(t=>t.phase==='finished'&&t.elapsedSec>0),
  'all fixed-course trials must terminate through the actual engine');
 const mastery=starRequirements(level);
 return {id:level.id,name:level.name,secondsAtNoStun:Number((level.distance/level.speed).toFixed(1)),
  hazards:level.obstacles.length,barriers:level.obstacles.filter(o=>o.kind==='barrier').length,
  fishGoal:level.goal.count,
  mastery:{fish:mastery.gold,gold:mastery.goldFish,jumps:mastery.jumps,streak:mastery.streak},
  baselines};
});
console.log('PELICAN_DIFFICULTY_BASELINES '+JSON.stringify({
 build:'checked-in-authoritative-physics',
 notice:'Synthetic fixed input strategies only; these are NOT human failure rates, learnability or ad intent.',
 levelCount:rows.length,levels:rows}));
