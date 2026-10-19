import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFormSessions } from '../form-metrics.mjs';
const good={identity:true,target:true,nonTarget:true,artifactFree:true,keep:true};
const a=(id,status='succeeded',quality=good,costMicros=50000)=>({id,status,quality,costMicros,elapsedMs:10000,reviewer:'anonymous-reviewer'});
const session=(id,attempts)=>({id,photoId:'licensed-photo-01',task:'paint',providerProfile:'recorded-profile-v1',attempts});
const run=sessions=>({status:'RECORDED',currency:'USD',sessions});
test('failures, bad images and retries stay in denominators and total cost',()=>{
  const r=analyzeFormSessions(run([session('s1',[a('1','failed',null),a('2')]),session('s2',[a('1','succeeded',{...good,identity:false})])]));
  assert.equal(r.attemptCount,3);assert.equal(r.technicallySucceeded,2);assert.equal(r.usableOutputs,1);
  assert.equal(r.failedSessions,1);assert.equal(r.totalCostMicros,150000);assert.equal(r.costPerUsableOutputMicros,150000);
  assert.equal(r.meanAttemptsToFirstUsableAmongSuccessfulSessions,2);assert.equal(r.meanTimeToFirstUsableAmongSuccessfulSessionsMs,20000);
  assert.equal(r.firstAttemptUsableRate,0);
});
test('an unknown supplier charge is never silently priced at zero',()=>{
  const r=analyzeFormSessions(run([session('s1',[a('1','uncertain',null,null),a('2')])]));
  assert.equal(r.knownCostMicros,50000);assert.equal(r.unknownCostAttempts,1);assert.equal(r.totalCostMicros,null);
  assert.equal(r.costPerUsableOutputMicros,null);
});
test('zero usable images has no finite cost per usable image',()=>{
  const r=analyzeFormSessions(run([session('s1',[a('1','failed',null)])]));assert.equal(r.usableOutputs,0);
  assert.equal(r.costPerUsableOutputMicros,null);assert.equal(r.meanTimeToFirstUsableAmongSuccessfulSessionsMs,null);
});
test('missing quality review cannot be called a usable result',()=>{
  const r=analyzeFormSessions(run([session('s1',[a('1','succeeded',null)])]));assert.equal(r.technicallySucceeded,1);assert.equal(r.usableOutputs,0);
});
test('invalid amounts, duplicate attempts and unrun examples are rejected',()=>{
  for(const input of [{status:'NOT_RUN'},run([]),run([session('s1',[a('1','succeeded',good,-1)])]),
    run([session('s1',[a('1'),a('1')])]),run([session('s1',[a('1')]),session('s1',[a('2')])])]) assert.throws(()=>analyzeFormSessions(input));
});
