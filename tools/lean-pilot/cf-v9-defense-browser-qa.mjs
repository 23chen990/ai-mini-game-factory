/* global window,document,getComputedStyle,innerWidth,innerHeight,console,process,URL */
import {chromium} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadRun,serveRun} from './runner.mjs';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export async function checkRealDefense(runId) {
 const {root,run}=await loadRun(path.join(ROOT,'runs'),runId);
 if(run.theme!=='cf-transport-ship')throw Error('Only the pinned CF scene is allowed');
 const server=await serveRun(path.join(ROOT,'runs'),runId,0);
 const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});
 const page=await context.newPage(),checks=[],errors=[],observations=[];
 page.on('pageerror',e=>errors.push(e.message));
 await mkdir(path.join(root,'screenshots'),{recursive:true});
 const verify=(name,passed,detail)=>checks.push({name,passed:passed===true,detail});
 const snapshot=()=>page.evaluate(()=>{
   const g=window.__H5NativeGame,p=g?.player;
   const sites=g?.__mobileBalanceReview?.defenseSites||[];
   const site=sites[0];
   const mission=document.querySelector('#mobile-kit');
   const pin=document.querySelector('#mk-fps-defense-pin');
   const enemies=(g?.actors||[]).filter(a=>p&&a.team!==p.team);
   return {
     phase:mission?.dataset.phase,mode:mission?.dataset.challenge,
     nativeTime:Number(g?.time)||0,playing:g?.playing===true,paused:g?.paused===true,
     player:p?{x:p.pos.x,z:p.pos.z,alive:p.alive,hp:p.hp,
       hits:p.stats.hits,shots:p.stats.shots,deaths:p.stats.d}:null,
     siteValid:g?.__mobileBalanceReview?.defenseSitesValid===true,sites,
     siteRoutes:site&&g?.nav?.findPath&&p?{
       player:g.nav.findPath(p.pos.x,p.pos.z,site.x,site.z)?.length||0,
       enemy:enemies.filter(e=>e.alive).map(e=>
         g.nav.findPath(e.pos.x,e.pos.z,site.x,site.z)?.length||0)
     }:null,
     enemies:enemies.map(e=>({
       id:e.id,alive:e.alive,role:e.role,hp:e.hp,
       position:{x:e.pos.x,z:e.pos.z},
       goal:e.goal,pathLength:e.path?.length||0,
       nativeHits:e.stats?.hits||0
     })),
     status:document.querySelector('#mk-status')?.textContent,
     goal:Number(document.querySelector('#mk-goal')?.value)||0,
     pin:pin&&!pin.hidden&&getComputedStyle(pin).display!=='none'
       ?pin.textContent.trim():null,
     visibleFire:!!document.querySelector('#touch .btn[data-mk-action="fire"]')
   };
 });
 try{
   const base='http://127.0.0.1:'+server.address().port;
   await page.goto(base,{waitUntil:'domcontentloaded'});
   await page.waitForSelector('#mobile-kit[data-loaded="true"]',{timeout:45000});
   await page.setViewportSize({width:667,height:375});
   await page.locator('#mk-challenges [data-challenge-id="defense"]').tap();
   const selection=await page.evaluate(()=>{
     const panel=document.querySelector('#mk-panel')?.getBoundingClientRect();
     const chosen=document.querySelector('#mk-challenges [data-challenge-id="defense"]');
     return {cards:document.querySelectorAll('#mk-challenges button').length,
       chosen:chosen?.getAttribute('aria-pressed')==='true',
       mode:document.getElementById('mobile-kit')?.dataset.challenge,
       fits:!!panel&&panel.left>=0&&panel.top>=0&&panel.right<=innerWidth&&panel.bottom<=innerHeight,
       task:document.querySelector('#mk-copy')?.textContent,
       primary:document.querySelector('#mk-start')?.getBoundingClientRect().height||0};
   });
   await page.screenshot({path:path.join(root,'screenshots/mobile-v9-defense-ready-667.png')});
   verify('real-landscape-fourth-mission',selection.cards===4&&selection.chosen&&
     selection.fits&&selection.primary>=42&&/A和B|A.*B/.test(selection.task||''),
     selection);
   await page.setViewportSize({width:844,height:390});
   await page.locator('#mk-start').tap();
   await page.waitForSelector('#mobile-kit[data-native-phase="running"]',{timeout:45000});
   await page.waitForTimeout(500);
   const start=await snapshot();
   await page.screenshot({path:path.join(root,'screenshots/mobile-v9-defense-live.png')});
   const sites=start.sites||[];
   const validSite=sites.length===2&&sites[0].id==='A'&&sites[1].id==='B'&&
      Math.hypot(sites[0].x-sites[1].x,sites[0].z-sites[1].z)>=8 &&
      start.siteRoutes?.player>=2&&start.siteRoutes?.enemy?.some(n=>n>=2);
   verify('real-3d-two-reachable-areas',start.siteValid&&validSite,{sites,routes:start.siteRoutes});
   verify('real-native-2v2-pressure',start.enemies?.length===2&&
      start.enemies.every(e=>e.hp>0)&&
      start.enemies.some(e=>Array.isArray(e.goal)&&e.pathLength>=2 &&
        Math.hypot(e.goal[0]-sites[0].x,e.goal[1]-sites[0].z)<1),
      {enemies:start.enemies,nativeTime:start.nativeTime});
   verify('real-site-hud-and-original-fire',start.mode==='defense'&&
      start.pin?.includes('A')&&start.visibleFire&&start.playing,{pin:start.pin,mode:start.mode});
   const pad=await page.locator('#touch .pad').first().boundingBox();
   if(!pad)throw Error('Original physical left joystick absent');
   const px=pad.x+pad.width/2,py=pad.y+pad.height/2;
   const cdp=await context.newCDPSession(page);
   try {
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:px,y:py,id:7}]});
     await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:px,y:py-55,id:7}]});
     await page.waitForTimeout(2600);
     await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   } finally {await cdp.detach();}
   const moved=await snapshot();
   await page.screenshot({path:path.join(root,'screenshots/mobile-v9-defense-moved.png')});
   const distance=start.player&&moved.player?
     Math.hypot(start.player.x-moved.player.x,start.player.z-moved.player.z):0;
   verify('real-finger-native-movement',distance>.5&&moved.nativeTime>start.nativeTime,
     {meters:distance,first:start.player,last:moved.player,firstTime:start.nativeTime,lastTime:moved.nativeTime});
   verify('no-scripted-auto-capture',start.goal===0&&start.player?.hits===0&&
     moved.goal<=10,{firstGoal:start.goal,goalAfterActualMove:moved.goal,
       note:'Only real presence in actual NavGrid zone increments held seconds'});
   // Extra *non-gating* first-site natural attempt: continue following the
   // visible A marker with the original joystick. If native enemies contest,
   // that is genuine difficulty evidence, not an excuse to fake capture.
   const approachCdp=await context.newCDPSession(page);
   try{
     await approachCdp.send('Input.dispatchTouchEvent',{
       type:'touchStart',touchPoints:[{x:px,y:py,id:8}]});
     await approachCdp.send('Input.dispatchTouchEvent',{
       type:'touchMove',touchPoints:[{x:px,y:py-55,id:8}]});
     await page.waitForTimeout(4200);
     await approachCdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   }finally{await approachCdp.detach();}
   const nearA=await snapshot();
   await page.waitForTimeout(15000);
   const afterHold=await snapshot();
   await page.screenshot({path:path.join(root,'screenshots/mobile-v9-defense-approach.png')});
   const distanceToA=nearA.player&&sites[0]
     ?Math.hypot(nearA.player.x-sites[0].x,nearA.player.z-sites[0].z):null;
   observations.push({name:'cf-v9-first-site-natural-experiment',
     nonGating:true,physicalMetersToA:distanceToA,
     arrivedInsideZone:distanceToA!==null&&distanceToA<=5,
     capturedA:afterHold.goal>=5||/● B/.test(afterHold.pin||''),
     nativeProgress:afterHold.goal,
     initial:moved,afterWalk:nearA,afterWait:afterHold,
     note:'Only original CDP joystick used. Progress is NOT assumed or counted as a pass; no simulated shooting or full victory claim'});
   await page.locator('#mk-pause').tap();
   const paused=await snapshot();
   verify('real-mobile-pause-keeps-ownership-frozen',paused.phase==='paused'&&paused.paused===true,
     {phase:paused.phase,paused:paused.paused,gameTime:paused.nativeTime});
   await page.screenshot({path:path.join(root,'screenshots/mobile-v9-defense-pause.png')});
 }catch(e){errors.push(String(e?.stack||e));}finally{
   await browser.close();
   await new Promise(resolve=>server.close(resolve));
 }
 const report={schemaVersion:1,scope:'REAL_3D_DEFENSE_SCENE_SMOKE',
   passed:errors.length===0&&checks.every(c=>c.passed),
   qualification:'Real native stage/route/touch smoke, NOT a full human two-site win or live-phone performance claim',
   checks,observations,errors};
 await writeFile(path.join(root,'cf-v9-defense-browser.json'),JSON.stringify(report,null,2));
 return report;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const report=await checkRealDefense(process.argv[2]);
 console.log(JSON.stringify(report,null,2));
 if(!report.passed)process.exitCode=1;
}
