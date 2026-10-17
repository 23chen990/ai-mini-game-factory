import test from 'node:test';
import assert from 'node:assert/strict';
import {LEVELS,makeLevel,validateLevel,PRESSURE_GATES} from './levels.mjs';
import {failureSummary,safeGateCue,passedPreviousFailure} from './retry-loop.mjs';

test('authored high-pressure routes retain stable legacy obstacles and a physical escape at each double gate',()=>{
 const legacy={1:10,2:6,3:8,4:11,5:13};
 const gateCounts={2:4,3:4,4:4,5:4};
 for(const level of LEVELS){
  assert.deepEqual(validateLevel(makeLevel(level.id)),[],`level ${level.id} requires an achievable lane route and safe fish`);
  for(let i=0;i<legacy[level.id];i++)assert.ok(level.obstacles.some(o=>o.id===`l${level.id}-o${i}`));
  if(level.id===1){assert.equal(level.obstacles.length,10);continue;}
  const authored=PRESSURE_GATES[level.id];
  const grouped=Map.groupBy(authored,([distance])=>distance);
  const gates=[...grouped.values()].filter(rows=>rows.length===2);
  assert.equal(gates.length,gateCounts[level.id]);
  assert.equal(level.obstacles.length,legacy[level.id]+authored.length);
  const escapes=[];
  for(const rows of gates){
   const occupied=new Set(rows.map(([, , lane])=>lane));
   assert.equal(occupied.size,2,'each gated encounter blocks two different lane centers');
   const free=[0,1,2].filter(l=>!occupied.has(l));
   assert.equal(free.length,1,'every squeeze has one visible safe escape');
   escapes.push(free[0]);
  }
  assert.ok(new Set(escapes).size>=2,'repeatedly staying in one lane must not clear all challenge gates');
  const distances=[...grouped.keys()].sort((a,b)=>a-b);
  for(let i=1;i<distances.length;i++)assert.ok(distances[i]-distances[i-1]>=25,'reaction spacing between authored pressure beats');
 }
});
test('two red zones explicitly point to the one open lane, never promise safety on one-red or all-red',()=>{
 const danger={kind:'danger'},safe={kind:'fish'};
 assert.match(safeGateCue([danger,safe,danger]),/中侧空位/);
 assert.match(safeGateCue([safe,danger,danger]),/左侧空位/);
 assert.match(safeGateCue([danger,danger,safe]),/右侧空位/);
 assert.match(safeGateCue([danger,danger,safe]),/提前/,'warn early while crossing remains physically possible');
 assert.equal(safeGateCue([danger,safe,safe]),null);
 assert.equal(safeGateCue([danger,danger,danger]),null);
 assert.equal(safeGateCue([]),null);
});
test('a vehicle crash produces a factual loss recap and prominent free retry',()=>{
 const r={level:{id:3,distance:540,goal:{count:17,gold:2}},reason:'vehicle',distance:472.2,count:16,gold:1,
  lastCollisionId:'l3-o17',obstacles:[{id:'l3-o17',lane:2}],
  events:[{type:'fish-caught'},{type:'obstacle-avoided'},{type:'barrier-cleared'}]};
 const summary=failureSummary(r);
 assert.equal(summary.percent,87);assert.equal(summary.remaining,68);assert.equal(summary.avoided,2);
 assert.match(summary.title,/撞上来车/);
 assert.match(summary.body,/472\/540/);
 assert.match(summary.body,/右侧来车/);
 assert.match(summary.body,/差一点/);
 assert.match(summary.retryLabel,/立即再试/);
});
test('failure at finish reports missing fish, not a fictitious remaining distance',()=>{
 const r={level:{distance:300,goal:{count:8,gold:1}},reason:'gold-short',distance:300,count:12,gold:0,events:[]};
 const summary=failureSummary(r);
 assert.equal(summary.remaining,0);assert.match(summary.body,/到达终点/);assert.match(summary.body,/还差 1 条金鱼/);
 assert.doesNotMatch(summary.body,/差一点就骑到终点/);
});
test('a replay milestone is earned only after passing previous failure by five metres',()=>{
 assert.equal(passedPreviousFailure(105,100),false);
 assert.equal(passedPreviousFailure(105.1,100),true);
 assert.equal(passedPreviousFailure(120,null),false);
 assert.equal(passedPreviousFailure(120,0),false);
});
