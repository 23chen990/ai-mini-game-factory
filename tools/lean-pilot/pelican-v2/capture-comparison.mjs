/* global console, window, requestAnimationFrame, WebGL2RenderingContext */
// Static, same-pose renderer benchmark. Never accepted as gameplay or natural-input QA.
import {webkit} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {RUN,json,sha} from './prepare.mjs';
import {serve} from './serve.mjs';
const build=JSON.parse(await readFile(path.join(RUN,'build-receipt.json'),'utf8'));
const server=await serve(),browser=await webkit.launch(),reports=[];
try{for(const baseline of [true,false]){
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true}),page=await context.newPage();
 await page.addInitScript(()=>{window.__poseFrames=[];window.__poseViewports={};let last;function f(t){if(last)window.__poseFrames.push(t-last);last=t;requestAnimationFrame(f);}requestAnimationFrame(f);const viewport=WebGL2RenderingContext.prototype.viewport;WebGL2RenderingContext.prototype.viewport=function(...a){const result=viewport.apply(this,a);const actual=[...this.getParameter(this.VIEWPORT)].slice(2);window.__poseViewports[actual.join('x')]=(window.__poseViewports[actual.join('x')]||0)+1;return result;};});
 await page.goto('http://127.0.0.1:'+server.address().port+(baseline?'/baseline/index.html':'/game/index.html'));
 if(baseline){await page.waitForSelector('#mobile-kit[data-loaded="true"]');await page.locator('#mk-start').tap();await page.waitForTimeout(300);await page.locator('#mk-pause').tap();await page.evaluate(()=>{const p=window.__pelican;Object.assign(p.S,{distance:0,lane:0,laneTarget:0,y:0,vy:0,time:0,t:0});p.settings.hour=14;p.settings.timeFlow=false;p.view(-6.85,3.4,0,54,11.95,-.5,0);});}else await page.waitForSelector('#coast[data-loaded="true"]');
 await page.addStyleTag({content:'#mobile-kit,#coast{display:none!important}'});await page.waitForTimeout(300);await page.evaluate(()=>{window.__poseFrames=[];window.__poseViewports={};});await page.waitForTimeout(10000);
 const measured=await page.evaluate(b=>({frames:window.__poseFrames,actualGpuViewports:window.__poseViewports,render:b?{pixelRatio:window.__pelican.renderer.getPixelRatio(),canvas:[window.__pelican.renderer.domElement.width,window.__pelican.renderer.domElement.height]}:window.__coast.renderInfo()}),baseline);
 const frames=measured.frames.slice(5).sort((a,b)=>a-b);delete measured.frames;const p='evidence/pose-'+(baseline?'before':'after')+'.png';await page.screenshot({path:path.join(RUN,p)});
 reports.push({baseline,...measured,frameCount:frames.length,fps:1000/(frames.reduce((a,b)=>a+b,0)/frames.length),p95Ms:frames[Math.floor(frames.length*.95)],screenshot:{path:p,sha256:sha(await readFile(path.join(RUN,p)))}});await context.close();
}}finally{await browser.close();server.close();}
const result={schemaVersion:1,targetGame:'鹈鹕海岸冒险',buildHash:build.buildHash,fixtureOnly:true,acceptedAsGameplay:false,runtime:'Desktop WebKit,390x844,DPR3; NOT physical iPhone',worldDistance:0,hour:14,camera:[-6.8,4.32,0],look:[12,.42,0],fov:54,reports,testedAt:new Date().toISOString()};
await json(path.join(RUN,'evidence/same-pose-performance.json'),result);console.log(JSON.stringify(result));
