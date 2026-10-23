/* global process */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import { createV11PhysicalAiClass, v11AiInput, v11CornerGripBudget } from '../racing/v11-physical-ai.mjs';
import { RivalPressure } from '../racing/rival-pressure.mjs';

const trackFixture = () => {
  const track = {
    length: 1800, halfW: 10, N: 1800, ds: 1,
    sample(d, out = {}) {
      const z = ((d % this.length) + this.length) % this.length;
      return Object.assign(out, { x: 0, y: 0, z, d: z, hd: 0, tx: 0, tz: 1, rx: -1, rz: 0, bank: 0, i: Math.floor(z) });
    },
    project(x, y, z, hint, out = {}) { return Object.assign(this.sample(z, out), { lat: -x, surfY: 0 }); },
    curvAhead: () => 0,
    slope: new Float32Array(1800),
    hd: new Float32Array(1800),
    bank: new Float32Array(1800),
  };
  const samples = Array.from({ length: 161 }, (_, arc) => ({
    arc, x: Math.sin(Math.PI * arc / 160) * 24, y: 0, z: 500 + arc,
    hd: Math.atan(Math.cos(Math.PI * arc / 160) * Math.PI * 24 / 160),
  }));
  track.__RACE_SHORTCUT__ = {
    course: 'race-13', start: 500, end: 700, length: 160, width: 11.5,
    neckWidth: 7.7, samples, widthAt: () => 10, entrySide: -1,
  };
  return track;
};
const carFixture = track => ({
  track, x: 0, y: 0, z: 440, h: 0, m: 0, s: 35, d: 440,
  lat: 0, personal: 0, skill: 1.7, rnd: () => 0, lapsDone: 0,
  proj: {}, drifting: false, nitroCount: 0, spin: 0, impact: 0,
});

test('V11 corner-exit pressure uses only an existing native nitro, never retired cooldown',()=>{
  const controller=new RivalPressure();
  let curve=.014;
  const native={__V11_PHYSICAL_AI__:true,isPlayer:false,finished:false,
    dist:120,s:36,drifting:false,airborne:false,spin:0,impact:0,
    slowTime:0,nitroTime:0,nitroCount:1,nitroCd:8,progress:120,name:'Rival'};
  const player={isPlayer:true,progress:100};
  const game={state:'race',raceTime:13,player,racers:[player,native],
    track:{halfW:9,curvAhead(){return curve;}}};
  assert.equal(controller.frame(game,{mode:'speed'}),null,'real bend must be entered before exit');
  curve=0;game.raceTime=13.5;
  assert.deepEqual(controller.frame(game,{mode:'speed'}),{name:'Rival',cornerExit:true});
  assert.equal(native.nitroCd,8,'obsolete on-rail cooldown must never be used');
  assert.equal(native.nitroCount,1,'boost opportunity does not grant or consume stock');
  assert.equal(native.__V11_EXIT_BOOST_TTL__,1.35);
  assert.equal(controller.frame(game,{mode:'speed'}),null,'one bend does not mint unlimited intents');
  const noStock={...native,nitroCount:0,__V11_EXIT_BOOST_TTL__:0};
  const other=new RivalPressure(),g2={...game,racers:[player,noStock],raceTime:20};
  curve=.014;other.frame(g2,{mode:'speed'});
  curve=0;g2.raceTime=20.2;
  assert.equal(other.frame(g2,{mode:'speed'}),null,'no native nitro means no boost offer');
  assert.equal(noStock.__V11_EXIT_BOOST_TTL__,0,'no native nitro: corner does not create a boost window');
});

test('V11 earns repeat safe nitro intents from real corners while legacy AI stays on its own cooldown',()=>{
  const logic=new RivalPressure();
  let curve=.018;
  const native={__V11_PHYSICAL_AI__:true,isPlayer:false,finished:false,
    dist:120,s:38,nitroCount:2,nitroTime:0,drifting:false,
    airborne:false,impact:0,slowTime:0,spin:0,progress:120,name:'Fast'};
  const player={isPlayer:true,progress:120};
  const game={state:'race',raceTime:25,player,racers:[player,native],
    track:{curvAhead:()=>curve,halfW:9}};
  assert.equal(logic.frame(game,{mode:'speed'}),null);
  game.raceTime=26;curve=.002;
  assert.deepEqual(logic.frame(game,{mode:'speed'}),{name:'Fast',cornerExit:true});
  assert.equal(native.__V11_EXIT_BOOST_TTL__,1.35);
  assert.equal(native.nitroCount,2,'pressure only schedules inputs; native stock is untouched');
  native.__V11_EXIT_BOOST_TTL__=0;
  game.raceTime=30;curve=.018;logic.frame(game,{mode:'speed'});
  game.raceTime=31;curve=.002;
  assert.equal(logic.frame(game,{mode:'speed'}),null,'no re-trigger four seconds later');
  assert.equal(native.__V11_EXIT_BOOST_TTL__,0);
  game.raceTime=35;curve=.018;logic.frame(game,{mode:'speed'});
  game.raceTime=36;curve=.002;
  assert.equal(logic.frame(game,{mode:'speed'}),null,'UI stays quiet between warnings');
  assert.equal(native.__V11_EXIT_BOOST_TTL__,1.35,'V11 can spend a second earned stock without a 22s artificial cooldown');
  assert.equal(native.nitroCount,2,'no extra nitro is created');
  native.__V11_EXIT_BOOST_TTL__=0;
  game.raceTime=49;curve=.018;logic.frame(game,{mode:'speed'});
  game.raceTime=50;curve=.002;
  assert.deepEqual(logic.frame(game,{mode:'speed'}),{name:'Fast',cornerExit:true},
    'genuine nearby threat may be signaled after the original 22s notice limit');
  native.__V11_EXIT_BOOST_TTL__=0;native.nitroCount=0;
  game.raceTime=60;curve=.018;logic.frame(game,{mode:'speed'});
  game.raceTime=61;curve=.002;
  assert.equal(logic.frame(game,{mode:'speed'}),null);
  assert.equal(native.__V11_EXIT_BOOST_TTL__,0,'zero earned nitro never becomes a free nitro intent');
  const old={...native,__V11_PHYSICAL_AI__:false,nitroCd:8,nitroCount:0};
  const legacy=new RivalPressure(),legacyGame={...game,racers:[player,old]};
  legacyGame.raceTime=25;curve=.018;legacy.frame(legacyGame,{mode:'speed'});
  legacyGame.raceTime=26;curve=.002;legacy.frame(legacyGame,{mode:'speed'});
  assert.equal(old.nitroCd,.85);
  old.nitroCd=8;legacyGame.raceTime=35;curve=.018;legacy.frame(legacyGame,{mode:'speed'});
  legacyGame.raceTime=36;curve=.002;legacy.frame(legacyGame,{mode:'speed'});
  assert.equal(old.nitroCd,8,'old on-rail AI keeps its 22s cooldown');
});
test('earned bend-exit intent spends real nitro on a safe near-straight, not a dangerous next corner',()=>{
  const track={
    length:1800,halfW:9,
    sample(d,out={}){
      const after=Math.max(0,d-70),hd=after*.007;
      return Object.assign(out,{x:.0035*after*after,z:d,y:0,d,hd,rx:-1,rz:0});
    }
  };
  const first={
    x:0,y:0,z:0,h:0,m:0,s:38,d:0,skill:1.8,personal:0,
    drifting:false,airborne:false,spin:0,impact:0,
    nitroCount:1,nitroTime:0,smallWindow:0,proj:{},lapsDone:0
  };
  const before={...first};
  const without=v11AiInput(first,track,1/120);
  assert.equal(without.nitroPressed,false,'upcoming medium bend defeats ordinary 105m straight check');
  const earned={...before,__V11_EXIT_BOOST_TTL__:1.35};
  const physicalBefore=physical(earned);
  const withIntent=v11AiInput(earned,track,1/120);
  assert.equal(withIntent.nitroPressed,true,'prior genuine clean exit may release stock earlier');
  assert.equal(withIntent.manualNitroPressed,false);
  assert.equal(earned.__V11_EXIT_BOOST_TTL__,0,'intent is consumed by one native input');
  assert.deepEqual(physical(earned),physicalBefore,'AI controller never modifies native nitro stock or car motion');
  const itemMode={...before,__V11_ITEM_MODE__:true,__V11_EXIT_BOOST_TTL__:1.35};
  const itemInput=v11AiInput(itemMode,track,1/120);
  assert.equal(itemInput.manualNitroPressed,true,'item race uses distinct native nitro key');
  assert.equal(itemInput.nitroPressed,false,'must not fire item slot for nitro');
  const blocked={...before,impact:10,__V11_EXIT_BOOST_TTL__:1.35};
  assert.equal(v11AiInput(blocked,track,1/120).nitroPressed,false,'contact blocks boost');
  const expired={...before,__V11_EXIT_BOOST_TTL__:.001};
  assert.equal(v11AiInput(expired,track,1/120).nitroPressed,false,'old exit opportunity expires');
  assert.equal(expired.__V11_EXIT_BOOST_TTL__,0);
});

test('native rivals get a bounded physical cornering pressure uplift, never direct speed', () => {
  const old = skill => 25 + skill * 10;
  assert.equal(v11CornerGripBudget(.65), old(.65));
  assert.equal(v11CornerGripBudget(1.10), old(1.10));
  assert.ok(v11CornerGripBudget(1.6) > old(1.6));
  assert.ok(v11CornerGripBudget(1.6) < old(1.6) * 1.12);
  assert.ok(v11CornerGripBudget(2.18) > v11CornerGripBudget(1.6));
  assert.ok(v11CornerGripBudget(2.18) < old(2.18) * 1.22);
  assert.equal(v11CornerGripBudget(NaN), old(1));
});

const physical = car => Object.fromEntries(['x','y','z','h','m','s','d','lat','lapsDone','progress','nitroCount'].map(key => [key, car[key]]));

test('a committed shortcut survives recoverable contact after crossing its nominal start', () => {
  const track = trackFixture(), car = carFixture(track);
  v11AiInput(car, track, 1 / 120);
  assert.equal(car.__V11_AI_ROUTE__.wants, true);
  Object.assign(car, { d: 510, z: 510, x: -1, impact: 16, s: 9 });
  const before = physical(car);
  for (let i = 0; i < 180; i++) v11AiInput(car, track, 1 / 120);
  assert.equal(car.__V11_AI_ROUTE__.wants, true, 'crossing start or low speed cannot abandon a reachable entrance');
  assert.notEqual(car.__V11_AI_ROUTE__.phase, 'missed');
  assert.deepEqual(physical(car), before, 'route recovery must consist only of input decisions');
  assert.notEqual(car.proj.__RACE_SHORTCUT_ACTIVE, true, 'AI cannot force the road projection to claim entry');
  car.proj = { __RACE_SHORTCUT_ACTIVE: true, __RACE_SHORTCUT_ARC: 38 };
  v11AiInput(car, track, 1 / 120);
  assert.equal(car.__V11_AI_ROUTE__.phase, 'branch');
  assert.equal(car.__V11_AI_ROUTE__.entered, true);
});

test('route choice is stable per lap and fully missed entrances do not steer across a closed side wall', () => {
  const track = trackFixture(), car = carFixture(track);
  let draws = 0;
  car.rnd = () => { draws++; return 0; };
  for (let i = 0; i < 50; i++) v11AiInput(car, track, 1 / 120);
  assert.equal(draws, 1);
  Object.assign(car, { d: 680, z: 680 });
  v11AiInput(car, track, 1 / 120);
  assert.equal(car.__V11_AI_ROUTE__.phase, 'missed');
  Object.assign(car, { lapsDone: 1, d: 440, z: 440 });
  v11AiInput(car, track, 1 / 120);
  assert.equal(draws, 2, 'each real lap may make a fresh choice');
  assert.equal(car.__V11_AI_ROUTE__.phase, 'approach');
});

test('native physical entry is followed even when a collision put a cautious rival on the fork', () => {
  const track=trackFixture(),car=carFixture(track);
  car.rnd=()=>.999;
  v11AiInput(car,track,1/120);
  assert.equal(car.__V11_AI_ROUTE__.wants,false);
  car.proj={__RACE_SHORTCUT_ACTIVE:true,__RACE_SHORTCUT_ARC:35};
  car.d=544;car.z=535;car.x=15;
  const before=physical(car);
  v11AiInput(car,track,1/120);
  assert.equal(car.__V11_AI_ROUTE__.phase,'branch');
  assert.equal(car.__V11_AI_ROUTE__.entered,true);
  assert.deepEqual(physical(car),before);
});

test('controller never grants speed, nitro, position or race progress and only emits legal native controls', () => {
  const track = trackFixture(), car = carFixture(track);
  const before = physical(car);
  const input = v11AiInput(car, track, 1 / 120);
  assert.deepEqual(physical(car), before);
  assert.ok(Number.isFinite(input.steerAxis) && Math.abs(input.steerAxis) <= 1);
  assert.equal(input.nitroPressed, false, 'no native nitro stock means no use');
  assert.equal(input.manualNitroPressed, false);
  assert.equal(input.up && input.down, false);
  for (const key of ['up','down','left','right','shift','upPressed','wPressed','nitroPressed','manualNitroPressed']) {
    assert.equal(typeof input[key], 'boolean', key);
  }
});

test('physical AI delegates movement to PlayerCar and exposes measured projection for native lap accounting', () => {
  class NativeSpy {
    constructor(track, model, name) { this.track=track; this.model=model; this.name=name; this.proj={}; this.events=[]; this.reset(0,0); }
    reset(d, lat) { Object.assign(this, this.track.sample(d,{})); this.lat=lat; this.s=0; this.h=0; this.m=0; this.nitroCount=0; }
    update(dt, input, active, itemMode) { this.nativeStep={dt,input,active,itemMode}; }
  }
  const AI = createV11PhysicalAiClass(NativeSpy);
  const track = trackFixture(), car = new AI(track, null, 'Native probe', 1.7, () => 0);
  car.reset(-25, 3);
  assert.equal(car.isPlayer, false);
  assert.equal(car.__V11_PHYSICAL_AI__, true);
  assert.equal(car.dist, -25);
  const before = physical(car);
  car.__V11_ITEM_MODE__ = true;
  car.update(1/120, true, 1, 0.3);
  assert.deepEqual(physical(car), before, 'only the native movement integrator may move the car');
  assert.equal(car.nativeStep.itemMode, true);
  assert.equal(car.nativeStep.active, true);
  assert.equal(car.nativeStep.dt, 1/120);
  assert.throws(() => { car.dist += 20; }, TypeError, 'no spline/progress-writing compatibility path');
  car.d=40; car.lapsDone=1;
  assert.equal(car.dist, track.length + 40);
});

const nativeProject = process.env.RACE_NATIVE_PROJECT;
let native;
const nativeEvidence = { type:'native-physics-fixture',humanInput:false,rendered:false,
  project:nativeProject,buildHash:process.env.RACE_NATIVE_BUILD_HASH??null,cases:[] };
if (nativeProject) {
  const src = path.join(nativeProject, 'src');
  const load = name => import(pathToFileURL(path.join(src, name)).href);
  const [{Track},{PlayerCar},{AICar},{LAYOUTS},{installPhysicalShortcut}] = await Promise.all([
    load('track.js'),load('vehicle.js'),load('ai.js'),load('layouts.js'),load('race-shortcut-network.mjs'),
  ]);
  assert.ok(AICar.prototype instanceof PlayerCar, 'default generated AICar must inherit the native PlayerCar');
  assert.equal(await readFile(path.join(src,'race-v11-physical-ai.mjs'),'utf8'),
    await readFile(new URL('../racing/v11-physical-ai.mjs',import.meta.url),'utf8'),
    'final generated controller must match the reviewed source');
  const worldSource = await readFile(path.join(src,'main.js'),'utf8');
  const body = worldSource.split('  updateProgress(r, init = false) {')[1]?.split('\n  onLap(r) {')[0]?.trim().replace(/\}$/, '');
  const onLapBody = worldSource.split('  onLap(r) {')[1]?.split('\n  checkRaceEnd(dt) {')[0]?.trim().replace(/\}$/, '');
  assert.ok(body?.includes('__V11_PHYSICAL_AI__'), 'native World must give physical AI the real player checkpoint/lap branch');
  assert.ok(onLapBody?.includes('r.finished = true'), 'native World must own actual race completion');
  native = { Track, AI:AICar, LAYOUTS, installPhysicalShortcut,
    updateProgress:new Function('r','init',body), onLap:new Function('r',onLapBody) };
  nativeEvidence.sourceHashes=Object.fromEntries(await Promise.all([
    'ai.js','race-v11-physical-ai.mjs','vehicle.js','track.js','main.js','layouts.js','race-track-design.mjs','race-shortcut-network.mjs','v11-course-director.mjs',
  ].map(async name=>[name,createHash('sha256').update(await readFile(path.join(src,name))).digest('hex')])));
}

after(async()=>{
  if(nativeProject&&process.env.RACE_NATIVE_EVIDENCE) await writeFile(process.env.RACE_NATIVE_EVIDENCE,JSON.stringify(nativeEvidence,null,2)+'\n');
});

const driveNative = (track,fork,{laps=0,wall=false,startDelta=-8,circuitGeometry=false}={}) => {
  const car = new native.AI(track,null,'native-physical-regression',1.8,()=>0);
  const start = laps ? -25 : fork.start + startDelta;
  const side = -fork.entrySide;
  car.reset(start,wall ? side*((track.v9WidthAt?.(start)??track.halfW)-1.15) : 0);
  if(!laps)car.s=32; // Declared initial-speed fixture; subsequent movement is native only.
  if(wall){car.h-=side*.62;car.m=car.h;}
  Object.assign(car,{lapTimes:[],lapStart:0,finished:false,finishTime:0});
  // Stage 22 has a real .84L single-run finish. Its optional two-loop
  // geometry endurance fixture is explicitly separate from a career race.
  const world={track,state:'race',raceTime:0,firstFinish:-1,
    settings:{course:circuitGeometry?'diagnostic-circuit':fork.course,laps:laps||1},
    onLap(r){native.onLap.call(this,r);}};
  native.updateProgress.call(world,car,true);
  let seconds=0,entries=0,exits=0,crashes=0,was=false,maxStep=0,minCrashSpeed=Infinity;
  const maxFrames=(laps?500:25)*120;
  for(let frame=0;frame<maxFrames;frame++){
    const x=car.x,z=car.z;
    car.update(1/120,true,seconds,1);
    world.raceTime=seconds+1/120;
    native.updateProgress.call(world,car,false);
    const active=car.proj.__RACE_SHORTCUT_ACTIVE===true;
    if(active&&!was)entries++;
    if(!active&&was)exits++;
    was=active;
    for(const event of car.events)if(event.type==='crash'){crashes++;minCrashSpeed=Math.min(minCrashSpeed,car.s);}
    maxStep=Math.max(maxStep,Math.hypot(car.x-x,car.z-z));
    seconds+=1/120;
    if(laps?car.finished:car.__V11_AI_ROUTE__?.phase==='done')break;
  }
  const result={car,seconds,entries,exits,crashes,maxStep,minCrashSpeed};
  nativeEvidence.cases.push({course:fork.course,fixture:{laps,wall,startDelta,circuitGeometry},
    seconds,entries,exits,crashes,maxStep,minCrashSpeed:Number.isFinite(minCrashSpeed)?minCrashSpeed:null,
    final:{d:car.d,progress:car.progress,lapsDone:car.lapsDone,lapEvents:car.lapTimes.length,
      finished:car.finished,finishTime:car.finishTime,phase:car.__V11_AI_ROUTE__?.phase}});
  return result;
};

for (const id of ['05','10','12','13','16','18','22','25','27','30']) {
  test('native V11 '+id+(id==='22'?': actual single-run finish plus two diagnostic loop traversals':': two complete race laps physically enter and leave the actual fork'), {skip:!nativeProject}, () => {
    const track=new native.Track(native.LAYOUTS['race-'+id]);
    const fork=native.installPhysicalShortcut(track,'race-'+id,{v8:true,v9:true,v10:true});
    if(id==='22'){
      const stage=driveNative(track,fork,{laps:1});
      assert.equal(stage.car.finished,true,'actual career stage must finish at its own single-run terminal');
      assert.equal(stage.car.lapTimes.length,1);
      assert.ok(stage.car.progress>=track.length*.84&&stage.car.progress<track.length*.85);
      assert.equal(stage.entries,1);
      assert.equal(stage.exits,1);
    }
    const result=driveNative(track,fork,{laps:2,circuitGeometry:id==='22'});
    assert.equal(result.car.lapsDone,2);
    assert.equal(result.car.lapTimes.length,2,'both completed laps passed the native halfway/finish checks');
    assert.equal(result.car.finished,true);
    assert.equal(result.entries,2);
    assert.equal(result.exits,2);
    assert.ok(result.maxStep<1.2,'coordinates remain bounded by native movement; no fork or lap teleport');
    assert.ok(result.seconds>60 && result.seconds<300);
  });
  test('native V11 '+id+': real entrance-wall impact costs time and preserves a reachable fork commitment', {skip:!nativeProject}, () => {
    const track=new native.Track(native.LAYOUTS['race-'+id]);
    const fork=native.installPhysicalShortcut(track,'race-'+id,{v8:true,v9:true,v10:true});
    const clean=driveNative(track,fork);
    const hit=driveNative(track,fork,{wall:true});
    assert.ok(hit.crashes>=1,'the exact reported wall-collision branch must actually be exercised');
    assert.equal(hit.entries,1);
    assert.equal(hit.exits,1);
    assert.equal(hit.car.__V11_AI_ROUTE__.phase,'done');
    assert.ok(hit.minCrashSpeed<32,'the native crash removes speed, which the controller must earn back');
    assert.ok(hit.seconds>clean.seconds+.15,'wall collision retains a measurable time penalty');
    assert.ok(hit.maxStep<1.2,'recovery uses physical movement rather than repositioning');
  });
  test('native V11 '+id+': contact after crossing the entrance can still recover through the actual portal', {skip:!nativeProject}, () => {
    const track=new native.Track(native.LAYOUTS['race-'+id]);
    const fork=native.installPhysicalShortcut(track,'race-'+id,{v8:true,v9:true,v10:true});
    const hit=driveNative(track,fork,{wall:true,startDelta:8});
    assert.ok(hit.crashes>=1);
    assert.equal(hit.entries,1,'post-start contact must not abandon a still-reachable portal');
    assert.equal(hit.exits,1);
    assert.equal(hit.car.__V11_AI_ROUTE__.phase,'done');
    assert.ok(hit.maxStep<1.2);
  });
}

test('skilled rivals initiate and release a legal native Shift drift on a readable bend', () => {
  const R=70,track={
    length:1800,halfW:11,
    sample(d,out={}){
      const hd=d/R;
      return Object.assign(out,{
        x:R*(1-Math.cos(hd)),y:0,z:R*Math.sin(hd),hd,
        rx:-Math.cos(hd),rz:Math.sin(hd),bank:0
      });
    }
  };
  const at=track.sample(200,{});
  const car={
    track,x:at.x,y:0,z:at.z,h:at.hd,m:at.hd,d:200,s:32,
    skill:1.8,lat:0,personal:0,proj:{},lapsDone:0,
    drifting:false,airborne:false,impact:0,spin:0,
    nitroCount:0,smallWindow:0,driftTime:0,driftAngle:0
  };
  const before=physical(car);
  const entry=v11AiInput(car,track,1/120);
  assert.ok(entry.shift,'skilled rival must actively request one native drift');
  assert.ok(Math.abs(entry.steerAxis)>.29);
  assert.equal(entry.nitroPressed,false);
  assert.equal(entry.wPressed,false,'a drift request must not grant a free spray');
  assert.deepEqual(physical(car),before,'controller cannot change speed or position');
  car.drifting=true;
  car.driftDir=Math.sign(entry.steerAxis);
  car.driftTime=.35;
  car.driftAngle=.3;
  const release=v11AiInput(car,track,1/120);
  assert.equal(release.shift,false,'native drift is released with a real input edge');
  assert.ok(car.__V11_DRIFT_COOLDOWN__>=1.7);
  car.drifting=false;
  const immediate=v11AiInput(car,track,1/120);
  assert.equal(immediate.shift,false,'drift must not immediately restart on the same corner');
});
test('rival never drifts at a physical shortcut entrance or with impact',()=>{
  const track=trackFixture(),car=carFixture(track);
  const shortcut=v11AiInput(car,track,1/120);
  assert.equal(shortcut.shift,false);
  car.impact=10;car.drifting=true;car.driftDir=1;car.driftTime=.1;car.driftAngle=.3;
  const collision=v11AiInput(car,track,1/120);
  assert.equal(collision.shift,false,'no held Shift through contact');
  assert.ok(car.__V11_DRIFT_COOLDOWN__>1);
});

test('physical rivals do not brake away an earned boost on a clear straight', () => {
  const track=trackFixture();delete track.__RACE_SHORTCUT__;
  for(const vmaxNow of [67,76,86]) {
    const car={...carFixture(track),s:60,vmaxNow};
    const before=physical(car);
    const input=v11AiInput(car,track,1/120);
    assert.equal(input.down,false,'earned native speed allowance must not trigger normal-speed braking');
    assert.equal(input.up,true,'accelerate within the actual native boost allowance');
    assert.deepEqual(physical(car),before,'controller must not grant speed or boost resources');
  }
});

test('physical rivals still brake for a corner during an earned boost', () => {
  const track=trackFixture();delete track.__RACE_SHORTCUT__;
  const sample=track.sample.bind(track);
  track.sample=(d,out={})=>Object.assign(sample(d,out),{hd:(d-440)*.05});
  const car={...carFixture(track),s:70,vmaxNow:76};
  const input=v11AiInput(car,track,1/120);
  assert.equal(input.down,true);assert.equal(input.up,false);
});

const arcTrack = (radius, halfW) => ({
  length: 2 * Math.PI * radius, halfW,
  sample(d) {
    const hd = d / radius;
    return { x: radius * (1 - Math.cos(hd)), y: 0, z: radius * Math.sin(hd),
      hd, rx: -Math.cos(hd), rz: Math.sin(hd) };
  },
});
test('a wide legal bend is not driven as a zero-width centerline, while a narrow hairpin still requires braking', () => {
  const track = arcTrack(36, 10);
  const car = { ...carFixture(track), x: 0, z: 0, d: 0, s: 48 };
  const before = physical(car);
  assert.equal(v11AiInput(car, track, 1/120).up, true);
  assert.ok(car.__V11_AI_DECISION__.targetSpeed > 48);
  assert.deepEqual(physical(car), before);
  const narrow = arcTrack(18, 4);
  const tightCar = { ...car, track: narrow };
  assert.equal(v11AiInput(tightCar, narrow, 1/120).down, true);
});
test('a fast readable bend can earn a drift and its exit spray is not vetoed by a distant bend', () => {
  const track = arcTrack(80, 10);
  const car = { ...carFixture(track), x: 0, z: 0, d: 0, s: 50, m: .10, h: .10 };
  assert.equal(v11AiInput(car, track, 1/120).shift, true, 'legal Shift rather than a speed grant');
  const exit = { ...car, s: 40, smallWindow: .3, nitroCount: 0, __V11_DRIFT_COOLDOWN__: 1 };
  assert.equal(v11AiInput(exit, track, 1/120).wPressed, true, 'use only an already-earned native window');
  exit.smallWindow = 0;
  assert.equal(v11AiInput(exit, track, 1/120).wPressed, false);
});
test('skilled physical rivals finish a safe short drift before native spray qualification, never through hazards',()=>{
  const track=trackFixture();delete track.__RACE_SHORTCUT__;
  const fixture={...carFixture(track),skill:1.80,drifting:true,driftTime:.16,
    driftDir:1,driftAngle:.22,lat:0,s:38,impact:0,airborne:false,spin:0};
  const before=physical(fixture);
  const committed=v11AiInput(fixture,track,1/120);
  assert.equal(committed.shift,true,'a safe 0.16s drift may reach the native >0.22s reward threshold');
  assert.equal(committed.wPressed,false,'being in a drift never creates small boost');
  assert.deepEqual(physical(fixture),before,'drift commit only holds the real Shift input');
  for(const unsafe of [
    {driftTime:.36},{impact:5},{spin:.3},{airborne:true},
    {lat:track.halfW-1},{skill:1.20},
  ]){
    const c={...fixture,...unsafe,__V11_DRIFT_COOLDOWN__:0};
    assert.equal(v11AiInput(c,track,1/120).shift,false,
      'unsafe or exhausted drift has to release: '+JSON.stringify(unsafe));
  }
});
test('elite AI consumes only an earned physical exit window, with skill and edge risk bounded',()=>{
  const track=arcTrack(80,10);
  const car={...carFixture(track),track,x:0,z:0,d:0,m:-.09,h:-.09,
    s:40,lat:0,skill:1.80,smallWindow:.3,nitroCount:0,
    drifting:false,airborne:false,spin:0,impact:0};
  const before=physical(car);
  const input=v11AiInput(car,track,1/120);
  assert.equal(input.wPressed,true,'elite AI should not waste a legal corner exit at .29 rad heading error');
  assert.equal(input.nitroPressed,false,'no earned stock: no nitro');
  assert.deepEqual(physical(car),before,'input controller never grants speed or stock');
  const conservative={...car,skill:1.20};
  assert.equal(v11AiInput(conservative,track,1/120).wPressed,false,
    'weaker rivals retain conservative line discipline');
  for(const unsafe of [
    {smallWindow:0},{smallWindow:.5},{impact:4},{spin:.2},
    {airborne:true},{drifting:true},{lat:9},
  ]){
    const c={...car,...unsafe};
    assert.equal(v11AiInput(c,track,1/120).wPressed,false,
      'no fabricated, premature or hazardous exit boost: '+JSON.stringify(unsafe));
  }
});
test('near-bend sensing compares raw curvature consistently, independent of the wider-line speed budget', () => {
  const track = trackFixture();
  delete track.__RACE_SHORTCUT__;
  const sample = track.sample.bind(track);
  track.sample = (d, out = {}) => {
    const a = d - 440;
    return Object.assign(sample(d, out), { hd: a * .01 + a * a * .0004 });
  };
  const car = carFixture(track);
  v11AiInput(car, track, 1/120);
  assert.ok(Math.abs(car.__V11_AI_DECISION__.nearCurve - .026) < 1e-9);
});

test('a committed passing lane clears the native collision diameter without targeting the road edge', () => {
  const track=trackFixture();track.halfW=8;
  const car={...carFixture(track),z:100,d:100,personal:.84};
  const before=physical(car);
  v11AiInput(car,track,1/120);
  const look=7+car.s*.65;
  const requestedLateral=Math.abs(Math.tan(car.__V11_AI_DECISION__.headingError)*look);
  assert.ok(requestedLateral>3.1, 'the existing passing tactic must not be compressed into the blocker collision cylinder');
  assert.ok(requestedLateral<=track.halfW-3, 'passing keeps a three-metre native road-edge reserve');
  assert.deepEqual(physical(car),before,'passing changes only wheel intentions');
});
