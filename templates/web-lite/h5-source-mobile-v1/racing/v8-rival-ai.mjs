/**
 * V8 physical fork driving for the original AICar.
 * AI chooses before the turn, traverses the REAL branch arc, and rejoins.
 * Never mutates standings, checkpoints, finish times or player controls.
 * Pure steering strategy + spline sampling: native AICar still owns speed,
 * collision, spin, shields and nitro.
 */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mod=(v,n)=>((v%n)+n)%n;
const valid=(v)=>typeof v==='number'&&Number.isFinite(v);
const entryFor=(ai,road)=>{
  const total=ai.track?.length;
  if(!road||!valid(total)||total<=road.end||!valid(ai.dist))return null;
  const lap=Math.floor(ai.dist/total),key=lap+':'+road.course;
  if(ai.__V8_FORK_CHOICE_KEY__!==key) {
    const skill=valid(ai.skill)?ai.skill:1;
    const probability=clamp(.32+(skill-1)*.31,.19,.9);
    ai.__V8_FORK_CHOICE_KEY__=key;
    ai.__V8_FORK_WANTS__=(typeof ai.rnd==='function'?ai.rnd():.5)<probability;
  }
  return {lap,key,wants:ai.__V8_FORK_WANTS__};
};
export function aiV8TargetLine(ai,track,natural,halfWidth) {
  const road=track?.__RACE_SHORTCUT__;
  if(!road||!valid(ai?.dist)||!valid(halfWidth))return natural;
  if(ai.__V8_FORK_STATE__)return clamp(ai.personal*1.1,-road.neckWidth*.34,road.neckWidth*.34);
  const plan=entryFor(ai,road);
  if(!plan?.wants)return natural;
  const distance=mod(road.start-ai.dist,track.length);
  // Build a real approach line without warping a car sideways at the fork.
  if(distance>130)return natural;
  const side=road.entrySide||1;
  const commitment=distance>=35 ? clamp((130-distance)/95,0,1) : clamp(distance/35,0,1);
  return clamp(natural*(1-commitment)+side*halfWidth*.26*commitment,-halfWidth,halfWidth);
}
function branchPoint(samples,arc) {
  if(!samples?.length)return null;
  let lo=0,hi=samples.length-1;
  while(lo+1<hi){const m=(lo+hi)>>1;if(samples[m].arc<arc)lo=m;else hi=m;}
  const a=samples[lo],b=samples[hi],t=clamp((arc-a.arc)/Math.max(1e-5,b.arc-a.arc),0,1);
  let heading=Math.atan2(Math.sin(a.hd)*(1-t)+Math.sin(b.hd)*t,
    Math.cos(a.hd)*(1-t)+Math.cos(b.hd)*t);
  const dx=Math.sin(heading),dz=Math.cos(heading);
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,
    z:a.z+(b.z-a.z)*t,hd:heading,tx:dx,tz:dz,rx:-dz,rz:dx,
    bank:0,grade:(b.y-a.y)/Math.max(1e-5,b.arc-a.arc)};
}
/**
 * V9 AI pays the same corner-speed tradeoff as a native road bend.
 * Only the desired speed is modified: the pinned AICar retains its normal
 * dt acceleration/braking integrator, so a fork never grants free velocity.
 * Unlike a fixed slowdown, the cap follows actual signed heading curvature.
 */
export function aiV8ForkDesiredSpeed(ai,track,nativeDesired) {
  const road=track?.__RACE_SHORTCUT__;
  if(!road?.v9 || !Number.isFinite(nativeDesired)||!Number.isFinite(ai?.dist))
    return nativeDesired;
  const want=entryFor(ai,road);
  const state=ai.__V8_FORK_STATE__;
  if(!state&&!want?.wants)return nativeDesired;
  let arc=state?.arc;
  if(!Number.isFinite(arc)){
    const distance=mod(road.start-ai.dist,track.length);
    if(distance>105)return nativeDesired;
    arc=0;
  }
  const points=road.samples;
  if(!Array.isArray(points)||points.length<8)return nativeDesired;
  const sampleAt=d=>{
    let lo=0,hi=points.length-1;
    while(lo+1<hi){const k=(lo+hi)>>1;if(points[k].arc<d)lo=k;else hi=k;}
    return points[lo];
  };
  // Compute the largest direction change ahead over real physical metres.
  // Fast approach braking begins before a short fork, not after its apex.
  const look=state?Math.min(road.length-7,arc+55):Math.min(road.length-7,75);
  let maxCurv=0;
  for(let d=Math.max(4,arc);d<look;d+=8){
    const a=sampleAt(d),b=sampleAt(Math.min(d+12,road.length-1));
    const angle=Math.atan2(Math.sin(b.hd-a.hd),Math.cos(b.hd-a.hd));
    maxCurv=Math.max(maxCurv,Math.abs(angle)/Math.max(6,b.arc-a.arc));
  }
  const skill=Number.isFinite(ai.skill)?clamp(ai.skill,.65,2.2):1;
  const lateral=13+19*skill;
  const cornerCap=Math.sqrt(lateral/Math.max(maxCurv,.001));
  return Math.min(nativeDesired,Math.max(14,cornerCap));
}

export function advanceAiV8Road(ai,track,travelled) {
  const road=track?.__RACE_SHORTCUT__;
  if(!road||!valid(ai?.dist)||!valid(travelled)||travelled<0||!valid(track.length))
    return null;
  let state=ai.__V8_FORK_STATE__;
  if(!state){
    const plan=entryFor(ai,road);
    if(!plan?.wants)return null;
    const start=plan.lap*track.length+road.start;
    const previous=ai.dist-travelled;
    if(previous>start||ai.dist<start||travelled>24)return null;
    state={lap:plan.lap,arc:Math.max(0,ai.dist-start)};
    ai.__V8_FORK_STATE__=state;
    // Road centre matches the native track at the portal.
    ai.lat=clamp(ai.lat,-1.6,1.6);ai.latV=0;
  }else state.arc+=travelled;
  if(state.arc>=road.length){
    const remainder=state.arc-road.length;
    ai.dist=state.lap*track.length+road.end+remainder;
    ai.__V8_FORK_STATE__=null;
    ai.lat=clamp(ai.lat,-1.2,1.2);ai.latV=0;
    return null; // caller resamples the native surface after a physical merge
  }
  const p=branchPoint(road.samples,state.arc);
  if(!p){ai.__V8_FORK_STATE__=null;return null;}
  ai.dist=state.lap*track.length+road.start+
    (road.end-road.start)*state.arc/road.length;
  const corridor=Math.max(1.4,road.widthAt(state.arc)*.5-1.8);
  ai.lat=clamp(ai.lat,-corridor,corridor);
  ai.latV=clamp(ai.latV,-3,3);
  const native=track.sample(ai.dist,ai.s2);
  return {...native,...p,d:native.d, i:native.i,__V8_FORK_AI__:true};
}
