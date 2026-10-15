// Browser input protocols create trusted gameplay gestures. They do not drive
// native WebKit menu scrolling; clipped route cards use locator actionability.
// WebKit's gameplay swipe uses the pinned Playwright touch bridge because public
// Touchscreen exposes taps only. Protocol verified against Playwright v1.62.1.
const MENU_ACTION_TIMEOUT_MS=2500;
let pointerCaptureSequence=0;

export async function touchSession(page,engine){
 if(engine==='chromium')return page.context().newCDPSession(page);
 const impl=page._connection.toImpl(page);
 const session=impl?.delegate?.rawTouchscreen?._pageProxySession;
 if(!session)throw Error('Pinned WebKit touch bridge unavailable');
 return session;
}

function inspectTarget(element){
 const doc=element.ownerDocument;
 const view=doc?.defaultView;
 if(!doc||!view||typeof doc.elementFromPoint!=='function')return {valid:false,reason:'DOM hit testing is unavailable'};
 const width=Number(view.innerWidth||doc.documentElement?.clientWidth);
 const height=Number(view.innerHeight||doc.documentElement?.clientHeight);
 const viewport={left:0,top:0,right:width,bottom:height};
 const rawRect=element.getBoundingClientRect();
 const targetRect={left:rawRect.left,top:rawRect.top,right:rawRect.right,bottom:rawRect.bottom,width:rawRect.width,height:rawRect.height};
 const geometryValid=[targetRect.left,targetRect.top,targetRect.right,targetRect.bottom,targetRect.width,targetRect.height].every(Number.isFinite)&&targetRect.width>0&&targetRect.height>0;
 if(!geometryValid)return {valid:true,geometryValid:false,visible:false,disabled:false,reason:'invalid bounding box'};
 const x=targetRect.left+targetRect.width/2;
 const y=targetRect.top+targetRect.height/2;
 if(!Number.isFinite(x)||!Number.isFinite(y))return {valid:true,geometryValid:false,visible:false,disabled:false,reason:'invalid touch point'};
 const targetStyle=view.getComputedStyle(element);
 const visible=element.isConnected!==false&&targetStyle.display!=='none'&&targetStyle.visibility==='visible';
 const finiteRect=r=>r&&[r.left,r.top,r.right,r.bottom].every(Number.isFinite)&&r.right>r.left&&r.bottom>r.top;
 const intersect=(a,b)=>{
  const next={left:Math.max(a.left,b.left),top:Math.max(a.top,b.top),right:Math.min(a.right,b.right),bottom:Math.min(a.bottom,b.bottom)};
  return next.right>next.left&&next.bottom>next.top?next:null;
 };
 const isClipping=value=>/^(auto|scroll|overlay|hidden|clip)$/.test(value||'');
 const rectOf=node=>{
  const r=node.getBoundingClientRect();
  return {left:r.left,top:r.top,right:r.right,bottom:r.bottom};
 };
 const pointInViewport=Number.isFinite(width)&&Number.isFinite(height)&&x>=0&&y>=0&&x<width&&y<height;
 const hit=pointInViewport?doc.elementFromPoint(x,y):null;
 const hitTarget=Boolean(hit&&(hit===element||element.contains(hit)));
 const disabled=Boolean(element.matches?.(':disabled')||('disabled' in element&&element.disabled)||element.getAttribute?.('aria-disabled')==='true');
 const staticMenuTarget=Boolean(element.matches?.('[data-level]')||element.closest?.('[data-level]'));
 const ancestors=[];
 for(let node=element.parentElement;node;node=node.parentElement){
  const style=view.getComputedStyle(node);
  const rect=rectOf(node);
  const clientRect={
   left:rect.left+(Number(node.clientLeft)||0),
   top:rect.top+(Number(node.clientTop)||0),
   right:rect.left+(Number(node.clientLeft)||0)+(Number(node.clientWidth)||0),
   bottom:rect.top+(Number(node.clientTop)||0)+(Number(node.clientHeight)||0)
  };
  const clipX=isClipping(style.overflowX);
  const clipY=isClipping(style.overflowY);
  const overflowY=/^(auto|scroll|overlay)$/.test(style.overflowY||'');
  const maxScroll=Math.max(0,(Number(node.scrollHeight)||0)-(Number(node.clientHeight)||0));
  ancestors.push({node,rect,clientRect,clipX,clipY,scrollableY:overflowY&&maxScroll>1,maxScroll,scrollTop:Number(node.scrollTop)||0});
 }
 const clippedByViewport=!pointInViewport;
 const clippedByAncestor=ancestors.some(item=>
  (item.clipX&&(x<item.clientRect.left||x>=item.clientRect.right))||
  (item.clipY&&(y<item.clientRect.top||y>=item.clientRect.bottom))
 );
 let scrollableClip=null;
 for(let index=0;index<ancestors.length;index++){
  const item=ancestors[index];
  if(!item.scrollableY)continue;
  const centerBelow=y>=item.clientRect.bottom;
  const centerAbove=y<item.clientRect.top;
  if(!centerBelow&&!centerAbove)continue;
  const xVisible=x>=item.clientRect.left&&x<item.clientRect.right;
  if(!xVisible)continue;
  let visibleRect=intersect(viewport,item.clientRect);
  for(let outer=index+1;visibleRect&&outer<ancestors.length;outer++){
   const ancestor=ancestors[outer];
   if(ancestor.clipX||ancestor.clipY)visibleRect=intersect(visibleRect,ancestor.clientRect);
  }
  if(!visibleRect||visibleRect.bottom-visibleRect.top<32)continue;
  const scrollDirection=centerBelow?'down':'up';
  const canScroll=scrollDirection==='down'?item.scrollTop<item.maxScroll-0.5:item.scrollTop>0.5;
  if(!scrollableClip&&canScroll)scrollableClip={depth:index,scrollTop:item.scrollTop,maxScroll:item.maxScroll,direction:scrollDirection,rect:item.clientRect};
 }
 const clip={left:viewport.left,top:viewport.top,right:viewport.right,bottom:viewport.bottom};
 let effectiveClip=finiteRect(clip)?clip:null;
 for(const item of ancestors){
  if(effectiveClip&&(item.clipX||item.clipY)){
   const bound={
    left:item.clipX?item.clientRect.left:effectiveClip.left,
    right:item.clipX?item.clientRect.right:effectiveClip.right,
    top:item.clipY?item.clientRect.top:effectiveClip.top,
    bottom:item.clipY?item.clientRect.bottom:effectiveClip.bottom
   };
   effectiveClip=intersect(effectiveClip,bound);
  }
 }
 const clipped=!hitTarget&&(clippedByViewport||clippedByAncestor||Boolean(effectiveClip&&(x<effectiveClip.left||x>=effectiveClip.right||y<effectiveClip.top||y>=effectiveClip.bottom)));
 return {valid:true,geometryValid:true,visible,disabled,point:{x,y},viewportWidth:width,viewportHeight:height,pointInViewport,hitTarget,clipped,staticMenuTarget,scrollableClip,targetRect};
}

function installPointerdownCapture(element,key){
 const view=element.ownerDocument.defaultView;
 const state={pointerdown:null,listener:null};
 state.listener=event=>{
  const hit=element.ownerDocument.elementFromPoint(event.clientX,event.clientY);
  state.pointerdown={
   clientX:Number(event.clientX),clientY:Number(event.clientY),pointerType:String(event.pointerType||''),
   isTrusted:event.isTrusted===true,hitTarget:Boolean(hit&&(hit===element||element.contains(hit)))
  };
 };
 view[key]=state;
 element.addEventListener('pointerdown',state.listener,{capture:true,once:true});
 return true;
}

function consumePointerdownCapture(element,{key,depth}){
 const view=element.ownerDocument.defaultView;
 const state=view[key];
 if(state?.listener)element.removeEventListener('pointerdown',state.listener,true);
 delete view[key];
 let scrollNode=element.parentElement;
 for(let index=0;index<depth&&scrollNode;index++)scrollNode=scrollNode.parentElement;
 return {pointerdown:state?.pointerdown||null,scrollTopAfter:Number(scrollNode?.scrollTop)};
}

async function tapClippedMenu(locator,selector,observed){
 const key='__pelicanTapVisiblePointerdown_'+(++pointerCaptureSequence);
 let tapError=null;
 try{
  await locator.evaluate(installPointerdownCapture,key);
  await locator.tap({timeout:MENU_ACTION_TIMEOUT_MS});
 }catch(error){tapError=error;}
 let pointerdown=null;
 let scrollTopAfter=NaN;
 try{
  const capture=await locator.evaluate(consumePointerdownCapture,{key,depth:observed.scrollableClip.depth});
  pointerdown=capture?.pointerdown||null;
  scrollTopAfter=capture?.scrollTopAfter;
 }
 catch(error){if(!tapError)throw error;}
 if(tapError)throw tapError;
 const pointValid=pointerdown&&Number.isFinite(pointerdown.clientX)&&Number.isFinite(pointerdown.clientY)&&
  pointerdown.clientX>=0&&pointerdown.clientX<observed.viewportWidth&&pointerdown.clientY>=0&&pointerdown.clientY<observed.viewportHeight;
 if(!pointValid||pointerdown.pointerType!=='touch'||pointerdown.isTrusted!==true||pointerdown.hitTarget!==true)
  throw Error('Cannot tap '+selector+': auto-scroll did not produce a trusted touch pointerdown on the requested control');
 if(!Number.isFinite(scrollTopAfter)||Math.abs(scrollTopAfter-observed.scrollableClip.scrollTop)<=0.5)
  throw Error('Cannot tap '+selector+': actionability did not move the clipped menu scroll container');
 const scrollEvidence={mechanism:'playwright-locator-actionability-auto-scroll',scrollTopBefore:observed.scrollableClip.scrollTop,scrollTopAfter,pointerdown};
 return {
  x:pointerdown.clientX,y:pointerdown.clientY,pointerType:pointerdown.pointerType,isTrusted:pointerdown.isTrusted,
  scrollMechanism:'playwright-locator-actionability-auto-scroll',pointerdown,
  scrollEvidence:[scrollEvidence]
 };
}

export async function tapVisible(page,selector){
 const locator=page.locator(selector);
 await locator.waitFor({state:'visible'});
 const observed=await locator.evaluate(inspectTarget);
 if(!observed?.valid)throw Error('Cannot tap '+selector+': '+(observed?.reason||'DOM observation unavailable'));
 if(!observed.geometryValid)throw Error('Cannot tap '+selector+': '+(observed.reason||'invalid bounding box'));
 if(!observed.visible)throw Error('Cannot tap hidden control '+selector);
 if(observed.disabled)throw Error('Cannot tap disabled control '+selector);
 if(!Number.isFinite(observed.point.x)||!Number.isFinite(observed.point.y))throw Error('Cannot tap '+selector+': invalid touch point');
 if(!Number.isFinite(observed.viewportWidth)||observed.viewportWidth<=0||observed.point.x<0||observed.point.x>=observed.viewportWidth)
  throw Error('Cannot tap '+selector+': touch point is outside the viewport');
 if(observed.hitTarget&&observed.pointInViewport){
  if(typeof page.touchscreen?.tap!=='function')throw Error('Public touchscreen tap unavailable');
  await page.touchscreen.tap(observed.point.x,observed.point.y);
  return {x:observed.point.x,y:observed.point.y,scrollMechanism:'public-touchscreen',scrollEvidence:[]};
 }
 if(observed.clipped&&observed.staticMenuTarget&&observed.scrollableClip)
  return tapClippedMenu(locator,selector,observed);
 const reason=observed.clipped?'clipped target has no eligible scrollable menu container':'target is occluded or is not the actual hit target';
 throw Error('Cannot tap '+selector+': '+reason);
}

export async function swipe(page,engine,from,to,{cancel=false}={}){
 const session=await touchSession(page,engine);
 const send=async(type,x,y)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:engine==='chromium'&&(type==='touchEnd'||type==='touchCancel')?[]:[{x,y,id:1}]});
 await send('touchStart',...from);
 for(let i=1;i<=6;i++){
  await page.waitForTimeout(16);
  await send('touchMove',from[0]+(to[0]-from[0])*i/6,from[1]+(to[1]-from[1])*i/6);
 }
 await send(cancel?'touchCancel':'touchEnd',...to);
}
