/* global console, window, document, WebGL2RenderingContext */
import {chromium,webkit} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {RUN,WORKSPACE,json,sha} from './prepare.mjs';
import {serve} from './serve.mjs';
const build=JSON.parse(await readFile(path.join(RUN,'build-receipt.json'),'utf8'));
const dir=path.join(RUN,`attempts/attempt-${build.attempt}/lifecycle`);await mkdir(dir,{recursive:true});
const server=await serve();const report={schemaVersion:1,targetGame:'鹈鹕海岸冒险',workspace:WORKSPACE,buildHash:build.buildHash,checks:[],diagnostics:[],screenshots:[],errors:[],physicalIPhone:'NOT_RUN',normalInputOnly:true};
const check=(name,passed,evidence)=>report.checks.push({name,passed,evidence});
const shot=async(page,name)=>{const f=path.join(dir,name+'.png');await page.screenshot({path:f});report.screenshots.push({path:path.relative(RUN,f),sha256:sha(await readFile(f))});};
const observe=page=>page.evaluate(()=>({state:window.__coast.snapshot(),visibility:document.visibilityState,focus:document.hasFocus(),events:window.__lifecycleEvents}));
async function open(engine,headless,url){
 const browser=await engine.launch({headless,args:engine===chromium?['--enable-unsafe-swiftshader']:[]});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{window.__lifecycleEvents=[];for(const type of ['blur','focus','visibilitychange','pagehide']){(type==='visibilitychange'?document:window).addEventListener(type,()=>window.__lifecycleEvents.push({type,hidden:document.hidden,at:Date.now()}));}window.__gpuViewports={};const viewport=WebGL2RenderingContext.prototype.viewport;WebGL2RenderingContext.prototype.viewport=function(...a){const result=viewport.apply(this,a);const actual=[...this.getParameter(this.VIEWPORT)].slice(2);window.__gpuViewports[actual.join('x')]=(window.__gpuViewports[actual.join('x')]||0)+1;return result;};});
 await page.goto(url);await page.waitForSelector('#coast[data-loaded="true"]');return {browser,context,page};
}
async function background(context,page){const before=await observe(page);const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();await page.waitForTimeout(800);const away=await observe(page);await page.bringToFront();await other.close();return {before,away,returned:await observe(page)};}
try{
 // Confirm whether headless WebKit can produce an actual window background signal.
 {const {browser,context,page}=await open(webkit,true,'http://127.0.0.1:'+server.address().port+'/game/index.html');try{
   await page.locator('#co-start').tap();await page.waitForTimeout(500);const observation=await background(context,page);report.diagnostics.push({name:'headless-webkit-tab-capability',observation,classification:observation.away.events.some(e=>e.type==='blur'||e.hidden)?'BACKGROUND_SIGNAL_OBSERVED':'NO_BACKGROUND_SIGNAL_FROM_HEADLESS_TABS'});
 }finally{await browser.close();}}
 // A real browser window and normal tab focus; no dispatchEvent or lifecycle/CDP state forcing.
 {const {browser,context,page}=await open(chromium,false,'http://127.0.0.1:'+server.address().port+'/game/index.html');try{
   await page.locator('#co-start').tap();await page.waitForTimeout(1800);const tabObservation=await background(context,page);report.diagnostics.push({name:'headed-chromium-tab',observation:tabObservation});
   // Minimize the actual browser window, just as a player can; no page lifecycle emulation.
   const cdp=await context.newCDPSession(page),win=await cdp.send('Browser.getWindowForTarget');const before=await observe(page);await cdp.send('Browser.setWindowBounds',{windowId:win.windowId,bounds:{windowState:'minimized'}});await page.waitForTimeout(800);const away=await observe(page);await cdp.send('Browser.setWindowBounds',{windowId:win.windowId,bounds:{windowState:'normal'}});await page.bringToFront();const observation={before,away,returned:await observe(page)};report.diagnostics.push({name:'actual-window-minimize',observation});
   const actuallyPaused=observation.away.state.phase==='paused'&&observation.away.state.pausedBySystem;
   check('actual-window-background-pauses',actuallyPaused,observation);await shot(page,'background-paused');
   const paused=await observe(page);await page.waitForTimeout(700);const still=await observe(page);check('background-countdown-stays-paused',actuallyPaused&&paused.state.elapsed===still.state.elapsed&&paused.state.distance===still.state.distance,{paused,still});
   if(still.state.phase==='paused')await page.locator('#co-resume').tap();await page.waitForTimeout(400);const resumed=await observe(page);check('background-requires-manual-resume',actuallyPaused&&resumed.state.phase==='running'&&resumed.state.distance>still.state.distance,resumed);await shot(page,'background-resumed');
   await page.locator('#co-pause').tap();await page.setViewportSize({width:844,height:390});await page.locator('#co-resume').tap();await page.waitForTimeout(400);const rotated=await page.evaluate(()=>window.__coast.renderInfo());check('portrait-to-landscape-live-resize',rotated.canvas[0]>rotated.canvas[1]&&rotated.canvas.every((n,i)=>n===rotated.composer[i])&&rotated.camera.fov===58,rotated);await shot(page,'live-rotation');
 }finally{await browser.close();}}
 // The shipped single file must work without a module server or remote asset fetch.
 {const {browser,page}=await open(webkit,true,pathToFileURL(path.join(WORKSPACE,'game/index.html')).href);try{
   const modes=[];for(let i=0;i<3;i++){await page.evaluate(()=>{window.__gpuViewports={};});await page.locator('#co-quality').tap();await page.waitForTimeout(200);modes.push(await page.evaluate(()=>({...window.__coast.renderInfo(),actualGpuViewports:window.__gpuViewports})));}
   // Three.js stores logical target dimensions as floats; WebGL viewport/texture dimensions are integers.
   check('all-quality-presets-keep-composer-size',modes.every(r=>r.canvas.every((n,i)=>n===Math.floor(r.composer[i]))&&r.actualGpuViewports[r.canvas.join('x')]>=2&&r.pixelRatio>=1.25),modes);
   await page.locator('#co-start').tap();await page.waitForTimeout(2500);const local=await observe(page);check('offline-single-html-normal-touch-catch',local.state.phase==='running'&&local.state.count>=1,local);await shot(page,'standalone-file');
 }finally{await browser.close();}}
}catch(e){report.errors.push(e.stack);}finally{server.close();}
report.passed=report.errors.length===0&&report.checks.length===6&&report.checks.every(c=>c.passed);report.testedAt=new Date().toISOString();await json(path.join(dir,'report.json'),report);console.log(JSON.stringify(report,null,2));
