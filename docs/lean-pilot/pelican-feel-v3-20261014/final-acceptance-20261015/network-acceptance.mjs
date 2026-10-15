/* global process, console, window */
import {chromium,webkit} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL,URL} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {browserOptions} from '../../../../tools/lean-pilot/pelican-v2/browser-options.mjs';
const repo=fileURLToPath(new URL('../../../../',import.meta.url));
const dir=path.join(repo,'runs/pelican-coast-v2-20261014/final-acceptance-20261015/network');await mkdir(dir,{recursive:true});
await writeFile(path.join(dir,'driver-source.mjs'),await readFile(fileURLToPath(import.meta.url)));
const report={targetGame:'鹈鹕海岸冒险',workspace:path.join(repo,'runs/pelican-coast-v2-20261014/workspace'),scope:'DESKTOP_ENGINEERING_NETWORK_TESTS',physicalDevice:'NOT_RUN',checks:[],errors:[],screenshots:[]};
const check=(name,pass,evidence)=>{report.checks.push({name,status:pass?'PASS':'FAIL',evidence});console.log(name+' '+pass);};
const shot=async(page,name)=>{const p=path.join(dir,name+'.png');await page.screenshot({path:p});report.screenshots.push({path:path.relative(repo,p),sha256:createHash('sha256').update(await readFile(p)).digest('hex')});};
for(const kind of ['slow-network','file-offline','no-webgl']){
 let browser;
 try{
  const type=kind==='file-offline'?webkit:chromium;
  browser=await type.launch({...browserOptions(kind==='file-offline'?'webkit':'chromium'),...(kind==='file-offline'?{}:{channel:'chrome'}),...(kind==='no-webgl'?{args:['--disable-webgl']}:{})});
  const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  if(kind==='slow-network'){
   const cdp=await ctx.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:200,downloadThroughput:200*1024,uploadThroughput:100*1024,connectionType:'cellular3g'});
   const at=Date.now();await page.goto('http://127.0.0.1:4328/game/index.html',{timeout:60000});await page.waitForSelector('#coast[data-loaded="true"]',{timeout:45000});const loadedMs=Date.now()-at;
   await page.locator('#co-start').tap();await page.waitForFunction(()=>window.__coast.snapshot().count>=1,null,{timeout:20000});check('fresh-load-at-200KiBps-200ms-rtt',errors.length===0,{classification:'NETWORK_THROTTLE_ONLY',loadedMs,downloadKiBps:200,latencyMs:200,state:await page.evaluate(()=>window.__coast.snapshot()),errors});await shot(page,'weak-network-ready');
   await ctx.setOffline(true);const before=await page.evaluate(()=>window.__coast.snapshot());await page.waitForTimeout(800);const after=await page.evaluate(()=>window.__coast.snapshot());check('disconnect-after-load-continues',after.phase==='running'&&after.distance>before.distance,{before,after});
   // A previously loaded page is not a cold-cache test. Use a separate fresh
   // context with no per-page throttle session and a unique, uncached URL.
   const coldContext=await browser.newContext({serviceWorkers:'block'});await coldContext.setOffline(true);const coldPage=await coldContext.newPage();
   let coldFailure=false;try{await coldPage.goto('http://127.0.0.1:4328/game/index.html?cold-offline='+Date.now(),{timeout:10000});}catch(e){coldFailure=true;report.offlineNavigation={status:'UNSUPPORTED_EXPECTED',error:String(e).split('\n')[0],note:'Fresh context, blocked service workers, unique uncached URL. No offline first-navigation promise; reconnect and reload.'};}
   check('cold-offline-limit-recorded',coldFailure,report.offlineNavigation);await coldContext.close();await ctx.setOffline(false);await page.goto('http://127.0.0.1:4328/game/index.html');await page.waitForSelector('#coast[data-loaded="true"]');check('reconnect-and-reload-recovers',true,{phase:await page.locator('#coast').getAttribute('data-phase')});
  }else if(kind==='file-offline'){
   const requests=[];await ctx.route(/^https?:\/\//,route=>{requests.push(route.request().url());return route.abort('internetdisconnected');});
   await page.goto(pathToFileURL(path.join(repo,'runs/pelican-coast-v2-20261014/workspace/game/index.html')).href);await page.waitForSelector('#coast[data-loaded="true"]');await ctx.setOffline(true);await page.locator('#co-start').tap();await page.waitForFunction(()=>window.__coast.snapshot().count>=1,null,{timeout:20000});check('downloaded-standalone-html-needs-no-remote-resources',requests.length===0&&errors.length===0,{requests,errors,state:await page.evaluate(()=>window.__coast.snapshot())});await shot(page,'offline-file');
  }else{
   await page.goto('http://127.0.0.1:4328/game/index.html');await page.locator('#fallback').waitFor({state:'visible',timeout:15000});const text=await page.locator('#fallback').innerText();check('unsupported-webgl-has-visible-fallback',text.length>10,{classification:'WEBGL_DISABLED_ENGINEERING_FAULT',text,expectedErrors:errors});await shot(page,'webgl-unavailable');
  }
 }catch(e){report.errors.push({kind,error:e.stack??String(e)});}
 finally{await browser?.close();}
}
report.passed=report.errors.length===0&&report.checks.length===6&&report.checks.every(c=>c.status==='PASS');await writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
