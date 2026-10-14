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
export async function swipe(page,engine,from,to,{cancel=false}={}){
 const session=await touchSession(page,engine);
 const send=async(type,x,y)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:engine==='chromium'&&(type==='touchEnd'||type==='touchCancel')?[]:[{x,y,id:1}]});
 await send('touchStart',...from);
 for(let i=1;i<=6;i++){await page.waitForTimeout(16);await send('touchMove',from[0]+(to[0]-from[0])*i/6,from[1]+(to[1]-from[1])*i/6);}
 await send(cancel?'touchCancel':'touchEnd',...to);
}
