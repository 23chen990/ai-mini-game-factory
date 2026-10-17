/* global process,console,window,document,requestAnimationFrame,performance */
import {chromium,webkit} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {URL} from 'node:url';
import {z} from 'zod';
import {RUN,WORKSPACE,json,sha} from './prepare.mjs';
import {serve} from './serve.mjs';
import {browserOptions,qaDpr} from './browser-options.mjs';
import {tapVisible} from './touch.mjs';
import {softwareQualityActions,experienceMotionPreference} from './experience-policy.mjs';
import {readCompactPresentation,portraitMasteryClear} from './qa-presentation.mjs';
const engine=process.env.QA_ENGINE??'chromium',build=JSON.parse(await readFile(path.join(RUN,'build-receipt.json'),'utf8'));
const dir=path.join(RUN,'attempts',`attempt-${build.attempt}`,'v4-boundaries-'+engine);await mkdir(dir,{recursive:true});
const server=await serve(),browser=await(engine==='chromium'?chromium:webkit).launch(browserOptions(engine));
const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:qaDpr(),reducedMotion:experienceMotionPreference(process.env.QA_TOUCH_MOTION),recordVideo:{dir,size:{width:390,height:844}}}),page=await ctx.newPage();
const report={targetGame:'鹈鹕海岸冒险',workspace:WORKSPACE,engine,buildHash:build.buildHash,attempt:build.attempt,driverSha256:sha(await readFile(new URL(import.meta.url))),normalInputOnly:true,stateInjection:false,liveAds:'NOT_INTEGRATED',humanFun:'NOT_RUN',checks:[],actions:[],screenshots:[],errors:[],passed:false};
const snap=()=>page.evaluate(()=>window.__coast.snapshot());
const check=(name,passed,evidence)=>{report.checks.push({name,passed:passed===true,evidence});console.log(JSON.stringify({name,passed:passed===true}));if(!passed)throw Error(name);};
const shot=async name=>{const file=path.join(dir,name+'.png');await page.screenshot({path:file});report.screenshots.push({name,path:path.relative(RUN,file),sha256:sha(await readFile(file))});};
const tap=async selector=>{const before=await snap(),point=await tapVisible(page,selector);report.actions.push({selector,point,before,at:new Date().toISOString()});};
const distance=async n=>{await page.waitForFunction(target=>document.querySelector('#coast').dataset.phase==='finished'||Number(document.querySelector('#co-distance').textContent.match(/^\d+/)?.[0])>=target,n,{timeout:45000});const r=await snap();if(r.phase!=='running')throw Error('Unexpected death before '+n+': '+r.reason);
 if(r.distance<n-1)throw Error('Visible HUD distance claimed '+n+'m while actual run is only '+r.distance.toFixed(2)+'m');};
try{
 page.on('pageerror',e=>report.errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/game/index.html');await page.waitForSelector('#coast[data-loaded="true"]');
 await page.evaluate(()=>{window.__v4Frames=[];const observe=()=>{const root=document.querySelector('#coast');if(root&&window.__v4Frames.length<12000)window.__v4Frames.push({at:performance.now(),phase:root.dataset.phase,beat:root.dataset.beat,label:document.querySelector('#co-distance-box span')?.textContent,crash:root.classList.contains('crashing')});requestAnimationFrame(observe);};observe();});
 for(const selector of softwareQualityActions(process.env.QA_TOUCH_QUALITY))await tap(selector);
 check('fresh-save-level-one-only',(await snap()).save.unlocked===1&&await page.locator('[data-level="2"]').isDisabled(),await snap());
 await tap('#co-start');await page.waitForFunction(()=>Number(document.querySelector('#co-fish').textContent.match(/^\d+/)?.[0])>=1,null,{timeout:15000});
 let r=await snap();check('first-fish-is-real-under-three-seconds',r.events.some(e=>e.type==='fish-caught'&&e.first&&e.at<3),r);
 const beat=await page.locator('#coast').getAttribute('data-beat');check('first-teaching-has-visible-beat',beat==='teaching',{beat,label:await page.locator('#co-distance-box span').innerText()});await shot('first-teaching');
 check('portrait-mastery-clear-of-bicycle',portraitMasteryClear(await page.evaluate(readCompactPresentation)),await page.evaluate(readCompactPresentation));
 await tap('[data-action="right"]');await distance(37);r=await snap();check('first-offcentre-fish-requires-real-steering',r.events.some(e=>e.type==='fish-caught'&&e.objectId==='l1-f1')&&r.events.some(e=>e.type==='steer-input'),r);
 await tap('#co-pause');const frozen=await snap();await page.waitForTimeout(500);check('pause-freezes-game-clock',JSON.stringify(await snap())===JSON.stringify(frozen),frozen);
 for(const viewport of [{width:360,height:740},{width:844,height:390}]){
  await page.setViewportSize(viewport);await tap('#co-resume');await page.waitForTimeout(180);
  const geometry=await page.locator('#co-controls').evaluate(n=>[...n.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};}));
  check('controls-fit-'+viewport.width,geometry.every(g=>g.width>=44&&g.height>=44&&g.x>=0&&g.y>=0&&g.right<=viewport.width&&g.bottom<=viewport.height),geometry);await shot('viewport-'+viewport.width);await tap('#co-pause');
 }
 await page.setViewportSize({width:390,height:844});await tap('#co-replay');
 await page.waitForSelector('#coast[data-phase="finished"]',{timeout:40000});await page.locator('#co-modal').waitFor({state:'visible'});
 r=await snap();check('actual-barrier-death-settles-once-without-ad',r.reason==='barrier'&&r.events.some(e=>e.type==='failed'&&e.objectId==='l1-o1')&&r.settled===true&&r.reward?.settled===true&&r.reward.rounds===1&&r.reward.bank===r.rewardScore,r);await shot('barrier-death-revive-unavailable');
 check('revive-visible-disabled-free-replay-enabled',await page.locator('#co-revive').isVisible()&&await page.locator('#co-revive').isDisabled()&&await page.locator('#co-replay').isEnabled(),{text:await page.locator('#co-revive').innerText()});
 const beforeDisabled=r,box=await page.locator('#co-revive').boundingBox();await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);await page.waitForTimeout(300);r=await snap();
 check('disabled-revive-cannot-fake-ad-or-change-reward',r.revives===0&&r.phase==='finished'&&r.reward.bank===beforeDisabled.reward.bank&&r.reward.rounds===beforeDisabled.reward.rounds,r);
 await tap('#co-replay');r=await snap();check('free-replay-keeps-accounting-with-new-run',r.phase==='running'&&r.revives===0&&r.reward.bank===beforeDisabled.reward.bank&&r.reward.rounds===1,r);
 const replayHud=await page.locator('#co-distance').innerText();
 check('fresh-replay-hud-resets-before-any-new-input',r.distance<3&&Number(replayHud.match(/^\\d+/u)?.[0])===Math.floor(r.distance),
  {realDistance:r.distance,visibleDistance:replayHud,previousFailureDistance:beforeDisabled.distance});
 // Exact new V4 centre vehicle. A legitimate detour avoids the preceding
 // barrier; no teleport, save injection, debug control or internal event.
 await distance(115);await tap('[data-action="left"]');await distance(145);await tap('[data-action="right"]');
 await page.waitForSelector('#coast[data-phase="finished"]',{timeout:15000});await page.locator('#co-modal').waitFor({state:'visible'});r=await snap();
 check('actual-new-vehicle-death-settles-once',r.reason==='vehicle'&&r.events.some(e=>e.type==='failed'&&e.objectId==='l1-o6')&&r.settled&&r.reward.settled&&r.reward.rounds===2&&r.reward.bank===beforeDisabled.reward.bank+r.rewardScore,r);await shot('new-v4-vehicle-death');
 const bank=r.reward.bank;await tap('#co-select');await page.reload();await page.waitForSelector('#coast[data-loaded="true"]');await tap('#co-start');r=await snap();
 check('route-refresh-retains-exact-earned-accounting',r.reward.rounds===2&&r.reward.bank===bank&&r.save.unlocked===1&&r.save.completed.every(v=>!v),r);await shot('free-restart-after-refresh');
 report.frames=await page.evaluate(()=>window.__v4Frames??[]);
}catch(error){report.errors.push(error.stack);report.failureSnapshot=await snap().catch(()=>null);await shot('failure').catch(()=>{});}
finally{await ctx.close();await browser.close();await new Promise(resolve=>server.close(resolve));report.passed=report.errors.length===0&&report.checks.every(c=>c.passed);report.finishedAt=new Date().toISOString();
 const schema=z.object({targetGame:z.literal('鹈鹕海岸冒险'),workspace:z.string(),buildHash:z.string().regex(/^[a-f0-9]{64}$/u),normalInputOnly:z.literal(true),stateInjection:z.literal(false),checks:z.array(z.object({name:z.string(),passed:z.boolean()}).passthrough()),errors:z.array(z.string()),passed:z.boolean()}).passthrough();
 await json(path.join(dir,'report.json'),schema.parse(report));console.log('V4_BOUNDARIES passed='+report.passed);if(!report.passed)process.exitCode=1;}
