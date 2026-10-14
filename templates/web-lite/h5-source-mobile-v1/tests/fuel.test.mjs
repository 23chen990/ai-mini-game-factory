import test from 'node:test';
import assert from 'node:assert/strict';
import { FUEL_KEY, FUEL_RULES, newFuelState, syncFuel, spendRaceFuel, fuelTimeLeft,
  grantAdvertFuel, fuelAdEligible, fuelPlatformReady, loadFuel, saveFuel } from '../fuel.mjs';
const M=60_000, T=1_800_000_000_000;
test('racing fuel: stable save key and proven racing-style numbers',()=>{
  assert.equal(FUEL_KEY,'h5-mobile:qq-speed:fuel:v1');
  assert.equal(FUEL_RULES.max,10); assert.equal(FUEL_RULES.regenMs,5*M); assert.equal(FUEL_RULES.adGrant,2);
});
test('full start, successful race spends one, and exhausted player cannot enter another',()=>{
  let s=newFuelState(T); assert.equal(s.amount,10);
  for(let i=0;i<10;i++){const v=spendRaceFuel(s,T); assert.equal(v.ok,true);s=v.state;}
  assert.equal(s.amount,0); assert.equal(spendRaceFuel(s,T).ok,false);
  assert.equal(spendRaceFuel(s,T+5*M).ok,true);
});
test('spending fuel never restarts a partially elapsed recharge',()=>{
  let s=spendRaceFuel(newFuelState(T),T).state;
  s=spendRaceFuel(s,T+4*M).state;
  assert.equal(s.updatedAt,T); assert.equal(fuelTimeLeft(s,T+4*M),M);
  s=syncFuel(s,T+5*M); assert.equal(s.amount,9);
});
test('reopening after long offline period fills only to max; clock rollback cannot manufacture fuel',()=>{
  const s=spendRaceFuel(newFuelState(T),T).state;
  assert.equal(syncFuel(s,T+100*M).amount,10);
  const rolled=syncFuel(s,T-20*M);
  assert.deepEqual(rolled,s,'clock rollback must not reset stored recharge origin');
  assert.equal(syncFuel(rolled,T-15*M).amount,9,'forward from fake clock must not regenerate fuel');
  assert.equal(syncFuel(rolled,T+4*M).amount,9);
  assert.equal(syncFuel(rolled,T+5*M).amount,10);
});
test('clock rollback cannot erase the rewarded ad cooldown or generate duplicate fuel',()=>{
  let s=spendRaceFuel(newFuelState(T),T).state;
  s=spendRaceFuel(s,T).state;
  const a=grantAdvertFuel(s,'completed','unique-video-attempt-31',T+1000);
  assert.equal(a.ok,true);
  const rolled=syncFuel(a.state,T-20*M);
  assert.equal(rolled.lastAdAt,T+1000);
  assert.equal(rolled.updatedAt,T+1000,'filling the tank resets the recharge baseline to reward time');
  assert.equal(grantAdvertFuel(rolled,'completed','unique-video-attempt-32',T-15*M).ok,false);
  assert.equal(grantAdvertFuel(rolled,'completed','unique-video-attempt-32',T+5000).ok,false);
});
test('cancelled, timed out, duplicated, cooled down or already-full ads never grant fuel',()=>{
  let s=spendRaceFuel(newFuelState(T),T).state;
  for(const status of ['cancelled','failed','unavailable','busy','timed-out'])
    assert.equal(grantAdvertFuel(s,status,'unique-video-attempt-01',T+1).ok,false);
  const a=grantAdvertFuel(s,'completed','unique-video-attempt-01',T+1);
  assert.equal(a.ok,true); assert.equal(a.state.amount,10);
  assert.equal(grantAdvertFuel(a.state,'completed','unique-video-attempt-01',T+31_000).ok,false);
  s=spendRaceFuel(a.state,T+2).state;
  assert.equal(grantAdvertFuel(s,'completed','unique-video-attempt-02',T+2_000).ok,false);
});
test('reward preserves recharge progress unless it fills the tank',()=>{
  let s=newFuelState(T);
  s=spendRaceFuel(s,T).state; s=spendRaceFuel(s,T+M).state;
  const g=grantAdvertFuel(s,'completed','unique-video-attempt-11',T+2*M).state;
  assert.equal(g.amount,10); assert.equal(g.updatedAt,T+2*M);
  s=spendRaceFuel(g,T+3*M).state;
  s=spendRaceFuel(s,T+4*M).state;
  s=spendRaceFuel(s,T+4*M).state;
  const h=grantAdvertFuel(s,'completed','unique-video-attempt-12',T+4*M+31_000).state;
  assert.equal(h.amount,9); assert.equal(h.updatedAt,T+3*M);
});
test('no rewarded offers before first round/60 seconds or without live platform permission',()=>{
  let s=newFuelState(T); for(let i=0;i<5;i++)s=spendRaceFuel(s,T).state;
  const ctx={rounds:2,sessionMs:61_000,adReady:true,now:T+1};
  assert.equal(fuelAdEligible(s,ctx),true);
  assert.equal(fuelAdEligible(s,{...ctx,rounds:0}),false);
  assert.equal(fuelAdEligible(s,{...ctx,sessionMs:59_000}),false);
  assert.equal(fuelAdEligible(s,{...ctx,adReady:false}),false);
  const c={status:1,source:'check_ads_status',appId:'real-app',spaceId:'real-slot',screenOrientation:1};
  const tap={createRewardedVideoAd(){}};
  assert.equal(fuelPlatformReady(c,tap),true);
  assert.equal(fuelPlatformReady({...c,status:'PENDING'},tap),false);
  assert.equal(fuelPlatformReady(c,null),false);
});
test('reload keeps earned fuel and rejects tampered/corrupted persisted JSON',()=>{
  const state=spendRaceFuel(newFuelState(T),T).state;
  assert.deepEqual(loadFuel(saveFuel(state),T+M),state);
  assert.equal(loadFuel('not JSON',T),null);
  assert.equal(loadFuel(JSON.stringify({...state,amount:200}),T),null);
  assert.equal(loadFuel(JSON.stringify({...state,lastAdId:7}),T),null);
  assert.equal(loadFuel(JSON.stringify({...state,updatedAt:-2}),T),null);
});


test('满油时回拨时钟开赛，扣油不可把恢复计时基准挪到过去',()=>{
  const start=newFuelState(T);
  const rolled=spendRaceFuel(start,T-20*M);
  assert.equal(rolled.ok,true);
  assert.equal(rolled.state.amount,9);
  assert.equal(rolled.state.updatedAt,T,'remember original full-tank timestamp');
  assert.equal(syncFuel(rolled.state,T+4*M).amount,9,'4 real minutes is not enough');
  assert.equal(syncFuel(rolled.state,T+5*M).amount,10,'only after 5 real minutes refill');
});
test('冷却中的广告和反复回拨不会制造额外的两格体力',()=>{
  const s=spendRaceFuel(spendRaceFuel(newFuelState(T),T).state,T).state;
  const reward=grantAdvertFuel(s,'completed','reward-attempt-one',T+1000);
  assert.equal(reward.ok,true);
  const rolled=spendRaceFuel(reward.state,T-1000);
  assert.equal(rolled.ok,true);
  assert.equal(rolled.state.updatedAt,reward.state.updatedAt,'rollback never rewinds recharge anchor');
  assert.equal(grantAdvertFuel(rolled.state,'completed','reward-attempt-two',T+2000).ok,false,'reward cooldown persists');
});
