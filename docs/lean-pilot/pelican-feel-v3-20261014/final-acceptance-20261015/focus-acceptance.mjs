/* global console, process, window, document */
import {chromium} from '@playwright/test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath,URL} from 'node:url';
import path from 'node:path';
import {browserOptions} from '../../../../tools/lean-pilot/pelican-v2/browser-options.mjs';
const exec=promisify(execFile),repo=fileURLToPath(new URL('../../../../',import.meta.url));
const dir=path.join(repo,'runs/pelican-coast-v2-20261014/final-acceptance-20261015/focus');await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'driver-source.mjs'),await readFile(fileURLToPath(import.meta.url)));
const report={scope:'MACOS_ACTUAL_APP_FOCUS_ONLY',physicalPhone:'NOT_RUN',checks:[],errors:[]};
const browser=await chromium.launch({...browserOptions('chromium'),headless:false,channel:'chrome'});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),page=await context.newPage();
 await page.addInitScript(()=>{window.__focusEvidence=[];for(const type of ['blur','focus'])window.addEventListener(type,e=>window.__focusEvidence.push({type,trusted:e.isTrusted,hidden:document.hidden,at:Date.now()}));});
 await page.goto('http://127.0.0.1:4328/game/index.html');await page.waitForSelector('#coast[data-loaded="true"]');await exec('open',['-a','Google Chrome']);await page.bringToFront();await page.locator('#co-start').tap();await page.waitForTimeout(500);
 const observe=()=>page.evaluate(()=>({state:window.__coast.snapshot(),focused:document.hasFocus(),visibility:document.visibilityState,events:window.__focusEvidence}));
 report.before=await observe();await exec('open',['-a','Finder']);await page.waitForTimeout(800);report.away=await observe();await exec('open',['-a','Google Chrome']);await page.bringToFront();await page.waitForTimeout(350);report.returned=await observe();
 report.checks.push({name:'real-os-app-switch-auto-pauses',passed:report.before.focused&&report.before.state.phase==='running'&&report.away.events.some(e=>e.type==='blur'&&e.trusted)&&report.away.state.phase==='paused'&&report.away.state.pausedBySystem});
 await page.waitForTimeout(500);report.still=await observe();report.checks.push({name:'return-keeps-timer-frozen-until-manual-resume',passed:report.returned.state.phase==='paused'&&report.still.state.distance===report.returned.state.distance&&report.still.state.elapsed===report.returned.state.elapsed});
 await page.screenshot({path:path.join(dir,'actual-app-return-paused.png')});
 if(report.still.state.phase==='paused')await page.locator('#co-resume').tap();await page.waitForTimeout(400);report.resumed=await observe();report.checks.push({name:'actual-app-return-manual-resume',passed:report.resumed.state.phase==='running'&&report.resumed.state.distance>report.still.state.distance});
 await page.screenshot({path:path.join(dir,'actual-app-return-resumed.png')});
}catch(e){report.errors.push(e.stack??String(e));}
finally{await browser.close();}
report.passed=report.errors.length===0&&report.checks.length===3&&report.checks.every(c=>c.passed);await writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
