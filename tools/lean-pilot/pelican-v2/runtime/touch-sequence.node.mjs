import test from 'node:test';
import assert from 'node:assert/strict';
import { queueTapSequence } from '../touch-sequence.mjs';

test('two real taps are queued in protocol order before a slow first acknowledgement', async () => {
 const sent=[],acks=[];
 const session={send:(method,params)=>{sent.push({method,params});return new Promise(resolve=>acks.push(resolve));}};
 const complete=queueTapSequence(session,'chromium',[{x:320,y:790},{x:195,y:790}]);
 assert.equal(sent.length,4,'a delayed first acknowledgment must not delay the cancellation touch');
 assert.deepEqual(sent.map(x=>x.params.type),['touchStart','touchEnd','touchStart','touchEnd']);
 assert.deepEqual(sent.map(x=>x.params.touchPoints),[[{x:320,y:790,id:1}],[],[{x:195,y:790,id:1}],[]]);
 assert.ok(sent.every(x=>x.method==='Input.dispatchTouchEvent'));
 acks.forEach(resolve=>resolve());await complete;
});
test('WebKit protocol tap endings retain the exact last touch coordinates', async () => {
 const sent=[];
 await queueTapSequence({send:async(_,params)=>sent.push(params)},'webkit',[{x:300,y:700},{x:190,y:700}]);
 assert.deepEqual(sent.map(x=>x.touchPoints),[[{x:300,y:700,id:1}],[{x:300,y:700,id:1}],[{x:190,y:700,id:1}],[{x:190,y:700,id:1}]]);
});
test('invalid sequence data fails before any trusted input is sent', async () => {
 let calls=0;const session={send:async()=>calls++};
 await assert.rejects(queueTapSequence(session,'firefox',[{x:1,y:1},{x:2,y:2}]),/Invalid/u);
 await assert.rejects(queueTapSequence(session,'chromium',[{x:NaN,y:1},{x:2,y:2}]),/Invalid/u);
 await assert.rejects(queueTapSequence(session,'webkit',[]),/Invalid/u);
 assert.equal(calls,0);
});

test('three trusted taps queue resume, jump, and safe turn without waiting for a frame',async()=>{
 const sent=[],acks=[],session={send:(method,params)=>{sent.push({method,params});return new Promise(resolve=>acks.push(resolve));}};
 const points=[{x:160,y:430},{x:272,y:510},{x:122,y:510}];
 const pending=queueTapSequence(session,'chromium',points);
 assert.equal(sent.length,6);
 assert.deepEqual(sent.map(x=>x.params.type),['touchStart','touchEnd','touchStart','touchEnd','touchStart','touchEnd']);
 assert.deepEqual(sent.filter((_,i)=>i%2===0).map(x=>x.params.touchPoints[0]).map(p=>[p.x,p.y]),[[160,430],[272,510],[122,510]]);
 acks.forEach(resolve=>resolve());await pending;
});
