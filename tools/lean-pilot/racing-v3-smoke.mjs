/* global process, console, URL, window, document, localStorage, innerWidth, innerHeight */
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { once } from 'node:events';
import { TRACK_RESHAPES, COURSE_ROAD_WIDTHS } from '../../templates/web-lite/h5-source-mobile-v1/racing/track-design.mjs';
import { STAGES } from '../../templates/web-lite/h5-source-mobile-v1/racing/career.mjs';

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
    const scene=STAGES[index]?.map;
    if(!scene)fail('Cannot stage an unknown career map: '+index);
    const course='race-'+String(index+1).padStart(2,'0');
    // Native map scene is set before the new geometry finishes loading.
    // Wait for actual stage geometry + the enabled start button, not only biome ID.
    await page.waitForFunction(({scene,course}) =>
      window.game?.state === 'menu' && window.game?.map?.id === scene &&
      window.game?.track?.__RACE_COURSE_ID === course &&
      document.querySelector('#race-start')?.disabled === false,
      {scene,course},{timeout:45000});
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
  const startControls = await page.evaluate(() => {
    const game=window.game,wheel=document.querySelector('#race-joystick');
    const computed=wheel&&document.defaultView.getComputedStyle(wheel);
    return {nativeState:game?.state,phase:document.querySelector('#race-kit')?.dataset.phase,
      wheelActive:wheel?.getAttribute('aria-disabled')==='false',
      wheelCaptures:computed?.pointerEvents==='auto'};
  });
  if (startControls.nativeState !== 'countdown' || startControls.phase !== 'countdown' ||
      !startControls.wheelActive || !startControls.wheelCaptures)
    fail('Countdown must accept a resting left thumb before GO: '+JSON.stringify(startControls));
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
    eligibleCornerSamples:(()=>{
      const t=window.game?.track;if(!t?.curv)return 0;
      let n=0;for(let i=0;i<t.N;i+=8){
        const d=i*t.ds;
        if(d>=170&&d<=t.length-140&&Math.abs(t.curv[i])>=.012)n++;
      }
      return n;
    })(),
    shortcut:!!window.game?.track?.__RACE_SHORTCUT__,
    shortcutGain:window.game?.track?.__RACE_SHORTCUT__?.gain ?? 0,
    shortcutRoad:!!window.game?.level?.getObjectByName('physical-shortcut-road'),
    shortcutRails:!!window.game?.level?.getObjectByName('physical-shortcut-rails'),
    nativeThreeLoaded:!!window.__RACE_THREE__?.Sprite,
    progress:window.game?.player?.progress ?? 0,
    controlsVisible:!!document.querySelector('#race-controls:not([hidden])'),
    mobileCamera:window.game?.mobileMode===true,
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
    wheel:document.querySelector('#race-joystick')?.getBoundingClientRect().toJSON(),
    drift:document.querySelector('[data-race-action="drift"]')?.getBoundingClientRect().toJSON(),
    goal:document.querySelector('#race-compact-goal')?.textContent,
    fuel:document.querySelector('#race-fuel-info')?.textContent,
  }));
  const current=STAGES[index??0];
  const expectedMap=current?.map,expectedLaps=current?.laps;
  const expectedMode=current?.mode,expectedCourse=current?.course;
  if(early.course!==expectedCourse)
    fail(name+': stage reused a different native road spline: '+JSON.stringify({actual:early.course,expected:expectedCourse}));
  // Read THREE WORLD GRAPH, not the lobby SVG. Distinct roadside objects
  // must exist on the very same native Track that is being driven.
  const worldIdentity=await page.evaluate(()=>{
    const game=window.game,course=game?.track?.__RACE_COURSE_ID;
    const node=game?.level?.getObjectByName('physical-course-identity-'+course);
    const arches=node?.children?.filter(x=>x.name?.includes('sector-arch')) ?? [];
    const scenery=node?.children?.filter(x=>x.name?.includes('landscape')) ?? [];
    const evidence=window.__RACE_EVIDENCE__;
    return {course,exists:!!node,arches:arches.length,scenery:scenery.length,
      numberedMeshCount:arches[0]?.children?.length??0,
      actualCourse:evidence?.actualCourse,requestedCourse:evidence?.requestedCourse,
      actualTrackLength:evidence?.actualTrackLength,
      revision:evidence?.revision,uiRevision:document.querySelector('#race-kit')?.dataset.previewRevision};
  });
  // A gate showing "11" has fewer actual meshes than one showing "08".
  // Verify exact seven-segment geometry, not a wrong uniform minimum.
  const digitSegments=[6,2,5,5,4,5,6,3,7,6];
  const expectedGateMeshes=7+[...expectedCourse.slice(-2)]
    .reduce((count,digit)=>count+digitSegments[Number(digit)],0);
  if(!worldIdentity.exists||worldIdentity.course!==expectedCourse||
     worldIdentity.arches!==2||worldIdentity.scenery!==4||
     worldIdentity.numberedMeshCount!==expectedGateMeshes||
     worldIdentity.actualCourse!==expectedCourse||
     worldIdentity.requestedCourse!==expectedCourse||
     !(worldIdentity.actualTrackLength>1200)||worldIdentity.revision!=='V6.0'||
     worldIdentity.uiRevision!=='racing-v60-career30')
    fail(name+': numbered features are not in the actual loaded 3D circuit: '+JSON.stringify(worldIdentity));
  if(early.map!==expectedMap || early.laps!==expectedLaps || early.mode!==expectedMode)
    fail(name+': wrong actual native map/laps/mode: '+JSON.stringify(early));
  if(!early.mobileCamera)fail(name+': actual touch driving must enable mobile camera and anti-jitter rendering');
  if(!early.controlsVisible || after.progress <= early.progress + 0.5)
    fail(name+': native vehicle did not progress with real auto throttle; '+JSON.stringify({early,after,error:movementError?.message}));
  const originalPadLanes={city:[6,-6,-4,4],egypt:[0,-6],aegean:[5,-5],snow:[5,-5]}[expectedMap];
  const stageNo=Number(expectedCourse.slice(5));
  const expectedPadLanes=originalPadLanes.map((lat,i)=>lat*((stageNo+i)%3===2?-1:1));
  if(JSON.stringify(early.padLanes)!==JSON.stringify(expectedPadLanes))
    fail(name+': native speed-pad lane choices missing: '+JSON.stringify(early.padLanes));
  // Compare the actual rendered native geometry with the source-of-truth
  // designed width, not a stale number copied from an earlier track version.
  const expectedWidth=COURSE_ROAD_WIDTHS[expectedCourse.slice(5)]??TRACK_RESHAPES[expectedMap]?.width;
  if (!Number.isFinite(expectedWidth) || Math.abs(early.roadWidth-expectedWidth)>.01 || early.trackSamples<600)
    fail(name+': V3.1 real road geometry is missing: '+JSON.stringify(early));
  if(index===4 && (!early.shortcut || early.shortcutGain<35 || !early.shortcutRoad || !early.shortcutRails))
    fail(name+': shortcut must be a real physical mesh, with rails and genuine distance gain: '+JSON.stringify(early));
  if(index===0 && early.shortcut)
    fail(name+': 01 course cannot contain an unannounced shortcut');
  // Any technical road with sharp corners must expose trackside turn signs.
  // Native curvature, not HUD text prompts, is the source of truth.
  if(!early.nativeThreeLoaded || early.cornerSigns>7 ||
     (early.eligibleCornerSamples>0 && early.cornerSigns<1) ||
     (early.eligibleCornerSamples===0 && early.cornerSigns!==0))
    fail(name+': true native-corner signage count differs from road geometry: '+JSON.stringify(early));
  if(index===4 && (early.itemBoxes!==8 || early.itemShape!=='IcosahedronGeometry' || early.itemBillboards!==1 || !early.questionOverlay))
    fail('native V3.1 item boxes must be diamond + visible question billboard: '+JSON.stringify(early));
  if(index===4){
    // This probe calls the ORIGINAL Track projection with synthetic WORLD
    // points; it does not touch the player's position, stats or finish.
    const branchCheck=await page.evaluate(()=>{
      const t=window.game.track,s=t.__RACE_SHORTCUT__,out={},seq=[];
      for(let i=0;i<s.samples.length;i+=3){
        const p=s.samples[i],v=t.project(p.x,p.y,p.z,-1,out);
        seq.push({active:v.__RACE_SHORTCUT_ACTIVE===true,d:v.d});
      }
      const on=seq.filter(p=>p.active),last=seq.at(-1);
      return {activeFrames:on.length,gain:s.gain,minD:Math.min(...on.map(p=>p.d)),
        maxD:Math.max(...on.map(p=>p.d)),offAtExit:last?.active===false};
    });
    if(branchCheck.activeFrames<5 || branchCheck.offAtExit!==true)
      fail(name+': actual physical branch projection/join failed: '+JSON.stringify(branchCheck));
  }
  for(const [key,rect] of [['wheel',after.wheel],['drift',after.drift]]) {
    if(!rect || rect.x < 0 || rect.y < 0 || rect.right > 852 || rect.bottom > 393 || rect.width < 70)
      fail(name+': thumb control out of horizontal safe bounds: '+key);
  }
  await page.screenshot({path:path.join(dest,name+'.png')});
  report.views.push({name,...early,worldIdentity,after:{state:after.state,progress:after.progress,rank:after.rank,goal:after.goal,fuel:after.fuel}});
}
try {
  browser=await chromium.launch({headless:true,args:['--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox']});
  const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1,isMobile:true,hasTouch:true,acceptDownloads:true});
  const page=await context.newPage();
  page.on('pageerror',e=>jsErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')jsErrors.push(m.text())});
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});await waitLoaded(page);
  // A saved legacy assist choice must have no effect on this joystick-only build.
  await page.evaluate(()=>localStorage.setItem('h5-qq-mobile-20261013:control-mode:v2','assist'));
  await page.reload({waitUntil:'domcontentloaded'});await waitLoaded(page);
  const initialControls=await page.evaluate(()=>({
    mode:window.__RACE_EVIDENCE__?.mode,
    wheel:!!document.querySelector('#race-joystick'),
    sensitivity:document.querySelector('#race-steering-sens')?.value,
    noSwitch:!document.querySelector('#race-control-mode'),
    noArrows:!document.querySelector('#race-left')&&!document.querySelector('#race-right'),
    noAutoGuide:!document.querySelector('#race-guide')?.textContent.includes('自动漂移'),
    oneLineFirstGuide:document.querySelector('#race-guide')?.hidden===false &&
      !document.querySelector('#race-guide')?.textContent.includes('松手回正'),
    quality:window.game?.settings?.quality,
    renderPixelRatio:window.game?.renderer?.getPixelRatio(),
    hasComposer:!!window.game?.composer,
    hasShadows:!!window.game?.renderer?.shadowMap?.enabled
  }));
  if(initialControls.mode!=='joystick'||!initialControls.wheel||
     initialControls.sensitivity!=='normal'||!initialControls.noSwitch||
     !initialControls.noArrows||!initialControls.noAutoGuide||!initialControls.oneLineFirstGuide||
     initialControls.quality!=='low'||initialControls.renderPixelRatio>1.01||
     initialControls.hasComposer||initialControls.hasShadows)
    fail('New mobile player needs a single responsive wheel and low GPU default: '+JSON.stringify(initialControls));
  report.initialControls=initialControls;
  // Genuine browser render of the default lobby at two landscape widths.
  // No seeded save, DOM mutation or mocked UI goes into these screenshots.
  for (const [width,height] of [[844,390],[740,360]]) {
    await page.setViewportSize({width,height});
    const geometry=await page.evaluate(()=>{
      const panel=document.querySelector('#race-panel');
      const svg=document.querySelector('#race-course-map .race-track-diagram');
      const rect=panel.getBoundingClientRect();
      return {panel:rect.toJSON(),clientHeight:panel.clientHeight,scrollHeight:panel.scrollHeight,
        mapVisible:!!svg&&svg.getBoundingClientRect().width>75,
        phase:document.querySelector('#race-kit').dataset.phase};
    });
    if(!geometry.mapVisible||geometry.phase!=='ready'||geometry.panel.left<0||
       geometry.panel.right>width||geometry.panel.top<0||geometry.panel.bottom>height||
       geometry.scrollHeight>geometry.clientHeight+12)
      fail('Race lobby must fit without internal scrolling on '+width+'x'+height+': '+JSON.stringify(geometry));
    report.views.push({name:'lobby-'+width+'x'+height,geometry});
    await page.screenshot({path:path.join(dest,'00-lobby-'+width+'x'+height+'.png')});
  }
  await page.setViewportSize({width:844,height:390});
  const title=await page.locator('#race-stage').locator('option').count();
  if(title!==31)fail('Expected 30 campaign stages + daily, got '+title);
  // Real user-triggered browser download, checked from bytes rather than just
  // checking a button exists. It must be a local QA report, not a human claim.
  const firstDownload=page.waitForEvent('download');
  await page.locator('#race-export').tap();
  const firstFile=await firstDownload;
  const initialExport=JSON.parse(await readFile(await firstFile.path(),'utf8'));
  if(firstFile.suggestedFilename()!=='racing-v60-local-playtest.json'||
     initialExport.build!=='V6.0'||initialExport.verifiedHumanPlay!==false||
     initialExport.metrics.starts!==0||initialExport.metrics.finishes!==0)
    fail('Menu export must start empty and explicitly reject human-play claims: '+JSON.stringify(initialExport));
  report.initialExport={filename:firstFile.suggestedFilename(),starts:0,private:true};
  await raceStart(page,0,'01-city-hard-ranked');
  // Actual browser-computed hit targets, not hand-estimated circle positions.
  // Temporarily expose the native item button so ALL four right-hand actions
  // are checked even during an ordinary race; restore source state afterwards.
  // Test 640x320 through 1024x600, including common notched phone landscapes.
  report.thumbHitboxes=[];
  for(const [width,height] of [[640,320],[667,375],[740,360],[812,375],[844,390],[932,430],[1024,600]]) {
    await page.setViewportSize({width,height});
    const boxes=await page.evaluate(()=>{
      const root=document.querySelector('#race-kit');
      const prior=root.dataset.itemMode;root.dataset.itemMode='true';
      const selectors=['#race-joystick',
        '[data-race-action="drift"]','[data-race-action="small"]',
        '[data-race-action="nitro"]','[data-race-action="item"]'];
      const target=selector=>{
        const el=document.querySelector(selector),rect=el.getBoundingClientRect(),cs=document.defaultView.getComputedStyle(el);
        return {name:el.dataset.raceAction||'wheel',
          left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,
          width:rect.width,height:rect.height,
          visible:cs.display!=='none'&&cs.visibility!=='hidden'&&!el.hidden,
          centerHit:el.contains(document.elementFromPoint(rect.left+rect.width/2,
            rect.top+rect.height/2))};
      };
      const targets=selectors.map(target);
      root.dataset.itemMode=prior;
      return targets;
    });
    const overlaps=(a,b)=>Math.min(a.right,b.right)>Math.max(a.left,b.left)+.01&&
      Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+.01;
    const vGap=(a,b)=>Math.max(a.top-b.bottom,b.top-a.bottom,0);
    const byName=Object.fromEntries(boxes.map(x=>[x.name,x]));
    const sprayNitroGap=vGap(byName.small,byName.nitro);
    const itemDriftGap=vGap(byName.item,byName.drift);
    for(const [i,a] of boxes.entries()){
      if(!a.visible||!a.centerHit||a.width<46||a.height<46||a.left<-.5||a.top<-.5||
         a.right>width+.5||a.bottom>height+.5)
        fail('Phone has a hidden, clipped or too-small manual touch target at '+
          width+'x'+height+': '+JSON.stringify(a));
      for(const b of boxes.slice(i+1))
        if(overlaps(a,b))
          fail('Native touch targets overlap at '+width+'x'+height+': '+
            JSON.stringify({a:a.name,b:b.name,targets:boxes}));
    }
    if(sprayNitroGap<7.5||itemDriftGap<7.5)
      fail('One-handed spray/nitro or item/drift targets lack accidental-tap clearance at '+
        width+'x'+height+': '+JSON.stringify({sprayNitroGap,itemDriftGap,boxes}));
    report.thumbHitboxes.push({width,height,sprayNitroGap:+sprayNitroGap.toFixed(1),
      itemDriftGap:+itemDriftGap.toFixed(1),minTargetPx:Math.min(...boxes.map(x=>Math.min(x.width,x.height)))});
  }
  await page.setViewportSize({width:844,height:390});
  const nativeHudLayout=await page.evaluate(()=>{
    const rect=id=>document.querySelector(id)?.getBoundingClientRect();
    const overlaps=(a,b)=>!!a&&!!b&&a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;
    const optional=rect('#race-compact-goal'),speed=rect('#race-speed');
    const forbidden=['#race-moment','#race-chase','#race-progress',
      '#race-live-goal','#race-retry-plan','#race-held-item','#race-speed-state'];
    const core=['#bigrank','#lapbox','#timebox','#minimap','#race-speed','#race-joystick'];
    return {forbidden:forbidden.filter(x=>document.querySelector(x)),
      missingCore:core.filter(x=>!document.querySelector(x)),
      goalOverlapsSpeed:overlaps(optional,speed),
      compactGoalHidden:document.querySelector('#race-compact-goal')?.hidden,
      guideHidden:document.querySelector('#race-guide')?.hidden};
  });
  if(nativeHudLayout.forbidden.length||nativeHudLayout.missingCore.length||
     nativeHudLayout.goalOverlapsSpeed||nativeHudLayout.compactGoalHidden!==true)
    fail('Race view must show only native facts, not coaching overlays: '+JSON.stringify(nativeHudLayout));
  report.nativeHudLayout=nativeHudLayout;
  // Real multi-pointer Chromium touch (not mutated game state). Steering follows
  // a continuous axis, and a second thumb independently holds the drift key.
  const wheel=await page.locator('#race-joystick').boundingBox();
  const drift=await page.locator('[data-race-action="drift"]').boundingBox();
  if(!wheel||wheel.width<100||!drift||drift.width<75||wheel.x+wheel.width+24>drift.x)
    fail('Single joystick / drift hitboxes overlap or are too small: '+JSON.stringify({wheel,drift}));
  // Read the exact player input frame consumed by native game simulation,
  // not just the decorative wheel position or a mocked player trajectory.
  await page.evaluate(()=>{
    const g=window.game,nativeInput=g.input.frame.bind(g.input);
    g.input.frame=()=>{
      const pin=nativeInput();
      g.__QA_LAST_CONTROL_PIN__={steerAxis:pin.steerAxis,
        left:pin.left,right:pin.right,shift:pin.shift,up:pin.up};
      return pin;
    };
  });
  const cdp=await context.newCDPSession(page);
  const centerThumb={x:wheel.x+wheel.width*.5,y:wheel.y+wheel.height*.5,id:101};
  const leftThumb={...centerThumb,x:wheel.x+wheel.width*.18};
  const rightThumb={...centerThumb,x:wheel.x+wheel.width*.82};
  const driftThumb={x:drift.x+drift.width/2,y:drift.y+drift.height/2,id:102};
  // Thumb may naturally land at any location in the enlarged steering zone.
  // It must not initiate an accidental sharp turn until it actually moves.
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[leftThumb]});
  await page.waitForFunction(()=>window.__RACE_EVIDENCE__?.steerAxis===0,null,{timeout:8000});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[centerThumb]});
  await page.waitForFunction(()=>window.__RACE_EVIDENCE__?.steerAxis===0,null,{timeout:8000});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[leftThumb]});
  await page.waitForFunction(()=>window.__RACE_EVIDENCE__?.steerAxis>.5,null,{timeout:8000});
  // Send ALL currently active contact points: single-element touchStart /
  // touchMove arrays silently cancel the other thumb on some Chromium builds.
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[leftThumb,driftThumb]});
  await page.waitForFunction(()=>document.querySelector('[data-race-action="drift"]')?.classList.contains('held'),null,{timeout:8000});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[rightThumb,driftThumb]});
  await page.waitForFunction(()=>window.__RACE_EVIDENCE__?.steerAxis<-.5,null,{timeout:8000});
  await page.waitForFunction(()=>{
    const pin=window.game?.__QA_LAST_CONTROL_PIN__;
    return pin && pin.steerAxis<-.5 && pin.right===true &&
      pin.left===false && pin.shift===true;
  },null,{timeout:18000});
  // Verify the SAME native simulated actor responds, not merely the touch DOM
  // and wrapper input mapping. Software WebGL can take multiple seconds.
  await page.waitForFunction(()=>window.game?.player?.steer < -.20,null,{timeout:18000});
  const simultaneous=await page.evaluate(()=>({
    axis:window.__RACE_EVIDENCE__?.steerAxis,
    nativePin:window.game?.__QA_LAST_CONTROL_PIN__,
    driftHeld:document.querySelector('[data-race-action="drift"]')?.classList.contains('held'),
  }));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[rightThumb]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>window.__RACE_EVIDENCE__?.steerAxis===0,null,{timeout:8000});
  if(!(simultaneous.axis<-.5&&simultaneous.driftHeld&&simultaneous.nativePin?.right===true&&simultaneous.nativePin?.shift===true))
    fail('Stick countersteer must remain responsive during independent drift thumb: '+JSON.stringify(simultaneous));
  const wheelRelease=await page.evaluate(()=>({
    axis:window.__RACE_EVIDENCE__.steerAxis,
    driftHeld:document.querySelector('[data-race-action="drift"]').classList.contains('held')
  }));
  if(wheelRelease.axis!==0||wheelRelease.driftHeld)fail('Touches must release without sticky turning/drift: '+JSON.stringify(wheelRelease));
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
  report.touch={actualCDPTouch:true,joystickCountersteer:true,simultaneousDrift:true,releaseClears:true,paused:true,cleared,resumed:true,audioMuted:true};
  // QA-only injected wrongWay status, NOT a natural 180-degree player turn.
  // On an already-forward-facing car, native physics may self-correct the
  // injected meter before the forced recovery threshold can fire. Both genuine
  // outcomes are acceptable; NEVER claim resetPlayer ran if it did not.
  await page.evaluate(()=>{
    const game=window.game,nativeReset=game.resetPlayer.bind(game);
    game.__QA_RESET_COUNT__=0;
    game.resetPlayer=(...args)=>{game.__QA_RESET_COUNT__++;return nativeReset(...args);};
    game.player.wrongWay=2.8;
  });
  try {
    await page.waitForFunction(()=>{
      const game=window.game,p=game?.player;
      return game?.state==='race' && (
        (game.__QA_RESET_COUNT__>=1 && p?.wrongWay===0) ||
        (Number.isFinite(p?.wrongWay)&&p.wrongWay<.45 &&
          Number.isFinite(p.s)&&p.s>=10)
      );
    },null,{timeout:25000});
  } catch(error) {
    const snapshot=await page.evaluate(()=>({
      resetCount:window.game?.__QA_RESET_COUNT__,state:window.game?.state,
      wrongWay:window.game?.player?.wrongWay,speed:window.game?.player?.s,
      raceTime:window.game?.raceTime,
    }));
    fail('Neither native self-correction nor forced recovery occurred: '+
      JSON.stringify(snapshot)+' '+String(error));
  }
  const recovery=await page.evaluate(()=>({
    resetCalls:window.game.__QA_RESET_COUNT__,
    wrongWay:window.game.player.wrongWay,speed:window.game.player.s,
  }));
  report.recovery={qaInjectedWrongWay:true,
    nativeResetObserved:recovery.resetCalls>0,
    nativeSelfCorrectionObserved:recovery.resetCalls===0&&recovery.wrongWay<.45,
    realResetCalls:recovery.resetCalls,noNewButton:true};
  // Explicit synthetic progress: tests the stage ENTRY chain only, never claims playthrough.
  report.seededCampaign=true;
  await page.evaluate(() => {
    const stars={};for(let i=1;i<=30;i++)stars[String(i).padStart(2,'0')]=1;
    localStorage.setItem('h5-mobile:qq-speed:career:v1',JSON.stringify({version:1,stars,times:{},skin:0,rounds:30}));
  });
  const cases=[[1,'02-egypt-speed'],[3,'04-aegean-drift'],[4,'05-egypt-items'],
    [6,'07-cliff-technical'],[10,'11-serpent-technical'],[7,'08-snow-rank']];
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
    const stick=document.querySelector('#race-joystick').getBoundingClientRect();
    const drift=document.querySelector('[data-race-action="drift"]').getBoundingClientRect();
    return {wheel:stick.toJSON(),drift:drift.toJSON(),width:innerWidth,height:innerHeight};
  });
  if(small.wheel.left<0||small.wheel.bottom>360||small.drift.right>740||small.drift.bottom>360)
    fail('740x360 joystick or drift thumb controls are clipped');
  await page.screenshot({path:path.join(dest,'08-snow-740x360.png')});
  // Explicit QA-only synthetic DNF. This tests lobby recovery, NEVER counts as a completed race.
  await page.evaluate(() => window.game.showResults());
  await page.waitForFunction(() => document.querySelector('#race-kit')?.dataset.phase==='finished',null,{timeout:12000});
  await page.screenshot({path:path.join(dest,'08-result-740x360-qa-staged.png')});
  await page.waitForFunction(() => document.querySelector('#race-kit')?.dataset.phase==='finished',null,{timeout:12000});
  const lossUI=await page.evaluate(()=>{
    const btn=document.querySelector('#race-replay');
    const text=document.querySelector('#race-result-copy')?.textContent??'';
    return {summary:text,
      noRetryEssay:!document.querySelector('#race-retry-plan'),
      button:btn?.textContent??'',buttonVisible:!!btn&&!btn.hidden,
      stage:window.__RACE_EVIDENCE__?.requestedCourse,
      replayTapCount:window.__RACE_EVIDENCE__?.replayTapCount,
      realDuel:window.__RACE_EVIDENCE__?.duel};
  });
  if(!lossUI.noRetryEssay||!lossUI.summary.includes('未完赛')||
     /下局|下一局|应该|提前入弯|再试一次/.test(lossUI.summary)||
     !lossUI.buttonVisible||!lossUI.button.includes('再来一局')||
     lossUI.stage!=='race-08'||!Number.isFinite(lossUI.realDuel?.nativeCrashes))
    fail('Results must show factual finish data and one replay action, not a coaching essay: '+JSON.stringify(lossUI));
  // This is a QA-STAGED DNF; we only assert genuine single-tap reset into
  // the same native course, never invent a human desire to replay or a win.
  await page.locator('#race-replay').tap();
  await page.waitForFunction(() =>
    document.querySelector('#race-kit')?.dataset.phase==='countdown'&&
    window.__RACE_EVIDENCE__?.requestedCourse==='race-08'&&
    window.__RACE_EVIDENCE__?.actualCourse==='race-08'&&
    window.__RACE_EVIDENCE__?.replayTapCount===1,
  null,{timeout:12000});
  const replay=await page.evaluate(()=>({stage:window.__RACE_EVIDENCE__?.actualCourse,
    tapCount:window.__RACE_EVIDENCE__?.replayTapCount,
    duel:window.__RACE_EVIDENCE__?.duel}));
  if(replay.duel?.lostPositions!==0||replay.duel?.corners!==0)
    fail('Retry must clear race telemetry but preserve the real physical stage: '+JSON.stringify(replay));
  await page.evaluate(()=>window.game.showResults());
  await page.waitForFunction(()=>document.querySelector('#race-kit')?.dataset.phase==='finished',null,{timeout:12000});
  report.replay={stagedDnfOnly:true,factualScoreboard:true,noRetryEssay:true,
    sameNativeCourse:true,oneTapCountdown:true,clearCounters:true};
  // The stage selector appears in the menu, not inside the results panel.
  await page.locator('#race-lobby').tap();
  await page.waitForFunction(() => {
    const g=window.game;
    return document.querySelector('#race-kit')?.dataset.phase==='ready' &&
      g?.state==='menu' && !g.player && g.map?.id==='snow';
  },null,{timeout:12000});
  // Staged-DNF smoke runs should be exportable for developer comparison while
  // visibly marked as UNVERIFIED HUMAN PLAY rather than real retention data.
  const laterDownload=page.waitForEvent('download');
  await page.locator('#race-export').tap();
  const laterFile=await laterDownload;
  const finalExport=JSON.parse(await readFile(await laterFile.path(),'utf8'));
  if(finalExport.verifiedHumanPlay!==false||finalExport.metrics.finishes<1||
     finalExport.metrics.starts<2||finalExport.metrics.didNotFinish<1||
     !finalExport.metrics.notes.includes('自动化测试'))
    fail('Export must preserve source-labeled QA DNF without fake human results: '+JSON.stringify(finalExport));
  report.localExport={stagedDnfOnly:true,downloadVerified:true,
    starts:finalExport.metrics.starts,finishes:finalExport.metrics.finishes};
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
  // The last stage MUST be a new physical map in the real 3D engine. Seeded
  // progression here is test fixture only, never a natural campaign win.
  await page.setViewportSize({width:844,height:390});
  await page.reload({waitUntil:'domcontentloaded'});await waitLoaded(page);
  await raceStart(page,29,'30-skyline-real-native-final');
  const late=await page.evaluate(()=>({
    stage:window.__RACE_EVIDENCE__?.requestedCourse,
    native:window.game?.track?.__RACE_COURSE_ID,
    width:window.game?.track?.halfW*2,
    laps:window.game?.settings?.laps,
    field:window.game?.racers?.filter(r=>!r.isPlayer).map(r=>r.skill),
    boss:document.querySelector('#race-stage-goal')?.textContent,
    visual:!!window.game?.level?.getObjectByName('physical-course-identity-race-30')
  }));
  if(late.stage!=='race-30'||late.native!=='race-30'||late.width!==17||
     late.laps!==3||late.field?.length<2||Math.max(...late.field)<2.12||!late.visual)
    fail('Final boss must have a unique, physical hard race-30 track and native opponent: '+JSON.stringify(late));
  report.finalCourse={qaSeeded:true,physicalWorld:true,...late};

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
