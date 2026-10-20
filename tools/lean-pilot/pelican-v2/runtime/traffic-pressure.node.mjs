import {URL} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newRun, advance, input, steerTo} from './adventure.mjs';
import {LEVELS, LANES} from './levels.mjs';
import {hazardForecast} from './safety.mjs';

function isolatedCar(id='l1-o11') {
 const r=newRun(1);
 r.obstacles=r.obstacles.filter(o=>o.id===id);r.fishes=[];
 steerTo(r,2.15);
 return r;
}
function until(r,seconds,fps=60) {
 while(r.elapsed<seconds-1e-6&&r.phase==='running')advance(r,Math.min(1/fps,seconds-r.elapsed));
}

test('default first-level pace is a deliberate 50-second ride, not a 40-second scroll',()=>{
 const l=LEVELS[0];
 assert.equal(l.speed,6);
 assert.equal(l.distance/l.speed,50);
 assert.ok(l.seconds>=l.distance/l.speed+9);
 assert.deepEqual(LEVELS.slice(1).map(l=>l.speed),[8,8.8,9.2,9.6],
  'this is a first-level experiment, not an untested five-level retune');
});

test('first-level vehicle has its own world motion and arrives at its authored encounter',()=>{
 const r=isolatedCar(),car=r.obstacles[0],startX=car.x;
 until(r,1);
 assert.ok(Math.abs(startX-car.x-4.6)<.001,'car must actually drive 4.6m along the road');
 until(r,65/r.level.speed);
 assert.ok(Math.abs(car.x-r.distance)<.01,'authored 65m means encounter, not an early surprise');
});

test('a signalled merge changes physical lateral position before collision, independent of rider',()=>{
 for(const fps of [15,30,60,120]){
  const r=isolatedCar(),car=r.obstacles[0];
  assert.equal(car.z,0,'left-bound first car starts in centre');
  until(r,65/6-3.2,fps);
  assert.equal(car.trafficPhase,'signal');
  assert.equal(car.z,0,'signal precedes movement');
  const forecast=hazardForecast(car,r);
  assert.deepEqual(forecast.lanes,[0],'announce destination, not abandoned lane');
  until(r,65/6-1.5,fps);
  assert.equal(car.trafficPhase,'merging');
  assert.ok(car.z<-.4&&car.z>-1.3,'continuous merge, not lane teleport');
  until(r,65/6-.8,fps);
  assert.equal(car.trafficPhase,'settled');
  assert.ok(Math.abs(car.z-LANES[0])<.001);
  assert.equal(r.phase,'running','opposite side is physically safe');
 }
});

test('moving traffic freezes on pause and replay resets its own motion and signal',()=>{
 const r=isolatedCar();until(r,8);input(r,'pause');
 const before=JSON.stringify(r.obstacles);advance(r,1);
 assert.equal(JSON.stringify(r.obstacles),before);
 const fresh=isolatedCar();
 assert.equal(fresh.obstacles[0].z,0);
 assert.equal(fresh.obstacles[0].trafficPhase,'approach');
});

test('a jump still clears a real barrier at the slower cycling pace',()=>{
 for(const fps of [15,30,60,120]){
  const r=newRun(1);r.obstacles=r.obstacles.filter(o=>o.id==='l1-o13');r.fishes=[];
  until(r,(110-6)/6,fps);input(r,'jump');
  until(r,113/6,fps);
  assert.equal(r.phase,'running',`slower pace must not land inside barrier at ${fps}Hz`);
  assert.equal(r.jumpedBarriers,1);
 }
});

test('traffic own-motion, signal and earned escape are wired into actual renderer',()=>{
 const ui=readFileSync(new URL('./coast-ui.mjs',import.meta.url),'utf8');
 assert.match(ui,/wheel\.rotation\.z\s*=\s*-run\.elapsed\*o\.speed/);
 assert.match(ui,/trafficPhase==='signal'\|\|o\.trafficPhase==='merging'/);
 assert.match(ui,/id="co-escape"/);
 assert.match(ui,/escapeFeedback\(e\)/);
 assert.match(ui,/if\(sound&&!audio\.ctx\)api\.ensureAudio\(\)/,
  'sound must start under an actual start gesture, not autoplay before consent');
});

// Learned input-only route. Engineering reachability, not human enjoyment.
export const PRESSURE_ROUTE=[
 [16,'right'],[39,'left'],[104,'jump'],[104,'wing-hold'],[116,'wing-release'],
 [134,'jump'],[168,'right'],[185,'left'],[188,'left'],[199,'jump'],[215,'right'],
 [227,'jump'],[227,'wing-hold'],[240,'wing-release'],[245,'left'],[278,'right'],[281,'right'],
];
test('new first-level traffic has a clean skill route with real gold, air catches and replayable score',()=>{
 for(const fps of [15,30,60,120]){
  const r=newRun(1);let index=0;
  while(r.phase==='running'){
   while(index<PRESSURE_ROUTE.length&&r.distance>=PRESSURE_ROUTE[index][0])
    input(r,PRESSURE_ROUTE[index++][1]);
   advance(r,1/fps);
  }
  assert.equal(r.reason,'complete');
  assert.equal(r.hits,0);
  assert.ok(r.count>=12&&r.gold>=1&&r.bestStreak>=4);
  assert.equal(r.jumpedBarriers,4);
  assert.ok(r.airCatches>=3);
  assert.ok(r.events.some(e=>e.type==='near-miss'));
  for(const car of r.obstacles.filter(o=>o.mergeFrom!==undefined)){
   assert.ok(car.passed);
   assert.deepEqual(r.events.filter(e=>e.objectId===car.id&&e.type.startsWith('traffic-'))
    .map(e=>e.type),['traffic-signal','traffic-merging','traffic-settled']);
  }
 }
});

test('ignoring the final merge destination causes an attributable vehicle collision, even airborne',()=>{
 for(const fps of [15,30,60,120]){
  const r=isolatedCar();steerTo(r,-1.7);
  until(r,65/6-.4,fps);input(r,'jump');input(r,'wing-hold');
  until(r,65/6+1,fps);
  assert.equal(r.reason,'vehicle');assert.equal(r.lastCollisionId,'l1-o11');
  assert.ok(r.events.find(e=>e.type==='traffic-signal'));
  assert.ok(r.events.find(e=>e.type==='traffic-settled'));
 }
});

test('merge direction occupies its own compact radar slot rather than wrapping the countdown',()=>{
 const ui=readFileSync(new URL('./coast-ui.mjs',import.meta.url),'utf8');
 const css=readFileSync(new URL('./coast.css',import.meta.url),'utf8');
 assert.ok(ui.includes('class="co-turn"'));
 assert.ok(ui.includes('new THREE.ConeGeometry(.22,.4,4)'));
 assert.match(css,/#co-radar \.co-lane\.warning::after\{position:absolute/);
});

test('portrait radar reserves width for the full jump-reward icon and decimal countdown',()=>{
 const css=readFileSync(new URL('./coast.css',import.meta.url),'utf8');
 assert.ok(css.includes('#coast[data-phase="running"] #co-radar .co-lane{width:64px}'));
});
