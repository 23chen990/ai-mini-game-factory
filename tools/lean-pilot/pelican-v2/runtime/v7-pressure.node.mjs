import test from 'node:test';
import assert from 'node:assert/strict';
import {LEVELS,V7_OPENING_WAVES,V7_MIDCOURSE_WAVES,validateLevel} from './levels.mjs';
import {newRun,input,advance} from './adventure.mjs';

test('V7 opening waves create real choices in first 5.2s on every stage',()=>{
 assert.equal(LEVELS.length,5);
 for(const level of LEVELS){
  const group=V7_OPENING_WAVES[level.id];
  assert.equal(group.length,3,'each opening requires more than a single reaction');
  const xs=group.map(row=>row[0]);
  assert.ok(xs[0]/level.speed>=3&&xs[0]/level.speed<=5.2,
   'first real hazard should be felt almost immediately');
  assert.ok((xs[2]-xs[0])/level.speed<6.2,
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
test('V7 tight opening has a real, readable left-then-centre escape at 30 and 60Hz',()=>{
 for(const fps of [30,60]){
  const r=newRun(1,{seed:20261017});
  advance(r,.5);input(r,'left');
  for(let n=0;n<1200&&r.phase==='running'&&r.distance<45;n++)advance(r,1/fps);
  assert.equal(r.phase,'running','first real barrier must be avoidable');
  input(r,'right');
  for(let n=0;n<1200&&r.phase==='running'&&r.distance<96;n++)advance(r,1/fps);
  assert.equal(r.phase,'running','returning after the real barrier must survive the left car and right car');
  assert.ok(r.events.some(e=>e.type==='barrier-cleared'&&e.objectId==='l1-o10'&&!e.jumped));
  assert.ok(r.events.some(e=>e.type==='obstacle-avoided'&&e.objectId==='l1-o11'));
  assert.ok(r.events.some(e=>e.type==='obstacle-avoided'&&e.objectId==='l1-o12'));
 }
});
test('V7 midcourse waves demand repeated real choices without long idle traffic stretches',()=>{
 const expected=[2,2,3,4,5];
 for(const level of LEVELS){
  const waves=V7_MIDCOURSE_WAVES[level.id];
  assert.equal(waves.length,expected[level.id-1]);
  assert.ok(waves.every(([x,kind,lane])=>
   level.obstacles.some(o=>o.x===x&&o.kind===kind&&o.lane===lane)));
  const xs=[0,...new Set(level.obstacles.map(o=>o.x)),level.distance].sort((a,b)=>a-b);
  const longest=xs.slice(1).reduce((max,x,i)=>Math.max(max,(x-xs[i])/level.speed),0);
  assert.ok(longest<=5.75,
   `stage ${level.id} has ${longest.toFixed(2)}s unbroken hazard-free riding`);
  assert.deepEqual(validateLevel(level),[]);
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
test('V7 post-gold two-tap overtake clears the real centre car on 30/60Hz',()=>{
 for(const fps of [30,60]){
  const r=newRun(1,{seed:20261017});
  const approach=metres=>{for(let n=0;n<10000&&r.phase==='running'&&r.distance<metres;n++)advance(r,1/fps);};
  const sequence=[[16,'right'],[39,'left'],[51,'right'],[54,'left'],
   [103,'jump'],[121,'left'],[149,'right'],[152,'right'],
   [175,'left'],[211,'left'],[271,'right'],[274,'right'],[285,'left']];
  for(const [metres,action] of sequence){
   approach(metres);assert.equal(r.phase,'running',`actual safe route reaches ${metres}m at ${fps}Hz`);input(r,action);
  }
  approach(300);
  assert.equal(r.reason,'complete',`real three-action skill play reaches the finish at ${fps}Hz`);
  assert.ok(r.count>=12&&r.gold>=1&&r.jumpedBarriers>=1&&r.bestStreak>=4);
  assert.ok(r.events.some(e=>e.type==='barrier-cleared'&&e.objectId==='l1-o13'&&e.jumped));
  assert.ok(r.events.some(e=>e.type==='jump'&&e.objectId==='l1-o13'&&e.buffered));
  assert.ok(r.events.some(e=>e.type==='fish-caught'&&e.objectId==='l1-jump-l1-o13'&&e.golden&&e.bonus),
   'real earned jump prize is required, not simply a displayed jump cue');
 }
});
test('V7 narrow 233m jump buffer is still genuinely winnable, unlike 217m pre-jump',()=>{
 for(const fps of [30,60]){
  const r=newRun(1,{seed:20261017});
  const approach=metres=>{for(let n=0;n<10000&&r.phase==='running'&&r.distance<metres;n++)advance(r,1/fps);};
  for(const [metres,action] of [[20,'left'],[42,'right'],[94,'left'],[145,'right'],
   [146,'right'],[179,'left'],[225,'jump']]){
   approach(metres);assert.equal(r.phase,'running');input(r,action);
  }
  approach(245);assert.equal(r.phase,'running');
  assert.ok(r.events.some(e=>e.type==='obstacle-avoided'&&e.objectId==='l1-o14'));
  assert.ok(r.events.some(e=>e.type==='barrier-cleared'&&e.objectId==='l1-o3'&&e.jumped));
  assert.ok(r.events.some(e=>e.type==='fish-caught'&&e.objectId==='l1-jump-l1-o3'&&e.golden));
 }
});
