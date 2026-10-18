/* global process */
/**
 * Deterministic V11 player physics fixtures, never natural player evidence.
 * Every moving step uses shipped ManualRaceDriver -> generated PlayerCar.
 * Initial speed/location/heading fixtures are declared below. No subsequent
 * coordinates, headings, speed, progress, lap or rank are written by this QA.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import { ManualRaceDriver, TouchActions } from '../../templates/web-lite/h5-source-mobile-v1/racing/driver.mjs';

const STEP=1/120;
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
const snapshot=p=>Object.fromEntries(['x','y','z','h','m','s','d','nitroCount','smallWindow','lapsDone','progress'].map(key=>[key,p[key]]));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

export async function runV11NativePlayerQa({
  run=path.join(process.cwd(),'runs/h5-qq-mobile-20261013'),
  project=process.env.RACE_NATIVE_PROJECT,
  out,
}={}) {
  const src=path.join(project??path.join(run,'workspace/source/qq-speed'),'src');
  const artifact=out??path.join(run,'artifacts/racing-v115-native-player/native-player-physics.json');
  const build=JSON.parse(await readFile(path.join(run,'artifacts/build-racing.json'),'utf8'));
  const load=name=>import(pathToFileURL(path.join(src,name)).href);
  const [{Track},{PlayerCar},{AICar},{LAYOUTS},{installPhysicalShortcut}]=await Promise.all([
    load('track.js'),load('vehicle.js'),load('ai.js'),load('layouts.js'),load('race-shortcut-network.mjs'),
  ]);
  assert.equal(build.aiMode,'native-playercar-physics','V11 default QA requires a V11 physical-AI build receipt');
  assert.ok(AICar.prototype instanceof PlayerCar,'default runtime AI must no longer use the historical spline integrator');
  const sourceHashes=Object.fromEntries(await Promise.all([
    'vehicle.js','track.js','main.js','layouts.js','ai.js','race-v11-physical-ai.mjs',
  ].map(async name=>[name,hash(await readFile(path.join(src,name)))])));
  assert.equal(sourceHashes['vehicle.js'],build.generatedVehicleSha256);
  assert.equal(sourceHashes['track.js'],build.generatedTrackSha256);
  assert.equal(sourceHashes['ai.js'],build.generatedAiSha256);
  sourceHashes['ManualRaceDriver']=hash(await readFile(new URL('../../templates/web-lite/h5-source-mobile-v1/racing/driver.mjs',import.meta.url)));
  const worldSource=await readFile(path.join(src,'main.js'),'utf8');
  const loopBody=worldSource.split('  loop() {')[1]?.split('\n  step(dt, inp) {')[0]?.trim().replace(/\}$/, '');
  assert.ok(loopBody?.includes("this.state !== 'paused'"),'native loop pause gate must be present');
  const makeNativeLoop=new Function('performance','requestAnimationFrame','return function(){'+loopBody+'}');
  const report={schemaVersion:1,version:'V11.5',buildHash:build.buildHash,
    pinnedRevision:build.sourceRevision,artifact,sourceHashes,timestepsPerSecond:120,
    simulatedController:true,naturalInputsOnly:false,rendered:false,checks:[],
    limitations:[
      'Declared initial-state fixtures and scripted player input; no claim of human play, race rank, full campaign, phone rendering or opponent contact.',
      'The legacy V3–V10 bot.dist, guided/late pace and personal-lane separation comparisons assumed the old spline AICar. They remain in --legacy-v10 mode and are not acceptance criteria for a different physical controller.',
      'All thirty V11 stages and real single-run endings belong to the independent native AI pace audit; this report measures player controls and collision consequences.',
    ],
    legacyComparisons:{status:'NOT_APPLICABLE_TO_V11',command:'node tools/lean-pilot/racing-native-player-qa.mjs --legacy-v10',
      reason:'The old suite requires a historical V10 build, original/revised route pairs, on-rail bot.dist and virtual lane behavior. No historical threshold has been relabeled as a V11 pass.'},
  };
  const check=(name,runCheck)=>{
    try {report.checks.push({name,status:'PASS',...runCheck()});}
    catch(error){report.checks.push({name,status:'FAIL',error:error.message});}
  };
  const fixture=(id,{wall=false,speed=35}={})=>{
    const track=new Track(LAYOUTS['race-'+id]);
    installPhysicalShortcut(track,'race-'+id,{v8:true,v9:true,v10:true});
    const player=new PlayerCar(track,null,'native-v11-manual-fixture');
    const start=track.length*.2;
    player.reset(start,wall?(track.v9WidthAt?.(start)??track.halfW)-1.15:0);
    player.s=speed;
    if(wall){player.h-=.62;player.m=player.h;}
    const actions=new TouchActions(),driver=new ManualRaceDriver(actions);
    return {id,track,player,actions,driver,time:0,events:[],maxStep:0,
      declaredInitialState:{distanceFraction:.2,speedMps:speed,lateral:player.lat,outwardHeadingRad:wall?.62:0}};
  };
  const step=(f,axis,{itemMode=false}={})=>{
    const before=snapshot(f.player);
    const input=f.driver.frame({steerAxis:axis},f.player,'race',{track:f.track,now:f.time,itemMode,canStep:true});
    assert.deepEqual(snapshot(f.player),before,'manual adapter may only emit inputs');
    f.player.update(STEP,input,true,itemMode);
    f.maxStep=Math.max(f.maxStep,Math.hypot(f.player.x-before.x,f.player.z-before.z));
    f.time+=STEP;
    f.events.push(...f.player.events);f.player.events.length=0;
    return input;
  };
  const count=(f,type)=>f.events.filter(event=>event.type===type).length;

  for(const id of ['01','07','22']) {
    check(id+' native countersteering while holding drift',()=>{
      const held=fixture(id),opposite=fixture(id);
      for(const f of [held,opposite])f.actions.press(1,'drift',f.time);
      for(let tick=0;tick<25;tick++){step(held,.9);step(opposite,.9);}
      assert.equal(opposite.player.drifting,true,'real native drift must begin before reversal');
      for(let tick=0;tick<28;tick++){step(held,.9);step(opposite,-.95);}
      const headingSeparationRad=Math.abs(wrap(held.player.h-opposite.player.h));
      assert.ok(headingSeparationRad>=.17,'opposite wheel must change the native physical heading by at least .17 rad');
      assert.ok(Math.max(held.maxStep,opposite.maxStep)<1.2);
      return {declaredInitialState:held.declaredInitialState,headingSeparationRad,minimumRad:.17,
        heldDriftStarts:count(held,'driftStart'),oppositeDriftStarts:count(opposite,'driftStart')};
    });
    check(id+' corrected drift release and one explicit small spray retain collision consequences',()=>{
      const uncorrected=fixture(id);
      for(let tick=0;tick<12;tick++)step(uncorrected,.9);
      uncorrected.actions.press(1,'drift',uncorrected.time);
      for(let tick=0;tick<36;tick++)step(uncorrected,.9);
      uncorrected.actions.release(1);
      for(let tick=0;tick<120&&uncorrected.player.drifting;tick++)step(uncorrected,0);
      assert.ok(count(uncorrected,'crash')>=1,'releasing without correcting this late drift must retain the actual wall consequence');
      assert.ok(uncorrected.events.some(event=>event.type==='driftEnd'&&event.data?.clean===false));
      assert.equal(uncorrected.player.smallWindow,0,'a collision exit cannot claim a clean drift spray window');
      const f=fixture(id);
      for(let tick=0;tick<12;tick++)step(f,.9);
      assert.equal(count(f,'driftStart'),0,'wheel movement alone may not start a drift');
      f.actions.press(1,'drift',f.time);
      for(let tick=0;tick<36;tick++)step(f,.9);
      assert.equal(f.player.drifting,true);
      f.actions.release(1);
      for(let tick=0;tick<120&&f.player.drifting;tick++)assert.equal(step(f,-.95).shift,false);
      assert.equal(f.player.drifting,false,'release must end an actual native drift');
      assert.ok(f.events.some(event=>event.type==='driftEnd'&&event.data?.clean===true));
      assert.ok(f.player.smallWindow>0,'a clean physical drift must open its native spray window');
      assert.equal(count(f,'smallBoost'),0,'the window alone cannot trigger a free spray');
      f.actions.press(2,'small',f.time);f.actions.release(2);
      assert.equal(step(f,0).wPressed,true);
      for(let tick=0;tick<8;tick++)step(f,0);
      assert.equal(count(f,'smallBoost'),1,'one real tap consumes exactly one native spray');
      return {declaredInitialState:f.declaredInitialState,driftStarts:count(f,'driftStart'),
        releasedSteerAxis:-.95,uncorrected:{releasedSteerAxis:0,crashes:count(uncorrected,'crash'),smallWindow:uncorrected.player.smallWindow},
        cleanDriftEnds:f.events.filter(event=>event.type==='driftEnd'&&event.data?.clean===true).length,
        smallBoosts:count(f,'smallBoost'),elapsedSec:f.time,maxStepM:f.maxStep};
    });
    check(id+' wall impact costs speed and requires drift release before restart',()=>{
      const f=fixture(id,{wall:true,speed:32});
      f.actions.press(1,'drift',f.time);
      let hitSpeed=null;
      for(let tick=0;tick<90;tick++){
        step(f,.9);
        if(count(f,'crash')){hitSpeed=f.player.s;break;}
      }
      assert.notEqual(hitSpeed,null,'must hit the actual native wall, not inject an impact flag');
      assert.ok(hitSpeed<32,'native crash must remove speed');
      assert.equal(f.player.drifting,false,'large impact must terminate the real drift');
      const starts=count(f,'driftStart');
      assert.equal(starts,1);
      for(let tick=0;tick<30;tick++)step(f,.9);
      assert.equal(count(f,'driftStart'),starts,'holding the old touch cannot silently restart drift after contact');
      f.actions.release(1);step(f,.9);
      f.actions.press(1,'drift',f.time);step(f,.9);
      assert.equal(count(f,'driftStart'),starts+1,'a fresh real press rearms drift');
      assert.ok(f.maxStep<1.2);
      return {declaredInitialState:f.declaredInitialState,crashes:count(f,'crash'),speedAfterImpactMps:hitSpeed,
        driftStartsAfterRepress:count(f,'driftStart'),maxStepM:f.maxStep};
    });
    check(id+' native pause loop freezes physics and clears stale touch actions',()=>{
      const f=fixture(id);
      f.actions.press(1,'drift',0);f.actions.press(2,'nitro',0);f.actions.press(3,'small',0);
      const before=snapshot(f.player);
      let physicsSteps=0;
      const world={state:'paused',last:0,time:0,
        input:{frame:()=>f.driver.frame({steerAxis:.9},f.player,world.state,{track:f.track,now:f.time})},
        step(dt,input){physicsSteps++;f.player.update(dt,input,true,false);},render(){},loop(){}};
      const loop=makeNativeLoop({now:()=>1000/120},()=>{});
      loop.call(world);
      assert.equal(physicsSteps,0,'the exact native Game.loop must bypass its physics step while paused');
      assert.deepEqual(snapshot(f.player),before);
      assert.equal(f.actions.pointers.size,0);
      assert.equal(f.actions.pending.size,0);
      const resumed=step(f,0);
      for(const key of ['shift','wPressed','nitroPressed','manualNitroPressed'])assert.equal(!!resumed[key],false);
      assert.equal(count(f,'driftStart')+count(f,'smallBoost')+count(f,'nitro'),0);
      return {nativeLoopExecuted:true,pausedPhysicsSteps:physicsSteps,resumedWithStaleActions:false};
    });
  }
  report.status=report.checks.every(item=>item.status==='PASS')?'PASS':'FAIL';
  await mkdir(path.dirname(artifact),{recursive:true});
  await writeFile(artifact,JSON.stringify(report,null,2)+'\n');
  return report;
}
