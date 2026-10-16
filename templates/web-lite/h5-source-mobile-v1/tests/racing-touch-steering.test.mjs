import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { TouchSteering } from '../racing/driver.mjs';

test('a new steering thumb wins immediately instead of both keys cancelling to straight',()=>{
  const touch=new TouchSteering();
  touch.press(1,'left',100);
  assert.deepEqual(touch.snapshot(110),{left:true,right:false});
  touch.press(2,'right',120);
  assert.deepEqual(touch.snapshot(125),{left:false,right:true});
  assert.equal(touch.activeDirection(),'right');
  touch.release(2,225);
  assert.deepEqual(touch.snapshot(226),{left:true,right:false});
  touch.release(1,240);
  assert.deepEqual(touch.snapshot(241),{left:false,right:false});
});
test('two fingers on the same key keep steering until the last one lifts',()=>{
  const touch=new TouchSteering();
  touch.press(1,'left',10);touch.press(2,'left',30);
  touch.release(1,120);
  assert.equal(touch.activeDirection(),'left');
  assert.deepEqual(touch.snapshot(121),{left:true,right:false});
  touch.release(2,140);
  assert.deepEqual(touch.snapshot(141),{left:false,right:false});
});
test('short tap is preserved after normal capture loss, but cancelled touch has no ghost pulse',()=>{
  const touch=new TouchSteering();
  touch.press(4,'left',0);touch.release(4,20);
  touch.cancel(4); // lostpointercapture follows pointerup
  assert.deepEqual(touch.snapshot(60),{left:true,right:false});
  assert.deepEqual(touch.snapshot(80),{left:false,right:false});
  touch.press(5,'right',100);touch.cancel(5); // pointercancel
  assert.deepEqual(touch.snapshot(110),{left:false,right:false});
});
test('cancelling one thumb does not discard the other, and new direction kills old tap pulse',()=>{
  const touch=new TouchSteering();
  touch.press(1,'left',100);touch.press(2,'right',110);
  touch.cancel(2);
  assert.deepEqual(touch.snapshot(115),{left:true,right:false});
  touch.release(1,120);
  assert.deepEqual(touch.snapshot(150),{left:true,right:false});
  touch.press(3,'right',151);
  assert.deepEqual(touch.snapshot(152),{left:false,right:true});
  touch.clear();
  assert.deepEqual(touch.snapshot(153),{left:false,right:false});
});
test('race mobile HUD isolates three-lap elimination warning from the live speed badge',async()=>{
  const ui=await readFile(new URL('../racing/mobile.mjs',import.meta.url),'utf8');
  const css=await readFile(new URL('../racing/mobile.css',import.meta.url),'utf8');
  assert.match(ui,/root\.dataset\.stageKind = career\.stage\.kind/);
  assert.match(css,/#race-kit\[data-stage-kind="elimination"\] #race-speed/);
  assert.match(ui,/button\.addEventListener\('pointercancel', cancel\)/);
  assert.match(ui,/button\.addEventListener\('lostpointercapture', cancel\)/);
});

test('mid-race overlays stay removed while HUD goals, safe controls and hit feedback remain',async()=>{
  const ui=await readFile(new URL('../racing/mobile.mjs',import.meta.url),'utf8');
  const css=await readFile(new URL('../racing/mobile.css',import.meta.url),'utf8');
  assert.doesNotMatch(ui,/race-road-hint|roadHint\(|feedback\(|碰撞减速/);
  assert.doesNotMatch(css,/race-road-hint|race-feedback/);
  assert.match(css,/#msgs \{ display:none!important; \}/);
  assert.match(ui,/career\.drainNotices\(\)/);
  assert.match(ui,/race-live-goal/);
  assert.match(ui,/race-controls/);
  assert.match(css,/#hitflash/);
});
