/* global process,console,window,document,performance */
// Normal-input comparison, NOT humans, a retention study or a physical phone.
import {chromium,webkit} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {URL} from 'node:url';
import path from 'node:path';
import {RUN,WORKSPACE,json,sha} from './prepare.mjs';
import {serve} from './serve.mjs';
import {browserOptions,qaDpr} from './browser-options.mjs';
import {tapVisible,touchSession} from './touch.mjs';
import {visibleLaneFromHud,createRiskPolicyState,decideRiskAction} from './runtime/risk-policy.mjs';
import {campaignWallBudgetMs} from './runtime/qa-budget.mjs';
import {softwareQualityActions,experienceMotionPreference} from './experience-policy.mjs';
import {classifyGameplayDispatch} from './qa-input.mjs';

const engine=process.env.QA_ENGINE??'chromium';
const label=process.env.QA_V7_LABEL??'candidate';
if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid QA label');
const build=JSON.parse(await readFile(path.join(RUN,'build-receipt.json')));
const dir=path.join(RUN,'attempts',`attempt-${build.attempt}`,`v7-journey-${engine}-${label}`);
await mkdir(dir,{recursive:true});
const source=await readFile(new URL(import.meta.url));await writeFile(path.join(dir,'driver-source.mjs'),source);
const report={targetGame:'鹈鹕海岸冒险 V7',workspace:WORKSPACE,engine,buildHash:build.buildHash,
 attempt:build.attempt,driverHash:sha(source),normalInputOnly:true,stateInjection:false,
 decisionSource:'Public DOM distance, radar, jump button, wing meter; authored route learned from previous actual attempts. Snapshot is readback evidence only.',
 humanTest:'NOT_RUN',physicalPhone:'NOT_RUN',adSdk:'NOT_INTEGRATED',
 rounds:[],layouts:[],checks:[],screenshots:[],errors:[],passed:false};
const check=(name,passed,evidence)=>{report.checks.push({name,passed,evidence});console.log(JSON.stringify({name,passed,evidence}));};
const server=await serve();let browser;
async function view(page){
 return page.evaluate(()=>{
  // Endless has no campaign gold quota; this DOM branch is genuinely absent.
  const gold=document.querySelector('[data-goal="gold"]');
  return ({
  phase:document.querySelector('#coast').dataset.phase,
  distance:Number(document.querySelector('#co-distance').textContent.match(/\d+/)[0]),
  laneIndex:[...document.querySelectorAll('.co-lane-indicator i')].findIndex(e=>e.classList.contains('on')),
  lanes:[...document.querySelectorAll('.co-lane')].map(e=>({className:e.className,text:e.textContent})),
  goldCounter:gold===null?null:Number(gold.textContent.match(/\d+/)[0]),
  jumpReady:document.querySelector('[data-action="jump"]').classList.contains('ready'),
  gliding:document.querySelector('#co-wing-meter')?.classList.contains('active')===true,
  wingVisible:document.querySelector('#co-wing-meter')?.hidden===false,
  feedback:document.querySelector('#co-feedback').textContent,
  nowMs:performance.now(),
 });});
}
const snapshot=page=>page.evaluate(()=>window.__coast.snapshot());
async function shot(page,name){
 const file=path.join(dir,name+'.png');await page.screenshot({path:file});
 report.screenshots.push({name,path:path.relative(RUN,file),sha256:sha(await readFile(file))});
}
async function observeInputs(page){
 await page.addInitScript(()=>{
  window.__v7Trusted=[];
  for(const type of ['pointerdown','pointerup','pointercancel','keydown','keyup'])
   document.addEventListener(type,e=>window.__v7Trusted.push({type,trusted:e.isTrusted,
    pointerType:e.pointerType,code:e.code,at:performance.now(),
    action:e.target.closest('[data-action]')?.dataset.action,
    x:e.clientX,y:e.clientY}),true);
 });
}
async function round(page,strategy,number){
 const actions=[],lateRequests=[],trajectory=[],targets=[{barrierId:'l1-o13',distance:110},{barrierId:'l1-o3',distance:233}];
 let index=0,state=createRiskPolicyState(1,strategy==='skilled'?targets[0]:{barrierId:'none',distance:9999});
 let lastBlind=-10,held=null,flightShot=false,earlyRight=false,earlyReturn=false,lastTrace=-1,endlessShot=false,endlessExit=null;
 const session=await touchSession(page,engine);
 const send=(type,p)=>session.send('Input.dispatchTouchEvent',{type,
  touchPoints:engine==='chromium'&&(type==='touchEnd'||type==='touchCancel')?[]:[{x:p.x,y:p.y,id:1}]});
 const act=async(action,v)=>{
  const selector=`[data-action="${action}"]`,at=performance.now();
  // A real collision can settle between the DOM read and a blind tap.
  // Never wait 30s for the now-hidden button, or count that tap as gameplay.
  const b=await page.locator(selector).boundingBox();
  if(!b){
   if((await view(page)).phase==='finished')return;
   throw Error('Gameplay control missing during a running round');
  }
  const point={x:b.x+b.width/2,y:b.y+b.height/2};
  const inputStart=await page.evaluate(()=>window.__v7Trusted.length);
  if(action==='jump'&&strategy==='skilled'){
   await send('touchStart',point);held={...point,until:targets[index].distance+7};
  }else await page.touchscreen.tap(point.x,point.y);
  const dispatch=await page.evaluate(start=>({
   events:window.__v7Trusted.slice(start),phase:document.querySelector('#coast').dataset.phase,
  }),inputStart);
  if(classifyGameplayDispatch(action,dispatch.events,dispatch.phase)==='terminal-before-dispatch'){
   lateRequests.push({action,distance:v.distance,...dispatch});return;
  }
  actions.push({action,distance:v.distance,lane:v.laneIndex,observedLanes:v.lanes,
   trustedMechanism:action==='jump'&&strategy==='skilled'?'native-touch-hold':'public-touchscreen.tap',
   inputWallMs:Math.round(performance.now()-at)});
 };
 const start=performance.now(),deadline=start+campaignWallBudgetMs(1);
 while(performance.now()<deadline){
  const raw=await view(page);if(raw.phase==='finished')break;
  if(raw.phase!=='running')throw Error('Unexpected phase '+raw.phase);
  const v={...raw,lanes:raw.lanes.map(visibleLaneFromHud)};
  if(v.distance!==lastTrace){trajectory.push(raw);lastTrace=v.distance;}
  if(strategy==='endless'){
   if(v.distance>=180&&!endlessShot){await shot(page,'endless-varied-encounters');endlessShot=true;}
   if(v.distance>=(process.env.QA_V7_QUICK==='1'?240:550)){
    await tapVisible(page,'#co-pause');await tapVisible(page,'#co-exit');break;
   }
   // The campaign prize bot treats every red forecast as a closed lane.
   // Its actual 409m failure ignored a visible two-step escape with >2s left.
   // In endless, abandon the current fish early when two approaching vehicles
   // share our side; commit across the middle BEFORE their displayed arrival.
   // No collision state/seed/obstacle coordinates enter this decision.
   const current=v.lanes[v.laneIndex],middle=v.lanes[1],opposite=2-v.laneIndex;
   if(endlessExit===null&&v.laneIndex!==1&&current.kind==='vehicle'&&middle.kind==='vehicle'&&
    current.seconds<=4&&middle.seconds>=2&&!v.lanes[opposite].danger)endlessExit=opposite;
   if(endlessExit!==null){
    if(v.laneIndex===endlessExit)endlessExit=null;
    else await act(endlessExit<v.laneIndex?'left':'right',v);
   }else{
    const d=decideRiskAction(v,state);state=d.state;
    if(d.action!=='wait')await act(d.action,v);
   }
  }
  if(held&&v.distance>=held.until){await send('touchEnd',held);held=null;actions.push({action:'wing-release',distance:v.distance});}
  if(v.gliding&&!flightShot){
   await shot(page,`round-${number}-${strategy}-real-glide`);flightShot=true;
   const box=await page.locator('#co-feedback').boundingBox();
   check(`${number}-wing-feedback-compact`,box.height<=48,{height:box.height});
  }
  if(strategy==='left-only'&&actions.length===0){await act('left',v);await act('left',v);}
  if(strategy==='blind-jump'&&performance.now()-start-lastBlind>=600){
   lastBlind=performance.now()-start;await act('jump',v);
  }
  if(strategy==='anticipating'||strategy==='skilled'){
   // Learned opening: first central fish, fractional right pickup, then back
   // AFTER the 35m barrier. Decisions still wait for visible progress.
   if(!earlyRight&&v.distance>=14){await act('right',v);earlyRight=true;}
   else if(!earlyReturn&&v.distance>=38){await act('left',v);earlyReturn=true;}
   else if(earlyReturn){
    if(strategy==='skilled'&&index<targets.length-1&&v.distance>targets[index].distance+10){
     index++;state=createRiskPolicyState(1,targets[index]);
    }
    const d=decideRiskAction(v,state);state=d.state;
    if(d.action!=='wait'&&!held)await act(d.action,v);
   }
  }
  await page.waitForTimeout(65);
 }
 if(held)await send('touchEnd',held);
 const terminal=await snapshot(page);await shot(page,`round-${number}-${strategy}-settlement`);
 const trusted=await page.evaluate(()=>window.__v7Trusted.splice(0));
 const result={number,strategy,wallMs:Math.round(performance.now()-start),terminal,actions,lateRequests,trajectory,trusted,flightShot};
 report.rounds.push(result);
 check(`${number}-${strategy}-real-terminal`,terminal.phase==='finished',{reason:terminal.reason,distance:terminal.distance,fish:terminal.count,gold:terminal.gold,score:terminal.score,airCatches:terminal.airCatches});
 check(`${number}-${strategy}-trusted-input`,trusted.every(e=>e.trusted)&&trusted.filter(e=>e.type==='pointerdown'&&e.action).length>=actions.filter(a=>a.action!=='wing-release').length,{events:trusted.length,gameplayActions:actions.length});
 if(strategy==='skilled'){
  check(`${number}-skilled-default-journey-complete`,terminal.reason==='complete',terminal.reason);
  check(`${number}-real-air-catches`,terminal.airCatches>=2&&flightShot,{airCatches:terminal.airCatches,flightShot});
  check(`${number}-earned-jumps`,terminal.jumpedBarriers>=2,terminal.jumpedBarriers);
 }
 if(strategy==='endless'){
  check('endless-natural-phrases-and-earned-checkout',terminal.reason==='retired'&&terminal.distance>=240&&terminal.count>0&&endlessShot,terminal.reason);
  if(process.env.QA_V7_QUICK!=='1')
   check('endless-visible-tier-crossed',terminal.events.some(e=>e.type==='endless-tier'&&e.tier===1),terminal.distance);
 }
 return result;
}
try{
 browser=await(engine==='webkit'?webkit:chromium).launch(browserOptions(engine));
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,
  reducedMotion:experienceMotionPreference(process.env.QA_TOUCH_MOTION),
  deviceScaleFactor:qaDpr(),recordVideo:{dir,size:{width:390,height:844}}});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await observeInputs(page);
 await page.goto(`http://127.0.0.1:${server.address().port}/game/index.html`);
 await page.waitForSelector('#coast[data-loaded="true"]');
 for(const selector of softwareQualityActions(process.env.QA_TOUCH_QUALITY))await tapVisible(page,selector);
 await shot(page,'startup');
 const startBox=await page.locator('#co-start').boundingBox(),routeBox=await page.locator('#co-route').boundingBox();
 check('primary-start-precedes-optional-routes',startBox.y+startBox.height<=routeBox.y,{startBox,routeBox});
 check('optional-wardrobe-starts-collapsed',!(await page.locator('#co-wardrobe').evaluate(e=>e.open)),{});
 const strategies=process.env.QA_V7_QUICK==='1'?['skilled']:['no-input','left-only','blind-jump','anticipating','skilled','skilled','skilled'];
 for(const [i,strategy]of strategies.entries()){
  await tapVisible(page,i===0?'#co-start':'#co-replay');
  const before=await snapshot(page);
  check(`round-${i+1}-fresh-retry`,before.distance<3&&before.count===0&&before.hits===0,before.distance);
  await round(page,strategy,i+1);
 }
 await tapVisible(page,'#co-select');await tapVisible(page,'[data-level="6"]');await tapVisible(page,'#co-start');
 await round(page,'endless',strategies.length+1);
 await tapVisible(page,'#co-replay');
 const endlessReplay=await snapshot(page);
 check('endless-free-replay-from-real-settlement',endlessReplay.level===6&&endlessReplay.phase==='running'&&endlessReplay.distance<3,endlessReplay.distance);
 await shot(page,'endless-free-replay');
 await context.close();
 // Separate real default menu visits, not simulated resize screenshots.
 for(const size of [{width:320,height:568},{width:844,height:390}]){
  const c=await browser.newContext({viewport:size,hasTouch:true,isMobile:true,deviceScaleFactor:1,
   reducedMotion:experienceMotionPreference(process.env.QA_TOUCH_MOTION)});
  const p=await c.newPage();await observeInputs(p);
  await p.goto(`http://127.0.0.1:${server.address().port}/game/index.html`);
  await p.waitForSelector('#coast[data-loaded="true"]');await shot(p,`menu-${size.width}`);
  await tapVisible(p,'#co-wardrobe summary');
  // Static disclosure content may require ordinary locator actionability
  // scrolling on a short landscape screen; actual trusted taps are recorded.
  await p.locator('[data-style="classic"]').tap();
  check(`wardrobe-${size.width}-owned-style-reachable`,
   (await p.locator('[data-style="classic"] small').innerText())==='已穿戴',{});
  await shot(p,`wardrobe-${size.width}`);
  await p.locator('#co-wardrobe summary').tap();
  for(const selector of softwareQualityActions(process.env.QA_TOUCH_QUALITY))await tapVisible(p,selector);
  await tapVisible(p,'#co-start');await p.waitForTimeout(900);
  const boxes=await p.locator('[data-action]').evaluateAll(nodes=>nodes.map(n=>{
   const b=n.getBoundingClientRect();return {width:b.width,height:b.height,x:b.x,y:b.y};
  }));
  check(`controls-${size.width}-reachable`,boxes.every(b=>b.width>=44&&b.height>=44&&b.y+b.height<=size.height+1),boxes);
  await shot(p,`running-${size.width}`);
  await p.waitForFunction(()=>document.querySelector('#coast').dataset.phase==='finished',null,{timeout:campaignWallBudgetMs(1)});
  const terminal=await snapshot(p);await shot(p,`terminal-${size.width}`);
  await tapVisible(p,'#co-replay');await p.waitForTimeout(250);
  const replay=await snapshot(p);await shot(p,`replay-${size.width}`);
  const trusted=await p.evaluate(()=>window.__v7Trusted);
  check(`layout-${size.width}-natural-failure-and-free-replay`,terminal.reason==='barrier'&&replay.phase==='running'&&replay.distance<4,terminal.reason);
  report.layouts.push({viewport:size,terminal,replay,trusted});
  await c.close();
 }
 check('no-runtime-errors',report.errors.length===0,report.errors);
 report.passed=report.checks.every(c=>c.passed);
}catch(error){report.errors.push(String(error));console.error(error);}
finally{
 if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
 await json(path.join(dir,'report.json'),report);
}
if(!report.passed)process.exitCode=1;
