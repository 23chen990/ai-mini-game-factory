import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, LANES, BOUNDS, makeLevel, validateLevel } from './runtime/levels.mjs';
import { newRun, input, advance, sweptHit, newSave, loadSave, settle, cameraPose, qualityStep } from './runtime/adventure.mjs';

const tick=(r,seconds)=>{for(let t=0;t<seconds;t+=1/120)advance(r,1/120);};
test('five genuinely different configurations, early fish, no lethal traffic before level three',()=>{
 assert.equal(LEVELS.length,5);assert.equal(new Set(LEVELS.map(l=>l.distance)).size,5);
 for(const l of LEVELS){assert.deepEqual(validateLevel(makeLevel(l.id)),[]);assert.ok(l.fish[0].x/l.speed<=2.5);assert.ok(l.fish.length>=l.goal.count+4);}
 assert.ok(!LEVELS[0].obstacles.some(o=>['car','van'].includes(o.kind)));
 assert.ok(!LEVELS[1].obstacles.some(o=>['car','van'].includes(o.kind)));
 assert.ok(LEVELS[2].obstacles.some(o=>o.kind==='car')&&LEVELS[2].obstacles.some(o=>o.kind==='van'));
 assert.equal(LEVELS[3].weather,'rain');assert.ok(LEVELS[4].hour>=18);
});
test('fairness validator rejects all blocked roads, unsafe fish and insufficient reaction spacing',()=>{
 const l=makeLevel(3);l.obstacles=[0,1,2].map(lane=>({id:'x'+lane,kind:'car',x:90,lane,speed:3}));assert.ok(validateLevel(l).some(x=>x.includes('blocked')));
 const f=makeLevel(3);f.obstacles=[{id:'bad',kind:'car',x:f.fish[0].x,lane:f.fish[0].lane,speed:0}];assert.ok(validateLevel(f).some(x=>x.includes('fish')));
});
test('one press switches one adjacent lane, held repeats do not drift; pause rejects input',()=>{
 const r=newRun(1);input(r,'right');tick(r,.5);assert.equal(r.laneIndex,2);assert.ok(Math.abs(r.lane-LANES[2])<.01);
 input(r,'right');tick(r,.6);assert.equal(r.laneIndex,2);input(r,'pause');const d=r.distance;input(r,'left');tick(r,2);assert.equal(r.distance,d);assert.equal(r.laneIndex,2);input(r,'resume');tick(r,.3);assert.ok(r.distance>d);
});
test('swept collision detects high speed tunnelling and rejects an adjacent lane',()=>{
 assert.equal(sweptHit({x:-12,z:0},{x:12,z:0},1,.7),true);
 assert.equal(sweptHit({x:-12,z:1.4},{x:12,z:1.4},1,.7),false);
 assert.equal(sweptHit({x:-2,z:2},{x:2,z:-2},.6,.6),true);
});
test('vehicle collision ends immediately and freezes score/distance',()=>{
 const r=newRun(3);r.obstacles=[{id:'testcar',kind:'car',x:16,lane:1,speed:0,hit:false}];r.fishes=[];tick(r,3);assert.equal(r.reason,'vehicle');assert.equal(r.phase,'finished');const d=r.distance;tick(r,3);assert.equal(r.distance,d);assert.equal(r.count,0);
});
test('pedestrian stops bike for three seconds while timer runs, exact pedestrian cannot hit twice',()=>{
 const r=newRun(2);r.obstacles=[{id:'ped',kind:'pedestrian',x:10,lane:1,speed:0,stationary:true,hit:false}];r.fishes=[];tick(r,1.3);assert.ok(r.stun>2.5);const d=r.distance,t=r.elapsed;tick(r,2);assert.equal(r.distance,d);assert.ok(r.elapsed>t+1.9);tick(r,1.5);assert.ok(r.distance>d);assert.equal(r.events.filter(e=>e.type==='pedestrian-hit').length,1);
});
test('pedestrians start on the sidewalk and do not teleport from a road lane on first activation',()=>{
 const r=newRun(2);const p=r.obstacles.find(o=>o.kind==='pedestrian');assert.ok(Math.abs(p.z)>3);const z=p.z;tick(r,.4);assert.equal(p.z,z);
});
test('barrier collides at ground height; a visibly cleared jump or lane change avoids it',()=>{
 const r=newRun(1);r.obstacles=[{id:'bar',kind:'barrier',x:15,lane:1,speed:0}];r.fishes=[];tick(r,2.3);assert.equal(r.reason,'barrier');
 const j=newRun(1);j.obstacles=[{id:'bar',kind:'barrier',x:15,lane:1,speed:0}];j.fishes=[];tick(j,1.6);input(j,'jump');tick(j,.7);assert.notEqual(j.phase,'finished');assert.equal(j.events.filter(e=>e.type==='barrier-cleared').length,1);
});
test('finish requires distance AND both fish count and fish type, settles immediately',()=>{
 const fail=newRun(1);fail.distance=fail.level.distance-.01;fail.fishes=[];advance(fail,.05);assert.equal(fail.reason,'fish-short');
 const pass=newRun(2);pass.count=pass.level.goal.count;pass.gold=pass.level.goal.gold;pass.distance=pass.level.distance-.01;advance(pass,.05);assert.equal(pass.reason,'complete');assert.ok(pass.elapsed<1);
 const type=newRun(2);type.count=99;type.gold=0;type.distance=type.level.distance-.01;advance(type,.05);assert.equal(type.reason,'gold-short');
});
test('save validates corrupt input; success unlocks next; failure does not; settle is idempotent',()=>{
 const s=newSave();const r=newRun(1);r.phase='finished';r.reason='complete';r.count=9;r.score=9;assert.equal(settle(s,r),true);assert.equal(r.rewardScore,9+r.level.reward);assert.equal(settle(s,r),false);assert.equal(s.unlocked,2);assert.ok(s.stars[0]>=1);assert.deepEqual(loadSave(JSON.stringify(s)),s);assert.equal(loadSave('{oops'),null);assert.equal(loadSave(JSON.stringify({...s,unlocked:999})),null);
 const f=newRun(3);f.phase='finished';f.reason='vehicle';settle(s,f);assert.equal(s.unlocked,2);
});
test('authored courses have a no-hit path meeting distance and fish/type goals at both 30 and 60 Hz',()=>{
 for(const dt of [1/30,1/60,1/120])for(const level of LEVELS){const r=newRun(level.id);let decisions=0;
  while(r.phase==='running'){
   if(decisions++%Math.round(.12/dt)===0){const close=r.obstacles.filter(o=>!o.hit&&!o.passed&&o.x-r.distance>-(BOUNDS[o.kind].x+.75)&&o.x-r.distance<65);
    const blocked=lane=>close.some(o=>Math.abs(o.z-LANES[lane])<.8&&(o.x-r.distance)/(level.speed+o.speed)<=3);
    const fish=r.fishes.find(f=>!f.caught&&f.x-r.distance>1&&f.x-r.distance<35);let want=r.laneIndex;
    if(blocked(want)){const safe=[0,1,2].filter(l=>!blocked(l));want=(fish&&safe.includes(fish.lane)?fish.lane:safe.sort((a,b)=>Math.abs(a-r.laneIndex)-Math.abs(b-r.laneIndex))[0])??want;}
    else if(fish&&!blocked(fish.lane))want=fish.lane;
    if(want!==r.laneIndex)input(r,want<r.laneIndex?'left':'right');
   }advance(r,dt);
  }assert.equal(r.reason,'complete',`level ${level.id} at ${dt}: ${r.reason}`);assert.equal(r.hits,0);}
});
test('camera tracks forward distance in a floating world, ignores jump height and follows lane gently',()=>{
 const a=cameraPose(0,390/844),b=cameraPose(1.7,390/844);assert.ok(a.position[0]<-6);assert.equal(a.fov,52);assert.ok(Math.abs(a.position[2]-b.position[2])<.7);assert.ok(a.look[0]>=10);
});
test('star reward is based on fishing mastery, not just elapsed seconds',()=>{
 const s=newSave(),minimal=newRun(1);minimal.phase='finished';minimal.reason='complete';minimal.count=minimal.level.goal.count;minimal.score=minimal.count;minimal.elapsed=35;settle(s,minimal);assert.equal(minimal.stars,1);
 const great=newRun(1);great.phase='finished';great.reason='complete';great.count=17;great.gold=2;great.score=20;great.elapsed=40;great.jumpedBarriers=1;settle(s,great);assert.equal(great.stars,3);
});
test('quality sheds expensive effects first and never falls below 1.25 pixels on DPR3',()=>{
 let q={tier:2,pr:1.5};q=qualityStep(q,28,3);assert.equal(q.tier,1);assert.equal(q.pr,1.5);q=qualityStep(q,28,3);assert.equal(q.tier,0);assert.equal(q.pr,1.5);q=qualityStep(q,28,3);assert.equal(q.pr,1.25);for(let i=0;i<10;i++)q=qualityStep(q,20,3);assert.equal(q.pr,1.25);
});
