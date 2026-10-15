import test from 'node:test';
import assert from 'node:assert/strict';
import * as feel from './feel.mjs';
import {newRun,input,advance} from './adventure.mjs';

test('native model heading is finite during cold menu, first ride, pause, menu return and replay',()=>{
 assert.equal(typeof feel.syncRidePose,'function');
 // The pinned native demo has no yaw field. The menu renders before begin().
 const native={lane:.9,laneV:0,lean:0,steer:0,y:0};
 const assertPose=()=>{for(const key of ['lane','laneV','lean','steer','yaw','latAcc','y','speed'])assert.ok(Number.isFinite(native[key]),key+' must not poison model matrices');};
 feel.syncRidePose(native,null);assertPose();assert.equal(native.yaw,0);
 const r=newRun(1);input(r,'right');advance(r,.18);feel.syncRidePose(native,r);assertPose();assert.equal(native.yaw,r.yaw);assert.notEqual(native.yaw,0);
 input(r,'pause');feel.syncRidePose(native,r);assertPose();assert.equal(native.paused,true);
 feel.syncRidePose(native,null);assertPose();assert.equal(native.yaw,0);assert.equal(native.laneV,0);assert.equal(native.lean,0);
 feel.syncRidePose(native,newRun(1));assertPose();assert.equal(native.paused,false);assert.equal(native.yaw,0);
});
