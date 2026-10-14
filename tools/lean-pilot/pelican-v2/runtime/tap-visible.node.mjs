import assert from 'node:assert/strict';
import test from 'node:test';
const {tapVisible}=await import('../touch.mjs');

function rect(x,y,width,height){return {x,y,left:x,top:y,right:x+width,bottom:y+height,width,height};}
function containsRect(r,x,y){return x>=r.left&&x<r.right&&y>=r.top&&y<r.bottom;}

function pageHarness({
 visible=true,
 boundingBox={x:12.25,y:18.5,width:31.5,height:13.25},
 waitError=null,
 hideAfterWait=false,
 disabled=false,
 domDisabled=false,
 clipped=false,
 occluded=false,
 scrollable=true,
 menuTarget=false,
 pointerType='touch',
 trusted=true,
 tapError=null
}={}){
 const calls=[];
 const viewport={width:390,height:844};
 const targetRect=boundingBox?{x:boundingBox.x,y:boundingBox.y,width:boundingBox.width,height:boundingBox.height}:null;
 const scrollerRect=rect(20,100,180,200);
 const scenario={
  visible,currentlyVisible:visible,hideAfterWait,disabled,domDisabled,clipped,occluded,scrollable,menuTarget,pointerType,trusted,tapError,
  scrollTop:0,maxScroll:600,targetRect,activeStart:null,lastMove:null,hitChecks:0
 };
 const scroller={
  parentElement:null,
  clientTop:0,clientLeft:0,clientWidth:180,clientHeight:200,scrollHeight:scrollable?800:200,scrollWidth:180,
  get scrollTop(){return scenario.scrollTop;},
  getBoundingClientRect(){return scrollerRect;},
  contains(node){for(let current=node;current;current=current.parentElement)if(current===this)return true;return false;}
 };
 const doc={
  documentElement:{clientWidth:viewport.width,clientHeight:viewport.height},
  defaultView:{innerWidth:viewport.width,innerHeight:viewport.height,getComputedStyle(node){
   return {overflowX:'visible',overflowY:node===scroller?'auto':'visible',display:'block',visibility:node===target&&!scenario.currentlyVisible?'hidden':'visible'};
  }},
  elementFromPoint(x,y){
   scenario.hitChecks++;
   if(x<0||y<0||x>=viewport.width||y>=viewport.height)return null;
   if(scenario.occluded&&scenario.targetRect&&containsRect(rect(scenario.targetRect.x,scenario.targetRect.y,scenario.targetRect.width,scenario.targetRect.height),x,y))return {parentElement:null,kind:'overlay'};
   if(scenario.targetRect&&containsRect(rect(scenario.targetRect.x,scenario.targetRect.y,scenario.targetRect.width,scenario.targetRect.height),x,y)&&(!target.parentElement||containsRect(scrollerRect,x,y)))return target;
   return containsRect(scrollerRect,x,y)?scroller:null;
  }
 };
 const target={
  ownerDocument:doc,parentElement:scrollable||clipped?scroller:null,disabled:domDisabled,isConnected:true,
  getAttribute(name){return name==='aria-disabled'&&this.ariaDisabled?'true':null;},
  matches(selector){return selector===':disabled'?this.disabled:selector==='[data-level]'&&scenario.menuTarget;},
  closest(selector){return this.matches(selector)?this:null;},
  pointerListeners:[],
  addEventListener(type,listener,options){if(type==='pointerdown')this.pointerListeners.push({listener,options});},
  removeEventListener(type,listener){if(type==='pointerdown')this.pointerListeners=this.pointerListeners.filter(item=>item.listener!==listener);},
  ariaDisabled:false,
  getBoundingClientRect(){return targetRect?rect(targetRect.x,targetRect.y,targetRect.width,targetRect.height):rect(0,0,0,0);},
  contains(node){for(let current=node;current;current=current.parentElement)if(current===this)return true;return false;}
 };
 const locator={
  async waitFor(options){calls.push(['waitFor',options]);if(waitError)throw waitError;if(hideAfterWait)scenario.currentlyVisible=false;},
  async isVisible(){calls.push(['isVisible']);return scenario.currentlyVisible;},
  async isEnabled(){calls.push(['isEnabled']);return !scenario.disabled;},
  async boundingBox(){calls.push(['boundingBox']);return scenario.targetRect?{...scenario.targetRect}:null;},
  async evaluate(fn,arg){calls.push(['evaluate',arg]);return fn(target,arg);},
  async tap(options){
   calls.push(['locator.tap',options]);
   if(scenario.tapError)throw scenario.tapError;
   if(!scenario.targetRect)throw Error('target missing');
   if(scenario.scrollable){scenario.scrollTop=150;scenario.targetRect.y=180;}
   const event={clientX:scenario.targetRect.x+scenario.targetRect.width/2,clientY:scenario.targetRect.y+scenario.targetRect.height/2,pointerType:scenario.pointerType,isTrusted:scenario.trusted};
   for(const item of [...target.pointerListeners])item.listener(event);
  },
  async dispatchEvent(){throw Error('DOM dispatch is forbidden');}
 };
 const session={async send(method,payload){
  calls.push(['protocol',method,payload]);
  if(method!=='Input.dispatchTouchEvent')return;
  if(payload.type==='touchStart')scenario.activeStart=payload.touchPoints[0];
  if(payload.type==='touchMove')scenario.lastMove=payload.touchPoints[0];
  if(payload.type==='touchEnd'&&scenario.activeStart&&scenario.lastMove&&scenario.scrollable){
   const scrollDelta=scenario.activeStart.y-scenario.lastMove.y;
   const next=Math.max(0,Math.min(scenario.maxScroll,scenario.scrollTop+scrollDelta));
   const applied=next-scenario.scrollTop;
   scenario.scrollTop=next;
   if(scenario.targetRect)scenario.targetRect.y-=applied;
   scenario.activeStart=null;scenario.lastMove=null;
  }
 }};
 const context={
  browser(){return {browserType(){return {name(){calls.push(['browserType.name']);return 'chromium';}};}};},
  async newCDPSession(){calls.push(['newCDPSession']);return session;}
 };
 const page={
  locator(selector){calls.push(['locator',selector]);return locator;},
  context(){return context;},
  viewportSize(){calls.push(['viewportSize']);return viewport;},
  touchscreen:{async tap(x,y){calls.push(['touchscreen.tap',x,y]);}},
  async waitForTimeout(ms){calls.push(['waitForTimeout',ms]);}
 };
 return {page,calls,scenario};
}

test('touch.mjs exports the public tapVisible(page, selector) helper',()=>{
 assert.equal(typeof tapVisible,'function');
});

const requiresTapVisible={skip:typeof tapVisible!=='function'};

test('a missing control never sends a touch',requiresTapVisible,async()=>{
 const {page,calls}=pageHarness({waitError:Error('locator wait timeout')});
 await assert.rejects(tapVisible(page,'#missing'),/locator wait timeout/);
 assert.equal(calls.some(call=>call[0]==='touchscreen.tap'||call[0]==='protocol'),false);
});

test('a control hidden after the visibility wait never sends a touch',requiresTapVisible,async()=>{
 const {page,calls}=pageHarness({hideAfterWait:true});
 await assert.rejects(tapVisible(page,'#hidden'),/hidden|visible/i);
 assert.equal(calls.some(call=>call[0]==='touchscreen.tap'||call[0]==='protocol'),false);
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
   await assert.rejects(tapVisible(page,'#target'),/bounding box|viewport|visible/i);
   assert.equal(calls.some(call=>call[0]==='touchscreen.tap'),false);
  });
 }
});

test('a visible control is tapped at its exact real bounding-box center through the public touchscreen API',requiresTapVisible,async()=>{
 const {page,calls}=pageHarness({boundingBox:{x:10.1,y:20.2,width:31.3,height:11.5},scrollable:false});
 await tapVisible(page,'#target');
 assert.deepEqual(calls.find(call=>call[0]==='touchscreen.tap'),['touchscreen.tap',25.75,25.95]);
 assert.deepEqual(calls.filter(call=>call[0]==='waitFor'),[['waitFor',{state:'visible'}]]);
 assert.equal(calls.filter(call=>call[0]==='evaluate').length,1,'geometry, visibility, disabled state and hit target must share one DOM observation');
 assert.equal(calls.some(call=>['isVisible','isEnabled','boundingBox','viewportSize'].includes(call[0])),false,'the tap path must not make separate browser reads');
 assert.equal(calls.indexOf(calls.find(call=>call[0]==='touchscreen.tap')),calls.map(call=>call[0]).lastIndexOf('evaluate')+1,'no browser read may occur between hit observation and touch');
 assert.equal(calls.some(call=>call[0]==='locator.tap'),false);
 assert.ok(calls.some(call=>call[0]==='evaluate'),'the real target must be inspected in the DOM');
});

test('a CSS-visible route card uses public locator actionability auto-scroll and reports its trusted touch point',requiresTapVisible,async()=>{
 const {page,calls,scenario}=pageHarness({boundingBox:{x:50.25,y:330.5,width:80.5,height:32.25},clipped:true,menuTarget:true});
 const result=await tapVisible(page,'[data-level="1"]');
 const tapCall=calls.find(call=>call[0]==='locator.tap');
 assert.deepEqual(tapCall,['locator.tap',{timeout:2500}]);
 assert.equal(calls.some(call=>call[0]==='protocol'),false,'the clipped menu path must not claim the ineffective WebKit protocol swipe');
 assert.equal(calls.some(call=>call[0]==='touchscreen.tap'),false);
 assert.ok(scenario.scrollTop>0,'the public actionability path should reveal the clipped card');
 assert.ok(scenario.hitChecks>=1,'the actual pointerdown point is checked with elementFromPoint');
 assert.equal(result.x,90.5);
 assert.equal(result.y,scenario.targetRect.y+scenario.targetRect.height/2);
 assert.equal(result.pointerType,'touch');
 assert.equal(result.isTrusted,true);
 assert.equal(result.scrollMechanism,'playwright-locator-actionability-auto-scroll');
 assert.deepEqual(result.pointerdown,{clientX:result.x,clientY:result.y,pointerType:'touch',isTrusted:true,hitTarget:true});
 assert.deepEqual(result.scrollEvidence,[{mechanism:result.scrollMechanism,scrollTopBefore:0,scrollTopAfter:150,pointerdown:result.pointerdown}]);
 assert.equal(Object.hasOwn(tapCall[1],'force'),false);
 assert.equal(calls.at(-1)[0],'evaluate','captured pointer evidence is read and cleared after the public tap');
});

test('an occluded target fails closed without trying to swipe or tap',requiresTapVisible,async()=>{
 const {page,calls}=pageHarness({boundingBox:{x:40,y:140,width:60,height:30},occluded:true});
 await assert.rejects(tapVisible(page,'#occluded'),/hit|occluded|visible/i);
 assert.equal(calls.some(call=>call[0]==='protocol'),false);
 assert.equal(calls.some(call=>call[0]==='touchscreen.tap'),false);
});

test('a disabled target fails closed before any touch',requiresTapVisible,async()=>{
 const {page,calls}=pageHarness({boundingBox:{x:40,y:140,width:60,height:30},domDisabled:true});
 await assert.rejects(tapVisible(page,'#disabled'),/disabled|enabled/i);
 assert.equal(calls.some(call=>call[0]==='protocol'),false);
 assert.equal(calls.some(call=>call[0]==='touchscreen.tap'),false);
});

test('a target clipped by a non-scrollable ancestor fails closed',requiresTapVisible,async()=>{
 const {page,calls}=pageHarness({boundingBox:{x:50,y:330,width:60,height:30},clipped:true,scrollable:false,menuTarget:true});
 await assert.rejects(tapVisible(page,'#unscrollable'),/scroll|clip|visible|hit/i);
 assert.equal(calls.some(call=>call[0]==='protocol'),false);
 assert.equal(calls.some(call=>call[0]==='locator.tap'),false);
 assert.equal(calls.some(call=>call[0]==='touchscreen.tap'),false);
});

test('a clipped non-menu control never enters the menu auto-scroll exception',requiresTapVisible,async()=>{
 const {page,calls}=pageHarness({boundingBox:{x:50,y:330,width:60,height:30},clipped:true,scrollable:true,menuTarget:false});
 await assert.rejects(tapVisible(page,'#game-control'),/clipped|hit target/i);
 assert.equal(calls.some(call=>call[0]==='locator.tap'),false);
 assert.equal(calls.some(call=>call[0]==='touchscreen.tap'),false);
});

test('clipped-menu actionability wait is bounded and never uses force',requiresTapVisible,async()=>{
 const {page,calls}=pageHarness({boundingBox:{x:50,y:2000,width:60,height:30},clipped:true,menuTarget:true,tapError:Error('actionability timeout')});
 await assert.rejects(tapVisible(page,'#far-away'),/actionability timeout/i);
 const tapCall=calls.find(call=>call[0]==='locator.tap');
 assert.deepEqual(tapCall,['locator.tap',{timeout:2500}]);
 assert.equal(Object.hasOwn(tapCall[1],'force'),false);
 assert.equal(calls.some(call=>call[0]==='touchscreen.tap'),false);
});

test('clipped menu action is rejected when its captured pointerdown is untrusted',requiresTapVisible,async()=>{
 const {page,calls}=pageHarness({boundingBox:{x:50,y:330,width:60,height:30},clipped:true,menuTarget:true,trusted:false});
 await assert.rejects(tapVisible(page,'[data-level="1"]'),/trusted touch|pointerdown/i);
 assert.equal(calls.filter(call=>call[0]==='locator.tap').length,1);
 assert.equal(calls.some(call=>call[0]==='touchscreen.tap'),false);
});
