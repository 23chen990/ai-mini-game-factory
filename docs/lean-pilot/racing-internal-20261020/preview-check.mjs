/* global process, window, document, console */
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve('runs/h5-qq-mobile-20261013/artifacts/internal-experience-20261020/preview-browser19');await mkdir(out);
const url='https://raw.githack.com/23chen990/ai-mini-game-factory/ab5fc6c260df598e35e3951c6842e227def18433/index.html';
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1});
const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
const report={url,sourceCommit:'6196faa085e18ac38b484fcfc1d6909c2bf22882',buildHash:'811e05f4f6207050a63939680de93b4b3b262904663a103048d310f1466e37d6',scope:'Actual remote immutable standalone; entry/start/pause only, not a new natural complete-race or platform acceptance',physicalPhone:false,passed:false,errors};
try{
 const start=Date.now();const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});report.httpStatus=response.status();report.htmlSha256=createHash('sha256').update(await response.body()).digest('hex');assert.equal(report.htmlSha256,'bf68ed63714900a049afd1cb003c5c395155fa1c92b50fe37c72737f5ae40ea4');
 await page.locator('#race-start:not([disabled])').waitFor({timeout:45000});report.remoteReadyMs=Date.now()-start;await page.screenshot({path:out+'/home.png'});
 await page.locator('#race-start').tap();await page.waitForFunction(()=>window.game.state==='race',null,{timeout:45000});await page.waitForTimeout(3000);await page.screenshot({path:out+'/race.png'});
 report.state=await page.evaluate(()=>({phase:document.querySelector('#race-kit').dataset.phase,car:window.__RACE_EVIDENCE__.equippedCar,quality:window.game.settings.quality,pixelRatio:window.game.renderer.getPixelRatio()}));await page.locator('#race-pause').tap();assert.equal(await page.locator('#race-kit').getAttribute('data-phase'),'paused');assert.deepEqual(errors,[]);report.passed=true;
}catch(error){report.error=String(error);}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
