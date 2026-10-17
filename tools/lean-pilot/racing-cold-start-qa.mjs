/* global process, console, window, document, performance, HTMLCanvasElement */
// Independent cold-start QA. These are browser processes, NOT AI subagents.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import path from 'node:path';
import {chromium} from '@playwright/test';
const mode=process.argv[2];
assert.ok(['desktop','touch','desktop-no-msaa'].includes(mode),'Expected desktop or touch');
const run=path.resolve('runs/h5-qq-mobile-20261013');
const game=path.join(run,'workspace/game');
const out=path.join(run,'artifacts/cold-start-'+mode);
await mkdir(out,{recursive:true});
const build=JSON.parse(await readFile(path.join(run,'artifacts/build-racing.json'),'utf8'));
const css=await readFile(path.join(game,'style.css'),'utf8');
const report={mode,productionGate:mode!=='desktop-no-msaa',experiment:mode==='desktop-no-msaa'?'TEST ONLY: disable initial WebGL multisampling, leave game state unchanged':null,buildHash:build.buildHash,scope:'Chromium software WebGL; not physical handset or human QA',styles:[],snapshots:[],errors:[],passed:false};
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json'};
const server=createServer(async(req,res)=>{
  try{
    const clean=decodeURIComponent((req.url??'/').split('?')[0]);
    const file=path.resolve(game,'.'+(clean==='/'?'/index.html':clean));
    if(!file.startsWith(game+path.sep)){res.writeHead(403);res.end();return;}
    const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream'});res.end(data);
  }catch{res.writeHead(404);res.end();}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
let browser,context,page;
const snapshot=()=>page.evaluate(()=>{
  const g=window.game,k=document.querySelector('#race-kit');
  return {at:performance.now(),state:g?.state,pausedFrom:g?.pausedFrom,phase:k?.dataset.phase,
    hasPlayer:!!g?.player,cdT:g?.cdT,raceTime:g?.raceTime,gameTime:g?.time,
    quality:g?.settings?.quality,pixelRatio:g?.renderer?.getPixelRatio(),composer:!!g?.composer,
    antialias:g?.renderer?.getContext?.()?.getContextAttributes?.()?.antialias,
    drawingBuffer:[g?.renderer?.domElement?.width,g?.renderer?.domElement?.height],
    visibility:document.visibilityState,focus:document.hasFocus(),platform:k?.dataset.platform,
    note:document.querySelector('#race-note')?.textContent,disabled:document.querySelector('#race-start')?.disabled,
    countdown:document.querySelector('#countdown')?.textContent,life:window.__RACE_COLD_QA_LIFE__,
    speed:g?.player?.s,steer:g?.player?.steer};
});
try{
  browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  // Real CSS cascade checks are deliberately separate from the actual-game context.
  const stylePage=await browser.newPage();
  for(const [width,height] of [[667,320],[844,390],[1366,768]]){
    await stylePage.setViewportSize({width,height});
    for(const platform of ['touch','desktop'])for(const itemMode of [false,true]){
      await stylePage.setContent(`<html data-race-mobile="true" data-race-platform="${platform}"><head><style>${css}</style></head><body><section id="race-kit" data-item-mode="${itemMode}"><div id="race-controls"><div id="race-action-pad"><button data-race-action="drift">drift</button><button data-race-action="item">item</button></div></div></section></body></html>`);
      const visible=await stylePage.locator('[data-race-action="item"]').isVisible();
      report.styles.push({width,height,platform,itemMode,visible});
      assert.equal(visible,platform==='touch'&&itemMode,'Only an item race can expose an item control');
    }
  }
  await stylePage.close();
  context=await browser.newContext({viewport:mode==='touch'?{width:844,height:390}:{width:1366,height:768},deviceScaleFactor:1,isMobile:mode==='touch',hasTouch:mode==='touch'});
  page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  if(mode==='desktop-no-msaa')await page.addInitScript(()=>{
    const nativeGetContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,options,...args){
      // Diagnostic only: this is NOT an acceptance pass for the production build.
      const gpu=this.id==='gl'&&(type==='webgl'||type==='webgl2');
      return nativeGetContext.call(this,type,gpu?{...options,antialias:false}:options,...args);
    };
  });
  await page.addInitScript(()=>{
    window.__RACE_COLD_QA_LIFE__=[];
    const record=type=>{const rows=window.__RACE_COLD_QA_LIFE__;rows.push({type,at:performance.now(),visibility:document.visibilityState,focus:document.hasFocus()});if(rows.length>20)rows.shift();};
    for(const kind of ['focus','blur','pageshow','pagehide'])window.addEventListener(kind,()=>record(kind));
    document.addEventListener('visibilitychange',()=>record('visibilitychange'));
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>document.querySelector('#race-kit')?.dataset.loaded==='true',null,{timeout:45000});
  report.snapshots.push({when:'ready',...await snapshot()});
  await page.locator('#race-start').click();
  const deadline=Date.now()+45000;
  let started=false;
  while(Date.now()<deadline){
    const state=await snapshot();report.snapshots.push({when:'after-click',...state});
    if(state.state==='race'&&state.hasPlayer){started=true;break;}
    await page.waitForTimeout(1000);
  }
  await page.screenshot({path:path.join(out,'cold-start.png')});
  assert.ok(started,'Fresh '+mode+' did not enter race: '+JSON.stringify(report.snapshots.at(-1)));
  assert.equal(await page.locator('[data-race-action="item"]').isVisible(),false,'Stage 01 is speed mode');
  if(mode!=='touch'){
    assert.equal(await page.locator('#race-controls').isVisible(),false);
    await page.keyboard.down('ArrowUp');await page.keyboard.down('ArrowLeft');
    await page.waitForFunction(()=>window.game?.player?.s>1&&window.game?.player?.steer>0,null,{timeout:18000});
    await page.keyboard.up('ArrowLeft');await page.keyboard.up('ArrowUp');
  }
  assert.equal(report.errors.length,0,'Cold start produced browser errors');
  report.passed=true;
}catch(error){report.errors.push(String(error.stack??error));process.exitCode=1;}
finally{
  if(page&&!page.isClosed()){
    report.last=await snapshot().catch(error=>({error:String(error)}));
    await page.screenshot({path:path.join(out,'last-state.png'),timeout:10000}).catch(()=>{});
  }
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  await browser?.close();server.close();
  console.log(JSON.stringify(report,null,2));
}
