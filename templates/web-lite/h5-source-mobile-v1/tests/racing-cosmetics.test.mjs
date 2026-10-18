import test from 'node:test';
import assert from 'node:assert/strict';
import {newCareer,loadCareer,skinUnlocked,carUnlocked,CAREER_KEY} from '../racing/career.mjs';
import {RacingCareer} from '../racing/runtime.mjs';
import {CAR_MODELS,grantCosmetic} from '../racing/cosmetics.mjs';
const store=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};};
const adConfig={status:1,source:'check_ads_status',appId:'test-app',spaceId:'test-unit',screenOrientation:1};
const ready=storage=>{const c=new RacingCareer(storage);c.setupAd(adConfig,{createRewardedVideoAd(){}});return c;};
const customIds=['custom-01','custom-02','custom-03','custom-04','custom-05'];
const game=()=>{const player={isPlayer:true,stats:{crash:0},progress:0,s:30,nitroCount:0};
 return {player,racers:[player],standings:[player],settings:{enginePower:1,grip:1},save(){this.saved=(this.saved??0)+1;}};};
test('starter is free and five registered user models start locked without changing the eight paint policy',()=>{
 const c=newCareer();assert.deepEqual(CAR_MODELS.map(car=>car.id),['starter',...customIds]);
 assert.deepEqual(CAR_MODELS.filter(car=>car.free).map(car=>car.id),['starter']);
 assert.deepEqual(CAR_MODELS.filter(car=>car.paintable).map(car=>car.id),['starter']);
 assert.deepEqual(c.ownedCars,['starter']);assert.equal(c.car,'starter');
 assert.deepEqual(c.ownedSkins,[0]);assert.equal(skinUnlocked(c,0),true);
 for(let i=1;i<8;i++)assert.equal(skinUnlocked(c,i),false);
 for(const id of customIds)assert.equal(carUnlocked(c,id),false);
 assert.equal(grantCosmetic(c,'car','new-glb-unregistered'),null);
});
test('old 6-star owner keeps previously earned colors but new stars never grant extras',()=>{
 const old={...newCareer(),stars:{'01':3,'02':3},skin:2};delete old.ownedSkins;
 const migrated=loadCareer(JSON.stringify(old));assert.deepEqual(migrated.ownedSkins,[0,1,2]);assert.equal(migrated.skin,2);
 migrated.stars['03']=3;const restored=loadCareer(JSON.stringify(migrated));assert.equal(skinUnlocked(restored,3),false);
});
test('completed official ad unlocks one color permanently, without minting stars/fuel',async()=>{
 const storage=store(),c=ready(storage),fuel=c.fuel.amount;
 c.rewardedProvider=async()=>({status:'completed'});
 assert.equal(c.canOfferSkinAd(4),true);
 assert.equal((await c.watchSkinAd(4)).status,'completed');
 assert.equal(c.canOfferSkinAd(4),false);
 assert.equal(c.progress.stars['01'],undefined);
 assert.equal(c.fuel.amount,fuel);
 assert.equal(JSON.parse(storage.getItem(CAREER_KEY)).ownedSkins.includes(4),true);
 const reload=new RacingCareer(storage);
 assert.equal(skinUnlocked(reload.progress,4),true);
 assert.equal(reload.setSkin(4),true);
 assert.equal(new RacingCareer(storage).progress.skin,4);
});
test('cancellation and failures never earn a permanent color',async()=>{
 const c=ready(store());
 for(const status of ['cancelled','failed','timed-out','unavailable']){
   c.rewardedProvider=async()=>({status});
   assert.equal((await c.watchSkinAd(2)).status,status);
   assert.equal(skinUnlocked(c.progress,2),false);
 }
});
test('ad busy blocks replay, selection and duplicate ad; successful reward cannot be duplicated',async()=>{
 const c=ready(store());let finish;
 c.rewardedProvider=()=>new Promise(res=>{finish=res;});
 const pending=c.watchSkinAd(2);
 assert.equal(c.canOfferSkinAd(2),false);
 assert.equal(c.canStart(),false);
 assert.equal(c.setSkin(0),false);
 assert.equal((await c.watchSkinAd(2)).status,'unavailable');
 finish({status:'completed'});
 assert.equal((await pending).status,'completed');
 assert.equal((await c.watchSkinAd(2)).status,'unavailable');
});
test('a completed video with failing persistence must not grant cosmetics',async()=>{
 const storage=store(),c=ready(storage);
 c.rewardedProvider=async()=>({status:'completed'});
 storage.setItem=()=>{throw Error('quota');};
 assert.equal((await c.watchSkinAd(3)).status,'save-failed');
 assert.equal(skinUnlocked(c.progress,3),false);
 assert.equal(c.adReady,false);
 assert.equal(c.canOfferSkinAd(3),false);
});
test('an absent official ad SDK never unlocks paint',async()=>{
 const c=new RacingCareer(store());c.setupAd({status:'PENDING'},null);
 assert.equal(c.canOfferSkinAd(1),false);
 assert.equal((await c.watchSkinAd(1)).status,'unavailable');
});
test('car save migration keeps known permanent models, removes unknown IDs and rejects unowned equipment',()=>{
 const saved={...newCareer(),ownedSkins:[0,2,7],skin:7,ownedCars:['custom-03','unknown','custom-03',null],car:'custom-03'};
 const restored=loadCareer(JSON.stringify(saved));
 assert.deepEqual(restored.ownedCars,['starter','custom-03']);assert.equal(restored.car,'custom-03');
 assert.deepEqual(restored.ownedSkins,[0,2,7]);assert.equal(restored.skin,7);
 for(const car of ['custom-02','unknown',null])assert.equal(loadCareer(JSON.stringify({...saved,car})).car,'starter');
 const legacy={...newCareer(),stars:{'01':3,'02':3},skin:2};
 delete legacy.ownedSkins;delete legacy.ownedCars;delete legacy.car;
 const old=loadCareer(JSON.stringify(legacy));
 assert.deepEqual(old.ownedSkins,[0,1,2]);assert.deepEqual(old.ownedCars,['starter']);assert.equal(old.car,'starter');
});
for(const id of customIds)test(id+' completed ad grants permanent ownership, then explicit equipment survives refresh',async()=>{
 const storage=store(),c=ready(storage);c.progress.ownedSkins=[0,2,7];c.progress.skin=7;
 c.progress.stars={'01':2};c.progress.times={'01':88};c.progress.rounds=4;
 const original=JSON.stringify(c.progress),fuel=JSON.stringify(c.fuel);let calls=0;
 c.rewardedProvider=async()=>{calls++;return {status:'completed'};};
 assert.equal(c.setCar(id),false);assert.equal(c.canOfferCarAd(id),true);
 assert.deepEqual(await c.watchCarAd(id),{status:'completed',kind:'car',id});
 assert.equal(c.progress.car,'starter','unlock does not silently equip the preview');
 assert.deepEqual(c.progress,{...JSON.parse(original),ownedCars:['starter',id]});
 assert.equal(JSON.stringify(c.fuel),fuel);
 assert.equal(c.canOfferCarAd(id),false);assert.equal((await c.watchCarAd(id)).status,'unavailable');assert.equal(calls,1);
 const owned=new RacingCareer(storage);assert.equal(carUnlocked(owned.progress,id),true);
 assert.equal(owned.setCar(id),true);const reloaded=new RacingCareer(storage);
 assert.equal(reloaded.progress.car,id);assert.equal(reloaded.progress.skin,7);
 const g=game();assert.equal(reloaded.configure(g),true);assert.equal(g.settings.car,id);
 assert.equal(g.settings.enginePower,1);assert.equal(g.settings.grip,1);
 assert.equal(g.settings.skin,7);assert.equal(g.saved,1);
 assert.equal(reloaded.setCar('starter'),true);
 assert.equal(new RacingCareer(storage).progress.car,'starter');
});
test('locked or unknown selected cars cannot configure or start a race',()=>{
 const c=ready(store());
 for(const id of [...customIds,'unknown']){
  assert.equal(c.setCar(id),false);c.progress.car=id;
  const g=game(),before=JSON.stringify(g.settings);
  assert.equal(c.canStart(),false);assert.equal(c.configure(g),false);
  assert.equal(JSON.stringify(g.settings),before);assert.equal(g.saved,undefined);
 }
 c.progress.car='starter';assert.equal(c.canStart(),true);
});
test('car cancellation, failure, timeout, missing completion and provider exceptions never persist ownership',async()=>{
 for(const id of customIds)for(const status of ['cancelled','failed','timed-out','unavailable',undefined,'throw']){
  const storage=store(),c=ready(storage),before=JSON.stringify(c.progress),fuel=JSON.stringify(c.fuel);
  c.rewardedProvider=async()=>{if(status==='throw')throw Error('SDK');return status?{status}:undefined;};
  assert.equal((await c.watchCarAd(id)).status,status==='throw'||status===undefined?'failed':status);
  assert.equal(JSON.stringify(c.progress),before);assert.equal(JSON.stringify(c.fuel),fuel);
  assert.equal(storage.getItem(CAREER_KEY),null);assert.equal(c.adBusy,false);
 }
});
test('missing SDK and unknown cars cannot request a rewarded video',async()=>{
 const c=new RacingCareer(store());c.setupAd({status:'PENDING'},null);let calls=0;
 c.rewardedProvider=async()=>{calls++;return {status:'completed'};};
 for(const id of [...customIds,'unknown','starter']){
  assert.equal(c.canOfferCarAd(id),false);assert.equal((await c.watchCarAd(id)).status,'unavailable');
 }
 assert.equal(calls,0);
 const online=ready(store());assert.equal(online.canOfferCarAd('unknown'),false);
 assert.equal((await online.watchCarAd('unknown')).status,'unavailable');
});
test('pending car video shares the paint mutex and cannot equip, start or duplicate the named reward',async()=>{
 const c=ready(store());let finish,calls=0;
 c.rewardedProvider=()=>{calls++;return new Promise(resolve=>{finish=resolve;});};
 assert.equal(c.canOfferSkinAd(2),true);
 const pending=c.watchCarAd('custom-01');assert.equal(c.adBusy,true);
 assert.equal(c.canStart(),false);assert.equal(c.setCar('starter'),false);assert.equal(c.setSkin(0),false);
 for(const id of ['custom-01','custom-02'])assert.equal((await c.watchCarAd(id)).status,'unavailable');
 assert.equal((await c.watchSkinAd(2)).status,'unavailable');assert.equal(calls,1);
 finish({status:'completed'});assert.equal((await pending).status,'completed');
 assert.deepEqual(c.progress.ownedCars,['starter','custom-01']);assert.equal(c.progress.car,'starter');
 assert.equal(c.canOfferCarAd('custom-02'),true);assert.equal(c.canOfferSkinAd(2),true);
});
test('late car completion after begin and return without a settled round is stale',async()=>{
 const storage=store(),c=ready(storage);let finish;
 c.rewardedProvider=()=>new Promise(resolve=>{finish=resolve;});
 const pending=c.watchCarAd('custom-01');assert.equal(c.adBusy,true);
 const rounds=c.progress.rounds;c.begin(game());c.active=false;
 const progress=JSON.stringify(c.progress),fuel=JSON.stringify(c.fuel);
 assert.equal(c.progress.rounds,rounds);
 finish({status:'completed'});assert.equal((await pending).status,'stale');
 assert.equal(JSON.stringify(c.progress),progress);assert.equal(JSON.stringify(c.fuel),fuel);
 assert.equal(carUnlocked(new RacingCareer(storage).progress,'custom-01'),false);
});
test('active race, stage changes, settled rounds and invalidated storage reject late car completions',async()=>{
 for(const change of [c=>{c.active=true;},c=>{c.setStage(0);},c=>{c.progress.rounds++;},c=>{c.storageOK=false;}]){
  const c=ready(store());let finish;c.rewardedProvider=()=>new Promise(resolve=>{finish=resolve;});
  const pending=c.watchCarAd('custom-02');assert.equal(c.adBusy,true);change(c);
  finish({status:'completed'});assert.equal((await pending).status,'stale');
  assert.equal(carUnlocked(c.progress,'custom-02'),false);assert.equal(c.adBusy,false);
 }
});
test('car entitlement or equipment write failure keeps the prior durable ownership and selection',async()=>{
 for(const id of customIds){
  const storage=store(),c=ready(storage);c.rewardedProvider=async()=>({status:'completed'});
  storage.setItem=()=>{throw Error('quota');};
  assert.equal((await c.watchCarAd(id)).status,'save-failed');
  assert.deepEqual(c.progress.ownedCars,['starter']);assert.equal(c.progress.car,'starter');
  assert.equal(c.adReady,false);assert.equal(c.canOfferCarAd(id),false);assert.equal(c.adBusy,false);
 }
 const storage=store(),c=ready(storage);c.rewardedProvider=async()=>({status:'completed'});
 assert.equal((await c.watchCarAd('custom-03')).status,'completed');
 const durable=storage.getItem(CAREER_KEY);storage.setItem=()=>{throw Error('quota');};
 assert.equal(c.setCar('custom-03'),false);assert.equal(c.progress.car,'starter');
 assert.equal(storage.getItem(CAREER_KEY),durable);
 const reload=new RacingCareer(storage);assert.equal(reload.progress.car,'starter');assert.equal(carUnlocked(reload.progress,'custom-03'),true);
});
test('every equipped model uses the same configuration, five fuel cost and actual rank settlement',()=>{
 let baseline;
 for(const id of ['starter',...customIds]){
  const storage=store(),c=ready(storage);if(id!=='starter')c.progress=grantCosmetic(c.progress,'car',id);
  assert.ok(c.progress);assert.equal(c.setCar(id),true);
  const g=game();c.configure(g);assert.equal(g.settings.car,id);
  const {car,...settings}=g.settings;assert.equal(car,id);
  const physicalBefore=JSON.stringify(g.player);
  c.begin(g);const outcome=c.finalize(g,{finished:true,place:2,time:90});
  assert.equal(JSON.stringify(g.player),physicalBefore);
  const snapshot={settings,fuel:c.fuel.amount,stars:outcome.stars,times:c.progress.times,rounds:c.progress.rounds};
  if(!baseline)baseline=snapshot;else assert.deepEqual(snapshot,baseline);
 }
 assert.equal(baseline.fuel,25);assert.equal(baseline.stars,2);
});
