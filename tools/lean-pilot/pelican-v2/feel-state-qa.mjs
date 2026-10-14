/* global process,console,window */
import {webkit,chromium} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {URL} from 'node:url';
import path from 'node:path';
import {RUN,WORKSPACE,json,sha} from './prepare.mjs';
import {serve} from './serve.mjs';
import {browserOptions,qaDpr} from './browser-options.mjs';
import {touchSession} from './touch.mjs';
const engine=process.env.QA_ENGINE??'webkit',build=JSON.parse(await readFile(path.join(RUN,'build-receipt.json'))),dir=path.join(RUN,'attempts',`attempt-${build.attempt}`,`feel-state-${engine}`);await mkdir(dir,{recursive:true});
const source=await readFile(new URL(import.meta.url));await writeFile(path.join(dir,'driver-source.mjs'),source);
const report={schemaVersion:1,targetGame:'鹈鹕海岸冒险',workspace:WORKSPACE,buildHash:build.buildHash,engine,driverSha256:sha(source),normalInputOnly:true,stateInjection:false,actions:[],frames:[],screenshots:[],checks:[],errors:[]};
const server=await serve(),browser=await(engine==='webkit'?webkit:chromium).launch(browserOptions(engine)),context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:qaDpr(),hasTouch:true,isMobile:true,recordVideo:{dir,size:{width:390,height:844}}}),page=await context.newPage();
const observe=()=>page.evaluate(()=>({state:window.__coast.snapshot(),render:window.__coast.renderInfo()}));
const shot=async name=>{const p=path.join(dir,name+'.png');await page.screenshot({path:p});const b={path:path.relative(RUN,p),sha256:sha(await readFile(p))};report.screenshots.push(b);return b;};
const tap=async selector=>{report.actions.push({at:new Date().toISOString(),type:'tap',selector});await page.locator(selector).tap();};
try{
 page.on('pageerror',e=>report.errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/game/index.html');await page.waitForSelector('#coast[data-loaded="true"]');await tap('#co-start');
 const start=Date.now(),session=await touchSession(page,engine),events=[[700,'right'],[900,'frame'],[1200,'left'],[1300,'frame'],[1380,'right'],[1500,'frame'],[1570,'left'],[1750,'frame'],[2200,'jump'],[2340,'right'],[2480,'frame'],[2780,'left'],[3200,'frame']];
 for(const [plannedMs,kind]of events){await page.waitForTimeout(Math.max(0,start+plannedMs-Date.now()));if(kind==='frame'){const before=await observe(),image=await shot('state-'+plannedMs),after=await observe();report.frames.push({plannedMs,before,after,image,completedMs:Date.now()-start,note:'Screenshot is correlated with these actual read-only before/after state brackets, no posed state or camera setters.'});}
 else{const selector=`[data-action="${kind}"]`,box=await page.locator(selector).boundingBox();if(!box)throw Error('Visible control missing');const point={x:box.x+box.width/2,y:box.y+box.height/2,id:1};report.actions.push({at:new Date().toISOString(),type:'trusted-touch-press',selector,action:kind,scheduledMs:plannedMs,actualMs:Date.now()-start,heldMs:90});await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await page.waitForTimeout(90);await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:engine==='webkit'?[point]:[]});}}
 await page.waitForSelector('#coast[data-phase="finished"]',{timeout:30000});await page.locator('#co-modal').waitFor({state:'visible'});report.terminal=await observe();await shot('terminal');report.checks.push({name:'normal-barrier-terminal',passed:report.terminal.state.reason==='barrier'});await tap('#co-replay');await page.waitForTimeout(600);report.replay=await observe();await shot('replay');report.checks.push({name:'normal-replay',passed:report.replay.state.phase==='running'&&report.replay.state.level===1});
 report.checks.push({name:'six-state-correlated-running-frames',passed:report.frames.length===6&&report.frames.every(f=>f.before.state.phase==='running'&&f.after.state.phase==='running'&&[...f.before.render.camera.position,...f.after.render.camera.position].every(Number.isFinite))});
}catch(e){report.errors.push(e.stack);}finally{const video=await page.video().path();await context.close();report.video={path:path.relative(RUN,video),sha256:sha(await readFile(video))};await browser.close();server.close();report.passed=report.errors.length===0&&report.checks.length===3&&report.checks.every(c=>c.passed);await json(path.join(dir,'report.json'),report);console.log(JSON.stringify({engine,buildHash:build.buildHash,passed:report.passed,checks:report.checks,errors:report.errors}));if(!report.passed)process.exitCode=1;}
