import test from 'node:test';
import assert from 'node:assert/strict';
import {newRun,input,advance} from './adventure.mjs';
const tick=(r,t)=>{for(let n=0;n<t*120;n++)advance(r,1/120);};
test('jumping in a side lane cannot earn a jump-over credit for a centre barrier',()=>{
 const r=newRun(1);r.obstacles=[{id:'centre',kind:'barrier',x:15,lane:1,speed:0,z:0,passed:false,hit:false,triggerAt:null}];r.fishes=[];
 input(r,'left');tick(r,1.6);input(r,'jump');tick(r,.8);
 assert.equal(r.phase,'running');assert.equal(r.jumpedBarriers,0);assert.equal(r.events.find(e=>e.type==='barrier-cleared').jumped,false);
});
test('credit belongs to the exact swept barrier overlap cleared above its collision height',()=>{
 const r=newRun(1);r.obstacles=[{id:'centre',kind:'barrier',x:15,lane:1,speed:0,z:0,passed:false,hit:false,triggerAt:null},{id:'side',kind:'barrier',x:15,lane:0,speed:0,z:-1.7,passed:false,hit:false,triggerAt:null}];r.fishes=[];
 tick(r,1.6);input(r,'jump');tick(r,.8);
 assert.equal(r.jumpedBarriers,1);assert.equal(r.events.find(e=>e.objectId==='centre'&&e.type==='barrier-cleared').jumped,true);assert.equal(r.events.find(e=>e.objectId==='side'&&e.type==='barrier-cleared').jumped,false);
});
