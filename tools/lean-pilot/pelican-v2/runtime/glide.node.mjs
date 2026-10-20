import test from 'node:test';
import {URL} from 'node:url';
import assert from 'node:assert/strict';
import {newRun,input,advance,steerTo} from './adventure.mjs';
import {LEVELS,validateLevel,makeLevel} from './levels.mjs';
import {syncRidePose} from './feel.mjs';
import {readFile} from 'node:fs/promises';

// Isolated physics fixtures, not natural-play or player enjoyment evidence.
function flight({hold=false,releaseAt=Infinity,dt=1/60}={}){
 const r=newRun(1);r.obstacles=[];r.fishes=[];
 input(r,'jump');if(hold)input(r,'wing-hold');
 while(r.elapsed<2){
  if(r.elapsed>=releaseAt)input(r,'wing-release');
  advance(r,dt);
  if(r.events.some(e=>e.type==='land'))break;
 }
 return r;
}
test('holding jump adds a bounded, physically integrated glide; a tap stays unchanged',()=>{
 const tap=flight(),held=flight({hold:true});
 assert.ok(tap.elapsed>.60&&tap.elapsed<.72,'original tap arc');
 assert.ok(held.elapsed>tap.elapsed+.30,'wing hold must change actual flight time');
 assert.ok(held.elapsed<1.4,'not indefinite flight');
 assert.equal(held.gliding,false);
 assert.equal(held.wingHeld,false,'landing consumes the hold; cannot auto-hop');
 assert.equal(held.events.filter(e=>e.type==='glide-start').length,1);
});
test('release drops early; repressing cannot refill the per-jump wing budget',()=>{
 const short=flight({hold:true,releaseAt:.55}),full=flight({hold:true});
 assert.ok(short.elapsed<full.elapsed-.10);
 const r=newRun(1);r.obstacles=[];r.fishes=[];input(r,'jump');
 for(let frame=0;frame<90;frame++){
  input(r,frame%4===0?'wing-release':'wing-hold');
  advance(r,1/60);
 }
 assert.equal(r.y,0);
 assert.ok(r.glideTime<=.56);
 assert.equal(r.events.filter(e=>e.type==='jump').length,1);
});
test('glide uses active simulation time at 15/30/60/120Hz and pauses honestly',()=>{
 const durations=[15,30,60,120].map(hz=>flight({hold:true,dt:1/hz}).elapsed);
 assert.ok(Math.max(...durations)-Math.min(...durations)<.08);
 const r=newRun(1);r.obstacles=[];r.fishes=[];input(r,'jump');input(r,'wing-hold');
 advance(r,.45);assert.equal(r.gliding,true);
 input(r,'pause');const at=r.elapsed,y=r.y;
 advance(r,1);assert.equal(r.elapsed,at);assert.equal(r.y,y);
 assert.equal(r.wingHeld,false,'pause/cancel must not leave a phantom held finger');
 input(r,'resume');advance(r,.35);assert.equal(r.y,0);
});
test('a glide can correct lateral position but cannot jump through a vehicle',()=>{
 const r=newRun(1);r.fishes=[];r.obstacles=[];input(r,'jump');input(r,'wing-hold');
 advance(r,.4);steerTo(r,1.18);advance(r,.3);
 assert.ok(r.y>.2);assert.ok(r.lane>.7);
 const car=newRun(1);car.fishes=[];
 car.obstacles=[{id:'actual-car',x:6,lane:1,z:0,kind:'car',speed:0,triggerAt:null,hit:false,passed:false}];
 input(car,'jump');input(car,'wing-hold');advance(car,1);
 assert.equal(car.reason,'vehicle');
 assert.equal(car.lastCollisionId,'actual-car');
});
test('authored air fish need real height; a ground pass cannot collect or break a normal streak',()=>{
 const r=newRun(1);r.obstacles=[];
 r.fishes=[{id:'air',x:6.8,lane:1,golden:false,airborne:true,caught:false}];
 r.streak=3;advance(r,1.4);
 assert.equal(r.count,0);assert.equal(r.streak,3);
 const fly=newRun(1);fly.obstacles=[];
 fly.fishes=[{id:'air',x:6.8,lane:1,golden:false,airborne:true,caught:false}];
 input(fly,'jump');input(fly,'wing-hold');advance(fly,1.3);
 assert.equal(fly.count,1);assert.equal(fly.airCatches,1);
 assert.ok(fly.events.some(e=>e.type==='fish-caught'&&e.airborne));
});
test('every campaign has a safe optional air route without replacing existing jump prizes',()=>{
 for(const level of LEVELS){
  assert.ok(level.fish.some(f=>f.airborne),'missing air choice in level '+level.id);
  assert.deepEqual(validateLevel(makeLevel(level.id)),[]);
  for(const f of level.fish.filter(f=>f.airborne)){
   assert.equal(f.golden,false,'not a substitute for earned gold');
   const source=level.obstacles.find(o=>o.id===f.sourceObstacleId);
   assert.equal(source.kind,'barrier');
   assert.ok(f.x-source.x>=(level.id===1?3.3:4)-1e-9&&f.x-source.x<=7);
   assert.ok(level.fish.some(p=>p.sourceObstacleId===source.id&&p.golden&&p.bonus));
  }
 }
 const teaching=LEVELS[0].fish.filter(f=>f.airborne&&f.sourceObstacleId==='l1-o13');
 assert.equal(new Set(teaching.map(f=>f.z)).size,1,'first wing line only teaches hold/release');
 for(const level of LEVELS.slice(1)){
  const line=level.fish.filter(f=>f.airborne).slice(0,2);
  assert.ok(Math.abs(line[1].z-line[0].z)>.63,'later air lines add a genuine lateral reach decision');
 }
});
test('native rider pose and all input release paths carry the actual wing state',async()=>{
 const state={};const r=flight({hold:true});
 r.gliding=true;syncRidePose(state,r);
 assert.equal(state.gliding,true);
 const ui=await readFile(new URL('./coast-ui.mjs',import.meta.url),'utf8');
 assert.match(ui,/input\(run,'wing-hold'\)/);
 assert.match(ui,/input\(run,'wing-release'\)/);
 assert.match(ui,/pointercancel.*lostpointercapture/);
 assert.match(ui,/keyup[\s\S]*wing-release/);
 assert.match(ui,/co-wing-meter/);
 const build=await readFile(new URL('../build.mjs',import.meta.url),'utf8');
 assert.ok(build.includes('trick: S.gliding ? 1 : S.trick'),'native articulated wings, not a decorative text-only skill');
});
