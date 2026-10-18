/* global structuredClone */
import {unsafeFishLanes} from './safety.mjs';
import {makeBarrierPrizes} from './engagement.mjs';
export {LANES} from './safety.mjs';
// Authored encounters, shared coast. Distances/timing/content are original to this project.
const definitions = [
 {id:1,name:'海岸出发',subtitle:'海岸挑战 · 连续吞鱼、跳障追金鱼、预判车流',mastery:{jumps:1},distance:300,speed:7.5,seconds:55,goal:{count:8,gold:0},hour:14,weather:'clear',reward:15,rows:[[90,'pedestrian',0],[140,'barrier',1],[162,'pedestrian',2],[233,'barrier',1],
  // V4 authored pressure beats are appended to keep the original obstacle IDs and QA evidence stable.
  // 75m optional left jump; then a right-vehicle/center-jump decision, later alternating safe gaps.
  [75,'barrier',0],[130,'car',2],[181,'car',1],[205,'barrier',0],[248,'van',2],[274,'car',1]]},
 {id:2,name:'行人出没',subtitle:'斑马线 · 看行人方向，躲避后追金鱼',mastery:{jumps:1},distance:420,speed:8,seconds:70,goal:{count:12,gold:1},hour:16,weather:'clear',reward:22,rows:[[76,'pedestrian',0],[134,'pedestrian',2],[192,'pedestrian',0],[246,'barrier',1],[298,'pedestrian',2],[356,'barrier',0]]},
 {id:3,name:'危险公路',subtitle:'危险公路 · 汽车换道，路障可跳',mastery:{jumps:1},distance:540,speed:8.8,seconds:82,goal:{count:17,gold:2},hour:15.5,weather:'clear',reward:30,rows:[[100,'car',1],[161,'pedestrian',0],[222,'van',2],[222,'barrier',1],[298,'car',0],[360,'barrier',2],[421,'van',1],[483,'car',2]]},
 {id:4,name:'雨中骑行',subtitle:'雨天路滑 · 提前变道，挑战连续两次跳障',mastery:{jumps:2},distance:630,speed:9.2,seconds:88,goal:{count:20,gold:2},hour:16.4,weather:'rain',reward:38,rows:[[100,'car',1],[162,'pedestrian',2],[225,'van',0],[225,'barrier',1],[294,'car',2],[350,'barrier',1],[410,'car',0],[410,'van',2],[478,'pedestrian',0],[536,'van',1],[593,'barrier',2]]},
 {id:5,name:'夜间赶海',subtitle:'夜间赶海 · 提前预判，追逐稀有金鱼',mastery:{jumps:2},distance:720,speed:9.6,seconds:95,goal:{count:24,gold:3},hour:18.38,weather:'dusk',reward:50,rows:[[95,'car',1],[151,'pedestrian',0],[210,'van',2],[210,'barrier',1],[276,'car',0],[334,'barrier',2],[396,'van',1],[454,'pedestrian',2],[475,'car',0],[475,'van',1],[584,'barrier',0],[644,'car',2],[694,'pedestrian',0]]},
];
// V5 authored pressure gates: a visibly open escape lane at every two-lane
// squeeze. Existing obstacle IDs stay stable because these rows are appended,
// not inserted into the legacy encounter arrays. There is no adaptive difficulty,
// hidden targeting or unavoidable three-lane wall; successful anticipation wins.
// Placement is checked by validateLevel, deterministic core routes and browser QA.
export const PRESSURE_GATES=Object.freeze({
 2:Object.freeze([
  [112,'barrier',1],[168,'barrier',2],
  [198,'barrier',1],[198,'barrier',2], // left gap
  [282,'barrier',0],[282,'barrier',1], // right gap
  [331,'barrier',0],[331,'barrier',2], // centre gap
  [390,'car',1],[390,'barrier',2], // visible late vehicle: blind centre jumping fails, LEFT gap remains
 ]),
 3:Object.freeze([
  [270,'car',0],[270,'van',1], // right gap after 222m legacy choke
  [335,'van',1],[335,'car',2], // left gap
  [398,'car',0],[398,'van',1], // right gap
  [510,'van',1],[510,'car',2], // left gap, final approach
 ]),
 4:Object.freeze([
  [275,'van',0],[275,'car',2], // centre gap
  [320,'car',0],[320,'van',2], // centre gap before centre barrier at 350m
  [444,'car',0],[444,'van',1], // right gap
  [499,'van',1],[499,'car',2], // left gap
 ]),
 5:Object.freeze([
  [145,'car',0],[145,'van',2], // centre gap
  [303,'car',0],[303,'van',1], // right gap
  [433,'car',0],[433,'van',1], // right gap
  [558,'van',1],[558,'car',2], // left gap after 475m
 ]),
});
// V7 authored opening decision waves. Start a real physical risk in ~4-5s,
// followed by two different hazards while the player is still recovering from
// the first action. Keep old barrier IDs stable for saved QA target mapping.
// NEVER spawn dynamically to punish a player, and never close all three lanes.
// Alternative fish/jump lines are earned using the same authoritative physics.
export const V7_OPENING_WAVES=Object.freeze({
 1:Object.freeze([[35,'barrier',1],[65,'car',0],[80,'car',2]]),
 2:Object.freeze([[35,'barrier',1],[53,'car',0],[67,'car',2]]),
 3:Object.freeze([[37,'barrier',1],[57,'car',2],[75,'car',0]]),
 4:Object.freeze([[38,'barrier',1],[57,'van',2],[77,'car',0]]),
 5:Object.freeze([[38,'barrier',1],[57,'van',2],[76,'car',0]]),
});
// V7 midcourse pressure: 16 physically verified hazard beats inserted into
// previously sparse intervals. Every old obstacle ID and exact jump prize
// remains unchanged: all V7 hazards are appended, never retargeted.
export const V7_MIDCOURSE_WAVES=Object.freeze({
 1:Object.freeze([[110,'barrier',1],[219,'car',2]]),
 2:Object.freeze([[219,'barrier',0],[314,'barrier',1]]),
 3:Object.freeze([[132,'barrier',2],[190,'car',2],[448,'barrier',1]]),
 4:Object.freeze([[130,'barrier',2],[190,'car',1],[380,'barrier',2],[566,'car',1]]),
 5:Object.freeze([[184,'car',1],[239,'barrier',2],[366,'barrier',0],[515,'car',2],[611,'barrier',1]]),
});
export const BOUNDS = {car:{x:1.5,z:.63},van:{x:1.8,z:.66},pedestrian:{x:.25,z:.25},barrier:{x:.24,z:.59}};
// Conservative envelopes include approach motion, player body and pedestrian crossing.
export function unsafeLanes(obstacles,x) { return unsafeFishLanes(obstacles,x); }
// Distinct, deterministic reward routes; dangerous lanes always override fish placement.
// A genuinely playable night route: after the earned 334m RIGHT jump and
// its 343m fish, stay RIGHT before the 396m centre van and both 433/475m
// left+centre traffic gates. The former 351-383m left-fish temptation
// trapped first-time riders on the LEFT when both warning lanes turned red.
// The 495m centre then 511/527m left fish make the next 558m left opening
// a deliberate two-turn decision. All fish are physical, earned and safe;
// no magnet, collision forgiveness or dynamic difficulty is introduced.
export const NIGHT_SAFE_FISH_TRAIL=Object.freeze({351:2,367:2,383:2,399:2,415:2,431:2,447:2,463:2,479:2,495:1,511:0,527:0});
const FISH_PATTERNS = [
 [1,2,0,1,2,0,2,1], // genuine left/right decisions after the first three tutorial fish
 [1,2,2,1,0,0,2,1], // alternating crossings
 [1,0,1,2,2,0,1,2], // vehicles
 [1,2,0,2,0,1,2,1], // rain
 [1,2,0,2,0,1,0,2], // dusk
];
export const LEVELS=definitions.map(d=>{
 const obstacles=[...d.rows,...(PRESSURE_GATES[d.id]??[]),...(V7_OPENING_WAVES[d.id]??[]),...(V7_MIDCOURSE_WAVES[d.id]??[])].map(([x,kind,lane],i)=>({id:`l${d.id}-o${i}`,x,kind,lane,speed:kind==='car'?1.7:kind==='van'?1.25:0}));
 const fish=[];let lastLane=1;const pattern=FISH_PATTERNS[d.id-1];
 const crossesBlocked=(from,to,bad)=>Array.from({length:Math.abs(from-to)+1},(_,j)=>Math.min(from,to)+j).some(l=>bad.has(l));
 for(let x=15,i=0;x<d.distance-10;x+=16,i++){
  const bad=unsafeLanes(obstacles,x);let lane=i<3?1:pattern[Math.floor(i/2)%pattern.length];
  if(d.id===5&&Object.prototype.hasOwnProperty.call(NIGHT_SAFE_FISH_TRAIL,x))lane=NIGHT_SAFE_FISH_TRAIL[x];
  // Do not lure the player across a blocked middle lane to reach an apparently safe fish.
  if(crossesBlocked(lastLane,lane,bad))lane=[lastLane,1,2,0].find(l=>!crossesBlocked(lastLane,l,bad))??[1,2,0].find(l=>!bad.has(l))??2;
  lastLane=lane;fish.push({id:`l${d.id}-f${i}`,x,lane,golden:i>1&&i%7===3});
 }
 // A rider who never touches the steering should not take every tutorial fish.
 // First fish remains central and easy; these next two fish are physically
 // between the painted lane centres. 'lane' is a HUD zone, not a magnet.
 if(d.id===1){
  const turnRight=fish.find(f=>f.x===31),comeBack=fish.find(f=>f.x===47);
  if(turnRight)Object.assign(turnRight,{lane:2,z:.98});
  if(comeBack)Object.assign(comeBack,{lane:1,z:.35});
 }
 // Five authored, safely separated shoal beats give the first level active side routes,
 // instead of rewarding an idle middle-lane ride. No special fish is auto-collected.
 if(d.id===1){
  for(const [x,lane,golden] of [[81,1,false],[117,0,false],[194,2,false],[211,1,false],[253,0,true],[284,2,false]]){
   if(!unsafeLanes(obstacles,x).has(lane))fish.push({id:`l1-shoal-${x}`,x,lane,golden,shoal:true});
  }
 }
 // The level-2 exit after the 356m jump gives one extra REAL catch
 // along the only safe lane. It rewards staying on the earned prize route
 // instead of lowering the immutable 17-fish three-star requirement.
 if(d.id===2){
  const x=372,lane=0;
  if(!unsafeLanes(obstacles,x).has(lane))
   fish.push({id:'l2-prize-trail-372',x,lane,golden:false,shoal:true});
 }
 // A late first-level four-fish sprint can only be earned by taking the
 // LEFT clear exit after the optional 233m jump. It preserves the real
 // 4-catch mastery rule while rewarding holding a chosen lane instead of
 // a lottery of software-rendered reaction frames.
 if(d.id===1){
  for(const x of [260,264,267]){
   if(!unsafeLanes(obstacles,x).has(0))
    fish.push({id:`l1-clean-exit-${x}`,x,lane:0,golden:false,shoal:true});
  }
 }
 // V5 high-risk coast: short fish trains reward riders who commit to an
 // actual safe collecting route. The repeated catches are physical objects,
 // not free score or changes to the three-star requirement.
 if(d.id===5){
  for(const x of [79,159,239,319,463,639,671,687]){
   const leader=fish.find(f=>f.x===x);
   if(!leader)continue;
   const followed=x+3;
   if(unsafeLanes(obstacles,followed).has(leader.lane))continue;
   fish.push({id:`l5-trail-${x}`,x:followed,lane:leader.lane,z:leader.z,golden:false,shoal:true});
  }
 }
 // V7 extra catch on the real safe CENTRE approach before the 222m barrier.
 // This ordinary fish requires manual riding and does not grant jump gold.
 if(d.id===3){
  const x=211,lane=1;
  if(!unsafeLanes(obstacles,x).has(lane))
   fish.push({id:'l3-v7-escape-trail-211',x,lane,golden:false,shoal:true});
 }
 // Optional visible golden fish behind barriers; never required for one-star completion.
 fish.push(...makeBarrierPrizes(d.id,obstacles,d.distance));
 fish.sort((a,b)=>a.x-b.x);
 const {rows: _rows,...config}=d; void _rows;
 return Object.freeze({...config,fish,obstacles});
});
export function makeLevel(id) {const l=LEVELS.find(l=>l.id===id);if(!l)throw Error('Unknown level');return structuredClone(l);}
export function validateLevel(l) {
 const errors=[];if(l.fish.length<l.goal.count+4)errors.push('fish supply insufficient');
 for(const f of l.fish){const other=l.obstacles.filter(o=>o.id!==f.sourceObstacleId);if(unsafeLanes(other,f.x).has(f.lane))errors.push('unsafe fish '+f.id);}
 const groups=[];for(const o of [...l.obstacles].sort((a,b)=>a.x-b.x)){let g=groups.at(-1);if(!g||o.x-g.x>12){g={x:o.x,lanes:new Set()};groups.push(g);}if(o.kind!=='pedestrian')g.lanes.add(o.lane);}
 let reachable=new Set([0,1,2]),prev=0;
 for(const g of groups){const free=[0,1,2].filter(i=>!g.lanes.has(i));if(!free.length)errors.push('blocked all lanes at '+g.x);
  const next=new Set(free.filter(to=>[...reachable].some(from=>(g.x-prev)/l.speed>=.65+Math.abs(to-from)*.3)));
  if(!next.size)errors.push('blocked reaction path at '+g.x);reachable=next;prev=g.x;
 }
 return errors;
}
