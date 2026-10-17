import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { RacingJoystick } from '../racing/joystick.mjs';
import { ManualRaceDriver, TouchActions } from '../racing/driver.mjs';
import { patchAnalogSteer, patchDriftRearm, patchCounterSteer, patchItemModeNitro, patchManualNitroEdge, RACING_OWNED_NAMES } from '../../../../tools/lean-pilot/racing-mobile-build.mjs';

const sample = () => ({finished:false,s:35,spin:0,wrongWay:0,airborne:false,h:0,hint:0,proj:{hd:0}});
test('fixed wheel: real analogue angle, small corrections, direction reversal and centre release', () => {
  const j=new RacingJoystick();
  assert.equal(j.press(7,300,300,60),true);
  assert.equal(j.snapshot(),0);
  assert.equal(j.update(7,296),true);
  assert.equal(j.snapshot(),0,'deadzone ignores thumb tremor');
  j.update(7,278);
  assert.ok(j.snapshot()>0 && j.snapshot()<1,'gentle left differs from full-left');
  j.update(7,240);
  assert.equal(j.snapshot(),1,'long left pulls full native steering');
  j.update(7,360);
  assert.equal(j.snapshot(),-1,'immediately recover right from left');
  j.update(7,300);
  assert.equal(j.snapshot(),0,'neutral releases intent while still held');
  assert.equal(j.release(7),true);
  assert.equal(j.snapshot(),0);
  assert.equal(j.active,false);
});
test('touch wheel has shorter throw but preserves neutral/no tremor and countersteer', () => {
  const j = new RacingJoystick();
  assert.equal(j.deadzone,.075);
  assert.equal(j.fullThrow,.66);
  j.press(90,200,200,70);
  j.update(90,196);
  assert.equal(j.snapshot(),0,'tiny finger jitter is not steering');
  j.update(90,177);
  assert.ok(j.snapshot()>0&&j.snapshot()<1);
  j.update(90,153);
  assert.equal(j.snapshot(),1,'firm thumb displacement reaches full lock');
  assert.ok(j.knobX > 35,'visual steering knob reaches full throw as car input saturates');
  j.update(90,247);
  assert.equal(j.snapshot(),-1,'no artificial intermediate direction lock on countersteer');
  j.release(90);
  assert.equal(j.snapshot(),0);
});

test('second finger cannot steal joystick; unrelated pointercancel cannot clear control', () => {
  const j=new RacingJoystick();
  j.press(1,95,100,50);
  assert.equal(j.press(2,200,100,50),false);
  assert.equal(j.update(2,180),false);
  assert.equal(j.release(2),false);
  assert.ok(j.active);
  assert.equal(j.release(1),true);
  assert.equal(j.snapshot(),0);
  j.press(3,100,100,50);j.update(3,55);
  j.clear();
  assert.equal(j.snapshot(),0,'blur, orientation and pause release all joystick intent');
});
test('wheel sensitivity adjustment changes partial turn but not neutral; ignores vertical motion', () => {
  const j=new RacingJoystick();
  j.press(5,100,100,55);
  j.update(5,77);
  const normal=j.snapshot();
  j.setSensitivity('calm');
  const calm=j.snapshot();
  j.setSensitivity('sharp');
  const sharp=j.snapshot();
  assert.ok(calm < normal && normal < sharp);
  j.update(5,100);
  assert.equal(j.snapshot(),0);
  j.setSensitivity('not-a-mode');
  assert.equal(j.sensitivity,'normal');
});
test('manual driver passes real analogue steering and uses native wrong-way brake at speed', () => {
  const j=new RacingJoystick(),a=new TouchActions(),d=new ManualRaceDriver(a);
  j.press(8,120,120,60);j.update(8,97);
  const p=sample(),road={hd:[0]};
  const partial=d.frame({steerAxis:j.snapshot()},p,'race',{track:road});
  assert.equal(partial.steerAxis,j.snapshot());
  assert.equal(partial.left,true);
  assert.equal(partial.right,false);
  assert.equal(partial.up,true);
  p.h=Math.PI;p.wrongWay=1;p.s=40;
  const rescue=d.frame({steerAxis:-1},p,'race',{track:road});
  assert.equal(rescue.right,true);
  assert.equal(rescue.down,true);
  assert.equal(rescue.up,false);
  assert.equal(p.h,Math.PI,'input layer cannot teleport or secretly turn the car');
});
test('generated native engine consumes analogue fraction and normalizes drift direction', () => {
  const pinned=[
    'const steerT = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);',
    'if (!this.drifting && inp.shift && steerT !== 0 && this.s > T.driftMinSpeed && onGround && !spinning) {',
    'this.driftDir = steerT;',
  ].join('\n');
  const out=patchAnalogSteer(pinned);
  assert.match(out,/Number\.isFinite\(inp\.steerAxis\)/);
  assert.match(out,/Math\.sign\(steerT\)/);
  assert.match(out,/Math\.abs\(steerT\) >= 0\.28/);
  assert.equal(patchAnalogSteer(out),out);
  assert.throws(()=>patchAnalogSteer('unknown'),/anchor changed/);
});
test('countersteer yaw is actually negative against held left drift, and centre does not keep drift key held', () => {
  const native=[
    'const yaw = held ? T.driftYaw + T.driftYawAlign * align : (0.45 + 0.9 * align) * Math.exp(-2.2 * this.releaseTime);',
    'const held = inp.shift;',
    'if ((!held && (Math.abs(a) < 0.1 || (align < 0 && Math.abs(a) < 0.26))) || this.s < 7) this.endDrift(this.s >= 7);',
    'this.h += this.driftDir * yaw;',
  ].join('\n');
  const result=patchCounterSteer(native);
  const line=result.split('\n').find(s=>s.startsWith('const yaw ='));
  const formula=line.slice('const yaw = '.length,-1);
  const evaluate=new Function('held','align','T','releaseTime', 'return '+formula.replaceAll('this.releaseTime','releaseTime'));
  const tuning={driftYaw:1.5,driftYawAlign:.85};
  assert.ok(evaluate(true,1,tuning,0)>0);
  assert.ok(evaluate(true,-1,tuning,0)<0);
  assert.ok(evaluate(false,-1,tuning,0)<0);
  assert.match(result,/Math\.abs\(steerT\) > 0\.12/);
  assert.match(result,/this\.driftTime >= 0\.22/);
  assert.equal(patchCounterSteer(result),result);
});
test('earned boost and item remain independent in item races; first physics step is the only edge', () => {
  const raw='if (inp.nitroPressed && !itemMode) this.triggerNitro();\nif (!itemMode && onGround) {';
  const result=patchItemModeNitro(raw);
  assert.match(result,/inp.manualNitroPressed && itemMode/);
  assert.match(result,/if \(onGround\)/);
  const loop=patchManualNitroEdge('const noEdge = { ...pin, upPressed: false, wPressed: false, nitroPressed: false };');
  assert.match(loop,/manualNitroPressed: false/);
  const a=new TouchActions(),d=new ManualRaceDriver(a),p=sample();
  a.press(1,'item');a.release(1);a.press(2,'nitro');a.release(2);
  const edges=d.frame({},p,'race',{itemMode:true});
  assert.equal(edges.nitroPressed,true);
  assert.equal(edges.manualNitroPressed,true);
  assert.equal(d.frame({},p,'race',{itemMode:true}).nitroPressed,false);
});
test('build fingerprints joystick and UI binds captured pointer without retaining it across pauses',async()=>{
  assert.ok(RACING_OWNED_NAMES.includes('joystick.mjs'));
  const ui=await readFile(new URL('../racing/mobile.mjs',import.meta.url),'utf8');
  const css=await readFile(new URL('../racing/mobile.css',import.meta.url),'utf8');
  assert.match(ui,/joystickSurface\.setPointerCapture\(e\.pointerId\)/);
  assert.match(ui,/joystick\.snapshot\(\)/);
  assert.match(ui,/joystick\.clear\(\)/);
  assert.match(ui,/driver\.frame\(raw,g\.player,g\.state/);
  assert.doesNotMatch(ui,/race-control-mode|data-race-direction|\bid="race-left"|\bid="race-right"|controlMode|career\.itemInput\(g/);
  assert.match(ui,/document\.getElementById\('gaugebox'\)\?\.classList\.remove\('hidden'\)/);
  assert.match(css,/#race-joystick\.held #race-stick-knob \{transition:none/);
  assert.match(css,/#race-joystick \{\s*display:block;/);
  assert.doesNotMatch(css,/data-control-mode|#race-left|#race-right/);
});

// Real game time controls a deliberately small pre-exit tap buffer; player must
// still perform a true valid drift to create the native spray window.
test('manual small-spray tap survives a brief pre-exit drift frame and never repeats',()=>{
  const actions=new TouchActions(),driver=new ManualRaceDriver(actions);
  const p={...sample(),drifting:true,smallWindow:0};
  actions.press(10,'small',1);
  actions.release(10);
  const early=driver.frame({steerAxis:.5},p,'race',{now:1.08});
  assert.equal(early.wPressed,false);
  p.drifting=false;p.smallWindow=.46;
  const exit=driver.frame({steerAxis:0},p,'race',{now:1.15});
  assert.equal(exit.wPressed,true);
  assert.equal(driver.frame({},p,'race',{now:1.17}).wPressed,false);
});
test('very early small-spray tap expires and does not create a bonus after drift',()=>{
  const actions=new TouchActions(),driver=new ManualRaceDriver(actions);
  const p={...sample(),drifting:true,smallWindow:0};
  actions.press(11,'small',2);actions.release(11);
  assert.equal(driver.frame({},p,'race',{now:2.31}).wPressed,false);
  p.drifting=false;p.smallWindow=.5;
  assert.equal(driver.frame({},p,'race',{now:2.32}).wPressed,false);
});

test('a held drift cannot automatically re-enter after countersteer exit or wall contact',()=>{
  const pinned='endDrift(clean = true) {\n    if (!this.drifting) return;\n    this.drifting = false;';
  const updated=patchDriftRearm(pinned);
  assert.match(updated,/this\.__RACE_DRIFT_REARMED__ = false/);
  assert.equal(patchDriftRearm(updated),updated);
  assert.throws(()=>patchDriftRearm('broken end drift method'),/anchor changed/);
  const start=[
    'const steerT = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);',
    'if (!this.drifting && inp.shift && steerT !== 0 && this.s > T.driftMinSpeed && onGround && !spinning) {',
    'this.driftDir = steerT;',
  ].join('\n');
  const adapted=patchAnalogSteer(start);
  assert.match(adapted,/if \(!inp\.shift && !spinning\) this\.__RACE_DRIFT_REARMED__ = true/);
  assert.match(adapted,/this\.__RACE_DRIFT_REARMED__ !== false/);
  assert.equal(patchAnalogSteer(adapted),adapted);
});
