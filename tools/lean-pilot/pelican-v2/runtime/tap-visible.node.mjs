import assert from 'node:assert/strict';
import test from 'node:test';
const {tapVisible}=await import('../touch.mjs');

function pageHarness({visible=true,boundingBox={x:12.25,y:18.5,width:31.5,height:13.25},waitError=null,hideAfterWait=false}={}){
 const calls=[];let currentlyVisible=visible;
 const locator={
  async waitFor(options){calls.push(['waitFor',options]);if(waitError)throw waitError;if(hideAfterWait)currentlyVisible=false;},
  async isVisible(){calls.push(['isVisible']);return currentlyVisible;},
  async boundingBox(){calls.push(['boundingBox']);return boundingBox;},
  async tap(){throw Error('locator.tap is forbidden');},
  async dispatchEvent(){throw Error('DOM dispatch is forbidden');}
 };
 const page={
  locator(selector){calls.push(['locator',selector]);return locator;},
  viewportSize(){calls.push(['viewportSize']);return {width:390,height:844};},
  touchscreen:{async tap(x,y){calls.push(['touchscreen.tap',x,y]);}},
  async evaluate(){throw Error('DOM evaluation is forbidden');}
 };
 return {page,calls};
}

test('touch.mjs exports the public tapVisible(page, selector) helper',()=>{
 assert.equal(typeof tapVisible,'function');
});

const requiresTapVisible={skip:typeof tapVisible!=='function'};

test('a missing control never sends a touch',requiresTapVisible,async()=>{
 const {page,calls}=pageHarness({waitError:Error('locator wait timeout')});
 await assert.rejects(tapVisible(page,'#missing'),/locator wait timeout/);
 assert.equal(calls.some(call=>call[0]==='touchscreen.tap'),false);
});

test('a control hidden after the visibility wait never sends a touch',requiresTapVisible,async()=>{
 const {page,calls}=pageHarness({hideAfterWait:true});
 await assert.rejects(tapVisible(page,'#hidden'),/hidden|visible/i);
 assert.equal(calls.some(call=>call[0]==='touchscreen.tap'),false);
});

test('missing, degenerate, nonfinite, and offscreen bounds never send a touch',requiresTapVisible,async t=>{
 const cases=[
  ['missing bounds',null],
  ['zero width',{x:12,y:18,width:0,height:12}],
  ['zero height',{x:12,y:18,width:12,height:0}],
  ['nonfinite origin',{x:Infinity,y:18,width:12,height:12}],
  ['touch point outside viewport',{x:-40,y:18,width:10,height:10}]
 ];
 for(const [name,boundingBox] of cases){
  await t.test(name,async()=>{
   const {page,calls}=pageHarness({boundingBox});
   await assert.rejects(tapVisible(page,'#target'),/bounding box|viewport/i);
   assert.equal(calls.some(call=>call[0]==='touchscreen.tap'),false);
  });
 }
});

test('a visible control is tapped at its exact real bounding-box center through the public touchscreen API',requiresTapVisible,async()=>{
 const {page,calls}=pageHarness({boundingBox:{x:10.1,y:20.2,width:31.3,height:11.5}});
 await tapVisible(page,'#target');
 assert.deepEqual(calls.find(call=>call[0]==='touchscreen.tap'),['touchscreen.tap',25.75,25.95]);
 assert.deepEqual(calls.filter(call=>call[0]==='waitFor'),[['waitFor',{state:'visible'}]]);
 assert.equal(calls.some(call=>call[0]==='boundingBox'),true);
 assert.equal(calls.some(call=>call[0]==='locator.tap'),false);
 assert.equal(calls.some(call=>call[0]==='evaluate'),false);
});
