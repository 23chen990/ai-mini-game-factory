import test from 'node:test';
import assert from 'node:assert/strict';
import {LEVELS,LANES,BOUNDS,validateLevel,makeLevel} from './levels.mjs';
import {newRun,advance,input,settle,newSave,loadSave} from './adventure.mjs';
import {starRequirements,allStars} from './engagement.mjs';
const tick=(r,seconds)=>{for(let t=0;t<seconds-1e-7;t+=1/120)advance(r,Math.min(1/120,seconds-t));};
test('all five hand-authored fish placement maps are safe',()=>{
  for(const l of LEVELS){const issues=validateLevel(makeLevel(l.id));assert.deepEqual(issues,[],`level ${l.id}: ${issues.join(';')}`);
    assert.ok(l.fish.some(f=>f.bonus),`missing jump reward in L${l.id}`);
    assert.ok(l.fish.length>l.goal.count+4);
  }
});
test('a real jump, not pressing jump anywhere, earns the visible barrier prize',()=>{
 const r=newRun(1);
 r.obstacles=[{id:'b1',kind:'barrier',x:60,lane:1,speed:0,z:0,hit:false,passed:false,triggerAt:null}];
 r.fishes=[{id:'prize',x:69,lane:1,golden:true,bonus:true,caught:false}];
 tick(r,57/r.level.speed);input(r,'jump');tick(r,3);
 assert.notEqual(r.phase,'finished');assert.equal(r.jumpedBarriers,1);
 assert.equal(r.gold,1);assert.equal(r.score,7);assert.equal(r.count,1);
 assert.ok(r.events.some(e=>e.type==='fish-caught'&&e.bonus));
});
test('safe detour is legitimate without winning optional jump prize',()=>{
 const r=newRun(1);
 r.obstacles=[{id:'b1',kind:'barrier',x:60,lane:1,speed:0,z:0,hit:false,passed:false,triggerAt:null}];
 r.fishes=[{id:'prize',x:69,lane:1,golden:true,bonus:true,caught:false}];
 input(r,'left');tick(r,10);assert.notEqual(r.phase,'finished');assert.equal(r.jumpedBarriers,0);assert.equal(r.count,0);
});
test('first minute offers fish, golden decision, nonlethal street crossing and optional jump',()=>{
 const l=LEVELS[0];assert.ok(l.fish[0].x/l.speed<2.5);
 assert.ok(l.fish.some(f=>f.golden&&f.x/l.speed<10));
 assert.ok(l.obstacles.some(o=>o.kind==='pedestrian'&&o.x/l.speed<15));
 assert.ok(l.obstacles.some(o=>o.kind==='barrier'&&o.x/l.speed<=20));
 assert.ok(l.fish.some(f=>f.bonus&&f.x/l.speed<=22));
 assert.ok(l.distance/l.speed<45);
});
function driver(dt,level){
 const r=newRun(level.id);let decisions=0;
 while(r.phase==='running'){
  if(decisions++%Math.round(.12/dt)===0){
   const close=r.obstacles.filter(o=>!o.hit&&!o.passed&&o.x-r.distance>-(BOUNDS[o.kind].x+.75)&&o.x-r.distance<65);
   const blocked=lane=>close.some(o=>Math.abs(o.z-LANES[lane])<.8&&(o.x-r.distance)/(level.speed+(o.speed||0))<=3);
   const fish=r.fishes.find(f=>!f.caught&&f.x-r.distance>1&&f.x-r.distance<35);
   let want=r.laneIndex;
   if(blocked(want)){const safe=[0,1,2].filter(l=>!blocked(l));want=(fish&&safe.includes(fish.lane)?fish.lane:safe.sort((a,b)=>Math.abs(a-r.laneIndex)-Math.abs(b-r.laneIndex))[0])??want;}
   else if(fish&&!blocked(fish.lane))want=fish.lane;
   if(want!==r.laneIndex)input(r,want<r.laneIndex?'left':'right');
  }
  advance(r,dt);
  if(r.elapsed>level.seconds+1)break;
 }
 return r;
}
test('all five levels stay finishable at 30, 60, 120 fps with one-star rules',()=>{
 for(const dt of [1/30,1/60,1/120])for(const l of LEVELS){const r=driver(dt,l);
  assert.equal(r.reason,'complete',`L${l.id}, ${Math.round(1/dt)}Hz: ${r.reason} fish=${r.count} gold=${r.gold}, jump=${r.jumpedBarriers}`);
  assert.equal(r.hits,0);
 }
});
test('save migration accepts existing V2 records and records best only when completed',()=>{
 const old={version:2,unlocked:3,stars:[3,1,0,0,0],completed:[true,true,false,false,false]};
 const loaded=loadSave(JSON.stringify(old));assert.ok(loaded);assert.equal(loaded.unlocked,3);assert.equal(loaded.best.length,5);assert.equal(allStars(loaded),4);
 const l=newRun(1);l.phase='finished';l.reason='complete';l.count=11;l.gold=2;l.jumpedBarriers=1;l.score=20;l.elapsed=40;settle(loaded,l);
 assert.equal(loaded.best[0].fish,11);assert.ok(loaded.stars[0]>=3);
 assert.deepEqual(loadSave(JSON.stringify(loaded)),loaded);
});
test('every level has enough award inventory for optional 3-star challenge',()=>{
 for(const l of LEVELS){const bonusCount=l.obstacles.filter(o=>o.kind==='barrier').length;
  assert.ok(bonusCount>=starRequirements(l).jumps,`insufficient barriers in L${l.id}`);
  assert.ok(l.fish.filter(f=>f.golden).length>=starRequirements(l).goldFish);
  assert.ok(l.fish.length>=starRequirements(l).gold);
 }
});

test('levels have different authored fish routes instead of only longer time limits',()=>{
 const shape=l=>l.fish.filter(f=>!f.bonus).slice(3,15).map(f=>f.lane).join('');
 assert.ok(new Set(LEVELS.map(shape)).size>=4);
});
// Input-only mastery probe: never inject score, collision, jump count, or save.
function masteryDrive(level,dt,jumpDistance){
 const r=newRun(level.id);let lastControl=-10;
 while(r.phase==='running'&&r.elapsed<level.seconds+1){
  if(r.elapsed-lastControl>=.125){
   lastControl=r.elapsed;
   const ahead=r.obstacles.filter(o=>!o.hit&&!o.passed&&o.x-r.distance>-(BOUNDS[o.kind].x+.75)&&o.x-r.distance<65)
    .sort((a,b)=>(a.x-r.distance)/(level.speed+(a.speed||0))-(b.x-r.distance)/(level.speed+(b.speed||0)));
   const seconds=o=>(o.x-r.distance)/(level.speed+(o.speed||0));
   const blocked=lane=>ahead.some(o=>o.kind!=='barrier'&&Math.abs(o.z-LANES[lane])<.8&&seconds(o)<2.8&&seconds(o)>-.3);
   const barrier=ahead.find(o=>o.kind==='barrier'&&o.x-r.distance<55&&o.x-r.distance>0&&!blocked(o.lane));
   const fish=r.fishes.find(f=>!f.caught&&f.x-r.distance>2&&f.x-r.distance<31);
   let want=r.laneIndex;
   if(blocked(want)||ahead.some(o=>o.kind==='barrier'&&o.lane===want&&seconds(o)<1.5&&seconds(o)>0&&!barrier)){
    const safe=[0,1,2].filter(l=>!blocked(l)&&!ahead.some(o=>o.kind==='barrier'&&o.lane===l&&seconds(o)<1.3));
    want=safe.sort((a,b)=>Math.abs(a-r.laneIndex)-Math.abs(b-r.laneIndex))[0]??want;
   }else if(barrier&&r.jumpedBarriers<level.mastery.jumps)want=barrier.lane;
   else if(fish&&!blocked(fish.lane))want=fish.lane;
   if(want!==r.laneIndex)input(r,want<r.laneIndex?'left':'right');
   const b=ahead.find(o=>o.kind==='barrier'&&o.lane===r.laneIndex&&o.x-r.distance<jumpDistance+.6&&o.x-r.distance>jumpDistance-.6);
   if(b&&r.y===0)input(r,'jump');
  }
  advance(r,dt);
 }
 settle(newSave(),r);
 return r;
}
test('all five levels have a real safe 3-star jump/fishing path',()=>{
 const jumpDistances=[3.4,3.4,4.2,3.8,4.2];
 for(const l of LEVELS){
  const r=masteryDrive(l,1/120,jumpDistances[l.id-1]);
  assert.equal(r.reason,'complete','level '+l.id+' ended '+r.reason);
  assert.equal(r.stars,3,'level '+l.id+' fish='+r.count+' gold='+r.gold+' jumps='+r.jumpedBarriers);
  assert.equal(r.hits,0);
  assert.ok(r.events.some(e=>e.type==='barrier-cleared'&&e.jumped));
 }
});
