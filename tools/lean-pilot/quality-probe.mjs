/* global process, console */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { safeRead, sha256 } from './policy.mjs';

/** Execute the real candidate. Synthetic deterministic inputs are NOT human sessions. */
export async function probeClinic(game,seeds=[17,2026,9109]){
  await safeRead(game,'engine.mjs');
  const api=await import(pathToFileURL(path.join(game,'engine.mjs')).href+'?qa='+sha256(await safeRead(game,'engine.mjs')));
  const {CONFIG:c,createInitial,act,tick,inspect,encodeSave,decodeSave,serviceMs}=api;
  if(![createInitial,act,tick,inspect,encodeSave,decodeSave].every(f=>typeof f==='function')||c.stepMs!==250||c.durationMs!==180000)throw new Error('Unsupported clinic engine contract');
  const start=seed=>act(createInitial(seed),{type:'start'});
  function advance(s,ms){for(let t=0;t<ms;t+=c.stepMs)s=tick(s);return s;}
  function simulate(seed,policy,equipmentAtStart=false,oneAt=0){
    let s=start(seed),firstIncomeMs=null,firstQueueMs=null,firstWarningMs=null,firstLossMs=null,nextSwitch=0,actions=0;
    const trace=[];
    const send=a=>{const before=s;s=act(s,a);if(a.type==='assign'&&before.helper.target!==s.helper.target||a.type==='buy'&&before.spent!==s.spent)actions++;};
    if(equipmentAtStart)send({type:'buy',item:'equipment'});
    for(let turn=0;turn<c.durationMs/c.stepMs&&s.status==='running';turn++){
      if(s.timeMs===oneAt){if(['intake','care'].includes(policy))send({type:'assign',station:policy});if(policy==='equipment-once')send({type:'buy',item:'equipment'});if(policy==='room-once')send({type:'buy',item:'room'});}
      if(policy==='adaptive'&&turn%4===0){
        if(s.timeMs>=20000&&!s.equipment&&s.cash>=c.equipmentCost)send({type:'buy',item:'equipment'});
        else if(!s.room2&&s.cash>=c.roomCost+c.doctorCost)send({type:'buy',item:'room'});
        else if(s.room2&&!s.doctor2&&s.cash>=c.doctorCost)send({type:'buy',item:'doctor'});
        const q=inspect(s);
        const waiting=k=>s.patients.filter(p=>p.phase===k+'Wait');
        const load=k=>typeof serviceMs==='function'?waiting(k).reduce((n,p)=>n+serviceMs(s,p,k),0):(k==='intake'?q.intakeQueue*c.intakeMs:q.careQueue*q.careMs);
        const urgency=(k,lim)=>waiting(k).length?Math.max(0,14000-(lim-(s.timeMs-waiting(k)[0].since)))*2:0;
        const i=load('intake')+urgency('intake',c.intakePatienceMs),care=load('care')/(s.doctor2?2:1)+urgency('care',c.carePatienceMs);
        const target=i>care?'intake':'care';
        if(!s.helper.travelMs&&s.timeMs>=nextSwitch&&s.helper.target!==target&&(s.helper.station==='idle'||Math.abs(i-care)>4000)){
          send({type:'assign',station:target});nextSwitch=s.timeMs+5000;
        }
      }
      s=tick(s);const q=inspect(s);
      if(firstIncomeMs===null&&s.completed>0)firstIncomeMs=s.timeMs;
      if(firstQueueMs===null&&(q.intakeQueue>=2||q.careQueue>=2))firstQueueMs=s.timeMs;
      if(firstWarningMs===null&&(q.intakeDeadlineMs!==null&&q.intakeDeadlineMs<=10000||q.careDeadlineMs!==null&&q.careDeadlineMs<=10000))firstWarningMs=s.timeMs;
      if(firstLossMs===null&&s.lost>0)firstLossMs=s.timeMs;
      if(s.timeMs%15000===0)trace.push({at:s.timeMs,completed:s.completed,lost:s.lost,cash:s.cash,intake:q.intakeQueue,care:q.careQueue,helper:s.helper.target});
    }
    return {seed,policy,oneAt,equipmentAtStart,actions,arrived:s.arrived,completed:s.completed,lost:s.lost,unfinished:inspect(s).unfinished,
      income:s.income,spent:s.spent,wages:s.wages,cash:s.cash,firstIncomeMs,firstQueueMs,firstWarningMs,firstLossMs,lossReasons:s.lossReasons,trace,
      timeMs:s.timeMs,status:s.status,events:s.events.map(e=>e.type),objectivePassed:s.completed>=c.goalCompleted&&s.lost<=c.maxLost&&s.status==='finished'};
  }
  const profiles=seeds.map(seed=>({seed,none:simulate(seed,'none'),intake:simulate(seed,'intake'),care:simulate(seed,'care'),upgraded:simulate(seed,'none',true),adaptive:simulate(seed,'adaptive')}));
  // Search multiple delayed one-action timings, not just an action at t=0.
  const singleAction=[];
  for(const seed of seeds)for(const pol of ['intake','care','equipment-once','room-once'])for(const at of [0,5000,10000,20000,30000,45000,60000,90000,120000,150000]){
    const x=simulate(seed,pol,false,at);singleAction.push({seed,policy:pol,at,actions:x.actions,completed:x.completed,lost:x.lost,passed:x.objectivePassed});
  }
  const seed=seeds[0],initial=start(seed),room=act(initial,{type:'buy',item:'room'});
  const assigned=act(initial,{type:'assign',station:'care'}),travelling=advance(assigned,c.helperTravelMs-c.stepMs),arrived=advance(assigned,c.helperTravelMs);
  const active=advance(start(seed),20000),paused=act(active,{type:'pause'}),afterPause=advance(paused,5000);
  const restored=decodeSave(encodeSave(active,'qa-clinic'),'qa-clinic'),purchased=act(initial,{type:'buy',item:'equipment'});
  return {schemaVersion:1,kind:'ENGINE_SIMULATION',scope:'candidate only; no competitor, human or learned optimal strategy',seeds,
    parameters:{startCash:c.startCash,fee:c.fee,equipmentCost:c.equipmentCost,roomCost:c.roomCost,doctorCost:c.doctorCost,careMs:c.careMs,upgradedCareMs:c.upgradedCareMs,travelMs:c.helperTravelMs},profiles,
    active:{rulesVersion:initial.version,goal:c.goalCompleted,maxLost:c.maxLost,singleAction,openingQueues:profiles.map(r=>({seed:r.seed,firstQueueMs:r.none.firstQueueMs,firstWarningMs:r.none.firstWarningMs,firstLossMs:r.none.firstLossMs})),passingAdaptive:profiles.filter(r=>r.adaptive.objectivePassed).length,failedSingleActions:singleAction.filter(r=>!r.passed).length},
    facts:{roomAloneCapacity:inspect(room).careCapacity,roomBought:room.room2,doctorWithoutRoom:act(initial,{type:'buy',item:'doctor'}).doctor2,roomCashDelta:initial.cash-room.cash,equipmentCashDelta:initial.cash-purchased.cash,equippedDuration:inspect(purchased).careMs,unequippedDuration:inspect(initial).careMs,beforeArrivalTravel:travelling.helper.travelMs,afterArrivalTravel:arrived.helper.travelMs,arrivalStation:arrived.helper.station,pausedFrozen:JSON.stringify(paused)===JSON.stringify(afterPause),saveRoundTrip:JSON.stringify(active)===JSON.stringify(restored),foreignSaveRejected:decodeSave(encodeSave(active,'qa-clinic'),'other-game')===null,invalidSaveRejected:decodeSave('{broken','qa-clinic')===null}};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  try{if(process.argv.length!==3)throw new Error('Expected one owned candidate path');console.log(JSON.stringify(await probeClinic(path.resolve(process.argv[2]))));}catch(error){console.error(error instanceof Error?error.message:'Probe failed');process.exitCode=1;}
}
