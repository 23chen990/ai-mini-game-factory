// Browser input protocols create trusted touches. No DOM dispatch or game setters.
// WebKit uses the pinned Playwright in-process bridge because public Touchscreen
// exposes taps only. Protocol verified against Playwright v1.62.1 Input schema.
export async function touchSession(page,engine){
 if(engine==='chromium')return page.context().newCDPSession(page);
 const impl=page._connection.toImpl(page);
 const session=impl?.delegate?.rawTouchscreen?._pageProxySession;
 if(!session)throw Error('Pinned WebKit touch bridge unavailable');
 return session;
}
export async function tapVisible(page,selector){
 const locator=page.locator(selector);
 await locator.waitFor({state:'visible'});
 if(!await locator.isVisible())throw Error('Cannot tap hidden control '+selector);
 const box=await locator.boundingBox();
 if(!box||![box.x,box.y,box.width,box.height].every(Number.isFinite)||box.width<=0||box.height<=0)throw Error('Cannot tap '+selector+': invalid bounding box');
 const x=box.x+box.width/2,y=box.y+box.height/2,viewport=page.viewportSize();
 if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Cannot tap '+selector+': invalid touch point');
 if(viewport&&(!Number.isFinite(viewport.width)||!Number.isFinite(viewport.height)||viewport.width<=0||viewport.height<=0||x<0||y<0||x>=viewport.width||y>=viewport.height))throw Error('Cannot tap '+selector+': touch point is outside the viewport');
 if(!await locator.isVisible())throw Error('Cannot tap hidden control '+selector);
 if(typeof page.touchscreen?.tap!=='function')throw Error('Public touchscreen tap unavailable');
 await page.touchscreen.tap(x,y);
 return {x,y};
}
export async function swipe(page,engine,from,to,{cancel=false}={}){
 const session=await touchSession(page,engine);
 const send=async(type,x,y)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:engine==='chromium'&&(type==='touchEnd'||type==='touchCancel')?[]:[{x,y,id:1}]});
 await send('touchStart',...from);
 for(let i=1;i<=6;i++){await page.waitForTimeout(16);await send('touchMove',from[0]+(to[0]-from[0])*i/6,from[1]+(to[1]-from[1])*i/6);}
 await send(cancel?'touchCancel':'touchEnd',...to);
}
