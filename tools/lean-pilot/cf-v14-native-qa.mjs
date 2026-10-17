/* global process,console,window,document,innerWidth,innerHeight,getComputedStyle,URL,performance,setTimeout */
import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRun,serveRun,buildHash} from './runner.mjs';
import {sha256} from './policy.mjs';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const RUN_ID='h5-cf-challenges-20261013';
const MISSIONS=['tags','precision','survive','defense','assault','marksman','evac','counter'];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/** Original pinned Three.js source only. Visible touchscreen input may modify
 * state through native Player.update(); the QA never writes actor stats/HP/
 * positions, hit counters, objective clocks or result states. */
export async function reviewCfV14({base=path.join(ROOT,'runs')}={}){
  const {run,root,game}=await loadRun(base,RUN_ID);
  if(run.theme!=='cf-transport-ship'||run.templateId!=='h5-source-mobile-v1')
    throw Error('Refuse cross-game or substituted engine');
  const hash=await buildHash(game);
  const server=await serveRun(base,RUN_ID,0);
  const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({
    viewport:{width:667,height:375},hasTouch:true,isMobile:true,deviceScaleFactor:1
  });
  const page=await context.newPage(),cdp=await context.newCDPSession(page);
  const screenshots=[],checks=[],errors=[],samples=[];
  page.on('pageerror',e=>errors.push(e.message));
  const check=(name,ok,detail={})=>{
    const good=ok===true;
    checks.push({name,passed:good,detail});
    if(!good)console.error('FAILED '+name+' '+JSON.stringify(detail));
  };
  const rect=async selector=>page.evaluate(q=>{
    const el=document.querySelector(q);
    if(!el||el.hidden||getComputedStyle(el).display==='none')return null;
    const r=el.getBoundingClientRect();
    return r.width>0&&r.height>0?{x:r.x,y:r.y,width:r.width,height:r.height}:null;
  },selector);
  const center=r=>({x:r.x+r.width/2,y:r.y+r.height/2});
  const snap=async label=>{
    const output=path.join(root,'screenshots','cf-v14-'+label+'.png');
    await page.screenshot({path:output,timeout:30000});
    screenshots.push({file:path.relative(root,output),sha256:sha256(await readFile(output))});
  };
  const inspect=()=>page.evaluate(()=>{
    const g=window.__H5NativeGame,p=g?.player;
    const root=document.querySelector('#mobile-kit');
    const pad=document.querySelector('#touch .pad');
    const fire=document.querySelector('#touch .btn[data-mk-action="fire"]');
    const r=pad?.getBoundingClientRect();
    const f=fire?.getBoundingClientRect();
    const panels=document.querySelector('#mk-panel')?.getBoundingClientRect();
    const bot=g?.actors?.find(a=>!a?.isPlayer &&
      Number.isFinite(a.__mobileTrainingHoldUntil));
    return {
      phase:root?.dataset.phase,challenge:root?.dataset.challenge,
      gamePhase:g?.ended?'finished':g?.paused?'paused':g?.playing?'running':'ready',
      time:g?.time||0,player:p?{alive:p.alive,
        x:p.pos.x,z:p.pos.z,yaw:p.yaw,pitch:p.pitch,
        shots:p.stats?.shots,hits:p.stats?.hits,kills:p.stats?.k,deaths:p.stats?.d,
        weapon:p.weapon?.id,scoped:p.scoped,
        input:{mx:p.touch?.mx,mz:p.touch?.mz,fire:p.touch?.fire,
          firePressed:p.touch?.firePressed,jump:p.touch?.jump,
          dx:p.touchLook?.x||0,dy:p.touchLook?.y||0}
      }:null,
      ready:root?.dataset.loaded==='true',
      visibleHud:getComputedStyle(document.querySelector('#touch')).visibility,
      stick:{rect:r?{x:r.x,y:r.y,w:r.width,h:r.height}:null,
        touchAction:pad?getComputedStyle(pad).touchAction:null},
      fire:{rect:f?{x:f.x,y:f.y,w:f.width,h:f.height}:null,
        touchAction:fire?getComputedStyle(fire).touchAction:null},
      panelFits:panels?panels.left>=-1&&panels.right<=innerWidth+1&&
        panels.top>=-1&&panels.bottom<=innerHeight+1:false,
      status:document.getElementById('mk-status')?.textContent||'',
      route:g?.__mobileBalanceReview||null,
      openingBot:bot?{alive:bot.alive===true,
        readyIn:bot.readyAt-(g?.time||0),
        holdUntil:bot.__mobileTrainingHoldUntil-(g?.time||0),
        training:bot.__mobileTrainingScout===true,
        role:bot.role,
        realShots:bot.stats?.shots||0}:null,
      renderer:g?.renderer?{quality:g.renderer.quality,
        pixelRatio:g.renderer.renderer?.getPixelRatio?.(),
        bloom:g.renderer.bloom!==undefined}:null,
      reviveVisible:document.getElementById('mk-revive-actions')?.hidden===false
    };
  });
  const event=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{
    type,touchPoints:points.map(v=>({x:v.x,y:v.y,id:v.id}))
  });
  const gesture=async(from,to,holdMs=280,id=32)=>{
    const a={...from,id},b={...to,id};
    await event('touchStart',[a]);
    if(from.x!==to.x||from.y!==to.y)await event('touchMove',[b]);
    await sleep(holdMs);
    await event('touchEnd',[]);
  };
  const button=async(selector,holdMs=360,id=44)=>{
    const r=await rect(selector);
    if(!r)throw Error('Missing visible native input: '+selector);
    const c=center(r);await gesture(c,c,holdMs,id);
  };
  const enter=async(id)=>{
    await page.goto('http://127.0.0.1:'+server.address().port,{
      waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForSelector('#mobile-kit[data-loaded="true"]',{timeout:50000});
    await page.locator('#mk-chapters button[data-chapter="'+(MISSIONS.indexOf(id)<4?0:1)+'"]').tap();
    await page.locator('#mk-challenges button[data-challenge-id="'+id+'"]').tap();
    check(id+'-selected',await page.locator('#mobile-kit').getAttribute('data-challenge')===id);
    await page.locator('#mk-start').tap();
    await page.waitForSelector('#mobile-kit[data-phase="running"]',{timeout:50000});
    await page.waitForFunction(()=>document.documentElement.dataset.fpsActive==='true',{
      timeout:20000});
    const s=await inspect();samples.push({id,when:'start',...s});return s;
  };
  let terminal=null,report;
  try{
    await mkdir(path.join(root,'screenshots'),{recursive:true});
    const initial=await enter('assault');
    const padRect=await rect('#touch .pad'),fireRect=await rect(
      '#touch .btn[data-mk-action="fire"]');
    check('real-three-native-actors',initial.gamePhase==='running'&&
      initial.player?.weapon==='m4a1'&&padRect&&fireRect&&
      Array.isArray(initial.route?.assaultSite?[
        initial.route.assaultSite.x,initial.route.assaultSite.z
      ]:null)&&initial.route?.assaultSiteValid===true,{route:initial.route});
    check('original-mobile-webgl-truly-started-at-low-quality',
      initial.renderer?.quality==='low'&&initial.renderer?.bloom===false&&
      initial.renderer?.pixelRatio<=1.01,{renderer:initial.renderer});
    check('landscape-control-no-browser-pan',initial.stick.touchAction==='none'&&
      initial.fire.touchAction==='none');
    await snap('v14-assault-667-start');
    const lookStart={x:Math.round(667*.68),y:150};
    // This gesture touches NO button. Neither native gun nor assistant fires.
    await gesture(lookStart,{x:lookStart.x+44,y:lookStart.y+8},240,21);
    const afterLook=await inspect();
    check('right-swipe-turns-camera-but-not-gun',
      Math.abs(afterLook.player.yaw-initial.player.yaw)>0.025&&
      afterLook.player.shots===initial.player.shots,
      {before:initial.player,after:afterLook.player});
    const p0=center(padRect);
    await gesture(p0,{x:p0.x,y:p0.y-53},940,22);
    const afterWalk=await inspect();
    const dist=Math.hypot(afterWalk.player.x-afterLook.player.x,
      afterWalk.player.z-afterLook.player.z);
    check('native-stick-walks-with-real-collision',dist>.65&&
      afterWalk.player.input.mx===0&&afterWalk.player.input.mz===0,
      {dist,after:afterWalk.player});
    const beforeFire=afterWalk.player.shots;
    await button('#touch .btn[data-mk-action="fire"]',600,24);
    const afterFire=await inspect();
    check('original-bullets-fired-only-from-native-fire-button',
      afterFire.player.shots>beforeFire&&afterFire.player.input.fire===false,
      {beforeFire,afterFire:afterFire.player});
    // Two real CDP fingers: walk+fire at once, then OS-style touchcancel.
    const f0=center(fireRect);
    await event('touchStart',[{...p0,id:51}]);
    await event('touchStart',[{...p0,id:51},{...f0,id:52}]);
    await event('touchMove',[{x:p0.x,y:p0.y-43,id:51},{x:f0.x-17,y:f0.y-9,id:52}]);
    await sleep(340);
    const combined=await inspect();
    check('two-thumbs-simultaneous-input',Math.abs(combined.player.input.mz)>.25&&
      combined.player.input.fire===true,
      {combined:combined.player});
    await event('touchCancel',[]);
    await sleep(220);
    const cancelled=await inspect();
    check('ios-style-cancel-releases-all-native-touches',
      cancelled.player.input.mx===0&&cancelled.player.input.mz===0&&
      cancelled.player.input.fire===false&&cancelled.player.input.firePressed===false&&
      cancelled.player.input.dx===0&&cancelled.player.input.dy===0,
      {cancelled:cancelled.player});
    await snap('v14-multitouch-cancel');
    await page.locator('#mk-pause').tap();
    await page.waitForSelector('#mobile-kit[data-phase="paused"]',{timeout:9000});
    const paused=await inspect();
    check('visible-pause-freezes-native-clock',paused.gamePhase==='paused');
    await sleep(250);
    const pausedAfter=await inspect();
    check('pause-does-not-run-game-or-hold-fire',
      Math.abs(pausedAfter.time-paused.time)<.05&&
      pausedAfter.player.input.fire===false,
      {pausedTime:paused.time,afterTime:pausedAfter.time});
    await page.locator('#mk-resume').tap();
    await page.waitForSelector('#mobile-kit[data-phase="running"]',{timeout:9000});
    // Browser viewport orientation is an emulation, not physical handset data.
    await page.setViewportSize({width:375,height:667});
    await page.waitForSelector('#mobile-kit[data-phase="paused"]',{timeout:13000});
    const portrait=await inspect();
    check('portrait-pauses-live-combat-and-shows-rotate',
      portrait.gamePhase==='paused'&&
      await page.locator('#mk-rotate').isVisible());
    await page.setViewportSize({width:667,height:375});
    await page.locator('#mk-resume').tap();
    await page.waitForSelector('#mobile-kit[data-phase="running"]',{timeout:9000});
    check('landscape-resumes-native-controls',(await inspect()).gamePhase==='running');
    await snap('v14-landscape-resumed');

    // Real first-session pressure. A real original Bot is visible and can
    // return original bullet fire in <=6s. A user receives NO phantom hit.
    const rookie=await enter('tags');
    check('rookie-has-real-encounter-with-fast-counterfire',
      rookie.route?.trainingScout===true&&
      rookie.openingBot?.alive===true&&
      rookie.openingBot.readyIn<=6&&rookie.openingBot.readyIn>=0&&
      rookie.openingBot.holdUntil<=12&&rookie.openingBot.holdUntil>=7,
      {bot:rookie.openingBot,route:rookie.route});
    const authenticRookieShots=rookie.player.shots;
    await button('#touch .btn[data-mk-action="fire"]',380,70);
    const firedRookie=await inspect();
    check('first30-fire-requires-native-player-shot',
      firedRookie.player.shots>authenticRookieShots,
      {before:authenticRookieShots,after:firedRookie.player.shots});
    await sleep(11_100);
    const afterRookieWindow=await inspect();
    check('stationary-novice-target-released-by-real-11sec-native-clock',
      afterRookieWindow.time-rookie.time>=10.5&&
      (afterRookieWindow.openingBot?.training===false||
       afterRookieWindow.openingBot?.alive===false),
      {before:rookie.openingBot,after:afterRookieWindow.openingBot,
       elapsed:afterRookieWindow.time-rookie.time});
    await snap('v14-first30-live-pressure');

    // Smoke each original mission/weapon using visible controls only.
    // This is NOT an eight-mission victory or full skill-curve claim.
    for(const id of MISSIONS){
      const before=await enter(id);
      check(id+'-native-world-and-weapon',before.ready&&
        before.gamePhase==='running'&&before.player?.alive===true&&
        (typeof before.player.weapon==='string')&&
        (!['precision','marksman'].includes(id)||before.player.weapon==='awm'),
      {weapon:before.player?.weapon});
      if(['precision','marksman'].includes(id)){
        await button('#touch .btn[data-mk-action="scope"]',240,60);
        await sleep(500);
      }
      const shots=before.player?.shots||0;
      await button('#touch .btn[data-mk-action="fire"]',350,61);
      const fired=await inspect();
      check(id+'-native-input-and-hud',fired.player?.shots>shots&&
        fired.player?.input.fire===false&&
        fired.visibleHud==='visible'&&
        typeof fired.status==='string'&&fired.status.length>0,
        {shotsBefore:shots,shotsAfter:fired.player?.shots,
          status:fired.status});
      samples.push({id,when:'post-native-fire',...fired});
      if(id==='counter'||id==='precision')await snap('v14-'+id+'-active');
    }

    // Real native shot followed by genuine failure from missing the walking
    // objective. No score, actor health, win/loss or position is edited.
    await enter('survive');
    await button('#touch .btn[data-mk-action="fire"]',440,82);
    await page.waitForSelector('#mobile-kit[data-phase="finished"]',{timeout:200000});
    const settled=await inspect();
    terminal=settled;
    check('natural-real-shot-lack-of-travel-failure',settled.phase==='finished'&&
      await page.locator('#mobile-kit').getAttribute('data-outcome')==='lost',
      {status:settled.status,seconds:settled.time});
    check('free-retry-without-ad',
      await page.locator('#mk-replay').isVisible()&&!settled.reviveVisible);
    await snap('v14-real-natural-failure');
    check('local-playtest-only-appears-after-real-terminal',
      await page.locator('#mk-cf-playtest').isVisible());
    await page.locator('#mk-cf-playtest summary').tap();
    await page.locator('#mk-cf-playtest-copy').tap();
    const exportReport=JSON.parse(await page.locator('#mk-cf-playtest-json').inputValue());
    const lastEntry=exportReport.recent?.at(-1);
    check('export-measures-genuine-native-first30-without-revenue',
      exportReport.scope==='only-local-voluntary-export'&&
      exportReport.notRetentionOrRevenueProof===true&&
      lastEntry?.mission==='survive'&&lastEntry?.result==='lost'&&
      lastEntry?.shots>=1&&Number.isFinite(lastEntry?.firstShotMs)&&
      lastEntry.firstShotMs<=30_000&&
      !Object.hasOwn(exportReport,'claimedAdViews'),
      {lastEntry,counts:{
        starts:exportReport.starts,finishes:exportReport.finishes,
        retries:exportReport.retriesAfterLoss}});
    await snap('v14-voluntary-local-playtest-export');
    const oldOrigin=await page.evaluate(()=>performance.timeOrigin);
    await page.locator('#mk-replay').tap();
    await page.waitForSelector('#mobile-kit[data-phase="running"]',{timeout:50000});
    check('retry-preserves-selected-mission',
      await page.locator('#mobile-kit').getAttribute('data-challenge')==='survive');
    check('instant-free-replay-keeps-native-renderer-no-reload',
      (await page.evaluate(()=>performance.timeOrigin))===oldOrigin);
    check('free-retry-starts-fresh-real-match',(await inspect()).gamePhase==='running');
    const localAfterReplay=await page.evaluate(()=>{
      try{return JSON.parse(localStorage.getItem('h5-cf:local-playtest:v1'));}
      catch{return null;}
    });
    check('replay-counter-only-from-click-after-real-loss',
      localAfterReplay?.retriesAfterLoss===exportReport.retriesAfterLoss+1,
      {before:exportReport.retriesAfterLoss,after:localAfterReplay?.retriesAfterLoss});
    await snap('v14-free-retry-started');
  }catch(e){
    errors.push(String(e?.stack||e));
    check('qa-execution',false,{error:String(e?.message||e)});
    try{await snap('v14-error');}catch{ /* preserve original error */ }
  }finally{
    report={
      schemaVersion:1,runId:RUN_ID,buildHash:hash,
      source:'PINNED_ORIGINAL_THREE_JS_COMPOSED_H5',
      driver:'CHROMIUM_CDP_TOUCH_IN_REAL_3D',
      script:'tools/lean-pilot/cf-v14-native-qa.mjs',
      noGameplayStateInjection:true,
      noSimulatedAdClaim:true,
      humanPhysicalPhone:'NOT_RUN',
      fullEightVictory:'NOT_RUN',
      readyToPublish:false,checks,samples,terminal,screenshots,errors,
      passed:checks.length>0&&checks.every(v=>v.passed===true)&&errors.length===0
    };
    await writeFile(path.join(root,'cf-v14-native-qa.json'),JSON.stringify(report,null,2)+'\n');
    await context.close();await browser.close();await new Promise(r=>server.close(r));
  }
  console.log(JSON.stringify({
    passed:report.passed,checks:report.checks.length,
    failed:report.checks.filter(c=>!c.passed).map(c=>c.name),
    screenshots:report.screenshots.length,
    errors:report.errors
  },null,2));
  if(!report.passed)throw Error('CF V14 natural input gate failed; see cf-v14-native-qa.json');
  return report;
}
if(process.argv[1]&&process.argv[1].endsWith('cf-v14-native-qa.mjs'))
  reviewCfV14().catch(e=>{console.error(e);process.exitCode=1;});
