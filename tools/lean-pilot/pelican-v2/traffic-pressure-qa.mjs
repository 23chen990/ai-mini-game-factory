/* global process, console, window, document, performance, requestAnimationFrame */
// Normal public input, learned route, no state writes. NOT a human fun/ad study.
import {URL} from 'node:url';
import {chromium,webkit} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {RUN,WORKSPACE,json,sha} from './prepare.mjs';
import {serve} from './serve.mjs';
import {browserOptions} from './browser-options.mjs';
import {touchSession,tapVisible} from './touch.mjs';

const engine=process.env.QA_ENGINE??'chromium';
const build=JSON.parse(await readFile(path.join(RUN,'build-receipt.json')));
const dir=path.join(RUN,'attempts',`attempt-${build.attempt}`,`traffic-pressure-${engine}`);
await mkdir(dir,{recursive:true});
const source=await readFile(new URL(import.meta.url));
await writeFile(path.join(dir,'driver-source.mjs'),source);
const report={targetGame:'鹈鹕海岸冒险 V7',workspace:WORKSPACE,buildHash:build.buildHash,
 attempt:build.attempt,engine,driverHash:sha(source),normalInputOnly:true,stateInjection:false,
 decisionSource:'Public DOM distance and phase; learned route. Inspection-only traffic/physics is recorded after inputs, never used to steer.',
 humanTest:'NOT_RUN',physicalPhone:'NOT_RUN',rounds:[],checks:[],screenshots:[],errors:[],passed:false};
const check=(name,passed,evidence)=>{report.checks.push({name,passed,evidence});console.log(JSON.stringify({name,passed,evidence}));};
const server=await serve();
const browser=await ({chromium,webkit}[engine]).launch(browserOptions(engine));
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,
 isMobile:true,hasTouch:true,recordVideo:{dir:path.join(dir,'video'),size:{width:390,height:844}}});
const page=await context.newPage();
page.on('pageerror',e=>report.errors.push(String(e)));
await page.addInitScript(()=>{
 window.__pressureInputs=[];
 for(const type of ['pointerdown','pointerup'])document.addEventListener(type,e=>{
  window.__pressureInputs.push({type,trusted:e.isTrusted,pointerType:e.pointerType,at:performance.now(),
   action:e.target.closest('[data-action]')?.dataset.action,id:e.target.id});
 },true);
});
async function capture(name){
 const file=path.join(dir,name+'.png');
 await page.screenshot({path:file});
 report.screenshots.push({name,path:path.relative(RUN,file),sha256:sha(await readFile(file))});
}
const view=()=>page.evaluate(()=>({
 phase:document.querySelector('#coast').dataset.phase,
 distance:Number(document.querySelector('#co-distance').textContent.match(/\d+/)[0]),
 lanes:[...document.querySelectorAll('.co-lane')].map(e=>({text:e.textContent,className:e.className,height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth})),
 feedback:document.querySelector('#co-feedback').textContent,
 escape:document.querySelector('#co-escape').textContent,at:performance.now(),
}));
const inspect=()=>page.evaluate(()=>({state:window.__coast.snapshot(),traffic:window.__coast.traffic()}));

try{
 await page.goto(`http://127.0.0.1:${server.address().port}/game/index.html`);
 await page.locator('#coast[data-loaded="true"]').waitFor();
 await capture('startup');
 await tapVisible(page,'#co-start');
 let points=await page.evaluate(()=>Object.fromEntries(
  [...document.querySelectorAll('[data-action]')].map(e=>{
   const b=e.getBoundingClientRect(),point={x:b.x+b.width/2,y:b.y+b.height/2};
   if(document.elementFromPoint(point.x,point.y).closest('[data-action]')!==e)
    throw Error('Gameplay control is occluded');
   return [e.dataset.action,point];
  })));
 const session=await touchSession(page,engine);
 const touch=(type,point)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:
  engine==='chromium'&&type==='touchEnd'?[]:[{...point,id:1}]});
 async function ride(name,route,photos){
  const actions=[],trace=[],start=performance.now();let index=0,photo=0,last=-1,held=false;
  while(performance.now()-start<100000){
   const v=await view();
   if(v.phase==='finished')break;
   if(v.phase!=='running')throw Error('Unexpected phase '+v.phase);
   while(index<route.length&&v.distance>=route[index][0]){
    const [,action]=route[index++];
    if(action==='release'){await touch('touchEnd',points.jump);held=false;}
    else if(action==='hold'){await touch('touchStart',points.jump);held=true;}
    else await page.touchscreen.tap(points[action].x,points[action].y);
    actions.push({action,distance:v.distance,observedAt:v.at});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
   }
   if(v.distance!==last){
    trace.push({public:v,...await inspect()});last=v.distance;
   }
   if(photo<photos.length&&v.distance>=photos[photo][0]){
    await capture(name+'-'+photos[photo++][1]);
   }
   await page.waitForTimeout(55);
  }
  if(held)await touch('touchEnd',points.jump);
  const terminal=await inspect();
  await capture(name+'-settlement');
  const inputs=await page.evaluate(()=>window.__pressureInputs.splice(0));
  const result={name,viewport:{...page.viewportSize(),label:engine+'-'+page.viewportSize().width+'x'+page.viewportSize().height},
   actions,trace,terminal,inputs,wallMs:performance.now()-start};
  report.rounds.push(result);return result;
 }
 const fail=await ride('missed-merge',[[16,'right'],[39,'left'],[49,'left']],
  [[45,'signal'],[56,'merging'],[60,'settled']]);
 check('exact-moving-car-failure',fail.terminal.state.reason==='vehicle'&&
  fail.terminal.state.events.at(-1).objectId==='l1-o11',fail.terminal.state.events.slice(-5));
 const phases=fail.trace.flatMap(t=>t.traffic.filter(o=>o.id==='l1-o11'));
 check('signal-before-continuous-merge',phases.some(o=>o.phase==='signal'&&o.signalVisible)&&
  phases.some(o=>o.phase==='merging'&&o.z<-.2&&o.z>-1.5)&&phases.some(o=>o.phase==='settled'),
  phases.filter((_,i)=>i%3===0));
 check('real-wheel-rotation-and-world-travel',new Set(phases.map(o=>o.wheelAngle)).size>5&&
  Math.max(...phases.map(o=>o.x))-Math.min(...phases.map(o=>o.x))>25,'Read-only real model transform samples');

 await tapVisible(page,'#co-replay');
 const win=await ride('skilled-route',[
  [16,'right'],[39,'left'],[104,'hold'],[116,'release'],[134,'jump'],
  [168,'right'],[185,'left'],[188,'left'],[199,'jump'],[215,'right'],
  [227,'hold'],[240,'release'],[245,'left'],[278,'right'],[281,'right'],
 ],[[36,'escape'],[46,'traffic-signal'],[57,'traffic-merge'],[114,'wing-catch'],[183,'vehicle-escape'],[236,'late-wing']]);
 const result=win.terminal.state;
 check('default-first-level-complete',result.reason==='complete'&&result.distance===300&&result.hits===0,
  {reason:result.reason,distance:result.distance,count:result.count,gold:result.gold});
 check('earned-skill-not-a-synthetic-score',result.jumpedBarriers===4&&result.airCatches>=3&&
  result.nearMisses>=1&&result.count>=12,{jumps:result.jumpedBarriers,air:result.airCatches,near:result.nearMisses});
 check('fifty-seconds-of-active-riding',Math.abs(result.elapsed-50)<.05,result.elapsed);
 check('trusted-gameplay-controls',win.inputs.filter(e=>e.type==='pointerdown'&&e.action).length===
  win.actions.filter(a=>a.action!=='release').length&&win.inputs.every(e=>e.trusted),win.actions);
 check('escape-pop-visible',win.trace.some(t=>t.public.escape.includes('漂亮擦肩')),
  'Screenshot skilled-route-escape and video still require independent visual review');
 await tapVisible(page,'#co-replay');
 await page.waitForTimeout(1000);
 const replay=await inspect();
 check('settlement-to-replay',replay.state.phase==='running'&&replay.state.distance>0&&replay.state.distance<15,
  {phase:replay.state.phase,distance:replay.state.distance});
 await tapVisible(page,'#co-pause');
 const paused=await inspect();await page.waitForTimeout(700);const frozen=await inspect();
 check('pause-freezes-bike-and-traffic',paused.state.distance===frozen.state.distance&&
  JSON.stringify(paused.traffic)===JSON.stringify(frozen.traffic),'Actual pause button, then inspection only');
 await capture('replay-paused');
 check('merge-radar-compact',win.trace.every(t=>t.public.lanes.every(l=>l.height<=50&&l.scrollWidth<=l.clientWidth+1)),
  'Actual live radar sizes, including merge arrows and countdowns');
 if(engine==='chromium')for(const viewport of [{width:320,height:568},{width:844,height:390}]){
  await page.setViewportSize(viewport);await tapVisible(page,'#co-replay');
  points=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('[data-action]')].map(e=>{
   const b=e.getBoundingClientRect();return [e.dataset.action,{x:b.x+b.width/2,y:b.y+b.height/2}];
  })));
  const layout=await ride('layout-'+viewport.width+'x'+viewport.height,[[16,'right'],[39,'left'],[49,'left']],
   [[45,'signal'],[56,'merging']]);
  check('exact-merge-branch-'+viewport.width,layout.terminal.state.reason==='vehicle'&&
   layout.terminal.state.events.at(-1).objectId==='l1-o11'&&
   layout.trace.every(t=>t.public.lanes.every(l=>l.height<=55&&l.scrollWidth<=l.clientWidth+1)),
   {viewport,reason:layout.terminal.state.reason});
 }
 check('no-runtime-errors',report.errors.length===0,report.errors);
 report.passed=report.checks.every(c=>c.passed);
}finally{
 await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));
 await json(path.join(dir,'report.json'),report);
}
if(!report.passed)process.exitCode=1;
