/* global document, console */
// Restore only the exact earned same-origin save, then wait in real wall time.
// No fuel, clock, race state or reward injection.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import path from 'node:path';
import {URL} from 'node:url';
import {chromium} from '@playwright/test';
import {earnedResumeOrigin} from '../../../tools/lean-pilot/racing-visible-policy.mjs';
const run=path.resolve('runs/h5-qq-mobile-20261013');
const root=path.join(run,'workspace/game');
const source=path.join(run,'evidence/rc16-natural-resume11');
const out=path.join(run,'artifacts/final-20261020/fuel-recovery');
await mkdir(out,{recursive:true});
const load=async file=>JSON.parse(await readFile(file,'utf8'));
const build=await load(path.join(run,'artifacts/build-racing.json'));
const report=await load(path.join(source,'report.json'));
const storage=await load(path.join(source,'natural-earned-storage.json'));
const origin=earnedResumeOrigin(report,storage,build.buildHash);
const savedFuel=JSON.parse(storage.origins[0].localStorage.find(x=>x.name==='h5-mobile:qq-speed:fuel:v1').value);
assert.equal(savedFuel.amount,0,'exercise the genuinely exhausted branch');
const files=new Map(await Promise.all(['index.html','style.css'].map(async name=>[name,await readFile(path.join(root,name))])));
const server=createServer((req,res)=>{
  const pathname=new URL(req.url,origin).pathname;
  const name=pathname==='/'?'index.html':pathname.slice(1);
  // Browsers can request favicon/other paths. Only the declared payload exists.
  if(!files.has(name)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/html');
  res.end(files.get(name));
});
server.listen(Number(new URL(origin).port),'127.0.0.1');await once(server,'listening');
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--use-angle=metal']});
const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,storageState:storage});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const observed=async()=>({wallMs:Date.now(),fuel:await page.locator('#race-fuel-info').textContent(),startDisabled:await page.locator('#race-start').isDisabled()});
try{
  await page.goto(origin);await page.locator('#race-fuel-info').waitFor();
  const before=await observed();await page.screenshot({path:path.join(out,'before.png')});
  await page.waitForFunction(()=>!document.querySelector('#race-start').disabled,null,{timeout:360000});
  const after=await observed();await page.screenshot({path:path.join(out,'after.png')});
  assert.deepEqual(errors,[]);
  await writeFile(path.join(out,'report.json'),JSON.stringify({schemaVersion:1,buildHash:build.buildHash,source,origin,savedFuel,before,after,elapsedSinceEarnedFuelUpdateMs:after.wallMs-savedFuel.updatedAt,passed:true,adsUsed:false,clockModified:false,storageEdited:false,limitation:'Genuine elapsed-time recovery, not an immediate free restart or a physical-phone test'},null,2)+'\n');
  console.log(JSON.stringify({before,after,passed:true}));
}finally{await context.close();await browser.close();server.close();}
