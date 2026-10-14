/* global process, console, window, document, requestAnimationFrame */
import {webkit,chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {URL} from 'node:url';
import path from 'node:path';
import {RUN,WORKSPACE,json,sha} from './prepare.mjs';
import {serve} from './serve.mjs';
import {browserOptions,qaDpr} from './browser-options.mjs';
const build=JSON.parse(await readFile(path.join(RUN,'build-receipt.json'),'utf8'));
const mode=process.argv[2]??'campaign',engine=process.env.QA_ENGINE??'webkit';
const qaDir=path.join(RUN,'attempts',`attempt-${build.attempt}`,'qa-'+mode+'-'+engine);await mkdir(qaDir,{recursive:true});
const driver=await readFile(new URL(import.meta.url));await writeFile(path.join(qaDir,'driver-source.mjs'),driver);
await json(path.join(qaDir,'driver-provenance.json'),{path:'tools/lean-pilot/pelican-v2/qa.mjs',snapshot:path.relative(RUN,path.join(qaDir,'driver-source.mjs')),sha256:sha(driver),buildHash:build.buildHash,normalInputOnly:true});
const server=await serve(),base='http://127.0.0.1:'+server.address().port+'/game/index.html';
const browser=await (engine==='chromium'?chromium:webkit).launch(browserOptions(engine));
const report={schemaVersion:1,targetGame:'鹈鹕海岸冒险',workspace:WORKSPACE,buildHash:build.buildHash,attempt:build.attempt,runtime:engine+' desktop touch emulation; not physical mobile',mode,normalInputOnly:true,stateInjection:false,checks:[],actions:[],screenshots:[],errors:[],levels:[],physicalIPhone:'NOT_RUN',liveAds:'NOT_RUN',startedAt:new Date().toISOString(),passed:false};
let context,page,navs=0;
const segments=[];let checkStart=0,shotStart=0,errorStart=0;
function segment(name){segments.push({name,checkStart,checkEnd:report.checks.length,shotStart,shotEnd:report.screenshots.length,actionEnd:report.actions.length,errorStart,errorEnd:report.errors.length});checkStart=report.checks.length;shotStart=report.screenshots.length;errorStart=report.errors.length;}
const LANES_FOR_QA=[-1.7,0,1.7];
const check=(name,passed,evidence)=>{report.checks.push({name,passed:passed===true,evidence});console.log(JSON.stringify({name,passed,evidence}));};
const shot=async name=>{const p=path.join(qaDir,name+'.png');await page.screenshot({path:p});report.screenshots.push({path:path.relative(RUN,p),sha256:sha(await readFile(p))});};
const tap=async selector=>{const before=await page.evaluate(()=>window.__coast.snapshot());const action={at:new Date().toISOString(),type:'tap',selector,before:{phase:before.phase,distance:before.distance}};report.actions.push(action);await page.locator(selector).tap();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const after=await page.evaluate(()=>window.__coast.snapshot());Object.assign(action,{completedAt:new Date().toISOString(),after:{phase:after.phase,distance:after.distance},events:after.events?.slice(-2)});};
const snapshot=()=>page.evaluate(()=>window.__coast.snapshot());
async function fresh(){context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:qaDpr(),recordVideo:{dir:qaDir,size:{width:390,height:844}}});page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('framenavigated',f=>{if(f===page.mainFrame())navs++;});
 await page.addInitScript(()=>{window.__qaFrames=[];let prev;const f=t=>{if(prev&&window.__qaFrames.length<100000)window.__qaFrames.push(t-prev);prev=t;requestAnimationFrame(f);};requestAnimationFrame(f);});await page.goto(base);await page.waitForSelector('#coast[data-loaded="true"]');}
const view=()=>page.evaluate(()=>({phase:document.querySelector('#coast').dataset.phase,distance:Number(document.querySelector('#co-distance').textContent.match(/^\d+/)?.[0]??0),lane:[...document.querySelectorAll('.co-lane-indicator i')].findIndex(x=>x.classList.contains('on')),lanes:[...document.querySelectorAll('.co-lane')].map(n=>({text:n.textContent,danger:n.classList.contains('danger'),fish:n.classList.contains('fish')}))}));
async function drive({maxMs=135000,stage=0,stopAtDistance=Infinity,avoidFish=false}={}){
 // Read the newly painted UI, rather than the previous run's synchronous DOM text.
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const end=Date.now()+maxMs;let lastTap=0,nearShot=false;
 while(Date.now()<end){const v=await view();if(v.phase==='finished'||v.distance>=stopAtDistance)return snapshot();if(v.phase==='paused'){await tap('#co-resume');continue;}
  const imminent=i=>v.lanes[i].danger&&Number(v.lanes[i].text.match(/(\d+(?:\.\d+)?)s/)?.[1]??99)<=3;
  let want=v.lane;
  if(imminent(v.lane)){const safe=[0,1,2].filter(i=>!imminent(i));want=safe.find(i=>v.lanes[i].fish)??safe.sort((a,b)=>Math.abs(a-v.lane)-Math.abs(b-v.lane))[0]??v.lane;}
  else{const fish=v.lanes.findIndex((l,i)=>l.fish&&!imminent(i));if(fish>=0)want=fish;}
  if(avoidFish){const safe=[0,1,2].filter(i=>!imminent(i)&&!v.lanes[i].fish);if(safe.length)want=safe.includes(v.lane)?v.lane:safe.sort((a,b)=>Math.abs(a-v.lane)-Math.abs(b-v.lane))[0];}
  // A player already in a safe lane declines a fish that requires crossing a red lane.
  if(want!==v.lane&&!imminent(v.lane)&&imminent(v.lane+Math.sign(want-v.lane)))want=v.lane;
  if(Date.now()-lastTap>180&&want!==v.lane){await tap(`[data-action="${want<v.lane?'left':'right'}"]`);lastTap=Date.now();}
  if(!nearShot&&v.lanes.some(l=>l.danger&&Number(l.text.match(/(\d+(?:\.\d+)?)s/)?.[1]??99)<=3)){nearShot=true;await shot('level-'+stage+'-hazard');}
  await page.waitForTimeout(90);
 }
 return snapshot();
}
async function waitDistance(target,maxMs=70000){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const end=Date.now()+maxMs;while(Date.now()<end){const v=await view();if(v.phase==='finished')throw Error('Finished before '+target);if(v.distance>=target)return;await page.waitForTimeout(40);}throw Error('Distance timeout '+target);}
try{
 await fresh();await shot('menu');check('locked-new-save',await page.locator('[data-level="2"]').isDisabled(),{newBrowser:true});
 if(mode==='campaign'||mode==='all'){
  await tap('#co-start');await page.waitForTimeout(2400);await shot('first-fish');const first=await snapshot();check('first-seconds-objective-and-fish',first.count>=1,{count:first.count,elapsed:first.elapsed});
  const ri=await page.evaluate(()=>window.__coast.renderInfo());check('renderer-composer-resolution',ri.pixelRatio>=Math.min(1.25,qaDpr())&&ri.canvas[0]===ri.composer[0]&&ri.canvas[1]===ri.composer[1],ri);
  await tap('#co-pause');const before=await snapshot();await page.waitForTimeout(1100);const after=await snapshot();check('pause-freezes-world-and-timer',before.distance===after.distance&&before.elapsed===after.elapsed,{before,after});await shot('pause');await tap('#co-resume');
  for(let id=1;id<=5;id++){
   if(id>1){await tap('#co-next');await page.waitForTimeout(1500);}
   await shot('level-'+id+'-start');const navigationBefore=navs;
   const frameStart=await page.evaluate(()=>window.__qaFrames.length);const result=await drive({stage:id});const frames=await page.evaluate(n=>window.__qaFrames.slice(n+10),frameStart);const sorted=frames.filter(n=>n>0).sort((a,b)=>a-b);result.performance={frameCount:sorted.length,meanFps:1000/(sorted.reduce((a,b)=>a+b,0)/sorted.length),p95Ms:sorted[Math.floor(sorted.length*.95)],scope:'Natural default-speed running route between visible start and settlement'};report.levels.push(result);await shot('level-'+id+'-terminal');
   check('natural-level-'+id,result.phase==='finished'&&result.reason==='complete',{count:result.count,gold:result.gold,distance:result.distance,elapsed:result.elapsed,events:result.events,save:result.save});
   check('no-full-page-reload-level-'+id,navs===navigationBefore,{before:navigationBefore,after:navs});
   if(result.reason!=='complete')break;
  }
  const finished=await snapshot();if(finished.reason==='complete'&&finished.level===5){
   await tap('#co-ad');check('unintegrated-ad-honest-no-block',await page.locator('#co-notice').innerText().then(s=>s.includes('尚未接入')),{notice:await page.locator('#co-notice').innerText()});
   const prior=navs;await tap('#co-replay');await page.waitForTimeout(1000);check('in-memory-replay',navs===prior&&(await snapshot()).phase==='running',{navigationBefore:prior,navigationAfter:navs});
   await tap('#co-pause');await page.reload();await page.waitForSelector('#coast[data-loaded="true"]');const saved=await snapshot();check('refresh-keeps-five-unlocked',saved.save.unlocked===5&&saved.save.completed.every(Boolean),saved);const startLabel=await page.locator('#co-start').innerText();check('restored-selected-level-label',await page.locator('[data-level="5"]').evaluate(n=>n.classList.contains('selected'))&&startLabel.includes('夜间赶海'),{startLabel,unlocked:saved.save.unlocked});await shot('all-unlocked');
  }
  const frames=await page.evaluate(()=>window.__qaFrames);if(frames.length){const sorted=frames.slice(10).sort((a,b)=>a-b);report.performance={frameCount:sorted.length,meanFps:1000/(sorted.reduce((a,b)=>a+b,0)/sorted.length),p95Ms:sorted[Math.floor(sorted.length*.95)],note:'Ready frames after refresh only; do not infer gameplay FPS. Per-level natural performance is recorded in levels[].performance.'};}
  segment('campaign');if(mode==='all'&&report.levels.filter(l=>l.reason==='complete').length!==5)throw Error('Five natural unlocks required before continuing');
 }
 if(mode==='collisions'||mode==='all'){
  // Unlock exclusively through the same visible campaign. No save seeding.
  if(mode==='all'){await tap('[data-level="3"]');await tap('#co-start');}else{await tap('#co-start');for(let id=1;id<=2;id++){const r=await drive({stage:id});check('unlock-prerequisite-'+id,r.reason==='complete',r);if(r.reason!=='complete')throw Error('Unlock prerequisite failed');await tap('#co-next');}}
  // Center-lane first vehicle deliberately left unavoided with normal input.
  await page.waitForTimeout(5000);await shot('vehicle-warning');await page.waitForSelector('#coast[data-phase="finished"]',{timeout:20000});const crash=await snapshot();const accidentVisible=!(await page.locator('#co-modal').isVisible());await page.waitForTimeout(100);await shot('vehicle-accident');check('accident-visible-before-settlement',accidentVisible,{phase:crash.phase,reason:crash.reason,settlementInitiallyHidden:accidentVisible});await page.locator('#co-modal').waitFor({state:'visible'});await shot('vehicle-impact');check('car-ends-round',crash.reason==='vehicle',crash);
  await page.waitForTimeout(1200);const frozen=await snapshot();check('crash-freezes-score',frozen.count===crash.count&&frozen.distance===crash.distance,{crash,frozen});
  const n=navs;await tap('#co-replay');await page.waitForTimeout(700);check('failure-replay-without-navigation',navs===n&&(await snapshot()).phase==='running',{navigationCount:navs});await tap('#co-pause');await tap('#co-select');await tap('[data-level="1"]');await tap('#co-start');
  await waitDistance(35);await tap('[data-action="left"]');await waitDistance(66);await tap('[data-action="right"]');await tap('[data-action="right"]');await page.waitForFunction(()=>window.__coast.snapshot().stun>2.7,null,{timeout:15000});const ped=await snapshot();await shot('pedestrian-fall');await page.waitForTimeout(1300);const waiting=await snapshot();await shot('pedestrian-wait');check('pedestrian-stops-but-countdown-runs',waiting.distance===ped.distance&&waiting.elapsed>ped.elapsed+1.1&&waiting.stun>1,{ped,waiting});await page.waitForTimeout(1000);await shot('pedestrian-rising');await page.waitForTimeout(1200);const recovered=await snapshot();await shot('pedestrian-recovery');check('pedestrian-recovers-once',recovered.distance>waiting.distance&&recovered.events.filter(e=>e.type==='pedestrian-hit').length===1,recovered);
  await tap('#co-pause');await tap('#co-replay');await waitDistance(35);await tap('[data-action="left"]');await waitDistance(80);await tap('[data-action="right"]');await waitDistance(221);await page.waitForTimeout(130);await tap('[data-action="jump"]');await page.waitForTimeout(260);await shot('barrier-jump');await waitDistance(229);const jumped=await snapshot();check('visible-barrier-jump-clears',jumped.phase==='running'&&jumped.events.some(e=>e.type==='barrier-cleared'&&e.objectId==='l1-o2'&&e.jumped),jumped);await shot('barrier-cleared');await waitDistance(237);const prize=await snapshot();check('authored-barrier-prize-caught',prize.events.some(e=>e.type==='fish-caught'&&e.objectId==='l1-jump-l1-o2'&&e.bonus&&e.golden),prize);await shot('authored-barrier-prize');
  // One tap, not a held turn; all platform touch actions use locator.tap above.
  const lane=await snapshot();await tap('[data-action="left"]');await page.waitForTimeout(1000);const moved=await snapshot();check('one-touch-one-lane',moved.laneIndex===Math.max(0,lane.laneIndex-1)&&Math.abs(moved.lane-LANES_FOR_QA[moved.laneIndex])<.01,{lane,moved});
  segment('collisions');
 }
 if(mode==='safety'||mode==='all'){
  if(mode==='all'){await tap('#co-pause');await tap('#co-select');await tap('[data-level="3"]');await tap('#co-start');}else{await tap('#co-start');for(let id=1;id<=2;id++){const r=await drive({stage:id});check('unlock-prerequisite-'+id,r.reason==='complete',r);if(r.reason!=='complete')throw Error('Unlock prerequisite failed');await tap('#co-next');}}
  const approach=await drive({stage:3,stopAtDistance:185});check('van-target-distance-reached',approach.distance>=185&&approach.level===3,approach);while((await view()).lane<2)await tap('[data-action="right"]');await shot('van-approach');
  await page.waitForSelector('#coast[data-phase="finished"]',{timeout:15000});const van=await snapshot();await shot('van-impact');check('van-ends-round',van.reason==='vehicle'&&van.events.some(e=>e.type==='failed'&&e.kind==='van'),van);
  await tap('#co-replay');await waitDistance(82);await tap('[data-action="jump"]');await page.waitForSelector('#coast[data-phase="finished"]',{timeout:6000});const airborne=await snapshot();await shot('car-not-jumpable');check('car-not-jumpable',airborne.reason==='vehicle'&&airborne.y>.31,airborne);
  await tap('#co-select');await tap('[data-level="1"]');await tap('#co-start');const short=await drive({stage:'fish-short',avoidFish:true});await shot('distance-without-fish-fails');check('distance-and-fish-jointly-required',short.distance===300&&short.reason==='fish-short'&&short.count<6,short);
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
