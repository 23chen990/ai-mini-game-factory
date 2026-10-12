/* global process, document, window, getComputedStyle, setTimeout, clearTimeout */
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { loadRun, serveRun, buildHash, verifyRunInputs } from './runner.mjs';
import { safeRead, sha256 } from './policy.mjs';
import { standaloneHtml } from './standalone.mjs';

const visibleText=async(page,selector)=>(await page.locator(selector).count())?page.locator(selector).textContent():null;
const clockSeconds=text=>{const [m,s]=text.split(':').map(Number);return m*60+s;};
async function playwrightModule(){
  const moduleName=process.env.LEAN_PLAYWRIGHT_MODULE;
  if(moduleName&&!path.isAbsolute(moduleName))throw new Error('Playwright module must be an absolute trusted tooling path');
  return import(moduleName?pathToFileURL(moduleName).href:'@playwright/test');
}
/** Uses visible controls and labels for the action sequence; never reads hidden solution APIs.
 * Geometry/text signals only. Screenshots are retained for semantic visual review, not automatically "understood".
 */
export async function inspectVisibleUi(browser,load,outDirectory){
  const checks=[],artifacts=[];await mkdir(outDirectory,{recursive:true});
  const record=(id,passed,evidence)=>checks.push({id,passed:passed===true,route:'IMPLEMENTATION',evidence});
  const shot=async(page,name)=>{const p=name+'.png';await page.screenshot({path:path.join(outDirectory,p),fullPage:false});artifacts.push({path:p,sha256:sha256(await safeRead(outDirectory,p))});return p;};
  for(const [width,height] of [[844,390],[390,844],[320,568]]){
    const ctx=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
    const page=await ctx.newPage();page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    try{
      await load(page);await page.locator('#start').waitFor({state:'visible',timeout:8000});await page.locator('#start').tap();
      const dimensions=await page.locator('button').evaluateAll(els=>els.filter(e=>e.getBoundingClientRect().width>0 && e.getBoundingClientRect().height>0 && getComputedStyle(e).visibility!=='hidden' && !e.closest('[hidden]')).map(e=>({id:e.id,text:e.innerText,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y})));
      const interactive=dimensions.filter(e=>!['start'].includes(e.id));
      record('touch-targets@'+width,interactive.every(e=>e.width>=44&&e.height>=44),{controls:interactive});
      const viewportOkay=await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);
      const bounds=await page.locator('#assign-care').boundingBox();
      record('first-screen-controls@'+width,viewportOkay&&bounds&&bounds.y+bounds.height<=height+1,{viewport:{width,height},bounds});
      const note=await visibleText(page,'#investment-note');
      const noteVisible=await page.locator('#investment-note').isVisible();
      record('total-room-cost@'+width,noteVisible && /65/.test(note??'') && /70/.test(note??'') && /135/.test(note??''),{observed:note,visible:noteVisible});
      if(width===844){
        await page.locator('#assign-care').tap();await page.waitForTimeout(3400);
        const effect=await visibleText(page,'#helper-effect');
        record('helper-effect-visible',await page.locator('#helper-effect').isVisible() && /\u00d72/.test(effect??''),{observed:effect});
        await page.locator('#buy-equipment').tap();await page.waitForTimeout(1200);
        const feedback=await visibleText(page,'#last-action');
        record('purchase-effect-persists',await page.locator('#last-action').isVisible() && /8\.5/.test(feedback??'') && /5/.test(feedback??''),{observed:feedback,afterMs:1200});
        const before=clockSeconds(await page.locator('#clock').innerText()),wall=Date.now();
        const target=await page.locator('#assign-care').boundingBox();
        for(let n=0;n<24;n++){await page.touchscreen.tap(target.x+target.width/2,target.y+target.height/2);await page.waitForTimeout(65);}
        const after=clockSeconds(await page.locator('#clock').innerText()),elapsed=Date.now()-wall;
        record('repeated-input-does-not-freeze-time',before-after>=Math.max(1,Math.floor(elapsed/1000)-1),{clockBefore:before,clockAfter:after,actions:24,wallMs:elapsed});
        await shot(page,'feedback-and-live-input');
      }else{
        await page.locator('#buy-room').tap();
        const label=await page.locator('#second-status').textContent();
        record('empty-room-explanation@'+width,await page.locator('#second-status').isVisible() && /\u533b\u751f/.test(label??''),{observed:label});
      }
      await shot(page,'visible-'+width+'x'+height);
      record('no-page-errors@'+width,errors.length===0,{errors});
    }finally{await ctx.close();}
  }
  const findings=checks.filter(c=>!c.passed).map(c=>({id:c.id.startsWith('touch-targets@')?'touch-targets':c.id,severity:'blocker',route:c.route,summary:'Visible interaction failed '+c.id,evidence:c.evidence}));
  return {checks,findings,artifacts,passed:findings.length===0};
}
export async function reviewBrowser(base,id,{suffix='current'}={}){
  if(!/^[a-z0-9-]{1,30}$/.test(suffix))throw new Error('Invalid evidence suffix');
  const {root,game,run}=await loadRun(base,id);await verifyRunInputs(root,run);
  const hash=await buildHash(game),out=path.join(root,'quality','visible-'+suffix);
  let server,browser,timer;const started=Date.now();
  try{
    const pw=await playwrightModule();server=await serveRun(base,id,0);
    browser=await pw.chromium.launch({headless:true,...(process.env.LEAN_CHROMIUM_PATH?{executablePath:process.env.LEAN_CHROMIUM_PATH}:{})});
    timer=setTimeout(()=>void browser.close(),45000);
    const result=await inspectVisibleUi(browser,page=>page.goto('http://127.0.0.1:'+server.address().port),out);
    if(await buildHash(game)!==hash)throw new Error('Candidate changed during visible review');
    return {schemaVersion:1,runId:id,buildHash:hash,scope:'HTTP_VISIBLE_INTERACTION',artifactRoot:'visible-'+suffix,outcome:result.passed?'PASSED':'FAILED',...result,elapsedMs:Date.now()-started,
      reviewer:'SCRIPTED_VISIBLE_UI_QA',human:'NOT_RUN',semantics:'NOT_AN_AI_OR_HUMAN_FUN_REVIEW'};
  }catch(error){return {schemaVersion:1,runId:id,buildHash:hash,scope:'HTTP_VISIBLE_INTERACTION',passed:false,outcome:String(error).includes('ERR_BLOCKED_BY_ADMINISTRATOR')?'ENVIRONMENT_BLOCKED':'FAILED',checks:[],findings:[{id:'visible-review-runtime',route:'IMPLEMENTATION',severity:'blocker',summary:String(error)}],elapsedMs:Date.now()-started};}
  finally{clearTimeout(timer);if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
}
// Explicit development-only fallback; NEVER writes browser.json or satisfies an HTTP gate.
export async function reviewOffline(game,out){
  const bundle=await standaloneHtml(game,'clinic','offline-internal-review');const pw=await playwrightModule();
  const browser=await pw.chromium.launch({headless:true,...(process.env.LEAN_CHROMIUM_PATH?{executablePath:process.env.LEAN_CHROMIUM_PATH}:{})});
  try{return {schemaVersion:1,scope:'OFFLINE_VISIBLE_INTERACTION',buildHash:bundle.buildHash,...await inspectVisibleUi(browser,page=>page.setContent(bundle.html),out),human:'NOT_RUN',httpGateSatisfied:false};}
  finally{await browser.close();}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  reviewBrowser(path.join(repo,'runs'),process.argv[2]).then(async r=>{await writeFile(path.join(repo,'runs',process.argv[2],'quality-visible.json'),JSON.stringify(r,null,2)+'\n');process.stdout.write(JSON.stringify(r,null,2)+'\n');if(!r.passed)process.exitCode=1;}).catch(e=>{process.stderr.write(String(e));process.exitCode=1;});
}
