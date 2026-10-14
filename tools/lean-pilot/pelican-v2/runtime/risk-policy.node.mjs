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

test('a reward route never enters the adjacent simultaneous fatal van lane',()=>{
 const visibleVan=policy.visibleLaneFromHud({className:'co-lane danger',text:'🚐 2.0s'});
 assert.equal(visibleVan.kind,'vehicle');
 const v=view({laneIndex:0,lanes:[lane(),visibleVan,lane({danger:true,jumpReward:true,kind:'barrier',seconds:2})]});
 const result=decide(v);
 assert.notEqual(result.action,'jump');
 assert.notEqual(result.toLane,1);
 assert.equal(result.action,'wait');
});

test('the policy waits for the decimal jump window and acts at 0.4 seconds',()=>{
 const s=newState(),earlyReward=policy.visibleLaneFromHud({className:'co-lane danger jump-reward',text:'↟🌟0.5s'});
 const lanes=[lane(),earlyReward,lane()];
 const early=decide(view({distance:221,lanes}),s);
 assert.notEqual(early.action,'jump');
 const readyReward=policy.visibleLaneFromHud({className:'co-lane danger jump-reward',text:'↟🌟0.4s'});
 assert.equal(readyReward.seconds,.4);
 const ready=decide(view({distance:221,nowMs:1100,lanes:[lane(),readyReward,lane()]}),early.state);
 assert.equal(ready.action,'jump');
});

test('after jumping, the policy holds the reward lane for at least 1.7 seconds',()=>{
 assert.ok(policy.CAPTURE_HOLD_MS>=1700);
 const s=newState(),jumped=decide(view({distance:221,lanes:[lane(),lane({danger:true,jumpReward:true,kind:'barrier',seconds:.4}),lane()]}),s);
 assert.equal(jumped.action,'jump');
 const holding=decide(view({distance:224,laneIndex:1,nowMs:2699,lanes:[lane({fish:true}),lane(),lane()]}),jumped.state);
 assert.equal(holding.action,'wait');
 assert.equal(holding.state.stage,'capture');
 const released=decide(view({distance:225,laneIndex:1,nowMs:2700,lanes:[lane({fish:true}),lane(),lane()]}),holding.state);
 assert.equal(released.state.stage,'post-capture');
});

test('one target cannot trigger a repeated jump after its capture hold',()=>{
 const s=newState(),jumped=decide(view({distance:221,lanes:[lane(),lane({danger:true,jumpReward:true,kind:'barrier',seconds:.4}),lane()]}),s);
 const afterHold=decide(view({distance:225,nowMs:2800,lanes:[lane(),lane({danger:true,jumpReward:true,kind:'barrier',seconds:.2}),lane()]}),jumped.state);
 assert.notEqual(afterHold.action,'jump');
 assert.equal(afterHold.state.jumpIssued,true);
});

test('turning toward a reward route moves exactly one adjacent lane at a time',()=>{
 const lanes=[lane({fish:true}),lane(),lane({danger:true,jumpReward:true,kind:'barrier',seconds:2})];
 const first=decide(view({laneIndex:0,lanes}));
 assert.equal(first.action,'right');
 assert.equal(first.toLane,1);
 const second=decide(view({laneIndex:1,lanes}),first.state);
 assert.equal(second.action,'right');
 assert.equal(second.toLane,2);
});

test('the target manifest matches authored V3.2 barriers and exact bonus-fish ids',()=>{
 assert.deepEqual(policy.RISK_LEVELS.map(level=>level.targets.map(({barrierId,distance,goldFishId})=>[barrierId,distance,goldFishId])),[
  [['l1-o1',140,'l1-jump-l1-o1'],['l1-o3',225,'l1-jump-l1-o3']],
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
