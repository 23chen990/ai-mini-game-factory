import {makeLevel,LANES,BOUNDS} from './levels.mjs';
import {springLane,riderFeel,cameraTarget} from './feel.mjs';
import {fishPoints,fishRoadZ,normalizeBest,rateStars,updateBest} from './engagement.mjs';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
// Casual touch assist: early press arms only the next same-lane low barrier.
// The actual jump is still integrated by the normal collision/physics loop.
export const JUMP_BUFFER_SECONDS=1.45;
export const JUMP_TRIGGER_METERS=3.0;
export const FREE_ROAD_EDGE=2.15;
export const TAP_STEER_DISTANCE=1.18;
const nearestLane=z=>clamp(Math.round((z-LANES[0])/(LANES[1]-LANES[0])),0,2);
const event=(r,type,details={})=>{r.events.push({type,at:r.elapsed,distance:r.distance,...details});if(r.events.length>500)r.events.shift();};
export function newRun(id) {const level=makeLevel(id);return {phase:'running',level,laneIndex:1,lane:0,laneTarget:0,laneV:0,latAcc:0,lean:0,steer:0,yaw:0,distance:0,elapsed:0,count:0,gold:0,score:0,streak:0,bestStreak:0,nearMisses:0,jumpedBarriers:0,bufferedJump:null,y:0,vy:0,speed:level.speed,stun:0,hits:0,reason:null,events:[],fishes:level.fish.map(f=>({...f,caught:false})),obstacles:level.obstacles.map(o=>({...o,z:o.kind==='pedestrian'?(o.lane===2?3.6:-3.6):LANES[o.lane],hit:false,triggerAt:null,fallAt:null,passed:false})),settled:false,revives:0,reviveGrace:0}; }
// Original authorized bike allowed any road position, not three locked stops.
 // Lane indices now describe *where hazards are authored*, not legal rider positions.
export function steerTo(r, target, source='drag') {
 if(!r || r.phase!=='running' || r.stun>0 || !Number.isFinite(target))return false;
 const next=clamp(target,-FREE_ROAD_EDGE,FREE_ROAD_EDGE);
 if(Math.abs(next-r.laneTarget)<1e-6)return false;
 r.laneTarget=next;r.laneIndex=nearestLane(next);
 if(r.bufferedJump){
  const barrier=r.obstacles.find(o=>o.id===r.bufferedJump);
  if(!barrier || Math.abs(next-LANES[barrier.lane])>.72)r.bufferedJump=null;
 }
 // Held input is frame-rate frequent: keep the gameplay events bounded so
 // genuine fish and hazard feedback never disappears behind steering noise.
 if(source==='tap'||source==='finger-drag'&&Math.abs(next-(r.lastLoggedSteerTarget??0))>.48){
  r.lastLoggedSteerTarget=next;event(r,'steer-input',{target:next,source});
 }
 return true;
}
export function steerBy(r, offset, source='hold') {
 if(!Number.isFinite(offset))return false;
 return steerTo(r,(r?.laneTarget??0)+clamp(offset,-4.3,4.3),source);
}
export function input(r,action) {
 if(action==='pause'&&r.phase==='running'){r.phase='paused';event(r,'pause');return;}
 if(action==='resume'&&r.phase==='paused'){r.phase='running';event(r,'resume');return;}
 if(r.phase!=='running'||r.stun>0)return;
 if(action==='left'||action==='right'){
  // A tap nudges an intermediate road position. Longer holding and scene-drag
  // may stop anywhere; no invisible three-lane magnet is applied at release.
  steerBy(r,(action==='left'?-1:1)*TAP_STEER_DISTANCE,'tap');
 }
 if(action==='jump'&&r.y===0&&r.vy===0&&!r.bufferedJump){
  const next=r.obstacles.filter(o=>o.kind==='barrier'&&!o.hit&&!o.passed&&
    Math.abs(LANES[o.lane]-r.laneTarget)<.72&&o.x>r.distance).sort((a,b)=>a.x-b.x)[0];
  const remaining=next?(next.x-r.distance)/Math.max(r.speed,.01):Infinity;
  if(next&&remaining<=JUMP_BUFFER_SECONDS&&next.x-r.distance>JUMP_TRIGGER_METERS+.15&&Math.abs(r.laneTarget-LANES[next.lane])<.75){
   r.bufferedJump=next.id;event(r,'jump-buffered',{objectId:next.id});
  }else{r.vy=4.4;event(r,'jump');}
 }
}
export function sweptHit(a,b,hx,hz) {
 let min=0,max=1;
 for(const [key,half] of [['x',hx],['z',hz]]){const v=b[key]-a[key];if(Math.abs(v)<1e-9){if(Math.abs(a[key])>half)return false;continue;}
  let lo=(-half-a[key])/v,hi=(half-a[key])/v;if(lo>hi)[lo,hi]=[hi,lo];min=Math.max(min,lo);max=Math.min(max,hi);if(min>max)return false;
 }return true;
}
function finish(r,reason,object){r.phase='finished';r.reason=reason;r.speed=0;r.lastCollisionId=object?.id??null;event(r,reason==='complete'?'complete':'failed',{reason,objectId:object?.id,kind:object?.kind});}
// A revival is only granted by a verified rewarded-ad completion in the UI.
// Never revive an already settled run, a fish shortage, or a time-out.
export function canRevive(r){return !!r&&r.phase==='finished'&&!r.settled&&r.revives===0&&['vehicle','barrier'].includes(r.reason);}
export function revive(r){
 if(!canRevive(r))return false;
 const object=r.obstacles.find(o=>o.id===r.lastCollisionId);
 if(object){object.hit=true;object.passed=true;}
 r.revives=1;r.reviveGrace=2.5;r.phase='running';r.reason=null;r.speed=r.level.speed;
 r.stun=0;r.y=0;r.vy=0;r.bufferedJump=null;r.streak=0;
 r.laneTarget=r.lane;r.laneV=0;r.latAcc=0;
 event(r,'revived',{grace:r.reviveGrace});return true;
}
export function advance(r,seconds) {
 if(r.phase!=='running'||!Number.isFinite(seconds)||seconds<=0)return;
 let left=Math.min(seconds,2);
 while(left>1e-7&&r.phase==='running'){const dt=Math.min(left,1/120);left-=dt;step(r,dt);}
}
function step(r,dt){
 const oldD=r.distance,oldZ=r.lane,oldY=r.y;
 r.elapsed+=dt;
 if(r.reviveGrace>0)r.reviveGrace=Math.max(0,r.reviveGrace-dt);
 if(r.stun>0){r.stun=Math.max(0,r.stun-dt);r.speed=0;if(r.stun===0)event(r,'recovered');}
 else{r.speed=r.level.speed;r.distance=Math.min(r.level.distance,r.distance+r.speed*dt);}
 // Same continuous damped dynamics as the source, but with an actual analog
 // target. A 0.4m drag remains 0.4m; release never snaps back to lane centers.
 const previousV=r.laneV;
 const lateral=springLane(r.lane,r.laneV,r.laneTarget,dt,r.level.weather==='rain'?10.8:11.5);
 r.lane=clamp(lateral.position,-FREE_ROAD_EDGE,FREE_ROAD_EDGE);
 r.laneV=r.lane!==lateral.position?0:lateral.velocity;
 riderFeel(r,previousV,dt);
 if(r.bufferedJump){
  const target=r.obstacles.find(o=>o.id===r.bufferedJump);
  if(!target||target.hit||target.passed||target.lane!==r.laneIndex||r.stun>0)r.bufferedJump=null;
  else if(target.x-r.distance<=JUMP_TRIGGER_METERS){
   const objectId=r.bufferedJump;r.bufferedJump=null;r.vy=4.4;event(r,'jump',{objectId,buffered:true});
  }
 }
 if(r.y>0||r.vy>0){r.vy-=13*dt;r.y=Math.max(0,r.y+r.vy*dt);if(r.y===0){r.vy=0;event(r,'land');}}
 for(const o of r.obstacles){
  const oldX=o.x,oldOZ=o.z??LANES[o.lane];if(o.z===undefined)o.z=oldOZ;
  if(o.x-r.distance<85&&o.triggerAt===null||o.triggerAt===undefined&&o.x-r.distance<85)o.triggerAt=r.elapsed;
  if(o.triggerAt!==null&&o.triggerAt!==undefined&&!o.hit){
   if(o.kind==='car'||o.kind==='van')o.x-=o.speed*dt;
   if(o.kind==='pedestrian'&&!o.stationary){
    // A visible sidewalk wait, then a single clear crossing. Direction varies by authored side.
    const lead=Math.max(0,(o.x-r.distance)/r.level.speed);if(o.crossAt===undefined&&lead<3.4)o.crossAt=r.elapsed;
    const p=o.crossAt===undefined?0:clamp((r.elapsed-o.crossAt)/4.3,0,1);const sign=o.lane===2?-1:1;o.z=sign*(-3.6+7.2*p);
   }
  }
  if(o.hit||o.passed||r.stun>0)continue;
  const bounds=BOUNDS[o.kind];
  if(r.reviveGrace<=0&&sweptHit({x:oldX-oldD,z:oldOZ-oldZ},{x:o.x-r.distance,z:o.z-r.lane},bounds.x+.58,bounds.z+.27)){
   if(o.kind==='barrier'&&Math.min(oldY,r.y)>.31){o.jumped=true;continue;}
   o.hit=true;o.fallAt=r.elapsed;r.hits++;r.streak=0;
   if(o.kind==='pedestrian'){r.stun=3;r.speed=0;event(r,'pedestrian-hit',{objectId:o.id});}
   else {finish(r,o.kind==='barrier'?'barrier':'vehicle',o);return;}
  }
  // Record only genuinely close, collision-free lateral passes in the original
  // collision corridor. A distant harmless object earns nothing.
  if(r.reviveGrace<=0&&['car','van','barrier'].includes(o.kind) && !o.jumped &&
      Math.abs(o.x-r.distance)<bounds.x+.7){
    const clearance=Math.abs(o.z-r.lane)-(bounds.z+.27);
    if(clearance>=.035 && clearance<=.42)o.nearMiss=true;
  }
  if(o.x-r.distance<-(bounds.x+.75)){o.passed=true;
   const jumped=o.kind==='barrier'&&o.jumped===true;
   if(jumped)r.jumpedBarriers++;
   if(o.nearMiss&&!jumped){r.nearMisses++;r.score+=3;event(r,'near-miss',{objectId:o.id,points:3,count:r.nearMisses});}
   event(r,o.kind==='barrier'?'barrier-cleared':'obstacle-avoided',{objectId:o.id,kind:o.kind,jumped,combo:r.jumpedBarriers});}
 }
 // Fish use swept relative coordinates as well. No score is awarded after a terminal collision.
 for(const f of r.fishes){
  if(f.caught||f.forfeited||r.stun>0)continue;
  if(f.bonus){
   const source=r.obstacles.find(o=>o.id===f.sourceObstacleId);
   // A safe detour is valid progress, but it cannot award a jump-only prize.
   // Forfeit without resetting an ordinary fish streak or giving hidden points.
   if(!source?.jumped){if(source?.passed)f.forfeited=true;continue;}
  }
  if(!f.missed&&f.x-r.distance< -2.5){f.missed=true;r.streak=0;}
  if(sweptHit({x:f.x-oldD-.55,z:fishRoadZ(f)-oldZ},{x:f.x-r.distance-.55,z:fishRoadZ(f)-r.lane},.55,.63)&&r.y<.85){
   f.caught=true;r.count++;if(f.golden)r.gold++;
   r.streak++;r.bestStreak=Math.max(r.streak,r.bestStreak);
   const comboPoints=r.streak>=3&&r.streak%3===0?2:0;
   r.score+=fishPoints(f)+comboPoints;
   event(r,'fish-caught',{objectId:f.id,golden:f.golden,bonus:!!f.bonus,first:r.count===1,count:r.count,streak:r.streak,comboPoints});
  }
 }
 if(r.distance>=r.level.distance)finish(r,r.count<r.level.goal.count?'fish-short':r.gold<r.level.goal.gold?'gold-short':'complete');
 else if(r.elapsed>=r.level.seconds)finish(r,'timeout');
}
export function newSave() { return {version:2,unlocked:1,stars:[0,0,0,0,0],completed:[false,false,false,false,false],best:normalizeBest(null)}; }
export function loadSave(raw) {try{if(typeof raw!=='string'||raw.length>2500)return null;const s=JSON.parse(raw);if(s.version!==2||!Number.isInteger(s.unlocked)||s.unlocked<1||s.unlocked>5||!Array.isArray(s.stars)||s.stars.length!==5||s.stars.some(n=>!Number.isInteger(n)||n<0||n>3)||!Array.isArray(s.completed)||s.completed.length!==5||s.completed.some(x=>typeof x!=='boolean'))return null;return {version:2,unlocked:s.unlocked,stars:s.stars,completed:s.completed,best:normalizeBest(s.best)};}catch{return null;} }
export function settle(save,r) {
 if(r.phase!=='finished'||r.settled)return false;r.settled=true;r.rewardScore=r.score+(r.reason==='complete'?r.level.reward:0);
 if(r.reason==='complete'){save.unlocked=Math.max(save.unlocked,Math.min(5,r.level.id+1));save.completed[r.level.id-1]=true;
  const stars=rateStars(r.level,r);save.stars[r.level.id-1]=Math.max(save.stars[r.level.id-1],stars);r.stars=stars;}
 updateBest(save,r);
 return true;
}
export function cameraPose(lane,aspect) {return cameraTarget(lane,0,0,aspect,8);}
export function qualityStep(q,fps,dpr) {
 if(fps>=42)return q;
 if(q.tier>0)return {...q,tier:q.tier-1};
 return {...q,pr:Math.min(dpr,Math.max(1.25,q.pr-.25))};
}
