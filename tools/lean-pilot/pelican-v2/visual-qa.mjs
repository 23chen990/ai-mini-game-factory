/* global process, console, window, requestAnimationFrame */
import {webkit} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {RUN,WORKSPACE,json,sha} from './prepare.mjs';
import {serve} from './serve.mjs';
const build=JSON.parse(await readFile(path.join(RUN,'build-receipt.json'),'utf8'));
const dir=path.join(RUN,'attempts','attempt-'+build.attempt,'visual');await mkdir(dir,{recursive:true});
const server=await serve(),browser=await webkit.launch();const reports=[];
try{for(const viewport of [{width:390,height:844},{width:360,height:740},{width:320,height:568},{width:844,height:390}]){
 const context=await browser.newContext({viewport,deviceScaleFactor:3,isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];
 const shots=[];const shot=async name=>{const f=path.join(dir,viewport.width+'-'+name+'.png');await page.screenshot({path:f});shots.push({path:path.relative(RUN,f),sha256:sha(await readFile(f))});};
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{window.__visualFrames=[];let last;function f(t){if(last)window.__visualFrames.push(t-last);last=t;requestAnimationFrame(f);}requestAnimationFrame(f);});
 await page.goto('http://127.0.0.1:'+server.address().port+'/game/index.html');await page.waitForSelector('#coast[data-loaded="true"]');await shot('menu');const startBox=await page.locator('#co-start').boundingBox();const startVisible=!!startBox&&startBox.y>=0&&startBox.y+startBox.height<=viewport.height;const row=await page.locator('.co-route .selected').boundingBox(),route=await page.locator('.co-route').boundingBox();const selectedVisible=!!row&&!!route&&row.y>=route.y-1&&row.y+row.height<=route.y+route.height+1;
 // Same world position/time and camera pose as the baseline fixture. Ready state only, no gameplay assertion.
 await page.addStyleTag({content:'#coast{display:none!important}'});await shot('same-pose');await page.addStyleTag({content:'#coast{display:block!important}'});
 await page.locator('#co-start').tap();await page.waitForTimeout(2100);await shot('first-fish');const catchBox=await page.locator('#co-feedback').boundingBox();
 const hudGap=async box=>{const goals=await page.locator('.co-goals').boundingBox(),label=await page.locator('#co-radar-label').boundingBox();return !!box&&!!goals&&!!label&&box.y>=goals.y+goals.height-1&&box.y+box.height<=label.y;};const catchClear=!!catchBox&&(catchBox.x+catchBox.width<viewport.width*.5||catchBox.y>viewport.height*.65||await hudGap(catchBox));
 await page.evaluate(()=>{window.__visualFrames=[];});await page.waitForTimeout(3000);
 const render=await page.evaluate(()=>window.__coast.renderInfo()),frames=await page.evaluate(()=>window.__visualFrames),state=await page.evaluate(()=>window.__coast.snapshot());
 await shot('running');await page.locator('#co-pause').tap();await shot('paused');await page.locator('#co-resume').tap();await page.waitForTimeout(150);await shot('resumed');
 const controls=await page.locator('#co-controls button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
 // Continue the same natural journey. No lane input deliberately reaches the visible centre barrier.
 await page.waitForFunction(()=>window.__coast.snapshot().phase==='finished',null,{timeout:30000});await page.locator('#co-modal').waitFor({state:'visible'});await shot('terminal');const terminal=await page.evaluate(()=>window.__coast.snapshot());
 await page.locator('#co-replay').tap();await page.waitForTimeout(700);await shot('replay');const replay=await page.evaluate(()=>window.__coast.renderInfo());const replayBox=await page.locator('#co-feedback').boundingBox();const replayClear=!!replayBox&&(replayBox.x+replayBox.width<viewport.width*.5||replayBox.y>viewport.height*.65||await hudGap(replayBox));
 const sorted=frames.slice(5).sort((a,b)=>a-b);reports.push({viewport,errors,render,state,terminal,controls,screenshots:shots,catchClear,checks:{startActionVisible:startVisible,selectedRouteFullyVisible:selectedVisible,composerMatches:render.canvas.every((x,i)=>x===render.composer[i]),pixelRatio:render.pixelRatio>=1.25,realDrawCalls:render.calls>20,catchDoesNotCoverRoad:catchClear,replayHelperDoesNotCoverRoad:replayClear,touchTargets:controls.every(b=>b.width>=44&&b.height>=44&&b.y+b.height<=viewport.height),cameraAboveGround:render.camera.position[1]>3,replayKeepsCamera:JSON.stringify(render.camera.position)===JSON.stringify(replay.camera.position),naturalBarrierFailure:terminal.reason==='barrier'},performance:{fps:1000/(sorted.reduce((a,b)=>a+b,0)/sorted.length),frameCount:sorted.length,p95Ms:sorted[Math.floor(sorted.length*.95)]}});await context.close();
}}finally{await browser.close();server.close();}
const result={schemaVersion:1,targetGame:'鹈鹕海岸冒险',workspace:WORKSPACE,buildHash:build.buildHash,attempt:build.attempt,runtime:'Desktop WebKit mobile viewports, DPR3; not physical mobile',comparisonFixtureOnly:true,reports,passed:reports.every(r=>r.errors.length===0&&Object.values(r.checks).every(Boolean)),testedAt:new Date().toISOString()};
await json(path.join(dir,'report.json'),result);console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;
