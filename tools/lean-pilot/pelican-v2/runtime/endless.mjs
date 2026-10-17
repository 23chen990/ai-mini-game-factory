// Original, deterministic coast segments. No hidden difficulty targeting or advertising.
const LANES=[-1.7,0,1.7];
const DISTANCE_LIMIT=100000000;
const safeInt=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000000;
function hash(seed,index){
 let x=(seed^Math.imul(index+1,0x9e3779b1))>>>0;
 x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;
 x=Math.imul(x,0x846ca68b);x^=x>>>16;
 return x>>>0;
}
export function createEndlessLevel(seed=1){
 const normalized=safeInt(seed)?seed:1;
 return {id:6,name:'无尽海岸',subtitle:'自由骑行 · 没有固定终点 · 安全绕行与捕鱼纪录',
  endless:true,seed:normalized,distance:DISTANCE_LIMIT,speed:8.3,seconds:DISTANCE_LIMIT,
  goal:{count:0,gold:0},mastery:{jumps:0},reward:0,hour:15,weather:'clear',
  obstacles:[],fish:[]};
}
export function endlessSegment(seed,index){
 if(!safeInt(seed)||!safeInt(index))throw Error('Invalid endless generation');
 const h=hash(seed,index),open=index<2?1:h%3,types=['barrier','car','van'];
 // A single danger in the first two encounters; thereafter two blocked lanes
 // with a guaranteed, readable open route. Never more than one hazard per lane.
 const blocked=[0,1,2].filter(l=>l!==open);
 const chosen=index<2?[blocked[h%2]]:blocked;
 return {open,obstacles:chosen.map((lane,i)=>({lane,kind:types[(h>>>i*4)%types.length]})),
  gold:index>0&&index%5===0};
}
export function extendEndless(run,ahead=370){
 if(!run?.level?.endless||!run.endless||run.phase!=='running')return 0;
 let created=0;
 while(run.endless.nextX<run.distance+ahead&&run.endless.index<500000){
  const index=run.endless.index,x=run.endless.nextX;
  const segment=endlessSegment(run.endless.seed,index);
  for(const {lane,kind} of segment.obstacles)run.obstacles.push({
   id:`endless-o-${index}-${lane}`,x,kind,lane,speed:kind==='car'?1.7:kind==='van'?1.25:0,
   z:LANES[lane],hit:false,triggerAt:null,fallAt:null,passed:false});
  // Both fish sit on the actual unobstructed lane, not between blocked lanes.
  // The earlier fish is an optional route cue, not a collision-avoidance oracle.
  for(const [slot,offset] of [[0,-26],[1,16]]){
   run.fishes.push({id:`endless-f-${index}-${slot}`,x:x+offset,
    lane:segment.open,golden:segment.gold&&slot===1,bonus:false,caught:false});
  }
  run.endless.index++;
  run.endless.nextX=x+72+(hash(run.endless.seed,index+5)%12);
  created++;
 }
 // Bound long-session memory; terminal obstacles and last ~90m remain available.
 const minX=run.distance-90;
 run.obstacles=run.obstacles.filter(o=>o.x>=minX);
 run.fishes=run.fishes.filter(f=>f.x>=minX);
 return created;
}
