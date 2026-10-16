/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ManualRaceDriver, TouchActions } from '../racing/driver.mjs';

const car = (patch = {}) => ({
  s: 32, h: 0, d: 0, hint: 0, spin: 0, slowTime: 0,
  airborne: false, impact: 0, wrongWay: 0, drifting: false,
  smallWindow: 0, finished: false, proj: { hd: 0 }, ...patch
});
const road = { hd: [0] };
const create = () => {const actions=new TouchActions();return { actions, driver:new ManualRaceDriver(actions) };};

test('only explicit player drift press starts drift; automatic throttle continues', () => {
  const {actions,driver}=create(),p=car();
  for(let i=0;i<100;i++){
    const input=driver.frame({steerAxis:.85},p,'race');
    assert.equal(input.up,true);
    assert.equal(input.shift,false,'turning alone may not start any automatic drift');
    assert.equal(input.wPressed,false);
    assert.equal(input.nitroPressed,false);
  }
  actions.press(1,'drift');
  assert.equal(driver.frame({steerAxis:.85},p,'race').shift,true);
  actions.release(1);
  assert.equal(driver.frame({steerAxis:.85},p,'race').shift,false);
});

test('joystick value is preserved as continuous native steering across immediate countersteer',()=>{
  const {driver}=create(),p=car();
  for(const axis of [.04,.25,.62,1,.16,0,-.12,-.47,-1]){
    const input=driver.frame({steerAxis:axis},p,'race');
    assert.equal(input.steerAxis,axis);
    assert.equal(input.left,axis>.12);
    assert.equal(input.right,axis<-.12);
  }
});

test('pause, countdown and finished state cannot propel the player or replay old actions',()=>{
  const {actions,driver}=create(),p=car();
  actions.press(2,'drift');actions.press(3,'nitro');
  for(const state of ['menu','countdown','paused','finished']){
    const input=driver.frame({steerAxis:1},p,state);
    assert.equal(input.up,false);
    assert.equal(input.shift,false);
    assert.equal(input.nitroPressed,false);
  }
  assert.equal(driver.frame({steerAxis:0},p,'race').nitroPressed,false);
  assert.equal(driver.frame({steerAxis:0},car({finished:true}),'race').up,false);
});

test('automatic starting acceleration edge happens once per car and only with a physics step',()=>{
  const {driver}=create(),p=car();
  assert.equal(driver.frame({steerAxis:0},p,'race',{canStep:false}).upPressed,false);
  assert.equal(driver.frame({steerAxis:0},p,'race',{canStep:true}).upPressed,true);
  for(let i=0;i<60;i++)assert.equal(driver.frame({steerAxis:0},p,'race').upPressed,false);
  assert.equal(driver.frame({steerAxis:0},car(),'race').upPressed,true);
});

test('tap survives a frame without physics, is consumed once and cannot repeat',()=>{
  const {actions,driver}=create(),p=car();
  actions.press(4,'nitro',1);actions.release(4);
  assert.equal(driver.frame({},p,'race',{canStep:false,now:1.03}).nitroPressed,false);
  assert.equal(driver.frame({},p,'race',{canStep:true,now:1.06}).nitroPressed,true);
  assert.equal(driver.frame({},p,'race',{canStep:true,now:1.07}).nitroPressed,false);
});

test('item race has manual item and independent earned nitro edges, never auto-items',()=>{
  const {actions,driver}=create(),p=car();
  for(let i=0;i<50;i++)assert.equal(driver.frame({},p,'race',{itemMode:true}).nitroPressed,false);
  actions.press(5,'item');actions.release(5);
  actions.press(6,'nitro');actions.release(6);
  const input=driver.frame({},p,'race',{itemMode:true});
  assert.equal(input.nitroPressed,true);
  assert.equal(input.manualNitroPressed,true);
  assert.equal(driver.frame({},p,'race',{itemMode:true}).nitroPressed,false);
  assert.equal(driver.frame({},p,'race',{itemMode:true}).manualNitroPressed,false);
});

test('abort pointer cancels pending spray or nitro; blur-style clear removes every hold',()=>{
  const {actions,driver}=create(),p=car();
  actions.press(10,'small');actions.cancel(10);
  actions.press(11,'nitro');actions.cancel(11);
  assert.equal(driver.frame({},p,'race').wPressed,false);
  assert.equal(driver.frame({},p,'race').nitroPressed,false);
  actions.press(12,'drift');actions.clear();
  assert.equal(driver.frame({},p,'race').shift,false);
});

test('pre-exit spray buffer is bounded, no free small boost outside a real native window',()=>{
  const {actions,driver}=create(),p=car({drifting:true,smallWindow:0});
  actions.press(9,'small',5);actions.release(9);
  assert.equal(driver.frame({steerAxis:.7},p,'race',{now:5.08}).wPressed,false);
  p.drifting=false;p.smallWindow=.45;
  assert.equal(driver.frame({steerAxis:0},p,'race',{now:5.15}).wPressed,true);
  assert.equal(driver.frame({steerAxis:0},p,'race',{now:5.17}).wPressed,false);
  actions.press(13,'small',6);actions.release(13);
  assert.equal(driver.frame({steerAxis:0},p,'race',{now:6.4}).wPressed,false);
});

test('wrong-way full speed uses native slowdown, without steering for the player',()=>{
  const {driver}=create(),p=car({h:Math.PI,s:44,wrongWay:1.5});
  const before=structuredClone(p);
  const input=driver.frame({steerAxis:-1},p,'race',{track:road});
  assert.equal(input.up,false);
  assert.equal(input.down,true);
  assert.equal(input.steerAxis,-1);
  assert.equal(input.right,true);
  assert.deepEqual(p,before,'driver never mutates car geometry, yaw, position or velocity');
  p.h=0;p.wrongWay=0;
  assert.equal(driver.frame({steerAxis:0},p,'race',{track:road}).up,true);
});

test('input layer exports no old automatic steering class or binary key controller',async()=>{
  const module=await import('../racing/driver.mjs');
  assert.equal('RaceDriver' in module,false);
  assert.equal('TouchSteering' in module,false);
  assert.equal(typeof module.ManualRaceDriver,'function');
});
