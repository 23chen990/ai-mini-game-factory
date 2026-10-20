/* global process, console, window, document, localStorage, performance, innerWidth, innerHeight, requestAnimationFrame */
// Final-build supplemental checks. SDK/storage faults are labelled fixtures;
// controls and screenshots use normal trusted pointer/keyboard events only.
import assert from 'node:assert/strict';
import { chromium, webkit } from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {URL} from 'node:url';
import {planWheelGesture,actionTouchPoints} from '../../../tools/lean-pilot/racing-wheel-qa-input.mjs';
const run=path.resolve('runs/h5-qq-mobile-20261013');
const root=process.env.RACE_FINAL_PACKAGE_ROOT??path.join(run,'workspace/game');
const out=process.env.RACE_FINAL_QA_OUTPUT??path.join(run,'artifacts/final-20261020/browser');await mkdir(out,{recursive:true});
const build=JSON.parse(await readFile(path.join(run,'artifacts/build-racing.json')));
const mode=process.argv[2]??'gallery';
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname;const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));assert.ok(file.startsWith(root+path.sep));res.setHeader('Content-Type',name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':'text/html');res.end(await readFile(file));}catch{res.writeHead(404).end();}});server.listen(0,'127.0.0.1');await once(server,'listening');
const url='http://127.0.0.1:'+server.address().port;
const report={schemaVersion:1,mode,sourceCommit:process.env.RACE_FINAL_SOURCE_SHA,buildHash:build.buildHash,inputHash:build.inputHash,servedRoot:root,htmlSha256:createHash('sha256').update(await readFile(path.join(root,'index.html'))).digest('hex'),physicalPhone:false,host:process.platform,rows:[],errors:[],passed:false};
let browser;
const state=page=>page.evaluate(()=>{const g=window.game,e=window.__RACE_EVIDENCE__,gl=g.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {state:g.state,phase:e.phase,raceTime:g.raceTime,steerAxis:e.steerAxis,speed:g.player?.speedKmh,steer:g.player?.steer,heading:g.player?.h,drifting:g.player?.drifting,quality:g.settings.quality,pixelRatio:g.renderer.getPixelRatio(),buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),fpsEstimate:e.fpsEstimate,geometries:g.renderer.info.memory.geometries,textures:g.renderer.info.memory.textures,heapBytes:performance.memory?.usedJSHeapSize,displayedCar:e.displayedCar,owned:e.ownedCars,note:document.querySelector('#race-car-note').textContent,viewport:[innerWidth,innerHeight]};});
const shot=async(page,name)=>{const file=mode+'-'+name+'.png';await page.screenshot({path:path.join(out,file)});return file;};
async function ready(page){await page.goto(url);await page.locator('#race-start:not([disabled])').waitFor({timeout:45000});}
async function context(options={}){const c=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1,...options});const p=await c.newPage();p.on('pageerror',e=>report.errors.push(e.message));return {c,p};}
function sdkFixture(){
  window.__PLATFORM_META__={status:1,source:'check_ads_status',appId:'fixture-not-a-live-app',spaceId:'fixture-not-a-live-unit',screenOrientation:0};
  const closes=new Set(),errors=new Set();
  const log=window.__FINAL_AD_FIXTURE__={mode:'hang-load',creates:0,shows:0,close:value=>{for(const cb of [...closes])cb({isEnded:value});}};
  const ad={onClose:f=>closes.add(f),offClose:f=>closes.delete(f),onError:f=>errors.add(f),offError:f=>errors.delete(f),load:()=>{if(log.mode==='stale-load-close')log.close(true);return log.mode==='hang-load'?new Promise(()=>{}):Promise.resolve();},show:async()=>{log.shows++;if(log.mode==='show-reject-after-close'){log.close(true);throw Error('fixture failed presentation');}if(log.mode==='failed')throw Error('fixture no fill');}};
  window.tap={createRewardedVideoAd:()=>{log.creates++;return ad;}};
}
try{
  browser=mode==='webkit'?await webkit.launch({headless:true}):await chromium.launch({channel:'chromium',headless:mode!=='touch',args:['--use-angle=metal']});report.browser=browser.version();
  if(mode==='gallery'){
    for(const [width,height] of [[1366,768],[844,390],[667,375],[390,844]]){
      const {c,p}=await context({viewport:{width,height},isMobile:width<1000,hasTouch:width<1000});const started=Date.now();await ready(p);const readyMs=Date.now()-started;
      for(const id of height>width?['starter']:['starter','custom-01','custom-02','custom-03','custom-04','custom-05']){
        if(height<=width)await p.locator(`button[data-car-id="${id}"]`).click();await p.waitForFunction(id=>window.__RACE_EVIDENCE__.displayedCar===id&&!window.__RACE_EVIDENCE__.garage.busy,id);await p.waitForTimeout(500);
        report.rows.push({case:'normal-ui-preview',id,readyMs,screenshot:await shot(p,`${width}x${height}-${id}`),...await state(p)});
      }
      await c.close();
    }
  }else if(mode==='ads'){
    const {c,p}=await context();await p.addInitScript(sdkFixture);await ready(p);await p.locator('[data-car-id="custom-01"]').tap();await p.waitForFunction(()=>window.__RACE_EVIDENCE__.displayedCar==='custom-01'&&!window.__RACE_EVIDENCE__.garage.busy);
    await p.locator('#race-car-ad').tap();await p.waitForFunction(()=>document.querySelector('#race-car-note').textContent.includes('广告暂未完成'),null,{timeout:12000});
    report.rows.push({case:'fixture-load-timeout',...await state(p),screenshot:await shot(p,'timeout')});
    await p.locator('#race-car-ad').tap();await p.waitForTimeout(100);await p.evaluate(()=>window.__FINAL_AD_FIXTURE__.close(true));await p.waitForTimeout(100);
    const late=await state(p);assert.deepEqual(late.owned,['starter']);assert.equal(await p.evaluate(()=>window.__FINAL_AD_FIXTURE__.creates),1);report.rows.push({case:'fixture-late-singleton-close-after-second-click',...late,screenshot:await shot(p,'late-close-no-reward')});await c.close();
    const complete=await context();await complete.p.addInitScript(sdkFixture);await ready(complete.p);await complete.p.evaluate(()=>{window.__FINAL_AD_FIXTURE__.mode='show';});
    await complete.p.locator('[data-car-id="custom-01"]').tap();await complete.p.waitForFunction(()=>window.__RACE_EVIDENCE__.displayedCar==='custom-01'&&!window.__RACE_EVIDENCE__.garage.busy);await complete.p.locator('#race-car-ad').tap();await complete.p.waitForFunction(()=>window.__FINAL_AD_FIXTURE__.shows===1);await complete.p.evaluate(()=>window.__FINAL_AD_FIXTURE__.close(false));await complete.p.waitForFunction(()=>!window.__RACE_EVIDENCE__.garage.busy);assert.deepEqual((await state(complete.p)).owned,['starter']);report.rows.push({case:'fixture-cancel',...await state(complete.p)});
    await complete.p.locator('#race-car-ad').tap();await complete.p.waitForFunction(()=>window.__FINAL_AD_FIXTURE__.shows===2);await complete.p.evaluate(()=>window.__FINAL_AD_FIXTURE__.close(true));await complete.p.waitForFunction(()=>window.__RACE_EVIDENCE__.equippedCar==='custom-01');report.rows.push({case:'fixture-complete-landscape-ownership',...await state(complete.p),screenshot:await shot(complete.p,'complete')});
    const saved=await complete.p.evaluate(()=>localStorage.getItem('h5-mobile:qq-speed:career:v1'));await complete.p.reload();await complete.p.locator('#race-start:not([disabled])').waitFor();assert.equal(await complete.p.evaluate(()=>localStorage.getItem('h5-mobile:qq-speed:career:v1')),saved);report.rows.push({case:'same-origin-reload-restores-reward',...await state(complete.p)});await complete.c.close();
    for(const fixtureMode of ['stale-load-close','show-reject-after-close']){
      const {c,p}=await context();await p.addInitScript(sdkFixture);await ready(p);await p.evaluate(mode=>{window.__FINAL_AD_FIXTURE__.mode=mode;},fixtureMode);
      await p.locator('button[data-car-id="custom-01"]').tap();await p.waitForFunction(()=>window.__RACE_EVIDENCE__.displayedCar==='custom-01'&&!window.__RACE_EVIDENCE__.garage.busy);await p.locator('#race-car-ad').tap();await p.waitForFunction(()=>window.__FINAL_AD_FIXTURE__.shows===1);
      if(fixtureMode==='stale-load-close')await p.evaluate(()=>window.__FINAL_AD_FIXTURE__.close(false));
      await p.waitForFunction(()=>document.querySelector('#race-car-note').textContent.length>0);assert.deepEqual((await state(p)).owned,['starter']);report.rows.push({case:fixtureMode,...await state(p),screenshot:await shot(p,fixtureMode)});await c.close();
    }
  }else{
    const {c,p}=await context(mode==='desktop'?{viewport:{width:1366,height:768},isMobile:false,hasTouch:false}:{});await ready(p);await p.locator('#race-start').click();await p.waitForFunction(()=>window.game.state==='race',null,{timeout:45000});
    if(mode==='touch'){
      await p.waitForTimeout(3000);const cdp=await c.newCDPSession(p),wheel=await p.locator('#race-joystick').boundingBox();const bounds=await p.locator('[data-race-action]').evaluateAll(bs=>Object.fromEntries(bs.map(b=>[b.dataset.raceAction,b.getBoundingClientRect().toJSON()])));let angle=null;
      async function turn(direction,actions=[]){const plan=planWheelGesture(direction,wheel,actionTouchPoints(actions,bounds),angle);for(const event of plan.events)await cdp.send('Input.dispatchTouchEvent',event);angle=plan.angle;}
      await turn('left',['drift']);await p.waitForTimeout(180);const left=await state(p);assert.ok(left.steerAxis>.5);assert.equal(left.drifting,true);report.rows.push({case:'natural-touch-left-drift',...left,screenshot:await shot(p,'left-drift')});
      await turn('right',['drift']);await p.waitForTimeout(180);const right=await state(p);assert.ok(right.steerAxis<-.5);assert.ok(right.steer<0);report.rows.push({case:'natural-touch-emergency-countersteer',...right,screenshot:await shot(p,'countersteer')});
      await turn(null);await p.waitForTimeout(600);assert.equal((await state(p)).steerAxis,0);report.rows.push({case:'natural-touch-release',...await state(p),screenshot:await shot(p,'release')});
      await turn('left',['drift']);await p.locator('#race-pause').tap();await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});angle=null;assert.equal((await state(p)).steerAxis,0);assert.equal((await state(p)).phase,'paused');report.rows.push({case:'pause-clears-multitouch',...await state(p),screenshot:await shot(p,'pause')});
      assert.ok((await p.locator('#race-save-scope').textContent()).includes('跨设备'));await p.locator('#race-resume').tap();
      await p.evaluate(()=>{window.__FINAL_VISIBILITY__=[];for(const type of ['visibilitychange','blur','focus'])window.addEventListener(type,()=>window.__FINAL_VISIBILITY__.push({type,hidden:document.hidden,focused:document.hasFocus()}),true);});
      const tab=await c.newPage();await tab.goto('about:blank');await tab.bringToFront();await p.waitForTimeout(300);
      const backgroundVisibility=await p.evaluate(()=>({hidden:document.hidden,focused:document.hasFocus(),events:window.__FINAL_VISIBILITY__}));
      await p.bringToFront();await tab.close();
      if(backgroundVisibility.events.some(e=>e.type==='blur'||e.hidden)){assert.equal((await state(p)).phase,'paused');report.rows.push({case:'real-tab-background-remains-paused',backgroundVisibility,...await state(p)});await p.locator('#race-resume').tap();}
      else report.rows.push({case:'real-tab-background',status:'NOT_OBSERVED',backgroundVisibility,limitation:'Automation browser did not emit hidden or blur; this does not validate actual background lifecycle.'});
      await p.setViewportSize({width:390,height:844});await p.waitForTimeout(300);assert.equal(await p.locator('#race-rotate').isVisible(),true);assert.equal((await state(p)).phase,'paused');await shot(p,'portrait-paused');await p.setViewportSize({width:844,height:390});await p.locator('#race-resume').tap();assert.equal((await state(p)).steerAxis,0);report.rows.push({case:'viewport-rotation-resume',...await state(p)});
    }else if(mode==='loss'){
      // Deliberately withhold steering, using no state/debug injection. The
      // real rivals and native race timeout must cause the visible loss.
      await p.waitForFunction(()=>window.__RACE_EVIDENCE__.phase==='finished',null,{timeout:300000});
      const settlement=await p.locator('#race-result-stars').textContent();
      report.rows.push({case:'natural-no-steering-settlement',settlement,heading:await p.locator('#race-heading').textContent(),...await state(p),screenshot:await shot(p,'settlement')});
      // A racer can cross the line and still lose by placement. Judge the
      // visible current-run result, not the separate physical finished flag.
      assert.match(settlement,/本场 0 星/);
      await p.locator('#race-replay').tap();await p.waitForFunction(()=>window.game.state==='race',null,{timeout:45000});
      report.rows.push({case:'natural-loss-replay',...await state(p),screenshot:await shot(p,'replay')});
    }else if(mode==='desktop'){
      await p.keyboard.down('ArrowUp');await p.keyboard.down('ArrowLeft');await p.waitForTimeout(400);assert.ok((await state(p)).steer>0);await p.keyboard.up('ArrowLeft');await p.keyboard.up('ArrowUp');report.rows.push({case:'keyboard-driving',...await state(p),screenshot:await shot(p,'driving')});
    }else report.rows.push({case:'webkit-race-entry-not-iPhone-hardware',...await state(p),screenshot:await shot(p,'race')});
    const samples=await p.evaluate(()=>new Promise(resolve=>{const deltas=[];let last=performance.now(),start=last;function frame(now){deltas.push(now-last);last=now;if(now-start>=5000)resolve(deltas);else requestAnimationFrame(frame);}requestAnimationFrame(frame);}));const sorted=samples.slice(1).sort((a,b)=>a-b);report.rows.push({case:'wall-clock-raf-sample',seconds:5,frames:samples.length,p50Ms:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],...await state(p)});await c.close();
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.errors.push(String(e.stack));process.exitCode=1;}
finally{await writeFile(path.join(out,mode+'.json'),JSON.stringify(report,null,2)+'\n');await browser?.close();server.close();console.log(JSON.stringify({mode,passed:report.passed,rows:report.rows.length,errors:report.errors}));}
