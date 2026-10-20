/* global document, console */
// Extract an actual recorded frame, not a reconstructed or generated gameplay image.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const folder=path.resolve('runs/h5-qq-mobile-20261013/evidence/rc19-natural-retry04-look16');
const output=path.resolve('runs/h5-qq-mobile-20261013/artifacts/internal-experience-20261020/recorded-item05');await mkdir(output,{recursive:true});
const report=JSON.parse(await readFile(folder+'/report.json'));
const trace=JSON.parse(await readFile(folder+'/05-trace.json'));
const held=trace.frames.findIndex(f=>f.observed.items.includes('shield'));
const used=trace.frames[held+1];assert.equal(used.observed.items.length,0);assert.ok(trace.frames[held].actions.includes('item'));
const file=folder+'/natural-career.webm',size=(await stat(file)).size;
const server=createServer((req,res)=>{
 if(req.url==='/video'){
  // Browsers request byte ranges while seeking in a real video file.
  const range=req.headers.range;
  if(range){const [start,end]=range.replace('bytes=','').split('-');const first=Number(start),last=end?Number(end):size-1;
   res.writeHead(206,{'Content-Type':'video/webm','Accept-Ranges':'bytes','Content-Range':`bytes ${first}-${last}/${size}`,'Content-Length':last-first+1});createReadStream(file,{start:first,end:last}).pipe(res);
  }else{res.writeHead(200,{'Content-Type':'video/webm','Content-Length':size,'Accept-Ranges':'bytes'});createReadStream(file).pipe(res);}return;
 }
 res.setHeader('Content-Type','text/html');res.end('<style>body{margin:0;background:#000}video{width:844px;height:390px}</style><video muted src="/video" preload="auto"></video>');
});server.listen(0,'127.0.0.1');await once(server,'listening');
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:844,height:390}});
try{
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
 const second=(used.at-report.recordingTimebase.beforePageMs)/1000+.45;
 await page.evaluate(second=>new Promise(resolve=>{const video=document.querySelector('video');video.addEventListener('seeked',resolve,{once:true});video.currentTime=second;}),second);
 await page.screenshot({path:output+'/shield-after-trusted-use.png'});
 await writeFile(output+'/report.json',JSON.stringify({buildHash:report.buildHash,kind:'ACTUAL_RECORDED_VIDEO_FRAME_NOT_NEW_GAMEPLAY',video:path.relative(path.resolve('.'),file),videoSha256:createHash('sha256').update(await readFile(file)).digest('hex'),traceSha256:createHash('sha256').update(await readFile(folder+'/05-trace.json')).digest('hex'),requestedVideoSeconds:second,nativeBefore:{time:trace.frames[held].observed.raceTime,items:trace.frames[held].observed.items,actions:trace.frames[held].actions},nativeAfter:{time:used.observed.raceTime,items:used.observed.items},recordingTimebase:report.recordingTimebase,screenshot:'shield-after-trusted-use.png',limitation:'Approximate recorder start; inspect visible race clock before treating exact timing as confirmed. Inventory consumption is read-only telemetry, not injected.'},null,2)+'\n');
}finally{await browser.close();server.close();}
console.log('Recorded item frame extracted.');
