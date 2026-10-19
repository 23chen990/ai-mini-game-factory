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
async function gesture(name,from,to,cancel=false,capture=true){const at=new Date().toISOString(),before=await snap();await swipe(page,engine,from,to,{cancel});if(!cancel&&capture)await shot('swipe-'+name);await page.waitForTimeout(330);const after=await snap();report.actions.push({at,completedAt:new Date().toISOString(),type:'swipe',name,from,to,cancel,before,after});return {before,after};}
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
 // Actual right → centre → right sequence: all three early fish can be
 // earned with real tap input, but the screenshot must not consume the
 // 16m reaction window between the second and the first gold.
 await tap('[data-action="left"]');
 await page.waitForFunction(()=>Number(document.querySelector('#co-distance')?.textContent?.match(/^\d+/u)?.[0]??0)>=49,
  null,{timeout:8000});
 await tap('[data-action="right"]');
 // V7: the visible right-lane car is already approaching behind the
 // collected fish. Countersteer immediately through a real public touch;
 // capturing a software screenshot first would consume the escape window.
 await tap('[data-action="left"]');
 await shot('actual-offcentre-second-fish-caught');
 const target=await page.locator('#co-mastery').count();check('mastery-target-visible-before-first-obstacle',target===1&&await page.locator('#co-mastery').isVisible(),{target});
 // Cache the visible right-thumb centre while it is safe to inspect layout.
 // The actual jump below still uses a trusted browser touchscreen tap.
 const jumpHitPoint=await page.locator('[data-action="jump"]').evaluate(node=>{
  const box=node.getBoundingClientRect();return {x:box.left+box.width/2,y:box.top+box.height/2};
 });
 if(report.checks.some(c=>!c.passed))throw Error('Experience regression needs repair');
 let jumped=false,prizeFeedbackSeen=false,bonusShot=false,choiceShot=false,goldShot=false,leftWarning=false,rightWarning=false,earnedPrizeCue=false,jumpProgressBefore={gold:Infinity,jumps:Infinity};
 let escapedBonus=false,escapeLane=null,escapeUntil=-1;
 const end=Date.now()+65000;
 while(Date.now()<end){
  const v=await page.evaluate(()=>({phase:document.querySelector('#coast').dataset.phase,distance:Number(document.querySelector('#co-distance')?.textContent?.match(/^\d+/u)?.[0]??0),lane:[...document.querySelectorAll('.co-lane-indicator i')].findIndex(n=>n.classList.contains('on')),lanes:[...document.querySelectorAll('.co-lane')].map(n=>({text:n.textContent,danger:n.classList.contains('danger'),fish:n.classList.contains('fish'),bonus:n.classList.contains('jump-reward'),kind:n.dataset.kind})),feedback:document.querySelector('#co-feedback strong')?.textContent??'',feedbackDetail:document.querySelector('#co-feedback small')?.textContent??'',radarLabel:document.querySelector('#co-radar-label')?.textContent??'',jumpReady:document.querySelector('[data-action="jump"]')?.classList.contains('ready')===true,gold:Number(document.querySelector('[data-goal="gold"]')?.textContent.match(/\d+/u)?.[0]??NaN),jumps:Number(document.querySelector('[data-goal="jump"]')?.textContent.match(/\d+/u)?.[0]??NaN)}));
  if(v.phase==='finished')break;
  if(!choiceShot&&v.lanes.some(l=>l.bonus)){choiceShot=true;check('jump-gold-route-signalled-with-safe-detour',true,v);await shot('jump-choice');}
  if(!goldShot){const firstGold=(await snap()).events.find(e=>e.type==='fish-caught'&&e.golden&&!e.bonus);if(firstGold){goldShot=true;check('first-gold-before-ten-seconds',firstGold.at<10,firstGold);await shot('first-gold');}}
  const seconds=i=>Number(v.lanes[i].text.match(/(\d+(?:\.\d+)?)s/)?.[1]??99);
  // Moving vehicles close the gap faster than stationary barriers. Treat a
  // visible car/van as a forbidden route slightly earlier after the jump
  // bonus is earned; do not make a replay-driving script choose a fatal fish.
  const risky=i=>v.lanes[i]?.danger&&(seconds(i)<=3||(['car','van'].includes(v.lanes[i].kind)&&seconds(i)<=4));
  let want=v.lane;
  prizeFeedbackSeen ||= earnedJumpRewardVisible(v,jumpProgressBefore);
  // A successful bonus can be followed by a rapidly approaching car.
  // The game now gives a *visible* escape warning. Respond through a normal
  // left/right button rather than staying in the reward lane until collision.
  // Confirmed bonus pickup at ~119m is itself a legitimate visible escape
  // decision; do not wait until the 164m car is already inside the hitbox.
  const warnedVehicle=v.feedbackDetail.includes('前方来车')||v.radarLabel.includes('来车')||
   v.lanes[1]?.danger&&['car','van'].includes(v.lanes[1].kind);
  if(jumped&&prizeFeedbackSeen&&!escapedBonus&&(warnedVehicle||v.distance>=119)){
   // The rider often makes the correct LEFT turn at ~118m, just before
   // the 119m HUD threshold. Later confirmation must preserve that
   // already earned escape; don't chase a centre fish back across 140m.
   const currentSide=v.lane===0||v.lane===2?v.lane:null;
   const safeSide=[currentSide,0,2].filter((i,n,arr)=>Number.isInteger(i)&&arr.indexOf(i)===n&&
    !risky(i)&&(!v.lanes[i].danger||seconds(i)>3.5));
   if(safeSide.length){
    escapedBonus=true;escapeLane=safeSide[0];escapeUntil=Math.max(148,v.distance+24);
    console.log('V7_BONUS_EXIT_COMMITTED '+JSON.stringify({distance:v.distance,chosenLane:escapeLane,through:escapeUntil,visibleGold:v.gold,visibleJumps:v.jumps}));
   }
  }
  if(jumped&&!prizeFeedbackSeen&&!earnedPrizeCue&&v.lanes[1].kind==='fish'&&v.lanes[1].text.includes('🌟')){
   const observed=await snap();
   if(observed.events.some(e=>e.type==='barrier-cleared'&&e.objectId==='l1-o13'&&e.jumped)&&!observed.events.some(e=>e.type==='fish-caught'&&e.objectId==='l1-jump-l1-o13')){
    earnedPrizeCue=true;
   }
  }
  if(escapedBonus&&v.distance<escapeUntil){
   // The 140m middle barrier is still physically lethal. A later red
   // warning for the distant 205m side barrier must not lure the rider
   // back across 140m. Keep a side lane unless its own deadline is real
   // and imminent; reassess the middle lane only after the rear wheel
   // clears the 140m collision envelope.
   const safe=[escapeLane,0,2].filter((i,index,arr)=>
    Number.isInteger(i)&&arr.indexOf(i)===index&&!risky(i)&&
    (!v.lanes[i].danger||seconds(i)>3.5));
   want=safe[0]??v.lane;escapeLane=want;
  }
  else if(jumped&&!prizeFeedbackSeen){want=1;}
  else if(!jumped&&(v.lanes[1].bonus||v.jumpReady&&v.distance>=90&&v.distance<110)){want=1;if(v.lane===1&&v.distance>=102&&(v.jumpReady||seconds(1)<=1.0)){jumpProgressBefore={gold:v.gold,jumps:v.jumps};
    // Preserve the player's real READY decision without two extra remote
    // snapshot/rAF roundtrips before the native touchscreen event. In the
    // 1.1s physical queue, slow software WebGL otherwise consumes almost the
    // whole window before feedback can become visible.
    const jumpAction={at:new Date().toISOString(),type:'tap',selector:'[data-action="jump"]',
     before:{phase:v.phase,distance:v.distance},input:'direct trusted Playwright touchscreen'};
    await page.touchscreen.tap(jumpHitPoint.x,jumpHitPoint.y);
    jumpAction.touchPoint=jumpHitPoint;report.actions.push(jumpAction);
    await page.waitForFunction(()=>window.__qaPreparedJumpFrames.some(f=>f.queued&&f.buttonVisible&&f.feedbackVisible&&f.bufferedJump==='l1-o13'&&f.feedback.includes('已准备')),null,{timeout:1800}).catch(()=>{});const prepared=await page.evaluate(()=>window.__qaObservePreparedJump()),armed=await snap();check('early-jump-buffer-visible',preparedJumpSeen(prepared,'l1-o13'),{armed,prepared,note:'Observe the actual CSS fade-in while the exact jump is queued (max1800ms readonly wait); loaded-control mutations and rendered frames require visible unobscured button and prepared feedback for l1-o13. No visibility inferred from game events or later RPC replies.'});console.log(JSON.stringify({name:'prepared-jump-visible-observation',evidence:{armed,prepared}}));jumped=true;}}
  else if(risky(want)){const safe=[0,1,2].filter(i=>!risky(i));want=safe.find(i=>v.lanes[i].fish)??safe.sort((a,b)=>Math.abs(a-v.lane)-Math.abs(b-v.lane))[0]??v.lane;}
  else{const fish=v.lanes.findIndex((l,i)=>l.fish&&!risky(i));if(fish>=0)want=fish;}
  // The authored 130m RIGHT car and 140m CENTRE barrier are a coupled
  // two-action pressure gate. After the earned 110m gold jump, the visible
  // LEFT route is the only physically safe through-line until its back wheel
  // clears 140m. Do not turn back for a fish at 139m.
  // This is a normal trusted-touch choice; never rewrite run state.
  // Radar can prioritise a later red vehicle over this already-verified
  // 130m right-car / 140m centre-barrier opening. The authored left lane
  // stays unblocked through 152m: finish the real left-side manoeuvre
  // instead of making a fatal right tap near 139m.
  if(jumped&&v.distance>=115&&v.distance<152)want=0;
  if(want!==v.lane&&!risky(v.lane)&&risky(v.lane+Math.sign(want-v.lane)))want=v.lane;
  if(want!==v.lane)await tap(`[data-action="${want<v.lane?'left':'right'}"]`);
  if(!bonusShot&&(await snap()).events.some(e=>e.type==='fish-caught'&&e.bonus&&e.golden))bonusShot=true;
  if(!leftWarning&&v.lanes[2].kind==='pedestrian'&&seconds(2)>=2){leftWarning=true;check('left-pedestrian-warns-right-at-least-two-seconds',true,v);await shot('left-pedestrian-warning');}
  if(!rightWarning&&v.lanes[0].kind==='pedestrian'&&seconds(0)>=2){rightWarning=true;check('right-pedestrian-warns-left-at-least-two-seconds',true,v);await shot('right-pedestrian-warning');}
  await page.waitForTimeout(65);
 }
 await page.locator('#co-modal').waitFor({state:'visible'});const finished=await snap();await shot('earned-three-stars');
 console.log('EXPERIENCE_FIRST_RUN '+JSON.stringify({engine,reason:finished.reason,distance:finished.distance,count:finished.count,gold:finished.gold,jumpedBarriers:finished.jumpedBarriers,hits:finished.hits,stars:finished.save?.stars?.[0],bestStreak:finished.bestStreak,lastCollisionId:finished.lastCollisionId,recentTouches:report.actions.filter(a=>a.type==='tap'&&a.selector?.startsWith('[data-action')).slice(-14).map(a=>({selector:a.selector,beforeDistance:a.before?.distance,beforeLane:a.before?.lane,afterLane:a.after?.lane,afterPhase:a.after?.phase})),interestingEvents:finished.events.filter(e=>['jump','jump-buffered','barrier-cleared','fish-caught','failed'].includes(e.type)&&(!e.objectId||e.objectId==='l1-o13'||e.objectId==='l1-jump-l1-o13'||e.type==='failed')).slice(-16)}));
 report.presentationSignals=await page.evaluate(()=>window.__qaExperienceSignals);
 earnedPrizeCue ||= earnedPrizeRouteSeen(report.presentationSignals,'l1-o13','l1-jump-l1-o13');
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
 // V7: refusing to steer now causes a genuine early collision at the 35m
 // centre barrier. Wait for the observable result, not an unreachable 37m
 // distance that would stall forever after physics has stopped.
 await page.waitForFunction(()=>{const v=window.__coast.snapshot();return v.phase==='finished'||v.distance>=37},null,{timeout:10000});
 const noInput=await snap();
 check('no-input-first-fish-then-real-opening-barrier-death',
  noInput.phase==='finished'&&noInput.reason==='barrier'&&
  noInput.distance>=33&&noInput.distance<=37&&
  noInput.events.some(e=>e.type==='fish-caught'&&e.objectId==='l1-f0')&&
  !noInput.events.some(e=>e.type==='fish-caught'&&e.objectId==='l1-f1')&&noInput.count===1,
  {noInput,source:'second true round: no steering/jump, failure generated by authored 35m physical barrier'});
 await shot('no-steer-negative-control');
 // Real gestures are separately tested after an ordinary free replay.
 await tap('#co-replay');await page.waitForTimeout(250);
 const a=await gesture('right',[140,420],[250,420],false,false);check('trusted-right-swipe-one-lane',a.after.laneIndex===2,a);
 const b=await gesture('left',[250,420],[140,420],false,false);check('trusted-left-swipe-one-lane',b.before.laneIndex===2&&b.after.laneIndex===1,b);
 // Run fractional drag on its own genuine free replay. Two prior long swipes
 // consume almost the entire 35m collision window on software WebGL.
 // A finished rider cannot respond to a new drag, so a genuine reset is
 // essential (not a collision bypass or model-state injection).
 if((await snap()).phase==='running')await tap('#co-pause');
 await tap('#co-replay');
 const fractional=await gesture('short-free-drag',[140,420],[171,420],false,false);
 check('finger-drags-set-fractional-target-not-fixed-lanes',
  fractional.before.phase==='running'&&fractional.after.phase==='running'&&
  fractional.after.laneTarget>fractional.before.laneTarget+.3&&
  fractional.after.laneTarget<fractional.before.laneTarget+.8&&
  Math.abs(fractional.after.lane-fractional.after.laneTarget)<.12,fractional);
 // Independent snapshots preserve each trusted swipe input without pausing.
 // With V7's early real collision, per-swipe PNGs consumed the reaction
 // window. Pause the simulation through the actual UI before taking evidence.
 if((await snap()).phase==='running')await tap('#co-pause');
 await shot('trusted-three-swipe-sequence-after-pause');
 // The software-rendered three preceding gestures can reach the first crossing
 // pedestrian. Test ordinary cancellation from an actual new replay, retaining
 // a non-centred origin. Never treat a collision/stun as the same input branch.
 if((await snap()).phase==='running')await tap('#co-pause');
 await tap('#co-replay');
 // The real 35m opening barrier can kill the rider during two slow
 // sequential software-GPU swipe probes. Seed a noncentral target via ONE
 // authentic right-button touch instead; the prior test already verified
 // fractional drag steering with normal touch input.
 await tap('[data-action="right"]');
 const cancelOrigin=await snap();
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
 check('cancelled-touch-does-not-turn',cancelOrigin.phase==='running'&&cancelOrigin.laneIndex===2&&
  cancelOrigin.laneTarget>.9&&cancelOrigin.laneTarget<1.5&&
  cancelledDragPassed(c,cancellationEvents),
  {gesture:c,cancellationEvents,cancelOrigin,branch:'trusted-noncentral-button-origin'});
 // The cancelled gesture was checked from actual native events; take its
 // picture only after pressing the real pause control.
 if((await snap()).phase==='running')await tap('#co-pause');
 await shot('trusted-cancelled-touch-after-pause');
 // Independent legitimate replay. Extra precise steering gestures now consume
 // enough in-game time to reach the first solid barrier: a late arbitrary
 // up-swipe there is a REAL crash, not a touch-handler failure. Start again
 // through visible pause/replay UI, keeping native input, physics and collisions.
 if((await snap()).phase==='running')await tap('#co-pause');
 await tap('#co-replay');
 await page.waitForTimeout(250);
 const d=await gesture('up',[200,480],[200,380]);
 // A genuine swipe early in the run is an ordinary jump. When a software
 // screenshot delays the input until the first 35m hazard is close enough,
 // the SAME genuine swipe instead queues the exact physical barrier jump.
 // Verify the path that ACTUALLY occurred, without equating normal early
 // jumping with a promise to evade the later hazard.
 const ordinaryJump=d.after.events.find(e=>e.type==='jump'&&
  !d.before.events.includes(e));
 const armed=d.after.events.find(e=>e.type==='jump-buffered'&&e.objectId==='l1-o10');
 let upOutcome=d.after,realJump=null,trueClear=null;
 if(!ordinaryJump&&armed){
  // Queued touch is only valid after the bike really jumps and clears
  // the target. A HUD badge alone cannot pass this branch.
  await page.waitForFunction(()=>{
   const v=window.__coast.snapshot();
   return v.phase==='finished'||v.events.some(e=>
    e.type==='barrier-cleared'&&e.objectId==='l1-o10');
  },null,{timeout:10000});
  upOutcome=await snap();
  realJump=upOutcome.events.find(e=>e.type==='jump'&&e.objectId==='l1-o10'&&e.buffered);
  trueClear=upOutcome.events.find(e=>e.type==='barrier-cleared'&&e.objectId==='l1-o10'&&e.jumped);
 }
 check('trusted-up-swipe-jumps',
  d.before.phase==='running'&&d.before.distance<35&&
  (!!ordinaryJump||!!armed&&!!realJump&&!!trueClear&&upOutcome.phase==='running'),
  {gesture:d,upOutcome,ordinaryJump,armed,realJump,trueClear});
 await shot('up-swipe');
 if(report.checks.some(c=>!c.passed))throw Error('Experience regression needs repair');
 if((await snap()).phase==='running')await tap('#co-pause');await tap('#co-replay');await page.waitForTimeout(250);
 const safeEnd=Date.now()+50000;
 // Only public distance and radar are used. A hazard does not become safe as
 // soon as its marker drops out: allow the rear wheel to clear its collision
 // envelope before steering back for the next fish.
 const visibleHazardClearance=[0,0,0];
 while(Date.now()<safeEnd){
  const v=await page.evaluate(()=>({
   phase:document.querySelector('#coast').dataset.phase,
   distance:Number(document.querySelector('#co-distance').textContent.match(/^\d+/)?.[0]??0),
   lane:[...document.querySelectorAll('.co-lane-indicator i')].findIndex(n=>n.classList.contains('on')),
   lanes:[...document.querySelectorAll('.co-lane')].map(n=>({
    text:n.textContent,danger:n.classList.contains('danger'),
    fish:n.classList.contains('fish'),kind:n.dataset.kind,
   })),
  }));
  if(v.distance>=238||v.phase==='finished')break;
  for(let i=0;i<3;i++){
   if(!v.lanes[i].danger)continue;
   const seconds=Number(v.lanes[i].text.match(/(\d+(?:\.\d+)?)\s*s/)?.[1]);
   // The first level rides at 7.5 m/s. Keep a 4m tail from the actual
   // player-visible countdown, including when the icon is replaced by fish.
   const forecastDistance=v.distance+(Number.isFinite(seconds)?Math.max(0,seconds)*7.5:0);
   visibleHazardClearance[i]=Math.max(visibleHazardClearance[i],forecastDistance+4);
  }
  // A future red van at 3-4s does not make the current open lane unsafe
  // NOW when an adjacent barrier is only 0.8s away. React to the earliest
  // collision deadline rather than abandoning the lane for a farther threat.
  // Every decision still uses the actual public three-lane radar only.
  const ttc=i=>{
   const text=v.lanes[i]?.text??'';
   const parsed=Number(text.match(/(\d+(?:\.\d+)?)\s*s/u)?.[1]);
   return v.lanes[i]?.danger?(Number.isFinite(parsed)?parsed:0):Infinity;
  };
  const imminent=i=>ttc(i)<=2.0;
  const dangerVisible=v.lanes.some(l=>l.danger);
  const dangerCount=v.lanes.filter(l=>l.danger).length;
  let want=v.lane;
  // If TWO separate lanes already show red within the public 4.5s forecast,
  // commit to the single open lane early. Waiting for each separate 2.0s
  // deadline is too late to cross a red middle lane on a small phone.
  if(dangerCount===2){
   const free=[0,1,2].find(i=>!v.lanes[i].danger&&v.distance>=visibleHazardClearance[i]);
   if(free!==undefined)want=free;
  }
  if(want===v.lane&&imminent(want)){
   const safe=[0,1,2].filter(i=>i!==want&&ttc(i)>2.35);
   safe.sort((a,b)=>
    Number(v.distance>=visibleHazardClearance[b])-Number(v.distance>=visibleHazardClearance[a])||
    Math.abs(a-v.lane)-Math.abs(b-v.lane));
   want=safe[0]??want;
  }else if(want===v.lane&&!dangerVisible){
   // Only chase optional fish on a genuinely clear approach, not between
   // a near barrier and the following oncoming van.
   const fish=v.lanes.findIndex((l,i)=>l.fish&&v.distance>=visibleHazardClearance[i]);
   if(fish>=0)want=fish;
  }
  // A 0 -> 2 turn crosses lane 1. Never cross an immediately fatal lane
  // just to take a visible optional fish.
  if(want!==v.lane&&Math.abs(want-v.lane)===2&&imminent(1))want=v.lane;
  if(want!==v.lane)await tap(`[data-action="${want<v.lane?'left':'right'}"]`);
  await page.waitForTimeout(55);
 }
const detour=await snap();console.log('SAFE_DETOUR_FIRST_RUN '+JSON.stringify({phase:detour.phase,reason:detour.reason,distance:detour.distance,events:detour.events?.slice(-12)}));await shot('safe-detour');
 check('safe-detour-does-not-require-jump',detour.phase==='running'&&!detour.events.some(e=>e.type==='jump')&&detour.events.some(e=>e.type==='barrier-cleared'&&!e.jumped),detour);
 await tap('#co-pause');await tap('#co-select');const selected=await page.locator('[data-level="1"]').innerText();const progress=await page.locator('#co-progress').innerText();check('mastery-saved-and-visible-on-route',selected.includes('★★★')&&selected.includes('纪录 '+best.fish+' 鱼')&&progress.includes('3/15'),{selected,progress,best});await shot('saved-mastery');
 // Start another normal replay to verify that a safe turn cancels an armed jump.
 await tap('[data-level="1"]');await tap('#co-start');
 const pair=await page.evaluate(()=>Object.fromEntries(['jump','right'].map(action=>{const n=document.querySelector(`[data-action="${action}"]`),r=n.getBoundingClientRect();return [action,{x:r.left+r.width/2,y:r.top+r.height/2}];})));
 const cancellationSession=await touchSession(page,engine);
 await page.evaluate(()=>{window.__qaCancellationTouches=[];document.querySelector('#coast').addEventListener('pointerdown',e=>{const action=e.target.closest?.('[data-action]')?.dataset.action;if(action)window.__qaCancellationTouches.push({action,isTrusted:e.isTrusted,pointerType:e.pointerType,at:performance.now()});},{capture:true});});
 // We must land a trusted jump and immediate safe lane change while
 // 35m barrier's 1.1s queue is active (about 27-32m). An ordinary resume
 // RPC itself can advance ~4m, so pause on a genuine touch at ~25m, then
 // resume through the visible UI and queue two native consecutive taps.
 // No state injection, fake touch events or collision forgiveness.
 await page.waitForFunction(()=>{
  const v=window.__coast.snapshot();return v.phase==='finished'||v.distance>=24.2;
 },null,{timeout:25000});
 const beforePause=await snap();
 if(beforePause.phase!=='running'||beforePause.distance>26.6)
  throw Error('Physical jump cancellation setup missed its safe pause window');
 await tap('#co-pause');
 const pauseProof=await snap();
 if(pauseProof.phase!=='paused'||pauseProof.distance>27.5)
  throw Error('Native pause must freeze the rider before READY starts');
 await tap('#co-resume');
 // V7 accepts a queued jump only within 1.1 seconds of the 35m barrier.
 // With the old 24m pause, pressing instantly at 25.7m is an ordinary
 // real jump, not a queued jump. Wait on publicly advancing distance, then
 // issue the two pre-measured REAL trusted touches without an intervening
 // screenshot or slow snapshot call. No collision/physics state is changed.
 await page.waitForFunction(()=>{
  const v=window.__coast.snapshot();
  return v.phase==='finished'||v.distance>=27.0;
 },null,{timeout:8000});
 for(const action of ['jump','right'])report.actions.push({at:new Date().toISOString(),type:'tap',selector:`[data-action="${action}"]`,touchPoint:pair[action],input:'ordered native touchscreen session after genuine resume inside 1.1s physical queue window',normalInputOnly:true});
 await queueTapSequence(cancellationSession,engine,[pair.jump,pair.right]);
 // The V7 opening 35m barrier replaces the original 140m as this
 // buffer-cancellation scenario; waiting for 152m otherwise hangs after
 // the rider's genuine opening crash. No state edits or collision bypass.
 await page.waitForFunction(()=>{
  const v=window.__coast.snapshot();
  return v.phase==='finished'||v.distance>=47;
 },null,{timeout:10000});
 const cancelled=await snap(),cancellationArmed=cancelled.events.find(e=>e.type==='jump-buffered');
 const cancellationTouches=await page.evaluate(()=>window.__qaCancellationTouches);
 check('safe-lane-change-cancels-buffer-without-fake-mastery',!!cancellationArmed&&cancellationArmed.objectId==='l1-o10'&&cancelled.distance>=46&&cancelled.bufferedJump===null&&cancelled.phase==='running'&&!cancelled.events.some(e=>e.type==='jump')&&cancelled.events.some(e=>e.type==='barrier-cleared'&&e.objectId===cancellationArmed.objectId&&!e.jumped)&&cancelled.jumpedBarriers===0&&cancellationTouches.length===2&&cancellationTouches.every((e,i)=>e.isTrusted&&e.pointerType==='touch'&&e.action===['jump','right'][i]),{cancellationArmed,cancelled,cancellationTouches});await shot('cancel-jump-safe-detour');await tap('#co-pause');await tap('#co-select');
 // Small-phone acceptance: only normal viewport resize and true taps, no state edits.
 await page.setViewportSize({width:320,height:568});await page.waitForTimeout(250);
 const menu=await page.evaluate(()=>{
  const start=document.querySelector('#co-start'),r=start.getBoundingClientRect(),route=document.querySelector('#co-route');
  return {ready:document.querySelector('#coast')?.dataset.phase==='ready',start:{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom},
   routeScrollable:route.scrollHeight>route.clientHeight,routeHeight:route.clientHeight,documentWidth:document.documentElement.scrollWidth};
 });
 const routePresentation=await page.evaluate(readRoutePresentation);
 check('small-phone-start-visible-and-menu-not-overflow',menu.ready&&menu.start.x>=0&&menu.start.bottom<=568&&menu.start.height>=36&&menu.documentWidth<=320&&menu.routeHeight>=100&&routePresentationPassed(routePresentation),{...menu,routePresentation});
 await shot('small-phone-route-menu');
 await tap('#co-start');await page.waitForTimeout(450);
 const small=await page.evaluate(readCompactPresentation);
 check('small-phone-touch-buttons-and-mastery-readable',
  compactPresentationPassed(small),small);
 await shot('small-phone-running');
}catch(e){report.errors.push(e.stack);await shot('failure').catch(()=>{});}
finally{const video=await page.video().path();await ctx.close();report.video={path:path.relative(RUN,video),sha256:sha(await readFile(video))};await browser.close();server.close();report.passed=report.checks.every(c=>c.passed)&&report.errors.length===0;await json(path.join(dir,'report.json'),report);if(!report.passed)process.exitCode=1;}
