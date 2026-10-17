import test from 'node:test';
import assert from 'node:assert/strict';
import {cfRifleCombatStatus} from '../cf-player-loop.mjs';
import {cfObservedFlankPlan,cfCombatHapticPattern,cfNearMissCue,cfBufferedJumpAllowed}
  from '../fps-mobile-ux.mjs';
import {cfCanOfferRevive,challengesFor} from '../engine.mjs';

const tags=challengesFor('cf-transport-ship')[0];
test('CF V15 drill HUD uses real progress and no tutorial checklist',()=>{
 assert.match(cfRifleCombatStatus(tags,{drillStage:0,drillFirstHit:false}),/交火/);
 assert.equal(cfRifleCombatStatus(tags,{drillStage:1,drillFirstHit:true,
   drillTravel:3.8}),'↗ 掩体换位 3/8m');
 assert.equal(cfRifleCombatStatus(tags,{drillStage:2,drillFirstHit:true,
   drillFollowUpHits:2}),'✦ 追击命中 2/3');
 assert.equal(cfRifleCombatStatus({...tags,id:'precision'},{}),null);
});
test('CF V15 vibration cannot fire without native hit, kill or damage',()=>{
 assert.deepEqual(cfCombatHapticPattern({kind:'kill',kills:1,hpLoss:0}),[24,38,16]);
 assert.equal(cfCombatHapticPattern({kind:'hit',hits:1,hpLoss:0}),12);
 assert.equal(cfCombatHapticPattern({kind:'damage',hpLoss:20}),8);
 assert.equal(cfCombatHapticPattern({kind:'damage',hpLoss:1}),null);
 assert.equal(cfCombatHapticPattern({kind:null,hpLoss:0}),null);
 assert.equal(cfCombatHapticPattern({kind:'kill',kills:0,hpLoss:0}),null);
});
test('CF V15 nav flank uses recently seen location, never hidden tracking',()=>{
 const player={team:'BL',pos:{x:14,z:0}},seen={x:14,z:0};
 const actor={team:'GR',isPlayer:false,alive:true,visible:false,target:player,
   pos:{x:0,z:0},lastSeen:seen,lastSeenT:20};
 const nav={idx:()=>1,walkable:()=>true,
   findPath:(x,z,tx,tz)=>[[x,z],[tx,tz]]};
 const world={blocked:()=>false};
 const q=cfObservedFlankPlan({actor,player,nav,world,now:22});
 assert.ok(q&&q.path.length===2&&Math.hypot(q.goal[0]-seen.x,q.goal[1]-seen.z)>4);
 assert.equal(cfObservedFlankPlan({actor:{...actor,visible:true},player,nav,world,now:22}),null);
 assert.equal(cfObservedFlankPlan({actor,player,nav,world,now:25}),null);
 assert.equal(cfObservedFlankPlan({actor:{...actor,team:'BL'},player,nav,world,now:22}),null);
 assert.equal(cfObservedFlankPlan({actor:{...actor,target:{}},player,nav,world,now:22}),null);
 assert.equal(cfObservedFlankPlan({actor,player,nav,world:{blocked:()=>true},now:22}),null);
 assert.equal(cfObservedFlankPlan({actor,player,nav:{...nav,findPath:()=>null},world,now:22}),null);
 assert.deepEqual(actor.pos,{x:0,z:0});
});
test('CF V15 only genuine near-wins may offer an approved optional revive',()=>{
 const base={challenge:tags,metrics:{deaths:3},round:{phase:'running'},
  progress:{rounds:1},sinceStartupMs:120000,
  config:{status:1,source:'check_ads_status',appId:'fixture-only',
    spaceId:'fixture-only',screenOrientation:1},sdkReady:true};
 assert.equal(cfCanOfferRevive({...base,nearWin:false}),false);
 assert.equal(cfCanOfferRevive({...base,nearWin:true}),true);
 assert.equal(cfCanOfferRevive({...base,nearWin:true,sdkReady:false}),false);
 const sniper=challengesFor('cf-transport-ship')[1];
 assert.ok(cfNearMissCue(sniper,{hits:1,awmKills:0},50000));
 assert.equal(cfNearMissCue(sniper,{hits:0,awmKills:0},50000),null);
});

test('CF V15 short touch jump buffer is never a physics or teleport shortcut',()=>{
  const base={now:5.1,pressedAt:5,grounded:true,cooldown:-0.04,alive:true};
  assert.equal(cfBufferedJumpAllowed(base),true);
  for(const patch of [
    {now:5.5},{now:4.9},{pressedAt:NaN},{cooldown:0.2},
    {grounded:false},{alive:false},{now:Infinity}
  ])assert.equal(cfBufferedJumpAllowed({...base,...patch}),false);
});
