/* global process, console, window, document, performance, requestAnimationFrame */
/** Test-browser presentation comparison. Does not change any game code/state.
 * Run under xvfb-run. Diagnostic results are not production acceptance by themselves.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import path from 'node:path';
import {chromium} from '@playwright/test';
const run=path.resolve('runs/h5-qq-mobile-20261013'),game=path.join(run,'workspace/game');
const out=path.join(run,'artifacts/cold-start-render-probe');await mkdir(out,{recursive:true});
const build=JSON.parse(await readFile(path.join(run,'artifacts/build-racing.json'),'utf8'));
const report={buildHash:build.buildHash,productionGate:false,scope:'Same unmodified H5; browser presentation diagnostics only',variants:[]};
const server=createServer(async(req,res)=>{
  try{
    const clean=(req.url??'/').split('?')[0];const file=path.resolve(game,'.'+(clean==='/'?'/index.html':clean));
    if(!file.startsWith(game+path.sep)){res.writeHead(403);res.end();return;}
    const data=await readFile(file);res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html'});res.end(data);
  }catch{res.writeHead(404);res.end();}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
for(const variant of ['headless-vsync-off','headed-normal']){
  let browser,page;
  const result={variant,changedGameState:false,viewport:{width:1366,height:768},errors:[],snapshots:[],passed:false};
  try{
    browser=await chromium.launch({headless:variant!=='headed-normal',args:[
      '--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
      ...(variant==='headless-vsync-off'?['--disable-gpu-vsync','--disable-frame-rate-limit']:[])
    ]});
    const context=await browser.newContext({viewport:result.viewport,deviceScaleFactor:1,isMobile:false,hasTouch:false});
    page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));
    await page.addInitScript(()=>{
      window.__FRAME_PROBE__=[];let last=null;
      const frame=now=>{if(last!==null){window.__FRAME_PROBE__.push(now-last);if(window.__FRAME_PROBE__.length>200)window.__FRAME_PROBE__.shift();}last=now;requestAnimationFrame(frame);};
      requestAnimationFrame(frame);
    });
    await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForFunction(()=>document.querySelector('#race-kit')?.dataset.loaded==='true',null,{timeout:45000});
    const start=Date.now();await page.locator('#race-start').click();
    const deadline=Date.now()+45000;
    while(Date.now()<deadline){
      const snap=await page.evaluate(()=>{
        const g=window.game,frames=window.__FRAME_PROBE__;
        return {at:performance.now(),state:g?.state,cdT:g?.cdT,raceTime:g?.raceTime,player:!!g?.player,
          quality:g?.settings?.quality,buffer:[g?.canvas.width,g?.canvas.height],
          frameCount:frames.length,frameMean:frames.length?frames.reduce((a,b)=>a+b,0)/frames.length:null,
          focus:document.hasFocus(),visible:document.visibilityState};
      });result.snapshots.push(snap);
      if(snap.state==='race'&&snap.player){result.passed=true;result.startWallMs=Date.now()-start;break;}
      await page.waitForTimeout(1000);
    }
    if(result.passed){
      await page.keyboard.down('ArrowUp');await page.keyboard.down('ArrowLeft');
      await page.waitForFunction(()=>window.game?.player?.s>1&&window.game?.player?.steer>0,null,{timeout:18000});
      await page.keyboard.up('ArrowLeft');await page.keyboard.up('ArrowUp');result.keyboardPassed=true;
    }
    await page.screenshot({path:path.join(out,variant+'.png'),timeout:15000});
  }catch(error){result.errors.push(String(error.stack??error));result.passed=false;}
  finally{await browser?.close();report.variants.push(result);console.log('ENVIRONMENT_PROBE='+JSON.stringify(result));}
}
await writeFile(path.join(out,'environment-report.json'),JSON.stringify(report,null,2)+'\n');server.close();
