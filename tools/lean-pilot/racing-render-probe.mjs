/* global process, console, window, document, performance, requestAnimationFrame */
/** Diagnostic-only layer ablation. Never counts as a production playability pass. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import path from 'node:path';
import {chromium} from '@playwright/test';
const run=path.resolve('runs/h5-qq-mobile-20261013');
const game=path.join(run,'workspace/game'),out=path.join(run,'artifacts/cold-start-render-probe');
await mkdir(out,{recursive:true});
const report={productionGate:false,scope:'Isolated diagnostic layer ablations; not human or production QA',phases:[],errors:[]};
const server=createServer(async(req,res)=>{
  try{
    const file=path.resolve(game,'.'+((req.url??'/').split('?')[0]==='/'?'/index.html':(req.url??'/').split('?')[0]));
    if(!file.startsWith(game+path.sep)){res.writeHead(403);res.end();return;}
    const data=await readFile(file);res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html'});res.end(data);
  }catch{res.writeHead(404);res.end();}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
let browser;
try{
  browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:1,isMobile:false,hasTouch:false});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#race-kit')?.dataset.loaded==='true',null,{timeout:45000});
  await page.evaluate(()=>{
    window.__RENDER_PROBE__={times:{},raf:[],last:performance.now()};
    const wrap=(object,key,label)=>{const original=object[key];object[key]=function(...args){
      const start=performance.now(),value=original.apply(this,args),dt=performance.now()-start;
      const list=window.__RENDER_PROBE__.times[label]??=[];list.push(dt);if(list.length>300)list.shift();return value;
    };};
    for(const key of ['render','step','updateCamera'])wrap(window.game,key,key);
    wrap(window.game.renderer,'render','threeRender');
    const frame=now=>{const p=window.__RENDER_PROBE__;p.raf.push(now-p.last);p.last=now;if(p.raf.length>300)p.raf.shift();requestAnimationFrame(frame);};
    requestAnimationFrame(frame);
  });
  await page.locator('#race-start').click();
  const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');
  for(const phase of ['baseline','no-css-effects','no-world','restored']){
    if(phase==='no-css-effects')await page.addStyleTag({content:'*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;filter:none!important;box-shadow:none!important;text-shadow:none!important;}'});
    if(phase==='no-world')await page.evaluate(()=>{window.game.level.visible=false;});
    if(phase==='restored')await page.evaluate(()=>{window.game.level.visible=true;document.head.lastElementChild?.tagName==='STYLE'&&document.head.lastElementChild.remove();});
    await page.evaluate(()=>{window.__RENDER_PROBE__.times={};window.__RENDER_PROBE__.raf=[];window.__RENDER_PROBE__.last=performance.now();});
    await cdp.send('Profiler.start');await page.waitForTimeout(5000);
    const profile=await cdp.send('Profiler.stop');
    await writeFile(path.join(out,phase+'.cpuprofile'),JSON.stringify(profile.profile));
    const snap=await page.evaluate(()=>{
      const g=window.game,probe=window.__RENDER_PROBE__,reduce=list=>({n:list.length,total:list.reduce((a,b)=>a+b,0),max:Math.max(0,...list),mean:list.length?list.reduce((a,b)=>a+b,0)/list.length:0});
      const meshes=[];g.scene.traverse(x=>{if(x.isMesh)meshes.push({name:x.name,type:x.type,verts:x.geometry?.attributes?.position?.count??0,material:x.material?.type,visible:x.visible});});
      return {at:performance.now(),state:g.state,cdT:g.cdT,raceTime:g.raceTime,quality:g.settings.quality,composer:!!g.composer,buffer:[g.canvas.width,g.canvas.height],calls:g.renderer.info.render.calls,triangles:g.renderer.info.render.triangles,geometries:g.renderer.info.memory.geometries,raf:reduce(probe.raf),times:Object.fromEntries(Object.entries(probe.times).map(([k,v])=>[k,reduce(v)])),meshCount:meshes.length,largest:meshes.sort((a,b)=>b.verts-a.verts).slice(0,12)};
    });
    report.phases.push({phase,...snap});console.log('RENDER_PROBE='+JSON.stringify({phase,...snap}));
  }
}catch(e){report.errors.push(String(e.stack??e));process.exitCode=1;}
finally{await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await browser?.close();server.close();}
