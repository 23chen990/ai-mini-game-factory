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
