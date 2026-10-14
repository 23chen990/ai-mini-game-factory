/* global process, console, window, document, getComputedStyle, innerWidth, innerHeight, performance, requestAnimationFrame */
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
 const fpsThreatTrace=[],fpsExtendedChecks=[]; let fpsScriptSteps=0,fpsEnemySeenCount=0,fpsRouteTurns=0,fpsContactScreenshot=false;
 const readFpsThreat = async () => page.evaluate(() => {
   const g=window.__H5NativeGame, p=g?.player;
   if(!g||!p)return null;
   const opponents=g.actors.filter(a=>a.team!==p.team);
   return {
     gameTime:+g.time.toFixed(1),
     challenge:document.getElementById('mobile-kit')?.dataset.challenge,
     shots:p.stats.shots,hits:p.stats.hits,kills:p.stats.k,deaths:p.stats.d,
     hp:Math.max(0,Math.round(p.hp)),alive:p.alive,
     position:{x:+p.pos.x.toFixed(1),z:+p.pos.z.toFixed(1)},
     nearestEnemyMeters:opponents.length?+Math.min(...opponents.map(a=>a.pos.distanceTo(p.pos))).toFixed(1):null,
     visibleEnemyMarkers:[...document.querySelectorAll('.mk-fps-enemy')].filter(e=>!e.hidden).length,
     botReactSec:opponents[0]?.diff?.react?.[0]??null,
     botTrack:opponents[0]?.diff?.track??null,
     botStrafe:opponents[0]?.diff?.strafe??null,
     clearStartingLane:g.__mobileBalanceReview?.startingLaneMeters??null,
     firstScoutPathReady:g.__mobileBalanceReview?.firstRendezvousPath??false,
     trainingScoutPlaced:g.__mobileBalanceReview?.trainingScout??false,
     trainingScoutRange:g.__mobileBalanceReview?.trainingScoutRange??null,
     configuredTeamSize:g.opts.size,
     autoFireActivations:g.__mobileBalanceReview?.autoFireActivations??0,
     playerEngaged:g.__mobileBalanceReview?.playerEngaged??false,
     hintVisible:(()=>{const e=document.querySelector('#mk-fps-guide');return e&&getComputedStyle(e).display!=='none'?e.textContent:'';})()
   };
 }).catch(()=>null);
 await mkdir(path.join(root,'screenshots'),{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
 const viewport=run.theme==='pelican-bike'?{width:390,height:844}:{width:844,height:390};
 const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:1}),page=await context.newPage();
 await page.addInitScript(()=>{window.__mobileFrames=[];let last;const f=t=>{if(last&&window.__mobileFrames.length<20000)window.__mobileFrames.push(t-last);last=t;requestAnimationFrame(f);};requestAnimationFrame(f);});
 page.on('pageerror',e=>errors.push(e.message));const started=Date.now();
 const shot=async name=>{const p='screenshots/'+name+'.png';await page.screenshot({path:path.join(root,p)});artifacts.push({path:p,sha256:sha256(await readFile(path.join(root,p)))});};
 const check=(name,passed,detail)=>checks.push({name,passed:passed===true,detail});
 // Coached player approximation: uses ONLY visible enemy labels and the exact
 // on-screen thumb controls. Never reads private bot positions to steer/aim.
 const mobileStroke=async (start,end,duration=650,touchId=11) => {
   const cdp=await context.newCDPSession(page);
   try {
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start.x,y:start.y,id:touchId}]});
     await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:end.x,y:end.y,id:touchId}]});
     await page.waitForTimeout(duration);
     await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   } finally { await cdp.detach(); }
 };
 const coachedFpsStep=async () => {
   fpsScriptSteps++;
   const aimed=page.locator('#mk-fps-target[data-side="enemy"]');
   if(await aimed.count()&&await aimed.isVisible()){
     fpsEnemySeenCount++;
     // Give simple mode time to fire before using the manual fallback.
     const before=await page.evaluate(()=>window.__H5NativeGame?.player?.stats?.shots??0);
     await page.waitForTimeout(1400);
     const after=await page.evaluate(()=>window.__H5NativeGame?.player?.stats?.shots??0);
     if(after===before) await hold('#touch .btn[data-mk-action="fire"]',850);
     if(!fpsContactScreenshot){await shot('mobile-first-visible-enemy');fpsContactScreenshot=true;}
     return;
   }
   const target=page.locator('.mk-fps-enemy:not([hidden])').first();
   if(await target.count() && await target.isVisible().catch(()=>false)){
     fpsEnemySeenCount++;
     if(!fpsContactScreenshot){await shot('mobile-first-visible-enemy');fpsContactScreenshot=true;}
     for(let n=0;n<4;n++){
       // Enemies may die, enter cover or move out of frame between the
       // locator check and measurement. A real touch player keeps going;
       // do not wait 30 seconds for a vanished HUD badge.
       const rect=await target.boundingBox({timeout:700}).catch(()=>null);
       if(!rect||!(await target.isVisible().catch(()=>false)))break;
       const center={x:844/2,y:390/2};
       const desiredX=rect.x+rect.width/2, desiredY=rect.y+rect.height+22;
       const dx=Math.max(-75,Math.min(75,(desiredX-center.x)*0.40));
       const dy=Math.max(-48,Math.min(48,(desiredY-center.y)*0.40));
       if(Math.abs(dx)+Math.abs(dy)<7)break;
       await mobileStroke({x:530,y:190},{x:530+dx,y:190+dy},230,12+n);
     }
     await hold('#touch .btn[data-mk-action="fire"]',1100);
     return;
   }
   // A real novice can read the screen's route hint, so the script should
   // follow that hint before it tries random blind strafing.
   const guide=page.locator('#mk-fps-guide');
   const guidance=await guide.isVisible()?await guide.textContent():'';
   if(guidance?.startsWith('←')||guidance?.startsWith('→')){
     const right=guidance.startsWith('→');
     fpsRouteTurns++;
     await mobileStroke({x:530,y:185},{x:530+(right?58:-58),y:185},320,41);
     return;
   }
   const pad=await page.locator('#touch .pad').first().boundingBox();
   if(!pad)return;
   const center={x:pad.x+pad.width/2,y:pad.y+pad.height/2};
   await mobileStroke(center,{x:center.x,y:center.y-55},1350,20);
   if(!guidance&&fpsScriptSteps%6===0)
     await mobileStroke({x:530,y:185},{x:578,y:185},280,43);
 };
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
   const isFps = run.theme === 'cf-transport-ship';
   let entryMobile = null;
   if (isFps) {
     entryMobile = await page.evaluate(() => {
       const modal = document.querySelector('#mk-panel'), nativeMenu = document.getElementById('menu');
       const tutorial = document.getElementById('mk-fps-tutorial');
       const r = modal.getBoundingClientRect();
       return {
         desktopMenuHidden: !!nativeMenu && getComputedStyle(nativeMenu).display === 'none',
         tutorialShown: !!tutorial && getComputedStyle(tutorial).display !== 'none' && /左手|右侧|开火/.test(tutorial.textContent),
         tutorialText: tutorial?.textContent?.trim(),
         panelFits: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
         mobileTitle: document.querySelector('#mk-title')?.textContent,
       };
     });
     // Mobile-first is a layout property, not a desktop viewport with a touch flag.
     await page.setViewportSize({width:667,height:375});await shot('mobile-entry-667x375');
     const smallFits = await page.locator('#mk-panel').evaluate(el => {
       const r=el.getBoundingClientRect();
       return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;
     });
     entryMobile.smallFits = smallFits;
     await page.setViewportSize(viewport);
   }
   const startBox=await page.locator('#mk-start').boundingBox();
   check('mobile-entry', readyMs<=30000&&startBox?.width>=44&&startBox?.height>=44&&
     (!isFps || entryMobile.desktopMenuHidden&&entryMobile.tutorialShown&&entryMobile.panelFits&&entryMobile.smallFits),
     {readyMs,viewport,actualHTTP:true,entryMobile});
   await page.locator('#mk-start').tap();actions.push({atMs:Date.now()-started,input:'tap',target:'#mk-start'});
   await page.waitForSelector('#mobile-kit[data-native-phase="running"]',{timeout:45000});
   // Beginner duel may legitimately finish on the first manual burst. Verify
   // pause early, before a fast real win hides the button.
   if(isFps){
     // With no right-side swipe and no fire input, beginner auto-fire MUST
     // remain silent. Verify against game-owned bullets, not a UI label.
     const silentShotsBefore=await page.evaluate(()=>window.__H5NativeGame?.player?.stats?.shots??0);
     await page.waitForTimeout(1400);
     const silentShotsAfter=await page.evaluate(()=>window.__H5NativeGame?.player?.stats?.shots??0);
     fpsExtendedChecks.push({name:'cf-no-idle-autofire',passed:silentShotsAfter===silentShotsBefore,
       detail:{silentShotsBefore,silentShotsAfter,limitation:'Software-WebGL wait; no real human input'}});
     const introSnapshot=await readFpsThreat();
     if(introSnapshot)fpsThreatTrace.push(introSnapshot);
     await shot('mobile-pre-input-scout');
     await page.locator('#mk-pause').tap();
     const pausedBefore=await page.locator('#mk-time').innerText();
     await page.waitForTimeout(700);
     const pauseFrozen=pausedBefore===await page.locator('#mk-time').innerText();
     const phaseDuringPause=await page.locator('#mobile-kit').getAttribute('data-phase');
     await page.locator('#mk-resume').tap();
     check('mobile-pause-resume',pauseFrozen&&phaseDuringPause==='paused',
       {visiblePaused:phaseDuringPause,clockFrozen:pauseFrozen,checkedBeforeFastBeginnerWin:true});
   }
   if(run.theme==='pelican-bike'){
     await hold('[data-code="ArrowLeft"]',1200);await hold('[data-code="ArrowRight"]',1200);
   }else if(run.theme==='qq-speed'){
     await hold('#t-left',1000);await hold('#t-right',1000);
   }else{
     await page.waitForFunction(() => document.documentElement.dataset.fpsActive === 'true', {timeout:10000});
     const shotsBefore = await page.evaluate(() => window.__H5NativeGame?.player?.stats?.shots ?? 0);
     // Try one short, ordinary human tap while still facing the actual
     // visible 1v1 training scout. A full 1.5s burst can end the tutorial
     // before movement/pause tests have had a chance to run.
     const firstTap=page.locator('#touch .btn[data-mk-action="fire"]');
     if(await page.locator('#mobile-kit').getAttribute('data-phase')==='running'){
       const tapBox=await firstTap.boundingBox();
       const t=await context.newCDPSession(page);
       await t.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[
         {x:tapBox.x+tapBox.width/2,y:tapBox.y+tapBox.height/2,id:15}
       ]});
       await page.waitForTimeout(220);
       await t.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
       await t.detach();
       actions.push({atMs:Date.now()-started,input:'short-first-shot-from-natural-start',durationMs:220});
       const opening=await readFpsThreat();
       if(opening)fpsThreatTrace.push(opening);
       await shot('mobile-first-shot');
     }
     const layout = await page.evaluate(() => {
       const actions=['fire','jump','reload','scope','duplicate-fire','crouch','switch'];
       const nodes=actions.map(action=>{
         const e=document.querySelector('#touch .btn[data-mk-action="'+action+'"]');
         if (!e)return {action,visible:false};
         const r=e.getBoundingClientRect();
         const cs=getComputedStyle(e);
         return {action,visible:cs.display!=='none'&&cs.visibility!=='hidden',
           left:r.left,top:r.top,width:r.width,height:r.height,
           fits:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight};
       });
       const visible=nodes.filter(n=>n.visible);
       const overlap=visible.some((a,i)=>visible.slice(i+1).some(b=>
         a.left<b.left+b.width && b.left<a.left+a.width &&
         a.top<b.top+b.height && b.top<a.top+a.height));
       return {actions:nodes,overlap,active:document.documentElement.dataset.fpsActive,
         desktopMenuHidden:getComputedStyle(document.getElementById('menu')).display==='none',
         labelsPresent:!!document.getElementById('mk-fps-target')&&!!document.getElementById('mk-fps-board')};
     });
     // Normal touch path for both thumbs. Read-only position/yaw snapshots are
     // evidence; no injection of actor coordinates, player stats or game state.
     const beforeTravel=await page.evaluate(() => {
       const p=window.__H5NativeGame?.player;
       return p?{x:p.pos.x,z:p.pos.z,yaw:p.yaw,deaths:p.stats.d}:null;
     });
     const pad=await page.locator('#touch .pad').first().boundingBox();
     const moveSession=await context.newCDPSession(page);
     const px=pad.x+pad.width/2, py=pad.y+pad.height/2;
     await moveSession.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:px,y:py,id:5}]});
     await moveSession.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:px,y:py-55,id:5}]});
     await page.waitForTimeout(2500);
     await moveSession.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
     await moveSession.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:500,y:190,id:6}]});
     await moveSession.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:565,y:190,id:6}]});
     await page.waitForTimeout(850);
     await moveSession.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
     await moveSession.detach();
     const afterTravel=await page.evaluate(() => {
       const p=window.__H5NativeGame?.player;
       return p?{x:p.pos.x,z:p.pos.z,yaw:p.yaw,deaths:p.stats.d}:null;
     });
     const distance=beforeTravel&&afterTravel
       ? Math.hypot(afterTravel.x-beforeTravel.x,afterTravel.z-beforeTravel.z) : 0;
     const lookAngle=beforeTravel&&afterTravel?Math.abs(afterTravel.yaw-beforeTravel.yaw):0;
     const thumbMotion=distance>0.5&&lookAngle>0.01;
     await shot('mobile-forward-look');
     actions.push({atMs:Date.now()-started,input:'natural-joystick-and-look',detail:{distance,lookAngle,thumbMotion}});
     const fire=page.locator('#touch .btn[data-mk-action="fire"]');
     if(await page.locator('#mobile-kit').getAttribute('data-phase')==='running'){
       const b=await fire.boundingBox(),cdp=await context.newCDPSession(page);
     actions.push({atMs:Date.now()-started,input:'touch-hold',target:'visible-fire',durationMs:1500});
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:1}]});
     await page.waitForTimeout(1500);
     await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
     }
     const shotsAfter = await page.evaluate(() => window.__H5NativeGame?.player?.stats?.shots ?? 0);
     const earlyCombat = await readFpsThreat();
     if(earlyCombat)fpsThreatTrace.push(earlyCombat);
     const working = shotsAfter > shotsBefore && thumbMotion && !layout.overlap && layout.desktopMenuHidden &&
       layout.labelsPresent && layout.active === 'true' && layout.actions.every(n=>!n.visible||n.fits) &&
       ['fire','jump','reload'].every(a=>layout.actions.some(n=>n.action===a&&n.visible)) &&
       ['duplicate-fire','crouch','switch'].every(a=>layout.actions.some(n=>n.action===a&&!n.visible));
     actions.push({atMs:Date.now()-started,input:'visual-layout-audit',detail:{shotsBefore,shotsAfter,layout,thumbMotion,distance,lookAngle}});
     await shot('mobile-controls');
     check('mobile-controls',working,{authority:'NORMAL_TOUCH_AND_VISIBLE_DOM',shotsBefore,shotsAfter,layout,thumbMotion,distance,lookAngle,
       limitation:'Checks that shots occur, NOT that hits or successful combat have been proven.'});
   }
   if (!isFps) {
     await shot('mobile-controls');
     check('mobile-controls',true,{authority:'NORMAL_TOUCH_INPUT_AND_SCREENSHOTS',note:'Control response needs screenshot/perceptual review; this does not prove every weapon or drift branch.'});
   }
   if(!isFps){
     await page.locator('#mk-pause').tap();const time=await page.locator('#mk-time').innerText();
     await page.waitForTimeout(1000);const frozen=time===await page.locator('#mk-time').innerText();
     const paused=await page.locator('#mobile-kit').getAttribute('data-phase');await page.locator('#mk-resume').tap();
     check('mobile-pause-resume',frozen&&paused==='paused',{visiblePaused:paused,clockFrozen:frozen});
   }
   const loopStart=Date.now();
   let lastFpsTraceAt=0;
   while(await page.locator('#mobile-kit').getAttribute('data-phase')!=='finished'&&Date.now()-loopStart<(run.theme==='cf-transport-ship'?540000:240000)){
     if(run.theme==='pelican-bike'){
       // A predefined sweep uses normal touch; no hidden fish positions or debug mutations.
       await hold('[data-code="ArrowLeft"]',1400);await hold('[data-code="ArrowRight"]',1400);
     }else if(run.theme==='cf-transport-ship'){
       if(Date.now()-lastFpsTraceAt>3000){
         lastFpsTraceAt=Date.now();
         const sample=await readFpsThreat();
         if(sample)fpsThreatTrace.push(sample);
       }
       await coachedFpsStep();
     }else await page.waitForTimeout(1000);
   }
   const phase=await page.locator('#mobile-kit').getAttribute('data-phase'),score=Number(await page.locator('#mk-score').innerText());
   await shot('mobile-terminal');
   const terminal={phase,visibleHeading:await page.locator('#mk-heading').innerText(),score,wallMs:Date.now()-started};
   if(run.theme==='cf-transport-ship'){
     terminal.fpsThreatSummary={
       firstVisibleAtGameSec:fpsThreatTrace.find(x=>x.visibleEnemyMarkers>0)?.gameTime??null,
       firstPlayerHitAtGameSec:fpsThreatTrace.find(x=>x.hits>0)?.gameTime??null,
       maxEnemyThreat:fpsThreatTrace.length?Math.max(...fpsThreatTrace.map(x=>x.botTrack??0)):null,
       firstEnemyReact:fpsThreatTrace[0]?.botReactSec??null,
       lastEnemyReact:fpsThreatTrace.at(-1)?.botReactSec??null,
       firstLaneMeters:fpsThreatTrace[0]?.clearStartingLane??null,
       finalPlayerHits:fpsThreatTrace.at(-1)?.hits??null,
       finalPlayerDeaths:fpsThreatTrace.at(-1)?.deaths??null,
       scriptedThumbSteps:fpsScriptSteps,scriptedVisibleEnemyLabels:fpsEnemySeenCount,
       followingActualVisibleHud:true,scriptedRouteTurns:fpsRouteTurns,
       firstScoutPathReady:fpsThreatTrace[0]?.firstScoutPathReady??null,
       trainingScoutPlaced:fpsThreatTrace[0]?.trainingScoutPlaced??false,
       trainingScoutRange:fpsThreatTrace[0]?.trainingScoutRange??null,
       teamSize:fpsThreatTrace[0]?.configuredTeamSize??null,
       autoFireActivations:fpsThreatTrace.at(-1)?.autoFireActivations??null,
       snapshots:fpsThreatTrace
     };
     const summary=terminal.fpsThreatSummary;
     // Extra FPS difficulty gate. The five factory gate IDs are untouched.
     // In a first-session M4 drill the actual hit must occur during the
     // opening 30 *simulation* seconds, using real bullets and visible input.
     const introPass=summary.trainingScoutPlaced && summary.teamSize===1 &&
       summary.trainingScoutRange>=7 && summary.trainingScoutRange<=10 &&
       summary.firstPlayerHitAtGameSec!==null &&
       summary.firstPlayerHitAtGameSec<=30;
     fpsExtendedChecks.push({
       name:'cf-first-natural-hit-by-30s',passed:introPass,
       detail:{trainingScoutPlaced:summary.trainingScoutPlaced,
         teamSize:summary.teamSize,scoutRangeMeters:summary.trainingScoutRange,
         firstVisibleAtGameSec:summary.firstVisibleAtGameSec,
         firstHitAtGameSec:summary.firstPlayerHitAtGameSec,
         finalHits:summary.finalPlayerHits,finalDeaths:summary.finalPlayerDeaths,
         guidance:'Real on-screen touch motions and original bullet collision; no stat injection'}
     });
   }
   if(phase==='finished'){
     const best=await page.locator('#mk-best').innerText();
     const shooter=run.theme==='cf-transport-ship';
     const won=shooter && (await page.locator('#mobile-kit').getAttribute('data-outcome'))==='won';
     const nextButton=page.locator('#mk-next');
     const hasNext=shooter && (await nextButton.isVisible());
     if(shooter)fpsExtendedChecks.push({
       name:'cf-next-mission-gated-by-real-win',
       passed:won?hasNext:!hasNext,
       detail:{won,hasNext,reason:'No easy advance after a failed drill'}
     });
     if(won&&hasNext)await nextButton.tap();
     else await page.locator('#mk-replay').tap();
     await page.waitForSelector('#mobile-kit[data-loaded="true"]',{timeout:45000});
     const restored=best===await page.locator('#mk-best').innerText();
     check('mobile-save-reload',restored,{savedBest:best,restored,unfinishedRound:'RESTARTS_EXPLICITLY',advance:won&&hasNext});
     if(shooter && !(won&&hasNext)) await page.locator('#mk-challenges [data-challenge-id="precision"]').tap();
     if(shooter && won&&hasNext) {
       const chosen=await page.locator('#mk-challenges [data-challenge-id="precision"]').getAttribute('aria-pressed');
       fpsExtendedChecks.push({name:'cf-next-mission-persists-awm-selection',passed:chosen==='true',
         detail:{selectedPrecision:chosen,advanceClickUsed:true}});
     }
     await page.locator('#mk-start').tap();await page.waitForSelector('#mobile-kit[data-native-phase="running"]',{timeout:45000});
     let sniperControl=null;
     if(run.theme==='cf-transport-ship'){
       await page.waitForFunction(() => document.documentElement.dataset.fpsSniper === 'true');
       const scope=page.locator('#touch .btn[data-mk-action="scope"]');
       const visible=await scope.isVisible();
       await page.waitForTimeout(900);
       if(visible) await scope.tap();
       await page.waitForTimeout(700);
       const scoped=await page.evaluate(() => window.__H5NativeGame?.player?.scoped ?? 0);
       sniperControl={visible,scoped,activeChallenge:await page.locator('#mobile-kit').getAttribute('data-challenge')};
       await shot('mobile-sniper-controls');
     }
     const restarted=!sniperControl||sniperControl.visible&&sniperControl.scoped>0&&sniperControl.activeChallenge==='precision';
     check('mobile-terminal-replay',restarted,{...terminal,naturalInputOnly:true,replayObserved:restarted,
       sniperControl,fishCaptureObserved:run.theme!=='pelican-bike'||score>0});
   }else{check('mobile-save-reload',false,{reason:'Terminal was not observed, so replay/save case remains blocked.'});check('mobile-terminal-replay',false,terminal);}
   if(run.theme==='cf-transport-ship'){
     // One real-input idle run: survival must NOT be winnable by doing nothing.
     // This is a separate negative balance gate, not scripted player success.
     await page.reload();
     await page.waitForSelector('#mobile-kit[data-loaded="true"]',{timeout:45000});
     await page.locator('#mk-challenges [data-challenge-id="survive"]').tap();
     await page.locator('#mk-start').tap();
     await page.waitForSelector('#mobile-kit[data-native-phase="running"]',{timeout:45000});
     const afkStart=Date.now();
     while(await page.locator('#mobile-kit').getAttribute('data-phase')!=='finished'&&Date.now()-afkStart<420000)
       await page.waitForTimeout(1200);
     const afk=await page.evaluate(()=>{
       const root=document.querySelector('#mobile-kit');
       return {phase:root.dataset.phase,outcome:root.dataset.outcome,
         instructions:document.querySelector('#mk-copy')?.textContent,
         playerDeaths:window.__H5NativeGame?.player?.stats?.d??null,
         shotCount:window.__H5NativeGame?.player?.stats?.shots??null};
     });
     const idleRejected=afk.phase==='finished'&&afk.outcome==='lost'&&afk.shotCount===0;
     fpsExtendedChecks.push({name:'cf-survive-idle-rejected',passed:idleRejected,detail:afk});
     await shot('mobile-survival-idle-end');
   }
 }catch(e){errors.push(String(e.message).slice(0,500));}
 const frames=await page.evaluate(()=>window.__mobileFrames||[]).catch(()=>[]);frames.sort((a,b)=>a-b);
 const report={schemaVersion:1,runId,referenceId:run.theme,buildHash:hash,suiteHash:run.browserSuiteHash,scope:'HTTP_BROWSER',defaultSpeed:1,checks,fpsExtendedChecks,artifacts,errors,actions,
   passed:checks.length===5&&checks.every(c=>c.passed)&&fpsExtendedChecks.every(c=>c.passed)&&errors.length===0,checkedAt:new Date().toISOString(),human:'NOT_RUN',physicalMobile:'NOT_RUN',liveIAA:'NOT_RUN',publishable:false,
   perceptualGate:'PENDING_SCREENSHOT_REVIEW',performance:{environment:'Desktop Chromium software WebGL + touch emulation, not phone hardware',frameP95Ms:frames[Math.floor(frames.length*.95)]??null,frames:frames.length},
   runtimeProductGate:{entrypoints:['index.html (pinned original Three.js bundle)','main.mjs (owned mobile glue)','engine.mjs (owned lifecycle)','themes.mjs (owned ad lifecycle)','platform.json'],referenceImplementationRetained:true,compatibilityLegacy:'Original game remains the intended runtime; no zero-rewrite claim.',terminalObserved:checks.some(c=>c.name==='mobile-terminal-replay'&&c.passed)}};
 await writeFile(path.join(root,'browser.json'),JSON.stringify(report,null,2)+'\n');
 await browser.close();await new Promise(resolve=>server.close(resolve));return report;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){const r=await browserQa(process.argv[2]);console.log(JSON.stringify(r,null,2));if(!r.passed)process.exitCode=1;}
