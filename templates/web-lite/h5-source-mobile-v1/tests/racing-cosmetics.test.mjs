import test from 'node:test';
import assert from 'node:assert/strict';
import {newCareer,loadCareer,skinUnlocked,CAREER_KEY} from '../racing/career.mjs';
import {RacingCareer} from '../racing/runtime.mjs';
import {CAR_MODELS,grantCosmetic} from '../racing/cosmetics.mjs';
const store=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};};
const adConfig={status:1,source:'check_ads_status',appId:'test-app',spaceId:'test-unit',screenOrientation:1};
const ready=storage=>{const c=new RacingCareer(storage);c.setupAd(adConfig,{createRewardedVideoAd(){}});return c;};
test('starter free, seven other colors gated by rewarded assets, no imaginary new model',()=>{
 const c=newCareer();assert.equal(CAR_MODELS.length,1);assert.deepEqual(c.ownedSkins,[0]);assert.equal(skinUnlocked(c,0),true);
 for(let i=1;i<8;i++)assert.equal(skinUnlocked(c,i),false);
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
