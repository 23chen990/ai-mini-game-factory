import {makeLevel,LANES,BOUNDS} from './levels.mjs';
import {springLane,riderFeel,cameraTarget} from './feel.mjs';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const event=(r,type,details={})=>{r.events.push({type,at:r.elapsed,distance:r.distance,...details});if(r.events.length>500)r.events.shift();};
export function newRun(id) {const level=makeLevel(id);return {phase:'running',level,laneIndex:1,lane:0,laneV:0,latAcc:0,lean:0,steer:0,yaw:0,distance:0,elapsed:0,count:0,gold:0,score:0,y:0,vy:0,speed:level.speed,stun:0,hits:0,reason:null,events:[],fishes:level.fish.map(f=>({...f,caught:false})),obstacles:level.obstacles.map(o=>({...o,z:o.kind==='pedestrian'?(o.lane===2?3.6:-3.6):LANES[o.lane],hit:false,triggerAt:null,fallAt:null,passed:false})),settled:false}; }
export function input(r,action) {
 if(action==='pause'&&r.phase==='running'){r.phase='paused';event(r,'pause');return;}
 if(action==='resume'&&r.phase==='paused'){r.phase='running';event(r,'resume');return;}
 if(r.phase!=='running'||r.stun>0)return;
 if(action==='left'||action==='right'){r.laneIndex=clamp(r.laneIndex+(action==='left'?-1:1),0,2);event(r,'lane-input',{lane:r.laneIndex});}
 if(action==='jump'&&r.y===0){r.vy=4.4;event(r,'jump');}
}
export function sweptHit(a,b,hx,hz) {
 let min=0,max=1;
 for(const [key,half] of [['x',hx],['z',hz]]){const v=b[key]-a[key];if(Math.abs(v)<1e-9){if(Math.abs(a[key])>half)return false;continue;}
  let lo=(-half-a[key])/v,hi=(half-a[key])/v;if(lo>hi)[lo,hi]=[hi,lo];min=Math.max(min,lo);max=Math.min(max,hi);if(min>max)return false;
 }return true;
}
function finish(r,reason,object){r.phase='finished';r.reason=reason;r.speed=0;event(r,reason==='complete'?'complete':'failed',{reason,objectId:object?.id,kind:object?.kind});}
export function advance(r,seconds) {
 if(r.phase!=='running'||!Number.isFinite(seconds)||seconds<=0)return;
 let left=Math.min(seconds,2);
 while(left>1e-7&&r.phase==='running'){const dt=Math.min(left,1/120);left-=dt;step(r,dt);}
}
function step(r,dt){
 const oldD=r.distance,oldZ=r.lane,oldY=r.y;
 r.elapsed+=dt;
 if(r.stun>0){r.stun=Math.max(0,r.stun-dt);r.speed=0;if(r.stun===0)event(r,'recovered');}
 else{r.speed=r.level.speed;r.distance=Math.min(r.level.distance,r.distance+r.speed*dt);}
 // Continuous-velocity critically damped spring: one tap still moves exactly one lane.
 const previousV=r.laneV;
 const lateral=springLane(r.lane,r.laneV,LANES[r.laneIndex],dt,r.level.weather==='rain'?13.7:14.5);
 r.lane=clamp(lateral.position,LANES[0],LANES[2]);r.laneV=lateral.velocity;
 riderFeel(r,previousV,dt);
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
  if(sweptHit({x:oldX-oldD,z:oldOZ-oldZ},{x:o.x-r.distance,z:o.z-r.lane},bounds.x+.58,bounds.z+.27)){
   if(o.kind==='barrier'&&Math.min(oldY,r.y)>.31){continue;}
   o.hit=true;o.fallAt=r.elapsed;r.hits++;
   if(o.kind==='pedestrian'){r.stun=3;r.speed=0;event(r,'pedestrian-hit',{objectId:o.id});}
   else {finish(r,o.kind==='barrier'?'barrier':'vehicle',o);return;}
  }
  if(o.x-r.distance<-(bounds.x+.75)){o.passed=true;event(r,o.kind==='barrier'?'barrier-cleared':'obstacle-avoided',{objectId:o.id,kind:o.kind,jumped:o.kind==='barrier'&&r.y>.31});}
 }
 // Fish use swept relative coordinates as well. No score is awarded after a terminal collision.
 for(const f of r.fishes){if(f.caught||r.stun>0)continue;
  if(sweptHit({x:f.x-oldD-.55,z:LANES[f.lane]-oldZ},{x:f.x-r.distance-.55,z:LANES[f.lane]-r.lane},.55,.58)&&r.y<.85){f.caught=true;r.count++;if(f.golden)r.gold++;r.score+=f.golden?5:1;event(r,'fish-caught',{objectId:f.id,golden:f.golden});}}
 if(r.distance>=r.level.distance)finish(r,r.count<r.level.goal.count?'fish-short':r.gold<r.level.goal.gold?'gold-short':'complete');
 else if(r.elapsed>=r.level.seconds)finish(r,'timeout');
}
export function newSave() { return {version:2,unlocked:1,stars:[0,0,0,0,0],completed:[false,false,false,false,false]}; }
export function loadSave(raw) {try{if(typeof raw!=='string'||raw.length>1500)return null;const s=JSON.parse(raw);if(s.version!==2||!Number.isInteger(s.unlocked)||s.unlocked<1||s.unlocked>5||!Array.isArray(s.stars)||s.stars.length!==5||s.stars.some(n=>!Number.isInteger(n)||n<0||n>3)||!Array.isArray(s.completed)||s.completed.length!==5||s.completed.some(x=>typeof x!=='boolean'))return null;return {version:2,unlocked:s.unlocked,stars:s.stars,completed:s.completed};}catch{return null;} }
export function settle(save,r) {
 if(r.phase!=='finished'||r.settled)return false;r.settled=true;r.rewardScore=r.score+(r.reason==='complete'?r.level.reward:0);
 if(r.reason==='complete'){save.unlocked=Math.max(save.unlocked,Math.min(5,r.level.id+1));save.completed[r.level.id-1]=true;const goodCatch=r.count>=r.level.goal.count+Math.ceil(r.level.goal.count*.18);
  const greatCatch=r.count>=r.level.goal.count+Math.ceil(r.level.goal.count*.4);
  const bonusGold=r.level.goal.gold===0?0:1;
  const stars=1+Number(r.hits===0&&goodCatch)+Number(r.hits===0&&greatCatch&&r.gold>=r.level.goal.gold+bonusGold&&r.elapsed<=r.level.seconds*.92);save.stars[r.level.id-1]=Math.max(save.stars[r.level.id-1],stars);r.stars=stars;}return true;
}
export function cameraPose(lane,aspect) {return cameraTarget(lane,0,0,aspect,8);}
export function qualityStep(q,fps,dpr) {
 if(fps>=42)return q;
 if(q.tier>0)return {...q,tier:q.tier-1};
 return {...q,pr:Math.min(dpr,Math.max(1.25,q.pr-.25))};
}
