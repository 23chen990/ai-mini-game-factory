import test from 'node:test';
import assert from 'node:assert/strict';
import {newRun,advance,canRevive,revive,settle,newSave} from './adventure.mjs';

const driveToFinish=r=>{for(let i=0;i<16000&&r.phase==='running';i++)advance(r,1/120);};

test('natural first level is more active while fish and barriers remain obtainable',()=>{
 const r=newRun(1),level=r.level;
 assert.ok(level.obstacles.length>=10,'more threats than the original four');
 assert.ok(level.fish.filter(f=>f.shoal).length>=4,'branching shoal route');
 assert.deepEqual(level.obstacles.slice(0,4).map(o=>o.x),[90,140,162,225],
   'retain critical regression obstacle indices');
 assert.ok(level.obstacles.some(o=>o.kind==='car'));
});

test('actual collision may revive only once, with no reward settlement before ad',()=>{
 const r=newRun(1);
 r.obstacles=[{id:'test-car',kind:'car',x:30,lane:1,z:0,speed:0,hit:false,passed:false,triggerAt:null}];
 r.fishes=[];
 driveToFinish(r);
 assert.equal(r.reason,'vehicle');assert.equal(canRevive(r),true);
 assert.equal(r.settled,false);
 assert.equal(revive(r),true);assert.equal(r.revives,1);assert.equal(r.phase,'running');
 assert.equal(r.reviveGrace,2.5);
 assert.equal(r.obstacles[0].passed,true);
 assert.equal(canRevive(r),false);assert.equal(revive(r),false);
 advance(r,.5);assert.ok(r.reviveGrace<2.5);
});

test('collision on a used revive settles normally; unavailable reasons never revive',()=>{
 const r=newRun(1);
 r.obstacles=[{id:'test-car',kind:'car',x:30,lane:1,z:0,speed:0,hit:false,passed:false,triggerAt:null}];
 r.fishes=[];driveToFinish(r);revive(r);
 r.obstacles.push({id:'second-car',kind:'car',x:90,lane:1,z:0,speed:0,hit:false,passed:false,triggerAt:null});
 driveToFinish(r);assert.equal(r.reason,'vehicle');assert.equal(canRevive(r),false);
 assert.equal(settle(newSave(),r),true);assert.equal(revive(r),false);
 for(const reason of ['complete','timeout','fish-short','gold-short']){
  const invalid=newRun(1);invalid.phase='finished';invalid.reason=reason;
  assert.equal(canRevive(invalid),false);assert.equal(revive(invalid),false);
 }
});

test('ordinary settlement forbids resurrection and never adds a revive',()=>{
 const r=newRun(1);r.phase='finished';r.reason='barrier';
 assert.equal(settle(newSave(),r),true);assert.equal(canRevive(r),false);
 assert.equal(revive(r),false);assert.equal(r.revives,0);
});
