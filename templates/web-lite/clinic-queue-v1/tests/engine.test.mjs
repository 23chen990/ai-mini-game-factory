/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import {CONFIG as C,WAVES,createInitial,act,tick,inspect,validateState,encodeSave,decodeSave,serviceMs,outcome} from '../engine.mjs';
const begin=()=>act(createInitial(2026),{type:'start'});
const advance=(s,ms)=>{for(let t=0;t<ms;t+=C.stepMs)s=tick(s);return s;};

test('service workload follows the arriving patient cohort, not the present wall clock',()=>{
 const s=begin(),p={wave:0};assert.equal(serviceMs(s,p,'intake'),7250);assert.equal(serviceMs(s,p,'care'),5750);
 const late={...s,timeMs:60000};assert.equal(serviceMs(late,p,'intake'),7250);
 assert.ok(serviceMs(s,{wave:1},'care')>serviceMs(s,p,'care'));
});
test('opening presents a real queue before 10 seconds; future warnings are grounded in appointments',()=>{
 const s=advance(begin(),6000);assert.ok(inspect(s).intakeQueue>=2);assert.equal(s.lost,0);
 const warned=advance(begin(),22000);assert.ok(warned.events.some(e=>e.type==='wave-preview'&&e.at===22000));
 assert.equal(WAVES[1].at,30000);
});
test('room and doctor prerequisites preserve cash and capacity',()=>{
 let s=begin();assert.equal(act(s,{type:'buy',item:'doctor'}).doctor2,false);
 s=act(s,{type:'buy',item:'room'});assert.equal(s.cash,C.startCash-C.roomCost);assert.equal(inspect(s).careCapacity,1);
 assert.equal(act(s,{type:'buy',item:'doctor'}).doctor2,false);validateState(s);
});
test('equipment has a real effect for the same patient and charges exactly once',()=>{
 const s=begin(),b=act(s,{type:'buy',item:'equipment'});assert.ok(serviceMs(b,{wave:1},'care')<serviceMs(s,{wave:1},'care'));
 assert.equal(b.cash,s.cash-C.equipmentCost);assert.deepEqual(act(b,{type:'buy',item:'equipment'}),b);
});
test('helper takes three seconds and repeated assignment cannot restart travel',()=>{
 let s=act(begin(),{type:'assign',station:'care'});s=advance(s,1000);const t=s.helper.travelMs;
 s=act(s,{type:'assign',station:'care'});assert.equal(s.helper.travelMs,t);assert.equal(s.helper.station,'idle');
 s=advance(s,2000);assert.equal(s.helper.station,'care');assert.equal(s.helper.travelMs,0);
});
test('pause freezes patient, clock and wages; resume continues normally',()=>{
 const p=act(advance(begin(),20000),{type:'pause'});assert.deepEqual(advance(p,10000),p);
 assert.equal(tick(act(p,{type:'pause'})).timeMs,p.timeMs+C.stepMs);
});
test('same seed recreates identical appointments; other seeds vary without input-dependent spawning',()=>{
 const s=createInitial(2026);assert.deepEqual(s.schedule,createInitial(2026).schedule);assert.notDeepEqual(s.schedule,createInitial(9109).schedule);
 const a=advance(begin(),30000),b=advance(act(begin(),{type:'assign',station:'intake'}),30000);assert.equal(a.arrived,b.arrived);
});
test('1x delta contract rejects artificial large ticks',()=>{assert.throws(()=>tick(begin(),3000));});
test('new saves are versioned, round-trip exactly, reject old format and other namespaces',()=>{
 const s=advance(begin(),35000),raw=encodeSave(s,'clinic-v2');assert.deepEqual(decodeSave(raw,'clinic-v2'),s);
 assert.equal(decodeSave(raw,'other'),null);assert.equal(decodeSave(raw.replace('"format":2','"format":1'),'clinic-v2'),null);
 assert.equal(decodeSave('{broken','clinic-v2'),null);
});
test('corrupt cohort/cash/schedule and duplicate active stations cannot be accepted',()=>{
 const s=advance(begin(),10000);
 for(const change of [v=>v.cash++,v=>v.patients[0].wave=4,v=>v.schedule[0]++,v=>v.version=1]){const v=structuredClone(s);change(v);assert.throws(()=>validateState(v));}
});
test('single dispatch can reach count but does not silently award the quality goal',()=>{
 const s=advance(act(begin(),{type:'assign',station:'care'}),C.durationMs);assert.ok(s.completed>=C.goalCompleted);assert.ok(s.lost>C.maxLost);assert.equal(outcome(s).passed,false);
});
test('reaching a numerical target is not a finished shift',()=>{assert.equal(outcome({...begin(),completed:100,lost:0}).passed,false);});
test('twenty independent seeds preserve patient counts, cash, terminal time and validated saves',()=>{
 for(let seed=1;seed<=20;seed++){
  let s=act(createInitial(seed),{type:'start'});s=act(s,{type:'buy',item:'equipment'});s=act(s,{type:'assign',station:'intake'});
  while(s.status==='running'){s=tick(s);if(s.timeMs%15000===0)validateState(s);}
  assert.equal(s.arrived,s.completed+s.lost+inspect(s).unfinished);assert.equal(s.income,s.completed*C.fee);assert.equal(s.cash,C.startCash+s.income-s.spent-s.wages);assert.equal(s.timeMs,180000);validateState(s);
 }
});
test('restart uses the same seed and never imports old patient progress',()=>{const s=advance(begin(),40000);assert.deepEqual(act(s,{type:'restart'}),createInitial(2026));});
