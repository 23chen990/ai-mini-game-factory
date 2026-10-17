import test from 'node:test';
import assert from 'node:assert/strict';
import {challengesFor} from '../engine.mjs';
import {cfNearMissCue,cfNativeReviveStatus} from '../fps-mobile-ux.mjs';
const levels=challengesFor('cf-transport-ship');
const mission=id=>levels.find(x=>x.id===id);

test('player-only near miss for a genuine first point; no fabricated B success',()=>{
 const c=mission('defense');
 assert.equal(cfNearMissCue(c,{defenseSitesValid:true,defenseCaptured:1},70000),
   '已守住第一处据点，第二处还没拿下');
 assert.equal(cfNearMissCue(c,{defenseSitesValid:true,defenseCaptured:0,defenseHeld:3.4},30000),
   '第一处据点已经守住大半时间');
 assert.equal(cfNearMissCue(c,{defenseSitesValid:true,defenseCaptured:0,defenseHeld:0},70000),null);
 assert.equal(cfNearMissCue(c,{defenseSitesValid:false,defenseCaptured:1},70000),null);
 const reverse=mission('counter');
 assert.equal(cfNearMissCue(reverse,{defenseSitesValid:true,defenseCaptured:1},67000),
   '已守住第一处据点，第二处还没拿下');
});

test('near-miss narrative never counts team kills, early hits or almost walking',()=>{
 const assault=mission('assault');
 assert.equal(cfNearMissCue(assault,{assaultStage:1,assaultKills:1},88000),
   '换位已经完成，只差最后1次亲手击杀');
 assert.equal(cfNearMissCue(assault,{assaultStage:0,kills:90},88000),null);
 assert.equal(cfNearMissCue(assault,{assaultStage:1,assaultKills:0},88000),null);
 const sniper=mission('marksman');
 assert.match(cfNearMissCue(sniper,{awmKills:1},81000),/AWM已击杀1人/);
 assert.equal(cfNearMissCue(sniper,{kills:2,awmKills:0},81000),null);
 const rifle=mission('tags');
 assert.equal(cfNearMissCue(rifle,{drillStage:2,drillFollowUpHits:2},60000),
   '换位已完成，追击还差1次有效命中');
 assert.equal(cfNearMissCue(rifle,{drillStage:0,hits:50},59000),null);
});

test('survival near misses reflect full native elapsed and actual personal kills',()=>{
 const c=mission('evac');
 const enough={travel:29,kills:1,deaths:1};
 assert.equal(cfNearMissCue(c,enough,60000),'坚持到最后阶段，还差10秒');
 assert.equal(cfNearMissCue(c,{...enough,kills:0},60000),null);
 assert.equal(cfNearMissCue(c,{...enough,travel:5},60000),null);
 assert.equal(cfNearMissCue(c,enough,20000),null);
 assert.equal(cfNearMissCue(c,enough,70000),null);
 assert.equal(cfNearMissCue(null,enough,60000),null);
});

test('rewarded extra death never promises instant HP or a fake revive',()=>{
 assert.equal(cfNativeReviveStatus({alive:false,nativeRespawnSec:3.25},true),
   '✚ 续战已生效 · 4秒后复活');
 assert.equal(cfNativeReviveStatus({alive:false,nativeRespawnSec:.02},true),
   '✚ 续战已生效 · 1秒后复活');
 assert.equal(cfNativeReviveStatus({alive:false,nativeRespawnSec:4},false),null);
 assert.equal(cfNativeReviveStatus({alive:true,nativeRespawnSec:4},true),null);
 assert.equal(cfNativeReviveStatus({alive:false,nativeRespawnSec:0},true),null);
 assert.equal(cfNativeReviveStatus({alive:false,nativeRespawnSec:NaN},true),null);
});
