/* global process, console, window, document, URL */
// INTERNAL CONTROLS LAB: bundled real Three.js racer under Chromium touch.
// No lap wins are claimed: this tests the control path, not human preference.
import { chromium } from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import path from 'node:path';

const base=process.argv[2],evidence=process.argv[3];
if (!base || !evidence) throw Error('Usage: racing-controls-ab-qa.mjs <built-game-dir> <output-dir>');
const root=path.resolve(base),output=path.resolve(evidence);
await mkdir(output,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const server=createServer(async(req,res)=>{
  try {
    const uri=new URL(req.url,'http://127.0.0.1');
    const dest=path.resolve(root,'.'+(uri.pathname==='/'?'/index.html':uri.pathname));
    if(!dest.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    const data=await readFile(dest);
    res.writeHead(200,{'Content-Type':mime[path.extname(dest)]||'application/octet-stream'});
    res.end(data);
  }catch(e){res.writeHead(e?.code==='ENOENT'?404:500);res.end('missing');}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const url='http://127.0.0.1:'+server.address().port+'/';
const report={title:'QA_CONTROL_AB_REAL_WEBGL',scope:'scripted touch only; not human play, not production latency',modes:[],passed:false,errors:[]};
let browser;
const waitAxis=async(page,sign,label)=>{
  await page.waitForFunction(s=>{
    const g=window.game,e=window.__RACE_EVIDENCE__,pin=g?.__QA_CONTROL_LAB_LAST_PIN__;
    return e && pin && s*e.steerAxis>.5 && s*pin.steerAxis>.5 &&
      s*(g?.player?.steer??0)>.16;
  },sign,{timeout:20000}).catch(error=>{throw Error(label+': native steering did not follow thumb ('+error.message+')');});
};
const point=(id,x,y)=>({id,x,y});
try {
  browser=await chromium.launch({headless:true,args:[
    '--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle',
    '--use-angle=swiftshader','--disable-gpu-sandbox'
  ]});
  for (const mode of ['arrows','wheel','float']) {
    const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1,isMobile:true,hasTouch:true});
    const page=await context.newPage(),jsErrors=[];
    page.on('pageerror',e=>jsErrors.push(e.message));
    const entry=url+'?racing_qa_control='+mode;
    await page.goto(entry,{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForFunction(()=>{
      const kit=document.querySelector('#race-kit');
      return kit?.dataset.loaded==='true' && !kit.querySelector('#race-start')?.disabled && window.game?.track;
    },null,{timeout:50000});
    const pre=await page.evaluate(()=>({
      q:window.__RACE_EVIDENCE__?.qaControlMode,
      tag:document.querySelector('#race-qa-control-tag')?.textContent,
      selected:document.querySelector('#race-kit')?.dataset.qaControl,
      course:window.game?.track?.__RACE_COURSE_ID,
      quality:window.game?.settings?.quality
    }));
    if(pre.q!==mode||pre.selected!==mode||!pre.tag?.includes('内部操控对照')||
       pre.course!=='race-01'||pre.quality!=='low')
      throw Error(mode+' startup mismatch '+JSON.stringify(pre));
    await page.click('#race-start');
    await page.waitForFunction(()=>window.game?.state==='race' && document.querySelector('#race-kit')?.dataset.phase==='race',
      null,{timeout:75000});
    await page.evaluate(()=>{
      const g=window.game,orig=g.input.frame.bind(g.input);
      g.input.frame=()=>{
        const pin=orig();
        g.__QA_CONTROL_LAB_LAST_PIN__={steerAxis:pin.steerAxis,left:pin.left,right:pin.right,shift:pin.shift};
        return pin;
      };
    });
    const wheel=await page.locator('#race-joystick').boundingBox();
    const drift=await page.locator('[data-race-action="drift"]').boundingBox();
    if(!wheel||!drift)throw Error(mode+' controls not rendered');
    const cx=wheel.x+wheel.width/2,cy=wheel.y+wheel.height/2,w=wheel.width;
    const center=point(101,cx,cy);
    const left=mode==='wheel'?point(101,cx-w*.22,cy-w*.22):point(101,cx-w*.27,cy);
    const right=mode==='wheel'?point(101,cx+w*.22,cy-w*.22):point(101,cx+w*.27,cy);
    const start=mode==='wheel'?point(101,cx,cy-w*.28):mode==='float'?center:left;
    const drifting=point(102,drift.x+drift.width*.5,drift.y+drift.height*.5);
    const cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
    if(mode!=='arrows') {
      await page.waitForFunction(()=>window.__RACE_EVIDENCE__?.steerAxis===0,null,{timeout:7000});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[left]});
    }
    await waitAxis(page,1,mode+' left');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[left,drifting]});
    await page.waitForFunction(()=>document.querySelector('[data-race-action="drift"]')?.classList.contains('held'),null,{timeout:8000});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[right,drifting]});
    await waitAxis(page,-1,mode+' countersteer');
    const simultaneous=await page.evaluate(()=>({
      input:window.game?.__QA_CONTROL_LAB_LAST_PIN__,
      live:window.__RACE_EVIDENCE__?.steerAxis,
      actual:window.game?.player?.steer,
      course:window.__RACE_EVIDENCE__?.actualCourse,
      phoneInput:window.__RACE_EVIDENCE__?.phoneInput
    }));
    if(simultaneous.input?.shift!==true||simultaneous.input?.right!==true||
       simultaneous.input?.left!==false||simultaneous.phoneInput?.directionReversals<1)
      throw Error(mode+' double thumb/steer reversal failure '+JSON.stringify(simultaneous));
    await page.screenshot({path:path.join(output,mode+'-drift-countersteer.png')});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[right]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>{
      const pin=window.game?.__QA_CONTROL_LAB_LAST_PIN__;
      return window.__RACE_EVIDENCE__?.steerAxis===0 && pin?.steerAxis===0 && pin?.shift===false;
    },null,{timeout:20000});
    const cancelled=await page.evaluate(()=>window.__RACE_EVIDENCE__?.phoneInput);
    if(jsErrors.length)throw Error(mode+' browser script errors '+jsErrors.slice(0,3).join('; '));
    report.modes.push({mode,quality:pre.quality,course:pre.course,
      leftRightChangedNative:true,driftSimultaneous:true,releaseCleared:true,
      scripted:true,inputEventCount:cancelled?.touchEvents ?? 0,
      sampleMsP95:cancelled?.inputSampleMsP95??null,
      screenshot:mode+'-drift-countersteer.png'});
    await context.close();
  }
  report.passed=true;
}catch(e){report.errors.push(String(e?.stack||e));process.exitCode=1;}
finally{
  await writeFile(path.join(output,'qa-comparison.json'),JSON.stringify(report,null,2)+'\n');
  await browser?.close();server.close();
  console.log(JSON.stringify({passed:report.passed,variants:report.modes.map(x=>x.mode),errors:report.errors.slice(0,2)},null,2));
}
