/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitial, act, tick, inspect, validateState, encodeSave, decodeSave, CONFIG } from '../engine.mjs';

const advance = (s,ms) => { for(let t=0;t<ms;t+=CONFIG.stepMs)s=tick(s);return s; };
const start = seed => act(createInitial(seed),{type:'start'});
function play(policy,seed=1){
  let s=start(seed);
  while(s.status==='running'){
    if(s.timeMs%2000===0) {
      if(policy==='misplaced')s=act(s,{type:'assign',station:'intake'});
      if(policy==='adaptive'){
        const q=inspect(s);
        if(!s.equipment&&s.cash>=CONFIG.equipmentCost)s=act(s,{type:'buy',item:'equipment'});
        else if(!s.room2&&s.cash>=CONFIG.roomCost+CONFIG.doctorCost)s=act(s,{type:'buy',item:'room'});
        else if(s.room2&&!s.doctor2&&s.cash>=CONFIG.doctorCost)s=act(s,{type:'buy',item:'doctor'});
        const target=q.intakeQueue*CONFIG.intakeMs>(q.careQueue+1)*(s.equipment?CONFIG.upgradedCareMs:CONFIG.careMs)/(s.doctor2?2:1)?'intake':'care';
        s=act(s,{type:'assign',station:target});
      }
    }
    s=tick(s);
  }
  return s;
}
test('new clinic is deterministic, paused before start and independently owned',()=>{
  const a=createInitial(9),b=createInitial(9);assert.deepEqual(a,b);a.cash=0;assert.notEqual(a.cash,b.cash);
  assert.deepEqual(tick(b),b);assert.equal(inspect(b).completed,0);
});
test('start, pause and resume use normal actions; paused time and money do not advance',()=>{
  let s=advance(start(1),10000);s=act(s,{type:'pause'});assert.equal(s.status,'paused');assert.deepEqual(tick(s),s);
  s=act(s,{type:'pause'});assert.equal(s.status,'running');assert.equal(tick(s).timeMs,s.timeMs+CONFIG.stepMs);
});
test('assignment takes travel time and cannot speed up either station while moving',()=>{
  let s=start(1);s=act(s,{type:'assign',station:'care'});assert.equal(s.helper.travelMs,CONFIG.helperTravelMs);
  const before=structuredClone(s);assert.deepEqual(act(s,{type:'assign',station:'care'}),before);
  s=advance(s,CONFIG.helperTravelMs);assert.equal(s.helper.travelMs,0);assert.equal(s.helper.station,'care');
});
test('room alone is not a second service position; doctor requires a built room and cash',()=>{
  let s=start(2);assert.deepEqual(act(s,{type:'buy',item:'doctor'}),s);
  s=act(s,{type:'buy',item:'room'});assert.equal(s.room2,true);assert.equal(s.doctor2,false);
  assert.equal(inspect(s).careCapacity,1);assert.ok(s.cash>=0);
  assert.deepEqual(act(s,{type:'buy',item:'room'}),s);
});
test('purchases conserve money, reject overdrafts and upgrades have finite levels',()=>{
  let s=start(3);const before=s.cash;s=act(s,{type:'buy',item:'equipment'});
  assert.equal(s.cash,before-CONFIG.equipmentCost);assert.equal(s.spent,CONFIG.equipmentCost);
  assert.deepEqual(act(s,{type:'buy',item:'equipment'}),s);
  if(s.cash<CONFIG.roomCost)assert.deepEqual(act(s,{type:'buy',item:'room'}),s);
  assert.equal(inspect(s).careMs,CONFIG.upgradedCareMs);
});
test('patience loss has a station-specific reason and never produces treatment income',()=>{
  const s=play('misplaced');assert.ok(s.lost>0);assert.equal(s.income,s.completed*CONFIG.fee);
  assert.equal(s.lost,s.lossReasons.intake+s.lossReasons.care);assert.ok(s.lossReasons.care>0);
});
test('schedule is fixed by seed: every policy receives exactly the same arrivals',()=>{
  for(const seed of [1,7,100]){
    const a=play('none',seed),b=play('misplaced',seed),c=play('adaptive',seed);
    assert.equal(a.arrived,b.arrived);assert.equal(b.arrived,c.arrived);assert.deepEqual(a.schedule,c.schedule);
  }
});
test('correct investment and dispatch improve actual service over both comparison policies',()=>{
  for(const seed of [1,7,17,2026]){
    const idle=play('none',seed),bad=play('misplaced',seed),good=play('adaptive',seed);
    assert.ok(good.completed>idle.completed,JSON.stringify({seed,idle:idle.completed,good:good.completed}));
    assert.ok(good.completed>bad.completed);assert.ok(good.lost<bad.lost);
    assert.ok(good.equipment&&good.room2&&good.doctor2);assert.equal(good.status,'finished');
  }
});
test('patient and cash conservation across seeded state transitions',()=>{
  for(let seed=1;seed<=30;seed++){
    const s=play(seed%2?'adaptive':'none',seed);assert.equal(validateState(s),true);
    assert.equal(s.cash,CONFIG.startCash+s.income-s.spent-s.wages);
    assert.equal(s.arrived,s.completed+s.lost+inspect(s).unfinished);
    assert.ok(s.cash>=0);assert.ok(s.events.length<=CONFIG.maxEvents);
  }
});
test('ordinary transitions do not mutate caller state',()=>{
  const s=start(5),snapshot=structuredClone(s);tick(s);act(s,{type:'buy',item:'equipment'});assert.deepEqual(s,snapshot);
});
test('settlement is terminal and replay starts a separate fresh run',()=>{
  const s=play('adaptive');assert.deepEqual(tick(s),s);assert.deepEqual(act(s,{type:'buy',item:'equipment'}),s);
  const next=act(s,{type:'restart'});assert.equal(next.status,'ready');assert.equal(next.completed,0);assert.equal(next.timeMs,0);
});
test('save roundtrip preserves exact simulation; returning is paused, never simulated offline',()=>{
  const s=advance(act(start(3),{type:'assign',station:'care'}),18000);const raw=encodeSave(s,'clinic-test');
  assert.deepEqual(decodeSave(raw,'clinic-test'),s);assert.equal(decodeSave(raw,'other-game'),null);
});
test('malformed saves, forged counters, invalid phases and unsupported versions are rejected',()=>{
  const good=start(1);for(const mutate of [s=>s.cash=-1,s=>s.completed=999,s=>s.timeMs=NaN,s=>s.version=4,s=>s.helper.station='fake',s=>s.schedule=[0,0]]){
    const s=structuredClone(good);mutate(s);assert.throws(()=>encodeSave(s,'test'));
  }
  for(const bad of ['null','{}','not json','x'.repeat(200000)])assert.equal(decodeSave(bad,'test'),null);
});
test('unknown actions and invalid seed/delta are rejected, rather than granting resources',()=>{
  assert.throws(()=>createInitial(-1));assert.throws(()=>createInitial('9'));
  assert.throws(()=>act(start(1),{type:'grant',amount:999}));assert.throws(()=>tick(start(1),-100));
});
