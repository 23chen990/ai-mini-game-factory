/* global process,console,window,performance,requestAnimationFrame */
import {webkit,chromium} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {URL} from 'node:url';
import path from 'node:path';
import {RUN,WORKSPACE,json,sha} from './prepare.mjs';
import {serve} from './serve.mjs';
import {browserOptions,qaDpr} from './browser-options.mjs';
import {touchSession} from './touch.mjs';
const engine=process.env.QA_ENGINE??'webkit',build=JSON.parse(await readFile(path.join(RUN,'build-receipt.json'),'utf8'));
const dir=path.join(RUN,'attempts','attempt-'+build.attempt,'feel-comparison-'+engine);await mkdir(dir,{recursive:true});
const server=await serve(),browser=await(engine==='webkit'?webkit:chromium).launch(browserOptions(engine));
const source=await readFile(new URL(import.meta.url));await writeFile(path.join(dir,'driver-source.mjs'),source);
const results=[];
try{for(const variant of [{id:'PR10',url:'baseline/index.html?cam=chase&q=low',start:'#mk-start',left:'[data-code="ArrowLeft"]',right:'[data-code="ArrowRight"]',jump:'#mk-action'},{id:'PR13',url:'references/pr13/index.html',start:'#co-start',left:'[data-action="left"]',right:'[data-action="right"]',jump:'[data-action="jump"]'},{id:'V3',url:'game/index.html',start:'#co-start',left:'[data-action="left"]',right:'[data-action="right"]',jump:'[data-action="jump"]'}]){
 const sub=path.join(dir,variant.id);await mkdir(sub,{recursive:true});const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:qaDpr(),recordVideo:{dir:sub,size:{width:390,height:844}}}),p=await ctx.newPage();
 const r={variant:variant.id,engine,viewport:{width:390,height:844},normalInputOnly:true,stateInjection:false,cameraMode:'chase; native parameters retained, no camera setters',actions:[],errors:[],screenshots:[],sourceHtmlSha256:sha(await readFile(path.join(WORKSPACE,variant.url.split('?')[0])))};p.on('pageerror',e=>r.errors.push(e.message));
 await p.goto('http://127.0.0.1:'+server.address().port+'/'+variant.url);await p.locator(variant.start).waitFor();await p.locator(variant.start).tap();
 await p.evaluate(()=>{window.__feelCapture=[];window.__feelCaptureAt=performance.now();const loop=t=>{const native=window.__pelican,coast=window.__coast,s=coast?.snapshot()??native?.S,render=coast?.renderInfo(),c=render?.camera??null;if(s&&window.__feelCapture.length<700)window.__feelCapture.push({ms:t-window.__feelCaptureAt,lane:s.lane,laneV:s.laneV,lean:s.lean,steer:s.steer,yaw:s.yaw,y:s.y,camera:c,pose:render?.pose});requestAnimationFrame(loop);};requestAnimationFrame(loop);});
 const start=Date.now(),schedule=[[700,'right'],[1200,'left'],[1380,'right'],[1570,'left'],[2200,'jump'],[2340,'right'],[2780,'left']];
 const session=await touchSession(p,engine);
 for(const [ms,action]of schedule){await p.waitForTimeout(Math.max(0,start+ms-Date.now()));const box=await p.locator(variant[action]).boundingBox();if(!box)throw Error('Control missing');const point={x:box.x+box.width/2,y:box.y+box.height/2,id:1};
  r.actions.push({action,scheduledMs:ms,actualMs:Date.now()-start,type:'trusted-touch-press',heldMs:90});await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await p.waitForTimeout(90);await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:engine==='webkit'?[point]:[]});
 }
 await p.waitForTimeout(Math.max(0,start+3800-Date.now()));const file=path.join(sub,'settled.png');await p.screenshot({path:file});r.screenshots.push({path:path.relative(RUN,file),sha256:sha(await readFile(file))});r.samples=await p.evaluate(()=>window.__feelCapture);const video=await p.video().path();await ctx.close();r.video={path:path.relative(RUN,video),sha256:sha(await readFile(video))};r.inputTimingMaxErrorMs=Math.max(...r.actions.map(a=>Math.abs(a.actualMs-a.scheduledMs)));results.push(r);await json(path.join(sub,'report.json'),r);
 }}finally{await browser.close();server.close();}
await json(path.join(dir,'report.json'),{schemaVersion:1,targetGame:'鹈鹕海岸冒险',workspace:WORKSPACE,buildHash:build.buildHash,driverSha256:sha(source),normalInputOnly:true,stateInjection:false,results,note:'Same chase mode, viewport, press duration and sequence. PR10 continuous held steering and PR13/V3 one-lane actions differ by design; native camera parameters retained. Input timestamps quantify scheduling differences.'});console.log('Recorded '+engine+' PR10/PR13/V3 matched-touch comparison');
