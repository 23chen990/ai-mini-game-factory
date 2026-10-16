import test from 'node:test';
import assert from 'node:assert/strict';
import {newRun,advance,steerTo} from './adventure.mjs';
import {BOUNDS} from './levels.mjs';

test('first crossing recovery leaves at least 1.5 seconds before a same-lane fatal vehicle',()=>{
 const r=newRun(1);steerTo(r,1.9);
 for(let i=0;i<2400&&r.phase==='running'&&r.stun===0;i++)advance(r,1/120);
 assert.ok(r.stun>0);assert.equal(r.events.at(-1).type,'pedestrian-hit');
 while(r.stun>0)advance(r,1/120);
 const traffic=r.obstacles.filter(o=>['car','van'].includes(o.kind)&&!o.hit&&!o.passed&&Math.abs(o.z-r.lane)<BOUNDS[o.kind].z+.27);
 const timeToImpact=Math.min(...traffic.map(o=>(o.x-r.distance-BOUNDS[o.kind].x-.58)/(r.level.speed+o.speed)));
 assert.ok(timeToImpact>=1.5,'recovered rider only has '+timeToImpact.toFixed(2)+'s before fatal traffic');
 steerTo(r,0);advance(r,.8);assert.equal(r.phase,'running');assert.equal(r.hits,1);
});
