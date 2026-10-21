/* global window, document, process, console, URL, MediaRecorder, Blob, performance, getComputedStyle */
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { minimapPolicy } from '../../../tools/lean-pilot/racing-minimap-observer.mjs';
import { VisibleActionPolicy, VisibleWheelPolicy, reconcileTouchContacts } from '../../../tools/lean-pilot/racing-visible-actions.mjs';
import { planWheelGesture, actionTouchPoints } from '../../../tools/lean-pilot/racing-wheel-qa-input.mjs';
import { earnedUpgradeOrigin } from '../../../tools/lean-pilot/racing-visible-policy.mjs';
const [label, device='desktop', kind='sequence', stage='1']=process.argv.slice(2);
assert.ok(label);
const run=path.resolve('runs/h5-qq-mobile-20261013'), out=run+'/artifacts/replay-20261021/'+label;
await mkdir(out);
const runnerSource=await readFile(new URL(import.meta.url));
await writeFile(out+'/observer.mjs',runnerSource);
const root=label.startsWith('before')?run+'/artifacts/replay-20261021/baseline-game':run+'/workspace/game';
const build=JSON.parse(await readFile(label.startsWith('before')?run+'/artifacts/replay-20261021/build-racing.json':run+'/artifacts/build-racing.json'));
let storage,origin;
if(stage!=='1'){
  const prior=run+'/evidence/rc19-natural-retry04-look16';
  storage=JSON.parse(await readFile(prior+'/natural-earned-storage.json'));
  origin=earnedUpgradeOrigin(JSON.parse(await readFile(prior+'/report.json')),storage,JSON.parse(await readFile('docs/lean-pilot/racing-internal-20261020/evidence/build.json')),build.buildHash);
}
const server=createServer(async(req,res)=>{
  try{
    const name=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));assert.ok(file.startsWith(root+'/'));
    res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(file));
  }catch(error){res.writeHead(404).end(error.message);}
});
server.listen(origin?Number(new URL(origin).port):0,'127.0.0.1');await once(server,'listening');
origin='http://127.0.0.1:'+server.address().port;
const touch=device!=='desktop', viewport={width:device==='small-phone'?667:touch?844:1366,height:device==='small-phone'?375:touch?390:768};
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--use-angle=metal']});
const context=await browser.newContext({viewport,isMobile:touch,hasTouch:touch,deviceScaleFactor:1,storageState:storage,recordVideo:{dir:out,size:viewport}});
const page=await context.newPage(),cdp=await context.newCDPSession(page);
const report={buildHash:build.buildHash,device,viewport,kind,stage,profile:storage?'unchanged-earned-profile-upgrade':'fresh',normalInputsOnly:true,physicalDevice:false,human:false,errors:[],frames:[],shots:[],replay:false};
page.on('pageerror',e=>report.errors.push(e.message));
let audioCapture, lastEventTime=-1;
function record(frame){
  const {events,...values}=frame;
  delete values.finalText;
  report.frames.push({...values,events:events.filter(e=>e.atRaceSec>lastEventTime)});
  if(events.length)lastEventTime=events.at(-1).atRaceSec;
}
let keys=new Set(),contacts=[],wheelAngle=null,wheelBounds,actionBounds;
async function hold(next){
  for(const key of keys)if(!next.has(key))await page.keyboard.up(key);
  for(const key of next)if(!keys.has(key))await page.keyboard.down(key);
  keys=next;
}
async function input(axis,actions){
  if(touch){
    const points=actionTouchPoints(actions,actionBounds);
    const plan=planWheelGesture(axis,wheelBounds,points,wheelAngle);
    // Wheel plan assumes its action contacts already exist. Add/lift those first.
    const desired=[...contacts.filter(p=>p.id===1),...points];
    for(const event of reconcileTouchContacts(contacts,desired)){await cdp.send('Input.dispatchTouchEvent',event);contacts=event.touchPoints;}
    for(const event of plan.events){if(event.type==='touchEnd'&&contacts.length===0)continue;await cdp.send('Input.dispatchTouchEvent',event);contacts=event.touchPoints;}
    wheelAngle=plan.angle;
  }else{
    const next=new Set(['ArrowUp']);
    if(axis)next.add(axis>0?'ArrowLeft':'ArrowRight');
    if(actions.includes('drift'))next.add('ShiftLeft');
    await hold(next);
    for(const [action,key] of [['small','KeyW'],['nitro','Space'],['item','ControlLeft']])if(actions.includes(action))await page.keyboard.press(key);
  }
}
const observe=()=>page.evaluate(()=>{
  const g=window.game,p=g.player,small=document.querySelector('[data-race-action="small"]');
  return {phase:document.querySelector('#race-kit').dataset.phase,time:g.raceTime,speed:p.s,h:p.h,m:p.m,drifting:p.drifting,driftTime:p.driftTime,releaseTime:p.releaseTime,driftAngle:p.driftAngle,smallWindow:p.smallWindow,smallBoost:p.smallBoost,impact:p.impact,place:g.standings.indexOf(p)+1,progress:p.progress,finished:p.finished,finishTime:p.finishTime,events:window.__RACE_EVIDENCE__.events,stats:p.stats,
    smallPhase:small.dataset.sprayPhase,smallMeter:{content:getComputedStyle(small,'::after').content,transform:getComputedStyle(small,'::after').transform,height:getComputedStyle(small,'::after').height},smallClass:document.querySelector('[data-race-action="small"]').className,smallStyle:document.querySelector('[data-race-action="small"]').getAttribute('style'),
    audioRunning:g.audio.ctx?.state,finalText:document.querySelector('#race-panel').textContent};
});
const shot=async name=>{await page.screenshot({path:out+'/'+name+'.png'});report.shots.push(name+'.png');};
try{
  await page.goto(origin);await page.locator('#race-start:not([disabled])').waitFor({timeout:60000});await shot('home');
  if(stage!=='1'){assert.equal(await page.locator('#race-stage option[value="'+(Number(stage)-1)+'"]').isDisabled(),false);await page.locator('#race-stage').selectOption(String(Number(stage)-1));}
  await page.locator('#race-start:not([disabled])').click();await page.waitForFunction(()=>window.game.state==='race',null,{timeout:45000});
  await page.evaluate(()=>{window.__QA_INPUT_LOG__=[];for(const type of ['pointerdown','pointerup','keydown','keyup'])document.addEventListener(type,event=>window.__QA_INPUT_LOG__.push({type,key:event.code,action:event.target.closest('[data-race-action]')?.dataset.raceAction,atRaceSec:window.game.raceTime,at:performance.now()}),true);});
  wheelBounds=await page.locator('#race-joystick').boundingBox();actionBounds={};
  if(touch)for(const action of ['drift','small','nitro','item'])actionBounds[action]=await page.locator('[data-race-action="'+action+'"]').boundingBox();
  if(kind==='sequence'){
    audioCapture=await page.evaluateHandle(()=>{
      const audio=window.game.audio, stream=audio.ctx.createMediaStreamDestination();
      audio.master.connect(stream);
      const chunks=[],recorder=new MediaRecorder(stream.stream);
      recorder.addEventListener('dataavailable',e=>chunks.push(e.data));recorder.start();
      return {recorder,chunks,stream,startedAt:performance.now()};
    });
    report.audioCapture='Existing master mixer fork to MediaRecorder; no gameplay hooks or source changes.';
    await input(null,[]);await page.waitForTimeout(1000);
    for(const [name,axis,actions,ms] of [['drift',1,['drift'],320],['release',-.8,['small'],70],['countersteer',-.8,[],250],['straight',null,[],800]]){
      await input(axis,actions);const start=Date.now();
      while(Date.now()-start<ms){record({action:name,at:Date.now(),...await observe()});await page.waitForTimeout(16);}
      await shot(name);
    }
  }else{
    const policy=new VisibleActionPolicy('exit'),wheel=new VisibleWheelPolicy(),captures=new Set(),deadline=Date.now()+260000;
    while(Date.now()<deadline){
      const road=await page.evaluate(minimapPolicy,16);
      const hud=await page.evaluate(touch=>({speedKmh:Number(document.querySelector('#race-speed-value').textContent),drifting:document.querySelector('#race-kit').classList.contains('drifting'),...Object.fromEntries(['small','nitro','item'].map(a=>[a+'Ready',document.querySelector(touch?'[data-race-action="'+a+'"]':'[data-key-action="'+a+'"]').classList.contains('ready')]))}),touch);
      const actions=policy.frame(road,hud,Date.now());
      await input(touch?wheel.frame(road,Date.now()):road.direction==='left'?1:road.direction==='right'?-1:null,actions);
      const o=await observe();record({at:Date.now(),road,actions,...o});
      for(const type of ['driftEnd','smallBoost','crash','nitro'])if(!captures.has(type)&&o.events.some(e=>e.type===type)){captures.add(type);await shot(type);}
      if(o.phase==='finished'){report.terminal=o;await shot('terminal');break;}
      await page.waitForTimeout(50);
    }
    await hold(new Set());if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    if(report.terminal){await page.locator('#race-replay').click();await page.waitForFunction(()=>window.game.state==='race',null,{timeout:45000});report.replay=true;await shot('replay');}
  }
  report.last=await observe();report.inputs=await page.evaluate(()=>window.__QA_INPUT_LOG__);
}catch(e){report.errors.push(e.stack);}
finally{
  if(audioCapture){
    const bytes=await audioCapture.evaluate(c=>new Promise(resolve=>{c.recorder.addEventListener('stop',async()=>{resolve(Array.from(new Uint8Array(await new Blob(c.chunks).arrayBuffer())));});c.recorder.stop();}));
    await writeFile(out+'/audio.webm',new Uint8Array(bytes));
  }
  await context.close();await browser.close();server.close();
  report.runnerSha256=createHash('sha256').update(runnerSource).digest('hex');
  report.htmlSha256=createHash('sha256').update(await readFile(root+'/index.html')).digest('hex');
  await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({out,errors:report.errors,frames:report.frames.length,terminal:report.terminal&&{place:report.terminal.place,finished:report.terminal.finished,time:report.terminal.finishTime},last:report.last&&{speed:report.last.speed,events:report.last.events.filter(e=>e.type!=='scrape')},replay:report.replay}));
if(report.errors.length)process.exitCode=1;
