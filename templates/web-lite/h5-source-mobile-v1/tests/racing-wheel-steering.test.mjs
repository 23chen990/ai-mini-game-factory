import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceWheelSteering } from '../racing/wheel-steering.mjs';
import { ManualRaceDriver, TouchActions } from '../racing/driver.mjs';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

test('rotary wheel gives genuine signed, analogue steering after angular movement',()=>{
 const w=new RaceWheelSteering();assert.equal(w.press(1,100,45,100,100,70),true);
 assert.equal(w.snapshot(),0);
 w.update(1,50,60);assert.ok(w.snapshot()>.4);
 w.update(1,150,60);assert.ok(w.snapshot()<-.4);
 assert.equal(w.release(1),true);assert.equal(w.snapshot(),0);assert.equal(w.visualDegrees,0);
});
test('wheel ignores hub crossing and angular wrap has no 360 degree jump',()=>{
 const w=new RaceWheelSteering();w.press(2,50,100,100,100,70);
 w.update(2,55,55);const before=w.snapshot();
 w.update(2,100,100);w.update(2,145,55);assert.equal(w.snapshot(),before);
 w.update(2,100,42);assert.ok(w.snapshot()>before);
 w.release(2);w.press(3,42,101,100,100,70);
 w.update(3,42,99);assert.ok(Math.abs(w.visualDegrees)<5);
});
test('second thumb and cancellation do not steal wheel, even with other actions held',()=>{
 const w=new RaceWheelSteering(),actions=new TouchActions();
 w.press(7,100,45,100,100,70);w.update(7,50,60);
 actions.press(9,'drift',1);assert.equal(w.press(9,160,100,100,100,70),false);
 assert.equal(w.release(9),false);assert.ok(w.snapshot()>.3);
 assert.equal(actions.isHeld('drift'),true);assert.equal(w.release(7),true);
 assert.equal(w.snapshot(),0);actions.cancel(9);assert.equal(actions.isHeld('drift'),false);
});
test('partial rotary steering passes to unchanged real native driver intents',()=>{
 const w=new RaceWheelSteering(),d=new ManualRaceDriver(new TouchActions());
 w.press(3,100,45,100,100,70);w.update(3,85,42);
 const axis=w.snapshot();assert.ok(axis>0&&axis<1);
 const player={finished:false,s:30,spin:0,wrongWay:0,airborne:false,h:0,hint:0,proj:{hd:0}};
 const output=d.frame({steerAxis:axis},player,'race',{track:{hd:[0]},now:1});
 assert.equal(output.steerAxis,axis);assert.equal(output.left,true);
 assert.equal(output.shift,false);assert.equal(output.nitroPressed,false);
});
test('production UI exposes one wheel and no QA mode selector',async()=>{
 const ui=await readFile(new URL('../racing/mobile.mjs',import.meta.url),'utf8');
 const css=await readFile(new URL('../racing/mobile.css',import.meta.url),'utf8');
 assert.match(ui,/new RaceWheelSteering\(\)/);
 assert.match(ui,/joystick\.update\(e\.pointerId,e\.clientX,e\.clientY\)/);
 assert.match(ui,/window\.addEventListener\(kind,e=>/);
 assert.match(ui,/joystick\.clear\(\)/);
 assert.match(css,/race-wheel-spoke/);assert.match(css,/data-race-action="drift"/);
 assert.doesNotMatch(ui,/createInternalRaceController|race-control-mode/);
});

test('rotary wheel accepts held countdown input and exports only timing aggregates',async()=>{
 const ui=await readFile(new URL('../racing/mobile.mjs',import.meta.url),'utf8');
 assert.match(ui,/phase !== 'race' && phase !== 'countdown'/);
 assert.match(ui,/classList\.toggle\('disabled',!racing\)/);
 assert.match(ui,/touchHealth\.sample\(performance\.now\(\)\)/);
 assert.match(ui,/phoneInput:touchHealth\.snapshot\(\)/);
 assert.doesNotMatch(ui,/race-control-mode/);
});
