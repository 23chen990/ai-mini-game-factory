// Player decisions use visible feedback and persistent mastery counters. A
// slow screenshot may miss a toast; it must not lock the rider onto a hazard.
export function riskCaptureProfile(environment){
 const key=environment.QA_RISK_VIEWPORT??'390x844';
 if(!['390x844','360x740','844x390'].includes(key))throw Error('Unsupported exact risk viewport');
 if(environment.QA_RISK_FIRST_ONLY!==undefined&&environment.QA_RISK_FIRST_ONLY!=='1')throw Error('Unsupported risk campaign scope');
 const [width,height]=key.split('x').map(Number),firstOnly=environment.QA_RISK_FIRST_ONLY==='1';
 return {viewport:{width,height},firstOnly,suffix:(environment.QA_RISK_VIEWPORT?'-'+key:'')+(firstOnly?'-first':'')};
}
export const earnedJumpRewardVisible = (current, before) =>
 current.feedback.includes('奖励金鱼') ||
 Number.isFinite(current.gold) && Number.isFinite(current.jumps) &&
 current.gold >= before.gold + 1 && current.jumps >= before.jumps + 1;

// CI software rasterization exercises the shipped efficient preset through
// public menu touches. Native-GPU local QA retains the default presentation.
export function softwareQualityActions(requested) {
 if(requested===undefined)return [];
 if(requested==='efficient')return ['#co-quality','#co-quality'];
 throw Error('Unsupported software renderer quality request: '+requested);
}

export function experienceReportDirectory(engine, label) {
 if(label===undefined)return 'experience-'+engine;
 if(!/^[a-z0-9-]+$/u.test(label))throw Error('Unsafe experience retest directory label');
 return 'experience-'+engine+'-'+label;
}

export function experienceMotionPreference(requested) {
 if(requested===undefined)return 'no-preference';
 if(requested==='reduce')return 'reduce';
 throw Error('Unsupported browser motion preference: '+requested);
}

export const earnedPrizeRouteSeen = (frames, barrierId, fishId) => frames.some(frame =>
 frame.phase==='running' && frame.clearedBarriers.includes(barrierId) && !frame.caughtBonusFish.includes(fishId) &&
 frame.lanes.some(lane=>lane.index===1&&lane.kind==='fish'&&lane.text.includes('🌟')&&lane.visible===true));

export const pedestrianWarningSeen = (frames, index) => frames.some(frame =>
 frame.phase==='running' && frame.lanes.some(lane=>lane.index===index&&lane.kind==='pedestrian'&&lane.visible===true&&Number(lane.text.match(/(\d+(?:\.\d+)?)s/u)?.[1]??0)>=2));

// Ordinary drag cancellation and collision stun are different input branches.
// Keep the target/index assertion strict and require real native cancellation.
export function cancelledDragPassed(gesture, events) {
 const valid=s=>s?.phase==='running'&&s.stun===0&&Number.isFinite(s.laneTarget)&&
  Number.isInteger(s.laneIndex)&&s.laneIndex>=0&&s.laneIndex<=2;
 const before=gesture?.before,after=gesture?.after;
 return valid(before)&&valid(after)&&before.laneIndex===after.laneIndex&&
  Math.abs(after.laneTarget-before.laneTarget)<.01&&Array.isArray(events)&&
  events.some(e=>(e.type==='touchcancel'||e.type==='pointercancel')&&e.isTrusted===true);
}
