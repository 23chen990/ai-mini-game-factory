/* global console, process */
/**
 * Engine-accurate, scene-free manual analogue steering physics comparison.
 * Privileged centerline controller is synthetic; NEVER label as human/natural QA.
 * Native pinned Track/PlayerCar and the one shipped ManualRaceDriver are updated every tick.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { pathToFileURL } from 'node:url';
import { ManualRaceDriver, TouchActions } from '../../templates/web-lite/h5-source-mobile-v1/racing/driver.mjs';
import { STAGES } from '../../templates/web-lite/h5-source-mobile-v1/racing/career.mjs';
import { tuneOpponentField, seedCompetitiveField } from '../../templates/web-lite/h5-source-mobile-v1/racing/rival-pressure.mjs';
import { applyTrackDesign } from '../../templates/web-lite/h5-source-mobile-v1/racing/track-design.mjs';

const run=path.join(process.cwd(),'runs/h5-qq-mobile-20261013');
const src=path.join(run,'workspace/source/qq-speed/src');
const build=JSON.parse(await readFile(path.join(run,'artifacts/build-racing.json'),'utf8'));
const raw=await readFile(path.join(src,'layouts.js'),'utf8');
const start="import { applyTrackDesign } from './race-track-design.mjs';\n";
const end='\napplyTrackDesign(LAYOUTS);';
if(!raw.startsWith(start)||!raw.trimEnd().endsWith(end))
  throw Error('Unknown pinned native layout adapter; refusing synthetic physics QA');
const layouts=(await import('data:text/javascript;base64,'+Buffer.from(
  raw.slice(start.length).trimEnd().slice(0,-end.length)).toString('base64'))).LAYOUTS;
const revised=JSON.parse(JSON.stringify(layouts));applyTrackDesign(revised);
const { Track }=await import(pathToFileURL(path.join(src,'track.js')).href);
const { PlayerCar }=await import(pathToFileURL(path.join(src,'vehicle.js')).href);
const { AICar }=await import(pathToFileURL(path.join(src,'ai.js')).href);
const { mulberry32 }=await import(pathToFileURL(path.join(src,'util.js')).href);

const STEP=1/120, MAX_SEC=235;
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
function control(p,tr,policy) {
  if(policy==='straight')return {steerAxis:0};
  const look=p.s*(policy==='late'?.16:.35)+(policy==='late'?4:12);
  const next=tr.sample(p.d+Math.max(6,look),{});
  const center=Math.atan2(.85*p.lat,Math.max(10,p.s*.55));
  const diff=wrap(next.hd+center-p.h);
  const dead=policy==='late'?.105:.055;
  return {steerAxis:Math.abs(diff)<=dead ? 0 : Math.max(-1,Math.min(1,diff*2.2))};
}
function simulate(layout,policy,laps=2) {
  const tr=new Track(layout),p=new PlayerCar(tr,null,'Native physics analogue-wheel probe');
  p.reset(-25,0);
  p.stats={crash:0};
  const actions=new TouchActions(),adapter=new ManualRaceDriver(actions);
  let absolute=-25,lastD=p.d,elapsed=0,lastAdvance=0;
  let crashes=0,drifts=0,airSec=0,nearRailSec=0,brakeSec=0;
  let lastCrash=-10,travel=0,peak=0,boosts=0;
  const goal=tr.length*laps;
  let result='TIMED_OUT';
  for(let i=0;i<Math.ceil(MAX_SEC/STEP);i++){
    const steering=control(p,tr,policy);
    const future=tr.sample(p.d+Math.max(10,p.s*.4),{});
    const bend=Math.abs(tr.curv?.[future.i] ?? 0);
    // An instrumented synthetic driver explicitly PRESSES drift on meaningful
    // turns. No automatic drifting is available in the actual game input.
    const askDrift=bend>.005 && Math.abs(steering.steerAxis)>.35 &&
      p.s>19 && p.spin<=0 && !p.airborne && p.wrongWay<.4;
    if(askDrift && !actions.isHeld('drift'))actions.press(1,'drift',elapsed);
    if(!askDrift && actions.isHeld('drift'))actions.release(1);
    const input=adapter.frame(steering,p,'race',{track:tr,now:elapsed});
    if(input.down)brakeSec+=STEP;
    p.update(STEP,input,true,false);
    elapsed+=STEP;
    let dd=p.d-lastD;
    if(dd>tr.length/2)dd-=tr.length;
    if(dd<-tr.length/2)dd+=tr.length;
    lastD=p.d;
    absolute+=dd;p.progress=absolute;
    travel+=Math.max(0,dd);peak=Math.max(peak,p.s);
    if(dd>.05)lastAdvance=elapsed;
    if(p.airborne)airSec+=STEP;
    if(Math.abs(p.lat)>tr.halfW-2)nearRailSec+=STEP;
    for(const ev of p.events.splice(0)){
      if(ev.type==='driftEnd' && ev.data?.time>.22)drifts++;
      if(ev.type==='smallBoost'||ev.type==='landBoost')boosts++;
      if(ev.type==='crash' && elapsed-lastCrash>.4) {crashes++;lastCrash=elapsed;p.stats.crash++;}
    }
    if(absolute>=goal){result='FINISHED';break;}
    if(elapsed-lastAdvance>20){result='STUCK';break;}
  }
  return {status:result,elapsedSec:+elapsed.toFixed(1),
    roadLengthM:Math.round(tr.length),progressM:Math.round(absolute),travelM:Math.round(travel),
    crashes,drifts,boosts,brakeSec:+brakeSec.toFixed(1),
    railSec:+nearRailSec.toFixed(1),airSec:+airSec.toFixed(1),
    topSpeedKmh:Math.round(peak*3.6)};
}
const report={schemaVersion:1,buildHash:build.buildHash,
  pinnedRevision:build.sourceRevision,speedUnit:'m/s',timestepsPerSecond:120,
  simulatedController:true,naturalInputsOnly:false,seededCampaign:false,
  limitations:'Synthetic privileged-centerline analogue steering with scripted manual drift presses; NOT human gameplay or win-rate. No renderer, opponent contact, item pickups, game rank, pads or real player decisions.',
  maps:{}};
for(const name of ['city','aegean','egypt','snow']) {
  const cases={};
  for(const [kind,layout] of [['original',layouts[name]],['reshaped',revised[name]]]){
    const trials={};
    for(const driver of ['guided','late','straight']){
      trials[driver]={manual:simulate(layout,driver)};
    }
    cases[kind]=trials;
  }
  report.maps[name]=cases;
}
// Stage 13 and 16 have three laps; preserve two-lap map data for comparison,
 // and measure the full native PlayerCar distance separately.
report.bossThreeLaps={};
for(const [id,map] of [['13','city'],['16','aegean']]){
  const cases={};
  for(const [kind,layout] of [['original',layouts[map]],['reshaped',revised[map]]])
    cases[kind]={guided:simulate(layout,'guided',3),
      late:simulate(layout,'late',3)};
  report.bossThreeLaps[id]={map,laps:3,...cases};
}
/** V4.2 race-design audit: physically drive ALL sixteen real stage splines.
 * The guided and late controllers cheat by reading the native Track centerline.
 * The native AI drives the same Track by unmodified AICar.update; zero rubber
 * bias, collisions, pickups, server actions or synthesized rank changes.
 * This is NOT a human success-rate forecast. It catches undrivable geometry
 * and exposes an actual pace gap for difficulty tuning.
 */
function nativeAceSkill(stage) {
  if(stage.kind==='boss')return stage.id==='16'?2.10:2.04;
  const range=stage.diff===0?[.55,.75]:stage.diff===1?[.85,1.05]:[1.2,1.38];
  const field=Array.from({length:5},(_,i)=>({
    isPlayer:false,skill:range[0]+(range[1]-range[0])*i/4
  }));
  tuneOpponentField(field,stage);
  seedCompetitiveField(field,stage);
  if(stage.kind==='overtake')for(const rival of field.slice(0,2))
    rival.skill=Math.max(rival.skill,1.12);
  return Math.max(...field.map(r=>r.skill));
}
function nativeAiRun(layout,skill,laps,seed) {
  const tr=new Track(layout);
  const bot=new AICar(tr,null,'Native field pace',skill,mulberry32(seed));
  bot.reset(-25,0);
  let time=0,peak=0;
  for(let i=0;i<Math.ceil(MAX_SEC/STEP);i++){
    bot.update(STEP,true,time,1);
    time+=STEP;peak=Math.max(peak,bot.s);
    if(bot.dist>=tr.length*laps)
      return {status:'FINISHED',elapsedSec:+time.toFixed(1),topSpeedKmh:Math.round(peak*3.6)};
  }
  return {status:'TIMED_OUT',elapsedSec:+time.toFixed(1),topSpeedKmh:Math.round(peak*3.6)};
}
report.courses={};
for(const stage of STAGES){
  const layout=revised[stage.course];
  if(!Array.isArray(layout?.points))throw Error('Stage must use its actual authored physical spline '+stage.course);
  const guided=simulate(layout,'guided',stage.laps);
  const late=simulate(layout,'late',stage.laps);
  const aceSkill=nativeAceSkill(stage);
  const ace=nativeAiRun(layout,aceSkill,stage.laps,2026101700+Number(stage.id));
  report.courses[stage.id]={
    course:stage.course,biome:stage.map,laps:stage.laps,rankRequired:stage.rank,
    aceSkill,guided,late,ace,
    relativeGapPercent:guided.status==='FINISHED'&&ace.status==='FINISHED'
      ?+((guided.elapsedSec-ace.elapsedSec)/ace.elapsedSec*100).toFixed(1):null
  };
}
/** Small fixed-seed SOLO-AI trials for the whole competitive pack.
 * This is not a six-car actual race and has NO opponent contact, collisions
 * with other racers, items or real player responses. It validates that
 * narrowing later stages did not strand the catchable/slower rivals.
 */
report.fieldPace={};
for(const id of STAGES.map(s=>s.id)){
  const stage=STAGES.find(x=>x.id===id),layout=revised[stage.course];
  const srcRange=stage.diff===0?[.55,.75]:stage.diff===1?[.85,1.05]:[1.2,1.38];
  const cars=Array.from({length:5},(_,i)=>({
    isPlayer:false,skill:srcRange[0]+(srcRange[1]-srcRange[0])*i/4,
  }));
  tuneOpponentField(cars,stage);
  seedCompetitiveField(cars,stage);
  if(stage.kind==='boss')cars[0].skill=stage.id==='16'?2.10:2.04;
  if(stage.kind==='overtake')for(const car of cars.slice(0,2))
    car.skill=Math.max(car.skill,1.12);
  const entrants=cars.map((car,i)=>({
    skill:car.skill,
    ...nativeAiRun(layout,car.skill,stage.laps,2026101700+Number(id)+i),
  }));
  const late=report.courses[id].late;
  report.fieldPace[id]={
    raceId:id,entrants,
    beatPrivilegedLate:late.status==='FINISHED'
      ?entrants.filter(x=>x.status==='FINISHED'&&x.elapsedSec<late.elapsedSec).length : null,
    note:'SOLO simulations with distinct seeded AICars and no racer-on-racer traffic; NOT a measured human finish rank',
  };
}
report.courseAudit={independentCourseCount:Object.keys(report.courses).length,
  guidedCompletions:Object.values(report.courses).filter(c=>c.guided.status==='FINISHED').length,
  lateCompletions:Object.values(report.courses).filter(c=>c.late.status==='FINISHED').length,
  aceCompletions:Object.values(report.courses).filter(c=>c.ace.status==='FINISHED').length,
  methodology:'Privileged guided/late controllers vs native unmodified AICar with fixed pre-race seed on actual courses; no collisions, race tactics, or adaptive rubber; never a human win-rate or full campaign',
  noRankTampering:true,packProbeCount:Object.keys(report.fieldPace).length};

const out=path.join(run,'artifacts/racing-v3-smoke');
await mkdir(out,{recursive:true});
await writeFile(path.join(out,'native-player-pace-v34.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({buildHash:report.buildHash,physics:'pinned PlayerCar.update',
  maps:Object.fromEntries(Object.entries(report.maps).map(([name,series])=>[
    name,{original:series.original.guided.manual,
      reshaped:series.reshaped.guided.manual,
      late:series.reshaped.late.manual}])),courseAudit:report.courseAudit,
  fieldPace:Object.fromEntries(Object.entries(report.fieldPace).map(([id,v])=>
    [id,{soloSkills:v.entrants.map(x=>x.skill),soloFinishTimes:v.entrants.map(x=>x.elapsedSec),
      beatPrivilegedLate:v.beatPrivilegedLate}])),
  stagePace:Object.fromEntries(Object.entries(report.courses).map(([id,c])=>[id,{
    guided:c.guided.status==='FINISHED'?c.guided.elapsedSec:c.guided.status,
    late:c.late.status==='FINISHED'?c.late.elapsedSec:c.late.status,
    nativeAce:c.ace.status==='FINISHED'?c.ace.elapsedSec:c.ace.status,
    skill:c.aceSkill,relativeGapPercent:c.relativeGapPercent}]))}));
