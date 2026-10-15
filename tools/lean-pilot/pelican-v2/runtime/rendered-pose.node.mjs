import test from 'node:test';
import assert from 'node:assert/strict';
import {renderedRidePose} from './feel.mjs';

test('QA pose observation copies actual native joints without changing them',()=>{
 const matrix=[.98,0,.2,0,0,1,0,0,-.2,0,.98,0,1,2,3,1];
 const rotation=values=>({toArray:()=>values});
 const api={S:{lean:.12,steer:-.2,yaw:-.08},rider:{rotation:rotation([.12,-.08,0,'YXZ'])},bike:{steerMatrix:()=>({elements:matrix})},pelican:{head:{rotation:rotation([.01,.03,-.04,'YZX'])},body:{rotation:rotation([.02,0,.1,'XYZ'])}}};
 const before=JSON.stringify(api.S),pose=renderedRidePose(api);
 assert.deepEqual(pose.requested,{lean:.12,steer:-.2,yaw:-.08});
 assert.deepEqual(pose.riderRotation,[.12,-.08,0]);
 assert.deepEqual(pose.headRotation,[.01,.03,-.04]);
 assert.deepEqual(pose.bodyRotation,[.02,0,.1]);
 assert.deepEqual(pose.frontSteeringMatrix,matrix);
 pose.frontSteeringMatrix[0]=999;pose.headRotation[0]=999;
 assert.equal(matrix[0],.98);assert.equal(api.pelican.head.rotation.toArray()[0],.01);
 assert.equal(JSON.stringify(api.S),before);
});

test('QA pose observation preserves invalid native values so defects cannot be hidden',()=>{
 const api={S:{lean:0,steer:0,yaw:0},rider:{rotation:{toArray:()=>[0,0,0]}},bike:{steerMatrix:()=>({elements:Array(16).fill(0)})},pelican:{head:{rotation:{toArray:()=>[0,NaN,0]}},body:{rotation:{toArray:()=>[0,0,0]}}}};
 assert.equal(Number.isNaN(renderedRidePose(api).headRotation[1]),true);
 assert.throws(()=>renderedRidePose({...api,bike:undefined}));
});
