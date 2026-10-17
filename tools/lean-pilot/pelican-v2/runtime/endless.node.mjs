import test from 'node:test';
import assert from 'node:assert/strict';
import {createEndlessLevel,endlessSegment,extendEndless} from './endless.mjs';
import {newRun,retireRun,settle,newSave,advance,input} from './adventure.mjs';

test('infinite coast is deterministic by seed and index, never by player lane',()=>{
 const sequences=[...Array(120)].map((_,i)=>endlessSegment(20261017,i));
 assert.deepEqual(sequences,[...Array(120)].map((_,i)=>endlessSegment(20261017,i)));
 for(const [index,segment]of sequences.entries()){
  assert.ok(segment.obstacles.length>=1&&segment.obstacles.length<=2);
  assert.ok([0,1,2].includes(segment.open));
  assert.ok(segment.obstacles.every(o=>o.lane!==segment.open));
  assert.equal(new Set(segment.obstacles.map(o=>o.lane)).size,segment.obstacles.length);
  assert.equal(segment.obstacles.length,index<2?1:2);
 }
 assert.deepEqual(endlessSegment(1,9),endlessSegment(1,9));
 assert.throws(()=>endlessSegment(-1,0));
});

test('unending road has a smooth tutorial and bounded lookahead',()=>{
 const level=createEndlessLevel(12345);
 assert.equal(level.seed,12345);
 const r=newRun(6,{seed:12345});
 assert.equal(r.level.endless,true);
 assert.equal(r.level.id,6);
 assert.deepEqual(r.fishes.filter(f=>f.id.startsWith('endless-warmup')).map(f=>f.x),[15,31,47]);
 assert.equal(r.obstacles.some(o=>o.x<100),false);
 assert.ok(r.obstacles.length>=3);
 assert.ok(r.endless.nextX>350);
 const first=r.obstacles.map(o=>o.id);
 const another=newRun(6,{seed:12345});
 assert.deepEqual(another.obstacles.map(o=>o.id),first);
 // Normal simulation uses the original physics for turns, fish and damage.
 advance(r,1);
 assert.ok(r.distance>0);
 assert.equal(r.phase,'running');
 assert.equal(r.level.distance,100000000);
});

test('long coast extends and prunes old authored segments',()=>{
 const r=newRun(6,{seed:77});
 r.distance=1700;
 const created=extendEndless(r);
 assert.ok(created>12);
 assert.ok(r.obstacles.every(o=>o.x>=r.distance-90));
 assert.ok(r.fishes.every(f=>f.x>=r.distance-90));
 const safeSegments=new Map();
 for(const o of r.obstacles){
  const index=Number(o.id.split('-')[2]),entry=safeSegments.get(index)??new Set();
  entry.add(o.lane);safeSegments.set(index,entry);
 }
 assert.ok([...safeSegments.values()].every(x=>x.size<=2));
});

test('endless retirement settles once, never grants stars or opens ad revival',()=>{
 const r=newRun(6,{seed:44}),save=newSave();
 r.distance=422;r.count=18;r.gold=3;r.score=51;
 assert.equal(retireRun(r),true);
 assert.equal(retireRun(r),false);
 assert.equal(r.reason,'retired');
 assert.equal(settle(save,r),true);
 assert.equal(settle(save,r),false);
 assert.deepEqual(save.stars,[0,0,0,0,0]);
 assert.equal(save.unlocked,1);
});

test('long-session event buffer keeps absolute offsets for current HUD feedback',()=>{
 const r=newRun(6,{seed:88});
 for(let i=0;i<630;i++)input(r,i%2===0?'left':'right');
 assert.equal(r.events.length,500);
 assert.equal(r.eventOffset,130);
 assert.equal(r.events.at(-1).type,'steer-input');
 assert.equal(r.events.at(-1).source,'tap');
 assert.equal(r.events.at(-1).target,0);
});
