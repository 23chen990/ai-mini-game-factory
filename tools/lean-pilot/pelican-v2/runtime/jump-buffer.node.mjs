import test from 'node:test';
import assert from 'node:assert/strict';
import {newRun,input,advance,JUMP_BUFFER_SECONDS,JUMP_TRIGGER_METERS} from './adventure.mjs';
const to=(r,d)=>{for(let i=0;i<18000&&r.distance<d&&r.phase==='running';i++)advance(r,1/120);};
test('early touch arms the same-lane barrier, genuinely clears it, and catches its fish',()=>{
 const r=newRun(1),b=r.obstacles.find(o=>o.kind==='barrier'&&o.x===35),fish=r.fishes.find(f=>f.sourceObstacleId===b.id);
 to(r,b.x-7.5);input(r,'jump');assert.equal(r.bufferedJump,b.id);assert.equal(r.vy,0);
 to(r,b.x+1.5);assert.equal(r.phase,'running');assert.equal(r.jumpedBarriers,1);
 assert.ok(r.events.some(e=>e.type==='jump'&&e.buffered&&e.objectId===b.id));
 to(r,fish.x+2);assert.ok(r.events.some(e=>e.type==='fish-caught'&&e.objectId===fish.id&&e.bonus&&e.golden));
});
test('moving to a safe lane cancels queued jump and never grants fake mastery',()=>{
 const r=newRun(1),b=r.obstacles.find(o=>o.kind==='barrier'&&o.x===35);to(r,b.x-8);input(r,'jump');assert.equal(r.bufferedJump,b.id);
 input(r,'left');assert.equal(r.bufferedJump,null);to(r,b.x+2);assert.equal(r.phase,'running');assert.equal(r.jumpedBarriers,0);
 assert.ok(!r.events.some(e=>e.type==='jump'));
});
test('far or wrong-lane jumps remain ordinary and do not arm future barriers',()=>{
 const a=newRun(1);input(a,'jump');assert.equal(a.bufferedJump,null);assert.equal(a.events.filter(e=>e.type==='jump').length,1);
 const r=newRun(1),b=r.obstacles.find(o=>o.kind==='barrier'&&o.x===35);input(r,'left');to(r,b.x-7);input(r,'jump');assert.equal(r.bufferedJump,null);
});
test('double tap cannot queue twice or inflate the exact barrier count',()=>{
 const r=newRun(1),b=r.obstacles.find(o=>o.kind==='barrier'&&o.x===35);to(r,b.x-8);input(r,'jump');input(r,'jump');to(r,b.x+2);
 assert.equal(r.events.filter(e=>e.type==='jump-buffered').length,1);
 assert.equal(r.events.filter(e=>e.type==='jump').length,1);assert.equal(r.jumpedBarriers,1);
});
test('buffer stays short and vehicles remain unjumpable',()=>{
 assert.ok(JUMP_BUFFER_SECONDS>=2.2&&JUMP_BUFFER_SECONDS<=2.3,'visible early input is long enough to react');
 assert.ok(JUMP_TRIGGER_METERS>=2.8&&JUMP_TRIGGER_METERS<=3.2);
 const r=newRun(3),car=r.obstacles.find(o=>o.kind==='car'&&o.lane===1);
 r.obstacles=[car];r.fishes=[]; // Isolated real car collision, no fake hit state.
 to(r,car.x-7);input(r,'jump');to(r,car.x+2);assert.equal(r.reason,'vehicle');
});