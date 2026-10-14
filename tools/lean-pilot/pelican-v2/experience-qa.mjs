/* global process,console,window,document,requestAnimationFrame */
import {webkit,chromium} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {RUN,WORKSPACE,json,sha} from './prepare.mjs';
import {serve} from './serve.mjs';
import {browserOptions,qaDpr} from './browser-options.mjs';
import {swipe,tapVisible} from './touch.mjs';
const engine=process.env.QA_ENGINE??'webkit',build=JSON.parse(await readFile(path.join(RUN,'build-receipt.json'),'utf8'));
const dir=path.join(RUN,'attempts','attempt-'+build.attempt,'experience-'+engine);await mkdir(dir,{recursive:true});
const report={schemaVersion:1,targetGame:'鹈鹕海岸冒险',workspace:WORKSPACE,buildHash:build.buildHash,normalInputOnly:true,stateInjection:false,checks:[],actions:[],screenshots:[],errors:[],passed:false};
const server=await serve(),browser=await(engine==='webkit'?webkit:chromium).launch(browserOptions(engine));
const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:qaDpr(),recordVideo:{dir,size:{width:390,height:844}}}),page=await ctx.newPage();
const snap=()=>page.evaluate(()=>window.__coast.snapshot());
const shot=async name=>{const file=path.join(dir,name+'.png');await page.screenshot({path:file});report.screenshots.push({path:path.relative(RUN,file),sha256:sha(await readFile(file))});};
const check=(name,passed,evidence)=>{report.checks.push({name,passed:passed===true,evidence});console.log(name+' '+passed);};
const tap=async selector=>{const before=await snap();const action={at:new Date().toISOString(),type:'tap',selector,before};report.actions.push(action);if(selector.startsWith('[data-action')&&before.phase!=='running')throw Error('Gameplay stopped: '+before.reason+' at '+before.distance+'m');action.touchPoint=await tapVisible(page,selector);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));const after=await snap();Object.assign(action,{completedAt:new Date().toISOString(),after,events:after.events?.slice(-2)});};
async function gesture(name,from,to,cancel=false){const at=new Date().toISOString(),before=await snap();await swipe(page,engine,from,to,{cancel});if(!cancel)await shot('swipe-'+name);await page.waitForTimeout(330);const after=await snap();report.actions.push({at,completedAt:new Date().toISOString(),type:'swipe',name,from,to,cancel,before,after});return {before,after};}
try{
 page.on('pageerror',e=>report.errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/game/index.html');await page.waitForSelector('#coast[data-loaded="true"]');
 await tap('#co-start');await page.waitForTimeout(2100);const first=await snap();check('first-catch-under-three-seconds',first.count>=1&&first.events.some(e=>e.type==='fish-caught'&&e.first&&e.at<3),first);await shot('first-catch');
 const target=await page.locator('#co-mastery').count();check('mastery-target-visible-before-first-obstacle',target===1&&await page.locator('#co-mastery').isVisible(),{target});
 const a=await gesture('right',[140,420],[250,420]);check('trusted-right-swipe-one-lane',a.after.laneIndex===2,a);
 const b=await gesture('left',[250,420],[140,420]);check('trusted-left-swipe-one-lane',b.before.laneIndex===2&&b.after.laneIndex===1,b);
 const c=await gesture('cancel',[140,420],[250,420],true);check('cancelled-touch-does-not-turn',c.after.laneIndex===c.before.laneIndex,c);
 const d=await gesture('up',[200,480],[200,380]);check('trusted-up-swipe-jumps',d.after.events.filter(e=>e.type==='jump').length>d.before.events.filter(e=>e.type==='jump').length,d);await shot('up-swipe');
 if(report.checks.some(c=>!c.passed))throw Error('Experience regression needs repair');
 let jumped=false,bonusShot=false,choiceShot=false,goldShot=false,leftWarning=false,rightWarning=false;
 const end=Date.now()+65000;
 while(Date.now()<end){
  const v=await page.evaluate(()=>({phase:document.querySelector('#coast').dataset.phase,lane:[...document.querySelectorAll('.co-lane-indicator i')].findIndex(n=>n.classList.contains('on')),lanes:[...document.querySelectorAll('.co-lane')].map(n=>({text:n.textContent,danger:n.classList.contains('danger'),fish:n.classList.contains('fish'),bonus:n.classList.contains('jump-reward'),kind:n.dataset.kind}))}));
  if(v.phase==='finished')break;
  if(!choiceShot&&v.lanes.some(l=>l.bonus)){choiceShot=true;check('jump-gold-route-signalled-with-safe-detour',true,v);await shot('jump-choice');}
  if(!goldShot){const firstGold=(await snap()).events.find(e=>e.type==='fish-caught'&&e.golden&&!e.bonus);if(firstGold){goldShot=true;check('first-gold-before-ten-seconds',firstGold.at<10,firstGold);await shot('first-gold');}}
  const seconds=i=>Number(v.lanes[i].text.match(/(\d+(?:\.\d+)?)s/)?.[1]??99);
  const risky=i=>v.lanes[i].danger&&seconds(i)<=3;
  let want=v.lane;
  if(v.lanes[1].bonus&&(!jumped||!bonusShot)){want=1;if(!jumped&&v.lane===1&&seconds(1)<=1.15){await tap('[data-action="jump"]');await page.locator('[data-action="jump"].queued').waitFor({state:'visible',timeout:1000});const armed=await snap();check('early-jump-buffer-visible',typeof armed.bufferedJump==='string'&&await page.locator('[data-action="jump"].queued').isVisible(),armed);await shot('jump-queued');jumped=true;}}
  else if(risky(want)){const safe=[0,1,2].filter(i=>!risky(i));want=safe.find(i=>v.lanes[i].fish)??safe.sort((a,b)=>Math.abs(a-v.lane)-Math.abs(b-v.lane))[0]??v.lane;}
  else{const fish=v.lanes.findIndex((l,i)=>l.fish&&!risky(i));if(fish>=0)want=fish;}
  if(want!==v.lane&&!risky(v.lane)&&risky(v.lane+Math.sign(want-v.lane)))want=v.lane;
  if(want!==v.lane)await tap(`[data-action="${want<v.lane?'left':'right'}"]`);
  if(!bonusShot&&(await snap()).events.some(e=>e.type==='fish-caught'&&e.bonus&&e.golden)){bonusShot=true;await shot('jump-gold-earned');}
  if(!leftWarning&&v.lanes[2].kind==='pedestrian'&&seconds(2)>=2){leftWarning=true;check('left-pedestrian-warns-right-at-least-two-seconds',true,v);await shot('left-pedestrian-warning');}
  if(!rightWarning&&v.lanes[0].kind==='pedestrian'&&seconds(0)>=2){rightWarning=true;check('right-pedestrian-warns-left-at-least-two-seconds',true,v);await shot('right-pedestrian-warning');}
  await page.waitForTimeout(65);
 }
 await page.locator('#co-modal').waitFor({state:'visible'});const finished=await snap();await shot('earned-three-stars');
 check('natural-jump-gold-advances-mastery',bonusShot&&finished.events.some(e=>e.type==='barrier-cleared'&&e.jumped),finished);
 check('buffered-jump-clears-exact-target',finished.events.some(e=>e.type==='jump'&&e.buffered&&finished.events.some(c=>c.type==='barrier-cleared'&&c.objectId===e.objectId&&c.jumped)),finished);
 check('natural-three-star-settlement',finished.reason==='complete'&&finished.save.stars[0]===3&&(await page.locator('#co-copy').innerText()).includes('★★★'),finished);
 check('both-crossing-directions-observed',leftWarning&&rightWarning,{leftWarning,rightWarning});
 const best=finished.save.best[0];check('real-personal-best-recorded',best.fish===finished.count&&best.gold===finished.gold&&best.jumps===finished.jumpedBarriers&&best.jumps>=1,best);
 await tap('#co-replay');await page.waitForTimeout(1000);
 const safeEnd=Date.now()+50000;
 while(Date.now()<safeEnd){const v=await page.evaluate(()=>({phase:document.querySelector('#coast').dataset.phase,distance:Number(document.querySelector('#co-distance').textContent.match(/^\d+/)?.[0]??0),lane:[...document.querySelectorAll('.co-lane-indicator i')].findIndex(n=>n.classList.contains('on')),lanes:[...document.querySelectorAll('.co-lane')].map(n=>({text:n.textContent,danger:n.classList.contains('danger'),fish:n.classList.contains('fish')}))}));if(v.distance>=238||v.phase==='finished')break;const blocked=i=>v.lanes[i].danger&&Number(v.lanes[i].text.match(/(\d+(?:\.\d+)?)s/)?.[1]??99)<=3;let want=v.lane;if(blocked(want)){const safe=[0,1,2].filter(i=>!blocked(i));want=safe.find(i=>v.lanes[i].fish)??safe.sort((a,b)=>Math.abs(a-v.lane)-Math.abs(b-v.lane))[0]??want;}else{const fish=v.lanes.findIndex((l,i)=>l.fish&&!blocked(i));if(fish>=0)want=fish;}if(want!==v.lane&&!blocked(v.lane)&&blocked(v.lane+Math.sign(want-v.lane)))want=v.lane;if(want!==v.lane)await tap(`[data-action="${want<v.lane?'left':'right'}"]`);await page.waitForTimeout(90);}
const detour=await snap();await shot('safe-detour');
 check('safe-detour-does-not-require-jump',detour.phase==='running'&&!detour.events.some(e=>e.type==='jump')&&detour.events.some(e=>e.type==='barrier-cleared'&&!e.jumped),detour);
 await tap('#co-pause');await tap('#co-select');const selected=await page.locator('[data-level="1"]').innerText();const progress=await page.locator('#co-progress').innerText();check('mastery-saved-and-visible-on-route',selected.includes('★★★')&&selected.includes('纪录 '+best.fish+' 鱼')&&progress.includes('3/15'),{selected,progress,best});await shot('saved-mastery');
 // Start another normal replay to verify that a safe turn cancels an armed jump.
 await tap('[data-level="1"]');await tap('#co-start');await page.locator('[data-action="jump"].ready').waitFor({state:'visible',timeout:25000});await tap('[data-action="jump"]');const queued=await snap();await shot('cancel-jump-queued');await tap('[data-action="right"]');await page.waitForFunction(()=>Number(document.querySelector('#co-distance').textContent.match(/^\d+/)?.[0]??0)>=152,{},{timeout:10000});const cancelled=await snap();check('safe-lane-change-cancels-buffer-without-fake-mastery',typeof queued.bufferedJump==='string'&&cancelled.bufferedJump===null&&cancelled.phase==='running'&&!cancelled.events.some(e=>e.type==='jump')&&cancelled.events.some(e=>e.type==='barrier-cleared'&&e.objectId===queued.bufferedJump&&!e.jumped)&&cancelled.jumpedBarriers===0,{queued,cancelled});await shot('cancel-jump-safe-detour');await tap('#co-pause');await tap('#co-select');
 // Small-phone acceptance: only normal viewport resize and true taps, no state edits.
 await page.setViewportSize({width:320,height:568});await page.waitForTimeout(250);
 const menu=await page.evaluate(()=>{
  const start=document.querySelector('#co-start'),r=start.getBoundingClientRect(),route=document.querySelector('#co-route');
  return {ready:document.querySelector('#coast')?.dataset.phase==='ready',start:{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom},
   routeScrollable:route.scrollHeight>route.clientHeight,documentWidth:document.documentElement.scrollWidth};
 });
 check('small-phone-start-visible-and-menu-not-overflow',menu.ready&&menu.start.x>=0&&menu.start.bottom<=568&&menu.start.height>=36&&menu.documentWidth<=320,menu);
 await shot('small-phone-route-menu');
 await tap('#co-start');await page.waitForTimeout(450);
 const small=await page.evaluate(()=>{
  const toBox=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const buttons=[...document.querySelectorAll('#co-controls button')].map(toBox);
  const mastery=document.querySelector('#co-mastery');
  const bar=toBox(mastery),font=parseFloat(window.getComputedStyle(mastery).fontSize);
  return {running:document.querySelector('#coast')?.dataset.phase==='running',buttons,bar,font,
   controlTop:Math.min(...buttons.map(b=>b.y)),bodyWidth:document.documentElement.scrollWidth,
   canvas:toBox(document.querySelector('canvas'))};
 });
 check('small-phone-touch-buttons-and-mastery-readable',
  small.running&&small.buttons.length===3&&small.buttons.every(b=>b.width>=54&&b.height>=44&&b.x>=0&&b.right<=320&&b.bottom<=568)&&
  small.font>=12&&small.bar.right<=320&&small.bar.bottom<small.controlTop&&small.bodyWidth<=320,small);
 await shot('small-phone-running');
}catch(e){report.errors.push(e.stack);await shot('failure').catch(()=>{});}
finally{const video=await page.video().path();await ctx.close();report.video={path:path.relative(RUN,video),sha256:sha(await readFile(video))};await browser.close();server.close();report.passed=report.checks.every(c=>c.passed)&&report.errors.length===0;await json(path.join(dir,'report.json'),report);if(!report.passed)process.exitCode=1;}
