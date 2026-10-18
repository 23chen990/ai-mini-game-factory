/* global process, console, window, document, performance, requestAnimationFrame */
/** Diagnostic page only. GPU queue drain and DOM isolation distinguish earlier
 * heavy work from a persistent canvas/compositor issue. Never a production pass. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import path from 'node:path';
import {chromium} from '@playwright/test';
const root=path.resolve('runs/h5-qq-mobile-20261013/workspace/game');
const out=path.resolve('runs/h5-qq-mobile-20261013/artifacts/cold-start-context');await mkdir(out,{recursive:true});
const report={node:process.version,productionGate:false,phases:[],errors:[]};
const server=createServer(async(req,res)=>{try{
 const pathname=(req.url??'/').split('?')[0],file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 const value=await readFile(file);res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html'});res.end(value);
}catch{res.writeHead(404);res.end();}});
server.listen(0,'127.0.0.1');await once(server,'listening');let browser;
try{
 browser=await chromium.launch({channel:'chromium',headless:true,args:['--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:1,isMobile:false,hasTouch:false});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#race-kit')?.dataset.loaded==='true',null,{timeout:45000});
 await page.locator('#race-start').click();
 await page.evaluate(()=>{
  const g=window.game,T=window.__RACE_THREE__;
  window.__CTX_PROBE__={original:g.render,hidden:[],empty:new T.Scene(),frames:[],last:performance.now()};
  const step=now=>{const p=window.__CTX_PROBE__;p.frames.push(now-p.last);p.last=now;requestAnimationFrame(step);};requestAnimationFrame(step);
 });
 for(const phase of ['original','no-hud','empty-after-finish','new-renderer-empty','restored']){
  const setup=await page.evaluate(phase=>{
   const g=window.game,p=window.__CTX_PROBE__,T=window.__RACE_THREE__;
   let drainMs=0;
   if(phase==='no-hud'){
    for(const element of document.body.children)if(element!==g.canvas&&!element.contains(g.canvas)){
     p.hidden.push([element,element.style.getPropertyValue('display'),element.style.getPropertyPriority('display')]);element.style.setProperty('display','none','important');
    }
   }
   if(phase==='empty-after-finish'){
    g.render=function(){this.renderer.render(p.empty,this.camera);};
    const start=performance.now();g.renderer.getContext().finish();drainMs=performance.now()-start;
   }
   if(phase==='new-renderer-empty'){
    const r=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});r.setSize(1366,768);
    r.domElement.style.cssText='position:fixed;inset:0;width:1366px;height:768px';document.body.append(r.domElement);p.extra=r;
    g.canvas.style.visibility='hidden';g.render=function(){r.render(p.empty,this.camera);};
   }
   if(phase==='restored'){
    g.render=p.original;g.canvas.style.visibility='';p.extra?.domElement.remove();p.extra?.dispose();
    for(const [element,value,priority] of p.hidden)element.style.setProperty('display',value,priority);
   }
   p.frames=[];p.last=performance.now();
   return {drainMs,attributes:g.renderer.getContext().getContextAttributes(),target:g.renderer.getRenderTarget()?{width:g.renderer.getRenderTarget().width,height:g.renderer.getRenderTarget().height}:null,programs:g.renderer.info.programs?.length,textures:g.renderer.info.memory.textures};
  },phase);
  await page.waitForTimeout(6000);
  const measured=await page.evaluate(()=>{const p=window.__CTX_PROBE__,g=window.game;return {frames:p.frames.length,mean:p.frames.reduce((a,b)=>a+b,0)/Math.max(1,p.frames.length),state:g.state,quality:g.settings.quality,composer:!!g.composer,calls:g.renderer.info.render.calls,triangles:g.renderer.info.render.triangles};});
  report.phases.push({phase,...setup,...measured});console.log('CONTEXT_PROBE='+JSON.stringify(report.phases.at(-1)));
 }
}catch(error){report.errors.push(String(error.stack??error));process.exitCode=1;}
finally{await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();server.close();}
