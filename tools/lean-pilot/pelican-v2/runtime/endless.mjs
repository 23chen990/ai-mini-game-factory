// Deterministic endless coast. Pressure rises by distance, never by player
// mistakes, currency or advertising. Each encounter retains a physical escape.
const LANES=[-1.7,0,1.7];
const DISTANCE_LIMIT=100000000;
const safeInt=n=>Number.isSafeInteger(n)&&n>=0&&n<=DISTANCE_LIMIT;
export const ENDLESS_TIERS=Object.freeze([
 Object.freeze({id:0,at:0,name:'海风热身',speed:8.3,gap:46,stagger:0}),
 Object.freeze({id:1,at:420,name:'潮汐转向',speed:8.8,gap:44,stagger:0}),
 Object.freeze({id:2,at:980,name:'逆风追鱼',speed:9.4,gap:42,stagger:4}),
 Object.freeze({id:3,at:1800,name:'海岸冲刺',speed:10,gap:40,stagger:7}),
 Object.freeze({id:4,at:3200,name:'破浪极限',speed:10.5,gap:38,stagger:8}),
]);
function hash(seed,index){
 let x=(seed^Math.imul(index+1,0x9e3779b1))>>>0;
 x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;
 x=Math.imul(x,0x846ca68b);x^=x>>>16;
 return x>>>0;
}
export function endlessTier(distance){
 const d=Number.isFinite(distance)?Math.max(0,distance):0;
 return ENDLESS_TIERS.findLast(tier=>d>=tier.at)??ENDLESS_TIERS[0];
}
export function endlessCruiseSpeed(distance){
 const tier=endlessTier(distance),previous=ENDLESS_TIERS[Math.max(0,tier.id-1)];
 const eased=Math.max(0,Math.min(1,(distance-tier.at)/110));
 // Gradual ramp rather than an instantaneous extra hit on crossing a gate.
 return previous.speed+(tier.speed-previous.speed)*eased;
}
export function createEndlessLevel(seed=1){
 const normalized=safeInt(seed)?seed:1;
 return {id:6,name:'无尽海岸',subtitle:'每日同一路况 · 风浪逐渐变强 · 挑战自己的最长距离',
  endless:true,seed:normalized,distance:DISTANCE_LIMIT,speed:ENDLESS_TIERS[0].speed,
  seconds:DISTANCE_LIMIT,goal:{count:0,gold:0},mastery:{jumps:0},
  reward:0,hour:15,weather:'clear',obstacles:[],fish:[]};
}
export function endlessSegment(seed,index,metres=100+index*75){
 if(!safeInt(seed)||!safeInt(index)||!safeInt(Math.floor(metres)))
  throw Error('Invalid endless generation');
 const h=hash(seed,index),tier=endlessTier(metres);
 // The first centre barrier forces a real decision at ~4.5s; the next
 // car blocks the first safe lane. Thereafter a deterministic safe gap
 // rotates without observing the player's location, spend or mistakes.
 const firstEscape=(hash(seed,0)&1)?0:2;
 const open=index===0?firstEscape:index===1?1:(seed+index)%3;
 const blocked=[0,1,2].filter(lane=>lane!==open);
 const chosen=index===0?[1]:index===1?[firstEscape]:blocked;
 const types=['barrier','car','van'];
 return {open,tier:tier.id,
  obstacles:chosen.map((lane,i)=>({lane,kind:index===0?'barrier':index===1?'car':types[(h>>>(i*5))%types.length],
   offset:i===1?tier.stagger:0})),
  gold:index>0&&index%5===0};
}
export function extendEndless(run,ahead=370){
 if(!run?.level?.endless||!run.endless||run.phase!=='running')return 0;
 let created=0;
 while(run.endless.nextX<run.distance+ahead&&run.endless.index<500000){
  const index=run.endless.index,x=run.endless.nextX;
  const segment=endlessSegment(run.endless.seed,index,x);
  for(const {lane,kind,offset} of segment.obstacles)run.obstacles.push({
   id:`endless-o-${index}-${lane}`,x:x+offset,kind,lane,
   speed:kind==='car'?1.7:kind==='van'?1.25:0,
   z:LANES[lane],hit:false,triggerAt:null,fallAt:null,passed:false});
  // A marked, always-open fish route lets a player read the whole encounter.
  // It cannot be a guaranteed pickup: steering is still manual and physical.
  for(const [slot,offset] of [[0,-18],[1,19]]){
   run.fishes.push({id:`endless-f-${index}-${slot}`,x:x+offset,
    lane:segment.open,golden:segment.gold&&slot===1,bonus:false,caught:false});
  }
  const tier=endlessTier(x);
  run.endless.index++;
  run.endless.nextX=x+tier.gap+(hash(run.endless.seed,index+5)%7);
  created++;
 }
 // Keep long rides smooth on low-end phones; the hazards still follow the
 // exact same world motion and swept collision rules as the five fixed stages.
 if(!Number.isFinite(run.endless.pruneAt)||run.distance>=run.endless.pruneAt){
  const minX=run.distance-90;
  run.obstacles=run.obstacles.filter(o=>o.x>=minX);
  run.fishes=run.fishes.filter(f=>f.x>=minX);
  run.endless.pruneAt=run.distance+20;
 }
 return created;
}
