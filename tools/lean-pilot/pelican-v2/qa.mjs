/* global process, console, window, document, requestAnimationFrame, performance */
import {webkit,chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {URL} from 'node:url';
import path from 'node:path';
import {RUN,WORKSPACE,json,sha} from './prepare.mjs';
import {serve} from './serve.mjs';
import {browserOptions,qaDpr} from './browser-options.mjs';
import {tapVisible} from './touch.mjs';
import {campaignWallBudgetMs} from './runtime/qa-budget.mjs';
import {capturePath} from './qa-capture-paths.mjs';
import {RISK_LEVELS,TARGET_WINDOW_TRAIL_METERS,createRiskPolicyState,decideRiskAction,visibleLaneFromHud} from './runtime/risk-policy.mjs';
const build=JSON.parse(await readFile(path.join(RUN,'build-receipt.json'),'utf8'));
const mode=process.argv[2]??'campaign',engine=process.env.QA_ENGINE??'webkit';
const qaDir=path.join(RUN,'attempts',`attempt-${build.attempt}`,'qa-'+mode+'-'+engine);await mkdir(qaDir,{recursive:true});
const driver=await readFile(new URL(import.meta.url));await writeFile(path.join(qaDir,'driver-source.mjs'),driver);
await json(path.join(qaDir,'driver-provenance.json'),{path:'tools/lean-pilot/pelican-v2/qa.mjs',snapshot:path.relative(RUN,path.join(qaDir,'driver-source.mjs')),sha256:sha(driver),buildHash:build.buildHash,normalInputOnly:true});
const server=await serve(),base='http://127.0.0.1:'+server.address().port+'/game/index.html';
const browser=await (engine==='chromium'?chromium:webkit).launch(browserOptions(engine));
const report={schemaVersion:1,targetGame:'鹈鹕海岸冒险',workspace:WORKSPACE,buildHash:build.buildHash,attempt:build.attempt,runtime:engine+' desktop touch emulation; not physical mobile',mode,normalInputOnly:true,stateInjection:false,checks:[],actions:[],screenshots:[],errors:[],levels:[],driveBudgets:[],physicalIPhone:'NOT_RUN',liveAds:'NOT_RUN',startedAt:new Date().toISOString(),passed:false};
let context,page,navs=0,captureSection='setup';
const segments=[];let checkStart=0,shotStart=0,errorStart=0;
function segment(name){segments.push({name,checkStart,checkEnd:report.checks.length,shotStart,shotEnd:report.screenshots.length,actionEnd:report.actions.length,errorStart,errorEnd:report.errors.length});checkStart=report.checks.length;shotStart=report.screenshots.length;errorStart=report.errors.length;}
const ROAD_EDGE_FOR_QA=2.15;
const check=(name,passed,evidence)=>{report.checks.push({name,passed:passed===true,evidence});console.log(JSON.stringify({name,passed,evidence}));};
const shot=async name=>{const p=path.join(qaDir,capturePath(captureSection,name));await mkdir(path.dirname(p),{recursive:true});await page.screenshot({path:p});report.screenshots.push({path:path.relative(RUN,p),sha256:sha(await readFile(p))});};
const tap=async (selector,{fastReaction=false}={})=>{const before=await page.evaluate(()=>window.__coast.snapshot());const action={at:new Date().toISOString(),type:'tap',selector,before:{phase:before.phase,distance:before.distance,level:before.level}};report.actions.push(action);if(selector.startsWith('[data-action')&&before.phase!=='running')throw Error('Gameplay stopped: '+before.reason+' at '+before.distance+'m');const touchPoint=await tapVisible(page,selector);
 // A real touch is mandatory. Do not wait through software-rendered frames
 // before the next visible jump / lane decision.
 if(!fastReaction)await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
 const after=fastReaction?{...await page.evaluate(()=>({
  phase:document.querySelector('#coast')?.dataset.phase,
  distance:Number(document.querySelector('#co-distance')?.textContent?.match(/\d+/u)?.[0]??0),
 })),level:before.level}:await page.evaluate(()=>window.__coast.snapshot());Object.assign(action,{completedAt:new Date().toISOString(),touchPoint,after:{phase:after.phase,distance:after.distance,level:after.level},events:after.events?.slice(-2)});const route=selector.match(/^\[data-level="(\d+)"\]$/u);if(route){const selected=await page.locator('[data-level].selected').getAttribute('data-level');action.selectedLevel=selected;if(selected!==route[1])throw Error('Requested stage '+route[1]+' was not actually selected: '+selected);}};
const snapshot=()=>page.evaluate(()=>window.__coast.snapshot());
async function fresh(){context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:qaDpr(),recordVideo:{dir:qaDir,size:{width:390,height:844}}});page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('framenavigated',f=>{if(f===page.mainFrame())navs++;});
 await page.addInitScript(()=>{window.__qaFrames=[];let prev;const f=t=>{if(prev&&window.__qaFrames.length<100000)window.__qaFrames.push(t-prev);prev=t;requestAnimationFrame(f);};requestAnimationFrame(f);});await page.goto(base);await page.waitForSelector('#coast[data-loaded="true"]');}
const view=async()=>{
 const raw=await page.evaluate(()=>({
  phase:document.querySelector('#coast').dataset.phase,
  distance:Number(document.querySelector('#co-distance')?.textContent?.match(/^\d+/u)?.[0]??0),
  lane:[...document.querySelectorAll('.co-lane-indicator i')].findIndex(node=>node.classList.contains('on')),
  lanes:[...document.querySelectorAll('.co-lane')].map(node=>({className:node.className,text:node.textContent.trim()})),
  goldCounter:Number(document.querySelector('#co-mastery [data-goal="gold"]')?.textContent?.match(/\d+/u)?.[0]??NaN),
  jumpReady:document.querySelector('[data-action="jump"]')?.classList.contains('ready')===true,
  nowMs:performance.now(),
 }));
 return {...raw,laneIndex:raw.lane,lanes:raw.lanes.map(visibleLaneFromHud)};
};
async function drive({maxMs,stage=0,stopAtDistance=Infinity,avoidFish=false}={}){
 // Host software WebGL can run below real-time. Bound wall time by authored ride length;
 // never accelerate game simulation, inject scores or fabricate unlocks.
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const wallStarted=Date.now(),budgetMs=campaignWallBudgetMs(stage,maxMs),end=wallStarted+budgetMs;let lastTap=0,nearShot=false;
 const authored=Number.isInteger(stage)?RISK_LEVELS.find(level=>level.id===stage):null;
 const rewardTargets=authored?.targets??[];let targetIndex=0;
 let policyState=rewardTargets.length?createRiskPolicyState(stage,rewardTargets[0]):null;
 const finish=async status=>{
  const result=await snapshot();
  report.driveBudgets.push({stage,status,budgetMs,wallElapsedMs:Date.now()-wallStarted,gameElapsedSeconds:result.elapsed??null,
   distance:result.distance??null,phase:result.phase,reason:result.reason??null});
  return result;
 };
 while(Date.now()<end){const v=await view();if(v.phase==='finished'||v.distance>=stopAtDistance)return finish(v.phase==='finished'?'settled':'distance-reached');if(v.phase==='paused'){await tap('#co-resume');continue;}
  const imminent=i=>v.lanes[i]?.danger&&Number(v.lanes[i].text.match(/(\d+(?:\.\d+)?)s/)?.[1]??99)<=4;
  let decision=null;
  if(!avoidFish&&policyState){
   // This independent unlock/save/replay runner previously NEVER pressed jump.
   // Read public HUD + READY class; normal Playwright touchscreen input only.
   while(targetIndex<rewardTargets.length-1&&
    v.distance>rewardTargets[targetIndex].distance+TARGET_WINDOW_TRAIL_METERS&&
    policyState.stage!=='capture'){
    targetIndex++;policyState=createRiskPolicyState(stage,rewardTargets[targetIndex]);
   }
   decision=decideRiskAction(v,policyState);policyState=decision.state;
   if(['left','right','jump'].includes(decision.action)){
    await tap(`[data-action="${decision.action}"]`,{fastReaction:true});lastTap=Date.now();
    if(decision.action==='left'||decision.action==='right')
     await page.waitForFunction(expected=>[...document.querySelectorAll('.co-lane-indicator i')]
      .findIndex(node=>node.classList.contains('on'))===expected,decision.toLane,{timeout:1800});
   }
  }else{
   let want=v.lane;
   if(imminent(v.lane)){const safe=[0,1,2].filter(i=>!imminent(i));want=safe.find(i=>v.lanes[i].fish)??safe.sort((a,b)=>Math.abs(a-v.lane)-Math.abs(b-v.lane))[0]??v.lane;}
   else{const fish=v.lanes.findIndex((l,i)=>l.fish&&!imminent(i));if(fish>=0)want=fish;}
   if(avoidFish){const safe=[0,1,2].filter(i=>!imminent(i)&&!v.lanes[i].fish);if(safe.length)want=safe.includes(v.lane)?v.lane:safe.sort((a,b)=>Math.abs(a-v.lane)-Math.abs(b-v.lane))[0];}
   if(want!==v.lane&&!imminent(v.lane)&&imminent(v.lane+Math.sign(want-v.lane)))want=v.lane;
   if(Date.now()-lastTap>180&&want!==v.lane){await tap(`[data-action="${want<v.lane?'left':'right'}"]`);lastTap=Date.now();}
  }
  // The separate risk QA records every true barrier prize. This screenshot
  // should not block a timed input while the CURRENT player lane is at risk.
  if(!nearShot&&v.lanes.some(l=>l.danger&&Number(l.text.match(/(\d+(?:\.\d+)?)s/)?.[1]??99)<=3)
     &&(!decision||decision.action==='wait'&&!v.lanes[v.lane]?.danger)){
   nearShot=true;await shot('level-'+stage+'-hazard');
  }
  await page.waitForTimeout(90);
 }
 const result=await finish('runner-wall-budget-exhausted');
 check('wall-budget-exhausted-level-'+stage,false,{budgetMs,wallMs:Date.now()-wallStarted,phase:result.phase,reason:result.reason,
  gameElapsedSeconds:result.elapsed,distance:result.distance,note:'Did not settle; no fast forward or score injection.'});
 await shot('level-'+stage+'-wall-budget').catch(()=>{});
 return result;
}
// V7 has a real centre barrier at 35m, LEFT car at 52m and RIGHT car at 63m.
// A completely idle waitDistance(66/115) now *must* fail. These are ordinary
// public touchscreen taps, not model-state mutation or collision bypass.
// Returning to centre by 42m also keeps the right-hand vehicle genuinely lethal.
async function clearV7Opening(target){
 if(target<66||target>115)throw Error('Opening detour target out of scope '+target);
 await waitDistance(20);await tap('[data-action="left"]');
 await waitDistance(42);await tap('[data-action="right"]');
 await waitDistance(target);
 const result=await snapshot();
 check('v7-opening-three-beat-escape-'+target,
  result.phase==='running'&&
  result.events.some(e=>e.type==='barrier-cleared'&&e.objectId==='l1-o10'&&!e.jumped)&&
  result.events.some(e=>e.type==='obstacle-avoided'&&e.objectId==='l1-o11')&&
  result.events.some(e=>e.type==='obstacle-avoided'&&e.objectId==='l1-o12'),
  {distance:result.distance,lane:result.lane,events:result.events.filter(e=>['barrier-cleared','obstacle-avoided'].includes(e.type)).slice(-6)});
 return result;
}
async function waitDistance(target,maxMs=70000){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const end=Date.now()+maxMs;while(Date.now()<end){const v=await view();if(v.phase==='finished')throw Error('Finished before '+target);if(v.distance>=target)return;await page.waitForTimeout(40);}throw Error('Distance timeout '+target);}
try{
 await fresh();await shot('menu');check('locked-new-save',await page.locator('[data-level="2"]').isDisabled(),{newBrowser:true});
 if(mode==='campaign'||mode==='all'){
  captureSection='campaign';
  const firstStarted=Date.now();await tap('#co-start');await page.waitForFunction(()=>Number(document.querySelector('#co-fish')?.textContent.match(/^\d+/)?.[0]??0)>0,null,{timeout:20000});await shot('first-fish');const first=await snapshot(),firstEvent=first.events.find(e=>e.type==='fish-caught'&&e.first);check('first-seconds-objective-and-fish',first.count>=1&&firstEvent?.at<3,{count:first.count,elapsed:first.elapsed,firstCatchGameSeconds:firstEvent?.at,runnerWallMs:Date.now()-firstStarted,note:'Actual first event time, with runner wall time kept separate; software-renderer wall delay is not phone performance.'});
  const ri=await page.evaluate(()=>window.__coast.renderInfo());check('renderer-composer-resolution',ri.pixelRatio>=Math.min(1.25,qaDpr())&&ri.canvas[0]===ri.composer[0]&&ri.canvas[1]===ri.composer[1],ri);
  await tap('#co-pause');const before=await snapshot();await page.waitForTimeout(1100);const after=await snapshot();check('pause-freezes-world-and-timer',before.distance===after.distance&&before.elapsed===after.elapsed,{before,after});await shot('pause');await tap('#co-resume');
  for(let id=1;id<=5;id++){
   if(id>1){await tap('#co-next');await page.waitForTimeout(1500);}
   await shot('level-'+id+'-start');
    const fill=await page.evaluate(()=>window.__coast.renderInfo().duskRoadAmbient);
    check('real-road-fill-level-'+id,id===5?(fill>=.5&&fill<=.8):(fill===0),{level:id,fill,source:'actual rendered Three.js ambient light'});
    const navigationBefore=navs;
   const frameStart=await page.evaluate(()=>window.__qaFrames.length);const result=await drive({stage:id});const frames=await page.evaluate(n=>window.__qaFrames.slice(n+10),frameStart);const sorted=frames.filter(n=>n>0).sort((a,b)=>a-b);result.performance={frameCount:sorted.length,meanFps:1000/(sorted.reduce((a,b)=>a+b,0)/sorted.length),p95Ms:sorted[Math.floor(sorted.length*.95)],scope:'Natural default-speed running route between visible start and settlement'};report.levels.push(result);await shot('level-'+id+'-terminal');
   check('natural-level-'+id,result.phase==='finished'&&result.reason==='complete',{count:result.count,gold:result.gold,distance:result.distance,elapsed:result.elapsed,events:result.events,save:result.save});
   const resultText=await page.locator('#co-copy').innerText(),bestScore=result.save?.best?.[id-1]?.score;
   check('earned-score-visible-and-saved-'+id,
    Number.isFinite(result.rewardScore)&&resultText.includes('本局得分 '+result.rewardScore)&&
    resultText.includes('历史最高 '+bestScore),
    {score:result.rewardScore,bestScore,resultText});
   check('no-full-page-reload-level-'+id,navs===navigationBefore,{before:navigationBefore,after:navs});
   if(result.reason!=='complete')break;
  }
  const finished=await snapshot();if(finished.reason==='complete'&&finished.level===5){
   // A real ad SDK is not connected. There must be no tappable fake reward
   // action: verify hidden controls, the honest local status, and free replay.
   const beforeUnavailable=await snapshot();
   const adControls={
    extraHidden:await page.locator('#co-ad').isHidden(),
    reviveHidden:await page.locator('#co-revive').isHidden(),
    retryEnabled:await page.locator('#co-replay').isVisible()&&await page.locator('#co-replay').isEnabled(),
    status:await page.locator('#co-storage').innerText()
   };
   check('unintegrated-ads-hidden-free-replay-available',
    adControls.extraHidden&&adControls.reviveHidden&&adControls.retryEnabled&&adControls.status.includes('广告未接入'),adControls);
   await page.waitForTimeout(250);
   const afterUnavailable=await snapshot();
   check('unavailable-ads-never-create-currency-or-revive',
    beforeUnavailable.phase==='finished'&&afterUnavailable.phase==='finished'&&
    beforeUnavailable.revives===afterUnavailable.revives&&
    beforeUnavailable.reward.bank===afterUnavailable.reward.bank&&
    beforeUnavailable.collection.coins===afterUnavailable.collection.coins,
    {before:{revives:beforeUnavailable.revives,bank:beforeUnavailable.reward.bank,coins:beforeUnavailable.collection.coins},
     after:{revives:afterUnavailable.revives,bank:afterUnavailable.reward.bank,coins:afterUnavailable.collection.coins}});
   const prior=navs;await tap('#co-replay');await page.waitForTimeout(1000);check('in-memory-replay',navs===prior&&(await snapshot()).phase==='running',{navigationBefore:prior,navigationAfter:navs});
   await tap('#co-pause');await page.reload();await page.waitForSelector('#coast[data-loaded="true"]');const saved=await snapshot();check('refresh-keeps-five-unlocked',saved.save.unlocked===5&&saved.save.completed.every(Boolean),saved);const startLabel=await page.locator('#co-start').innerText();check('restored-selected-level-label',await page.locator('[data-level="5"]').evaluate(n=>n.classList.contains('selected'))&&startLabel.includes('夜间赶海'),{startLabel,unlocked:saved.save.unlocked});await shot('all-unlocked');
  }
  const frames=await page.evaluate(()=>window.__qaFrames);if(frames.length){const sorted=frames.slice(10).sort((a,b)=>a-b);report.performance={frameCount:sorted.length,meanFps:1000/(sorted.reduce((a,b)=>a+b,0)/sorted.length),p95Ms:sorted[Math.floor(sorted.length*.95)],note:'Ready frames after refresh only; do not infer gameplay FPS. Per-level natural performance is recorded in levels[].performance.'};}
  segment('campaign');if(mode==='all'&&report.levels.filter(l=>l.reason==='complete').length!==5)throw Error('Five natural unlocks required before continuing');
 }
 if(mode==='collisions'||mode==='all'){
  captureSection='collisions';
  // Observe DOM presentation on each render frame. A slow inspection RPC
  // after failure cannot decide whether the earlier 650ms crash was visible.
  await page.evaluate(()=>{
   window.__qaCrashFrames=[];const observe=t=>{
    const root=document.querySelector('#coast'),modal=document.querySelector('#co-modal'),crash=document.querySelector('#co-crash');
    if(root?.dataset.phase==='finished'&&crash?.classList.contains('active')){
     const style=window.getComputedStyle(modal);window.__qaCrashFrames.push({at:t,crashing:root.classList.contains('crashing'),modalHidden:modal.hidden||style.visibility==='hidden'||style.display==='none'});
    }
    if(window.__qaCrashFrames.length<300)requestAnimationFrame(observe);
   };requestAnimationFrame(observe);
  });
  // Unlock exclusively through the same visible campaign. No save seeding.
  if(mode==='all'){await tap('[data-level="3"]');await tap('#co-start');}else{await tap('#co-start');for(let id=1;id<=2;id++){const r=await drive({stage:id});check('unlock-prerequisite-'+id,r.reason==='complete',r);if(r.reason!=='complete')throw Error('Unlock prerequisite failed');await tap('#co-next');}}
  // Center-lane first vehicle deliberately left unavoided with normal input.
  // V7's genuine 37m centre barrier now blocks an idle rider before
   // the original 100m vehicle. Use real lane controls to pass the
   // opening, then return to centre and deliberately hit that car.
   await tap('[data-action="left"]');
   await page.waitForFunction(()=>{const v=window.__coast.snapshot();return v.phase==='finished'||v.distance>=45},null,{timeout:11000});
   const opening=await snapshot();
   check('vehicle-impact-test-survives-V7-opening',opening.phase==='running'&&opening.distance>=45&&
    opening.events.some(e=>e.type==='barrier-cleared'&&e.objectId==='l3-o16'&&!e.jumped),
    {phase:opening.phase,distance:opening.distance,events:opening.events.slice(-6)});
   await tap('[data-action="right"]');
   await shot('vehicle-warning');
   // The read-only animation-frame observer was armed BEFORE the drive.
   // Wait for terminal status, never for a fleeting CSS crash class
   // after screenshot latency has already elapsed.
   await page.waitForFunction(()=>document.querySelector('#coast')?.dataset.phase==='finished',null,{timeout:20000});
   await shot('vehicle-accident');const crash=await snapshot();await page.locator('#co-modal').waitFor({state:'visible'});const presentation=await page.evaluate(()=>window.__qaCrashFrames);const visibleFrames=presentation.filter(f=>f.crashing&&f.modalHidden),visibleSpanMs=(visibleFrames.at(-1)?.at??0)-(visibleFrames[0]?.at??0);check('accident-visible-before-settlement',visibleFrames.length>=4&&visibleSpanMs>=180,{phase:crash.phase,reason:crash.reason,settlementInitiallyHidden:visibleFrames.length>0,visibleSpanMs,frames:presentation,note:'Continuous read-only DOM frames verify the actual crash display; later RPC latency is not used as a visibility assertion.'});await shot('vehicle-impact');check('car-ends-round',crash.reason==='vehicle',crash);
  await page.waitForTimeout(1200);const frozen=await snapshot();check('crash-freezes-score',frozen.count===crash.count&&frozen.distance===crash.distance,{crash,frozen});
  const n=navs;await tap('#co-replay');await page.waitForTimeout(700);check('failure-replay-without-navigation',navs===n&&(await snapshot()).phase==='running',{navigationCount:navs});await tap('#co-pause');await tap('#co-select');await tap('[data-level="1"]');await tap('#co-start');
  // Exact crossing position: two right nudges from neutral reach the outer
  // road, rather than assuming a fractional 1.18m nudge is a lane centre.
  await clearV7Opening(66);await tap('[data-action="right"]');await tap('[data-action="right"]');await page.waitForFunction(()=>window.__coast.snapshot().stun>2.7,null,{timeout:15000});const ped=await snapshot();
  // Read the actual timer before software PNG capture can consume the stun.
  await page.waitForTimeout(800);const waiting=await snapshot();
  check('pedestrian-stops-but-countdown-runs',
   waiting.phase==='running'&&waiting.distance===ped.distance&&
   waiting.elapsed>ped.elapsed+.45&&waiting.stun>0&&waiting.stun<ped.stun,{ped,waiting});
  await shot('pedestrian-fall');await shot('pedestrian-wait');await page.waitForTimeout(1000);await shot('pedestrian-rising');// Do not idle 1.2 seconds on a moving roadway after recovery: the next
   // physical obstacle is close. Observe actual recovery, make a trusted
   // pause touch immediately, then do slow screenshot/acceptance work safely.
   await page.waitForFunction(minDistance=>{const r=window.__coast.snapshot();return r.phase==='running'&&r.stun===0&&r.distance>minDistance},waiting.distance,{timeout:7000});
   const recovered=await snapshot();await tap('#co-pause');const pausedAfterRecovery=await snapshot();
   await shot('pedestrian-recovery');
   check('pedestrian-recovers-once',recovered.phase==='running'&&recovered.distance>waiting.distance&&
    recovered.events.filter(e=>e.type==='pedestrian-hit').length===1&&pausedAfterRecovery.phase==='paused',
    {recovered,pausedAfterRecovery});
   await page.waitForTimeout(240);const stillPaused=await snapshot();
   check('recovered-rider-pauses-without-extra-vehicle-impact',
    stillPaused.phase==='paused'&&stillPaused.distance===pausedAfterRecovery.distance&&
    stillPaused.elapsed===pausedAfterRecovery.elapsed&&stillPaused.events.filter(e=>e.type==='failed').length===0,
    {pausedAfterRecovery,stillPaused});
  // V4 route keeps every new hazard. Detour around 140, pass the new centre
  // car on its right, then return only after the 205m left barrier.
  // A real one-touch fractional lane/gauge check belongs on open tarmac.
  // The post-prize car at ~257m is deliberately dangerous and must remain so.
  await tap('#co-replay');await waitDistance(12);
  const before=await snapshot(),action=before.laneTarget>.7?'left':'right';
  await tap(`[data-action="${action}"]`);await page.waitForTimeout(1000);
  const moved=await snapshot(),expected=Math.max(-ROAD_EDGE_FOR_QA,
   Math.min(ROAD_EDGE_FOR_QA,before.laneTarget+(action==='right'?1.18:-1.18)));
  check('one-touch-fractional-road-position',
   Math.abs(moved.laneTarget-expected)<.04&&Math.abs(moved.lane-expected)<.08,
   {before,action,expected,moved});
  const gauge=await page.locator('.co-lane-indicator').evaluate(el=>({
   width:el.getBoundingClientRect().width,
   position:Number.parseFloat(window.getComputedStyle(el).getPropertyValue('--co-position')),
   laneMarkOpacity:Number.parseFloat(window.getComputedStyle(el.querySelector('i')).opacity)
  }));
  const expectedGauge=(moved.lane+ROAD_EDGE_FOR_QA)/(2*ROAD_EDGE_FOR_QA)*100;
  check('continuous-position-gauge-shows-actual-fractional-road-location',
   gauge.width>=100&&gauge.laneMarkOpacity===0&&Number.isFinite(gauge.position)&&
   Math.abs(gauge.position-expectedGauge)<=1,
   {gauge,actualLane:moved.lane,expectedGauge});
  await shot('fractional-road-position-before-traffic');
  // Fresh native replay restores the identical high-pressure detour at 115m.
  await tap('#co-pause');await tap('#co-replay');await clearV7Opening(115);await tap('[data-action="left"]');await waitDistance(145);await tap('[data-action="right"]');await tap('[data-action="right"]');await waitDistance(208);await tap('[data-action="left"]');await waitDistance(217);await tap('[data-action="jump"]');// The 233m barrier only clears after the actual bike passes ~234m.
  // Its real +9m prize is caught around 241m, not at 237m. Only accept
  // visible, physically earned events after those distances.
  await waitDistance(231);await shot('barrier-jump');await waitDistance(235);const jumped=await snapshot();check('visible-barrier-jump-clears',jumped.phase==='running'&&jumped.events.some(e=>e.type==='barrier-cleared'&&e.objectId==='l1-o3'&&e.jumped),jumped);await shot('barrier-cleared');await waitDistance(244);const prize=await snapshot();check('authored-barrier-prize-caught',prize.events.some(e=>e.type==='fish-caught'&&e.objectId==='l1-jump-l1-o3'&&e.bonus&&e.golden),prize);await shot('authored-barrier-prize');
  // Public touch nudges to fractional metres instead of forcing a road lane center.

  segment('collisions');
 }
 if(mode==='safety'||mode==='all'){
  captureSection='safety';
  if(mode==='all'){await tap('#co-pause');await tap('#co-select');await tap('[data-level="3"]');await tap('#co-start');}else{await tap('#co-start');for(let id=1;id<=2;id++){const r=await drive({stage:id});check('unlock-prerequisite-'+id,r.reason==='complete',r);if(r.reason!=='complete')throw Error('Unlock prerequisite failed');await tap('#co-next');}}
  const approach=await drive({stage:3,stopAtDistance:185});check('van-target-distance-reached',approach.distance>=185&&approach.level===3,approach);while((await view()).lane<2)await tap('[data-action="right"]');await shot('van-approach');
  await page.waitForSelector('#coast[data-phase="finished"]',{timeout:15000});const van=await snapshot();await shot('van-impact');check('van-ends-round',van.reason==='vehicle'&&van.events.some(e=>e.type==='failed'&&e.kind==='van'),van);
  await tap('#co-replay');await waitDistance(80);await tap('[data-action="jump"]');await page.waitForSelector('#coast[data-phase="finished"]',{timeout:6000});const airborne=await snapshot();await shot('car-not-jumpable');check('car-not-jumpable',airborne.reason==='vehicle'&&airborne.y>.31,airborne);
  await tap('#co-select');await tap('[data-level="1"]');await tap('#co-start');const short=await drive({stage:'fish-short',avoidFish:true});await shot('distance-without-fish-fails');check('distance-and-fish-jointly-required',short.distance===300&&short.reason==='fish-short'&&short.count<8,short);
  // Real tab focus change, no visibility event dispatch or lifecycle injection.
  await tap('#co-replay');await page.waitForTimeout(1000);const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();await page.waitForTimeout(1000);await page.bringToFront();await other.close();const background=await snapshot();await shot('background-return');check('tab-blur-pauses',background.phase==='paused'&&background.pausedBySystem,background);
  if(background.phase==='paused')await tap('#co-resume');await page.waitForTimeout(400);const resumed=await snapshot();check('background-manual-resume',background.phase==='paused'&&background.pausedBySystem&&resumed.phase==='running'&&resumed.distance>background.distance,resumed);
  // Repeat the exact same natural crash/replay branch, checking bounded GPU resources.
  await tap('#co-pause');await tap('#co-select');await tap('[data-level="3"]');await tap('#co-start');const memory=[];
  for(let i=0;i<6;i++){await page.waitForSelector('#coast[data-phase="finished"]',{timeout:20000});memory.push(await page.evaluate(()=>window.__coast.renderInfo().memory));await tap('#co-replay');}
  report.memoryReplaySamples=memory;check('replay-resources-plateau',memory.slice(2).every(m=>m.geometries===memory[2].geometries&&m.textures===memory[2].textures),memory);
  segment('safety');
 }
 if(!['campaign','collisions','safety','all'].includes(mode))throw Error('Unknown QA mode '+mode);
}catch(e){report.errors.push(e.stack);if(page&&!page.isClosed())report.failureSnapshot=await snapshot().catch(()=>null);console.log('QA_ERROR '+e.stack);}
finally{
 report.passed=report.checks.length>0&&report.checks.every(c=>c.passed)&&report.errors.length===0;report.finishedAt=new Date().toISOString();
 report.segments=segments;await context?.close();await browser.close();server.close();await json(path.join(qaDir,'report.json'),report);
 // One fresh browser may execute all sections serially. Unlocks are earned through its
 // preceding campaign; each projection keeps that complete normal-input action prefix.
 if(mode==='all')for(const part of segments){const checks=report.checks.slice(part.checkStart,part.checkEnd),errors=report.errors.slice(part.errorStart,part.errorEnd);const value={...report,mode:part.name,sourceCapture:path.relative(RUN,path.join(qaDir,'report.json')),checks,errors,downstreamCaptureErrors:report.errors,actions:report.actions.slice(0,part.actionEnd),screenshots:report.screenshots.slice(part.shotStart,part.shotEnd),levels:part.name==='campaign'?report.levels:[],passed:checks.every(c=>c.passed)&&errors.length===0};const dir=path.join(RUN,'attempts',`attempt-${build.attempt}`,'qa-'+part.name+'-'+engine);await json(path.join(dir,'report.json'),value);}
 console.log('QA_REPORT '+path.join(qaDir,'report.json')+' passed='+report.passed);if(!report.passed)process.exitCode=1;
}
