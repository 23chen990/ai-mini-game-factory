/* global URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import path from 'node:path';
import {probeNativeCarPhysics} from '../racing-car-physics-probe.mjs';

// This fixture tests the QA instrument's observation/serialization boundary.
// It does not establish native handling, model identity or browser playability.
const fields=['x','y','z','h','m','s','d','lat','steer','vy','airTime',
  'driftTime','driftAngle','gauge','nitroCount','nitroTime','smallBoost',
  'smallBoostPower','smallWindow','padTime','startBoost','spin','shield',
  'slowTime','magnet','impact','wrongWay','throttle','vmaxNow','driftDir','hint'];
class InstrumentFixtureCar {
  constructor(track,model){
    this.track=track;this.model=model;this.isPlayer=true;this.events=[];this.proj={};
    this.reset(0,0);
  }
  reset(d,lat){
    for(const key of fields)this[key]=0;
    this.d=d;this.lat=lat;this.airborne=false;this.drifting=false;
  }
  update(dt,input){
    this.s+=input.up?dt:input.down?-dt:0;
    this.x+=this.s*dt;this.steer=input.steerAxis;
  }
}
const basePad={d:240,lat:-1,len:24,halfW:2.5};
function probe({materialVersion=1,offset=.1,pad={}}={}){
  const track={__RACE_COURSE_ID:'01',length:1000,N:4,ds:250,halfW:6,
    slope:[0],hd:[0],vcurv:[0],sslope:[0],sample(){},project(){},
    boostPads:[{...basePad,...pad,mat:{uuid:'render-material-'+materialVersion,
      version:materialVersion,map:{offset:{x:offset,y:0}}}}]};
  const model={userData:{carId:'starter',assetIdentity:{carId:'starter'}},children:[]};
  const player=new InstrumentFixtureCar(track,model);
  const game={player,track,racers:[player],settings:{car:'starter',course:'01'},state:'countdown'};
  // A separate realm verifies that page.evaluate needs no unprovided closure.
  // JSON matches the persisted/browser-to-runner evidence boundary.
  return JSON.parse(JSON.stringify(runInNewContext(
    '('+probeNativeCarPhysics.toString()+')({expectedCarId:"starter"})',{window:{game}})));
}
const comparable=physics=>({protocol:physics.protocol,track:physics.track,
  columns:physics.columns,trace:physics.trace,events:physics.events});

test('render material animation does not change comparable probe physics',()=>{
  const first=probe(),animated=probe({materialVersion:13,offset:.92});
  assert.equal(first.trace.length,600,'All instrument frames remain in the evidence');
  assert.equal(first.readOnlyVerified,true);
  assert.deepEqual(comparable(animated),comparable(first));
  assert.deepEqual(first.track.boostPads,[basePad]);
});

test('every native boost-pad physics field still changes the comparison',()=>{
  const baseline=probe();
  for(const field of ['d','lat','len','halfW']){
    const changed=probe({pad:{[field]:basePad[field]+.125}});
    assert.deepEqual(changed.trace,baseline.trace,'Metadata is checked even when this trajectory misses the changed pad');
    assert.notDeepEqual(comparable(changed),comparable(baseline),field+' must remain compared exactly');
    assert.equal(changed.track.boostPads[0][field],basePad[field]+.125);
  }
});

const garageSource=await readFile(new URL('../racing-car-garage-qa.mjs',import.meta.url),'utf8');
function sourceBlock(start,end,source=garageSource){
  const begin=source.indexOf(start),finish=source.indexOf(end,begin);
  assert.ok(begin>=0&&finish>begin,'Expected QA operation remains present');
  return source.slice(begin,finish);
}
test('a failed exact comparison retains the full current trace and native evidence row',async()=>{
  const previous=probe(),current=probe({pad:{len:25}}),writes=[],row={native:[]};
  const block=sourceBlock('const physics=await page.evaluate(probeNativeCarPhysics',
    "await screenshot(page,model.id+'-native-start')");
  const execution=runInNewContext('(async()=>{'+block+'})()',{
    page:{evaluate:async()=>current},probeNativeCarPhysics,model:{id:'starter'},
    race:{actual:'starter'},referencePhysics:comparable(previous),row,assert,path,output:'/qa-output',
    hash:value=>createHash('sha256').update(value).digest('hex'),
    writeFile:async(file,bytes)=>writes.push({file,bytes}),
  });
  await assert.rejects(execution,/Same actual native PlayerCar response for every appearance/u);
  assert.equal(writes.length,1,'The mismatch cannot discard this model\'s probe');
  assert.equal(writes[0].file,'/qa-output/starter-isolated-physics.json');
  assert.deepEqual(JSON.parse(writes[0].bytes),current,'Persist protocol, every frame, events and read-only evidence');
  assert.equal(row.native.length,1,'The failure report retains the matching native snapshot');
  assert.equal(row.native[0].id,'starter');
  assert.equal(row.native[0].countdown.actual,'starter');
  assert.equal(row.native[0].physics.traceSha256,createHash('sha256').update(JSON.stringify(comparable(current))).digest('hex'));
});

test('portrait QA waits for real visibility after resize within the existing UI timeout',async()=>{
  const block=sourceBlock('await page.setViewportSize({width:390,height:844});',
    "\n  });\n  await runCase('save-failure-never-awards'");
  const calls=[];let visible=false;
  const locator={
    waitFor:async options=>{assert.equal(options.state,'visible');assert.ok(options.timeout===undefined||options.timeout<=20000);calls.push('wait-visible');visible=true;},
    isVisible:async()=>{calls.push('assert-visible');return visible;},
  };
  const page={
    setViewportSize:async size=>{assert.equal(size.width,390);assert.equal(size.height,844);calls.push('resize');},
    locator:selector=>{assert.equal(selector,'#race-rotate');return locator;},
  };
  assert.match(garageSource,/page\.setDefaultTimeout\(20000\)/u);
  await runInNewContext('(async()=>{'+block+'})()',{
    page,assert,screenshot:async(_page,name)=>{assert.equal(name,'portrait-rotation');calls.push('screenshot');},
  });
  assert.deepEqual(calls,['resize','wait-visible','assert-visible','screenshot']);
});

const smokeSource=await readFile(new URL('../racing-v3-smoke.mjs',import.meta.url),'utf8');
const currentWorld={course:'race-01',exists:true,arches:2,scenery:4,
  v10ArchClear:true,midArchColor:3163225,numberedMeshCount:15,
  actualCourse:'race-01',requestedCourse:'race-01',actualTrackLength:3182,
  revision:'V11.6',uiRevision:'racing-v116-garage'};
function checkSmokeWorld(overrides={}){
  // Execute only the actual observed-world assertion. Do not import/launch
  // the browser runner or turn this instrument fixture into browser evidence.
  const block=sourceBlock('if(!worldIdentity.exists','// V10 stage-05',smokeSource);
  return runInNewContext(block,{worldIdentity:{...currentWorld,...overrides},
    expectedCourse:'race-01',expectedGateMeshes:15,name:'instrument-fixture',
    fail:reason=>{throw Error(reason);}});
}
test('smoke accepts the actual V11.6 revision and garage UI pair with exact observed geometry',()=>{
  assert.doesNotThrow(()=>checkSmokeWorld());
});
test('smoke rejects old artifacts and mismatched runtime/UI revision pairs',()=>{
  for(const [revision,uiRevision] of [
    ['V11.5','racing-v115-unified'],['V11.6','racing-v115-unified'],
    ['V11.5','racing-v116-garage'],['V11.7','racing-v116-garage'],
    ['V11.6','unknown'],[undefined,'racing-v116-garage'],
  ])assert.throws(()=>checkSmokeWorld({revision,uiRevision}),/numbered features/u);
});
test('current smoke metadata cannot excuse wrong course geometry or track length',()=>{
  for(const override of [{exists:false},{course:'race-02'},{arches:1},{scenery:3},
    {numberedMeshCount:14},{actualCourse:'race-02'},{requestedCourse:'race-02'},
    {actualTrackLength:1200},{actualTrackLength:NaN}])
    assert.throws(()=>checkSmokeWorld(override),/numbered features/u);
});
test('native player QA reports the exact loaded build version and hash',async()=>{
  const source=await readFile(new URL('../racing-native-player-v11-qa.mjs',import.meta.url),'utf8');
  const block=sourceBlock('const report={schemaVersion:1','const check=',source);
  const build=Object.freeze({version:'V11.6',buildHash:'c'.repeat(64),sourceRevision:'d'.repeat(40)});
  const report=runInNewContext('(function(){'+block+'return report;})()',{
    build,artifact:'/fixture/native-player.json',sourceHashes:{},
  });
  assert.equal(report.version,build.version);
  assert.equal(report.buildHash,build.buildHash);
  assert.equal(report.naturalInputsOnly,false);
  assert.equal(report.rendered,false);
});
