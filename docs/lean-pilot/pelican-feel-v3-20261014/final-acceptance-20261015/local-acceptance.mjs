/* global process, console, window, document, navigator, localStorage, requestAnimationFrame */
// Acceptance-only observer/driver. It never changes game state or the shipped H5.
import {chromium, webkit} from '@playwright/test';
import {z} from 'zod';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath, URL} from 'node:url';
import {browserOptions} from '../../../../tools/lean-pilot/pelican-v2/browser-options.mjs';
import {swipe, tapVisible, touchSession} from '../../../../tools/lean-pilot/pelican-v2/touch.mjs';
import {readCompactPresentation, compactPresentationPassed, readRoutePresentation, routePresentationPassed} from '../../../../tools/lean-pilot/pelican-v2/qa-presentation.mjs';

const repo=fileURLToPath(new URL('../../../../',import.meta.url));
const base=process.env.PELICAN_TEST_URL??'http://127.0.0.1:4328/game/index.html';
const engine=process.env.QA_ENGINE??'chromium';
const docs=path.dirname(fileURLToPath(import.meta.url));
const run=path.join(repo,'runs/pelican-coast-v2-20261014');
const dir=path.join(run,'final-acceptance-20261015',engine+(process.env.QA_ACCEPTANCE_LABEL?'-'+process.env.QA_ACCEPTANCE_LABEL:''));await mkdir(dir,{recursive:true});
await writeFile(path.join(dir,'driver-source.mjs'),await readFile(fileURLToPath(import.meta.url)));
const sha=b=>createHash('sha256').update(b).digest('hex');
const identity=JSON.parse(await readFile(path.join(docs,'artifact-import.json'),'utf8'));
const report={schemaVersion:1,targetGame:'鹈鹕海岸冒险',workspace:path.join(run,'workspace'),buildHash:identity.htmlSha256,sourceCommit:identity.sourceCommit,engine,scope:'DESKTOP_BROWSER_MOBILE_VIEWPORT_ONLY',physicalDevice:'NOT_RUN',humanPlaytest:'NOT_RUN',normalInputOnly:true,stateInjection:false,startedAt:new Date().toISOString(),checks:[],actions:[],screenshots:[],errors:[],console:[],requests:[],responses:[],expectedFaults:[]};
const check=(name,pass,evidence)=>{report.checks.push({name,status:pass?'PASS':'FAIL',evidence});console.log(JSON.stringify({name,status:pass?'PASS':'FAIL'}));};
const browser=await(engine==='webkit'?webkit:chromium).launch({...browserOptions(engine),...(engine==='chromium'?{channel:'chrome'}:{})});
report.browserVersion=browser.version();
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true,isMobile:true,recordVideo:{dir,size:{width:390,height:844}}});
const page=await context.newPage();let expectedNetworkFailure=false,expectedContextLoss=false;
page.on('pageerror',e=>report.errors.push(e.message));
page.on('console',m=>report.console.push({type:m.type(),text:m.text(),expectedFault:expectedNetworkFailure||expectedContextLoss}));
page.on('request',r=>report.requests.push({url:r.url(),type:r.resourceType()}));
page.on('requestfailed',r=>{const v={url:r.url(),error:r.failure()?.errorText};(expectedNetworkFailure?report.expectedFaults:report.errors).push(v);});
page.on('response',r=>report.responses.push({url:r.url(),status:r.status()}));
await page.addInitScript(()=>{
 window.__acceptance={frames:[],touches:[],lifecycle:[],gpu:[]};let last;
 const frame=t=>{const phase=document.querySelector('#coast')?.dataset.phase;if(last&&phase==='running')window.__acceptance.frames.push(t-last);last=t;requestAnimationFrame(frame);};requestAnimationFrame(frame);
 for(const type of ['pointerdown','pointerup','pointercancel','touchcancel'])document.addEventListener(type,e=>window.__acceptance.touches.push({type,trusted:e.isTrusted,pointerType:e.pointerType??null,action:e.target.closest?.('[data-action]')?.dataset.action??null}),true);
 for(const type of ['blur','focus','pagehide'])window.addEventListener(type,()=>window.__acceptance.lifecycle.push({type,hidden:document.hidden}));
 document.addEventListener('visibilitychange',()=>window.__acceptance.lifecycle.push({type:'visibilitychange',hidden:document.hidden}));
 for(const type of ['webglcontextlost','webglcontextrestored'])document.addEventListener(type,e=>window.__acceptance.gpu.push({type,trusted:e.isTrusted}),true);
});
const snap=()=>page.evaluate(()=>window.__coast.snapshot());
const shot=async name=>{const file=path.join(dir,name+'.png');await page.screenshot({path:file});report.screenshots.push({name,path:path.relative(repo,file),sha256:sha(await readFile(file))});};
const tap=async selector=>{const before=await snap();const point=await tapVisible(page,selector);report.actions.push({at:new Date().toISOString(),type:'tap',selector,point,before,after:await snap()});};
const replay=async()=>{if((await snap()).phase==='running')await tap('#co-pause');await tap('#co-replay');};
const view=()=>page.evaluate(()=>({phase:document.querySelector('#coast').dataset.phase,lane:[...document.querySelectorAll('.co-lane-indicator i')].findIndex(n=>n.classList.contains('on')),lanes:[...document.querySelectorAll('.co-lane')].map(n=>({text:n.textContent,danger:n.classList.contains('danger'),fish:n.classList.contains('fish'),bonus:n.classList.contains('jump-reward')}))}));
try{
 const started=Date.now();await page.goto(base);await page.waitForSelector('#coast[data-loaded="true"]',{timeout:45000});
 report.startupMs=Date.now()-started;report.userAgent=await page.evaluate(()=>navigator.userAgent);
 const response=await context.request.get(base);check('served-bytes-match-ci-package',sha(await response.body())===identity.htmlSha256,{url:base,htmlSha256:sha(await response.body())});
 const fresh=await snap();check('zero-save-ready-and-four-locked-levels',fresh.phase==='ready'&&fresh.save.unlocked===1&&await page.locator('[data-level]:disabled').count()===4,{fresh,localStorageKeys:await page.evaluate(()=>Object.keys(localStorage))});await shot('01-menu');
 await tap('#co-start');await page.waitForFunction(()=>window.__coast.snapshot().count>=1,null,{timeout:15000});
 const first=await snap();check('first-natural-fish',first.events.some(e=>e.type==='fish-caught'&&e.first&&e.at<3),first);
 await tap('[data-action="right"]');await page.waitForFunction(()=>window.__coast.snapshot().distance>=37,null,{timeout:15000});
 const fish=await snap();check('real-fractional-second-fish-and-streak',fish.events.some(e=>e.type==='fish-caught'&&e.objectId==='l1-f1')&&fish.bestStreak>=2&&fish.lane>.6&&fish.lane<1.4,fish);await shot('02-first-fish');
 await replay();const session=await touchSession(page,engine);
 const hold=async(action,ms)=>{const box=await page.locator(`[data-action="${action}"]`).boundingBox(),p={x:box.x+box.width/2,y:box.y+box.height/2,id:1},before=await snap();await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await page.waitForTimeout(ms);await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:engine==='webkit'?[p]:[]});const after=await snap();report.actions.push({type:'trusted-touch-hold',action,ms,before,after});return {before,after};};
 const right=await hold('right',420),left=await hold('left',350);check('held-steering-and-quick-reversal',right.after.laneTarget>right.before.laneTarget+.6&&left.after.laneTarget<left.before.laneTarget-.6,{right,left});
 await replay();const beforeDrag=await snap();await swipe(page,engine,[140,420],[171,420]);await page.waitForTimeout(250);const drag=await snap();check('free-drag-does-not-snap-to-painted-lanes',drag.laneTarget>beforeDrag.laneTarget+.3&&drag.laneTarget<beforeDrag.laneTarget+.8&&Math.abs(drag.lane-drag.laneTarget)<.15,{beforeDrag,drag});
 const beforeCancel=await snap();await swipe(page,engine,[140,420],[250,420],{cancel:true});await page.waitForTimeout(220);const cancelled=await snap();check('native-touch-cancel-restores-intended-position',Math.abs(cancelled.laneTarget-beforeCancel.laneTarget)<.01,{beforeCancel,cancelled});
 await replay();await swipe(page,engine,[200,480],[200,380]);await tap('[data-action="right"]');const combined=await snap();check('up-swipe-jump-combines-with-steering',combined.events.some(e=>e.type==='jump')&&combined.laneTarget>0,{combined});await shot('03-jump-and-steer');
 await tap('#co-pause');const paused=await snap();await page.waitForTimeout(650);const still=await snap();check('pause-freezes-distance-and-clock',paused.phase==='paused'&&still.distance===paused.distance&&still.elapsed===paused.elapsed,{paused,still});await tap('#co-resume');await page.waitForTimeout(220);check('manual-resume', (await snap()).distance>still.distance,await snap());
 // Ordinary new replay and visible-radar decisions; no level/save injection.
 await replay();let jumped=false,prizeCaught=false;const frameStart=await page.evaluate(()=>window.__acceptance.frames.length);const end=Date.now()+85000;
 while(Date.now()<end){const v=await view();if(v.phase==='finished')break;if(v.phase==='paused'){await tap('#co-resume');continue;}
  const seconds=i=>Number(v.lanes[i].text.match(/(\d+(?:\.\d+)?)s/)?.[1]??99),risky=i=>v.lanes[i].danger&&seconds(i)<=3;let want=v.lane;
  if(jumped&&!prizeCaught){const observed=await snap();prizeCaught=observed.events.some(e=>e.type==='fish-caught'&&e.objectId==='l1-jump-l1-o1');want=1;}
  else if(v.lanes[1].bonus&&!jumped){want=1;if(v.lane===1&&seconds(1)<=1.4){await tap('[data-action="jump"]');jumped=true;}}
  else if(risky(want)){const safe=[0,1,2].filter(i=>!risky(i));want=safe.find(i=>v.lanes[i].fish)??safe.sort((a,b)=>Math.abs(a-v.lane)-Math.abs(b-v.lane))[0]??v.lane;}
  else{const fishIndex=v.lanes.findIndex((l,i)=>l.fish&&!risky(i));if(fishIndex>=0)want=fishIndex;}
  if(want!==v.lane&&!risky(v.lane)&&risky(v.lane+Math.sign(want-v.lane)))want=v.lane;
  if(want!==v.lane)await tap(`[data-action="${want<v.lane?'left':'right'}"]`);await page.waitForTimeout(65);
 }
 await page.locator('#co-modal').waitFor({state:'visible',timeout:5000});const settled=await snap();report.firstLevelSettlement=settled;await shot('04-natural-settlement');
 const campaignFrames=await page.evaluate(n=>window.__acceptance.frames.slice(n),frameStart),campaignSorted=campaignFrames.filter(n=>n>0).sort((a,b)=>a-b);
 report.performance={scope:'Mac native GPU, uninterrupted natural level-one ride, balanced graphics, DPR3 viewport; automation/video overhead; excludes GPU fault tests and other levels',frameCount:campaignSorted.length,p50FrameMs:campaignSorted[Math.ceil(campaignSorted.length*.5)-1],p95FrameMs:campaignSorted[Math.ceil(campaignSorted.length*.95)-1],meanFps:1000/(campaignSorted.reduce((a,b)=>a+b,0)/campaignSorted.length),over50ms:campaignSorted.filter(x=>x>50).length,maxFrameMs:campaignSorted.at(-1),render:await page.evaluate(()=>window.__coast.renderInfo())};
 check('natural-level-one-settlement-and-unlock',settled.phase==='finished'&&settled.reason==='complete'&&settled.save.unlocked===2,settled);
 check('three-stars-earned-by-real-jump-and-catches',settled.save.stars[0]===3&&settled.jumpedBarriers>=1&&settled.bestStreak>=4,settled);
 await tap('#co-ad');check('ads-explicitly-unintegrated-and-no-fake-reward',(await page.locator('#co-notice').innerText()).includes('尚未接入'),{notice:await page.locator('#co-notice').innerText()});
 await tap('#co-next');await page.waitForTimeout(500);check('continue-enters-unlocked-level-two',(await snap()).level===2&&(await snap()).phase==='running',await snap());await shot('05-level-two');
 await tap('#co-pause');await page.reload();await page.waitForSelector('#coast[data-loaded="true"]');const refreshed=await snap();check('refresh-retains-earned-save',refreshed.save.unlocked===2&&refreshed.save.stars[0]===settled.save.stars[0],refreshed);
 await tap('[data-level="1"]');await tap('#co-start');
 await page.waitForFunction(()=>window.__coast.snapshot().phase==='finished',null,{timeout:30000});await page.locator('#co-modal').waitFor({state:'visible'});const failed=await snap(),cause=await page.locator('#co-copy').innerText();check('natural-barrier-failure-and-actionable-cause',failed.reason==='barrier'&&cause.includes('跳'),{failed,cause});await shot('06-real-failure');
 await tap('#co-replay');await page.waitForTimeout(300);check('visible-replay-after-failure',(await snap()).phase==='running',await snap());
 await tap('#co-pause');await page.setViewportSize({width:844,height:390});await tap('#co-resume');await page.waitForTimeout(250);const landscape=await page.evaluate(()=>window.__coast.renderInfo());check('live-landscape-canvas-and-composer',landscape.canvas[0]>landscape.canvas[1]&&landscape.canvas.every((n,i)=>n===Math.floor(landscape.composer[i])),landscape);await shot('07-landscape');
 await tap('#co-pause');await tap('#co-select');await page.setViewportSize({width:320,height:568});await page.waitForTimeout(250);const route=await page.evaluate(readRoutePresentation);check('small-phone-menu-layout',routePresentationPassed(route),route);await shot('08-small-menu');
 await tap('#co-start');await page.waitForTimeout(250);const compact=await page.evaluate(readCompactPresentation);check('small-phone-controls-and-goals-readable',compactPresentationPassed(compact),compact);await shot('09-small-running');
 await tap('#co-pause');await page.setViewportSize({width:390,height:844});await tap('#co-resume');await page.waitForTimeout(200);
 // GPU fault injection is explicitly engineering evidence, separate from normal play.
 expectedContextLoss=true;const extension=await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2');window.__acceptanceLose=gl?.getExtension('WEBGL_lose_context');window.__acceptanceLose?.loseContext();return !!window.__acceptanceLose;});
 await page.waitForTimeout(350);const lost=await snap();check('engineering-webgl-context-loss-pauses',extension&&lost.phase==='paused'&&lost.pausedBySystem,{classification:'GPU_FAULT_INJECTION_ONLY',lost});
 await page.evaluate(()=>window.__acceptanceLose?.restoreContext());await page.waitForTimeout(800);await tap('#co-resume');await page.waitForTimeout(300);const restored=await snap();check('engineering-webgl-restored-and-resumable',restored.phase==='running'&&restored.distance>lost.distance,{classification:'GPU_FAULT_INJECTION_ONLY',restored});await shot('10-context-restored');expectedContextLoss=false;
 // Disconnect AFTER startup. This does not claim offline navigation/reload support.
 await context.setOffline(true);const offlineBefore=await snap();await page.waitForTimeout(700);const offlineAfter=await snap();check('loaded-game-continues-without-network',offlineAfter.phase==='running'&&offlineAfter.distance>offlineBefore.distance,{offlineBefore,offlineAfter});await context.setOffline(false);await tap('#co-pause');
 const frames=await page.evaluate(()=>window.__acceptance.frames),sorted=frames.filter(n=>n>0).sort((a,b)=>a-b),percentile=p=>sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)];
 report.engineeringIntervals={scope:'Only intervals since the last page refresh, including intentional GPU faults; excluded from gameplay performance',frameCount:sorted.length,p50FrameMs:percentile(.5),p95FrameMs:percentile(.95),maxFrameMs:sorted.at(-1)};
 report.observation=await page.evaluate(()=>window.__acceptance);
 check('all-gameplay-pointer-input-is-trusted-touch',report.observation.touches.filter(e=>e.type==='pointerdown'&&e.action).every(e=>e.trusted&&e.pointerType==='touch'),{sampleCount:report.observation.touches.length});
 check('no-external-threejs-or-asset-requests',report.requests.filter(r=>/^https?:/.test(r.url)).every(r=>new URL(r.url).origin===new URL(base).origin),report.requests);
 check('no-runtime-page-errors',report.errors.length===0,report.errors);
 report.networkNote='The transferred standalone HTML embeds Three.js, textures and synthesized audio; first navigation still needs HTTP. Cached/offline reload is not promised.';
}catch(e){report.errors.push(e.stack??String(e));await shot('failure').catch(()=>{});}
finally{
 const video=await page.video().path();await context.close();report.video={path:path.relative(repo,video),sha256:sha(await readFile(video))};await browser.close();
 report.finishedAt=new Date().toISOString();report.passed=report.errors.length===0&&report.checks.every(c=>c.status==='PASS');
 const schema=z.object({schemaVersion:z.literal(1),targetGame:z.literal('鹈鹕海岸冒险'),workspace:z.string().endsWith('/runs/pelican-coast-v2-20261014/workspace'),buildHash:z.string().regex(/^[a-f0-9]{64}$/),sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),scope:z.literal('DESKTOP_BROWSER_MOBILE_VIEWPORT_ONLY'),physicalDevice:z.literal('NOT_RUN'),humanPlaytest:z.literal('NOT_RUN'),normalInputOnly:z.literal(true),stateInjection:z.literal(false),checks:z.array(z.object({name:z.string(),status:z.enum(['PASS','FAIL']),evidence:z.unknown()})),passed:z.boolean()}).passthrough();
 await writeFile(path.join(dir,'report.json'),JSON.stringify(schema.parse(report),null,2)+'\n');
 console.log(JSON.stringify({engine,passed:report.passed,checks:report.checks.length,failures:report.checks.filter(c=>c.status==='FAIL').map(c=>c.name),errors:report.errors,performance:report.performance}));if(!report.passed)process.exitCode=1;
}
