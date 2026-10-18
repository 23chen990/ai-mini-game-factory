import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, LANES, BOUNDS, V7_OPENING_WAVES, makeLevel, validateLevel } from './runtime/levels.mjs';
import {brandPelicanBoot} from './boot.mjs';
import { newRun, input, steerTo, advance, sweptHit, newSave, loadSave, settle, cameraPose, qualityStep } from './runtime/adventure.mjs';

const tick=(r,seconds)=>{for(let t=0;t<seconds;t+=1/120)advance(r,1/120);};
test('five distinct safe courses: first-level traffic follows teaching; second level focuses on pedestrians',()=>{
 assert.equal(LEVELS.length,5);assert.equal(new Set(LEVELS.map(l=>l.distance)).size,5);
 for(const l of LEVELS){assert.deepEqual(validateLevel(makeLevel(l.id)),[]);assert.ok(l.fish[0].x/l.speed<=2.5);assert.ok(l.fish.length>=l.goal.count+4);}
 const openingTraffic=LEVELS[0].obstacles.filter(o=>['car','van'].includes(o.kind));
 assert.ok(openingTraffic.length>=3,'V4 retains alternating vehicle decisions');
 // Original authored obstacle IDs and the late 390m gate remain intact;
 // V7 intentionally adds two EARLY visible cars after an honest jump choice.
 assert.ok(openingTraffic.some(o=>o.x>=100));
 assert.equal(openingTraffic.filter(o=>o.x<100).length,2,
  'early cars create a second and third actual decision instead of idle riding');
 assert.ok(LEVELS[0].obstacles.some(o=>o.kind==='barrier'&&o.x<53),
  'the opening jump-or-detour exists before the first car');
 const allVehicles=LEVELS[1].obstacles.filter(o=>['car','van'].includes(o.kind));
 assert.equal(allVehicles.length,3,'two V7 early lane pressures plus original closing vehicle');
 assert.deepEqual(allVehicles.filter(o=>o.x<100).map(o=>o.x).sort((a,b)=>a-b),[53,67]);
 assert.ok(allVehicles.some(o=>o.x===390&&o.id==='l2-o14'));
 assert.ok(LEVELS[1].obstacles.some(o=>o.kind==='pedestrian'&&o.x===76));
 assert.equal(V7_OPENING_WAVES[1].length,3);
 assert.ok(LEVELS[2].obstacles.some(o=>o.kind==='car')&&LEVELS[2].obstacles.some(o=>o.kind==='van'));
 assert.equal(LEVELS[3].weather,'rain');assert.ok(LEVELS[4].hour>=18);assert.ok(LEVELS[4].hour<18.5,'dusk road must stay readable');
});
test('night two-gate fish path visibly rewards right-side preparation then demands a left escape',()=>{
 const night=LEVELS[4];
 const planned=[[351,2],[367,2],[383,2],[399,2],[415,2],[431,2],[447,2],[463,2],[479,2],[495,1],[511,0],[527,0]];
 for(const [x,lane] of planned){
  const fish=night.fish.find(f=>f.x===x&&!f.bonus&&!f.shoal);
  assert.ok(fish,`missing real authored route fish at ${x}m`);
  assert.equal(fish.lane,lane,`fish at ${x}m must guide the known open lane`);
  assert.equal(fish.z??LANES[fish.lane],LANES[lane],`fish at ${x}m is physically in its visible lane`);
 }
 const gates=[433,475,558].map(x=>night.obstacles.filter(o=>o.x===x&&['car','van'].includes(o.kind)));
 assert.deepEqual(gates.map(group=>group.map(o=>o.lane).sort()),[[0,1],[0,1],[1,2]],
  'safe 433/475m RIGHT then 558m LEFT exits are authored, not granted dynamically');
 assert.deepEqual(validateLevel(makeLevel(5)),[],'the entire harder five-level course must remain physically fair');
});
test('fairness validator rejects all blocked roads, unsafe fish and insufficient reaction spacing',()=>{
 const l=makeLevel(3);l.obstacles=[0,1,2].map(lane=>({id:'x'+lane,kind:'car',x:90,lane,speed:3}));assert.ok(validateLevel(l).some(x=>x.includes('blocked')));
 const f=makeLevel(3);f.obstacles=[{id:'bad',kind:'car',x:f.fish[0].x,lane:f.fish[0].lane,speed:0}];assert.ok(validateLevel(f).some(x=>x.includes('fish')));
});
test('one tap nudges a fractional road position and pause rejects steering',()=>{
 const r=newRun(1);input(r,'right');tick(r,.5);
 assert.equal(r.laneIndex,2);assert.ok(r.lane>.9&&r.lane<1.5);
 assert.ok(Math.abs(r.lane-LANES[2])>.2,'tap cannot magnetize to a painted lane');
 input(r,'right');tick(r,.6);assert.equal(r.laneIndex,2);
 input(r,'pause');const d=r.distance,target=r.laneTarget;input(r,'left');tick(r,2);
 assert.equal(r.distance,d);assert.equal(r.laneTarget,target);
 input(r,'resume');tick(r,.3);assert.ok(r.distance>d);
});

test('a buffered jump respects the target lane while physical steering is still settling',()=>{
 const r=newRun(1);
 r.distance=132;r.lane=-1.12;r.laneTarget=0;r.laneIndex=1;
 input(r,'jump');
 assert.equal(r.bufferedJump,'l1-o1','early jump must queue for the selected barrier rather than fire while the rider is drifting');
 assert.equal(r.vy,0);
 advance(r,.8);
 assert.ok(r.events.some(e=>e.type==='jump'&&e.objectId==='l1-o1'&&e.buffered===true));
 const cancelled=newRun(1);cancelled.distance=132;cancelled.lane=-1.12;cancelled.laneTarget=0;cancelled.laneIndex=1;
 input(cancelled,'jump');steerTo(cancelled,1.7);
 assert.equal(cancelled.bufferedJump,null,'leaving the reward lane must cancel the queued jump');
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
  }assert.equal(r.reason,'complete',`level ${level.id} at ${dt}: ${r.reason}; collision=${r.lastCollisionId} dist=${r.distance.toFixed(1)} lane=${r.lane.toFixed(2)}`);assert.equal(r.hits,0);}
});
test('camera tracks forward distance in a floating world, ignores jump height and follows lane gently',()=>{
 const a=cameraPose(0,390/844),b=cameraPose(1.7,390/844);
 assert.ok(a.position[0]<-6);assert.equal(a.fov,52);assert.ok(a.look[0]>=10);
 // A free-moving bike needs enough camera following to stay inside frame at
 // the road edge, but never shifts the full rider displacement abruptly.
 const follow=Math.abs(a.position[2]-b.position[2]),gaze=Math.abs(a.look[2]-b.look[2]);
 assert.ok(follow>.9&&follow<1.35,'camera follows ~65% of real lateral position');
 assert.ok(gaze>.95&&gaze<1.4,'road ahead remains framed during side steering');
});
test('star reward requires earned consecutive fishing and a real jump, not just elapsed seconds',()=>{
 const s=newSave(),minimal=newRun(1);minimal.phase='finished';minimal.reason='complete';minimal.count=minimal.level.goal.count;minimal.score=minimal.count;minimal.elapsed=35;settle(s,minimal);assert.equal(minimal.stars,1);
 const great=newRun(1);great.phase='finished';great.reason='complete';great.count=17;great.gold=2;great.score=20;great.elapsed=40;great.jumpedBarriers=1;great.bestStreak=4;settle(s,great);assert.equal(great.stars,3);
 const missingChain=newRun(1);missingChain.phase='finished';missingChain.reason='complete';missingChain.count=17;missingChain.gold=2;missingChain.jumpedBarriers=1;missingChain.bestStreak=3;missingChain.elapsed=35;settle(newSave(),missingChain);assert.equal(missingChain.stars,2,'high fish and genuine jump cannot fake a chain');
});
test('quality sheds expensive effects first and never falls below 1.25 pixels on DPR3',()=>{
 let q={tier:2,pr:1.5};q=qualityStep(q,28,3);assert.equal(q.tier,1);assert.equal(q.pr,1.5);q=qualityStep(q,28,3);assert.equal(q.tier,0);assert.equal(q.pr,1.5);q=qualityStep(q,28,3);assert.equal(q.pr,1.25);for(let i=0;i<10;i++)q=qualityStep(q,20,3);assert.equal(q.pr,1.25);
});

test('static coast boot appears before the old PC intro and old intro stays hidden',()=>{
 const source='<html><head><title>鹈鹕骑单车 · Pelican on a Bike</title>'+
 '<meta property="og:title" content="鹈鹕骑单车 · Pelican on a Bike" /></head>'+
 '<body class="bars"><section id="intro">old help</section></body></html>';
 const result=brandPelicanBoot(source);
 assert.ok(result.includes('<title>鹈鹕海岸冒险 · 自由骑行</title>'));
 assert.ok(result.includes('#intro,.hud,#guiHost,#help{display:none!important}'));
 assert.ok(result.indexOf('id="coast-boot"')<result.indexOf('id="intro"'));
 assert.equal((result.match(/id="coast-boot"/g)||[]).length,1);
 assert.throws(()=>brandPelicanBoot(result),/anchor changed/);
});

test('early 2.25-second mobile jump queue is real and cannot arm from too far away',()=>{
 const ready=newRun(1);
 ready.distance=124;ready.lane=0;ready.laneTarget=0;ready.laneIndex=1;
 input(ready,'jump');
 assert.equal(ready.bufferedJump,'l1-o1','player gets an actual visible two-second preparation window');
 assert.equal(ready.vy,0,'prepared touch must not trigger an immediate false jump');
 tick(ready,2);
 assert.ok(ready.events.some(e=>e.type==='jump'&&e.objectId==='l1-o1'&&e.buffered===true));
 const tooFar=newRun(1);
 tooFar.distance=120;input(tooFar,'jump');
 assert.equal(tooFar.bufferedJump,null,'jump cannot arm a hazard beyond the intentional 2.25s window');
 assert.ok(tooFar.vy>0,'ordinary early swipe remains a real jump');
});
