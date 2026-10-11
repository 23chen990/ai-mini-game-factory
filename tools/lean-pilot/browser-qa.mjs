/* global URL, console, process, setTimeout, clearTimeout, window, localStorage, document, Storage */
import assert from 'node:assert/strict';
import { mkdir, writeFile, open, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { serveRun, buildHash, loadRun, verifyRunInputs, BROWSER_CHECKS } from './runner.mjs';
import { safeRead, evaluateBudget, sha256 } from './policy.mjs';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const readJson=async(root,name)=>JSON.parse((await safeRead(root,name)).toString('utf8'));
const writeJson=(root,name,data)=>writeFile(path.join(root,name),JSON.stringify(data,null,2)+'\n');
const directions={left:[-90,0],right:[90,0],up:[0,-90],down:[0,90]};
const keys={left:'ArrowLeft',right:'ArrowRight',up:'ArrowUp',down:'ArrowDown'};
const snapshot=page=>page.evaluate(()=>window.__GRID_MERGE__.getSnapshot());
async function ready(page) { await page.waitForFunction(()=>window.__GRID_MERGE__&&!window.__GRID_MERGE__.getSnapshot().busy); }
async function swipe(page,session,direction) {
  const bounds=await page.locator('#board').boundingBox();assert.ok(bounds);
  const [dx,dy]=directions[direction];const x=bounds.x+bounds.width/2;const y=bounds.y+bounds.height/2;
  const point=(px,py)=>[{x:px,y:py,id:1,radiusX:3,radiusY:3,force:1}];
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:point(x,y)});
  for(let i=1;i<=4;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:point(x+dx*i/4,y+dy*i/4)});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await ready(page);
}
const fixtureState=(cells,extra={})=>({version:1,cells,score:0,moves:0,seed:7,won:false,keepPlaying:false,status:'playing',...extra});

/** Scripted normal input is not a blind human playtest. Fixtures are reported separately. */
export async function browserQa(runId) {
  if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(runId))throw new Error('Invalid run id');
  const runs=path.join(ROOT,'runs');const root=path.join(runs,runId);const game=path.join(root,'workspace/game');
  const {run}=await loadRun(runs,runId);const hash=await buildHash(game);
  await verifyRunInputs(root,run);
  if(run.runId!==runId||run.policyHash!==sha256(JSON.stringify(run.budget)))throw new Error('Invalid run identity or policy');
  const lock=await open(path.join(root,'.check-lock'),'wx',0o600);
  let server;let browser;let timer;let timedOut=false;let reserved=false;const started=Date.now();
  const checks=[];const errors=[];const screenshots=[];const artifacts=[];
  let ledger;
  try {
  try {
    ledger=await readJson(root,'ledger.json');
    const gate=evaluateBudget(run.budget,ledger,{buildHash:hash,cashCents:0,timeoutMs:run.budget.maxAttemptMs});
    if(!gate.passed)throw new Error(gate.blockers.join(', '));
    if(!ledger.buildHashes.includes(hash))ledger.buildHashes.push(hash);
    ledger.pending=true;await writeJson(root,'ledger.json',ledger);reserved=true;
    const deadline=Date.now()+run.budget.maxAttemptMs;
    const remaining=()=>{const ms=deadline-Date.now();if(ms<=0)throw new Error('Browser verification deadline exceeded');return ms;};
    timer=setTimeout(()=>{timedOut=true;if(browser)void browser.close().catch(()=>{});},run.budget.maxAttemptMs);
    // Uses the existing project Playwright dependency. Optional absolute module path supports preinstalled QA hosts.
    const moduleName=process.env.LEAN_PLAYWRIGHT_MODULE;
    if(moduleName&&!path.isAbsolute(moduleName))throw new Error('LEAN_PLAYWRIGHT_MODULE must be absolute');
    const pw=await import(moduleName?pathToFileURL(moduleName).href:'@playwright/test');
    server=await serveRun(runs,runId,0);const url=`http://127.0.0.1:${server.address().port}`;
    browser=await pw.chromium.launch({headless:true,timeout:remaining(),...(process.env.LEAN_CHROMIUM_PATH?{executablePath:process.env.LEAN_CHROMIUM_PATH}:{})});
    remaining();
    await mkdir(path.join(root,'screenshots'),{recursive:true});
    for(const [theme,width,height] of [['observatory',390,844],['observatory',320,568],['observatory',844,390],['orchard',390,844]]) {
      const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
      context.setDefaultTimeout(Math.min(10000,remaining()));
      context.setDefaultNavigationTimeout(Math.min(15000,remaining()));
      const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
      await page.goto(`${url}/?theme=${theme}`);await ready(page);
      assert.equal((await snapshot(page)).theme,theme);
      const overflowing=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
      assert.equal(overflowing,false,`horizontal overflow ${width}x${height}`);
      const box=await page.locator('#board').boundingBox();assert.ok(box.width>200&&box.height>200);
      const controls=await page.locator('.controls').boundingBox();
      assert.ok(box.y>=0 && box.y+box.height<=height, 'board must fit the initial viewport');
      assert.ok(controls && controls.y+controls.height<=height, 'primary controls must fit the initial viewport');
      const shot=`screenshots/${theme}-${width}x${height}.png`;await page.screenshot({path:path.join(root,shot),fullPage:true});screenshots.push(shot);
      checks.push({name:`layout-${theme}-${width}x${height}`,kind:'BROWSER_LAYOUT',passed:true});
      if(width!==390||theme!=='observatory') {await context.close();continue;}
      const session=await context.newCDPSession(page);
      for(let i=0;i<64;i++) {
        await swipe(page,session,['left','down','right','up'][i%4]);
        const observed=await snapshot(page);
        if(observed.state.moves>=4 && observed.eventTrace.some(t=>t.events.some(e=>e.type==='merge')))break;
      }
      const afterTouch=await snapshot(page);assert.ok(afterTouch.state.moves>=4);
      assert.ok(afterTouch.inputTrace.some(t=>t.source==='touch'),'must receive actual touch pointer events, not mouse events');
      assert.ok(afterTouch.eventTrace.some(t=>t.events.some(e=>e.type==='merge')),'normal touch journey must include an actual merge');
      checks.push({name:'touch-swipe-move-and-merge',kind:'SCRIPTED_NORMAL_INPUT',passed:true,moves:afterTouch.state.moves});
      const saved=afterTouch.state;await page.reload();await ready(page);assert.deepEqual((await snapshot(page)).state,saved);
      checks.push({name:'reload-restores-exact-state',kind:'SCRIPTED_NORMAL_INPUT',passed:true});
      // Cancelling a pointer must not turn its later release into a move.
      const beforeCancel=(await snapshot(page)).state.moves;const box2=await page.locator('#board').boundingBox();
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box2.x+40,y:box2.y+80,id:9}]});
      await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
      assert.equal((await snapshot(page)).state.moves,beforeCancel);
      checks.push({name:'touch-cancel-is-not-a-move',kind:'SCRIPTED_NORMAL_INPUT',passed:true});
      // Deterministic input schedule, no state injection. Read-only probe checks progress.
      let terminal=null;
      for(let i=0;i<900;i++) {
        const current=await snapshot(page);
        if(current.state.status==='lost'){terminal=current;break;}
        if(current.state.status==='won'){await page.locator('#dialog-primary').click();await ready(page);}
        await page.keyboard.press(keys[['left','down','right','up'][i%4]]);await ready(page);
      }
      assert.ok(terminal,'normal input journey must reach a real terminal, not an injected state');
      assert.ok(await page.locator('#dialog').isVisible());
      await page.screenshot({path:path.join(root,'screenshots/normal-terminal.png'),fullPage:true});screenshots.push('screenshots/normal-terminal.png');
      await page.locator('#dialog-primary').click();await ready(page);assert.equal((await snapshot(page)).state.moves,0);
      assert.equal((await snapshot(page)).state.status,'playing');
      checks.push({name:'normal-loss-settlement-and-replay',kind:'SCRIPTED_NORMAL_INPUT',passed:true,terminalMoves:terminal.state.moves});
      // Theme changes must not carry another theme's board into a new slot.
      await page.locator('[data-theme-id="orchard"]').click();await page.waitForURL('**/?theme=orchard');await ready(page);
      assert.equal((await snapshot(page)).theme,'orchard');assert.equal((await snapshot(page)).state.moves,0);
      checks.push({name:'theme-save-isolation',kind:'SCRIPTED_NORMAL_INPUT',passed:true});await context.close();
    }
    // Explicit fixture coverage, deliberately NOT credited as natural play.
    const fixtureContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
    const fixturePage=await fixtureContext.newPage();fixturePage.on('pageerror',error=>errors.push(error.message));
    const win=fixtureState([1024,1024,...Array(14).fill(0)]);
    await fixturePage.addInitScript(value=>localStorage.setItem('grid-merge-v1.0.0:observatory',JSON.stringify(value)),{ruleVersion:'grid-merge-v1.0.0',theme:'observatory',state:win,best:0});
    await fixturePage.goto(url);await ready(fixturePage);await fixturePage.keyboard.press('ArrowLeft');await ready(fixturePage);
    assert.equal((await snapshot(fixturePage)).state.status,'won');await fixturePage.locator('#dialog-primary').click();
    assert.equal((await snapshot(fixturePage)).state.keepPlaying,true);
    checks.push({name:'win-and-continue',kind:'INJECTED_STORAGE_FIXTURE',passed:true});await fixtureContext.close();
    const denied=await browser.newContext({viewport:{width:390,height:844}});const deniedPage=await denied.newPage();
    await deniedPage.addInitScript(()=>Object.defineProperty(Storage.prototype,'setItem',{value(){throw new Error('Denied');}}));
    await deniedPage.goto(url);await ready(deniedPage);assert.ok((await deniedPage.locator('#storage-warning').innerText()).includes('unavailable'));
    await deniedPage.keyboard.press('ArrowLeft');await ready(deniedPage);
    checks.push({name:'storage-denial-preserves-play',kind:'INJECTED_ENVIRONMENT_FIXTURE',passed:true});await denied.close();
    assert.deepEqual(errors,[],'browser errors');assert.equal(await buildHash(game),hash,'build changed during browser QA');
    await verifyRunInputs(root,run);
    assert.ok(BROWSER_CHECKS.every(name=>checks.some(c=>c.name===name && c.passed)),'required browser checks missing');
    for(const name of screenshots)artifacts.push({path:name,sha256:sha256(await safeRead(root,name))});
  } catch(error) {errors.push(error.message);}
  finally {
    clearTimeout(timer);
    if(browser)await browser.close().catch(error=>errors.push(error.message));
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    if(reserved){ledger.pending=false;ledger.elapsedMs+=Math.max(0,Date.now()-started);ledger.attempts.push({kind:'browser',buildHash:hash,passed:errors.length===0&&!timedOut,elapsedMs:Date.now()-started,at:new Date().toISOString()});await writeJson(root,'ledger.json',ledger);}
  }
  const report={schemaVersion:1,runId,buildHash:hash,scope:'HTTP_BROWSER',suiteHash:run.browserSuiteHash,artifacts,passed:errors.length===0&&!timedOut,timedOut,checks,errors,screenshots,
    checkedAt:new Date().toISOString(),humanPlaytest:'NOT_RUN',device:'CHROMIUM_EMULATION_NOT_IPHONE_HARDWARE',
    limitation:'Scripted inputs and read-only instrumentation do not prove discoverability, enjoyment, retention or commercial viability. Fixture cases are separate.'};
  report.outcome=report.passed?'PASSED':errors.some(e=>/ERR_BLOCKED_BY_ADMINISTRATOR|Executable doesn't exist|Cannot find package/.test(e))?'ENVIRONMENT_BLOCKED':'FAILED';
  await writeJson(root,'browser.json',report);return report;
  } finally {await lock.close();await rm(path.join(root,'.check-lock'),{force:true});}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)browserQa(process.argv[2]).then(result=>{console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;}).catch(error=>{console.error(error.message);process.exitCode=1;});
