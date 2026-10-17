import test from 'node:test';
import assert from 'node:assert/strict';
import {createEndlessLevel,endlessSegment,extendEndless,endlessTier,endlessCruiseSpeed,ENDLESS_TIERS} from './endless.mjs';
import {newRun,retireRun,settle,newSave,advance,input,steerTo} from './adventure.mjs';

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

test('five higher-pressure zones ramp real speed smoothly without unfair speed spikes',()=>{
 assert.equal(ENDLESS_TIERS.length,5);
 assert.deepEqual(ENDLESS_TIERS.map(t=>t.speed),[8.3,8.8,9.4,10,10.5]);
 assert.deepEqual(ENDLESS_TIERS.map(t=>t.at),[0,420,980,1800,3200]);
 for(const tier of ENDLESS_TIERS.slice(1)){
  assert.equal(endlessTier(tier.at).id,tier.id);
  const old=ENDLESS_TIERS[tier.id-1];
  assert.ok(Math.abs(endlessCruiseSpeed(tier.at)-old.speed)<1e-8);
  assert.ok(Math.abs(endlessCruiseSpeed(tier.at+110)-tier.speed)<1e-8);
 }
 assert.ok(endlessCruiseSpeed(1000000)<=10.5);
 const r=newRun(6,{seed:91});
 r.obstacles=[];r.fishes=[];r.endless.nextX=3000;r.distance=419.95;
 advance(r,.2);
 assert.equal(r.endless.tier,1);
 assert.equal(r.events.filter(e=>e.type==='endless-tier'&&e.tier===1).length,1);
 assert.equal(r.phase,'running');
 r.distance=1200;
 advance(r,.1);
 assert.ok(r.speed>=9.39&&r.speed<=9.41,'actual simulation speed ramps to the authored tier');
});
test('thousands of seeded challenge gates retain a true open route and adequate reaction room',()=>{
 for(const seed of [0,1,77,12345,20261017,99999999]){
  let lastX=0,previousOpen=null;
  for(let index=0;index<160;index++){
   const x=100+index*70;
   const segment=endlessSegment(seed,index,x);
   assert.ok(segment.obstacles.length<=2);
   assert.ok(segment.obstacles.every(o=>o.lane!==segment.open));
   assert.ok(segment.obstacles.every(o=>o.offset>=0&&o.offset<=8));
   assert.equal(new Set(segment.obstacles.map(o=>o.lane)).size,segment.obstacles.length);
   if(index>=2)assert.equal(segment.obstacles.length,2);
   if(index>=16&&previousOpen!==null&&x>=980)
    assert.notEqual(segment.open,previousOpen,'advanced gaps rotate instead of allowing idle camping');
   if(index>0)assert.ok(x-lastX>=62);
   previousOpen=segment.open;lastX=x;
  }
 }
 const r=newRun(6,{seed:12});
 r.distance=4300;
 extendEndless(r);
 assert.ok(r.obstacles.length>0);
 assert.ok(r.obstacles.every(o=>o.x>=r.distance-90));
 assert.ok(r.obstacles.some(o=>o.id.startsWith('endless-o-')));
});

// Engineering oracle, not a claim that human players can see future world state.
test('physical steering can survive every difficulty tier via actual open road',()=>{
 const route=[-1.7,0,1.7];
 for(const [seed,target] of [[13,3600],[20261017,1900]]){
  const r=newRun(6,{seed});
  for(let frames=0;frames<4500&&r.phase==='running'&&r.distance<target;frames++){
   // Choose a genuinely open physical lane for the nearest active encounter.
   // Hold it until both staggered obstacles have *actually* passed.
   const upcoming=r.obstacles.filter(o=>!o.passed&&!o.hit&&o.x-r.distance>-3).sort((a,b)=>a.x-b.x);
   const nearest=upcoming[0];
   if(nearest){
    const encounter=nearest.id.split('-')[2];
    const blocked=new Set(r.obstacles.filter(o=>o.id.split('-')[2]===encounter).map(o=>o.lane));
    const safe=[0,1,2].find(lane=>!blocked.has(lane));
    assert.ok(safe!==undefined,'an authored gap must remain open');
    steerTo(r,route[safe]);
   }
   advance(r,.14);
  }
  assert.equal(r.phase,'running',`seed ${seed} must not generate a physically unavoidable collision at ${r.distance.toFixed(1)}m`);
  assert.ok(r.distance>=target,`seed ${seed}: physically reached ${r.distance.toFixed(1)}m of ${target}m`);
  assert.equal(r.hits,0);
 }
});
