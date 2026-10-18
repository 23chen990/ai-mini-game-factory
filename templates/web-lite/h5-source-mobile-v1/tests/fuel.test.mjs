import test from 'node:test';
import assert from 'node:assert/strict';
import { FUEL_KEY, FUEL_RULES, newFuelState, syncFuel, spendRaceFuel, fuelTimeLeft,
  grantAdvertFuel, fuelAdEligible, fuelPlatformReady, loadFuel, saveFuel } from '../fuel.mjs';
const M=60_000, T=1_800_000_000_000;

test('racing fuel changes to 30 capacity, five per race and one per minute',()=>{
  assert.equal(FUEL_KEY,'h5-mobile:qq-speed:fuel:v1','keep persisted key and migrate in place');
  assert.deepEqual([FUEL_RULES.max,FUEL_RULES.raceCost,FUEL_RULES.regenMs],[30,5,M]);
  assert.equal(FUEL_RULES.adGrant,10,'voluntary completed video retains two races of value');
  assert.equal(FUEL_RULES.offerAtOrBelow,15);
});
test('30 fuel gives exactly six races, seventh waits for 5 recovered points',()=>{
  let s=newFuelState(T);
  assert.equal(s.amount,30);assert.equal(s.version,2);
  for(let i=0;i<6;i++){
    const o=spendRaceFuel(s,T);assert.equal(o.ok,true);s=o.state;
  }
  assert.equal(s.amount,0);
  assert.equal(spendRaceFuel(s,T).ok,false);
  assert.equal(spendRaceFuel(s,T+4*M).ok,false);
  const retry=spendRaceFuel(s,T+5*M);
  assert.equal(retry.ok,true);assert.equal(retry.state.amount,0);
});
test('partial 1 minute recharge does not restart on another race',()=>{
  let s=spendRaceFuel(newFuelState(T),T).state;
  assert.equal(s.amount,25);
  s=spendRaceFuel(s,T+4*M).state;
  assert.equal(s.amount,24);
  assert.equal(s.updatedAt,T+4*M);
  assert.equal(fuelTimeLeft(s,T+4*M),M);
  assert.equal(syncFuel(s,T+5*M).amount,25);
});
test('regeneration after offline recovery is capped and backward-clock exploit is rejected',()=>{
  const s=spendRaceFuel(newFuelState(T),T).state;
  assert.equal(syncFuel(s,T+100*M).amount,30);
  const rolled=syncFuel(s,T-20*M);
  assert.deepEqual(rolled,s);
  assert.equal(syncFuel(rolled,T-15*M).amount,25);
  assert.equal(syncFuel(rolled,T+30_000).amount,25);
  assert.equal(syncFuel(rolled,T+M).amount,26);
});
test('ad reward clock rollback keeps cooldown and recharge anchor',()=>{
  let s=spendRaceFuel(newFuelState(T),T).state;
  s=spendRaceFuel(s,T).state;
  const ad=grantAdvertFuel(s,'completed','unique-video-attempt-31',T+1000);
  assert.equal(ad.ok,true);assert.equal(ad.state.amount,30);
  const rolled=syncFuel(ad.state,T-20*M);
  assert.equal(rolled.lastAdAt,T+1000);
  assert.equal(rolled.updatedAt,T+1000);
  assert.equal(grantAdvertFuel(rolled,'completed','unique-video-attempt-32',T-15*M).ok,false);
  assert.equal(grantAdvertFuel(rolled,'completed','unique-video-attempt-32',T+5000).ok,false);
});
test('cancelled, timed out, duplicated and already-full ad do not grant fuel',()=>{
  const s=spendRaceFuel(newFuelState(T),T).state;
  for(const status of ['cancelled','failed','unavailable','busy','timed-out'])
    assert.equal(grantAdvertFuel(s,status,'unique-video-attempt-01',T+1).ok,false);
  const done=grantAdvertFuel(s,'completed','unique-video-attempt-01',T+1);
  assert.equal(done.ok,true);assert.equal(done.state.amount,30);
  assert.equal(grantAdvertFuel(done.state,'completed','unique-video-attempt-01',T+31_000).ok,false);
  const used=spendRaceFuel(done.state,T+2).state;
  assert.equal(grantAdvertFuel(used,'completed','unique-video-attempt-02',T+2000).ok,false);
});
test('partial ad top-up preserves next-minute recharge progress',()=>{
  let s=spendRaceFuel(newFuelState(T),T).state;
  s=spendRaceFuel(s,T+M).state;
  const full=grantAdvertFuel(s,'completed','unique-video-attempt-11',T+2*M).state;
  assert.equal(full.amount,30);assert.equal(full.updatedAt,T+2*M);
  s=spendRaceFuel(full,T+3*M).state;
  s=spendRaceFuel(s,T+4*M).state;
  s=spendRaceFuel(s,T+4*M).state;
  const partial=grantAdvertFuel(s,'completed','unique-video-attempt-12',T+4*M+31_000).state;
  assert.equal(partial.amount,26);
  assert.equal(partial.updatedAt,T+4*M);
});
test('fuel advertisements never auto-appear without real round, session and adapter',()=>{
  let s=newFuelState(T);
  for(let i=0;i<4;i++)s=spendRaceFuel(s,T).state;
  const options={rounds:2,sessionMs:61_000,adReady:true,now:T+1};
  assert.equal(fuelAdEligible(s,options),true);
  assert.equal(fuelAdEligible(s,{...options,rounds:0}),false);
  assert.equal(fuelAdEligible(s,{...options,sessionMs:59_000}),false);
  assert.equal(fuelAdEligible(s,{...options,adReady:false}),false);
  const config={status:1,source:'check_ads_status',appId:'real-app',spaceId:'real-slot',screenOrientation:1};
  const tap={createRewardedVideoAd(){}};
  assert.equal(fuelPlatformReady(config,tap),true);
  assert.equal(fuelPlatformReady({...config,status:'PENDING'},tap),false);
  assert.equal(fuelPlatformReady(config,null),false);
});
test('persisted V2 survives reload, old V1 tank migrates without losing saved fuel',()=>{
  const full=newFuelState(T);
  const saved=spendRaceFuel(full,T).state;
  assert.deepEqual(loadFuel(saveFuel(saved),T+30_000),saved);
  const old={version:1,amount:4,updatedAt:T,lastAdAt:T-60_000,lastAdId:'old-video-receipt'};
  const upgraded=loadFuel(JSON.stringify(old),T+30_000);
  assert.equal(upgraded.version,2);assert.equal(upgraded.amount,12);
  assert.equal(upgraded.updatedAt,T);assert.equal(upgraded.lastAdId,'old-video-receipt');
  assert.equal(loadFuel(JSON.stringify({...old,amount:10}),T).amount,30);
  assert.equal(loadFuel(JSON.stringify({...old,amount:11}),T),null);
  assert.equal(loadFuel('not JSON',T),null);
  assert.equal(loadFuel(JSON.stringify({...saved,amount:200}),T),null);
  assert.equal(loadFuel(JSON.stringify({...saved,lastAdId:7}),T),null);
  assert.equal(loadFuel(JSON.stringify({...saved,updatedAt:-2}),T),null);
});
test('rolled-back clock cannot move full tank recharge origin into the past',()=>{
  const full=newFuelState(T),rolled=spendRaceFuel(full,T-20*M);
  assert.equal(rolled.ok,true);
  assert.equal(rolled.state.amount,25);
  assert.equal(rolled.state.updatedAt,T);
  assert.equal(syncFuel(rolled.state,T+30_000).amount,25);
  assert.equal(syncFuel(rolled.state,T+M).amount,26);
});
test('advert cooldown persists across repeated clock rollback and races',()=>{
  const s=spendRaceFuel(spendRaceFuel(newFuelState(T),T).state,T).state;
  const reward=grantAdvertFuel(s,'completed','reward-attempt-one',T+1000);
  assert.equal(reward.ok,true);
  const rolled=spendRaceFuel(reward.state,T-1000);
  assert.equal(rolled.ok,true);
  assert.equal(rolled.state.updatedAt,reward.state.updatedAt);
  assert.equal(grantAdvertFuel(rolled.state,'completed','reward-attempt-two',T+2000).ok,false);
});
test('next single fuel point countdown never becomes a five-minute wait',()=>{
  const s=spendRaceFuel(newFuelState(T),T).state;
  assert.equal(fuelTimeLeft(s,T-20*M),M);
  assert.equal(fuelTimeLeft(s,T+30_000),30_000);
});
