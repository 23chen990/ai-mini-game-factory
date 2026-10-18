import test from 'node:test';
import assert from 'node:assert/strict';
import {LEVELS,V7_OPENING_WAVES,validateLevel} from './levels.mjs';
import {newRun,advance} from './adventure.mjs';

test('V7 opening waves create real choices in first 5.2s on every stage',()=>{
 assert.equal(LEVELS.length,5);
 for(const level of LEVELS){
  const group=V7_OPENING_WAVES[level.id];
  assert.equal(group.length,3,'each opening requires more than a single reaction');
  const xs=group.map(row=>row[0]);
  assert.ok(xs[0]/level.speed>=3&&xs[0]/level.speed<=5.2,
   'first real hazard should be felt almost immediately');
  assert.ok((xs[2]-xs[0])/level.speed<5,
   'two follow-up hazards must not be isolated miles apart');
  assert.deepEqual(group.map(row=>row[2]),level.id<=2?[1,0,2]:[1,2,0],
   'three directions are covered across the three authored beats');
  assert.ok(group.every(([x,kind,lane])=>
   level.obstacles.some(o=>o.x===x&&o.kind===kind&&o.lane===lane)),
   'authored wave is in the real collision-engine course');
  assert.deepEqual(validateLevel(level),[],
   'fish path and visible safe lanes remain structurally possible');
 }
});
test('V7 no-input player now really collides early, but not via a synthetic fail',()=>{
 for(const stage of LEVELS){
  const run=newRun(stage.id,{seed:123});
  for(let frame=0;frame<8*60&&run.phase==='running';frame++)advance(run,1/60);
  assert.equal(run.phase,'finished','idle rider must actually encounter opening risk');
  assert.ok(['barrier','vehicle'].includes(run.reason),'death reason must be a real collision');
  assert.ok(run.elapsed>=3&&run.elapsed<=6.3,`stage ${stage.id} first failure too late`);
  assert.ok(run.lastCollisionId&&run.obstacles.some(o=>o.id===run.lastCollisionId&&o.hit),
   'death cannot be produced by a nonphysical force-fail timer');
 }
});
test('new obstacles append after legacy V6 IDs; original earned-gold course remains identifiable',()=>{
 assert.ok(LEVELS[0].obstacles.find(o=>o.id==='l1-o4'&&o.x===75));
 assert.ok(LEVELS[0].obstacles.find(o=>o.id==='l1-o1'&&o.x===140));
 assert.ok(LEVELS[4].obstacles.find(o=>o.id==='l5-o10'&&o.x===584));
 for(const stage of LEVELS){
  const bonus=stage.fish.filter(f=>f.bonus);
  assert.ok(bonus.length>0);
  for(const fish of bonus)assert.ok(stage.obstacles.find(o=>o.id===fish.sourceObstacleId));
 }
});