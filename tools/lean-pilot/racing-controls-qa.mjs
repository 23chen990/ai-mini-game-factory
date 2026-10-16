/* global process, console, window, document, URL */
import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=fileURLToPath(new URL('../../', import.meta.url));
const out=path.join(ROOT,'runs/h5-qq-mobile-20261013/evidence',
  process.env.RACE_CONTROLS_QA_LABEL ?? 'controls-joystick-only');
await mkdir(out,{recursive:true});
const build=JSON.parse(await readFile(path.join(ROOT,'runs/h5-qq-mobile-20261013/artifacts/build-racing.json')));
const browser=await chromium.launch({headless:process.env.RACE_QA_HEADLESS==='1'});
const cases=[],errors=[];
const timeout=20000;
for(const [width,height] of [[844,390],[852,393],[740,360]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage(),steps=[],checks=[];
  page.on('pageerror',err=>errors.push(err.message));
  const check=(name,passed)=>{checks.push({name,passed});if(!passed)errors.push(width+'x'+height+': '+name);};
  const observe=()=>({
    phase:document.querySelector('#race-kit')?.dataset.phase,
    state:window.game?.state,steer:window.game?.player?.steer,
    axis:window.__RACE_EVIDENCE__?.steerAxis,
    drifting:window.game?.player?.drifting,
    driftHeld:document.querySelector('[data-race-action="drift"]')?.classList.contains('held'),
    controls:!!document.querySelector('#race-joystick')&&!document.querySelector('#race-control-mode')
      &&!document.querySelector('#race-left')&&!document.querySelector('#race-right'),
    rotate:!document.querySelector('#race-rotate')?.hidden
  });
  const record=async name=>{const result=await page.evaluate(observe);steps.push({name,result});return result;};
  try {
    await page.goto(process.env.RACE_QA_URL ?? 'http://127.0.0.1:4334');
    await page.locator('#race-start:not([disabled])').waitFor({timeout:45000});
    await page.locator('#race-start').tap();
    await page.waitForFunction(()=>window.game?.state==='race',null,{timeout:70000});
    check('joystick-only-without-mode-choice',(await record('start')).controls);
    const wheel=await page.locator('#race-joystick').boundingBox();
    const drift=await page.locator('[data-race-action="drift"]').boundingBox();
    check('visible-large-separated-hitboxes',!!wheel&&wheel.width>=100&&!!drift&&drift.width>=75
      &&wheel.x+wheel.width+24<drift.x&&wheel.x>=0&&drift.x+drift.width<=width);
    if(!wheel||!drift)throw Error('Touch controls not visible');
    const cdp=await context.newCDPSession(page);
    const left={id:1,x:wheel.x+wheel.width*.18,y:wheel.y+wheel.height*.5};
    const right={...left,x:wheel.x+wheel.width*.82};
    const drifting={id:2,x:drift.x+drift.width/2,y:drift.y+drift.height/2};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[left]});
    await page.waitForFunction(()=>window.__RACE_EVIDENCE__?.steerAxis>.5,null,{timeout});
    check('left-steering-axis',(await record('drag left')).axis>.5);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[drifting]});
    await page.waitForFunction(()=>document.querySelector('[data-race-action="drift"]')?.classList.contains('held'),null,{timeout});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[right]});
    await page.waitForFunction(()=>window.__RACE_EVIDENCE__?.steerAxis<-.5,null,{timeout});
    const both=await record('opposite steer while drift held');
    check('true-analogue-countersteer-with-manual-drift',both.axis<-.5&&both.driftHeld);
    await page.screenshot({path:`${out}/joystick-countersteer-${width}x${height}.png`});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[drifting]});
    await page.waitForFunction(()=>!document.querySelector('[data-race-action="drift"]')?.classList.contains('held'),null,{timeout});
    const still=await record('release drift only');
    check('one-finger-release-does-not-steal-steering',still.axis<-.5&&!still.driftHeld);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>window.__RACE_EVIDENCE__?.steerAxis===0,null,{timeout});
    check('wheel-return-to-centre',(await record('release steering')).axis===0);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[right]});
    await page.locator('#race-pause').tap();
    await page.waitForFunction(()=>window.game?.state==='paused',null,{timeout});
    const paused=await record('pause under held wheel');
    check('pause-clears-wheel',paused.axis===0&&paused.state==='paused');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.locator('#race-resume').tap();
    await page.waitForFunction(()=>window.game?.state==='race',null,{timeout});
    check('resume-no-sticky-direction',(await record('resume')).axis===0);
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(()=>window.game?.state==='paused',null,{timeout});
    const rotated=await record('rotate');
    check('portrait-pauses-and-shows-help',rotated.rotate&&rotated.axis===0);
    await page.setViewportSize({width,height});
    await page.locator('#race-resume').tap();
    await page.waitForFunction(()=>window.game?.state==='race',null,{timeout});
    check('landscape-resume-restores-wheel',(await record('landscape')).axis===0);
  }catch(err){errors.push(width+'x'+height+': '+(err.stack??String(err)));}
  cases.push({viewport:{width,height},checks,steps});
  await context.close();
}
await browser.close();
const report={buildHash:build.buildHash,inputTransport:'Real Chromium joystick pointer and manual drift fingers',
  syntheticWins:false,physicalPhone:false,forbiddenOperations:[],cases,errors,
  passed:cases.length===3&&cases.every(c=>c.checks.length===10&&c.checks.every(x=>x.passed))&&!errors.length,
  checkedAt:new Date().toISOString()};
await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,checks:cases.map(c=>({viewport:c.viewport,checks:c.checks})),errors},null,2));
if(!report.passed)process.exitCode=1;
