/* global URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  selectInternalRaceController,createInternalRaceController,
  RaceQAArrowSteering,RaceQAWheelSteering,INTERNAL_RACE_CONTROL_LABELS
} from '../racing/control-lab.mjs';
import {RacingJoystick} from '../racing/joystick.mjs';
import {ManualRaceDriver,TouchActions} from '../racing/driver.mjs';

test('QA controller is inaccessible without an explicit allowed host AND allowlisted query',()=>{
  assert.equal(selectInternalRaceController({hostname:'example.com',search:'?racing_qa_control=arrows'}),null);
  assert.equal(selectInternalRaceController({hostname:'localhost',search:''}),null);
  assert.equal(selectInternalRaceController({hostname:'localhost',search:'?racing_qa_control=debug'}),null);
  assert.equal(selectInternalRaceController({hostname:'raw.githack.com',search:'?racing_qa_control=wheel'}),'wheel');
  assert.equal(selectInternalRaceController({hostname:'127.0.0.1',search:'?racing_qa_control=arrows'}),'arrows');
  assert.equal(selectInternalRaceController({hostname:'raw.githack.com',search:'?racing_qa_control=float'}),'float');
  assert.equal(Object.keys(INTERNAL_RACE_CONTROL_LABELS).length,3);
  assert.throws(()=>createInternalRaceController('auto'),/Unknown internal/);
});

test('QA floating controller is exactly the existing production mobile thumb mapping',()=>{
  const baseline=new RacingJoystick({floating:true,rimTap:true,deadzone:.055,fullThrow:.58});
  const qa=createInternalRaceController('float');
  const series=[{type:'press',x:121},{type:'update',x:102},{type:'update',x:162},{type:'update',x:190}];
  for (const item of series) {
    if (item.type==='press') {baseline.press(1,item.x,140,64);qa.press(1,item.x,140,64);}
    else {baseline.update(1,item.x);qa.update(1,item.x);}
    assert.equal(qa.snapshot(),baseline.snapshot());
    assert.equal(qa.knobX,baseline.knobX);
    assert.equal(qa.anchorX,baseline.anchorX);
  }
  baseline.release(1);qa.release(1);
  assert.equal(qa.snapshot(),baseline.snapshot());
});

test('arrows prototype responds immediately in each half, reverses, and never steals another pointer',()=>{
  const c=createInternalRaceController('arrows');
  assert.ok(c instanceof RaceQAArrowSteering);
  assert.equal(c.press(5,62,100,50),true);
  assert.equal(c.snapshot(),1);
  assert.equal(c.press(6,140,100,50),false);
  assert.equal(c.update(6,140),false);
  assert.equal(c.snapshot(),1);
  assert.equal(c.update(5,138),true);
  assert.equal(c.snapshot(),-1);
  assert.equal(c.update(5,100),true);
  assert.equal(c.snapshot(),0);
  assert.equal(c.release(6),false);
  assert.equal(c.release(5),true);
  assert.equal(c.snapshot(),0);
  c.press(7,138,100,50);
  assert.equal(c.snapshot(),-1);
});

test('angular wheel responds to rotary motion rather than horizontal slider displacement',()=>{
  const c=createInternalRaceController('wheel');
  assert.ok(c instanceof RaceQAWheelSteering);
  assert.equal(c.press(1,100,100,60,58,100),true);
  assert.equal(c.snapshot(),0,'touch on upper rim starts neutral');
  assert.equal(c.update(1,70,70),true);
  assert.ok(c.snapshot()>.6 && c.visualDegrees<0,'counterclockwise thumb motion turns car left');
  assert.equal(c.update(1,130,70),true);
  assert.ok(c.snapshot()<-.6 && c.visualDegrees>0,'clockwise countersteer turns car right');
  assert.equal(c.update(9,70,70),false,'right-hand drift cannot steal wheel pointer');
  assert.equal(c.release(1),true);
  assert.equal(c.snapshot(),0);
  assert.equal(c.visualDegrees,0);
});

test('wheel passes through centre without phantom 180-degree turn or stuck steering',()=>{
  const c=new RaceQAWheelSteering();
  c.press(3,100,100,65,45,100);
  c.update(3,61,61);
  const before=c.snapshot();assert.ok(before>.45);
  c.update(3,101,101);
  assert.equal(c.snapshot(),before,'crossing hub does not inject a sudden 180 degree reversal');
  c.update(3,139,61);
  assert.equal(c.snapshot(),before,'reentering rim resets angular reference before next turn');
  c.update(3,100,45);
  assert.ok(c.snapshot()>before,'real counterclockwise rotation works after reentry');
  c.release(3);assert.equal(c.snapshot(),0);
});

test('all QA controllers affect only real signed steering; no hidden throttle, auto-drift or physics replacement',()=>{
  for(const mode of ['arrows','wheel','float']) {
    const c=createInternalRaceController(mode), p={s:30,spin:0,wrongWay:0,finished:false};
    const driver=new ManualRaceDriver(new TouchActions());
    let axis;
    if(mode==='wheel') {c.press(1,100,100,60,58,100);c.update(1,70,70);}
    else if(mode==='float') {c.press(1,65,100,60);c.update(1,48);}
    else c.press(1,70,100,60);
    axis=c.snapshot();
    assert.ok(axis>.2,mode+' must produce a real left steer');
    const controls=driver.frame({steerAxis:axis},p,'race',{now:1});
    assert.equal(controls.steerAxis,axis);
    assert.equal(controls.left,true);
    assert.equal(controls.right,false);
    assert.equal(controls.shift,false);
    assert.equal(controls.up,true,'original auto-throttle unchanged');
    assert.equal(controls.down,false);
    assert.equal(controls.wPressed,false);
    assert.equal(controls.nitroPressed,false);
    c.release(1);assert.equal(c.snapshot(),0);
  }
});

test('lab is URL-gated in the full real-game runtime without a production mode picker',async()=>{
  const ui=await readFile(new URL('../racing/mobile.mjs',import.meta.url),'utf8');
  assert.match(ui,/selectInternalRaceController\(window\.location\)/);
  assert.match(ui,/qaControlMode \? createInternalRaceController\(qaControlMode\) :/);
  assert.match(ui,/driver\.frame\(raw,g\.player,g\.state/);
  assert.match(ui,/phoneInput: touchHealth\.snapshot\(\)/);
  assert.doesNotMatch(ui,/id="race-control-mode"|data-race-direction/);
  assert.match(ui,/qaControlMode \? \{qaControlLab:/);
  const css=await readFile(new URL('../racing/mobile.css',import.meta.url),'utf8');
  for(const mode of ['wheel','arrows'])assert.ok(css.includes('data-qa-control="'+mode+'"'));
});
