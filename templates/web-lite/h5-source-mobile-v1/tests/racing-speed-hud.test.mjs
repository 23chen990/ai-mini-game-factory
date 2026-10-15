import test from 'node:test';
import assert from 'node:assert/strict';
import {raceSpeedHUD} from '../racing/speed-hud.mjs';
import {readFile} from 'node:fs/promises';
test('real displayed km/h uses native measured speed only',()=>{
  assert.deepEqual(raceSpeedHUD({speedKmh:183.65,s:17,nitroTime:0}),
    {value:'184',label:'',boost:false,slow:false});
  assert.equal(raceSpeedHUD({s:50}).value,'180');
  assert.equal(raceSpeedHUD({speedKmh:Infinity,s:30}).value,'108');
  assert.equal(raceSpeedHUD({speedKmh:-1000}).value,'999');
});
test('boost and slowing are visible without changing car physics',()=>{
  const p={speedKmh:188,nitroTime:2,padTime:0,slowTime:0},original={...p};
  assert.equal(raceSpeedHUD(p).label,'氮气');
  assert.deepEqual(p,original);
  assert.equal(raceSpeedHUD({...p,nitroTime:0,padTime:1}).label,'加速带');
  assert.equal(raceSpeedHUD({...p,nitroTime:0,smallBoost:1}).label,'小喷');
  assert.deepEqual(raceSpeedHUD({speedKmh:80,slowTime:2}),
    {value:'80',label:'减速中',boost:false,slow:true});
});
test('actual mobile HUD tracks race phases, current native km/h and fits below goal',async()=>{
  const ui=await readFile(new URL('../racing/mobile.mjs',import.meta.url),'utf8');
  const css=await readFile(new URL('../racing/mobile.css',import.meta.url),'utf8');
  assert.match(ui,/id="race-speed-value"/);
  assert.match(ui,/raceSpeedHUD\(g\.player\)/);
  assert.match(ui,/\$\('speed'\)\.hidden = next !== 'race'/);
  assert.match(css,/#race-kit #race-speed\[hidden\]/);
  assert.match(css,/top:calc\(var\(--race-top\) \+ 104px\)/);
});
