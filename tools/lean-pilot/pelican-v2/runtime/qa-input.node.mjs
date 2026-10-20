import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGameplayDispatch } from '../qa-input.mjs';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

test('counts a real trusted control press even if it settles immediately afterwards',()=>{
 assert.equal(classifyGameplayDispatch('jump',[
  {type:'pointerdown',action:'jump',trusted:true},
 ],'finished'),'delivered');
});
test('a touch arriving after terminal is recorded separately, not as gameplay',()=>{
 assert.equal(classifyGameplayDispatch('jump',[
  {type:'pointerdown',trusted:true},
  {type:'pointerup',trusted:true},
 ],'finished'),'terminal-before-dispatch');
});
test('missing, wrong-target or synthetic gameplay input fails instead of passing',()=>{
 assert.throws(()=>classifyGameplayDispatch('jump',[],'running'),/not delivered/);
 assert.throws(()=>classifyGameplayDispatch('jump',[
  {type:'pointerdown',action:'left',trusted:true},
 ],'running'),/not delivered/);
 assert.throws(()=>classifyGameplayDispatch('jump',[
  {type:'pointerdown',action:'jump',trusted:false},
 ],'finished'),/Untrusted/);
});
test('vehicle fixture exits the opening before slow evidence reads',async()=>{
 const source=await readFile(new URL('../qa.mjs',import.meta.url),'utf8');
 const opening=source.slice(source.indexOf('// Center-lane first vehicle'),source.indexOf("await shot('vehicle-warning')"));
 assert.match(opening,/distance>=40/);
 assert.ok(opening.indexOf("await tap('[data-action=\"right\"]'")<opening.indexOf('const opening=await snapshot()'));
});
test('campaign pause probe freezes through a real control before screenshot RPCs',async()=>{
 const source=await readFile(new URL('../qa.mjs',import.meta.url),'utf8');
 const campaign=source.slice(source.indexOf("if(mode==='campaign'||mode==='all')"),source.indexOf('for(let id=1;id<=5;id++)'));
 assert.ok(campaign.indexOf("await tap('#co-pause'")<campaign.indexOf("await shot('first-fish"));
});
test('V4 accounting still targets the exact old barrier/car after naturally clearing V7 hazards',async()=>{
 const source=await readFile(new URL('../v4-qa.mjs',import.meta.url),'utf8');
 assert.equal(source.split('await passV7Opening()').length-1,2);
 assert.match(source,/e\.objectId==='l1-o1'/);
 assert.match(source,/e\.objectId==='l1-o6'/);
 assert.match(source,/await distance\(94\);await tap\('\[data-action="left"\]'\)/);
});
test('V7 post-touch readback waits for the rendered HUD before another relative nudge',async()=>{
 const source=await readFile(new URL('../v7-journey-qa.mjs',import.meta.url),'utf8');
 const readback=source.slice(source.indexOf('const dispatch=await page.evaluate'),source.indexOf('if(classifyGameplayDispatch'));
 assert.match(readback,/new Promise\(resolve=>requestAnimationFrame/);
 assert.match(readback,/window\.__v7Trusted\.slice\(start\)/);
});
test('campaign critical inputs use the observed HUD and cached visible geometry before slow evidence RPCs',async()=>{
 const source=await readFile(new URL('../qa.mjs',import.meta.url),'utf8');
 const tap=source.slice(source.indexOf('const tap=async'),source.indexOf('const snapshot='));
 assert.match(tap,/const before=decisionView\?\?await page\.evaluate/);
 assert.match(tap,/await page\.touchscreen\.tap\(touchPoint\.x,touchPoint\.y\)/);
 assert.match(tap,/classifyGameplayDispatch/);
 assert.match(tap,/if\(!fastReaction\|\|decisionView\)/);
 const drive=source.slice(source.indexOf('async function drive'),source.indexOf('// V7 has a real centre barrier'));
 assert.ok(drive.indexOf('const controlPoints=')<drive.indexOf('while(Date.now()<end)'));
 assert.match(drive,/document\.elementFromPoint/);
 assert.match(drive,/decisionView:\{\.\.\.v,level:stage\},touchPoint:controlPoints\[decision\.action\]/);
});
test('risk reward PNGs wait until an actual escape from the current visible vehicle lane',async()=>{
 const source=await readFile(new URL('../risk-qa.mjs',import.meta.url),'utf8');
 assert.match(source,/const deferRewardPhotos=view\.lanes\[view\.laneIndex\]\.danger&&view\.lanes\[view\.laneIndex\]\.kind==='vehicle'/);
 assert.match(source,/deferredEscapePhotos\.push\(\{episode:evidenceEpisode,kind:'barrier-cleared-post-escape'\}\)/);
 assert.match(source,/deferredEscapePhotos\.push\(\{episode:evidenceEpisode,kind:'golden-bonus-fish-caught-post-escape'\}\)/);
 const escape=source.slice(source.indexOf('await page.waitForFunction(expected=>'),source.indexOf('if(!openingForecastCaptured'));
 assert.ok(escape.indexOf('for(const photo of deferredEscapePhotos)')>escape.indexOf('timeout:1800'));
});
test('risk input evidence rejects a late canvas hit instead of calling it a control press',async()=>{
 const source=await readFile(new URL('../risk-qa.mjs',import.meta.url),'utf8');
 const tap=source.slice(source.indexOf('async function tap('),source.indexOf('function makeEpisode'));
 assert.match(tap,/event\.type==='pointerdown'/);
 assert.match(tap,/event\.target==='data-action='\+control\[1\]/);
 assert.match(tap,/if\(control&&!action\.trustedTouch\)throw Error/);
});
