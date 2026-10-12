/* global process, console */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { safeRead, sha256 } from './policy.mjs';

// Evidence collection only. This worker is run with a timeout and stripped environment.
// It exercises the copied candidate through ordinary engine actions, never edits it.
// These are deterministic simulations, not normal browser input or human play sessions.
export async function probeClinic(game, seeds = [17, 2026, 9109]) {
  await safeRead(game, 'engine.mjs');
  const api = await import(pathToFileURL(path.join(game, 'engine.mjs')).href + '?qa=' + sha256(await safeRead(game, 'engine.mjs')));
  const {CONFIG:c, createInitial, act, tick, inspect, encodeSave, decodeSave} = api;
  if (![createInitial,act,tick,inspect,encodeSave,decodeSave].every(f => typeof f === 'function') || c.stepMs !== 250 || c.durationMs !== 180000) throw new Error('Unsupported clinic engine contract');
  const start = seed => act(createInitial(seed), {type:'start'});
  function advance(s, ms) { for(let t=0;t<ms;t+=c.stepMs) s=tick(s); return s; }
  function simulate(seed, policy, equipmentAtStart = false) {
    let s=start(seed), firstIncomeMs=null;
    if(equipmentAtStart) s=act(s,{type:'buy',item:'equipment'});
    const trace=[];
    for(let turn=0;turn<c.durationMs/c.stepMs && s.status==='running';turn++) {
      if(turn%8===0) {
        if(policy==='intake') s=act(s,{type:'assign',station:'intake'});
        if(policy==='care') s=act(s,{type:'assign',station:'care'});
        if(policy==='adaptive') {
          if(!s.equipment && s.cash>=c.equipmentCost) s=act(s,{type:'buy',item:'equipment'});
          else if(!s.room2 && s.cash>=c.roomCost+c.doctorCost) s=act(s,{type:'buy',item:'room'});
          else if(s.room2 && !s.doctor2 && s.cash>=c.doctorCost) s=act(s,{type:'buy',item:'doctor'});
          const q=inspect(s);
          const target=q.intakeQueue*c.intakeMs>(q.careQueue+1)*(s.equipment?c.upgradedCareMs:c.careMs)/(s.doctor2?2:1)?'intake':'care';
          s=act(s,{type:'assign',station:target});
        }
      }
      s=tick(s);
      if(firstIncomeMs===null && s.completed>0) firstIncomeMs=s.timeMs;
      if(s.timeMs%15000===0) trace.push({at:s.timeMs,completed:s.completed,lost:s.lost,cash:s.cash,intake:inspect(s).intakeQueue,care:inspect(s).careQueue});
    }
    return {seed,policy,equipmentAtStart,arrived:s.arrived,completed:s.completed,lost:s.lost,unfinished:inspect(s).unfinished,
      income:s.income,spent:s.spent,wages:s.wages,cash:s.cash,firstIncomeMs,lossReasons:s.lossReasons,trace,
      timeMs:s.timeMs,status:s.status,events:s.events.map(e=>e.type)};
  }
  const profiles=seeds.map(seed=>({seed,none:simulate(seed,'none'),intake:simulate(seed,'intake'),care:simulate(seed,'care'),
    upgraded:simulate(seed,'none',true),adaptive:simulate(seed,'adaptive')}));
  const seed=seeds[0], initial=start(seed), room=act(initial,{type:'buy',item:'room'});
  const assigned=act(initial,{type:'assign',station:'care'}), travelling=advance(assigned,c.helperTravelMs-c.stepMs), arrived=advance(assigned,c.helperTravelMs);
  const active=advance(start(seed),20000), paused=act(active,{type:'pause'}), afterPause=advance(paused,5000);
  const restored=decodeSave(encodeSave(active,'qa-clinic'),'qa-clinic');
  const purchased=act(initial,{type:'buy',item:'equipment'});
  return {schemaVersion:1,kind:'ENGINE_SIMULATION',scope:'candidate only, no competitor or humans',seeds,
    parameters:{startCash:c.startCash,fee:c.fee,equipmentCost:c.equipmentCost,roomCost:c.roomCost,doctorCost:c.doctorCost,careMs:c.careMs,upgradedCareMs:c.upgradedCareMs,travelMs:c.helperTravelMs},
    profiles,
    facts:{roomAloneCapacity:inspect(room).careCapacity,roomBought:room.room2,doctorWithoutRoom:act(initial,{type:'buy',item:'doctor'}).doctor2,
      roomCashDelta:initial.cash-room.cash,equipmentCashDelta:initial.cash-purchased.cash,
      equippedDuration:inspect(purchased).careMs,unequippedDuration:inspect(initial).careMs,
      beforeArrivalTravel:travelling.helper.travelMs,afterArrivalTravel:arrived.helper.travelMs,arrivalStation:arrived.helper.station,
      pausedFrozen:JSON.stringify(paused)===JSON.stringify(afterPause),saveRoundTrip:JSON.stringify(active)===JSON.stringify(restored),
      foreignSaveRejected:decodeSave(encodeSave(active,'qa-clinic'),'other-game')===null,
      invalidSaveRejected:decodeSave('{broken','qa-clinic')===null}};
}
if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  try {
    if(process.argv.length!==3) throw new Error('Expected one owned candidate path');
    console.log(JSON.stringify(await probeClinic(path.resolve(process.argv[2]))));
  } catch(error) {console.error(error instanceof Error?error.message:'Probe failed');process.exitCode=1;}
}
