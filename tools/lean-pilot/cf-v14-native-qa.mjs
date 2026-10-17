/* global process,console,window,document,innerWidth,innerHeight,getComputedStyle,URL,performance,setTimeout,localStorage,MutationObserver */
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
  // Genuine browser recording of the entire normal-input session.
  // It is not physical-device footage or a claim of real-player engagement.
  const videoDir=path.join(root,'videos');
  await mkdir(videoDir,{recursive:true});
  const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({
    viewport:{width:667,height:375},hasTouch:true,isMobile:true,deviceScaleFactor:1,
    recordVideo:{dir:videoDir,size:{width:667,height:375}}
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
      time:g?.time||0,player:p?{alive:p.alive,hp:p.hp,
        x:p.pos.x,y:p.pos.y,z:p.pos.z,vy:p.vel?.y,
        onGround:p.onGround,jumpCD:p.jumpCD,
        jumpHeadroom:typeof g?.world?.blocked==='function'
          ?!g.world.blocked(p.pos.x,p.pos.y+0.12,p.pos.z,
            p.radius*.93,p.height+.15):null,
        yaw:p.yaw,pitch:p.pitch,
        shots:p.stats?.shots,hits:p.stats?.hits,kills:p.stats?.k,deaths:p.stats?.d,
        weapon:p.weapon?.id,mag:p.weapon?.mag,
        reloading:p.weapon?.reloading,scoped:p.scoped,
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
        realShots:bot.stats?.shots||0,
        responseStage:bot.__mkIntroThreatStage||0}:null,
      renderer:g?.renderer?{quality:g.renderer.quality,
        pixelRatio:g.renderer.renderer?.getPixelRatio?.(),
        composerRatio:g.renderer.composer?._pixelRatio,
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
    if(id==='assault'){
      // Verify while loading, before H5 sets [hidden] or native boot finishes.
      // The factory's left/right/space buttons must never flash in this FPS.
      await page.waitForSelector('#mobile-kit #mk-controls',{
        state:'attached',timeout:50000});
      const sharedControlDisplay=await page.evaluate(()=>
        getComputedStyle(document.querySelector('#mobile-kit #mk-controls')).display);
      check('cf-initial-loading-hides-factory-left-right-jump',
        sharedControlDisplay==='none',{display:sharedControlDisplay});
    }
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
    const liteControls=await page.locator('#mobile-kit')
      .getAttribute('data-fps-lite')==='true';
    if(liteControls){
      const a=fireRect,centerX=a.x+a.width/2;
      check('lite-fire-button-has-both-directional-runway',
        centerX>250&&667-centerX>=120&&a.width>=76,
        {rect:a,centerX,rightTravel:667-centerX});
      const left=await page.evaluate(()=>{
        const ids=['fire','jump','scope','reload'];
        return ids.map(id=>{
          const el=document.querySelector('#touch .btn[data-mk-action="'+id+'"]');
          const r=el?.getBoundingClientRect();
          return {id,hidden:el?.hidden,rect:r?{x:r.x,y:r.y,w:r.width,h:r.height}:null};
        });
      });
      const overlap=(a,b)=>a&&b&&a.x<b.x+b.w&&b.x<a.x+a.w&&
        a.y<b.y+b.h&&b.y<a.y+a.h;
      check('lite-thumb-buttons-never-overlap',
        left.filter(x=>!x.hidden).every((x,i,all)=>all.every((y,j)=>
          i===j||!overlap(x.rect,y.rect))),{buttons:left});
      await gesture(lookStart,{x:lookStart.x-44,y:lookStart.y-8},180,23);
      const reverse=await inspect();
      check('lite-opposing-swipe-reverses-camera-without-shooting',
        (afterLook.player.yaw-initial.player.yaw)*
          (reverse.player.yaw-afterLook.player.yaw)<-0.0007&&
        reverse.player.shots===initial.player.shots,
        {start:initial.player.yaw,right:afterLook.player.yaw,
          left:reverse.player.yaw});
    }
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
      {beforeFire,after:afterFire.player});
    // Genuine fire+camera and reload/jump: normal CDP fingers only.
    const beforeDrag=await inspect(),fc=center(fireRect);
    // Window touchmove must never see a FIRE-origin drag. The original
    // upstream TouchControls would otherwise apply another 1.6x rotation.
    await page.evaluate(()=>{
      window.__cfWindowFireMoveCount=0;
      window.__cfCountFireMove=()=>window.__cfWindowFireMoveCount++;
      window.addEventListener('touchmove',window.__cfCountFireMove);
    });
    await gesture(fc,{x:fc.x-25,y:fc.y-6},470,28);
    const bubbledFireMoves=await page.evaluate(()=>{
      const count=window.__cfWindowFireMoveCount;
      window.removeEventListener('touchmove',window.__cfCountFireMove);
      delete window.__cfCountFireMove;delete window.__cfWindowFireMoveCount;
      return count;
    });
    check('fire-drag-never-double-counted-by-upstream-window-look',
      bubbledFireMoves===0,{windowTouchmoves:bubbledFireMoves});
    const afterDrag=await inspect();
    check('one-thumb-fire-drag-aim-and-real-bullets',
      Math.abs(afterDrag.player.yaw-beforeDrag.player.yaw)>0.015&&
      afterDrag.player.shots>beforeDrag.player.shots,
      {before:beforeDrag.player,after:afterDrag.player});
    const beforeReload=await inspect();
    await button('#touch .btn[data-mk-action="reload"]',240,29);
    const afterReload=await inspect();
    check('touch-reload-starts-real-weapon-reload',
      beforeReload.player.mag<30&&afterReload.player.reloading===true,
      {before:beforeReload.player,after:afterReload.player});
    // An original jump arc can be brief below a cargo overhang. Sample
    // DURING the real physical finger hold rather than only after release.
    // A click without genuine native vertical motion must still fail QA.
    const jrect=await rect('#touch .btn[data-mk-action="jump"]');
    if(!jrect)throw Error('Jump touch target missing from visible HUD');
    const jc=center(jrect);
    const hitTarget=await page.evaluate(pt=>
      document.elementFromPoint(pt.x,pt.y)?.closest?.(
        '.btn[data-mk-action="jump"]')!==null,jc);
    check('jump-button-unobstructed-hit-target',hitTarget,{rect:jrect});
    let beforeJump=null,afterJump=null,physical=false;
    const jumpSamples=[],jumpAttempts=[];
    for(let attempt=1;attempt<=3;attempt++){
      // In 4v4 a real bot can kill the player during earlier touch tests.
      // Wait for the ORIGINAL native respawn; a dead player cannot jump.
      await page.waitForFunction(()=>{
        const g=window.__H5NativeGame,p=g?.player;
        return g?.playing===true&&!g?.paused&&p?.alive===true&&
          p?.onGround===true;
      },null,{timeout:32000,polling:80});
      beforeJump=await inspect();
      const initial=jumpSamples.length;
      await event('touchStart',[{...jc,id:30+attempt}]);
      try{
        for(let n=0;n<9;n++){
          await sleep(90);
          jumpSamples.push(await inspect());
        }
      }finally{await event('touchEnd',[]);}
      afterJump=await inspect();
      const trial=jumpSamples.slice(initial);
      physical=trial.some(v=>v.player?.y>beforeJump.player.y+.045||
        v.player?.vy>0.4);
      jumpAttempts.push({attempt,aliveBefore:beforeJump.player.alive,
        diedDuring:trial.some(v=>v.player?.alive===false),physical});
      if(physical||!jumpAttempts.at(-1).diedDuring)break;
    }
    check('touch-jump-changes-real-native-physics',physical,{
      before:beforeJump?.player,
      attempts:jumpAttempts,
      samples:jumpSamples.map(v=>({t:v.time,y:v.player?.y,
        vy:v.player?.vy,onGround:v.player?.onGround,
        jumpCD:v.player?.jumpCD,input:v.player?.input?.jump})),
      after:afterJump?.player});
    // Two normal CDP fingers: walk + fire together, followed by OS-style
    // touchcancel. The original Three.js fight can KILL the player mid-input;
    // native death correctly clears movement. In that one causal branch,
    // release all touches, await real 4s native respawn and repeat once.
    // This never sets HP, state, position, stats, clock or the input assertion.
    const f0=center(fireRect),multiTouchTraces=[];
    let combined=null,cancelled=null,multiSuccess=false;
    for(let attempt=1;attempt<=2;attempt++){
      const current=await inspect();
      if(!current.player?.alive){
        await page.waitForFunction(()=>{
          const g=window.__H5NativeGame;
          return g?.playing===true&&!g?.paused&&
            g?.player?.alive===true;
        },null,{timeout:30000,polling:100});
      }
      await event('touchStart',[{...p0,id:51}]);
      await event('touchStart',[{...p0,id:51},{...f0,id:52}]);
      await event('touchMove',[
        {x:p0.x,y:p0.y-43,id:51},{x:f0.x-17,y:f0.y-9,id:52}]);
      await sleep(340);
      combined=await inspect();
      await event('touchCancel',[]);
      await sleep(220);
      cancelled=await inspect();
      multiSuccess=combined.player?.alive===true&&
        Math.abs(combined.player.input.mz)>.25&&
        combined.player.input.fire===true;
      multiTouchTraces.push({
        attempt,aliveDuring:combined.player?.alive,
        deaths:combined.player?.deaths,
        walk:combined.player?.input.mz,
        firing:combined.player?.input.fire,
        cancelled:cancelled.player?.input
      });
      if(multiSuccess||combined.player?.alive===true)break;
    }
    check('two-thumbs-simultaneous-input',multiSuccess,
      {combined:combined.player,attempts:multiTouchTraces});
    check('ios-style-cancel-releases-all-native-touches',
      cancelled.player.input.mx===0&&cancelled.player.input.mz===0&&
      cancelled.player.input.fire===false&&cancelled.player.input.firePressed===false&&
      cancelled.player.input.dx===0&&cancelled.player.input.dy===0,
      {cancelled:cancelled.player,attempts:multiTouchTraces});
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
    // Do not certify a mobile shooter whose first viewport contains only
    // container walls. Markers are already projected through the ORIGINAL
    // camera and visibility-tested against the ORIGINAL world raycaster.
    const initialVisible=await page.evaluate(()=>[...document.querySelectorAll(
      '.mk-fps-enemy')].filter(el=>el.hidden===false&&
        getComputedStyle(el).display!=='none').map(el=>({
          left:el.style.left,top:el.style.top,
          title:el.textContent?.trim()
        })));
    check('h5-lite-opening-actual-los-enemy-is-visible',
      rookie.route?.openingVisibleLane===true&&initialVisible.length>0,
      {route:rookie.route,markers:initialVisible,player:rookie.player});
    await snap('v18-lite-opening-target');
    // V18 has no auto aim. Aim using ONLY the on-screen, LOS-verified visible
    // opponent marker and genuine right-thumb CDP swipes, never actor coords.
    const rookieLite=await page.locator('#mobile-kit')
      .getAttribute('data-fps-lite')==='true';
    const visibleAim=async()=>{
      const aim=await page.evaluate(()=>{
        const el=[...document.querySelectorAll('.mk-fps-enemy')].find(e=>
          !e.hidden&&getComputedStyle(e).display!=='none');
        if(!el)return null;
        const x=parseFloat(el.style.left),y=parseFloat(el.style.top);
        return Number.isFinite(x)&&Number.isFinite(y)?{
          x:x*innerWidth/100,y:y*innerHeight/100,
          cx:innerWidth/2,cy:innerHeight/2,
          w:innerWidth,h:innerHeight
        }:null;
      });
      if(!aim)return {visible:false,aligned:false};
      const dx=aim.x-aim.cx,dy=aim.y-aim.cy;
      // Ten CSS pixels is already well inside the torso's apparent target
      // area at an 8-10m H5 opening. Don't waste 10 seconds chasing a
      // constantly changing 4px marker while the real encounter expires.
      if(Math.hypot(dx,dy)<12)return {visible:true,aligned:true,dx,dy};
      const from={x:Math.round(aim.w*.61),y:Math.round(aim.h*.31),id:92};
      const mx=Math.max(-65,Math.min(65,dx*.55));
      const my=Math.max(-45,Math.min(45,dy*.55));
      const dest={x:from.x+mx,y:from.y+my,id:92};
      // Entire swipe is a real, bounded single-finger gesture. Do not
      // transfer an unrelated FIRE finger between CDP touch sessions:
      // every TouchStart has its matching TouchEnd.
      await gesture(from,dest,90,92);
      return {visible:true,aligned:false,dx,dy};
    };
    const openingAimTrace=[];
    if(rookieLite)for(let n=0;n<3;n++){
      const result=await visibleAim(null);openingAimTrace.push(result);
      if(!result.visible||result.aligned)break;
      await sleep(95);
    }
    // Install a READ-ONLY DOM observer BEFORE the first real finger press:
    // the native target may die in <380ms, and a later screenshot/poll is too
    // late for the brief first-kill cue. This never edits game state/UI.
    await page.evaluate(()=>{
      const el=document.getElementById('mk-fps-hit-feedback');
      window.__cfKillCueObservations=[];
      const read=()=>{
        if(el?.hidden===false&&/首杀/.test(el.textContent||''))
          window.__cfKillCueObservations.push({
            text:el.textContent,
            displayed:getComputedStyle(el).display!=='none'
          });
      };
      const observer=new MutationObserver(read);
      window.__cfKillCueObserver=observer;
      observer.observe(el,{attributes:true,attributeFilter:['hidden'],
        subtree:true,childList:true,characterData:true});
      read();
    });
    await snap('v18-aim-before-first-shot');
    await button('#touch .btn[data-mk-action="fire"]',780,70);
    const firedRookie=await inspect();
    if(rookieLite)check('lite-first-shot-is-manual-not-native-auto-fire',
      firedRookie.route?.autoFireActivations===0&&
        firedRookie.player?.shots>authenticRookieShots,
      {review:firedRookie.route,aimTrace:openingAimTrace});
    check('first30-fire-requires-native-player-shot',
      firedRookie.player.shots>authenticRookieShots,
      {before:authenticRookieShots,after:firedRookie.player.shots});
    // A genuine player shot (or actual damage) wakes the real nearby bot;
    // this is a shorter reaction/cover hold, not edited health or kills.
    check('first30-real-shot-triggers-fair-enemy-retaliation',
      firedRookie.openingBot?.responseStage>=1&&
      firedRookie.openingBot?.readyIn>-0.8&&
      firedRookie.openingBot?.holdUntil<=5.1,
      {before:rookie.openingBot,after:firedRookie.openingBot,
        playerShots:firedRookie.player.shots});
    // Native first-kill gate: realistic aim and fire gestures only. No stat,
    // actor location, clock, damage, or outcome modification.
    const killPressTrace=[];
    const cueObserved=async()=>page.evaluate(()=>{
      return (window.__cfKillCueObservations||[]).some(e=>
        e.displayed===true&&/首杀/.test(e.text));
    });
    let firstKillCueSeen=await cueObserved();
    killPressTrace.push({seconds:+(firedRookie.time-rookie.time).toFixed(2),
      shots:firedRookie.player.shots,hits:firedRookie.player.hits,
      kills:firedRookie.player.kills,
      enemyShots:firedRookie.openingBot?.realShots,
      cueObserved:firstKillCueSeen});
    if(firstKillCueSeen)await snap('v17-first-native-kill-visible');
    if(!firstKillCueSeen || !firedRookie.player.kills){
      // These are genuine repeated human-like LOOK -> FIRE gestures. Every
      // touch is fully released before starting another, even across deaths;
      // only the actual native player, original bullets and world line of
      // sight can produce a kill. No hidden actor coordinates are consumed.
      for(let n=0;n<72;n++){
        const pre=await inspect();
        if(pre.time-rookie.time>=29)break;
        if(!pre.player?.alive){
          await sleep(300);continue;
        }
        const aim=rookieLite?await visibleAim():{
          visible:true,aligned:true,dx:0,dy:0
        };
        openingAimTrace.push(aim);
        if(!aim.visible){
          // A normal FPS user walks toward the gunfight when no opponent is
          // visible. Sample the actual joystick and original collision:
          // alternate short forward advances and real camera searching.
          if(n%3===1){
            const padBox=await rect('#touch .pad');
            if(padBox){
              const c=center(padBox);
              await gesture(c,{x:c.x,y:c.y-49},500,98);
            }
          }else{
            const origin={x:408,y:112},sign=n%8<6?1:-1;
            await gesture(origin,{x:origin.x+sign*46,y:origin.y},100,93);
          }
        }else if(aim.aligned||n%2===0) {
          // Single thumb triggers actual native weapon bursts. The cursor is
          // never moved programmatically; each shot is a genuine input.
          await button('#touch .btn[data-mk-action="fire"]',520,79);
        }
        const state=await inspect();
        const cue=await page.evaluate(()=>{
          const el=document.getElementById('mk-fps-hit-feedback');
          return {text:el?.textContent||'',visible:el?.hidden===false};
        });
        killPressTrace.push({seconds:+(state.time-rookie.time).toFixed(2),
          shots:state.player?.shots,hits:state.player?.hits,
          kills:state.player?.kills,enemyShots:state.openingBot?.realShots,
          cue:cue.visible?cue.text:null});
        if(!firstKillCueSeen&&await cueObserved()){
          firstKillCueSeen=true;
          await snap('v17-first-native-kill-visible');
        }
        if((state.player?.kills||0)>=1&&firstKillCueSeen)break;
      }
    }
    const killResult=await inspect();
    samples.push({id:'tags',when:'first-personal-native-kill',
      realTouch:true,aimInputOnly:true,openingAimTrace,trace:killPressTrace});
    check('first30-real-personal-kill-from-manual-thumb-bursts',
      killResult.player?.kills>=1&&
      killResult.player.hits>=1&&
      killResult.player.shots>=firedRookie.player.shots&&
      killResult.time-rookie.time<30,
      {nativeSec:killResult.time-rookie.time,player:killResult.player,
        trace:killPressTrace});
    const observedCues=await page.evaluate(()=>
      window.__cfKillCueObservations||[]);
    check('first30-kill-reward-rendered-from-real-player-counter',
      firstKillCueSeen&&observedCues.some(e=>e.displayed),
      {trace:killPressTrace,observedCues});
    // Software WebGL can render 6 seconds of native simulation in 11 wall
    // seconds. Always wait on the ORIGINAL GAME CLOCK, never force timers or
    // weaken the 10-second tactical release; capture the wall/sim gap as
    // performance evidence rather than claiming physical-device readiness.
    const wallStart=performance.now();
    await page.waitForFunction(deadline=>{
      const g=window.__H5NativeGame;
      return g?.playing===true&&g?.time>=deadline;
    },rookie.time+11,{timeout:75_000,polling:250});
    const afterRookieWindow=await inspect();
    check('first30-genuine-native-player-hit',afterRookieWindow.player?.hits>=1,
      {hits:afterRookieWindow.player?.hits,shots:afterRookieWindow.player?.shots,
        nativeSeconds:afterRookieWindow.time-rookie.time});
    const wallSec=(performance.now()-wallStart)/1000;
    // The original opponent was genuinely eliminated in the opening;
    // it is fair for a player's decisive first kill to PREVENT return fire.
    // A separate no-attack branch below must prove genuine counterfire.
    check('stationary-novice-target-released-by-real-11sec-native-clock',
      afterRookieWindow.time-rookie.time>=10.5&&
      (afterRookieWindow.openingBot?.training===false||
       afterRookieWindow.openingBot?.alive===false),
      {before:rookie.openingBot,after:afterRookieWindow.openingBot,
       simulatedSec:afterRookieWindow.time-rookie.time,
       wallSec:+wallSec.toFixed(2),
       browser:'SWIFTSHADER_CHROMIUM_NOT_A_REAL_PHONE'});
    await snap('v14-first30-live-pressure');

    // Separate causal branch: player never presses fire or any other input.
    // A rival surviving its own native opening MUST return actual gunfire,
    // and its bullets must present a genuine damage/death risk by 30s.
    // Do not teleport, aim for bots, modify health, or create bullets.
    const noAttack=await enter('tags');
    const noAttackTrace=[];
    const noAttackWallStart=performance.now();
    while(performance.now()-noAttackWallStart<95_000){
      await sleep(1700);
      const status=await inspect();
      noAttackTrace.push({
        nativeSec:+(status.time-noAttack.time).toFixed(2),
        phase:status.phase,
        playerShots:status.player?.shots||0,
        playerHP:status.player?.hp,
        playerDeaths:status.player?.deaths||0,
        enemyShots:status.openingBot?.realShots||0,
        enemyRole:status.openingBot?.role,
        enemyTraining:status.openingBot?.training
      });
      const age=status.time-noAttack.time;
      if((age>=13&&status.openingBot?.realShots>0&&
         (status.player?.hp<100||status.player?.deaths>0))||
        age>=28||status.phase==='finished')break;
    }
    const observedCounterfire=noAttackTrace.some(x=>x.enemyShots>0);
    const observedHit=noAttackTrace.some(x=>x.playerHP<100||x.playerDeaths>0);
    check('first30-original-rival-fires-when-player-does-not-attack',
      observedCounterfire&&
      noAttackTrace.some(x=>x.nativeSec<=30&&x.enemyShots>0)&&
      noAttackTrace.every(x=>x.playerShots===0),
      {trace:noAttackTrace});
    check('first30-unaltered-opponent-fire-can-really-injure-player',
      observedHit&&observedCounterfire,
      {trace:noAttackTrace});
    samples.push({id:'tags',when:'no-player-attack-genuine-pressure',
      realTouch:true,trace:noAttackTrace});
    await snap('v17-no-player-fire-real-pressure');

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
    const survivalStart=await enter('survive');
    await button('#touch .btn[data-mk-action="fire"]',440,82);
    // Real game simulation, not wall time, determines the 45-second mission.
    // Low FPS software WebGL may need much more wall time. Sample its native
    // clock throughout, fail if it actually stalls, and retain clock evidence.
    const clockSamples=[];
    const watchStart=performance.now();
    let lastAdvance=watchStart,lastClock=survivalStart.time;
    let settled=null;
    while(performance.now()-watchStart<390000) {
      await sleep(4000);
      const state=await inspect();
      const wallSec=+( (performance.now()-watchStart)/1000 ).toFixed(2);
      const clock={wallSec,nativeSec:state.time,
        phase:state.phase,nativePhase:state.gamePhase,
        ratio:state.renderer?.pixelRatio,composerRatio:state.renderer?.composerRatio,
        deaths:state.player?.deaths};
      clockSamples.push(clock);
      if(state.time>lastClock+.02){
        lastClock=state.time;lastAdvance=performance.now();
      }
      if(state.phase==='finished'){settled=state;break;}
      if(state.phase!=='running'||state.gamePhase==='paused')
        throw Error('Natural survival interrupted: '+JSON.stringify(clock));
      if(performance.now()-lastAdvance>45000)
        throw Error('Native simulation clock stalled: '+JSON.stringify(clockSamples.slice(-8)));
    }
    samples.push({id:'survive',when:'natural-terminal-clock',clockSamples});
    if(!settled)throw Error('Natural survival unfinished within bounded software-render budget: '+
      JSON.stringify(clockSamples.slice(-8)));
    check('survival-real-native-clock-advanced',clockSamples.length>1&&
      clockSamples.some(v=>v.nativeSec>survivalStart.time+20)&&
      clockSamples.every((v,i)=>i===0||v.nativeSec>=clockSamples[i-1].nativeSec),
      {last:clockSamples.at(-1),samples:clockSamples.length});
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
      Number.isInteger(lastEntry.enemyShots)&&
      Object.hasOwn(lastEntry,'firstEnemyShotMs')&&
      Object.hasOwn(lastEntry,'firstDamageMs')&&
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
