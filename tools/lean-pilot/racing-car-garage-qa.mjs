/* global window, document, localStorage, Event, Storage, innerWidth, innerHeight, console, process, URL */
/** Actual built H5 / standalone car garage QA. Ad callbacks and early DNF are
 * explicitly simulated engineering branches, never live advertising or a
 * naturally completed race. Fresh home/preview interactions use visible input. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from '@playwright/test';
import {z} from 'zod';
import {buildHash} from './runner.mjs';
import {CAREER_KEY,newCareer} from '../../templates/web-lite/h5-source-mobile-v1/racing/career.mjs';
import {FUEL_KEY} from '../../templates/web-lite/h5-source-mobile-v1/fuel.mjs';
import {CAR_MODELS} from '../../templates/web-lite/h5-source-mobile-v1/racing/cosmetics.mjs';
import {probeNativeCarPhysics} from './racing-car-physics-probe.mjs';

const run=path.resolve('runs/h5-qq-mobile-20261013');
const gameRoot=path.resolve(process.argv[2]??path.join(run,'workspace/game'));
const build=JSON.parse(await readFile(path.join(run,'artifacts/build-racing.json'),'utf8'));
const output=path.resolve(process.argv[3]??path.join(run,'artifacts/car-garage-'+build.buildHash.slice(0,12)));
await mkdir(output,{recursive:true});
assert.equal(await buildHash(gameRoot),build.buildHash);
const manifest=JSON.parse(await readFile('templates/web-lite/h5-source-mobile-v1/racing/assets/user-cars-manifest.json','utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={schemaVersion:1,gameId:'qq-speed',version:build.version,buildHash:build.buildHash,
  inputHash:build.inputHash,trialSha256:build.trialSha256,
  htmlSha256:hash(await readFile(path.join(gameRoot,'index.html'))),
  scope:'Actual six-model default home and native start/result/replay identity, with named simulated SDK and early-DNF branches',
  liveAdSdk:'NOT_RUN',physicalPhones:'NOT_RUN',naturalTerminalReplay:'BLOCKED',
  cases:[],errors:[],passed:false};
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json',
  '.js':'text/javascript','.mjs':'text/javascript','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
    const file=path.resolve(gameRoot,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(gameRoot+path.sep)){res.writeHead(403);res.end();return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream'});
    res.end(await readFile(file));
  }catch{res.writeHead(404);res.end('missing');}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const url='http://127.0.0.1:'+server.address().port+'/';
const meta={status:1,source:'check_ads_status',appId:'engineering-fixture-only',spaceId:'engineering-fixture-only',screenOrientation:1};
let browser,earnedSave;

async function ready(page){
  await page.waitForFunction(()=>document.querySelector('#race-kit')?.dataset.loaded==='true',null,{timeout:45000});
  await page.evaluate(()=>document.fonts.ready);
}
async function shown(page,id){
  await page.waitForFunction(id=>{
    const e=window.__RACE_EVIDENCE__;
    return e?.phase==='ready'&&!e.garage.busy&&!e.garage.error&&e.garage.id===id&&e.displayedCar===id;
  },id,{timeout:30000});
}
async function snapshot(page){
  return page.evaluate(({careerKey,fuelKey})=>{
    const e=window.__RACE_EVIDENCE__,g=window.game;
    return {phase:e.phase,garage:e.garage,equipped:e.equippedCar,owned:e.ownedCars,
      actual:e.displayedCar,identity:e.displayedCarAsset,nativeState:g.state,
      settings:{car:g.settings.car,skin:g.settings.skin,course:g.settings.course,mode:g.settings.mode,laps:g.settings.laps,diff:g.settings.diff},
      progress:JSON.parse(localStorage.getItem(careerKey)??'null'),fuel:JSON.parse(localStorage.getItem(fuelKey)??'null'),
      fuelAmount:Number(document.querySelector('#race-fuel-gauge').getAttribute('aria-valuenow')),
      adHidden:document.querySelector('#race-car-ad').hidden,adDisabled:document.querySelector('#race-car-ad').disabled,
      startDisabled:document.querySelector('#race-start').disabled,
      note:document.querySelector('#race-car-note').textContent,
      cards:[...document.querySelectorAll('#race-car-choices button')].map(b=>({id:b.dataset.carId,owned:b.dataset.owned,pressed:b.getAttribute('aria-pressed')})),
      models:g.racers.map(r=>({player:r.isPlayer,id:r.model.userData.carId,
        identity:r.model.userData.assetIdentity,wheels:r.model.userData.wheels.length})),
      sdk:window.__CAR_AD_QA__?{created:window.__CAR_AD_QA__.created,shows:window.__CAR_AD_QA__.shows,
        active:window.__CAR_AD_QA__.active,listeners:window.__CAR_AD_QA__.listeners}:null};
  },{careerKey:CAREER_KEY,fuelKey:FUEL_KEY});
}
async function select(page,id){
  await page.locator('#race-car-choices button[data-car-id="'+id+'"]').tap();
  await shown(page,id);
}
async function screenshot(page,name){await page.screenshot({path:path.join(output,name+'.png'),timeout:15000});}
function modelIdentity(state,id){
  assert.equal(state.actual,id);assert.equal(state.identity.carId,id);
  if(id!=='starter')assert.equal(state.identity.sha256,manifest.cars.find(c=>c.id===id).sha256);
}
async function installFixture(page,restore){
  await page.addInitScript(({meta,careerKey,restore})=>{
    if(restore&&!localStorage.getItem('car-qa-restored')){
      localStorage.setItem(careerKey,JSON.stringify(restore));localStorage.setItem('car-qa-restored','1');
    }
    window.__PLATFORM_META__=meta;
    const ledger=window.__CAR_AD_QA__={created:0,shows:0,active:false,listeners:0};
    const closes=new Set(),errors=new Set();let previous;
    ledger.close=isEnded=>{ledger.active=false;for(const cb of [...closes])cb({isEnded});};
    ledger.fail=()=>{ledger.active=false;for(const cb of [...errors])cb({errMsg:'engineering-error'});};
    ledger.repeat=()=>previous?.({isEnded:true});
    window.tap={createRewardedVideoAd(options){
      if(options?.adUnitId!==meta.spaceId)throw Error('Unexpected ad unit');
      ledger.created++;
      return {onClose(cb){closes.add(cb);previous=cb;ledger.listeners=closes.size;},
        offClose(cb){closes.delete(cb);ledger.listeners=closes.size;},onError(cb){errors.add(cb);},offError(cb){errors.delete(cb);},
        load(){return Promise.resolve();},show(){ledger.shows++;ledger.active=true;return Promise.resolve();}};
    }};
  },{meta,careerKey:CAREER_KEY,restore});
}
async function openAd(page){
  const previous=await page.evaluate(()=>window.__CAR_AD_QA__.shows);
  await page.locator('#race-car-ad').tap();
  await page.waitForFunction(n=>window.__CAR_AD_QA__.active&&window.__CAR_AD_QA__.shows===n+1,previous);
}
async function complete(page,id){
  await openAd(page);await page.evaluate(()=>window.__CAR_AD_QA__.close(true));
  await page.waitForFunction(id=>window.__RACE_EVIDENCE__.equippedCar===id&&!window.__RACE_EVIDENCE__.garage.busy,id);
  await shown(page,id);
  const state=await snapshot(page);modelIdentity(state,id);
  assert.equal(state.adHidden,true);assert.equal(state.startDisabled,false);
  assert.equal(state.progress.car,id);assert.ok(state.progress.ownedCars.includes(id));
  assert.equal(state.sdk.listeners,0);return state;
}
async function layout(page,row,label){
  const box=await page.evaluate(()=>{
    const rect=id=>document.querySelector(id).getBoundingClientRect().toJSON();
    const panel=document.querySelector('#race-panel');
    return {viewport:{width:innerWidth,height:innerHeight},panel:rect('#race-panel'),garage:rect('#race-garage'),rail:rect('#race-stage-rail'),
      start:rect('#race-start'),ad:rect('#race-car-ad'),adVisible:!document.querySelector('#race-car-ad').hidden,
      clientHeight:panel.clientHeight,scrollHeight:panel.scrollHeight,
      cards:[...document.querySelectorAll('#race-car-choices button')].map(b=>b.getBoundingClientRect().toJSON()),
      stages:document.querySelectorAll('.race-stage-choice').length,daily:document.querySelectorAll('.race-daily-choice').length};
  });
  row.layouts??=[];row.layouts.push({...box,label});
  const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  assert.equal(box.stages,30);assert.equal(box.daily,1);
  assert.equal(overlap(box.panel,box.garage),false,'Garage cannot cover the main menu');
  assert.equal(overlap(box.garage,box.rail),false,'Garage cannot cover stages');
  assert.ok(box.scrollHeight<=box.clientHeight+12,'Existing 12px panel overflow limit');
  assert.ok(box.start.height>=44&&box.start.bottom<=box.panel.bottom,'Start remains fully reachable');
  for(const card of box.cards)assert.ok(card.width>=44&&card.height>=44&&card.right<=box.viewport.width&&card.left>=0,'Six car touch targets fit');
  if(box.adVisible)assert.ok(box.ad.height>=44&&box.ad.bottom<=box.rail.top,'Ad target fits');
  await screenshot(page,label);
}
async function injectedResult(page,row,id){
  const before=await page.evaluate(()=>({finished:window.game.player.finished,state:window.game.state}));
  assert.equal(before.finished,false);
  row.injections??=[];row.injections.push({kind:'native showResults() before natural finish',carId:id,before});
  await page.evaluate(()=>window.game.showResults());
  await page.waitForFunction(()=>window.__RACE_EVIDENCE__.phase==='finished',null,{timeout:20000});
  modelIdentity(await snapshot(page),id);
}
async function runCase(name,options,execute){
  if(process.env.RACE_CAR_QA_CASE&&process.env.RACE_CAR_QA_CASE!==name)return;
  const row={name,passed:false,errors:[]};report.cases.push(row);
  console.log('RACING_CAR_CASE_BEGIN='+name);
  const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1,...options});
  const page=await context.newPage();page.setDefaultTimeout(20000);
  page.on('pageerror',error=>row.errors.push(error.message));
  try{await execute(page,row);assert.deepEqual(row.errors,[]);row.passed=true;}
  catch(error){row.errors.push(String(error.stack??error));row.last=await snapshot(page).catch(()=>null);await screenshot(page,name+'-failed').catch(()=>{});}
  finally{await context.close();console.log('RACING_CAR_CASE_END='+JSON.stringify({name,passed:row.passed,errors:row.errors}));}
}
try{
  browser=await chromium.launch({channel:'chromium',headless:true,args:['--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox']});
  report.browser=browser.version();
  await runCase('five-cars-and-permanent-rewards',{},async(page,row)=>{
    row.simulatedSdk=true;await installFixture(page);await page.goto(url,{waitUntil:'domcontentloaded'});await ready(page);await shown(page,'starter');
    const baseline=await snapshot(page);assert.deepEqual(baseline.owned,['starter']);modelIdentity(baseline,'starter');
    row.before=baseline;row.cars=[];
    await screenshot(page,'garage-home-starter');
    await select(page,'custom-01');assert.equal((await snapshot(page)).startDisabled,true);
    for(const [width,height]of [[740,360],[667,375],[650,360],[844,390]]){
      await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready);
      await layout(page,row,'locked-home-'+width+'x'+height);
    }
    await openAd(page);
    await page.evaluate(()=>{for(let i=0;i<3;i++)document.querySelector('#race-car-ad').dispatchEvent(new Event('click',{bubbles:true}));});
    assert.equal((await snapshot(page)).sdk.shows,1);await page.evaluate(()=>window.__CAR_AD_QA__.close(false));
    await page.waitForFunction(()=>!document.querySelector('#race-car-ad').disabled);
    assert.deepEqual((await snapshot(page)).owned,['starter']);
    await openAd(page);await page.evaluate(()=>window.__CAR_AD_QA__.fail());
    await page.waitForFunction(()=>!document.querySelector('#race-car-ad').disabled);
    assert.deepEqual((await snapshot(page)).owned,['starter']);
    for(const model of CAR_MODELS.slice(1)){
      await select(page,model.id);const preview=await snapshot(page);modelIdentity(preview,model.id);
      assert.equal(preview.garage.owned,false);assert.equal(preview.startDisabled,true);
      await screenshot(page,model.id+'-locked');
      const equipped=await complete(page,model.id);row.cars.push({id:model.id,preview,equipped});
      await screenshot(page,model.id+'-owned');
      assert.deepEqual(equipped.fuel,baseline.fuel,'Car reward never writes the fuel ledger');
      assert.equal(equipped.fuelAmount,baseline.fuelAmount,'Car reward never changes fuel');
      assert.deepEqual(equipped.progress.stars,baseline.progress?.stars??{});
      assert.deepEqual(equipped.progress.ownedSkins,baseline.progress?.ownedSkins??[0]);
      await page.evaluate(()=>window.__CAR_AD_QA__.repeat());
    }
    earnedSave=(await snapshot(page)).progress;
    await page.reload({waitUntil:'domcontentloaded'});await ready(page);await shown(page,'custom-05');
    row.reloaded=await snapshot(page);assert.deepEqual(row.reloaded.owned,CAR_MODELS.map(c=>c.id));
    assert.equal(row.reloaded.sdk.created,0);assert.equal(row.reloaded.equipped,'custom-05');
    await screenshot(page,'garage-all-owned-after-reload');
    row.native=[];
    let referencePhysics;
    for(const model of CAR_MODELS){
      await select(page,model.id);await page.locator('#race-start').tap();
      await page.waitForFunction(()=>window.game.state==='countdown'&&window.__RACE_EVIDENCE__.phase==='countdown',null,{timeout:20000});
      const race=await snapshot(page);modelIdentity(race,model.id);
      assert.equal(race.models.filter(m=>m.player).length,1);
      assert.equal(race.models.find(m=>m.player).wheels,model.id==='starter'?4:0,'Imported monolithic wheels remain honestly static');
      assert.ok(race.models.filter(m=>!m.player).every(m=>m.id==='starter'&&m.wheels===4));
      const physics=await page.evaluate(probeNativeCarPhysics,{expectedCarId:model.id});
      const comparable={protocol:physics.protocol,track:physics.track,columns:physics.columns,trace:physics.trace,events:physics.events};
      // Preserve both sides and the native snapshot even if exact equality fails.
      await writeFile(path.join(output,model.id+'-isolated-physics.json'),JSON.stringify(physics)+'\n');
      row.native.push({id:model.id,countdown:race,physics:{synthetic:true,readOnlyVerified:physics.readOnlyVerified,
        protocol:physics.protocol,traceSha256:hash(JSON.stringify(comparable)),summary:physics.summary}});
      if(referencePhysics)assert.deepEqual(comparable,referencePhysics,'Same actual native PlayerCar response for every appearance');
      else referencePhysics=comparable;
      await screenshot(page,model.id+'-native-start');
      await injectedResult(page,row,model.id);await screenshot(page,model.id+'-native-result');
      if(model.id==='custom-03'){
        await page.locator('#race-replay').tap();await page.waitForFunction(()=>window.__RACE_EVIDENCE__.phase==='countdown');
        modelIdentity(await snapshot(page),model.id);await injectedResult(page,row,model.id);
      }
      await page.locator('#race-lobby').tap();await shown(page,model.id);modelIdentity(await snapshot(page),model.id);
    }
  });
  await runCase('fresh-home-without-sdk',{},async(page,row)=>{
    row.simulatedSdk=false;row.seededCareer=false;
    await page.goto(url,{waitUntil:'domcontentloaded'});await ready(page);await shown(page,'starter');
    await select(page,'custom-04');const locked=await snapshot(page);modelIdentity(locked,'custom-04');
    assert.equal(locked.adHidden,true);assert.equal(locked.startDisabled,true);assert.deepEqual(locked.owned,['starter']);
    await screenshot(page,'no-sdk-custom-preview');await page.locator('#race-car-owned').tap();await shown(page,'starter');
    assert.equal((await snapshot(page)).startDisabled,false);row.last=await snapshot(page);
    await page.setViewportSize({width:390,height:844});
    await page.locator('#race-rotate').waitFor({state:'visible'});
    assert.equal(await page.locator('#race-rotate').isVisible(),true);
    await screenshot(page,'portrait-rotation');
  });
  await runCase('save-failure-never-awards',{},async(page,row)=>{
    row.simulatedSdk=true;row.injectedStorageFailure=true;
    await installFixture(page);await page.goto(url,{waitUntil:'domcontentloaded'});await ready(page);await select(page,'custom-02');
    await openAd(page);
    await page.evaluate(careerKey=>{
      const original=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){if(key===careerKey)throw Error('engineering quota failure');return original.call(this,key,value);};
      window.__CAR_AD_QA__.close(true);
    },CAREER_KEY);
    await page.waitForFunction(()=>document.querySelector('#race-car-note').textContent.includes('未能保存'));
    row.last=await snapshot(page);assert.deepEqual(row.last.owned,['starter']);assert.equal(row.last.equipped,'starter');
    assert.equal(row.last.adHidden,true);await screenshot(page,'car-save-failure');
    await page.locator('#race-car-owned').tap();await shown(page,'starter');assert.equal((await snapshot(page)).startDisabled,false);
  });
  await runCase('desktop-car-preview',{viewport:{width:1440,height:900},isMobile:false,hasTouch:false},async(page,row)=>{
    row.simulatedSdk=false;row.seededCareer=false;
    await page.goto(url,{waitUntil:'domcontentloaded'});await ready(page);await shown(page,'starter');
    await layout(page,row,'desktop-starter-home');
    await page.locator('#race-car-choices button[data-car-id="custom-05"]').click();await shown(page,'custom-05');
    modelIdentity(await snapshot(page),'custom-05');await layout(page,row,'desktop-blue-rally-preview');
  });
  await runCase('stale-native-selection-and-old-paint',{},async(page,row)=>{
    row.simulatedSdk=false;row.storageFixture='Unknown native setting and unowned canonical selection; legitimate previously owned gold paint';
    await page.addInitScript(({careerKey,progress})=>{
      localStorage.setItem('feiche3d.v1',JSON.stringify({map:'city',car:'removed-unknown-car',skin:7,laps:2}));
      localStorage.setItem(careerKey,JSON.stringify(progress));
    },{careerKey:CAREER_KEY,progress:{...newCareer(),car:'custom-02',ownedCars:['starter','removed-unknown-car'],ownedSkins:[0,3],skin:3}});
    await page.goto(url,{waitUntil:'domcontentloaded'});await ready(page);await shown(page,'starter');
    row.last=await snapshot(page);modelIdentity(row.last,'starter');
    assert.deepEqual(row.last.owned,['starter']);assert.equal(row.last.equipped,'starter');assert.equal(row.last.settings.car,'starter');
    assert.equal(row.last.settings.skin,3);assert.equal(row.last.startDisabled,false);
    assert.equal(await page.locator('#race-skin').isVisible(),true);await screenshot(page,'old-paint-safe-starter');
  });
  await runCase('standalone-restores-earned-model',{},async(page,row)=>{
    assert.ok(earnedSave,'Run the earning flow first; never invent this earned-save fixture');
    row.simulatedSdk=true;row.storageFixture='Copy exact save earned by completed simulated SDK in the HTTP case to separate file origin';
    await installFixture(page,earnedSave);
    const file=path.join(run,build.trialName);assert.equal(hash(await readFile(file)),build.trialSha256);
    await page.goto(pathToFileURL(file).href,{waitUntil:'domcontentloaded'});await ready(page);await shown(page,'custom-05');
    row.restored=await snapshot(page);modelIdentity(row.restored,'custom-05');assert.equal(row.restored.sdk.created,0);
    await select(page,'custom-03');await screenshot(page,'standalone-golden-formula');
    await page.locator('#race-start').tap();await page.waitForFunction(()=>window.__RACE_EVIDENCE__.phase==='countdown');
    modelIdentity(await snapshot(page),'custom-03');await screenshot(page,'standalone-native-start');
  });
  report.passed=report.cases.length>0&&report.cases.every(row=>row.passed)&&report.errors.length===0;
}catch(error){report.errors.push(String(error.stack??error));}
finally{
  await browser?.close();server.close();
  z.object({schemaVersion:z.literal(1),gameId:z.literal('qq-speed'),buildHash:z.string().regex(/^[a-f0-9]{64}$/u),
    liveAdSdk:z.literal('NOT_RUN'),physicalPhones:z.literal('NOT_RUN'),naturalTerminalReplay:z.literal('BLOCKED'),
    cases:z.array(z.object({name:z.string(),passed:z.boolean(),errors:z.array(z.string())}).passthrough()),
    passed:z.boolean(),errors:z.array(z.string())}).passthrough().parse(report);
  await writeFile(path.join(output,'car-garage-qa.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,output,cases:report.cases.map(c=>({name:c.name,passed:c.passed})),errors:report.errors}));
  if(!report.passed)process.exitCode=1;
}
