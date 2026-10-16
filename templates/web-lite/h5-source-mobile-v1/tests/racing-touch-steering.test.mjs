import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { RacingJoystick } from '../racing/joystick.mjs';

test('one analogue steering thumb can immediately countersteer without second key',()=>{
  const wheel=new RacingJoystick();
  wheel.press(1,70,100,50);
  assert.ok(wheel.snapshot()>.5);
  wheel.update(1,130);
  assert.ok(wheel.snapshot()<-.5);
  wheel.release(1);
  assert.equal(wheel.snapshot(),0);
});
test('unrelated second finger never overrides current steering',()=>{
  const wheel=new RacingJoystick();
  wheel.press(1,70,100,50);
  const holding=wheel.snapshot();
  assert.equal(wheel.press(2,130,100,50),false);
  assert.equal(wheel.update(2,110),false);
  assert.equal(wheel.snapshot(),holding);
  wheel.release(2);
  assert.equal(wheel.snapshot(),holding);
  wheel.release(1);
  assert.equal(wheel.snapshot(),0);
});
test('pointercancel or lost capture clears stick instead of producing stale turn',()=>{
  const wheel=new RacingJoystick();
  wheel.press(4,80,100,50);
  assert.ok(wheel.snapshot()>0);
  wheel.release(4); // pointercancel handler
  assert.equal(wheel.snapshot(),0);
  wheel.press(5,120,100,50);
  wheel.clear(); // pause, blur, orientation or reset
  assert.equal(wheel.snapshot(),0);
});
test('repeated alternating turns and sensitivity changes keep a single control',()=>{
  const wheel=new RacingJoystick();
  wheel.press(1,100,100,50);
  for(let i=0;i<30;i++) {
    wheel.update(1,i%2?65:135);
    assert.equal(Math.sign(wheel.snapshot()),i%2?1:-1);
  }
  wheel.setSensitivity('calm');
  wheel.update(1,100);
  assert.equal(wheel.snapshot(),0);
  wheel.release(1);
  assert.equal(wheel.snapshot(),0);
});
test('race mobile HUD isolates three-lap elimination warning from the live speed badge',async()=>{
  const ui=await readFile(new URL('../racing/mobile.mjs',import.meta.url),'utf8');
  const css=await readFile(new URL('../racing/mobile.css',import.meta.url),'utf8');
  assert.match(ui,/root\.dataset\.stageKind = career\.stage\.kind/);
  assert.match(css,/#race-kit\[data-stage-kind="elimination"\] #race-speed/);
  assert.match(ui,/joystickSurface\.addEventListener\('pointercancel', endStick\)/);
  assert.match(ui,/joystickSurface\.addEventListener\('lostpointercapture', endStick\)/);
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
