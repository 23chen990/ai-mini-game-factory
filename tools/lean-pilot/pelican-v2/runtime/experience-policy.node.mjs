import test from 'node:test';
import assert from 'node:assert/strict';
import { earnedJumpRewardVisible, softwareQualityActions, experienceReportDirectory, earnedPrizeRouteSeen, pedestrianWarningSeen, experienceMotionPreference } from '../experience-policy.mjs';
import * as experiencePolicy from '../experience-policy.mjs';
test('risk retests isolate exact mobile viewports and never masquerade as a five-level campaign',()=>{
 const defaults=experiencePolicy.riskCaptureProfile({});
 assert.deepEqual(defaults,{viewport:{width:390,height:844},firstOnly:false,suffix:''});
 assert.deepEqual(experiencePolicy.riskCaptureProfile({QA_RISK_VIEWPORT:'360x740',QA_RISK_FIRST_ONLY:'1'}),{viewport:{width:360,height:740},firstOnly:true,suffix:'-360x740-first'});
 assert.equal(experiencePolicy.riskCaptureProfile({QA_RISK_VIEWPORT:'844x390'}).viewport.width,844);
 assert.throws(()=>experiencePolicy.riskCaptureProfile({QA_RISK_VIEWPORT:'../other-game'}));
 assert.throws(()=>experiencePolicy.riskCaptureProfile({QA_RISK_FIRST_ONLY:'yes'}));
});

test('earned jump reward remains readable through persistent gold and mastery counters after a missed toast', () => {
 const before={gold:1,jumps:0};
 assert.equal(earnedJumpRewardVisible({feedback:'🐟 +1 条鱼',gold:2,jumps:1},before),true);
 assert.equal(earnedJumpRewardVisible({feedback:'',gold:1,jumps:1},before),false);
 assert.equal(earnedJumpRewardVisible({feedback:'',gold:2,jumps:0},before),false);
 assert.equal(earnedJumpRewardVisible({feedback:'🏆 奖励金鱼 +7分',gold:2,jumps:1},before),true);
});

test('software renderer selects only the existing efficient preset with normal menu touches', () => {
 assert.deepEqual(softwareQualityActions('efficient'),['#co-quality','#co-quality']);
 assert.deepEqual(softwareQualityActions(undefined),[]);
 assert.throws(()=>softwareQualityActions('injected'),/Unsupported/u);
});

test('a QA presentation retest preserves the bound natural report in a separate safe directory', () => {
 assert.equal(experienceReportDirectory('chromium',undefined),'experience-chromium');
 assert.equal(experienceReportDirectory('chromium','efficient-retest'),'experience-chromium-efficient-retest');
 assert.throws(()=>experienceReportDirectory('chromium','../other-game'),/Unsafe/u);
});

test('a reward route observation requires actual visible gold cue between the same barrier and its bonus catch', () => {
 const frame={phase:'running',clearedBarriers:['l1-o1'],caughtBonusFish:[],lanes:[{index:1,kind:'fish',text:'🌟',visible:true}]};
 assert.equal(earnedPrizeRouteSeen([frame],'l1-o1','l1-jump-l1-o1'),true);
 assert.equal(earnedPrizeRouteSeen([{...frame,clearedBarriers:['other']}],'l1-o1','l1-jump-l1-o1'),false);
 assert.equal(earnedPrizeRouteSeen([{...frame,caughtBonusFish:['l1-jump-l1-o1']}],'l1-o1','l1-jump-l1-o1'),false);
 assert.equal(earnedPrizeRouteSeen([{...frame,lanes:[{...frame.lanes[0],visible:false}]}],'l1-o1','l1-jump-l1-o1'),false);
});

test('pedestrian warnings require live visible directional hazard and at least two seconds', () => {
 const frame={phase:'running',lanes:[{index:0,kind:'pedestrian',text:'🚶3s',visible:true}]};
 assert.equal(pedestrianWarningSeen([frame],0),true);
 assert.equal(pedestrianWarningSeen([frame],2),false);
 assert.equal(pedestrianWarningSeen([{...frame,phase:'paused'}],0),false);
 assert.equal(pedestrianWarningSeen([{...frame,lanes:[{...frame.lanes[0],text:'🚶1s'}]}],0),false);
 assert.equal(pedestrianWarningSeen([{...frame,lanes:[{...frame.lanes[0],visible:false}]}],0),false);
});

test('CI motion preference uses the shipped browser accessibility media query', () => {
 assert.equal(experienceMotionPreference(undefined),'no-preference');
 assert.equal(experienceMotionPreference('reduce'),'reduce');
 assert.throws(()=>experienceMotionPreference('forced-css'),/Unsupported/u);
});

test('cancelled drag requires the same live un-stunned branch and trusted native cancellation', () => {
 assert.equal(typeof experiencePolicy.cancelledDragPassed,'function');
 const state={phase:'running',stun:0,laneIndex:1,laneTarget:.5735};
 const gesture={before:{...state},after:{...state}};
 const events=[{type:'pointercancel',isTrusted:true},{type:'touchcancel',isTrusted:true}];
 assert.equal(experiencePolicy.cancelledDragPassed(gesture,events),true);
 assert.equal(experiencePolicy.cancelledDragPassed(gesture,[]),false);
 assert.equal(experiencePolicy.cancelledDragPassed(gesture,events.map(e=>({...e,isTrusted:false}))),false);
 assert.equal(experiencePolicy.cancelledDragPassed({...gesture,after:{...state,laneTarget:1.93,laneIndex:2}},events),false);
});

test('a pedestrian stun cannot be accepted as an ordinary cancelled-drag observation', () => {
 assert.equal(typeof experiencePolicy.cancelledDragPassed,'function');
 const before={phase:'running',stun:0,laneIndex:1,laneTarget:.5735};
 const events=[{type:'touchcancel',isTrusted:true}];
 // Actual failed CI: trusted cancel received after l1-o0 hit at89.1835m.
 const after={phase:'running',stun:2.008333333333337,laneIndex:2,laneTarget:1.9301665725708008};
 assert.equal(experiencePolicy.cancelledDragPassed({before,after},events),false);
 // Even a matching target cannot hide a different lifecycle/state branch.
 assert.equal(experiencePolicy.cancelledDragPassed({before,after:{...before,stun:.5}},events),false);
 assert.equal(experiencePolicy.cancelledDragPassed({before:{...before,stun:.5},after:before},events),false);
 assert.equal(experiencePolicy.cancelledDragPassed({before,after:{...before,phase:'finished'}},events),false);
});

test('cancelled-drag evidence rejects absent and non-finite intended targets', () => {
 assert.equal(typeof experiencePolicy.cancelledDragPassed,'function');
 const before={phase:'running',stun:0,laneIndex:1,laneTarget:.5735},events=[{type:'touchcancel',isTrusted:true}];
 for(const target of [undefined,NaN,Infinity])assert.equal(experiencePolicy.cancelledDragPassed({before,after:{...before,laneTarget:target}},events),false);
});
