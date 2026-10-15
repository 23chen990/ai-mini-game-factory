/* global process,console,window,document,requestAnimationFrame,performance */
import {webkit,chromium} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {URL} from 'node:url';
import path from 'node:path';
import {RUN,WORKSPACE,json,sha} from './prepare.mjs';
import {serve} from './serve.mjs';
import {browserOptions,qaDpr} from './browser-options.mjs';
import {swipe,tapVisible,touchSession} from './touch.mjs';
import {queueTapSequence} from './touch-sequence.mjs';
import {observePreparedJump,preparedJumpSeen} from './queued-cue-observation.mjs';
import {readCompactPresentation,compactPresentationPassed,readRoutePresentation,routePresentationPassed} from './qa-presentation.mjs';
import {earnedJumpRewardVisible,softwareQualityActions,experienceReportDirectory,experienceMotionPreference,earnedPrizeRouteSeen,pedestrianWarningSeen,cancelledDragPassed} from './experience-policy.mjs';
const engine=process.env.QA_ENGINE??'webkit',build=JSON.parse(await readFile(path.join(RUN,'build-receipt.json'),'utf8'));
const dir=path.join(RUN,'attempts','attempt-'+build.attempt,experienceReportDirectory(engine,process.env.QA_EXPERIENCE_LABEL));await mkdir(dir,{recursive:true});
const driver=await readFile(new URL(import.meta.url));await writeFile(path.join(dir,'driver-source.mjs'),driver);
const report={driverSha256:sha(driver),schemaVersion:1,targetGame:'鹈鹕海岸冒险',workspace:WORKSPACE,buildHash:build.buildHash,normalInputOnly:true,stateInjection:false,checks:[],actions:[],screenshots:[],errors:[],passed:false};
const server=await serve(),browser=await(engine==='webkit'?webkit:chromium).launch(browserOptions(engine));
const reducedMotion=experienceMotionPreference(process.env.QA_TOUCH_MOTION);
const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion,deviceScaleFactor:qaDpr(),recordVideo:{dir,size:{width:390,height:844}}}),page=await ctx.newPage();
const snap=()=>page.evaluate(()=>window.__coast.snapshot());
const shot=async name=>{const file=path.join(dir,name+'.png');await page.screenshot({path:file});report.screenshots.push({path:path.relative(RUN,file),sha256:sha(await readFile(file))});};
const check=(name,passed,evidence)=>{report.checks.push({name,passed:passed===true,evidence});console.log(name+' '+passed);};
const tap=async selector=>{const before=await snap();const action={at:new Date().toISOString(),type:'tap',selector,before};report.actions.push(action);if(selector.startsWith('[data-action')&&before.phase!=='running')throw Error('Gameplay stopped: '+before.reason+' at '+before.distance+'m');action.touchPoint=await tapVisible(page,selector);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));const after=await snap();Object.assign(action,{completedAt:new Date().toISOString(),after,events:after.events?.slice(-2)});};
async function gesture(name,from,to,cancel=false){const at=new Date().toISOString(),before=await snap();await swipe(page,engine,from,to,{cancel});if(!cancel)await shot('swipe-'+name);await page.waitForTimeout(330);const after=await snap();report.actions.push({at,completedAt:new Date().toISOString(),type:'swipe',name,from,to,cancel,before,after});return {before,after};}
try{
 page.on('pageerror',e=>report.errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/game/index.html');await page.waitForSelector('#coast[data-loaded="true"]');
 await page.evaluate(observePreparedJump);
 for(const selector of softwareQualityActions(process.env.QA_TOUCH_QUALITY))await tap(selector);
 report.graphicsProfile={requested:process.env.QA_TOUCH_QUALITY??'default',menuLabel:await page.locator('#co-quality').innerText(),render:await page.evaluate(()=>window.__coast.renderInfo().quality),motionPreference:reducedMotion,mediaReducedMotion:await page.evaluate(()=>window.matchMedia('(prefers-reduced-motion:reduce)').matches)};
 if(report.graphicsProfile.mediaReducedMotion!==(reducedMotion==='reduce'))throw Error('Actual browser motion preference did not apply');
 const firstStarted=Date.now();await tap('#co-start');await page.waitForFunction(()=>Number(document.querySelector('#co-fish')?.textContent.match(/^\d+/)?.[0]??0)>0,null,{timeout:20000});const first=await snap();report.firstCatchRunnerWallMs=Date.now()-firstStarted;check('first-catch-under-three-seconds',first.count>=1&&first.events.some(e=>e.type==='fish-caught'&&e.first&&e.at<3),first);
 // Test the real post-first-fish choice before the runner passes 31 metres.
 // Capture after the trusted right tap so a slow software screenshot cannot
 // miss the pickup by consuming the small 15m -> 31m reaction window.
 const beforeSecond=await snap();
 await tap('[data-action="right"]');
 await shot('first-catch');
 await page.waitForFunction(()=>window.__coast.snapshot().distance>=37,null,{timeout:30000});
 const second=await snap();
 const secondSteer=second.events.find(e=>e.type==='steer-input'&&e.source==='tap'&&e.target>.8&&e.target<1.4);
 const secondCatch=second.events.find(e=>e.type==='fish-caught'&&e.objectId==='l1-f1');
 check('real-right-tap-earns-offcentre-second-fish',
  beforeSecond.count>=1&&!!secondSteer&&!!secondCatch&&second.count>beforeSecond.count&&
  second.phase==='running'&&second.lane>.6&&second.lane<1.4,
  {before:beforeSecond,after:second,secondSteer,secondCatch});
 const streakHud=await page.locator('[data-goal="streak"]').innerText();
 check('visible-earned-streak-progress',
  second.bestStreak>=2&&streakHud.includes('⚡')&&
  Number(streakHud.match(/[0-9]+/u)?.[0])===second.bestStreak,
  {streakHud,earned:second.bestStreak,events:second.events.filter(e=>e.type==='fish-caught')});
 await shot('actual-offcentre-second-fish-caught');
 const target=await page.locator('#co-mastery').count();check('mastery-target-visible-before-first-obstacle',target===1&&await page.locator('#co-mastery').isVisible(),{target});
 if(report.checks.some(c=>!c.passed))throw Error('Experience regression needs repair');
 let jumped=false,prizeFeedbackSeen=false,bonusShot=false,choiceShot=false,goldShot=false,leftWarning=false,rightWarning=false,earnedPrizeCue=false,jumpProgressBefore={gold:Infinity,jumps:Infinity};
 const end=Date.now()+65000;
 while(Date.now()<end){
  const v=await page.evaluate(()=>({phase:document.querySelector('#coast').dataset.phase,lane:[...document.querySelectorAll('.co-lane-indicator i')].findIndex(n=>n.classList.contains('on')),lanes:[...document.querySelectorAll('.co-lane')].map(n=>({text:n.textContent,danger:n.classList.contains('danger'),fish:n.classList.contains('fish'),bonus:n.classList.contains('jump-reward'),kind:n.dataset.kind})),feedback:document.querySelector('#co-feedback strong')?.textContent??'',gold:Number(document.querySelector('[data-goal="gold"]')?.textContent.match(/\d+/u)?.[0]??NaN),jumps:Number(document.querySelector('[data-goal="jump"]')?.textContent.match(/\d+/u)?.[0]??NaN)}));
  if(v.phase==='finished')break;
  if(!choiceShot&&v.lanes.some(l=>l.bonus)){choiceShot=true;check('jump-gold-route-signalled-with-safe-detour',true,v);await shot('jump-choice');}
  if(!goldShot){const firstGold=(await snap()).events.find(e=>e.type==='fish-caught'&&e.golden&&!e.bonus);if(firstGold){goldShot=true;check('first-gold-before-ten-seconds',firstGold.at<10,firstGold);await shot('first-gold');}}
  const seconds=i=>Number(v.lanes[i].text.match(/(\d+(?:\.\d+)?)s/)?.[1]??99);
  const risky=i=>v.lanes[i].danger&&seconds(i)<=3;
  let want=v.lane;
  prizeFeedbackSeen ||= earnedJumpRewardVisible(v,jumpProgressBefore);
  if(jumped&&!prizeFeedbackSeen&&!earnedPrizeCue&&v.lanes[1].kind==='fish'&&v.lanes[1].text.includes('🌟')){
   const observed=await snap();
   if(observed.events.some(e=>e.type==='barrier-cleared'&&e.objectId==='l1-o1'&&e.jumped)&&!observed.events.some(e=>e.type==='fish-caught'&&e.objectId==='l1-jump-l1-o1')){
    earnedPrizeCue=true;await shot('earned-jump-prize-cue');
   }
  }
  if(jumped&&!prizeFeedbackSeen){want=1;}
  else if(v.lanes[1].bonus&&!jumped){want=1;if(!jumped&&v.lane===1&&seconds(1)<=1.4){jumpProgressBefore={gold:v.gold,jumps:v.jumps};await tap('[data-action="jump"]');await page.waitForFunction(()=>window.__qaPreparedJumpFrames.some(f=>f.queued&&f.buttonVisible&&f.feedbackVisible&&f.bufferedJump==='l1-o1'&&f.feedback.includes('已准备')),null,{timeout:1800}).catch(()=>{});const prepared=await page.evaluate(()=>window.__qaObservePreparedJump()),armed=await snap();check('early-jump-buffer-visible',preparedJumpSeen(prepared,'l1-o1'),{armed,prepared,note:'Observe the actual CSS fade-in while the exact jump is queued (max1800ms readonly wait); loaded-control mutations and rendered frames require visible unobscured button and prepared feedback for l1-o1. No visibility inferred from game events or later RPC replies.'});console.log(JSON.stringify({name:'prepared-jump-visible-observation',evidence:{armed,prepared}}));await shot('jump-queued');jumped=true;}}
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
 report.presentationSignals=await page.evaluate(()=>window.__qaExperienceSignals);
 earnedPrizeCue ||= earnedPrizeRouteSeen(report.presentationSignals,'l1-o1','l1-jump-l1-o1');
 leftWarning ||= pedestrianWarningSeen(report.presentationSignals,2);
 rightWarning ||= pedestrianWarningSeen(report.presentationSignals,0);
 if(!report.checks.some(c=>c.name==='left-pedestrian-warns-right-at-least-two-seconds'))check('left-pedestrian-warns-right-at-least-two-seconds',leftWarning,{source:'continuous actual visible radar frames',signals:report.presentationSignals});
 if(!report.checks.some(c=>c.name==='right-pedestrian-warns-left-at-least-two-seconds'))check('right-pedestrian-warns-left-at-least-two-seconds',rightWarning,{source:'continuous actual visible radar frames',signals:report.presentationSignals});
 check('natural-jump-gold-advances-mastery',bonusShot&&finished.events.some(e=>e.type==='barrier-cleared'&&e.jumped),finished);
 check('earned-jump-prize-has-visible-route-cue',earnedPrizeCue,{earnedPrizeCue});
 check('buffered-jump-clears-exact-target',finished.events.some(e=>e.type==='jump'&&e.buffered&&finished.events.some(c=>c.type==='barrier-cleared'&&c.objectId===e.objectId&&c.jumped)),finished);
 check('natural-three-star-settlement',finished.reason==='complete'&&finished.save.stars[0]===3&&(await page.locator('#co-copy').innerText()).includes('★★★')&&(await page.locator('#co-heading').innerText()).includes('三星达成'),finished);
 check('both-crossing-directions-observed',leftWarning&&rightWarning,{leftWarning,rightWarning});
 const best=finished.save.best[0];check('real-personal-best-recorded',best.fish===finished.count&&best.gold===finished.gold&&best.jumps===finished.jumpedBarriers&&best.jumps>=1&&best.streak===finished.bestStreak&&best.streak>=4,best);
 // Negative baseline: an untouched rider genuinely catches the first central
 // teaching fish but must not be awarded the off-centre second fish.
 await tap('#co-replay');
 await page.waitForFunction(()=>window.__coast.snapshot().distance>=37,null,{timeout:35000});
 const noInput=await snap();
 check('no-input-first-fish-but-no-free-offcentre-second-fish',
  noInput.phase==='running'&&noInput.events.some(e=>e.type==='fish-caught'&&e.objectId==='l1-f0')&&
  !noInput.events.some(e=>e.type==='fish-caught'&&e.objectId==='l1-f1')&&noInput.count===1,
  {noInput,source:'new round: no gameplay input between replay and 37 metres'});
 await shot('no-steer-negative-control');
 // Gesture coverage has its own clean replay, after the no-input experiment.
 await tap('#co-pause');await tap('#co-replay');await page.waitForTimeout(250);
 const a=await gesture('right',[140,420],[250,420]);check('trusted-right-swipe-one-lane',a.after.laneIndex===2,a);
 const b=await gesture('left',[250,420],[140,420]);check('trusted-left-swipe-one-lane',b.before.laneIndex===2&&b.after.laneIndex===1,b);
 const fractional=await gesture('short-free-drag',[140,420],[171,420]);
 check('finger-drags-set-fractional-target-not-fixed-lanes',
  fractional.after.laneTarget>fractional.before.laneTarget+.3&&
  fractional.after.laneTarget<fractional.before.laneTarget+.8&&
  Math.abs(fractional.after.lane-fractional.after.laneTarget)<.12,fractional);
 // The software-rendered three preceding gestures can reach the first crossing
 // pedestrian. Test ordinary cancellation from an actual new replay, retaining
 // a non-centred origin. Never treat a collision/stun as the same input branch.
 if((await snap()).phase==='running')await tap('#co-pause');
 await tap('#co-replay');
 const cancelOrigin=await gesture('cancel-origin-fractional-drag',[140,420],[171,420]);
 // Log native events passively; never dispatch fake DOM events or set state.
 await page.evaluate(()=>{window.__qaCancellationEvents=[];
  for(const type of ['touchcancel','pointercancel','touchend','pointerup'])
   document.addEventListener(type,e=>window.__qaCancellationEvents.push({
    type:e.type,isTrusted:e.isTrusted,target:e.target?.nodeName,
    changed:e.changedTouches?.length??null
   }),true);
 });
 const c=await gesture('cancel',[140,420],[250,420],true);
 const cancellationEvents=await page.evaluate(()=>window.__qaCancellationEvents);
 check('cancelled-touch-does-not-turn',cancelOrigin.after.laneTarget>.3&&cancelOrigin.after.laneTarget<.8&&
  cancelledDragPassed(c,cancellationEvents),
  {gesture:c,cancellationEvents,cancelOrigin,branch:'running-nonstunned-fractional-target'});
 // Independent legitimate replay. Extra precise steering gestures now consume
 // enough in-game time to reach the first solid barrier: a late arbitrary
 // up-swipe there is a REAL crash, not a touch-handler failure. Start again
 // through visible pause/replay UI, keeping native input, physics and collisions.
 if((await snap()).phase==='running')await tap('#co-pause');
 await tap('#co-replay');
 await page.waitForTimeout(250);
 const d=await gesture('up',[200,480],[200,380]);
 check('trusted-up-swipe-jumps',
  d.before.phase==='running'&&d.before.distance<40&&
  d.after.events.filter(e=>e.type==='jump').length>d.before.events.filter(e=>e.type==='jump').length,
  d);
 await shot('up-swipe');
 if(report.checks.some(c=>!c.passed))throw Error('Experience regression needs repair');
 if((await snap()).phase==='running')await tap('#co-pause');await tap('#co-replay');await page.waitForTimeout(250);
 const safeEnd=Date.now()+50000;
 while(Date.now()<safeEnd){const v=await page.evaluate(()=>({phase:document.querySelector('#coast').dataset.phase,distance:Number(document.querySelector('#co-distance').textContent.match(/^\d+/)?.[0]??0),lane:[...document.querySelectorAll('.co-lane-indicator i')].findIndex(n=>n.classList.contains('on')),lanes:[...document.querySelectorAll('.co-lane')].map(n=>({text:n.textContent,danger:n.classList.contains('danger'),fish:n.classList.contains('fish')}))}));if(v.distance>=238||v.phase==='finished')break;const blocked=i=>v.lanes[i].danger&&Number(v.lanes[i].text.match(/(\d+(?:\.\d+)?)s/)?.[1]??99)<=3;let want=v.lane;if(blocked(want)){const safe=[0,1,2].filter(i=>!blocked(i));want=safe.find(i=>v.lanes[i].fish)??safe.sort((a,b)=>Math.abs(a-v.lane)-Math.abs(b-v.lane))[0]??want;}else{const fish=v.lanes.findIndex((l,i)=>l.fish&&!blocked(i));if(fish>=0)want=fish;}if(want!==v.lane&&!blocked(v.lane)&&blocked(v.lane+Math.sign(want-v.lane)))want=v.lane;if(want!==v.lane)await tap(`[data-action="${want<v.lane?'left':'right'}"]`);await page.waitForTimeout(90);}
const detour=await snap();await shot('safe-detour');
 check('safe-detour-does-not-require-jump',detour.phase==='running'&&!detour.events.some(e=>e.type==='jump')&&detour.events.some(e=>e.type==='barrier-cleared'&&!e.jumped),detour);
 await tap('#co-pause');await tap('#co-select');const selected=await page.locator('[data-level="1"]').innerText();const progress=await page.locator('#co-progress').innerText();check('mastery-saved-and-visible-on-route',selected.includes('★★★')&&selected.includes('纪录 '+best.fish+' 鱼')&&progress.includes('3/15'),{selected,progress,best});await shot('saved-mastery');
 // Start another normal replay to verify that a safe turn cancels an armed jump.
 await tap('[data-level="1"]');await tap('#co-start');
 const pair=await page.evaluate(()=>Object.fromEntries(['jump','right'].map(action=>{const n=document.querySelector(`[data-action="${action}"]`),r=n.getBoundingClientRect();return [action,{x:r.left+r.width/2,y:r.top+r.height/2}];})));
 const cancellationSession=await touchSession(page,engine);
 await page.evaluate(()=>{window.__qaCancellationTouches=[];document.querySelector('#coast').addEventListener('pointerdown',e=>{const action=e.target.closest?.('[data-action]')?.dataset.action;if(action)window.__qaCancellationTouches.push({action,isTrusted:e.isTrusted,pointerType:e.pointerType,at:performance.now()});},{capture:true});});
 await page.locator('[data-action="jump"].ready').waitFor({state:'visible',timeout:25000});
 // Queue two ordered real taps without a browser-ACK roundtrip between them.
 // Screenshots/state reads follow; their actual event order still gates PASS.
 for(const action of ['jump','right'])report.actions.push({at:new Date().toISOString(),type:'tap',selector:`[data-action="${action}"]`,touchPoint:pair[action],input:'ordered Input.dispatchTouchEvent; points measured before queue',normalInputOnly:true});
 await queueTapSequence(cancellationSession,engine,[pair.jump,pair.right]);
 await page.waitForFunction(()=>Number(document.querySelector('#co-distance').textContent.match(/^\d+/)?.[0]??0)>=152,{},{timeout:10000});
 const cancelled=await snap(),armed=cancelled.events.find(e=>e.type==='jump-buffered');
 const cancellationTouches=await page.evaluate(()=>window.__qaCancellationTouches);
 check('safe-lane-change-cancels-buffer-without-fake-mastery',!!armed&&cancelled.bufferedJump===null&&cancelled.phase==='running'&&!cancelled.events.some(e=>e.type==='jump')&&cancelled.events.some(e=>e.type==='barrier-cleared'&&e.objectId===armed.objectId&&!e.jumped)&&cancelled.jumpedBarriers===0&&cancellationTouches.length===2&&cancellationTouches.every((e,i)=>e.isTrusted&&e.pointerType==='touch'&&e.action===['jump','right'][i]),{armed,cancelled,cancellationTouches});await shot('cancel-jump-safe-detour');await tap('#co-pause');await tap('#co-select');
 // Small-phone acceptance: only normal viewport resize and true taps, no state edits.
 await page.setViewportSize({width:320,height:568});await page.waitForTimeout(250);
 const menu=await page.evaluate(()=>{
  const start=document.querySelector('#co-start'),r=start.getBoundingClientRect(),route=document.querySelector('#co-route');
  return {ready:document.querySelector('#coast')?.dataset.phase==='ready',start:{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom},
   routeScrollable:route.scrollHeight>route.clientHeight,documentWidth:document.documentElement.scrollWidth};
 });
 const routePresentation=await page.evaluate(readRoutePresentation);
 check('small-phone-start-visible-and-menu-not-overflow',menu.ready&&menu.start.x>=0&&menu.start.bottom<=568&&menu.start.height>=36&&menu.documentWidth<=320&&routePresentationPassed(routePresentation),{...menu,routePresentation});
 await shot('small-phone-route-menu');
 await tap('#co-start');await page.waitForTimeout(450);
 const small=await page.evaluate(readCompactPresentation);
 check('small-phone-touch-buttons-and-mastery-readable',
  compactPresentationPassed(small),small);
 await shot('small-phone-running');
}catch(e){report.errors.push(e.stack);await shot('failure').catch(()=>{});}
finally{const video=await page.video().path();await ctx.close();report.video={path:path.relative(RUN,video),sha256:sha(await readFile(video))};await browser.close();server.close();report.passed=report.checks.every(c=>c.passed)&&report.errors.length===0;await json(path.join(dir,'report.json'),report);if(!report.passed)process.exitCode=1;}
