import test from 'node:test';
import assert from 'node:assert/strict';
import {newRun,advance,input,canRevive,revive,settle,newSave,steerTo} from './adventure.mjs';
import {createReviveController,reviveAvailable,terminalDisposition} from './revive-flow.mjs';
import {newProgress,startRound,finishRound,rewardRound} from '../../../../templates/web-lite/h5-source-mobile-v1/engine.mjs';

// Engineering fixtures only. These never enter the H5, impersonate an ad SDK,
// or count as natural-input/platform-ad acceptance.
const config={status:1,source:'check_ads_status',appId:'fixture-only',spaceId:'fixture-revive',screenOrientation:1};
const crash=()=>{const r=newRun(1);r.obstacles=[{id:'impact',kind:'car',x:18,lane:1,z:0,speed:0,hit:false,passed:false,triggerAt:null}];r.fishes=[];advance(r,2);advance(r,1);assert.equal(r.reason,'vehicle');return r;};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function harness(options={}){let current=crash(),calls=0,grants=0;const pending=deferred();const controller=createReviveController({currentRun:()=>current,available:()=>true,request:()=>{calls++;return pending.promise;},onGranted:()=>grants++,...options});return {controller,pending,get run(){return current;},replace:()=>current=newRun(1),counts:()=>({calls,grants})};}

test('no real verified config/API means unavailable; settlement stays available',()=>{
 for(const value of [undefined,{},config])assert.equal(reviveAvailable(value,undefined),false);
 const api={createRewardedVideoAd(){throw Error('availability must not call SDK');}};
 assert.equal(reviveAvailable(config,api),true);
 for(const value of [{...config,status:'PENDING'},{...config,source:'NOT_RUN'},{...config,spaceId:''},{...config,appId:''},{...config,screenOrientation:0}])assert.equal(reviveAvailable(value,api),false);
 const r=crash();assert.equal(terminalDisposition(r,false),'settle');assert.equal(terminalDisposition(r,true),'await-revive');
 settle(newSave(),r);assert.equal(terminalDisposition(r,true),'settle');
});
test('double request grants once, waits for completion, then requires manual resume',async()=>{
 const h=harness();const first=h.controller.request();assert.equal((await h.controller.request()).status,'busy');
 assert.equal(h.run.revives,0);h.pending.resolve({status:'completed'});
 assert.equal((await first).status,'revived');assert.deepEqual(h.counts(),{calls:1,grants:1});
 assert.equal(h.run.phase,'paused');assert.equal(h.run.reviveGrace,2.5);advance(h.run,1);assert.equal(h.run.reviveGrace,2.5);
 input(h.run,'resume');advance(h.run,.1);assert.ok(h.run.reviveGrace<2.5);
 assert.equal((await h.controller.request()).status,'ineligible');
});
test('late completion after replay never revives either run or invokes UI grant',async()=>{
 const h=harness(),old=h.run;const request=h.controller.request();h.replace();h.pending.resolve({status:'completed'});
 assert.equal((await request).status,'stale');assert.equal(old.revives,0);assert.equal(h.run.revives,0);assert.equal(h.counts().grants,0);
});
test('invalidation on route change rejects a late completion even for same run',async()=>{
 const h=harness();const request=h.controller.request();h.controller.invalidate();h.pending.resolve({status:'completed'});
 assert.equal((await request).status,'stale');assert.equal(h.run.revives,0);
});
test('late completion after final settlement cannot resurrect or duplicate bank',async()=>{
 const h=harness(),save=newSave(),p=newProgress(),round=startRound(p);h.run.score=9;
 const request=h.controller.request();settle(save,h.run);round.score=h.run.rewardScore;assert.equal(finishRound(round,p),true);
 h.pending.resolve({status:'completed'});assert.equal((await request).status,'stale');
 assert.equal(settle(save,h.run),false);assert.equal(finishRound(round,p),false);assert.equal(p.bank,9);assert.equal(p.rounds,1);
 assert.equal(rewardRound(round,p,true),true);assert.equal(rewardRound(round,p,true),false);assert.equal(p.bank,18);
});
for(const status of ['cancelled','failed','timed-out','busy','unavailable',undefined])test('ad result '+status+' never consumes revival',async()=>{
 const h=harness();const request=h.controller.request();h.pending.resolve(status?{status}:undefined);
 assert.notEqual((await request).status,'revived');assert.equal(h.run.revives,0);assert.equal(canRevive(h.run),true);assert.equal(h.counts().grants,0);
});
test('rejected request releases busy and allows a real retry without granting',async()=>{
 let calls=0;const h=harness({request:async()=>{calls++;if(calls===1)throw Error('network');return {status:'cancelled'};}});
 assert.equal((await h.controller.request()).status,'failed');assert.equal((await h.controller.request()).status,'cancelled');assert.equal(calls,2);assert.equal(h.run.revives,0);
});
test('unavailable controller never calls request or grants a revival',async()=>{
 const h=harness({available:()=>false});assert.equal((await h.controller.request()).status,'unavailable');assert.deepEqual(h.counts(),{calls:0,grants:0});
});
test('unavailable vehicle AND barrier deaths bank their earned score once',()=>{
 for(const reason of ['vehicle','barrier']){
  const r=crash(),s=newSave(),p=newProgress(),round=startRound(p);r.reason=reason;r.score=7;
  assert.equal(terminalDisposition(r,false),'settle');assert.equal(settle(s,r),true);
  round.score=r.rewardScore;assert.equal(finishRound(round,p),true);
  assert.equal(settle(s,r),false);assert.equal(finishRound(round,p),false);
  assert.equal(p.bank,7);assert.equal(p.rounds,1);assert.equal(revive(r),false);
 }
});
test('completed run after one revive settles and rewards once without restoring no-hit mastery',async()=>{
 const h=harness();const request=h.controller.request();h.pending.resolve({status:'completed'});await request;
 const r=h.run;r.fishes=Array.from({length:8},(_,i)=>({id:'fixture-fish-'+i,x:r.distance+8+i*12,lane:1,golden:false,caught:false}));
 input(r,'resume');for(let i=0;i<6000&&r.phase==='running';i++)advance(r,1/120);
 assert.equal(r.reason,'complete');assert.equal(r.hits,1);assert.equal(r.revives,1);
 const save=newSave(),p=newProgress(),round=startRound(p);assert.equal(settle(save,r),true);assert.equal(r.stars,1);
 round.score=r.rewardScore;assert.equal(finishRound(round,p),true);assert.equal(settle(save,r),false);assert.equal(finishRound(round,p),false);
 assert.equal(p.bank,r.rewardScore);assert.equal(p.rounds,1);
 assert.equal(rewardRound(round,p,true),true);assert.equal(rewardRound(round,p,true),false);assert.equal(p.bank,r.rewardScore*2);
 assert.equal((await h.controller.request()).status,'ineligible');assert.equal(p.bank,r.rewardScore*2);
});
test('revive cancels residual lateral input, resets airborne state and is frozen by pause',()=>{
 const r=crash();Object.assign(r,{lane:.4,laneTarget:2.15,laneV:3,latAcc:9,y:.3,vy:-2,bufferedJump:'old',stun:1});
 assert.equal(revive(r),true);assert.equal(r.laneTarget,r.lane);assert.equal(r.laneV,0);assert.equal(r.latAcc,0);assert.equal(r.y,0);assert.equal(r.vy,0);assert.equal(r.bufferedJump,null);
 input(r,'pause');advance(r,1.8);assert.equal(r.reviveGrace,2.5);input(r,'resume');advance(r,.2);assert.equal(r.hits,1);
});
test('protection cannot farm near-miss points, jump mastery or a landing instant-death',()=>{
 const r=crash();revive(r);const x=r.distance+2;
 r.obstacles.push({id:'grace-near',kind:'car',x,lane:0,z:-1.1,speed:0,hit:false,passed:false,triggerAt:null},
 {id:'grace-barrier',kind:'barrier',x:x+2,lane:1,z:0,speed:0,hit:false,passed:false,triggerAt:null});
 const score=r.score;advance(r,1.5);assert.equal(r.phase,'running');assert.equal(r.nearMisses,0);assert.equal(r.score,score);assert.equal(r.jumpedBarriers,0);
 advance(r,1.2);assert.equal(r.phase,'running');assert.equal(r.hits,1);
 r.obstacles.push({id:'real-second-hit',kind:'car',x:r.distance+4,lane:1,z:0,speed:0,hit:false,passed:false,triggerAt:null});
 steerTo(r,0);advance(r,1);assert.equal(r.reason,'vehicle');assert.equal(canRevive(r),false);
 const save=newSave();assert.equal(settle(save,r),true);assert.equal(settle(save,r),false);
});
