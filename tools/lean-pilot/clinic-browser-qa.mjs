/* global process, console, window, document, Storage, setTimeout, clearTimeout */
import assert from 'node:assert/strict';
import {mkdir,writeFile,open,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {serveRun,loadRun,buildHash,verifyRunInputs} from './runner.mjs';
import {safeRead,sha256,evaluateBudget} from './policy.mjs';
import {candidateSpec} from './candidates.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const readJson=async(root,name)=>JSON.parse((await safeRead(root,name)).toString());
const writeJson=(root,name,v)=>writeFile(path.join(root,name),JSON.stringify(v,null,2)+'\n');
const snapshot=p=>p.evaluate(()=>window.__CLINIC_VIEW__());
async function tap(p,selector){const b=await p.locator(selector).boundingBox();assert.ok(b,selector);await p.touchscreen.tap(b.x+b.width*.55,b.y+b.height*.4);}
const number=t=>Number((t.match(/[\d.]+/)??['0'])[0]);
/** Selects actions from rendered information, not state, schedules or a hidden target oracle. */
export async function actFromVisible(p,lastSwitch){
 const intake=number(await p.locator('#intake-count').innerText()),care=number(await p.locator('#care-count').innerText());
 const time=await p.locator('#clock').innerText(),parts=time.split(':').map(Number),elapsed=180-parts[0]*60-parts[1];
 const cash=number(await p.locator('#cash').innerText()),served=number(await p.locator('#served').innerText());
 const selected=await p.locator('#assign-intake').getAttribute('aria-pressed')==='true'?'intake':await p.locator('#assign-care').getAttribute('aria-pressed')==='true'?'care':'idle';
 const second=await p.locator('#second-status').innerText(),hasDoctor=second.includes('\u5728\u5c97');
 const careText=await p.locator('#care-status').innerText(),intakeText=await p.locator('#intake-status').innerText();
 // The boolean below is learned from the visible purchase button, not the game object.
 const knownEquipped=await p.locator('#context-title').innerText();
 let changed=false;
 if(served>=3 && cash>=35 && !knownEquipped.includes('\u5df2\u5347\u7ea7')){
  // Once an equipment button is gone from its room, remember the result in the actor, not in the game.
  if(!lastSwitch.equipment){await tap(p,'#assign-care');if(await p.locator('#buy-equipment').isVisible()){await tap(p,'#buy-equipment');changed=true;}lastSwitch.equipment=true;lastSwitch.at=elapsed;}
 }
 if(!hasDoctor && cash>=135){
  await tap(p,'#open-expansion');
  if(await p.locator('#buy-room').isVisible()&&await p.locator('#buy-room').isEnabled())await tap(p,'#buy-room');
  if(await p.locator('#buy-doctor').isVisible()&&await p.locator('#buy-doctor').isEnabled())await tap(p,'#buy-doctor');
  changed=true;
 }
 const di=number(await p.locator('#intake-deadline').innerText())||99,dc=number(await p.locator('#care-deadline').innerText())||99;
 const li=intake*(number(intakeText)||7)*1000+(di<14?20000:0);
 const lc=care*(number(careText)||7)*1000/(hasDoctor?2:1)+(dc<14?20000:0);
 const target=li>lc?'intake':'care';
 if(target!==selected&&Math.abs(li-lc)>4000&&elapsed-lastSwitch.at>=5){await tap(p,'#assign-'+target);lastSwitch.at=elapsed;changed=true;}
 return {elapsed,changed,visible:{intake,care,cash,served,selected,di,dc}};
}
/** Full HTTP and default 1x time. Observation hook is for assertions only. */
export async function browserQa(runId,{base=path.join(ROOT,'runs')}={}){
 const {run,root,game}=await loadRun(base,runId);if(run.templateId!=='clinic-queue-v1')throw Error('Wrong candidate for clinic QA');
 await verifyRunInputs(root,run);const hash=await buildHash(game),lock=await open(path.join(root,'.check-lock'),'wx',0o600);
 const checks=[],errors=[],artifacts=[],trace=[];let browser,server,timer,reserved=false,timedOut=false;const started=Date.now(),ledger=await readJson(root,'ledger.json');
 const record=(name,kind='SCRIPTED_NORMAL_INPUT',extra={})=>checks.push({name,kind,passed:true,...extra});
 const shot=async(p,name)=>{const rel='screenshots/'+name+'.png';await p.screenshot({path:path.join(root,rel),fullPage:true});artifacts.push({path:rel,sha256:sha256(await safeRead(root,rel))});};
 try{
  const budget=evaluateBudget(run.budget,ledger,{buildHash:hash,cashCents:0,timeoutMs:run.budget.maxAttemptMs});if(!budget.passed)throw Error(budget.blockers.join(','));
  if(!ledger.buildHashes.includes(hash))ledger.buildHashes.push(hash);ledger.pending=true;await writeJson(root,'ledger.json',ledger);reserved=true;
  const moduleName=process.env.LEAN_PLAYWRIGHT_MODULE;if(moduleName&&!path.isAbsolute(moduleName))throw Error('Absolute tooling path required');
  const pw=await import(moduleName?pathToFileURL(moduleName).href:'@playwright/test');server=await serveRun(base,runId,0);const url='http://127.0.0.1:'+server.address().port;
  browser=await pw.chromium.launch({headless:true,...(process.env.LEAN_CHROMIUM_PATH?{executablePath:process.env.LEAN_CHROMIUM_PATH}:{})});
  timer=setTimeout(()=>{timedOut=true;void browser.close();},run.budget.maxAttemptMs);await mkdir(path.join(root,'screenshots'),{recursive:true});
  for(const [width,height] of [[844,390],[390,844],[320,568]]){
   const ctx=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,reducedMotion:'reduce'}),p=await ctx.newPage();p.setDefaultTimeout(7000);p.on('pageerror',e=>errors.push(e.message));
   try{
    await p.goto(url);await p.locator('#start').waitFor({state:'visible'});const wallStart=Date.now();await tap(p,'#start');
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
    for(const sel of ['#scene','#assign-intake','#assign-care','#open-expansion']){const b=await p.locator(sel).boundingBox();assert.ok(b&&b.width>=44&&b.height>=44&&b.x>=0&&b.y>=0&&b.x+b.width<=width+1&&b.y+b.height<=height+1,sel+' outside '+width+'x'+height);}
    await shot(p,'clinic-'+width+'x'+height);record('clinic-layout-'+width+'x'+height,'BROWSER_LAYOUT');
    if(width!==844)continue;
    await tap(p,'#assign-intake');await p.waitForTimeout(3300);assert.equal((await snapshot(p)).state.helper.station,'intake');assert.equal(await p.locator('#assign-intake').getAttribute('aria-pressed'),'true');record('clinic-dispatch-visible');
    await tap(p,'#pause');const frozen=(await snapshot(p)).state;await p.waitForTimeout(800);assert.deepEqual((await snapshot(p)).state,frozen);record('clinic-pause-freezes');
    await p.reload();await p.locator('#start').waitFor({state:'visible'});assert.deepEqual((await snapshot(p)).state,frozen);assert.equal((await snapshot(p)).runId,runId);record('clinic-save-resume');await tap(p,'#start');
    const actor={at:0,equipment:false};let lastCheckpoint=0,investmentRecorded=false,secondServiceObserved=false;
    while(!(await p.locator('#settlement').isVisible())){
     const publicRead=await actFromVisible(p,actor);
     if(await p.locator('#second-work').isVisible() && Number.parseFloat(await p.locator('#second-progress').evaluate(el=>el.style.width))>0)secondServiceObserved=true;
     if(!investmentRecorded&&actor.equipment){const s=(await snapshot(p)).state;assert.equal(s.equipment,true);assert.ok(s.spent>=3500);assert.equal(s.cash,8000+s.income-s.spent-s.wages);investmentRecorded=true;record('clinic-investment-cash');}
     if(publicRead.elapsed>=lastCheckpoint+15){lastCheckpoint=publicRead.elapsed;trace.push({scope:'READ_ONLY_AFTER_PUBLIC_ACTION',visible:publicRead.visible,checkpoint:publicRead.elapsed,snapshot:await snapshot(p)});if([30,60,90,120,150].some(t=>Math.abs(t-lastCheckpoint)<2))await shot(p,'clinic-stage-'+lastCheckpoint);}
     await p.waitForTimeout(500);
    }
    assert.ok(secondServiceObserved,'Second staffed room must show actual service progress, not a static open label');
    const end=await snapshot(p),elapsedWallMs=Date.now()-wallStart;assert.equal(end.state.timeMs,180000);assert.equal(end.speed,1);assert.ok(elapsedWallMs>=179000,'Default-speed run was shortened');assert.ok(end.outcome.passed,'Visible-policy journey did not meet the upfront quality goal');
    trace.push({checkpoint:'settlement',elapsedWallMs,snapshot:end});await shot(p,'clinic-settlement');await tap(p,'#start');const fresh=await snapshot(p);assert.equal(fresh.state.completed,0);assert.ok(fresh.state.timeMs<=1000);
    record('clinic-natural-settlement-replay','SCRIPTED_NORMAL_INPUT',{speed:1,simulatedSeconds:180,elapsedWallMs,completed:end.state.completed,lost:end.state.lost,goalPassed:end.outcome.passed,secondServiceObserved});
   }finally{await ctx.close();}
  }
  const denied=await browser.newContext({viewport:{width:390,height:844},hasTouch:true}),p=await denied.newPage();try{await p.addInitScript(()=>Object.defineProperty(Storage.prototype,'setItem',{value(){throw Error('Denied');}}));await p.goto(url);await p.locator('#start').waitFor({state:'visible'});await tap(p,'#start');await tap(p,'#assign-care');assert.ok(await p.locator('.save-state.warning').isVisible());assert.equal((await snapshot(p)).state.helper.target,'care');record('clinic-storage-denial','INJECTED_ENVIRONMENT_FIXTURE');}finally{await denied.close();}
  assert.deepEqual(errors,[]);assert.equal(await buildHash(game),hash);await verifyRunInputs(root,run);assert.deepEqual(checks.map(c=>c.name).sort(),candidateSpec(run.templateId).checks.sort());
 }catch(e){errors.push(e.message);}
 finally{clearTimeout(timer);if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));if(reserved){const elapsed=Date.now()-started;ledger.pending=false;ledger.elapsedMs+=elapsed;ledger.attempts.push({kind:'browser',buildHash:hash,passed:!errors.length&&!timedOut,elapsedMs:elapsed,at:new Date().toISOString()});await writeJson(root,'ledger.json',ledger);}await lock.close();await rm(path.join(root,'.check-lock'),{force:true});}
 await writeJson(root,'clinic-trace.json',trace);artifacts.push({path:'clinic-trace.json',sha256:sha256(await safeRead(root,'clinic-trace.json'))});
 const passed=!errors.length&&!timedOut,report={schemaVersion:1,runId,buildHash:hash,suiteHash:run.browserSuiteHash,scope:'HTTP_BROWSER',passed,checks,artifacts,errors,timedOut,defaultSpeed:1,rulesRevision:2,outcome:passed?'PASSED':errors.some(e=>e.includes('ERR_BLOCKED_BY_ADMINISTRATOR'))?'ENVIRONMENT_BLOCKED':'FAILED',humanPlaytest:'NOT_RUN',device:'CHROMIUM_EMULATION_NOT_IPHONE',note:'Full 180-second default-speed browser with scene taps and visible-state action selection; observations for assertions only. Not a human study.'};await writeJson(root,'browser.json',report);return report;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)browserQa(process.argv[2]).then(r=>{console.log(JSON.stringify(r,null,2));if(!r.passed)process.exitCode=1;}).catch(e=>{console.error(e.message);process.exitCode=1;});
