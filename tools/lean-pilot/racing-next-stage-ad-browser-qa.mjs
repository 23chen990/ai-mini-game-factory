/* global process, console, window, document, localStorage, Event, URL */
/** Full built-H5 Chromium engineering checks for the next-stage ad wiring.
 * The SDK callbacks and unfinished-race settlement are TEST INJECTIONS.
 * No real advertisement, organic defeat, handset or natural-play claim.
 * Production source, buttons, earned medals and reward functions are untouched.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {chromium} from '@playwright/test';
import {buildHash} from './runner.mjs';
import {CAREER_KEY,newCareer} from '../../templates/web-lite/h5-source-mobile-v1/racing/career.mjs';
import {FUEL_KEY,newFuelState} from '../../templates/web-lite/h5-source-mobile-v1/fuel.mjs';
import {V11_COURSES} from '../../templates/web-lite/h5-source-mobile-v1/racing/v11-course-director.mjs';

const run=path.resolve('runs/h5-qq-mobile-20261013');
const gameRoot=path.resolve(process.argv[2]??path.join(run,'workspace/game'));
const evidence=path.resolve(process.argv[3]??path.join(run,'artifacts/next-stage-ad-browser'));
await mkdir(evidence,{recursive:true});
const build=JSON.parse(await readFile(path.join(run,'artifacts/build-racing.json'),'utf8'));
const initialHash=await buildHash(gameRoot);
assert.equal(initialHash,build.buildHash,'The served game must match its recorded build');
const htmlSha256=createHash('sha256').update(await readFile(path.join(gameRoot,'index.html'))).digest('hex');
const report={schemaVersion:1,buildHash:initialHash,htmlSha256,version:build.version,
  scope:'Full built H5 in real Chromium with simulated SDK and injected DNF settlement; engineering wiring only',
  liveAdSdk:'NOT_RUN',humanPhoneQA:'NOT_RUN',naturalRaceOutcome:'NOT_RUN',
  injections:['Seed a prior stage-01 medal/time and a full existing fuel ledger in isolated browser storage',
    'Call the native showResults() while the actual started player remains unfinished',
    'Install test-only __PLATFORM_META__ and window.tap callbacks, or omit the SDK',
    'Replay close callbacks and stale DOM events to check duplicate and cross-stage guards'],
  clock:'Unmodified; fuel must remain unchanged during each measured ad flow',
  cases:[],errors:[],passed:false};
const seededCareer={...newCareer(),stars:{'01':2},times:{'01':86.5},rounds:1};
const meta={status:1,source:'check_ads_status',appId:'engineering-fixture-only',
  spaceId:'engineering-fixture-only',screenOrientation:1};
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
  '.js':'text/javascript','.mjs':'text/javascript','.json':'application/json',
  '.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml',
  '.glb':'model/gltf-binary','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
    const file=path.resolve(gameRoot,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(gameRoot+path.sep)){res.writeHead(403);res.end();return;}
    const bytes=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream'});res.end(bytes);
  }catch{res.writeHead(404);res.end('missing');}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const baseUrl='http://127.0.0.1:'+server.address().port+'/';
let browser;

const snapshot=page=>page.evaluate(({careerKey,fuelKey})=>{
  const kit=document.querySelector('#race-kit'),game=window.game;
  const progress=JSON.parse(localStorage.getItem(careerKey)??'null');
  const fuel=JSON.parse(localStorage.getItem(fuelKey)??'null');
  const sdk=window.__NEXT_STAGE_AD_QA__;
  return {at:Date.now(),phase:kit?.dataset.phase,loaded:kit?.dataset.loaded,
    selected:document.querySelector('#race-stage')?.value,
    course:game?.track?.__RACE_COURSE_ID,identity:game?.track?.__V11_COURSE_IDENTITY__,
    nativeState:game?.state,playerFinished:game?.player?.finished,
    heading:document.querySelector('#race-heading')?.textContent,
    resultStars:document.querySelector('#race-result-stars')?.textContent,
    note:document.querySelector('#race-note')?.textContent,
    adHidden:document.querySelector('#race-next-ad')?.hidden,
    adDisabled:document.querySelector('#race-next-ad')?.disabled,
    startDisabled:document.querySelector('#race-start')?.disabled,
    stages:[...document.querySelectorAll('#race-stage option')].map(o=>({value:o.value,disabled:o.disabled})),
    progress,fuel,sdk:{created:sdk.created,loads:sdk.loads,shows:sdk.shows,active:sdk.active,
      events:sdk.events,closeListeners:sdk.closeListeners,errorListeners:sdk.errorListeners}};
},{careerKey:CAREER_KEY,fuelKey:FUEL_KEY});

async function ready(page,course){
  await page.waitForFunction(expected=>{
    const kit=document.querySelector('#race-kit');
    return kit?.dataset.loaded==='true'&&kit.dataset.phase==='ready'&&
      window.game?.track?.__RACE_COURSE_ID===expected&&
      document.querySelector('#race-start')?.disabled===false;
  },course,{timeout:45000});
  const state=await snapshot(page),id=course.slice(5);
  assert.equal(state.identity,V11_COURSES[id].identity,'Actual loaded native V11 course');
  assert.equal(state.nativeState,'menu','Unlocking returns to the lobby without automatically spending another entry');
}

function unchangedRewards(before,after){
  for(const key of ['stars','times','gatePasses','rounds'])
    assert.deepEqual(after.progress[key],before.progress[key],'Ad cannot change '+key);
  assert.equal(after.fuel.amount,before.fuel.amount,'A level-unlock video cannot add race fuel');
  assert.equal(after.fuel.lastAdAt,before.fuel.lastAdAt);
  assert.equal(after.fuel.lastAdId,before.fuel.lastAdId);
}

async function failStartedRace(page,row){
  await ready(page,'race-02');
  const before=await snapshot(page);
  assert.deepEqual(before.progress.stars,{'01':2});
  assert.deepEqual(before.progress.times,{'01':86.5});
  await page.locator('#race-start').tap();
  await page.waitForFunction(()=>window.game?.state==='countdown'&&!!window.game.player,null,{timeout:20000});
  const injection=await page.evaluate(()=>{
    const g=window.game,p=g.player;
    if(p.finished||g.resultShown)throw Error('The fixture must start from an actual unfinished race');
    const state={method:'native showResults() on an unfinished player',course:g.track.__RACE_COURSE_ID,
      finished:p.finished,progress:p.progress,raceTime:g.raceTime};
    g.showResults();
    return state;
  });
  row.dnfInjection=injection;
  await page.waitForFunction(()=>document.querySelector('#race-kit')?.dataset.phase==='finished',null,{timeout:20000});
  const failed=await snapshot(page);
  assert.equal(failed.playerFinished,false);
  assert.equal(failed.selected,'1');assert.equal(failed.course,'race-02');
  assert.match(failed.resultStars,/本场 0 星/);
  assert.equal(failed.progress.rounds,before.progress.rounds+1,'Use the real settlement once');
  assert.deepEqual(failed.progress.stars,before.progress.stars);
  assert.deepEqual(failed.progress.times,before.progress.times);
  assert.deepEqual(failed.progress.stagePasses,{});
  assert.equal(failed.fuel.amount,before.fuel.amount-5,'The real race start spends one entry');
  row.failed=failed;
  return failed;
}

async function openVideo(page,row){
  assert.equal(await page.locator('#race-next-ad').isVisible(),true);
  await page.locator('#race-next-ad').tap();
  await page.waitForFunction(()=>window.__NEXT_STAGE_AD_QA__.shows===1&&window.__NEXT_STAGE_AD_QA__.active);
  assert.equal(await page.locator('#race-next-ad').isDisabled(),true);
  assert.equal(await page.locator('#race-lobby').isDisabled(),true);
  // Replayed DOM events explicitly test the handler guard beneath disabled UI.
  await page.evaluate(()=>{
    const button=document.querySelector('#race-next-ad');
    for(let i=0;i<3;i++)button.dispatchEvent(new Event('click',{bubbles:true}));
  });
  const pending=await snapshot(page);
  assert.equal(pending.sdk.created,1,'A second tap cannot open another video');
  assert.equal(pending.sdk.shows,1);
  assert.equal(pending.selected,'1');
  row.pending=pending;
}

async function runCase(name,hasSdk,execute){
  const row={name,hasSdk,passed:false,errors:[]};report.cases.push(row);
  console.log('RACING_NEXT_AD_CASE_BEGIN='+name);
  const context=await browser.newContext({viewport:{width:844,height:390},
    deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const page=await context.newPage();page.setDefaultTimeout(20000);
  page.on('pageerror',error=>row.errors.push(error.message));
  try{
    await page.addInitScript(({careerKey,fuelKey,career,fuel,hasSdk,meta})=>{
      if(!localStorage.getItem('next-stage-ad-browser-qa:seeded')){
        localStorage.setItem(careerKey,JSON.stringify(career));
        localStorage.setItem(fuelKey,JSON.stringify({...fuel,updatedAt:Date.now()}));
        localStorage.setItem('h5-qq-mobile-20261013:graphics-quality:v1','low');
        localStorage.setItem('h5-qq-mobile-20261013:audio-enabled:v1','0');
        localStorage.setItem('next-stage-ad-browser-qa:seeded','true');
      }
      window.__PLATFORM_META__=meta;
      const ledger=window.__NEXT_STAGE_AD_QA__={created:0,loads:0,shows:0,active:false,
        events:[],closeListeners:0,errorListeners:0};
      const closes=new Set(),errors=new Set();let previousClose=null;
      ledger.close=isEnded=>{
        ledger.active=false;ledger.events.push({kind:'close',isEnded});
        for(const callback of [...closes])callback({isEnded});
      };
      ledger.replayClose=()=>{ledger.events.push({kind:'replayed-completed-close'});previousClose?.({isEnded:true});};
      if(!hasSdk){delete window.tap;return;}
      window.tap={createRewardedVideoAd(options){
        if(options?.adUnitId!==meta.spaceId)throw Error('Unexpected ad unit in engineering fixture');
        ledger.created++;ledger.events.push({kind:'create',adUnitId:options.adUnitId});
        return {
          onClose(callback){closes.add(callback);previousClose=callback;ledger.closeListeners=closes.size;},
          offClose(callback){closes.delete(callback);ledger.closeListeners=closes.size;},
          onError(callback){errors.add(callback);ledger.errorListeners=errors.size;},
          offError(callback){errors.delete(callback);ledger.errorListeners=errors.size;},
          load(){ledger.loads++;ledger.events.push({kind:'load'});return Promise.resolve();},
          show(){ledger.shows++;ledger.active=true;ledger.events.push({kind:'show'});return Promise.resolve();},
        };
      }};
    },{careerKey:CAREER_KEY,fuelKey:FUEL_KEY,career:seededCareer,fuel:newFuelState(),hasSdk,meta});
    await page.goto(baseUrl,{waitUntil:'domcontentloaded',timeout:45000});
    await execute(page,row);
    row.last=await snapshot(page);
    assert.deepEqual(row.errors,[],'No browser exceptions in the built game');
    await page.screenshot({path:path.join(evidence,name+'.png'),timeout:15000});
    row.passed=true;
  }catch(error){
    row.errors.push(String(error.stack??error));
    row.last=await snapshot(page).catch(failure=>({error:String(failure)}));
    await page.screenshot({path:path.join(evidence,name+'-failed.png'),timeout:10000}).catch(()=>{});
  }finally{
    await context.close();
    console.log('RACING_NEXT_AD_CASE_END='+JSON.stringify({name,passed:row.passed,errors:row.errors}));
  }
}

try{
  browser=await chromium.launch({channel:'chromium',headless:true,
    args:['--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox']});
  report.browser=await browser.version();
  await runCase('cancel-stays-on-failed-stage',true,async(page,row)=>{
    const failed=await failStartedRace(page,row);await openVideo(page,row);
    await page.evaluate(()=>window.__NEXT_STAGE_AD_QA__.close(false));
    await page.waitForFunction(()=>document.querySelector('#race-note')?.textContent.includes('广告已取消'));
    const cancelled=await snapshot(page);row.cancelled=cancelled;
    assert.equal(cancelled.phase,'finished');assert.equal(cancelled.selected,'1');
    assert.equal(cancelled.course,'race-02');assert.deepEqual(cancelled.progress.stagePasses,{});
    unchangedRewards(failed,cancelled);
    assert.equal(cancelled.stages.find(stage=>stage.value==='2').disabled,true);
    assert.equal(cancelled.sdk.closeListeners,0);assert.equal(cancelled.sdk.errorListeners,0);
    await page.locator('#race-lobby').tap();await ready(page,'race-02');
    const home=await snapshot(page);unchangedRewards(failed,home);
    assert.equal(home.selected,'1');assert.deepEqual(home.progress.stagePasses,{});
  });
  await runCase('complete-adjacent-and-reload',true,async(page,row)=>{
    const failed=await failStartedRace(page,row);await openVideo(page,row);
    await page.evaluate(()=>window.__NEXT_STAGE_AD_QA__.close(true));
    await ready(page,'race-03');
    const completed=await snapshot(page);row.completed=completed;
    unchangedRewards(failed,completed);
    assert.deepEqual(completed.progress.stagePasses,{'03':'ad'});
    assert.equal(completed.selected,'2');assert.equal(completed.adHidden,true);
    assert.equal(completed.stages.find(stage=>stage.value==='3').disabled,true);
    assert.equal(completed.sdk.closeListeners,0);assert.equal(completed.sdk.errorListeners,0);
    await page.evaluate(()=>{
      window.__NEXT_STAGE_AD_QA__.replayClose();
      document.querySelector('#race-next-ad').dispatchEvent(new Event('click',{bubbles:true}));
      const stage=document.querySelector('#race-stage');stage.value='4';
      stage.dispatchEvent(new Event('change',{bubbles:true}));
    });
    const guarded=await snapshot(page);row.afterReplayedEvents=guarded;
    assert.equal(guarded.sdk.created,1);assert.equal(guarded.sdk.shows,1);
    assert.equal(guarded.selected,'2');assert.equal(guarded.course,'race-03');
    assert.deepEqual(guarded.progress.stagePasses,{'03':'ad'});unchangedRewards(failed,guarded);
    await page.reload({waitUntil:'domcontentloaded',timeout:45000});await ready(page,'race-03');
    const reloaded=await snapshot(page);row.reloaded=reloaded;
    assert.equal(reloaded.selected,'2');assert.deepEqual(reloaded.progress.stagePasses,{'03':'ad'});
    assert.equal(reloaded.stages.find(stage=>stage.value==='3').disabled,true);
    assert.equal(reloaded.sdk.created,0,'Reload cannot request a video automatically');
    unchangedRewards(failed,reloaded);
  });
  await runCase('no-sdk-hides-next-stage-ad',false,async(page,row)=>{
    const failed=await failStartedRace(page,row);
    assert.equal(await page.locator('#race-next-ad').isVisible(),false);
    assert.equal(failed.adHidden,true);assert.equal(failed.sdk.created,0);
    await page.evaluate(()=>document.querySelector('#race-next-ad').dispatchEvent(new Event('click',{bubbles:true})));
    const after=await snapshot(page);unchangedRewards(failed,after);
    assert.equal(after.selected,'1');assert.equal(after.course,'race-02');
    assert.deepEqual(after.progress.stagePasses,{});assert.equal(after.sdk.created,0);
    assert.equal(after.stages.find(stage=>stage.value==='2').disabled,true);
  });
  assert.equal(await buildHash(gameRoot),initialHash,'The served build changed during browser QA');
  report.passed=report.cases.length===3&&report.cases.every(row=>row.passed);
}catch(error){report.errors.push(String(error.stack??error));}
finally{
  await browser?.close();await new Promise(resolve=>server.close(resolve));
  if(!report.passed)process.exitCode=1;
  await writeFile(path.join(evidence,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log('RACING_NEXT_STAGE_AD_RESULT='+JSON.stringify({buildHash:report.buildHash,
    passed:report.passed,cases:report.cases.map(({name,passed})=>({name,passed})),
    liveAdSdk:report.liveAdSdk,humanPhoneQA:report.humanPhoneQA,errors:report.errors}));
}
