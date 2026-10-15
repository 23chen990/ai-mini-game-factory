/* global process, console, URL, window, document, localStorage */
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Deliberately SYNTHETIC: uses privileged track geometry, pre-unlocks stages,
// and suppresses GPU draws after a real WebGL boot. NEVER human-play evidence.
const gameRoot=path.resolve('runs/h5-qq-mobile-20261013/workspace/game');
const sourceRoot=path.resolve('templates/web-lite/h5-source-mobile-v1/racing');
const output=path.resolve('runs/h5-qq-mobile-20261013/artifacts/racing-v3-smoke/integrated-campaign');
await mkdir(output,{recursive:true});
const build=JSON.parse(await readFile('runs/h5-qq-mobile-20261013/artifacts/build-racing.json','utf8'));
const server=createServer(async(req,res)=>{
  try{
    const request=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const code=request.startsWith('/qa-source/');
    const root=code?sourceRoot:gameRoot;
    const relative=code?request.slice('/qa-source/'.length):request==='/'?'index.html':request.slice(1);
    const file=path.resolve(root,relative);
    if(!file.startsWith(root+path.sep))throw Error('Unsafe path');
    res.setHeader('Content-Type',/\.m?js$/u.test(file)?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.json')?'application/json; charset=utf-8':'text/html; charset=utf-8');
    res.end(await readFile(file));
  }catch{res.writeHead(404);res.end('not found');}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const report={schemaVersion:1,buildHash:build.buildHash,sourceRevision:build.sourceRevision,
  kind:'SYNTHETIC_INTEGRATED_CAMPAIGN_ONLY',naturalPass:false,
  seededCampaign:true,privilegedTrackSteering:true,skipsGpuDrawAfterBoot:true,
  untouched:['PlayerCar.update','AICar.update','Game.step','collide','updateProgress','finish','rank','mission','item','save'],
  runs:[],errors:[],completedAll:false};
const deadline=Date.now()+Math.max(30000,Math.min(800000,Number(process.env.RACE_SWEEP_MAX_WALL_MS||600000)));
const maxStages=Math.max(1,Math.min(17,Number(process.env.RACE_SWEEP_STAGES||17)));
async function save(){await writeFile(path.join(output,'report.json'),JSON.stringify({...report,checkedAt:new Date().toISOString()},null,2)+'\n');}
let browser;
try{
  browser=await chromium.launch({headless:true,args:['--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox']});
  const ctx=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await ctx.addInitScript(()=>{
    // Unlocked options are a TEST FIXTURE, NEVER earned progress.
    const stars=Object.fromEntries(Array.from({length:16},(_,i)=>[String(i+1).padStart(2,'0'),1]));
    localStorage.setItem('h5-mobile:qq-speed:career:v1',JSON.stringify({version:1,stars,times:{},skin:0,rounds:16}));
    localStorage.setItem('h5-qq-mobile-20261013:graphics-quality:v1','low');
    localStorage.setItem('h5-qq-mobile-20261013:audio-enabled:v1','0');
  });
  const page=await ctx.newPage();
  page.on('pageerror',err=>report.errors.push('Browser: '+err.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('#race-start:not([disabled])').waitFor({timeout:60000});
  await page.addScriptTag({type:'module',content:"import {RaceDriver} from '/qa-source/driver.mjs';window.__SWEEP_DRIVER__=new RaceDriver();"});
  await page.waitForFunction(()=>!!window.__SWEEP_DRIVER__,null,{timeout:10000});
  await page.screenshot({path:path.join(output,'real-webgl-startup.png')});
  await page.evaluate(()=>{window.game.render=()=>{};});
  for(let i=0;i<maxStages;i++){
    if(Date.now()>deadline-25000){report.errors.push('Time budget exceeded');break;}
    const id=i===16?'daily':String(i+1).padStart(2,'0');
    try{
      await page.locator('#race-stage').selectOption(i===16?'daily':String(i));
      await page.waitForFunction(()=>window.game?.state==='menu'&&document.querySelector('#race-kit')?.dataset.phase==='ready'&&!document.querySelector('#race-start')?.disabled,null,{timeout:45000});
      const title=await page.locator('#race-stage option:checked').textContent();
      // Record what a genuine finger would hit. Synthetic campaign entry then
      // uses the normal DOM click handler, not a forged game.startRace or stars.
      const pointerTarget=await page.evaluate(()=>{
        const start=document.querySelector('#race-start'),r=start.getBoundingClientRect();
        const found=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
        const menu=document.querySelector('#menu');
        return {targetId:found?.id||'',targetClass:typeof found?.className==='string'?found.className:'',
          targetInsideStart:!!start.contains(found),startRect:r.toJSON(),
          htmlRaceMobile:document.documentElement.dataset.raceMobile||'',
          nativeMenuDisplay:menu?getComputedStyle(menu).display:'missing',
          nativeMenuPointer:menu?getComputedStyle(menu).pointerEvents:'missing',
          kitZ:getComputedStyle(document.querySelector('#race-kit')).zIndex,
          nativeMenuZ:menu?getComputedStyle(menu).zIndex:'missing'};
      });
      report.hitTests??=[];
      report.hitTests.push({id,...pointerTarget});
      await page.locator('#race-start').tap();
      await page.waitForFunction(()=>window.game?.state==='countdown',null,{timeout:12000});
      await page.evaluate(()=>{
        const g=window.game;g.render=()=>{};window.__SWEEP_DRIVER__.suspend();
        for(let n=0;n<62&&g.state==='countdown';n++){g.time+=.05;g.step(.05,g.input.frame());}
      });
      await page.waitForFunction(()=>window.game?.state==='race',null,{timeout:12000});
      const trace=[],entry=Date.now();let obs,stop='TIMEOUT';
      while(Date.now()<deadline-12000 && Date.now()-entry<105000){
        obs=await page.evaluate(()=>{
          const g=window.game,t=g.track,driver=window.__SWEEP_DRIVER__;
          for(let f=0;f<8&&g.state==='race';f++){
            const p=g.player,ahead=t.sample(p.d+Math.max(6,Math.abs(p.s)*.35+12),{});
            const desired=ahead.hd+Math.atan2(.85*p.lat,Math.max(10,Math.abs(p.s)*.55));
            const error=Math.atan2(Math.sin(desired-p.h),Math.cos(desired-p.h));
            const translated=driver.frame(.05,{left:error>.055,right:error<-.055},p,t,g.state,{canStep:true});
            g.time+=.05;g.step(.05,translated);
          }
          const p=g.player;
          return {time:+g.raceTime.toFixed(2),state:g.state,shown:!!g.resultShown,
            progress:Math.round(p?.progress||0),lap:p?.lapsDone||0,place:g.standings.indexOf(p)+1,
            speed:Math.round(p?.speedKmh||0),crashes:p?.stats?.crash||0,
            goal:document.querySelector('#race-live-goal')?.textContent||''};
        });
        if(!trace.length||obs.time-trace.at(-1).time>=8||obs.state!=='race')trace.push(obs);
        if(obs.state!=='race'||obs.time>375){stop=obs.state!=='race'?obs.state:'SIMULATION_TIME_LIMIT';break;}
        await page.waitForTimeout(9); // live mission tracker still executes on RAF
      }
      if(obs?.state==='finish'&&!obs.shown){
        await page.evaluate(()=>{
          const g=window.game;
          for(let n=0;n<260&&!g.resultShown;n++){g.time+=.05;g.step(.05,g.input.frame());}
        });
      }
      const shown=await page.evaluate(()=>!!window.game?.resultShown);
      if(shown)await page.waitForFunction(()=>document.querySelector('#race-kit')?.dataset.phase==='finished',null,{timeout:12000});
      const result=await page.evaluate(()=>{
        const g=window.game,p=g.player;
        return {resultShown:!!g.resultShown,finished:!!p?.finished,
          time:p?.finishTime||null,place:g.standings.indexOf(p)+1,
          rivals:g.racers.filter(r=>!r.isPlayer).map(r=>({name:r.name,place:g.standings.indexOf(r)+1,time:r.finishTime||null})),
          title:document.querySelector('#race-heading')?.textContent||'',
          summary:document.querySelector('#race-result-copy')?.textContent||'',
          metrics:document.querySelector('#race-result-stats')?.textContent||''};
      });
      const success=shown&&result.finished&&result.title.includes('挑战成功');
      report.runs.push({id,title,status:success?'SYNTHETIC_OBJECTIVE_PASS':'SYNTHETIC_OBJECTIVE_BLOCKED',stop,trace,result});
      console.log(JSON.stringify({id,status:report.runs.at(-1).status,stop,finish:result.finished,time:result.time,place:result.place,summary:result.summary}));
      await save();
      if(!shown){report.errors.push(id+': native terminal state not reached');break;}
      await page.locator('#race-lobby').tap();
      await page.waitForFunction(()=>document.querySelector('#race-kit')?.dataset.phase==='ready',null,{timeout:12000});
    }catch(e){report.errors.push(id+': '+String(e));await save();break;}
  }
  report.completedAll=report.runs.length===maxStages&&report.runs.every(r=>r.result.resultShown);
  await ctx.close();
}catch(e){report.errors.push('Fatal: '+String(e?.stack||e));}
finally{await save();await browser?.close();server.close();console.log(JSON.stringify({attempted:report.runs.length,completedAll:report.completedAll,errors:report.errors.slice(-3)}));}
