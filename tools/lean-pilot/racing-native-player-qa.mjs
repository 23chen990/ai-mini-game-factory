/* global console, process */
/**
 * Engine-accurate, scene-free two-button physics comparison.
 * Privileged centerline controller is synthetic; NEVER label as human/natural QA.
 * Native pinned Track/PlayerCar and owned RaceDriver are updated for every physics tick.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { pathToFileURL } from 'node:url';
import { RaceDriver } from '../../templates/web-lite/h5-source-mobile-v1/racing/driver.mjs';
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

const STEP=1/120, MAX_SEC=235;
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
function control(p,tr,policy) {
  if(policy==='straight')return {left:false,right:false};
  const look=p.s*(policy==='late'?.16:.35)+(policy==='late'?4:12);
  const next=tr.sample(p.d+Math.max(6,look),{});
  const center=Math.atan2(.85*p.lat,Math.max(10,p.s*.55));
  const diff=wrap(next.hd+center-p.h);
  const dead=policy==='late'?.105:.055;
  return {left:diff>dead,right:diff<-dead};
}
function simulate(layout,policy,assist) {
  const tr=new Track(layout),p=new PlayerCar(tr,null,'Native physics two-key probe');
  p.reset(-25,0);
  p.stats={crash:0};
  const adapter=new RaceDriver();
  let absolute=-25,lastD=p.d,elapsed=0,lastAdvance=0;
  let crashes=0,drifts=0,airSec=0,nearRailSec=0,brakeSec=0;
  let lastCrash=-10,travel=0,peak=0,boosts=0;
  const goal=tr.length*2;
  let result='TIMED_OUT';
  for(let i=0;i<Math.ceil(MAX_SEC/STEP);i++){
    const steering=control(p,tr,policy);
    const input=adapter.frame(STEP,steering,p,tr,'race');
    if(!assist && (p.wrongWay??0)<.4 && p.spin<=0 && !p.drifting) {
      // Disable ONLY our new curve-braking branch for the baseline; leave
      // native U-turn rescue and other auto-boost intent unchanged.
      input.down=false;input.up=true;
    }
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
  limitations:'Privileged centerline synthetic steering, NOT touch-visible steering, not player realism. Native physics and two-button driver only; no renderer, opponent contact, item pickups, game rank, pads or human decision making.',
  maps:{}};
for(const name of ['city','aegean','egypt','snow']) {
  const cases={};
  for(const [kind,layout] of [['original',layouts[name]],['reshaped',revised[name]]]){
    const trials={};
    for(const driver of ['guided','late','straight']){
      trials[driver]=driver==='straight' ? {auto:simulate(layout,driver,true)} :
        {auto:simulate(layout,driver,true),noCurveBrake:simulate(layout,driver,false)};
    }
    cases[kind]=trials;
  }
  report.maps[name]=cases;
}
const out=path.join(run,'artifacts/racing-v3-smoke');
await mkdir(out,{recursive:true});
await writeFile(path.join(out,'native-player-pace-v34.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({buildHash:report.buildHash,physics:'pinned PlayerCar.update',
  maps:Object.fromEntries(Object.entries(report.maps).map(([name,series])=>[
    name,{original:series.original.guided.auto,
      reshaped:series.reshaped.guided.auto,
      reshapedWithoutCurveBrake:series.reshaped.guided.noCurveBrake,
      late:series.reshaped.late.auto}]))}));
