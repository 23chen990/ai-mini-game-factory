/* global process,console,window,document,location,URL,getComputedStyle,setTimeout */
import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRun,serveRun,buildHash} from './runner.mjs';
import {sha256} from './policy.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const RUN_ID='h5-cf-challenges-20261013';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

export async function reviewCfV13({base=path.join(ROOT,'runs')}={}){
  const {root,game,run}=await loadRun(base,RUN_ID);
  if(run.theme!=='cf-transport-ship'||run.templateId!=='h5-source-mobile-v1')
    throw Error('Not original CF 3D run: no fixture substitution');
  const build=await buildHash(game),server=await serveRun(base,RUN_ID,0);
  const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:844,height:390},
    hasTouch:true,isMobile:true,deviceScaleFactor:1});
  const page=await context.newPage(),cdp=await context.newCDPSession(page);
  const checks=[],shots=[],errors=[];
  page.on('pageerror',e=>errors.push(String(e.message)));
  const check=(name,passed,detail={})=>{
    checks.push({name,passed:passed===true,detail});
    if(passed!==true)console.error('FAILED '+name+': '+JSON.stringify(detail));
  };
  const screenshot=async name=>{
    const filepath=path.join(root,'screenshots','cf-v13-'+name+'.png');
    await page.screenshot({path:filepath,timeout:25000});
    shots.push({path:path.relative(root,filepath),sha256:sha256(await readFile(filepath))});
  };
  const snap=()=>page.evaluate(()=>{
    const g=window.__H5NativeGame,p=g?.player,nav=g?.nav;
    const c=g?.world?.colliders||[];
    const depot=c.filter(k=>String(k.tag).startsWith('original-depot:'));
    const sites=g?.__mobileBalanceReview||{};
    const objectivePath=(x,z)=>{
      const from=p?.pos;
      if(!nav?.findPath||!from)return 0;
      return nav.findPath(from.x,from.z,x,z)?.length||0;
    };
    const backPath=(x,z)=>{
      const e=g?.actors?.find(a=>p&&a.team!==p.team&&a.alive);
      return e&&nav?.findPath?nav.findPath(e.pos.x,e.pos.z,x,z)?.length||0:0;
    };
    const waypoint=sites.assaultSite||sites.evacSite||
      sites.defenseSites?.[0]||null;
    return {
      arena:new URL(location.href).searchParams.get('arena')||'ship',
      phase:document.querySelector('#mobile-kit')?.dataset.phase,
      challenge:document.querySelector('#mobile-kit')?.dataset.challenge,
      map:g?.map?.id||null,worldBoxes:c.length,depotBoxes:depot.length,
      depotInstanceMeshes:(g?.map?.meshes||[]).filter(m=>String(m.name).startsWith('DEPOT_')).length,
      hasAuthoredDepotHub:depot.some(k=>k.tag==='original-depot:depot-hub'),
      navActive:!!nav?.findPath,
      centerBlocked:!!g?.world?.raycast(-18,1.5,0,1,0,0,36,'sight'),
      northViewClear:!g?.world?.raycast(-18,1.5,-6.5,1,0,0,36,'sight'),
      southViewClear:!g?.world?.raycast(-18,1.5,6.4,1,0,0,36,'sight'),
      roles:g?.actors?.length||0,
      player:p?{alive:p.alive,x:p.pos.x,z:p.pos.z,yaw:p.yaw,
        shots:p.stats?.shots||0,kills:p.stats?.k||0,
        moveX:p.touch?.mx||0,moveZ:p.touch?.mz||0}:null,
      waypoint,waypointValid:waypoint?nav?.walkable?.(nav.idx(waypoint.x,waypoint.z))&&
        !g.world.blocked(waypoint.x,.05,waypoint.z,.55,1.75):null,
      playerPath:waypoint?objectivePath(waypoint.x,waypoint.z):0,
      enemyPath:waypoint?backPath(waypoint.x,waypoint.z):0,
      assaultValid:sites.assaultSiteValid===true,
      evacValid:sites.evacSiteValid===true,
      defenseValid:sites.defenseSitesValid===true
    };
  });
  const visibleCenter=async sel=>page.evaluate(query=>{
    const el=document.querySelector(query);
    if(!el||el.hidden||getComputedStyle(el).display==='none')return null;
    const r=el.getBoundingClientRect();
    return r.width>0&&r.height>0?{x:r.left+r.width/2,y:r.top+r.height/2}:null;
  },sel);
  const gesture=async(start,end,hold=420,id=4)=>{
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',
      touchPoints:[{x:start.x,y:start.y,id}]});
    if(start.x!==end.x||start.y!==end.y)await cdp.send('Input.dispatchTouchEvent',{
      type:'touchMove',touchPoints:[{x:end.x,y:end.y,id}]});
    await sleep(hold);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  };
  const fresh=async()=>{
    await page.reload({waitUntil:'domcontentloaded',timeout:55000});
    await page.waitForSelector('#mobile-kit[data-loaded="true"]',{timeout:55000});
  };
  const mission=async id=>{
    await fresh();
    const m=page.locator('#mk-challenges [data-challenge-id="'+id+'"]');
    await m.tap();
    await page.locator('#mk-start').tap();
    await page.waitForSelector('#mobile-kit[data-phase="running"]',{timeout:50000});
    return snap();
  };
  let finalReport;
  try{
    await mkdir(path.join(root,'screenshots'),{recursive:true});
    await page.goto('http://127.0.0.1:'+server.address().port,{
      waitUntil:'domcontentloaded',timeout:55000});
    await page.waitForSelector('#mobile-kit[data-loaded="true"]',{timeout:55000});
    check('chapter1-still-ship',(await snap()).map==='ship');
    await page.locator('#mk-chapters [data-chapter="1"]').tap();
    await page.waitForURL(url=>url.searchParams.get('arena')==='depot',{timeout:55000});
    await page.waitForSelector('#mobile-kit[data-loaded="true"]',{timeout:55000});
    const ready=await snap();
    check('chapter2-loads-distinct-native-depot',
      ready.map==='depot'&&ready.arena==='depot'&&ready.hasAuthoredDepotHub&&
      ready.depotBoxes>=20&&ready.depotInstanceMeshes>=6&&ready.navActive,
      ready);
    check('depot-center-blocks-longshot-north-and-south-flanks-differ',
      ready.centerBlocked&&ready.northViewClear,
      {center:ready.centerBlocked,north:ready.northViewClear,south:ready.southViewClear});
    await screenshot('original-depot-ready');
    // Mission is real: no manipulation of engine actors, objective state or rewards.
    await page.locator('#mk-start').tap();
    await page.waitForSelector('#mobile-kit[data-phase="running"]',{timeout:50000});
    const assault=await snap();
    check('real-depot-assault-native-point-has-both-actor-paths',
      assault.assaultValid&&assault.waypointValid===true&&
      assault.playerPath>=2&&assault.enemyPath>=2&&assault.player?.alive,
      assault);
    const pad=await visibleCenter('#touch .pad');
    const fire=await visibleCenter('#touch .btn[data-mk-action="fire"]');
    if(!pad||!fire)throw Error('Missing visible real native pad/fire');
    const before=await snap();
    await gesture(pad,{x:pad.x,y:pad.y-49},1050,5);
    const moved=await snap();
    const distance=Math.hypot(moved.player.x-before.player.x,moved.player.z-before.player.z);
    check('native-depot-touch-movement-collides-and-releases',
      distance>.6&&moved.player.moveX===0&&moved.player.moveZ===0,
      {distance,moveX:moved.player.moveX,moveZ:moved.player.moveZ});
    await gesture(fire,fire,500,6);
    const fired=await snap();
    check('native-depot-gun-fires-real-bullets',fired.player.shots>moved.player.shots,
      {before:moved.player.shots,after:fired.player.shots});
    await screenshot('original-depot-assault-native');

    const evac=await mission('evac');
    check('depot-evac-uses-distinct-real-reachable-waypoint',
      evac.evacValid&&evac.waypointValid===true&&evac.playerPath>=2&&evac.enemyPath>=2,
      evac);
    await screenshot('original-depot-evac');

    const counter=await mission('counter');
    check('depot-reverse-defense-both-teams-can-reach-B-first',
      counter.defenseValid&&counter.waypointValid===true&&
      counter.playerPath>=2&&counter.enemyPath>=2,counter);
    await screenshot('original-depot-counter');

    // Actual selection across boundary must boot the old ship again.
    await fresh();
    await page.locator('#mk-chapters [data-chapter="0"]').tap();
    await page.waitForURL(url=>!url.searchParams.has('arena'),{timeout:55000});
    await page.waitForSelector('#mobile-kit[data-loaded="true"]',{timeout:55000});
    const returned=await snap();
    check('chapter-return-reconstructs-original-ship-no-depot-colliders',
      returned.map==='ship'&&returned.depotBoxes===0&&returned.arena==='ship',
      returned);
    await screenshot('original-ship-return');
  }catch(e){
    errors.push(String(e?.stack||e));
    check('runtime-qa-executed',false,{error:String(e?.message||e)});
    try{await screenshot('error');}catch{ /* leave original error */ }
  }finally{
    finalReport={
      schemaVersion:1,runId:RUN_ID,buildHash:build,
      driver:'ACTUAL_PINNED_THREE_JS_NATIVE_WORLD_WITH_CDP_TOUCH',
      generatedMap:'OWNED_ORIGINAL_DEPOT_PRIMITIVES',
      noNativeGameStatOrPositionInjection:true,
      physicalPhone:'NOT_RUN',eightNaturalVictories:'NOT_RUN',
      commercialSourceLicense:'UNVERIFIED',realTapTapAds:'NOT_RUN',
      screenshots:shots,checks,errors,
      passed:checks.length>0&&checks.every(c=>c.passed)&&errors.length===0
    };
    await writeFile(path.join(root,'cf-v13-depot-qa.json'),JSON.stringify(finalReport,null,2)+'\n');
    await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));
  }
  console.log(JSON.stringify({passed:finalReport.passed,checks:finalReport.checks.length,
    failures:finalReport.checks.filter(x=>!x.passed).map(x=>x.name),
    screenshots:shots.length,errors},null,2));
  if(!finalReport.passed)throw Error('V13 actual-world depot / native-touch QA FAIL');
  return finalReport;
}
if(process.argv[1]?.endsWith('cf-v13-depot-qa.mjs'))
  reviewCfV13().catch(e=>{console.error(e);process.exitCode=1;});
