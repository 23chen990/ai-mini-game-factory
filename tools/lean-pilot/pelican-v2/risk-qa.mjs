/* global process,console,window,document,requestAnimationFrame,performance,Element */
import {webkit,chromium} from '@playwright/test';
import {mkdtemp,mkdir,readFile,rename,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {RUN,WORKSPACE,json,sha} from './prepare.mjs';
import {serve} from './serve.mjs';
import {browserOptions,qaDpr} from './browser-options.mjs';
import {LEVELS} from './runtime/levels.mjs';
import {CAPTURE_HOLD_MS,JUMP_WINDOW_SECONDS,RISK_LEVELS,authoredGoldenFishByBarrier,createRiskPolicyState,decideRiskAction,visibleLaneFromHud} from './runtime/risk-policy.mjs';

const engine=process.env.QA_ENGINE??'webkit';
if(!['webkit','chromium'].includes(engine))throw Error('QA_ENGINE must be webkit or chromium');
const build=JSON.parse(await readFile(path.join(RUN,'build-receipt.json'),'utf8'));
const qaDir=path.join(RUN,'attempts',`attempt-${build.attempt}`,`risk-${engine}`);
await mkdir(qaDir,{recursive:true});
const report={
 schemaVersion:1,targetGame:'鹈鹕海岸冒险',workspace:WORKSPACE,buildHash:build.buildHash,attempt:build.attempt,engine,
 runtime:`${engine} desktop browser with 390×844 mobile touch emulation at DPR ${qaDpr()}; not physical mobile`,
 performanceEvidenceNote:'Read-only RAF and renderer observations from desktop browser emulation; not physical-device proof.',
 inputDecisionSource:'Visible HUD distance, radar text/classes, lane indicator and harness elapsed time for the 2.6-second capture hold.',
 snapshotRole:'Acceptance and evidence only; snapshots never feed risk-policy input decisions.',
 storagePersistence:'A new temporary persistent browser profile is reused across per-level browser restarts; no storageState or direct save writes are used.',
 normalInputOnly:true,stateInjection:false,checks:[],actions:[],decisions:[],screenshots:[],snapshots:[],levels:[],videos:[],errors:[],passed:false,
 safeDetourComparison:{status:'NOT_RUN_BY_RISK_QA',owner:'main-thread',command:'node tools/lean-pilot/pelican-v2/qa.mjs all',scope:'five-level campaign without optional jump-gold attempts; this worker did not execute or claim this comparison'},
 startedAt:new Date().toISOString(),finishedAt:null,
};
const authoredBonusFishByBarrier=authoredGoldenFishByBarrier(LEVELS);
const browserType=engine==='chromium'?chromium:webkit;
const server=await serve();
const base='http://127.0.0.1:'+server.address().port+'/game/index.html';
const profileDir=await mkdtemp(path.join(tmpdir(),'pelican-risk-profile-'));
let activeContext=null,activePage=null,activeLevelId=null,nextSnapshotId=1;
const check=(name,passed,evidence)=>{report.checks.push({name,passed:passed===true,evidence});console.log(JSON.stringify({name,passed:passed===true}));};
const slug=text=>String(text).toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,'');
for(const level of RISK_LEVELS){
 for(const target of level.targets){
  const authoredFishId=authoredBonusFishByBarrier[`${level.id}:${target.barrierId}`]??null;
  check(`authored-level-${level.id}-${target.barrierId}-exact-golden-fish`,authoredFishId===target.goldFishId,{barrierId:target.barrierId,expectedFishId:target.goldFishId,authoredFishId,source:'read-only authored LEVELS fish.sourceObstacleId -> fish.id'});
 }
}

async function readSnapshot(page){return page.evaluate(()=>window.__coast.snapshot());}
async function recordSnapshot(page,label,{levelId=activeLevelId,targetBarrierId=null,value=null}={}){
 const snapshot=value??await readSnapshot(page);
 const item={id:`snapshot-${nextSnapshotId++}`,at:new Date().toISOString(),label,levelId,targetBarrierId,value:snapshot};
 report.snapshots.push(item);return item;
}
async function visibleHud(page){
 return page.evaluate(()=>{
  const text=selector=>document.querySelector(selector)?.textContent?.trim()??'';
  return {title:text('#co-title'),distance:text('#co-distance'),fish:text('#co-fish'),goldAndFishGoal:text('#co-fish-label'),goldFeedback:text('#co-feedback strong'),goldFeedbackDetail:text('#co-feedback small'),time:text('#co-time'),lane:[...document.querySelectorAll('.co-lane-indicator i')].findIndex(node=>node.classList.contains('on'))};
 });
}
async function readVisibleView(page){
 const raw=await page.evaluate(()=>{
  const root=document.querySelector('#coast');
  const distanceText=document.querySelector('#co-distance')?.textContent??'';
  const distance=Number(distanceText.match(/\d+/)?.[0]??0);
  const lanes=[...document.querySelectorAll('.co-lane')].map(node=>{
   return {className:node.className,text:node.textContent.trim()};
  });
  return {phase:root?.dataset.phase??'missing',levelTitle:document.querySelector('#co-title')?.textContent?.trim()??'',distance,laneIndex:[...document.querySelectorAll('.co-lane-indicator i')].findIndex(node=>node.classList.contains('on')),lanes,nowMs:performance.now()};
 });
 return {...raw,lanes:raw.lanes.map(visibleLaneFromHud)};
}
async function shot(page,name,{levelId=activeLevelId,targetBarrierId=null,kind='runtime'}={}){
 const file=path.join(qaDir,slug(name)+'.png');
 await page.screenshot({path:file});
 const item={at:new Date().toISOString(),levelId,targetBarrierId,kind,path:path.relative(RUN,file),sha256:sha(await readFile(file))};
 report.screenshots.push(item);return item;
}
async function tap(page,selector,{levelId=activeLevelId,targetBarrierId=null,decisionView=null,decision:policyDecision=null}={}){
 const touchStart=await page.evaluate(()=>window.__riskTouchEvidence?.length??0);
 const before=await recordSnapshot(page,'before-touch-tap',{levelId,targetBarrierId});
 const action={at:new Date().toISOString(),type:'touch-tap',input:'Playwright locator.tap',selector,levelId,targetBarrierId,normalInputOnly:true,stateInjection:false};
 if(decisionView)action.visibleDecisionView=decisionView;
 if(policyDecision)action.policyDecision=policyDecision;
 report.actions.push(action);
 if(selector.startsWith('[data-action')&&before.value.phase!=='running')throw Error('Gameplay stopped: '+before.value.reason+' at '+before.value.distance+'m');
  const rect=await page.locator(selector).evaluate(n=>{const b=n.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2,w:b.width,h:b.height,disabled:n.disabled};});
  if(rect.w<=0||rect.h<=0||rect.disabled)throw Error('Untouchable control '+selector);
  await page.touchscreen.tap(rect.x,rect.y);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const after=await recordSnapshot(page,'after-touch-tap',{levelId,targetBarrierId});
 const touches=await page.evaluate(start=>window.__riskTouchEvidence?.slice(start)??[],touchStart);
 action.completedAt=new Date().toISOString();action.beforeSnapshotId=before.id;action.afterSnapshotId=after.id;action.nativeTouchEvidence=touches;
 action.trustedTouch=touches.some(event=>event.pointerType==='touch'&&event.isTrusted===true);
 action.visibleViewAfter=await readVisibleView(page);
 return action;
}
function makeEpisode(target){
 return {barrierId:target.barrierId,goldFishId:target.goldFishId,distance:target.distance,hudSeen:false,hudLane:null,hudSnapshotId:null,approachScreenshot:null,jump:null,holdComplete:false,holdDurationMs:null,holdSamples:[],barrierClearSnapshotId:null,bonusFishCatchSnapshotId:null,goldHud:null,screenshots:[]};
}
function eventFor(snapshot,type,objectId){return snapshot.events?.find(event=>event.type===type&&event.objectId===objectId)??null;}
async function saveEvidenceShot(page,episode,kind){
 const image=await shot(page,`level-${activeLevelId}-${episode.barrierId}-${kind}`,{levelId:activeLevelId,targetBarrierId:episode.barrierId,kind});
 episode.screenshots.push(image.path);return image;
}
function summarizeFrames(samples){
 const times=samples.map(sample=>sample.deltaMs).filter(value=>Number.isFinite(value)&&value>0);
 if(!times.length)return {frameCount:0,meanFPS:null,p95FrameMs:null,p95FPS:null};
 const mean=times.reduce((sum,value)=>sum+value,0)/times.length,sorted=[...times].sort((a,b)=>a-b);
 const p95FrameMs=sorted[Math.ceil(sorted.length*.95)-1];
 return {frameCount:times.length,meanFPS:Number((1000/mean).toFixed(2)),p95FrameMs:Number(p95FrameMs.toFixed(2)),p95FPS:Number((1000/p95FrameMs).toFixed(2))};
}

async function captureVideo(page,context,levelId,videoHandle){
 await page.close();
 await context.close();
 const source=await videoHandle.path();
 const destination=path.join(qaDir,`level-${levelId}.webm`);
 await rename(source,destination);
 const item={levelId,path:path.relative(RUN,destination),sha256:sha(await readFile(destination))};
 report.videos.push(item);return item;
}

async function runLevel(level){
 activeLevelId=level.id;
 activeContext=await browserType.launchPersistentContext(profileDir,{
  ...browserOptions(engine),viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:qaDpr(),
  recordVideo:{dir:qaDir,size:{width:390,height:844}},
 });
 activePage=await activeContext.newPage();
 const page=activePage,videoHandle=page.video();
 const result={id:level.id,name:level.name,weather:level.weather,targetEpisodes:level.targets.map(makeEpisode),hudStart:null,hudFinish:null,terminal:null,renderInfo:null,performance:null,video:null,errors:[]};
 report.levels.push(result);
 page.on('pageerror',error=>{const item={levelId:level.id,message:error.message,stack:error.stack};result.errors.push(item);report.errors.push(item);});
 await page.addInitScript(()=>{
  window.__riskTouchEvidence=[];window.__riskRafSamples=[];
  document.addEventListener('pointerdown',event=>{
   if(event.pointerType!=='touch')return;
   const target=event.target instanceof Element?event.target.closest('[data-action],button')??event.target:event.target;
   window.__riskTouchEvidence.push({at:new Date().toISOString(),type:event.type,pointerType:event.pointerType,isTrusted:event.isTrusted,target:target?.getAttribute?.('data-action')?`data-action=${target.getAttribute('data-action')}`:target?.id||target?.tagName||'unknown'});
  },true);
  document.addEventListener('pointerup',event=>{
   if(event.pointerType!=='touch')return;
   const target=event.target instanceof Element?event.target.closest('[data-action],button')??event.target:event.target;
   window.__riskTouchEvidence.push({at:new Date().toISOString(),type:event.type,pointerType:event.pointerType,isTrusted:event.isTrusted,target:target?.getAttribute?.('data-action')?`data-action=${target.getAttribute('data-action')}`:target?.id||target?.tagName||'unknown'});
  },true);
  let previous=null;
  const sample=at=>{
   const running=document.querySelector('#coast')?.dataset.phase==='running';
   if(previous?.running&&running)window.__riskRafSamples.push({at,deltaMs:at-previous.at});
   previous={at,running};requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
 });
 try{
  await page.goto(base);await page.waitForSelector('#coast[data-loaded="true"]',{timeout:30000});
  const menu=await recordSnapshot(page,'fresh-menu',{levelId:level.id});
  const save=menu.value.save;
  check(`level-${level.id}-fresh-profile-unlocked`,save.unlocked>=level.id&&save.unlocked===level.id,{unlocked:save.unlocked,selectedLevel:await page.locator('[data-level].selected').getAttribute('data-level')});
  if(level.id===1)check('new-browser-starts-with-new-save',save.unlocked===1&&save.completed.every(value=>value===false),save);
  if(level.id>1)check(`level-${level.id}-prior-levels-earned`,save.completed.slice(0,level.id-1).every(Boolean),save);
  const levelButton=page.locator(`[data-level="${level.id}"]`);
  check(`level-${level.id}-route-button-visible`,await levelButton.isVisible()&&!(await levelButton.isDisabled()),{text:await levelButton.innerText()});
  await shot(page,`level-${level.id}-route-menu`,{levelId:level.id,kind:'visible-route-menu'});
  await tap(page,`[data-level="${level.id}"]`,{levelId:level.id});
  await tap(page,'#co-start',{levelId:level.id});
  await page.waitForTimeout(200);
  result.hudStart=await visibleHud(page);
  const titleHasName=result.hudStart.title.includes(level.name);
  const visibleGoldGoal=result.hudStart.goldAndFishGoal.includes('🌟')||(level.id===1&&result.hudStart.goldAndFishGoal.includes('🐟'));
  check(`level-${level.id}-visible-name-weather-gold-time`,titleHasName&&Boolean(result.hudStart.time)&&Boolean(result.hudStart.fish)&&visibleGoldGoal,{hud:result.hudStart,weather:level.weather,weatherEvidence:'full level HUD screenshot',goldGoalVisible:visibleGoldGoal,goldPresentation:level.id===1?'golden reward feedback after catch':'visible star count in goal HUD',goldRewardFeedbackCapturedPerTarget:true});
  result.startScreenshot=(await shot(page,`level-${level.id}-running-start`,{levelId:level.id,kind:'level-hud-and-weather'})).path;
  const intro=await recordSnapshot(page,'running-start-acceptance',{levelId:level.id});
  check(`level-${level.id}-running-started`,intro.value.phase==='running'&&intro.value.level===level.id,intro.value);
  result.rafStartAt=await page.evaluate(()=>performance.now());

  const episodes=result.targetEpisodes;
  let targetIndex=0,state=createRiskPolicyState(level.id,level.targets[0]);
  let terminal=null;
  const deadline=Date.now()+(Number(result.hudStart.time.match(/\d+/)?.[0]??100)+35)*1000;
  while(Date.now()<deadline){
   const view=await readVisibleView(page);
   if(view.phase==='finished')break;
   if(view.phase!=='running'){
    throw Error(`Unexpected non-running phase during natural journey: ${view.phase}`);
   }
   for(const capturedEpisode of episodes){
    if(!capturedEpisode.jump||capturedEpisode.holdComplete)continue;
    const holdElapsed=view.nowMs-capturedEpisode.jump.nowMs;
    if(view.laneIndex===capturedEpisode.jump.laneIndex&&holdElapsed<CAPTURE_HOLD_MS){
     capturedEpisode.holdSamples.push({at:new Date().toISOString(),nowMs:view.nowMs,distance:view.distance,laneIndex:view.laneIndex});
    }
    if(view.laneIndex===capturedEpisode.jump.laneIndex&&holdElapsed>=CAPTURE_HOLD_MS){
     capturedEpisode.holdComplete=true;capturedEpisode.holdDurationMs=Number(holdElapsed.toFixed(1));
    }
   }
   while(targetIndex<level.targets.length&&view.distance>level.targets[targetIndex].distance+14){
    targetIndex++;
    if(targetIndex<level.targets.length)state=createRiskPolicyState(level.id,level.targets[targetIndex]);
   }
   const target=level.targets[targetIndex]??null,episode=episodes[targetIndex]??null;
   const inEvidenceRange=target&&view.distance>=target.distance-55&&view.distance<=target.distance+15;
   if(inEvidenceRange||episode?.jump){
    const observed=await readSnapshot(page);
    if(episode){
     const targetLane=view.lanes.findIndex(lane=>lane.jumpReward&&lane.kind==='barrier');
     if(!episode.hudSeen&&view.distance>=target.distance-48&&view.distance<=target.distance+10&&targetLane>=0){
      episode.hudSeen=true;episode.hudLane=targetLane;
      const record=await recordSnapshot(page,'visible-jump-reward-radar',{levelId:level.id,targetBarrierId:target.barrierId,value:observed});episode.hudSnapshotId=record.id;
      episode.approachScreenshot=(await saveEvidenceShot(page,episode,'reward-approach')).path;
     }
     const barrierClear=eventFor(observed,'barrier-cleared',target.barrierId);
     if(barrierClear&&!episode.barrierClearSnapshotId){const record=await recordSnapshot(page,'exact-barrier-cleared-event',{levelId:level.id,targetBarrierId:target.barrierId,value:observed});episode.barrierClearSnapshotId=record.id;await saveEvidenceShot(page,episode,'barrier-cleared');}
     const bonusFishCatch=eventFor(observed,'fish-caught',episode.goldFishId);
     if(bonusFishCatch&&!episode.bonusFishCatchSnapshotId){const record=await recordSnapshot(page,'exact-golden-bonus-fish-caught',{levelId:level.id,targetBarrierId:target.barrierId,value:observed});episode.bonusFishCatchSnapshotId=record.id;episode.goldHud=await visibleHud(page);await saveEvidenceShot(page,episode,'golden-bonus-fish-caught');}
    }
   }
   const decision=decideRiskAction(view,state);state=decision.state;
   if(decision.action!=='wait'||decision.reason.includes('jump')||decision.reason.includes('capture')){
    report.decisions.push({at:new Date().toISOString(),levelId:level.id,targetBarrierId:target?.barrierId??null,visibleView:{distance:view.distance,laneIndex:view.laneIndex,lanes:view.lanes.map(lane=>({...lane}))},action:decision.action,toLane:decision.toLane,countdown:decision.countdown,reason:decision.reason});
   }
   if(decision.action==='left'||decision.action==='right'||decision.action==='jump'){
    const selector=`[data-action="${decision.action}"]`;
    const action=await tap(page,selector,{levelId:level.id,targetBarrierId:episode?.barrierId??null,decisionView:{distance:view.distance,laneIndex:view.laneIndex,lanes:view.lanes.map(lane=>({...lane}))},decision:{action:decision.action,toLane:decision.toLane,reason:decision.reason,countdown:decision.countdown}});
    if(decision.action==='jump'&&episode&&!episode.jump){
     const holdStartMs=await page.evaluate(()=>performance.now());state={...state,jumpAtMs:holdStartMs};
     episode.jump={at:action.at,completedAt:action.completedAt,nowMs:holdStartMs,distance:view.distance,laneIndex:view.laneIndex,countdown:decision.countdown,actionIndex:report.actions.indexOf(action)};
     await saveEvidenceShot(page,episode,'jump-input');
    }
    if(decision.action==='left'||decision.action==='right'){
     for(const capturedEpisode of episodes){
      if(capturedEpisode.jump&&!capturedEpisode.holdComplete&&view.nowMs-capturedEpisode.jump.nowMs<CAPTURE_HOLD_MS)capturedEpisode.earlyTurnAfterJump=true;
     }
    }
    if(decision.action==='left'||decision.action==='right'){
     await page.waitForFunction(expected=>{
      const lane=[...document.querySelectorAll('.co-lane-indicator i')].findIndex(node=>node.classList.contains('on'));
      return lane===expected;
     },decision.toLane,{timeout:1800});
    }
   }
   await page.waitForTimeout(80);
  }
  terminal=await readSnapshot(page);result.terminal=terminal;result.hudFinish=await visibleHud(page);
  result.rafEndAt=await page.evaluate(()=>performance.now());
  result.renderInfo=await page.evaluate(()=>window.__coast.renderInfo());
  await recordSnapshot(page,'level-terminal-settlement',{levelId:level.id,value:terminal});
  result.terminalScreenshot=(await shot(page,`level-${level.id}-terminal-settlement`,{levelId:level.id,kind:'terminal-settlement'})).path;
  const terminalOkay=terminal.phase==='finished'&&terminal.reason==='complete'&&terminal.level===level.id;
  check(`level-${level.id}-natural-terminal-settlement`,terminalOkay,{phase:terminal.phase,reason:terminal.reason,level:terminal.level,count:terminal.count,gold:terminal.gold,elapsed:terminal.elapsed,save:terminal.save,hud:result.hudFinish});
  check(`level-${level.id}-save-earned-through-play`,terminalOkay&&terminal.save.completed[level.id-1]===true&&terminal.save.unlocked>=Math.min(5,level.id+1),terminal.save);
  check(`level-${level.id}-exact-target-jump-count`,terminal.jumpedBarriers===level.targets.length,{expected:level.targets.length,jumpedBarriers:terminal.jumpedBarriers,targetBarrierIds:level.targets.map(target=>target.barrierId)});
  for(const episode of episodes)verifyEpisode(level,episode);
  const vehicleEntries=report.actions.filter(action=>action.levelId===level.id&&action.visibleDecisionView&&['left','right'].includes(action.policyDecision?.action)).filter(action=>{
   const lane=action.visibleDecisionView.lanes[action.policyDecision.toLane];return lane?.danger&&['car','van','vehicle'].includes(lane.kind);
  });
  check(`level-${level.id}-never-turns-into-visible-car-or-van`,vehicleEntries.length===0,{vehicleLaneEntries:vehicleEntries.map(action=>({selector:action.selector,targetLane:action.policyDecision.toLane,kind:action.visibleDecisionView.lanes[action.policyDecision.toLane]?.kind,at:action.at}))});
  const nonAdjacentLaneChanges=report.actions.filter(action=>action.levelId===level.id&&['left','right'].includes(action.policyDecision?.action)).filter(action=>Math.abs(action.policyDecision.toLane-action.visibleDecisionView.laneIndex)!==1);
  check(`level-${level.id}-only-adjacent-lane-inputs`,nonAdjacentLaneChanges.length===0,{invalid:nonAdjacentLaneChanges.map(action=>({selector:action.selector,from:action.visibleDecisionView.laneIndex,to:action.policyDecision.toLane,at:action.at}))});
  if(terminalOkay){
   if(level.id<5){
    await tap(page,'#co-select',{levelId:level.id});
    await shot(page,`level-${level.id}-route-after-settlement`,{levelId:level.id,kind:'visible-unlocked-route'});
    const nextButton=page.locator(`[data-level="${level.id+1}"]`);
    check(`level-${level.id}-next-level-visible-after-settlement`,await nextButton.isVisible()&&!(await nextButton.isDisabled()),{text:await nextButton.innerText()});
   }else{
    await tap(page,'#co-replay',{levelId:level.id});await page.waitForTimeout(180);
    const replay=await recordSnapshot(page,'visible-final-replay',{levelId:level.id});
    await shot(page,'level-5-final-replay',{levelId:level.id,kind:'visible-replay'});
    check('final-settlement-and-reopen',replay.value.phase==='running'&&replay.value.level===5&&replay.value.save.completed[4]===true,replay.value);
   }
  }
  const samples=await page.evaluate(({start,end})=>(window.__riskRafSamples??[]).filter(sample=>sample.at>=start&&sample.at<=end),{start:result.rafStartAt,end:result.rafEndAt});
  result.performance=summarizeFrames(samples);
  result.runtimeEvidence={...result.performance,calls:result.renderInfo.calls,triangles:result.renderInfo.triangles,quality:result.renderInfo.quality,memory:result.renderInfo.memory,source:'read-only window.__coast.renderInfo()',frameScope:'continuous RAF intervals whose before and after DOM phases were both running'};
  check(`level-${level.id}-running-frame-samples`,result.performance.frameCount>0&&Number.isFinite(result.performance.meanFPS),result.runtimeEvidence);
 }finally{
  const context=activeContext;
  if(context&&videoHandle){
   try{result.video=await captureVideo(page,context,level.id,videoHandle);}catch(error){const item={levelId:level.id,message:String(error),stack:error.stack};result.errors.push(item);report.errors.push(item);try{await context.close();}catch(closeError){report.errors.push({levelId:level.id,message:'Browser context close failed after video error',detail:String(closeError)});}}
  }else if(context)await context.close();
  activeContext=null;activePage=null;activeLevelId=null;
 }
}

function verifyEpisode(level,episode){
 const prefix=`level-${level.id}-${episode.barrierId}`;
 check(`${prefix}-visible-jump-reward-route`,episode.hudSeen,{lane:episode.hudLane,snapshotId:episode.hudSnapshotId,screenshot:episode.approachScreenshot,distance:episode.distance});
 check(`${prefix}-one-jump-at-decimal-window`,Boolean(episode.jump)&&episode.jump.countdown<=JUMP_WINDOW_SECONDS&&episode.jump.countdown>=0,{jump:episode.jump});
 const jumpActions=report.actions.filter(action=>action.levelId===level.id&&action.targetBarrierId===episode.barrierId&&action.selector==='[data-action="jump"]');
 check(`${prefix}-no-repeat-jump`,jumpActions.length===1,{jumpActions:jumpActions.map(action=>({at:action.at,selector:action.selector}))});
 const barrierSnapshot=report.snapshots.find(item=>item.id===episode.barrierClearSnapshotId);
 const barrierEvent=barrierSnapshot?.value.events?.find(event=>event.type==='barrier-cleared'&&event.objectId===episode.barrierId&&event.jumped===true);
 check(`${prefix}-exact-barrier-cleared-jumped`,Boolean(barrierEvent),{barrierId:episode.barrierId,event:barrierEvent??null,snapshotId:episode.barrierClearSnapshotId});
 const goldSnapshot=report.snapshots.find(item=>item.id===episode.bonusFishCatchSnapshotId);
 const goldEvent=goldSnapshot?.value.events?.find(event=>event.type==='fish-caught'&&event.objectId===episode.goldFishId);
 const authoredFishId=authoredBonusFishByBarrier[`${level.id}:${episode.barrierId}`]??null;
 const fishMatchesBarrier=authoredFishId===episode.goldFishId&&goldEvent?.objectId===authoredFishId;
 check(`${prefix}-exact-golden-bonus-fish-maps-to-barrier`,Boolean(goldEvent&&goldEvent.golden===true&&goldEvent.bonus===true&&fishMatchesBarrier),{expectedObjectId:episode.goldFishId,authoredFishId,expectedBarrierId:episode.barrierId,event:goldEvent??null,snapshotId:episode.bonusFishCatchSnapshotId,associationSource:'read-only authored LEVELS fish.sourceObstacleId -> fish.id'});
 const goldenFeedbackVisible=Boolean(episode.goldHud?.goldFeedback.includes('金鱼'));
 const goalCounterVisible=level.id===1?episode.goldHud?.goldAndFishGoal.includes('🐟'):episode.goldHud?.goldAndFishGoal.includes('🌟');
 check(`${prefix}-gold-feedback-visible-in-hud`,goldenFeedbackVisible&&Boolean(goalCounterVisible),{hud:episode.goldHud,goldenFeedbackVisible,goalCounterVisible,screenshot:episode.screenshots.find(file=>file.includes('golden-bonus-fish-caught'))??null});
 check(`${prefix}-held-route-for-1.7-second-capture`,episode.holdComplete===true&&episode.holdDurationMs>=CAPTURE_HOLD_MS&&!episode.earlyTurnAfterJump,{holdComplete:episode.holdComplete,holdDurationMs:episode.holdDurationMs,earlyTurnAfterJump:episode.earlyTurnAfterJump??false,samples:episode.holdSamples});
 if(episode.barrierId==='l3-o3'){
  const simultaneousVehicle=report.decisions.filter(item=>item.levelId===3&&item.targetBarrierId==='l3-o3').some(item=>item.visibleView.lanes.some(lane=>lane.danger&&lane.kind==='vehicle'));
  const enteredVehicle=report.actions.some(action=>action.levelId===3&&action.targetBarrierId==='l3-o3'&&['left','right'].includes(action.policyDecision?.action)&&action.visibleDecisionView.lanes[action.policyDecision.toLane]?.kind==='vehicle');
  check(`${prefix}-same-point-van-is-bypassed`,simultaneousVehicle&&!enteredVehicle,{visibleRadarVehicleObserved:simultaneousVehicle,enteredVehicle,authoredSamePointObstacleId:'l3-o2',authoredKind:'van',barrierId:episode.barrierId,radarInputUsesVisibleVehicleIcon:'🚗'});
 }
}

try{
 for(const level of RISK_LEVELS){
  await runLevel(level);
  const last=report.levels.at(-1);
  if(last.terminal?.reason!=='complete')break;
 }
 check('five-level-natural-campaign-completed',report.levels.length===5&&report.levels.every(level=>level.terminal?.reason==='complete'),report.levels.map(level=>({id:level.id,name:level.name,reason:level.terminal?.reason,video:level.video?.path})));
 const touchActions=report.actions.filter(action=>action.type==='touch-tap');
 check('all-visible-inputs-have-trusted-touch-evidence',touchActions.length>0&&touchActions.every(action=>action.trustedTouch),{actions:touchActions.length,missing:touchActions.filter(action=>!action.trustedTouch).map(action=>({selector:action.selector,at:action.at,evidence:action.nativeTouchEvidence}))});
}catch(error){
 const item={levelId:activeLevelId,message:error.message,stack:error.stack};report.errors.push(item);console.error('RISK_QA_ERROR '+error.stack);
}finally{
 if(activeContext){try{await activeContext.close();}catch(error){report.errors.push({levelId:activeLevelId,message:'Active browser context close failed',detail:String(error)});}activeContext=null;}
 try{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}catch(error){report.errors.push({message:'QA server close failed',detail:String(error)});}
 await rm(profileDir,{recursive:true,force:true}).catch(error=>report.errors.push({message:'Could not remove temporary fresh-browser profile',detail:String(error)}));
 report.passed=report.checks.length>0&&report.checks.every(item=>item.passed)&&report.errors.length===0&&report.levels.length===5&&report.videos.length===5;
 report.finishedAt=new Date().toISOString();
 await json(path.join(qaDir,'report.json'),report);
 console.log('RISK_QA_REPORT '+path.join(qaDir,'report.json')+' passed='+report.passed);
 if(!report.passed)process.exitCode=1;
}
