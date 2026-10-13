/* global process, console, window, performance, requestAnimationFrame */
import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadRun,serveRun,buildHash} from './runner.mjs';
import {sha256} from './policy.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export async function browserQa(runId,{base=path.join(ROOT,'runs')}={}){
 const{run,root,game}=await loadRun(base,runId),hash=await buildHash(game),server=await serveRun(base,runId,0);
 const url='http://127.0.0.1:'+server.address().port,checks=[],artifacts=[],errors=[],actions=[];
 await mkdir(path.join(root,'screenshots'),{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
 const viewport=run.theme==='pelican-bike'?{width:390,height:844}:{width:844,height:390};
 const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:1}),page=await context.newPage();
 await page.addInitScript(()=>{window.__mobileFrames=[];let last;const f=t=>{if(last&&window.__mobileFrames.length<20000)window.__mobileFrames.push(t-last);last=t;requestAnimationFrame(f);};requestAnimationFrame(f);});
 page.on('pageerror',e=>errors.push(e.message));const started=Date.now();
 const shot=async name=>{const p='screenshots/'+name+'.png';await page.screenshot({path:path.join(root,p)});artifacts.push({path:p,sha256:sha256(await readFile(path.join(root,p)))});};
 const check=(name,passed,detail)=>checks.push({name,passed:passed===true,detail});
 const hold=async(selector,ms)=>{
   const box=await page.locator(selector).boundingBox();if(!box)throw Error('Missing visible target '+selector);
   const cdp=await context.newCDPSession(page),point={x:box.x+box.width/2,y:box.y+box.height/2,id:1};
   actions.push({atMs:Date.now()-started,input:'touch-hold',target:selector,durationMs:ms});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await page.waitForTimeout(ms);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
 };
 try{
   await page.goto(url);await page.waitForSelector('#mobile-kit[data-loaded="true"]',{timeout:45000});
   const readyMs=Date.now()-started;await shot('mobile-entry');
   const startBox=await page.locator('#mk-start').boundingBox();check('mobile-entry',readyMs<=30000&&startBox?.width>=44&&startBox?.height>=44,{readyMs,viewport,actualHTTP:true});
   await page.locator('#mk-start').tap();actions.push({atMs:Date.now()-started,input:'tap',target:'#mk-start'});
   await page.waitForSelector('#mobile-kit[data-native-phase="running"]',{timeout:45000});
   if(run.theme==='pelican-bike'){
     await hold('[data-code="ArrowLeft"]',1200);await hold('[data-code="ArrowRight"]',1200);
   }else if(run.theme==='qq-speed'){
     await hold('#t-left',1000);await hold('#t-right',1000);
   }else{
     const fire=page.locator('#touch .btn').filter({hasText:'开火'}).first();
     const b=await fire.boundingBox(),cdp=await context.newCDPSession(page);
     actions.push({atMs:Date.now()-started,input:'touch-hold',target:'visible-fire',durationMs:1500});
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:1}]});await page.waitForTimeout(1500);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
   }
   await shot('mobile-controls');
   check('mobile-controls',true,{authority:'NORMAL_TOUCH_INPUT_AND_SCREENSHOTS',note:'Control response needs screenshot/perceptual review; this does not prove every weapon or drift branch.'});
   await page.locator('#mk-pause').tap();const time=await page.locator('#mk-time').innerText();
   await page.waitForTimeout(1000);const frozen=time===await page.locator('#mk-time').innerText();
   const paused=await page.locator('#mobile-kit').getAttribute('data-phase');await page.locator('#mk-resume').tap();
   check('mobile-pause-resume',frozen&&paused==='paused',{visiblePaused:paused,clockFrozen:frozen});
   const loopStart=Date.now();
   while(await page.locator('#mobile-kit').getAttribute('data-phase')!=='finished'&&Date.now()-loopStart<240000){
     if(run.theme==='pelican-bike'){
       // A predefined sweep uses normal touch; no hidden fish positions or debug mutations.
       await hold('[data-code="ArrowLeft"]',1400);await hold('[data-code="ArrowRight"]',1400);
     }else await page.waitForTimeout(1000);
   }
   const phase=await page.locator('#mobile-kit').getAttribute('data-phase'),score=Number(await page.locator('#mk-score').innerText());
   await shot('mobile-terminal');
   const terminal={phase,visibleHeading:await page.locator('#mk-heading').innerText(),score,wallMs:Date.now()-started};
   if(phase==='finished'){
     const best=await page.locator('#mk-best').innerText();await page.locator('#mk-replay').tap();
     await page.waitForSelector('#mobile-kit[data-loaded="true"]',{timeout:45000});
     const restored=best===await page.locator('#mk-best').innerText();check('mobile-save-reload',restored,{savedBest:best,restored,unfinishedRound:'RESTARTS_EXPLICITLY'});
     await page.locator('#mk-start').tap();await page.waitForSelector('#mobile-kit[data-native-phase="running"]',{timeout:45000});
     check('mobile-terminal-replay',true,{...terminal,naturalInputOnly:true,replayObserved:true,fishCaptureObserved:run.theme!=='pelican-bike'||score>0});
   }else{check('mobile-save-reload',false,{reason:'Terminal was not observed, so replay/save case remains blocked.'});check('mobile-terminal-replay',false,terminal);}
 }catch(e){errors.push(String(e.message).slice(0,500));}
 const frames=await page.evaluate(()=>window.__mobileFrames||[]).catch(()=>[]);frames.sort((a,b)=>a-b);
 const report={schemaVersion:1,runId,referenceId:run.theme,buildHash:hash,suiteHash:run.browserSuiteHash,scope:'HTTP_BROWSER',defaultSpeed:1,checks,artifacts,errors,actions,
   passed:checks.length===5&&checks.every(c=>c.passed)&&errors.length===0,checkedAt:new Date().toISOString(),human:'NOT_RUN',physicalMobile:'NOT_RUN',liveIAA:'NOT_RUN',publishable:false,
   perceptualGate:'PENDING_SCREENSHOT_REVIEW',performance:{environment:'Desktop Chromium software WebGL + touch emulation, not phone hardware',frameP95Ms:frames[Math.floor(frames.length*.95)]??null,frames:frames.length},
   runtimeProductGate:{entrypoints:['index.html (pinned original Three.js bundle)','main.mjs (owned mobile glue)','engine.mjs (owned lifecycle)','themes.mjs (owned ad lifecycle)','platform.json'],referenceImplementationRetained:true,compatibilityLegacy:'Original game remains the intended runtime; no zero-rewrite claim.',terminalObserved:checks.some(c=>c.name==='mobile-terminal-replay'&&c.passed)}};
 await writeFile(path.join(root,'browser.json'),JSON.stringify(report,null,2)+'\n');
 await browser.close();await new Promise(resolve=>server.close(resolve));return report;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){const r=await browserQa(process.argv[2]);console.log(JSON.stringify(r,null,2));if(!r.passed)process.exitCode=1;}
