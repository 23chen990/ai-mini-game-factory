/* global process, console, URL, window, document, localStorage, innerWidth, innerHeight */
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { once } from 'node:events';
import { TRACK_RESHAPES } from '../../templates/web-lite/h5-source-mobile-v1/racing/track-design.mjs';

/**
 * Automated real Chromium/WebGL *entry smoke*, not manual/physical gameplay QA.
 * Test stages are unlocked by synthetic localStorage seeds ONLY for entry coverage.
 * Do not report a seeded stage as naturally completed.
 */
const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw Error('Usage: node racing-v3-smoke.mjs <built-game-dir> <evidence-dir>');
const root = path.resolve(input);
const dest = path.resolve(output);
await mkdir(dest, { recursive: true });
const mime = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.webp':'image/webp',
  '.svg':'image/svg+xml','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wasm':'application/wasm' };
const server = createServer(async (req,res) => {
  try {
    const clean = decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    const file = path.resolve(root, '.' + (clean === '/' ? '/index.html' : clean));
    if (!file.startsWith(root + path.sep)) {res.writeHead(403);res.end('forbidden');return;}
    const bytes = await readFile(file);
    res.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});
    res.end(bytes);
  } catch(e) {res.writeHead(e?.code === 'ENOENT' ? 404 : 500);res.end('file missing');}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const url = 'http://127.0.0.1:' + server.address().port + '/';
const report = { stage:'BUILT_H5_CHROMIUM_ENTRY_SMOKE', assertion:'source-level/real browser, not human natural victory', testStart:new Date().toISOString(),
  views:[], errors:[], seededCampaign:false, passed:false };
let browser;
const jsErrors=[];
const fail = reason => {report.errors.push(String(reason));throw Error(reason);};
async function waitLoaded(page) {
  try {
    await page.waitForFunction(() => {
      const kit=document.querySelector('#race-kit');
      const selected=kit?.querySelector('#race-stage')?.value;
      return kit?.dataset.loaded === 'true' &&
        !kit.querySelector('#race-start')?.disabled &&
        !!window.game?.map &&
        window.game.map.id === window.game.settings.map &&
        !!selected;
    },null,{timeout:45000});
  } catch(error) {
    const state=await page.evaluate(() => {
      const kit=document.querySelector('#race-kit'),game=window.game;
      return {kit:!!kit,loaded:kit?.dataset.loaded,error:kit?.dataset.error,
        note:kit?.querySelector('#race-note')?.textContent,
        stage:kit?.querySelector('#race-stage')?.value,
        stageCount:kit?.querySelector('#race-stage')?.options?.length,
        disabled:kit?.querySelector('#race-start')?.disabled,
        nativeState:game?.state,loading:game?.loading,
        nativeMap:game?.map?.id,settingsMap:game?.settings?.map,
        track:!!game?.track,canvas:!!document.querySelector('canvas'),
        title:document.title,
        scripts:[...document.scripts].map((s,i)=>({index:i,src:s.src||'',chars:s.textContent.length,hasRaceKit:s.textContent.includes('race-kit')}))};
    }).catch(e=>({evaluateError:String(e)}));
    report.diagnostics=state;
    report.errors.push('Startup diagnostics: '+JSON.stringify(state));
    report.errors.push('Browser JS errors: '+JSON.stringify(jsErrors.slice(0,10)));
    throw error;
  }
  const problem = await page.evaluate(() => document.querySelector('#race-kit')?.dataset.error);
  if (problem) fail('race boot error: ' + problem);
}
async function raceStart(page, index, name) {
  if (index !== null) {
    await page.selectOption('#race-stage',String(index));
    await page.waitForFunction(expected=> window.game?.state === 'menu' && window.game?.map?.id === expected,
      (index === 1 || index === 4) ? 'egypt' : index === 3 ? 'aegean' : index === 7 ? 'snow' : 'city',
      {timeout:45000});
  }
  const before=await page.evaluate(() => ({
    stage:document.querySelector('#race-stage')?.value,
    map:window.game?.map?.id,
    config:window.game?.settings,
    disabled:document.querySelector('#race-start')?.disabled,
    fuel:document.querySelector('#race-fuel-info')?.textContent,
  }));
  if(before.disabled)fail('start button disabled for '+name);
  await page.click('#race-start');
  try {
    // GitHub's software WebGL renderer advances fixed-step time at ~1/10 real speed.
    // This is a browser-start smoke, not a latency benchmark on production phones.
    await page.waitForFunction(()=>window.game?.state === 'race',null,{timeout:70000});
    await page.waitForFunction(()=>!document.querySelector('#race-controls')?.hidden,null,{timeout:15000});
  } catch (error) {
    const state=await page.evaluate(()=>({
      nativeState:window.game?.state,cdT:window.game?.cdT,raceTime:window.game?.raceTime,
      nativeResult:window.game?.resultShown,nativeMap:window.game?.map?.id,
      loaded:document.querySelector('#race-kit')?.dataset.loaded,
      phase:document.querySelector('#race-kit')?.dataset.phase,
      heading:document.querySelector('#race-heading')?.textContent,
      note:document.querySelector('#race-note')?.textContent,
      pausedFrom:window.game?.pausedFrom,
      startHidden:document.querySelector('#race-start')?.hidden,
      player:!!window.game?.player,
    }));
    report.errors.push('Start transition diagnostics '+JSON.stringify({name,before,state,jsErrors:jsErrors.slice(-5)}));
    throw error;
  }
  const early=await page.evaluate(() => ({
    map:window.game?.map?.id,course:window.game?.track?.__RACE_COURSE_ID,mode:window.game?.settings?.mode,
    laps:window.game?.settings?.laps, state:window.game?.state,
    itemBoxes:window.game?.items?.boxes?.length ?? 0,
    itemShape:window.game?.items?.boxes?.[0]?.cube?.geometry?.type ?? null,
    itemBillboards:window.game?.items?.boxes?.[0]?.g?.children?.filter(x=>x.isSprite)?.length ?? 0,
    questionOverlay:window.game?.items?.boxes?.[0]?.g?.children?.filter(x=>x.isSprite)
      .some(x=>x.material?.depthTest===false && x.material?.map?.image &&
        x.renderOrder>=10 && x.scale.x>=4) ?? false,
    roadWidth:(window.game?.track?.halfW ?? 0)*2,
    padLanes:window.game?.track?.boostPads?.map(p=>p.lat) ?? [],
    trackSamples:window.game?.track?.N ?? 0,
    cornerSigns:window.game?.__RACE_CORNER_SIGNS__?.sprites?.length ?? 0,
    nativeThreeLoaded:!!window.__RACE_THREE__?.Sprite,
    progress:window.game?.player?.progress ?? 0,
    controlsVisible:!!document.querySelector('#race-controls:not([hidden])'),
  }));
  // Software WebGL may advance less than a second of native physics in 6.5
  // wall seconds. Require real player movement, not wall-clock passage.
  // Keep a bounded deadline and collect native telemetry on failure.
  let movementError = null;
  try {
    await page.waitForFunction(origin => {
      const g=window.game,p=g?.player;
      return g?.state === 'race' && p &&
        Number.isFinite(p.progress) && p.progress > origin + 0.5;
    },early.progress,{timeout:55000,polling:750});
  } catch (error) { movementError=error; }
  const after=await page.evaluate(()=>({
    state:window.game?.state,progress:window.game?.player?.progress ?? 0,
    speed:window.game?.player?.s ?? 0, throttle:window.game?.player?.throttle ?? 0,
    raceTime:window.game?.raceTime ?? null,
    wrongWay:window.game?.player?.wrongWay ?? null,
    spin:window.game?.player?.spin ?? null,
    impact:window.game?.player?.impact ?? null,
    lat:window.game?.player?.lat ?? null,
    rank:window.game?.standings?.indexOf(window.game?.player) + 1,
    left:document.querySelector('#race-left')?.getBoundingClientRect().toJSON(),
    right:document.querySelector('#race-right')?.getBoundingClientRect().toJSON(),
    goal:document.querySelector('#race-live-goal')?.textContent,
    fuel:document.querySelector('#race-fuel-info')?.textContent,
  }));
  const expectedMap={0:'city',1:'egypt',3:'aegean',4:'egypt',7:'snow'}[index ?? 0];
  const expectedLaps={0:1,1:2,3:2,4:2,7:2}[index ?? 0];
  const expectedMode=index===4?'item':'speed';
  const expectedCourse='race-'+String((index ?? 0)+1).padStart(2,'0');
  if(early.course!==expectedCourse)
    fail(name+': stage reused a different native road spline: '+JSON.stringify({actual:early.course,expected:expectedCourse}));
  if(early.map!==expectedMap || early.laps!==expectedLaps || early.mode!==expectedMode)
    fail(name+': wrong actual native map/laps/mode: '+JSON.stringify(early));
  if(!early.controlsVisible || after.progress <= early.progress + 0.5)
    fail(name+': native vehicle did not progress with real auto throttle; '+JSON.stringify({early,after,error:movementError?.message}));
  const expectedPadLanes={city:[6,-6,-4,4],egypt:[0,-6],aegean:[5,-5],snow:[5,-5]}[expectedMap];
  if(JSON.stringify(early.padLanes)!==JSON.stringify(expectedPadLanes))
    fail(name+': native speed-pad lane choices missing: '+JSON.stringify(early.padLanes));
  // Compare the actual rendered native geometry with the source-of-truth
  // designed width, not a stale number copied from an earlier track version.
  const expectedWidth=TRACK_RESHAPES[expectedMap]?.width;
  if (!Number.isFinite(expectedWidth) || Math.abs(early.roadWidth-expectedWidth)>.01 || early.trackSamples<600)
    fail(name+': V3.1 real road geometry is missing: '+JSON.stringify(early));
  if(!early.nativeThreeLoaded || early.cornerSigns<2 || early.cornerSigns>7)
    fail(name+': lightweight native Three.js corner signage did not mount: '+JSON.stringify(early));
  if(index===4 && (early.itemBoxes!==8 || early.itemShape!=='IcosahedronGeometry' || early.itemBillboards!==1 || !early.questionOverlay))
    fail('native V3.1 item boxes must be diamond + visible question billboard: '+JSON.stringify(early));
  for(const [key,rect] of [['left',after.left],['right',after.right]]) {
    if(!rect || rect.x < 0 || rect.y < 0 || rect.right > 852 || rect.bottom > 393 || rect.width < 70)
      fail(name+': thumb control out of horizontal safe bounds: '+key);
  }
  await page.screenshot({path:path.join(dest,name+'.png')});
  report.views.push({name,...early,after:{state:after.state,progress:after.progress,rank:after.rank,goal:after.goal,fuel:after.fuel}});
}
try {
  browser=await chromium.launch({headless:true,args:['--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox']});
  const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  page.on('pageerror',e=>jsErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')jsErrors.push(m.text())});
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});await waitLoaded(page);
  const title=await page.locator('#race-stage').locator('option').count();
  if(title!==17)fail('Expected 16 campaign stages + daily, got '+title);
  await raceStart(page,0,'01-city-tutorial');
  // Genuine multi-pointer Chromium touch transport, not simulated game key state.
  const left=await page.locator('#race-left').boundingBox();
  const right=await page.locator('#race-right').boundingBox();
  if (!left || !right) fail('Thumb controls have no hitboxes');
  const cdp=await context.newCDPSession(page);
  const touch={x:left.x+left.width/2,y:left.y+left.height/2,id:101};
  const opposite={x:right.x+right.width/2,y:right.y+right.height/2,id:102};
  const pressState=()=>page.evaluate(()=>({
    left:document.querySelector('#race-left')?.getAttribute('aria-pressed')==='true',
    right:document.querySelector('#race-right')?.getAttribute('aria-pressed')==='true',
  }));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]});
  await page.waitForFunction(()=>document.querySelector('#race-left')?.getAttribute('aria-pressed')==='true',null,{timeout:8000});
  const held=(await pressState()).left;
  // CDP's default Chromium path dispatches changed contacts only; [touch,opposite]
  // needlessly re-sends the held contact. Add only the second finger here.
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[opposite]});
  await page.waitForFunction(()=>{
    const l=document.querySelector('#race-left'),r=document.querySelector('#race-right');
    return l?.getAttribute('aria-pressed')==='false'&&r?.getAttribute('aria-pressed')==='true';
  },null,{timeout:8000});
  const laterThumbWins=await pressState();
  // The touchEnd list names the touch being RELEASED, not the one left held.
  // Releasing id=101 here accidentally cancelled the left thumb in the old test.
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[opposite]});
  await page.waitForFunction(()=>{
    const l=document.querySelector('#race-left'),r=document.querySelector('#race-right');
    return l?.getAttribute('aria-pressed')==='true'&&r?.getAttribute('aria-pressed')==='false';
  },null,{timeout:8000});
  const remainingThumbRestored=await pressState();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>{
    const l=document.querySelector('#race-left'),r=document.querySelector('#race-right');
    return l?.getAttribute('aria-pressed')==='false'&&r?.getAttribute('aria-pressed')==='false';
  },null,{timeout:8000});
  const releasedAll=await pressState();
  if(!laterThumbWins.right||laterThumbWins.left||!remainingThumbRestored.left||remainingThumbRestored.right||releasedAll.left||releasedAll.right)
    fail('Real dual-thumb changeover did not preserve latest-press direction and release: '+JSON.stringify({laterThumbWins,remainingThumbRestored,releasedAll}));
  const knockoutLayout=await page.evaluate(()=>{
    const kit=document.querySelector('#race-kit'),speed=document.querySelector('#race-speed');
    const badge=document.querySelector('#race-knockout');
    const oldKind=kit.dataset.stageKind,oldSpeed=speed.hidden,oldKnockout=badge.hidden;
    kit.dataset.stageKind='elimination';speed.hidden=false;badge.hidden=false;
    const a=badge.getBoundingClientRect(),v=speed.getBoundingClientRect();
    const overlap=a.left<v.right&&v.left<a.right&&a.top<v.bottom&&v.top<a.bottom;
    const clearance=v.top-a.bottom;
    kit.dataset.stageKind=oldKind;speed.hidden=oldSpeed;badge.hidden=oldKnockout;
    return {qaStaged:true,overlap,clearancePx:clearance,knockout:a.toJSON(),speed:v.toJSON()};
  });
  if(knockoutLayout.overlap||knockoutLayout.clearancePx<8)
    fail('Stage12 staged knockout timer obscures speedometer: '+JSON.stringify(knockoutLayout));
  report.stage12Layout=knockoutLayout;
  await page.locator('#race-pause').tap();
  await page.waitForFunction(()=>window.game?.state==='paused',null,{timeout:8000});
  const cleared=await page.evaluate(()=> !window.game?.input?.touch?.left && !window.game?.input?.touch?.right);
  if (!cleared) fail('Pause left a held steering input behind');
  await page.locator('#race-sound').tap();
  const audioMuted=await page.evaluate(()=>({
    button:document.querySelector('#race-sound')?.getAttribute('aria-pressed'),
    preference:localStorage.getItem('h5-qq-mobile-20261013:audio-enabled:v1'),
  }));
  if(audioMuted.button!=='false' || audioMuted.preference!=='0')
    fail('Pause sound toggle did not mute and persist: '+JSON.stringify(audioMuted));
  await page.locator('#race-resume').tap();
  await page.waitForFunction(()=>window.game?.state==='race',null,{timeout:8000});
  report.touch={actualCDPTouch:true,leftPressObserved:held,laterThumbWins,remainingThumbRestored,releasedAll,released:true,paused:true,cleared,resumed:true,audioMuted:true};
  // QA-only injected wrong-way meter: tests native reset integration, NOT natural 180-degree steering.
  await page.evaluate(()=>{window.game.player.wrongWay=2.8;});
  await page.waitForFunction(()=>window.game?.player?.wrongWay===0 && window.game?.player?.s>=12,
    null,{timeout:14000});
  report.recovery={qaInjectedWrongWay:true,nativeResetObserved:true,noNewButton:true};
  // Explicit synthetic progress: tests the stage ENTRY chain only, never claims playthrough.
  report.seededCampaign=true;
  await page.evaluate(() => {
    const stars={};for(let i=1;i<=16;i++)stars[String(i).padStart(2,'0')]=1;
    localStorage.setItem('h5-mobile:qq-speed:career:v1',JSON.stringify({version:1,stars,times:{},skin:0,rounds:16}));
  });
  const cases=[[1,'02-egypt-speed'],[3,'04-aegean-drift'],[4,'05-egypt-items'],[7,'08-snow-rank']];
  for(const [index,name] of cases) {
    await page.reload({waitUntil:'domcontentloaded'});await waitLoaded(page);
    await raceStart(page,index,name);
    if (index===4) {
      // QA-only close-up for ART READABILITY; this is camera/vehicle staging,
      // not legitimate progress, rank, a real item pickup, or a stage clear.
      const visual=await page.evaluate(()=>{
        const g=window.game,p=g.player,track=g.track;
        const distance=track.length*.1-24;
        p.reset(distance,0);p.lastD=distance;p.progress=distance;
        p.lapsDone=0;p.half=false;p.owed=false;
        const candidate=g.items?.boxes?.find(b=>b.respawn<=0);
        return {staged:true,boxDistance:24,shape:candidate?.cube?.geometry?.type??null,
          spriteCount:candidate?.g?.children?.filter(x=>x.isSprite)?.length??0};
      });
      await page.waitForTimeout(1100);
      await page.screenshot({path:path.join(dest,'05-item-question-closeup-qa-staged.png')});
      if (visual.shape!=='IcosahedronGeometry'||visual.spriteCount!==1)
        fail('Item art close-up source does not have question sprites: '+JSON.stringify(visual));
      report.itemCloseup=visual;
    }
  }
  await page.setViewportSize({width:740,height:360});
  const small=await page.evaluate(()=>{
    const left=document.querySelector('#race-left').getBoundingClientRect();
    const right=document.querySelector('#race-right').getBoundingClientRect();
    return {left:left.toJSON(),right:right.toJSON(),width:innerWidth,height:innerHeight};
  });
  if(small.left.left<0||small.right.right>740||small.left.bottom>360||small.right.bottom>360)
    fail('740x360 horizontal thumb controls are clipped');
  await page.screenshot({path:path.join(dest,'08-snow-740x360.png')});
  // Explicit QA-only synthetic DNF. This tests lobby recovery, NEVER counts as a completed race.
  await page.evaluate(() => window.game.showResults());
  await page.waitForFunction(() => document.querySelector('#race-kit')?.dataset.phase==='finished',null,{timeout:12000});
  // Only the "返回选关" button is visible after results; the stage menu is intentionally hidden.
  await page.locator('#race-lobby').tap();
  await page.waitForFunction(() => {
    const g=window.game;
    return document.querySelector('#race-kit')?.dataset.phase==='ready' &&
      g?.state==='menu' && !g.player && g.map?.id==='snow';
  },null,{timeout:12000});
  await page.selectOption('#race-stage','0');
  await page.waitForFunction(() => {
    const g=window.game;
    return document.querySelector('#race-kit')?.dataset.phase==='ready' &&
      g?.state==='menu' && !g.player && g.map?.id==='city';
  },null,{timeout:50000});
  await page.waitForTimeout(900);
  if(jsErrors.length) fail('Switching from results to AI-only lobby crashed script: '+jsErrors.slice(-4).join(' | '));
  await page.selectOption('#race-stage','1');
  await page.waitForFunction(() => window.game?.state==='menu' && window.game?.map?.id==='egypt',null,{timeout:50000});
  await page.click('#race-start');
  await page.waitForFunction(() => window.game?.state==='countdown' && !!window.game?.player,null,{timeout:12000});
  report.lobbyRecovery={syntheticDNF:true,resultsToAIOnlyMenu:true,changedTracksTwice:true,secondRaceCreatedPlayer:true};

  // Verify saved low-end-device quality is respected on a subsequent launch.
  await page.evaluate(() => localStorage.setItem('h5-qq-mobile-20261013:graphics-quality:v1','low'));
  await page.reload({waitUntil:'domcontentloaded'});await waitLoaded(page);
  const quality=await page.evaluate(() => window.game?.settings?.quality);
  if(quality!=='low') fail('Explicit low-graphics preference lost on reload: '+quality);
  report.persistedGraphicsQuality=quality;
  const savedAudio=await page.evaluate(()=>localStorage.getItem('h5-qq-mobile-20261013:audio-enabled:v1'));
  if(savedAudio!=='0') fail('Mute preference lost on reload');
  report.persistedAudioEnabled=false;
  if(jsErrors.length) fail('Browser errors: '+jsErrors.slice(0,4).join(' | '));
  report.passed=true;report.smallView=small;
} catch(e) {report.errors.push(String(e?.stack || e));process.exitCode=1;}
finally {
  report.testEnd=new Date().toISOString();
  await writeFile(path.join(dest,'smoke.json'),JSON.stringify(report,null,2)+'\n');
  await browser?.close();server.close();
  console.log(JSON.stringify({passed:report.passed,views:report.views.map(v=>v.name),errors:report.errors.slice(0,4)},null,2));
}
