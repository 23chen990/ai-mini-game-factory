/* global URL, window, document, Storage, console, process, setTimeout, clearTimeout */
import assert from 'node:assert/strict';
import { mkdir, writeFile, open, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { serveRun, loadRun, buildHash, verifyRunInputs } from './runner.mjs';
import { safeRead, sha256, evaluateBudget } from './policy.mjs';
import { candidateSpec } from './candidates.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const readJson=async(root,name)=>JSON.parse((await safeRead(root,name)).toString('utf8'));
const writeJson=(root,name,value)=>writeFile(path.join(root,name),JSON.stringify(value,null,2)+'\n');
const view=page=>page.evaluate(()=>window.__CLINIC_VIEW__());
const ready=page=>page.waitForFunction(()=>typeof window.__CLINIC_VIEW__==='function');

/** Actual HTTP, normal touch actions, and a separately labeled denied-storage fixture. */
export async function browserQa(runId,{base=path.join(ROOT,'runs')}={}){
  const runs=base;const {run,root,game}=await loadRun(runs,runId);
  if(run.templateId!=='clinic-queue-v1')throw new Error('Wrong candidate for clinic QA');
  await verifyRunInputs(root,run);const hash=await buildHash(game);
  const lock=await open(path.join(root,'.check-lock'),'wx',0o600);
  const checks=[],errors=[],artifacts=[],trace=[];let browser,server,timer,reserved=false,timedOut=false;
  const started=Date.now(),ledger=await readJson(root,'ledger.json');
  const record=(name,kind='SCRIPTED_NORMAL_INPUT',extra={})=>checks.push({name,kind,passed:true,...extra});
  const shot=async(page,name)=>{const relative='screenshots/'+name+'.png';await page.screenshot({path:path.join(root,relative),fullPage:true});artifacts.push({path:relative,sha256:sha256(await safeRead(root,relative))});};
  try{
    const gate=evaluateBudget(run.budget,ledger,{buildHash:hash,cashCents:0,timeoutMs:run.budget.maxAttemptMs});
    if(!gate.passed)throw new Error(gate.blockers.join(','));
    if(!ledger.buildHashes.includes(hash))ledger.buildHashes.push(hash);ledger.pending=true;await writeJson(root,'ledger.json',ledger);reserved=true;
    const moduleName=process.env.LEAN_PLAYWRIGHT_MODULE;
    if(moduleName&&!path.isAbsolute(moduleName))throw new Error('Playwright module path must be absolute');
    const pw=await import(moduleName?pathToFileURL(moduleName).href:'@playwright/test');
    server=await serveRun(runs,runId,0);const url=`http://127.0.0.1:${server.address().port}`;
    browser=await pw.chromium.launch({headless:true,...(process.env.LEAN_CHROMIUM_PATH?{executablePath:process.env.LEAN_CHROMIUM_PATH}:{})});
    timer=setTimeout(()=>{timedOut=true;void browser.close();},run.budget.maxAttemptMs);
    await mkdir(path.join(root,'screenshots'),{recursive:true});
    for(const [width,height] of [[844,390],[390,844],[320,568]]){
      const ctx=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
      const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await ready(page);await page.locator('#start').tap();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'Horizontal overflow');
      for(const selector of ['.scene','#assign-intake','#assign-care','#buy-equipment','#buy-room','#buy-doctor']){
        const b=await page.locator(selector).boundingBox();assert.ok(b&&b.width>0&&b.x>=0&&b.y>=0&&b.x+b.width<=width+1&&b.y+b.height<=height+1,`${selector} outside ${width}x${height}`);
      }
      await shot(page,`clinic-${width}x${height}`);record(`clinic-layout-${width}x${height}`,'BROWSER_LAYOUT');
      if(width!==844){await ctx.close();continue;}
      await page.locator('#assign-care').tap();await page.waitForFunction(()=>window.__CLINIC_VIEW__().state.helper.station==='care');
      assert.equal(await page.locator('#assign-care').getAttribute('aria-pressed'),'true');
      const hp=await page.locator('#helper').boundingBox(),scene=await page.locator('.world').boundingBox();assert.ok(hp.x>scene.x+scene.width*.6);
      trace.push({checkpoint:'dispatch',snapshot:await view(page)});record('clinic-dispatch-visible');
      const cash=(await view(page)).state.cash;await page.locator('#buy-equipment').tap();assert.equal((await view(page)).state.cash,cash-3500);assert.equal((await view(page)).view.careMs,5000);record('clinic-investment-cash');
      await page.locator('#pause').tap();const frozen=(await view(page)).state;await page.waitForTimeout(800);assert.deepEqual((await view(page)).state,frozen);record('clinic-pause-freezes');
      await page.reload();await ready(page);assert.deepEqual((await view(page)).state,frozen);assert.equal((await view(page)).runId,runId);record('clinic-save-resume');
      await page.locator('#start').tap();await page.locator('#speed').tap();assert.equal((await view(page)).speed,3);
      while((await view(page)).state.status!=='finished'){
        const v=await view(page),s=v.state;
        if(s.timeMs>=177000){await page.waitForFunction(()=>window.__CLINIC_VIEW__().state.status==='finished',{},{timeout:5000});break;}
        if(!s.room2&&s.cash>=13500)await page.locator('#buy-room').tap();
        if((await page.locator('#buy-doctor').isEnabled()))await page.locator('#buy-doctor').tap();
        const desired=v.view.intakeQueue*4500>(v.view.careQueue+1)*v.view.careMs/(s.doctor2?2:1)?'intake':'care';
        if(s.helper.target!==desired)await page.locator('#assign-'+desired).tap();
        await page.waitForTimeout(500);
      }
      const terminal=(await view(page)).state;assert.ok(terminal.completed>0);assert.equal(terminal.timeMs,180000);assert.ok(await page.locator('#settlement').isVisible());
      trace.push({checkpoint:'settlement',snapshot:await view(page)});await shot(page,'clinic-settlement');await page.locator('#start').tap();
      const fresh=(await view(page)).state;assert.equal(fresh.completed,0);assert.ok(fresh.timeMs<=1000);record('clinic-natural-settlement-replay','SCRIPTED_NORMAL_INPUT',{speed:3,simulatedSeconds:180,completed:terminal.completed,lost:terminal.lost});await ctx.close();
    }
    const denied=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});const p=await denied.newPage();
    await p.addInitScript(()=>Object.defineProperty(Storage.prototype,'setItem',{value(){throw new Error('Denied');}}));
    await p.goto(url);await ready(p);await p.locator('#start').tap();await p.locator('#assign-care').tap();assert.ok(await p.locator('.save-state.warning').isVisible());assert.equal((await view(p)).state.helper.target,'care');
    record('clinic-storage-denial','INJECTED_ENVIRONMENT_FIXTURE');await denied.close();
    assert.deepEqual(errors,[]);assert.equal(await buildHash(game),hash);await verifyRunInputs(root,run);
    assert.deepEqual(checks.map(c=>c.name).sort(),candidateSpec(run.templateId).checks.sort());
  }catch(error){errors.push(error.message);}
  finally{
    clearTimeout(timer);if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
    if(reserved){const elapsed=Date.now()-started;ledger.pending=false;ledger.elapsedMs+=elapsed;ledger.attempts.push({kind:'browser',buildHash:hash,passed:!errors.length&&!timedOut,elapsedMs:elapsed,at:new Date().toISOString()});await writeJson(root,'ledger.json',ledger);}
    await lock.close();await rm(path.join(root,'.check-lock'),{force:true});
  }
  await writeJson(root,'clinic-trace.json',trace);artifacts.push({path:'clinic-trace.json',sha256:sha256(await safeRead(root,'clinic-trace.json'))});
  const passed=!errors.length&&!timedOut;const report={schemaVersion:1,runId,buildHash:hash,suiteHash:run.browserSuiteHash,scope:'HTTP_BROWSER',passed,checks,artifacts,errors,timedOut,outcome:passed?'PASSED':errors.some(e=>e.includes('ERR_BLOCKED_BY_ADMINISTRATOR'))?'ENVIRONMENT_BLOCKED':'FAILED',humanPlaytest:'NOT_RUN',device:'CHROMIUM_EMULATION_NOT_IPHONE',note:'Normal touch on candidate at player-selectable 3x pace; not human fun validation or comparison with a live competitor.'};
  await writeJson(root,'browser.json',report);return report;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)browserQa(process.argv[2]).then(r=>{console.log(JSON.stringify(r,null,2));if(!r.passed)process.exitCode=1;}).catch(e=>{console.error(e.message);process.exitCode=1;});
