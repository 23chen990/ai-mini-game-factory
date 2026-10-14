/* global console, window, requestAnimationFrame, WebGL2RenderingContext */
import {URL} from 'node:url';
import { webkit } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { WORKSPACE, RUN, json } from './prepare.mjs';
const server=createServer(async(req,res)=>{try{const f=path.join(WORKSPACE,'baseline',new URL(req.url,'http://x').pathname==='/'?'index.html':decodeURI(new URL(req.url,'http://x').pathname));res.setHeader('content-type',f.endsWith('.mjs')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.json')?'application/json':'text/html');res.end(await readFile(f));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await webkit.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.__samples=[];window.__viewports={};let prev;const f=t=>{if(prev)window.__samples.push(t-prev);prev=t;requestAnimationFrame(f);};requestAnimationFrame(f);const v=WebGL2RenderingContext.prototype.viewport;WebGL2RenderingContext.prototype.viewport=function(x,y,w,h){window.__viewports[w+'x'+h]=(window.__viewports[w+'x'+h]||0)+1;return v.call(this,x,y,w,h);};});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForSelector('#mobile-kit[data-loaded="true"]');
 await page.locator('#mk-start').tap();await page.waitForTimeout(1500);await page.screenshot({path:path.join(RUN,'evidence/before-default.png')});
 await page.evaluate(()=>{window.__samples=[];});await page.waitForTimeout(10000);
 const measured=await page.evaluate(()=>({frames:window.__samples,viewports:window.__viewports,pixelRatio:window.__pelican.renderer.getPixelRatio(),canvas:{width:window.__pelican.renderer.domElement.width,height:window.__pelican.renderer.domElement.height},distance:window.__pelican.S.distance}));
 // A separate, explicitly synthetic comparison pose; never counted as natural QA.
 await page.locator('#mk-pause').tap();await page.evaluate(()=>{const p=window.__pelican;p.S.distance=0;p.S.lane=0;p.S.laneTarget=0;p.S.time=0;p.S.t=0;p.settings.hour=14;p.settings.timeFlow=false;p.view(-6.85,3.4,0,54,11.95,-.5,0);});await page.addStyleTag({content:'#mobile-kit{display:none!important}'});await page.waitForTimeout(300);await page.screenshot({path:path.join(RUN,'evidence/before-same-pose.png')});
 const frames=measured.frames.slice(10).sort((a,b)=>a-b);delete measured.frames;
 const report={schemaVersion:1,baseline:'PR10',runtime:'Desktop WebKit, 390×844 DPR3 touch emulation; NOT iPhone hardware',...measured,frameCount:frames.length,fps:1000/(frames.reduce((a,b)=>a+b,0)/frames.length),p95Ms:frames[Math.floor(frames.length*.95)],errors,comparison:{fixtureOnly:true,worldDistance:0,lane:0,hour:14,worldCamera:[-6.8,4.32,0],worldLook:[12,.42,0],cameraOffset:[-6.85,3.4,0],lookOffset:[11.95,-.5,0],fov:54}};
 await json(path.join(RUN,'evidence/before-performance.json'),report);await writeFile(path.join(RUN,'evidence/baseline-console.json'),JSON.stringify(errors));console.log(JSON.stringify(report));
}finally{await browser.close();server.close();}
