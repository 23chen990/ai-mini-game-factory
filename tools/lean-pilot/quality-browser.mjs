/* global process, document, window, getComputedStyle, setTimeout, clearTimeout */
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { loadRun, serveRun, buildHash, verifyRunInputs } from './runner.mjs';
import { safeRead, sha256 } from './policy.mjs';
import { standaloneHtml } from './standalone.mjs';
export const VISIBLE_IDS=[...[[844,390],[390,844],[320,568]].flatMap(([w])=>['touch-targets','scene-control-bounds','scene-tap-dispatch','contextual-investment','orientation-layout'].map(n=>n+'@'+w)),'opening-cue-and-real-queue','continuous-input-and-cancel'];
const snapshot=page=>page.evaluate(()=>window.__CLINIC_VIEW__());
async function tooling(){const name=process.env.LEAN_PLAYWRIGHT_MODULE;if(name&&!path.isAbsolute(name))throw new Error('Playwright module must be an absolute trusted tooling path');return import(name?pathToFileURL(name).href:'@playwright/test');}
async function touch(page,selector){const b=await page.locator(selector).boundingBox();if(!b)throw new Error('Missing scene target '+selector);await page.touchscreen.tap(b.x+b.width*.5,b.y+b.height*.5);}
export async function inspectVisibleUi(browser,load,outDirectory){
 const checks=[],artifacts=[];await mkdir(outDirectory,{recursive:true});
 const record=(id,passed,evidence)=>checks.push({id,passed:passed===true,route:'IMPLEMENTATION',evidence});
 const shot=async(page,name)=>{const p=name+'.png';await page.screenshot({path:path.join(outDirectory,p),fullPage:false});artifacts.push({path:p,sha256:sha256(await safeRead(outDirectory,p))});};
 for(const [width,height] of [[844,390],[390,844],[320,568]]){
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,reducedMotion:'reduce'}),page=await ctx.newPage(),errors=[];
  page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
  try{
   await load(page);await page.locator('#start').waitFor({state:'visible',timeout:8000});await touch(page,'#start');
   if(width===844){
    const cue=await page.locator('#hint').innerText(),why=await page.locator('#why').innerText();
    await page.waitForTimeout(5900);const count=Number(await page.locator('#intake-count').innerText());
    record('opening-cue-and-real-queue',/\u6302\u53f7/.test(cue)&&/\u70b9/.test(why)&&count>=2&&(await snapshot(page)).state.timeMs<=10000,{cue,why,realWaiting:count});
   }
   const dimensions=await page.locator('button').evaluateAll(els=>els.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[hidden]');}).map(e=>({id:e.id,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})));
   record('touch-targets@'+width,dimensions.every(b=>b.width>=44&&b.height>=44),dimensions);
   const boxes={};for(const id of ['assign-intake','assign-care','open-expansion'])boxes[id]=await page.locator('#'+id).boundingBox();
   record('scene-control-bounds@'+width,!(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))&&Object.values(boxes).every(b=>b&&b.x>=0&&b.y>=0&&b.x+b.width<=width+1&&b.y+b.height<=height+1),boxes);
   const before=(await snapshot(page)).state.helper.target;
   await touch(page,'#assign-intake');const after=(await snapshot(page)).state.helper.target;
   record('scene-tap-dispatch@'+width,before==='idle'&&after==='intake'&&await page.locator('#assign-intake').getAttribute('aria-pressed')==='true',{before,after,method:'coordinate tap on room surface'});
   await touch(page,'#assign-care');const equipmentShown=await page.locator('#buy-equipment').isVisible();
   await touch(page,'#open-expansion');const note=await page.locator('#investment-note').innerText();
   const oneContext=!(await page.locator('#buy-equipment').isVisible())&&await page.locator('#buy-room').isVisible();
   await touch(page,'#buy-room');const roomText=await page.locator('#second-status').innerText();
   record('contextual-investment@'+width,equipmentShown&&oneContext&&/65/.test(note)&&/70/.test(note)&&/135/.test(note)&&/\u533b\u751f/.test(roomText)&&await page.locator('#buy-doctor').isDisabled(),{note,roomText,equipmentShown,oneContext});
   const i=boxes['assign-intake'],c=boxes['assign-care'],e=boxes['open-expansion'];
   record('orientation-layout@'+width,width>700?i.x+i.width<c.x+1&&c.x+c.width<e.x+1:i.y+i.height<c.y+1&&Math.abs(c.y-e.y)<2&&i.width>c.width*1.5,{primary:'landscape',portrait:'real reflow',boxes});
   if(width===844){
    const frozenTarget=(await snapshot(page)).state.helper.target;
    const session=await ctx.newCDPSession(page),b=boxes['assign-intake'];
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+30,y:b.y+30}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    const cancelPreserved=(await snapshot(page)).state.helper.target===frozenTarget;
    const t0=(await snapshot(page)).state.timeMs,wall=Date.now();
    for(let n=0;n<24;n++){await touch(page,'#assign-care');await page.waitForTimeout(65);}
    const t1=(await snapshot(page)).state.timeMs;
    record('continuous-input-and-cancel',cancelPreserved&&t1-t0>=Math.max(1000,Date.now()-wall-700),{cancelPreserved,t0,t1,wallMs:Date.now()-wall,kind:'browser touch sequence, not state injection'});
    await shot(page,'feedback-and-live-input');
   }
   if(errors.length)checks.push({id:'unexpected-page-error@'+width,passed:false,route:'IMPLEMENTATION',evidence:errors});
   await shot(page,'visible-'+width+'x'+height);
  }finally{await ctx.close();}
 }
 const findings=checks.filter(c=>!c.passed).map(c=>({id:c.id.startsWith('touch-targets@')?'touch-targets':c.id,severity:'blocker',route:c.route,summary:'Visible scene interaction failed '+c.id,evidence:c.evidence}));
 return{checks,findings,artifacts,passed:!findings.length};
}
export async function reviewBrowser(base,id,{suffix='current'}={}){
 if(!/^[a-z0-9-]{1,30}$/.test(suffix))throw new Error('Invalid evidence suffix');
 const{root,game,run}=await loadRun(base,id);await verifyRunInputs(root,run);const hash=await buildHash(game),out=path.join(root,'quality','visible-'+suffix);let server,browser,timer;const started=Date.now();
 try{
  const pw=await tooling();server=await serveRun(base,id,0);browser=await pw.chromium.launch({headless:true,...(process.env.LEAN_CHROMIUM_PATH?{executablePath:process.env.LEAN_CHROMIUM_PATH}:{})});
  timer=setTimeout(()=>void browser.close(),45000);
  const r=await inspectVisibleUi(browser,page=>page.goto('http://127.0.0.1:'+server.address().port),out);
  if(await buildHash(game)!==hash)throw new Error('Candidate changed during visible review');
  return{schemaVersion:1,runId:id,buildHash:hash,scope:'HTTP_VISIBLE_INTERACTION',artifactRoot:'visible-'+suffix,outcome:r.passed?'PASSED':'FAILED',...r,elapsedMs:Date.now()-started,reviewer:'SCRIPTED_VISIBLE_UI_QA',human:'NOT_RUN',semantics:'NOT_AN_AI_OR_HUMAN_FUN_REVIEW'};
 }catch(error){return{schemaVersion:1,runId:id,buildHash:hash,scope:'HTTP_VISIBLE_INTERACTION',passed:false,outcome:String(error).includes('ERR_BLOCKED_BY_ADMINISTRATOR')?'ENVIRONMENT_BLOCKED':'FAILED',checks:[{id:'visible-review-runtime',passed:false,route:'IMPLEMENTATION'}],findings:[{id:'visible-review-runtime',route:'IMPLEMENTATION',severity:'blocker',summary:String(error)}],elapsedMs:Date.now()-started};}
 finally{clearTimeout(timer);if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
}
export async function reviewOffline(game,out){const bundle=await standaloneHtml(game,'clinic','offline-internal-review'),pw=await tooling();const browser=await pw.chromium.launch({headless:true,...(process.env.LEAN_CHROMIUM_PATH?{executablePath:process.env.LEAN_CHROMIUM_PATH}:{})});try{return{schemaVersion:1,scope:'OFFLINE_VISIBLE_INTERACTION',buildHash:bundle.buildHash,...await inspectVisibleUi(browser,page=>page.setContent(bundle.html),out),human:'NOT_RUN',httpGateSatisfied:false};}finally{await browser.close();}}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');reviewBrowser(path.join(repo,'runs'),process.argv[2]).then(async r=>{await writeFile(path.join(repo,'runs',process.argv[2],'quality-visible.json'),JSON.stringify(r,null,2)+'\n');process.stdout.write(JSON.stringify(r,null,2)+'\n');if(!r.passed)process.exitCode=1;}).catch(e=>{process.stderr.write(String(e));process.exitCode=1;});}
