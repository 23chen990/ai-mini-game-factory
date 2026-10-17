import test from 'node:test';
import assert from 'node:assert/strict';
import * as policy from './risk-policy.mjs';

const target = {barrierId:'l3-o3',distance:222,goldFishId:'l3-jump-l3-o3'};
const newState = () => policy.createRiskPolicyState(3,target);
const lane = (overrides={}) => ({danger:false,fish:false,jumpReward:false,kind:'clear',seconds:null,...overrides});
const view = (overrides={}) => ({
 phase:'running',level:3,distance:190,laneIndex:1,nowMs:1000,
 lanes:[lane(),lane(),lane()],...overrides,
});
const decide = (v,s=newState()) => policy.decideRiskAction(v,s);

test('visible barrier countdown refuses 331m decoy when the target is 356m',()=>{
 const target={barrierId:'l2-o5',distance:356};
 const s=policy.createRiskPolicyState(2,target);
 const early=policy.visibleLaneFromHud({className:'co-lane danger jump-reward',text:'↟🌟1.4s'});
 const viewBefore=view({level:2,distance:319,laneIndex:0,
  lanes:[early,lane(),lane()]});
 assert.equal(policy.radarIsExpectedBarrier(viewBefore,early,target,2),false,
  'a 331m pressure gate is not the 356m prize even if the icon is identical');
 const before=decide(viewBefore,s);
 assert.notEqual(before.action,'jump');
 assert.equal(before.state.committedRewardLane,null);
 const approach=policy.visibleLaneFromHud({className:'co-lane danger jump-reward',text:'↟🌟3s'});
 const viewNow=view({level:2,distance:338,laneIndex:1,
  lanes:[approach,lane(),lane()]});
 assert.equal(policy.radarIsExpectedBarrier(viewNow,approach,target,2),true);
 const aligned=decide(viewNow,s);
 assert.equal(aligned.action,'left');
 assert.equal(aligned.state.committedRewardLane,0);
 const ready=policy.visibleLaneFromHud({className:'co-lane danger jump-reward',text:'↟🌟1.3s'});
 const real=decide({...viewNow,distance:346,laneIndex:0,jumpReady:true,
  lanes:[ready,lane(),lane()]},aligned.state);
 assert.equal(real.action,'jump');
 assert.equal(real.state.jumpIssued,true);
 assert.equal(real.state.target.barrierId,'l2-o5');
});
test('an already committed jump cannot be spent on a different closer barrier',()=>{
 const target={barrierId:'l2-o5',distance:356};
 const s={...policy.createRiskPolicyState(2,target),committedRewardLane:0};
 const decoy=policy.visibleLaneFromHud({className:'co-lane danger jump-reward',text:'↟🌟1.4s'});
 const n=decide(view({level:2,distance:319,laneIndex:0,jumpReady:true,
  lanes:[decoy,lane(),lane()]}),s);
 assert.notEqual(n.action,'jump');
 assert.equal(n.state.jumpIssued,false);
 const missingTime=policy.visibleLaneFromHud({className:'co-lane danger jump-reward',text:'↟🌟'});
 assert.equal(policy.radarIsExpectedBarrier(view({distance:320}),missingTime,target,2),false);
});

test('half-second visible early jump cue preserves the 75m left-route choice',()=>{
 const reward=policy.visibleLaneFromHud({className:'co-lane danger jump-reward',text:'↟🌟3.5s'});
 const target={barrierId:'l1-o4',distance:75};
 const scene=view({level:1,distance:48,laneIndex:1,lanes:[reward,lane(),lane({fish:true})]});
 assert.equal(reward.seconds,3.5);
 assert.equal(policy.radarIsExpectedBarrier(scene,reward,target,1),true);
 const turn=decide(scene,policy.createRiskPolicyState(1,target));
 assert.equal(turn.action,'left','do not turn back to ordinary side fish as the two-lane jump approach opens');
 assert.equal(turn.toLane,0);
 const jump=decide({...scene,distance:59,laneIndex:0,jumpReady:true,
  lanes:[{...reward,seconds:2},lane(),lane()]},turn.state);
 assert.equal(jump.action,'jump','the ordinary physical 2.25s buffer is still required and remains available');
});
test('two full-lane changes from right fish to 75m left prize need 4 seconds public radar',()=>{
 const target={barrierId:'l1-o4',distance:75};
 const radar=policy.visibleLaneFromHud({className:'co-lane danger jump-reward',text:'↟🌟4s'});
 const early=view({level:1,distance:45,laneIndex:2,
  lanes:[radar,lane(),lane({fish:true})]});
 assert.equal(policy.radarIsExpectedBarrier(early,radar,target,1),true);
 const first=decide(early,policy.createRiskPolicyState(1,target));
 assert.equal(first.action,'left');
 assert.equal(first.toLane,1);
 const stillSafe=decide({...early,distance:52,laneIndex:1,
  lanes:[{...radar,seconds:3},lane(),lane({fish:true})]},first.state);
 assert.equal(stillSafe.action,'left');
 assert.equal(stillSafe.toLane,0);
 const third=decide({...early,distance:61,laneIndex:0,jumpReady:true,
  lanes:[{...radar,seconds:2},lane(),lane()]},stillSafe.state);
 assert.equal(third.action,'jump');
 assert.equal(third.state.jumpIssued,true);
});
test('two-lane rain pressure gate permits early visible vehicle crossing, never a late suicidal turn',()=>{
 const clear=lane(),van=s=>lane({danger:true,kind:'vehicle',seconds:s});
 const target={barrierId:'l4-o10',distance:593};
 const s=policy.createRiskPolicyState(4,target);
 const ahead=view({level:4,distance:453,laneIndex:2,lanes:[clear,van(4.3),van(4.2)]});
 const first=decide(ahead,s);
 assert.equal(first.action,'left','the 499m rain choke must offer a physically possible early left exit');
 assert.equal(first.toLane,1,'one tap may traverse only one painted lane');
 assert.equal(first.reason,'visible-danger-or-fish-early-crossing');
 const second=decide({...ahead,distance:456,laneIndex:1,lanes:[clear,van(3.9),van(3.8)]},first.state);
 assert.equal(second.action,'left');assert.equal(second.toLane,0,'the next trusted tap completes the two-lane escape');
 const late=decide({...ahead,distance:478,lanes:[clear,van(1.6),van(1.4)]},s);
 assert.equal(late.action,'wait','never cross a vehicle that has already entered the collision window');
 const lure=decide({...ahead,lanes:[lane({fish:true}),van(4.2),clear]},s);
 assert.equal(lure.action,'wait','a safe current lane must never cross distant traffic just to collect fish');
 const blockedDestination=decide({...ahead,lanes:[lane({danger:true,kind:'barrier',seconds:1.3}),van(4.3),van(4.2)]},s);
 assert.notEqual(blockedDestination.action,'left','the destination must itself be publicly safe');
});
test('rain pedestrian then dual vehicles permits early visible two-tap escape, never late suicide',()=>{
 const clear=lane(),ped=t=>lane({danger:true,kind:'pedestrian',seconds:t});
 const van=t=>lane({danger:true,kind:'vehicle',seconds:t});
 // At 478m a pedestrian from the left crosses the right lane; at 499m
 // the van and car close centre/right. A skilled rider uses the 4s HUD.
 const state=policy.createRiskPolicyState(4,{barrierId:'l4-o10',distance:593});
 const early=view({level:4,distance:450,laneIndex:2,lanes:[clear,van(4),ped(3)]});
 const earliest=decide({...early,distance:446,lanes:[clear,van(4),ped(4)]},state);
 assert.equal(earliest.action,'left','player may reposition on the first visible 4s pedestrian warning');
 assert.equal(earliest.toLane,1);
 const far=decide({...early,distance:420,lanes:[clear,van(4),ped(5)]},state);
 assert.equal(far.action,'wait','no premature lane crossing outside public pedestrian warning');
 const first=decide(early,state);
 assert.equal(first.action,'left');
 assert.equal(first.toLane,1,'first of exactly two actual lane taps');
 assert.equal(first.reason,'visible-danger-or-fish-early-crossing');
 const second=decide({...early,distance:454,laneIndex:1,lanes:[clear,van(4),ped(2)]},first.state);
 assert.equal(second.action,'left');assert.equal(second.toLane,0);
 const late=decide({...early,distance:476,lanes:[clear,van(3),ped(1)]},state);
 assert.notEqual(late.action,'left','too little warning to cross a van');
 const blockedEnd=decide({...early,lanes:[lane({danger:true,kind:'vehicle',seconds:3}),van(4),ped(3)]},state);
 assert.notEqual(blockedEnd.action,'left','final lane blocked means no early crossing');
});
test('a reward route never enters the adjacent simultaneous fatal van lane',()=>{
 const visibleVan=policy.visibleLaneFromHud({className:'co-lane danger',text:'🚐 2.0s'});
 assert.equal(visibleVan.kind,'vehicle');
 const v=view({laneIndex:0,lanes:[lane(),visibleVan,lane({danger:true,jumpReward:true,kind:'barrier',seconds:2})]});
 const result=decide(v);
 assert.notEqual(result.action,'jump');
 assert.notEqual(result.toLane,1);
 assert.equal(result.action,'wait');
});

test('two-lane reward approach starts before the late double-tap trap',()=>{
 const target={barrierId:'l1-o4',distance:75};
 const reward=policy.visibleLaneFromHud({className:'co-lane danger jump-reward',text:'↟🌟3.6s'});
 const viewTwo=view({level:1,distance:48,laneIndex:2,lanes:[reward,lane(),lane()]});
 const step=decide(viewTwo,policy.createRiskPolicyState(1,target));
 assert.equal(step.action,'left');assert.equal(step.toLane,1);
 const oneAway=decide({...viewTwo,laneIndex:1,lanes:[{...reward,seconds:2.65},lane(),lane()]},step.state);
 assert.equal(oneAway.action,'left');assert.equal(oneAway.toLane,0);
 const stillFar=decide({...viewTwo,lanes:[{...reward,seconds:4.7},lane(),lane()]},policy.createRiskPolicyState(1,target));
 assert.equal(stillFar.action,'wait');
});
test('visible gold increase after a true +9m jump prize releases the next challenge on time',()=>{
 const target={barrierId:'l1-o7',distance:205};
 const early=view({level:1,distance:200,laneIndex:0,nowMs:1000,goldCounter:2,lanes:[lane({danger:true,jumpReward:true,kind:'barrier',seconds:1.0}),lane(),lane()]});
 const jump=decide(early,policy.createRiskPolicyState(1,target));
 assert.equal(jump.action,'jump');assert.equal(jump.state.goldAtJump,2);
 const withGold=decide({...early,nowMs:1000+policy.CAPTURE_HOLD_MS-180,distance:213,goldCounter:3,lanes:[lane(),lane(),lane()]},jump.state);
 assert.notEqual(withGold.reason,'capture-hold');
 assert.equal(withGold.state.stage,'post-capture');
 const noGold=decide({...early,nowMs:1000+policy.CAPTURE_HOLD_MS-180,distance:213,goldCounter:2,lanes:[lane(),lane(),lane()]},jump.state);
 assert.equal(noGold.reason,'capture-hold','mere proximity is not evidence of earned gold');
});
test('a visible READY jump control is a valid fallback when the radar prize cue has changed',()=>{
 const target={barrierId:'l1-o3',distance:233};
 const s=policy.createRiskPolicyState(1,target);
 const confirmed={...s,committedRewardLane:1};
 const viewReady=view({level:1,distance:217,laneIndex:1,jumpReady:true,goldCounter:4,lanes:[lane({fish:true}),lane(),lane()]});
 const a=decide(viewReady,confirmed);
 assert.equal(a.action,'jump');assert.equal(a.reason,'confirmed-next-barrier-ready');
 assert.equal(a.state.goldAtJump,4);assert.equal(a.state.stage,'capture');
 const tooLate=decide({...viewReady,distance:232.3},confirmed);
 assert.notEqual(tooLate.action,'jump');
});
test('a real visible jump reward establishes a stable target through transient ordinary fish HUD cues',()=>{
 const target={barrierId:'l1-o4',distance:75};
 const state=policy.createRiskPolicyState(1,target);
 const radar=policy.visibleLaneFromHud({className:'co-lane danger jump-reward',text:'↟🌟3.0s'});
 const initial=decide(view({level:1,distance:53,laneIndex:2,lanes:[radar,lane(),lane()]}),state);
 assert.equal(initial.action,'left');assert.equal(initial.toLane,1);assert.equal(initial.state.committedRewardLane,0);
 const transient=decide(view({level:1,distance:58,laneIndex:1,lanes:[lane(),lane(),lane({fish:true})]}),initial.state);
 assert.equal(transient.action,'left');assert.equal(transient.toLane,0);
 assert.equal(transient.reason,'continue-confirmed-jump-approach');
 const unsafe=decide(view({level:1,distance:59,laneIndex:1,lanes:[lane({danger:true,kind:'vehicle',seconds:1}),lane(),lane({fish:true})]}),initial.state);
 assert.equal(unsafe.action,'wait','never run into a visible vehicle despite the earlier reward commitment');
});
test('two barriers 20m apart: real READY takes priority over another reward lane',()=>{
 const target={barrierId:'l1-o3',distance:233};
 const s={...policy.createRiskPolicyState(1,target),committedRewardLane:1};
 const otherReward=lane({danger:true,jumpReward:true,kind:'barrier',seconds:1.4});
 const ready=view({level:1,distance:217,laneIndex:1,nowMs:1900,jumpReady:true,goldCounter:4,
  lanes:[otherReward,lane({danger:true,kind:'barrier',seconds:1.1}),lane()]});
 const step=decide(ready,s);
 assert.equal(step.action,'jump');assert.equal(step.toLane,1);
 assert.equal(step.reason,'confirmed-next-barrier-ready');
 assert.equal(step.state.goldAtJump,4);
 assert.notEqual(decide({...ready,lanes:[otherReward,lane({danger:true,kind:'vehicle',seconds:1}),lane()]},s).action,'jump','do not jump through visible oncoming vehicle');
 assert.notEqual(decide({...ready,distance:232.3},s).action,'jump','never send a late queued jump inside the hitbox');
});

test('the policy acts in the early buffered jump window',()=>{
 const s=newState(),earlyReward=policy.visibleLaneFromHud({className:'co-lane danger jump-reward',text:'↟🌟1.3s'});
 const lanes=[lane(),earlyReward,lane()];
 const early=decide(view({distance:221,lanes}),s);
 assert.equal(early.action,'jump','1.3 seconds is an earned buffered input, not a last-frame reaction');
 const readyReward=policy.visibleLaneFromHud({className:'co-lane danger jump-reward',text:'↟🌟1.1s'});
 assert.equal(readyReward.seconds,1.1);
 const holding=decide(view({distance:221,nowMs:1100,lanes:[lane(),readyReward,lane()]}),early.state);
 assert.equal(holding.action,'wait','one target cannot trigger a second input while the first buffered jump is armed');
 const ready=decide(view({distance:221,nowMs:1100,lanes:[lane(),readyReward,lane()]}),newState());
 assert.equal(ready.action,'jump');
});

test('buffered jump holds the reward lane until the bonus fish can be caught',()=>{
 assert.ok(policy.CAPTURE_HOLD_MS>=1000&&policy.CAPTURE_HOLD_MS<=1800,'hold through physical pickup but leave time for the next jump');
 const s=newState(),jumped=decide(view({distance:221,lanes:[lane(),lane({danger:true,jumpReward:true,kind:'barrier',seconds:.4}),lane()]}),s);
 assert.equal(jumped.action,'jump');
 const holding=decide(view({distance:224,laneIndex:1,nowMs:1000+policy.CAPTURE_HOLD_MS-1,lanes:[lane({fish:true}),lane(),lane()]}),jumped.state);
 assert.equal(holding.action,'wait');
 assert.equal(holding.state.stage,'capture');
 const tooEarly=decide(view({distance:225,laneIndex:1,nowMs:1000+policy.CAPTURE_HOLD_MS+100,lanes:[lane({fish:true}),lane(),lane()]}),holding.state);
 assert.equal(tooEarly.action,'wait','never abandon a buffered jump before physically passing its +9m gold');
 const released=decide(view({distance:233,laneIndex:1,nowMs:1000+policy.CAPTURE_HOLD_MS+300,lanes:[lane({fish:true}),lane(),lane()]}),tooEarly.state);
 assert.equal(released.state.stage,'post-capture');
});

test('one target cannot trigger a repeated jump after its capture hold',()=>{
 const s=newState(),jumped=decide(view({distance:221,lanes:[lane(),lane({danger:true,jumpReward:true,kind:'barrier',seconds:.4}),lane()]}),s);
 const afterHold=decide(view({distance:225,nowMs:1000+policy.CAPTURE_HOLD_MS+100,lanes:[lane(),lane({danger:true,jumpReward:true,kind:'barrier',seconds:.2}),lane()]}),jumped.state);
 assert.notEqual(afterHold.action,'jump');
 assert.equal(afterHold.state.jumpIssued,true);
});
test('capture keeps a safe reward window before distant traffic but escapes an imminent vehicle',()=>{
 const s=newState(),jumped=decide(view({distance:215,lanes:[lane(),lane({danger:true,jumpReward:true,kind:'barrier',seconds:.9}),lane()]}),s);
 assert.equal(jumped.action,'jump');
 const distant=decide(view({distance:225,nowMs:1800,lanes:[lane(),lane({danger:true,kind:'vehicle',seconds:3}),lane()]}),jumped.state);
 assert.equal(distant.action,'wait');assert.equal(distant.reason,'capture-hold');
 const urgent=decide(view({distance:234,nowMs:2200,lanes:[lane(),lane({danger:true,kind:'vehicle',seconds:1}),lane()]}),distant.state);
 assert.notEqual(urgent.toLane,1);assert.notEqual(urgent.action,'wait');
});

test('turning toward a reward route moves exactly one adjacent lane at a time',()=>{
 const lanes=[lane({fish:true}),lane(),lane({danger:true,jumpReward:true,kind:'barrier',seconds:2})];
 const first=decide(view({distance:205,laneIndex:0,lanes}));
 assert.equal(first.action,'right');
 assert.equal(first.toLane,1);
 const second=decide(view({distance:207,laneIndex:1,lanes}),first.state);
 assert.equal(second.action,'right');
 assert.equal(second.toLane,2);
});
test('a distant reward does not discard safe side fish before the two-second approach window',()=>{
 const v=view({distance:195,laneIndex:2,lanes:[lane(),lane({danger:true,jumpReward:true,kind:'barrier',seconds:3}),lane({fish:true})]});
 const early=decide(v);assert.equal(early.action,'wait');
 const approach=decide({...v,distance:205,lanes:[lane(),lane({danger:true,jumpReward:true,kind:'barrier',seconds:2}),lane({fish:true})]},early.state);
 assert.equal(approach.action,'left');assert.equal(approach.toLane,1);
});

test('the target manifest includes both NEW V4 barriers and every legacy exact bonus-fish id',()=>{
 assert.deepEqual(policy.RISK_LEVELS.map(level=>level.targets.map(({barrierId,distance,goldFishId})=>[barrierId,distance,goldFishId])),[
  [['l1-o4',75,'l1-jump-l1-o4'],['l1-o1',140,'l1-jump-l1-o1'],['l1-o7',205,'l1-jump-l1-o7'],['l1-o3',233,'l1-jump-l1-o3']],
  [['l2-o3',246,'l2-jump-l2-o3'],['l2-o5',356,'l2-jump-l2-o5']],
  [['l3-o3',222,'l3-jump-l3-o3'],['l3-o5',360,'l3-jump-l3-o5']],
  [['l4-o3',225,'l4-jump-l4-o3'],['l4-o5',350,'l4-jump-l4-o5'],['l4-o10',593,'l4-jump-l4-o10']],
  [['l5-o3',210,'l5-jump-l5-o3'],['l5-o5',334,'l5-jump-l5-o5'],['l5-o10',584,'l5-jump-l5-o10']],
 ]);
 const levels=[{id:3,fish:[
  {id:'l3-jump-l3-o3',sourceObstacleId:'l3-o3',golden:true,bonus:true},
  {id:'l3-f1',sourceObstacleId:undefined,golden:false,bonus:false},
  {id:'l3-jump-l3-o5',sourceObstacleId:'l3-o5',golden:false,bonus:true},
 ]}];
 const before=levels.map(level=>({...level,fish:level.fish.map(fish=>({...fish}))}));
 const index=policy.authoredGoldenFishByBarrier(levels);
 assert.equal(index['3:l3-o3'],'l3-jump-l3-o3');
 assert.equal(index['3:l3-o5'],undefined);
 assert.equal(Object.isFrozen(index),true);
 assert.throws(()=>{index['3:l3-o3']='other-fish';},TypeError);
 assert.deepEqual(levels,before);
});
