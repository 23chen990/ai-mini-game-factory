/* global window,document,innerWidth,innerHeight,getComputedStyle,process,console,URL */
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadRun,serveRun} from './runner.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export async function smokeCampaign(runId){
 const base=path.join(ROOT,'runs');
 const {root,run}=await loadRun(base,runId);
 if(run.theme!=='cf-transport-ship')throw Error('Expected pinned authentic CF source build');
 const server=await serveRun(base,runId,0);
 const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:667,height:375},
   hasTouch:true,isMobile:true,deviceScaleFactor:1});
 const page=await context.newPage();
 const checks=[],errors=[],samples=[];
 page.on('pageerror',e=>errors.push(e.message));
 const check=(name,passed,detail)=>checks.push({name,passed:passed===true,detail});
 await mkdir(path.join(root,'screenshots'),{recursive:true});
 const screenshot=async name=>page.screenshot({
   path:path.join(root,'screenshots',name+'.png')});
 const snapshot=()=>page.evaluate(()=>{
   const root=document.getElementById('mobile-kit');
   const g=window.__H5NativeGame,p=g?.player;
   const rawSites=g?.__mobileBalanceReview?.defenseSites||[];
   const foes=(g?.actors||[]).filter(a=>p&&a.alive&&a.team!==p.team);
   const nav=g?.nav;
   const site=rawSites[0];
   const panel=document.getElementById('mk-panel')?.getBoundingClientRect();
   return {
     phase:root?.dataset.phase,selected:root?.dataset.challenge,
     chapter:[...document.querySelectorAll('#mk-chapters button')]
       .map(b=>({name:b.textContent,active:b.getAttribute('aria-pressed')==='true'})),
     cards:[...document.querySelectorAll('#mk-challenges button')]
       .map(b=>{
         const title=b.querySelector('b')?.getBoundingClientRect(),
           subtitle=b.querySelector('small')?.getBoundingClientRect(),
           bounds=b.getBoundingClientRect();
         return {id:b.dataset.challengeId,pressed:b.getAttribute('aria-pressed')==='true',
           textFits:!!title&&!!subtitle&&title.bottom+1<=subtitle.top&&
             subtitle.bottom<=bounds.bottom-1&&title.left>=bounds.left&&
             subtitle.left>=bounds.left,
           titleHeight:title?.height,subtitleHeight:subtitle?.height};
       }),
     panelFits:panel?panel.left>=0&&panel.top>=0&&panel.right<=innerWidth&&panel.bottom<=innerHeight:false,
     startVisible:!!document.getElementById('mk-start')&&
       getComputedStyle(document.getElementById('mk-start')).display!=='none',
     primary:g?.opts?.primary,nativeTime:Number(g?.time)||0,
     player:p?{x:p.pos.x,z:p.pos.z,alive:p.alive,hp:p.hp,
       weapon:p.weapon?.id,category:p.weapon?.def?.type,
       kills:p.stats?.k,hits:p.stats?.hits,shots:p.stats?.shots}:null,
     nativeActors:(g?.actors||[]).length,aliveEnemies:foes.length,
     sites:rawSites,
     firstSitePlayerPath:site&&p&&nav?.findPath
       ?nav.findPath(p.pos.x,p.pos.z,site.x,site.z)?.length||0:0,
     firstSiteEnemyPaths:site&&nav?.findPath?foes.map(b=>
       nav.findPath(b.pos.x,b.pos.z,site.x,site.z)?.length||0):[],
     nativeBotToCurrentSite:site?foes.some(b=>Array.isArray(b.goal)&&
       Math.hypot(b.goal[0]-site.x,b.goal[1]-site.z)<1&&b.path?.length>=2):false,
     status:document.getElementById('mk-status')?.textContent||'',
     pin:document.getElementById('mk-fps-defense-pin')?.textContent||'',
     nativeFire:!!document.querySelector('#touch .btn[data-mk-action="fire"]'),
     nativeScope:!!document.querySelector('#touch .btn[data-mk-action="scope"]'),
     adNotice:document.getElementById('mk-revive-actions')?.hidden===false,
     adOldButtonVisible:document.getElementById('mk-ad')?.hidden===false
   };
 });
 async function ready(){
   await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
   await page.waitForSelector('#mobile-kit[data-loaded="true"]',{timeout:45000});
   await page.locator('#mk-chapters button[data-chapter="1"]').tap();
 }
 async function launch(mission){
   if(mission!=='assault')await page.locator(
     '#mk-challenges [data-challenge-id="'+mission+'"]').tap();
   await page.locator('#mk-start').tap();
   await page.waitForSelector('#mobile-kit[data-native-phase="running"]',{timeout:45000});
   await page.waitForTimeout(350);
 }
 try{
   await ready();
   const first=await snapshot();
   await screenshot('cf-v10-chapter2-ready-667');
   check('eight-mission-paging-chapter2-in-short-landscape',
     first.cards.length===4&&first.cards[0].id==='assault'&&
     first.cards[3].id==='counter'&&first.cards.filter(x=>x.pressed).length===1&&
     first.cards.every(x=>x.textFits===true)&&
     first.chapter[1]?.active===true&&first.panelFits&&first.startVisible,first);
   await launch('assault');
   const before=await snapshot();
   await screenshot('cf-v10-assault-native');
   const pad=await page.locator('#touch .pad').first().boundingBox();
   if(!pad)throw Error('Original live touchscreen joystick missing');
   const cdp=await context.newCDPSession(page);
   try{
     const x=pad.x+pad.width/2,y=pad.y+pad.height/2;
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:11}]});
     await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-52,id:11}]});
     await page.waitForTimeout(2100);
     await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   }finally{await cdp.detach();}
   const after=await snapshot();
   const walked=before.player&&after.player
     ?Math.hypot(before.player.x-after.player.x,before.player.z-after.player.z):0;
   check('assault-original-m4-native-movement-no-free-kills',
     before.selected==='assault'&&before.primary==='m4a1'&&
     before.player?.weapon==='m4a1'&&before.nativeActors>=4&&
     walked>=.5&&after.player?.kills===0&&
     /^↗|换位/.test(after.status)&&after.nativeFire&&!after.adNotice,
     {before,after,movedMeters:walked});
   await screenshot('cf-v10-assault-original-joystick');
   await page.reload();await page.waitForSelector('#mobile-kit[data-loaded="true"]',{timeout:45000});
   await launch('marksman');
   const sniper=await snapshot();
   await screenshot('cf-v10-marksman-native');
   check('marksman-real-awm-source-and-scope',
     sniper.selected==='marksman'&&sniper.primary==='awm'&&
     sniper.player?.weapon==='awm'&&sniper.player?.category==='sniper'&&
     sniper.nativeScope&&sniper.nativeFire,sniper);
   await page.reload();await page.waitForSelector('#mobile-kit[data-loaded="true"]',{timeout:45000});
   await launch('evac');
   const evac=await snapshot();
   await screenshot('cf-v10-evac-native');
   check('evac-real-mp5-player-stats-not-scripted',
     evac.selected==='evac'&&evac.primary==='mp5'&&
     evac.player?.weapon==='mp5'&&
     evac.player?.shots===0&&evac.player?.kills===0&&evac.nativeTime>0,evac);
   await page.reload();await page.waitForSelector('#mobile-kit[data-loaded="true"]',{timeout:45000});
   await launch('counter');
   const counter=await snapshot();
   await screenshot('cf-v10-counter-real-B-first');
   check('counter-real-world-B-then-A-with-native-routes',
     counter.selected==='counter'&&counter.sites?.length===2&&
     counter.sites[0]?.id==='B'&&counter.sites[1]?.id==='A'&&
     counter.firstSitePlayerPath>=2&&
     counter.firstSiteEnemyPaths?.some(n=>n>=2)&&
     counter.nativeBotToCurrentSite===true&&/B/.test(counter.pin),
     counter);
   await page.locator('#mk-pause').tap();
   const paused=await snapshot();
   check('chapter2-pause-original-lifecycle',
     paused.phase==='paused'&&paused.player?.alive===true,{paused});
   check('real-ad-unverified-default-shows-no-fake-button',
     counter.adNotice===false&&counter.adOldButtonVisible===false,
     {noPendingAd:true,realH5Permission:'NOT_PROVIDED'});
 }catch(e){errors.push(String(e?.stack||e));}finally{
   await browser.close();await new Promise(res=>server.close(res));
 }
 const report={scope:'PINNED_REAL3D_CF_V10_CAMPAIGN_ONLY',
   passed:errors.length===0&&checks.every(c=>c.passed),
   limitation:'Native source and touch structure only. NO natural full mission win, actual ads, commercial IP clearance or physical phone test.',
   checks,errors,samples};
 await writeFile(path.join(root,'cf-v10-campaign-browser.json'),
   JSON.stringify(report,null,2));
 return report;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const report=await smokeCampaign(process.argv[2]);
 console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
}
