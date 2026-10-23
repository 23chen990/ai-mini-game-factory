import test from 'node:test';
import assert from 'node:assert/strict';
import { CarGarage } from '../racing/garage.mjs';
import { RacingCareer } from '../racing/runtime.mjs';
import { CAREER_KEY } from '../racing/career.mjs';
import { grantCosmetic } from '../racing/cosmetics.mjs';

const storage = () => { const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)}; };
const ready=id=>({status:'ready',carId:id});
function setup(preview=async id=>ready(id),canPreview) {
  const store=storage(), career=new RacingCareer(store);
  career.setupAd({status:1,source:'check_ads_status',appId:'fixture',spaceId:'fixture',screenOrientation:1},{createRewardedVideoAd(){}});
  const garage=new CarGarage(career,preview,undefined,canPreview);
  garage.reset(true);
  return {store,career,garage};
}
test('locked real-model previews never grant, equip, or permit a race',async()=>{
  const shown=[],{career,garage,store}=setup(async id=>{shown.push(id);return ready(id);});
  const before=JSON.stringify(career.progress);
  assert.equal((await garage.select('custom-01')).status,'preview');
  assert.deepEqual(shown,['custom-01']);assert.equal(JSON.stringify(career.progress),before);
  assert.equal(store.getItem(CAREER_KEY),null);assert.equal(garage.snapshot().canRace,false);
  assert.equal(garage.snapshot().canWatch,true);assert.equal(garage.snapshot().owned,false);
  assert.equal((await garage.select('starter')).status,'equipped');assert.equal(garage.snapshot().canRace,true);
});
test('completed ad grants exactly the previewed car and equips it durably without a second ad',async()=>{
  const {career,garage,store}=setup();let calls=0;
  career.rewardedProvider=async()=>{calls++;return {status:'completed'};};
  await garage.select('custom-02');
  assert.deepEqual(await garage.unlock(),{status:'completed',id:'custom-02',equipped:true});
  assert.equal(garage.snapshot().canRace,true);assert.equal(garage.snapshot().canWatch,false);
  assert.equal(new RacingCareer(store).progress.car,'custom-02');
  assert.deepEqual(new RacingCareer(store).progress.ownedCars,['starter','custom-02']);
  assert.equal((await garage.unlock()).status,'unavailable');assert.equal(calls,1);
});
test('cancelled ads preserve the locked preview and let the player return to the free car',async()=>{
  const {career,garage}=setup();career.rewardedProvider=async()=>({status:'cancelled'});
  await garage.select('custom-03');assert.equal((await garage.unlock()).status,'cancelled');
  assert.equal(garage.snapshot().id,'custom-03');assert.equal(garage.snapshot().canRace,false);
  assert.deepEqual(career.progress.ownedCars,['starter']);
  await garage.select(career.progress.car);assert.equal(garage.snapshot().canRace,true);
});
test('only the latest async model selection can persist or enable racing',async()=>{
  const finish=new Map(),{career,garage,store}=setup(id=>new Promise(resolve=>finish.set(id,resolve)));
  career.progress=grantCosmetic(career.progress,'car','custom-01');
  career.progress=grantCosmetic(career.progress,'car','custom-02');
  const first=garage.select('custom-01'),second=garage.select('custom-02');
  assert.equal(garage.snapshot().canRace,false);
  finish.get('custom-02')(ready('custom-02'));assert.equal((await second).status,'equipped');
  finish.get('custom-01')(ready('custom-01'));assert.equal((await first).status,'stale');
  assert.equal(garage.snapshot().id,'custom-02');assert.equal(garage.snapshot().canRace,true);
  assert.equal(new RacingCareer(store).progress.car,'custom-02');
});
test('leaving the garage invalidates a pending preview without changing permanent selection',async()=>{
  let resolve;const {career,garage}=setup(()=>new Promise(done=>{resolve=done;}));
  career.progress=grantCosmetic(career.progress,'car','custom-04');
  const pending=garage.select('custom-04');garage.reset(false);resolve(ready('custom-04'));
  assert.equal((await pending).status,'stale');assert.equal(career.progress.car,'starter');
  assert.equal(garage.snapshot().canRace,false);garage.reset(true);assert.equal(garage.snapshot().canRace,true);
});
test('failed model loading cannot sell or equip the missing appearance and can be retried',async()=>{
  let fail=true;const {career,garage}=setup(async id=>{if(fail)throw Error('decode');return ready(id);});
  assert.equal((await garage.select('custom-05')).status,'load-failed');
  assert.equal(garage.snapshot().canWatch,false);assert.equal(garage.snapshot().canRace,false);
  assert.equal(career.progress.car,'starter');assert.equal((await garage.unlock()).status,'unavailable');
  fail=false;assert.equal((await garage.select('custom-05')).status,'preview');assert.equal(garage.snapshot().canWatch,true);
});
test('an equipment write failure restores the previously equipped native preview',async()=>{
  const shown=[],{career,garage,store}=setup(async id=>{shown.push(id);return ready(id);});
  career.progress=grantCosmetic(career.progress,'car','custom-01');
  store.setItem=()=>{throw Error('quota');};
  assert.equal((await garage.select('custom-01')).status,'save-failed');
  assert.deepEqual(shown,['custom-01','starter']);assert.equal(career.progress.car,'starter');
  assert.equal(garage.snapshot().id,'starter');assert.equal(garage.snapshot().canRace,true);
});
test('ad mutex blocks changing the preview, and unavailable SDK never offers a model reward',async()=>{
  const {career,garage}=setup();await garage.select('custom-01');
  let finish;career.rewardedProvider=()=>new Promise(resolve=>{finish=resolve;});
  const ad=garage.unlock();assert.equal(career.adBusy,true);
  assert.equal(garage.snapshot().canRace,false);
  assert.equal((await garage.select('custom-02')).status,'unavailable');assert.equal(garage.snapshot().id,'custom-01');
  assert.equal((await garage.unlock()).status,'unavailable');finish({status:'cancelled'});await ad;
  career.setupAd({status:'PENDING'},null);assert.equal(garage.snapshot().canWatch,false);
  assert.equal((await garage.unlock()).status,'unavailable');
});
test('only a ready native result for the exact car may enable equipment or rewarded previews',async()=>{
  for(const reply of [{status:'blocked',carId:'custom-01'},{status:'stale',carId:'custom-01'},
    ready('starter'),true,false,undefined])for(const owned of [false,true]){
    const {career,garage,store}=setup(async()=>reply);
    if(owned)career.progress=grantCosmetic(career.progress,'car','custom-01');
    assert.equal((await garage.select('custom-01')).status,'load-failed');
    assert.equal(career.progress.car,'starter');assert.equal(store.getItem(CAREER_KEY),null);
    assert.equal(garage.displayedId,null);assert.equal(garage.snapshot().canRace,false);assert.equal(garage.snapshot().canWatch,false);
  }
});
test('restore after a failed equipment write also requires exact native ready identity',async()=>{
  for(const reply of [{status:'blocked',carId:'starter'},{status:'stale',carId:'starter'},ready('custom-03')]){
    let calls=0;const {career,garage,store}=setup(async id=>++calls===1?ready(id):reply);
    career.progress=grantCosmetic(career.progress,'car','custom-03');store.setItem=()=>{throw Error('quota');};
    assert.equal((await garage.select('custom-03')).status,'load-failed');
    assert.equal(career.progress.car,'starter');assert.equal(garage.displayedId,null);assert.equal(garage.snapshot().canRace,false);
  }
});
test('home, active race and ad availability apply to snapshot gates and new selections',async()=>{
  let home=true;const {career,garage}=setup(undefined,()=>home);
  assert.equal(garage.snapshot().canRace,true);
  for(const change of [()=>{home=false;},()=>{career.active=true;},()=>{career.adBusy=true;}]){
    home=true;career.active=false;career.adBusy=false;change();
    assert.equal(garage.snapshot().canRace,false);assert.equal(garage.snapshot().canWatch,false);
    assert.equal((await garage.select('custom-01')).status,'unavailable');
  }
  home=true;career.active=false;career.adBusy=false;
  await garage.select('custom-01');assert.equal(garage.snapshot().canWatch,true);
  home=false;assert.equal(garage.snapshot().canWatch,false);assert.equal((await garage.unlock()).status,'unavailable');
});
test('lifecycle changes during a pending preview become stale without saving or compensating preview',async()=>{
  for(const change of ['home','active','ad','epoch']){
    let home=true,finish;const calls=[];
    const {career,garage,store}=setup(id=>{calls.push(id);return calls.length===1?new Promise(resolve=>{finish=resolve;}):Promise.resolve({status:'blocked',carId:id});},()=>home);
    career.progress=grantCosmetic(career.progress,'car','custom-04');
    const pending=garage.select('custom-04');
    if(change==='home')home=false;
    if(change==='active')career.active=true;
    if(change==='ad')career.adBusy=true;
    if(change==='epoch')career.stageAdEpoch++;
    finish(ready('custom-04'));assert.equal((await pending).status,'stale',change);
    assert.equal(career.progress.car,'starter');assert.equal(store.getItem(CAREER_KEY),null);
    assert.equal(career.storageOK,true);assert.deepEqual(calls,['custom-04']);
    assert.equal(garage.displayedId,null);assert.equal(garage.snapshot().canRace,false);
  }
});
test('leaving home during the restore await cannot mark the old native car as displayed',async()=>{
  let home=true,finish,calls=0;const {career,garage,store}=setup(id=>++calls===1?Promise.resolve(ready(id)):new Promise(resolve=>{finish=resolve;}),()=>home);
  career.progress=grantCosmetic(career.progress,'car','custom-02');store.setItem=()=>{throw Error('quota');};
  const pending=garage.select('custom-02');await Promise.resolve();
  assert.equal(calls,2);home=false;finish(ready('starter'));
  assert.equal((await pending).status,'stale');assert.equal(garage.displayedId,null);
  assert.equal(garage.snapshot().canRace,false);assert.equal(career.progress.car,'starter');
});
test('completed ad plus failed model decoding keeps the permanent reward without equipment or another ad',async()=>{
  let calls=0;const {career,garage,store}=setup(async id=>{if(++calls>1)throw Error('decode');return ready(id);});
  career.rewardedProvider=async()=>({status:'completed'});
  await garage.select('custom-01');assert.deepEqual(await garage.unlock(),{status:'completed',id:'custom-01',equipped:false});
  const restored=new RacingCareer(store);
  assert.deepEqual(restored.progress.ownedCars,['starter','custom-01']);assert.equal(restored.progress.car,'starter');
  assert.equal(garage.snapshot().canRace,false);assert.equal(garage.snapshot().canWatch,false);
});
test('completed ad plus failed equipment persistence keeps reward and restores prior equipment',async()=>{
  const {career,garage,store}=setup();const persist=store.setItem;let writes=0;
  store.setItem=(key,value)=>{if(++writes>1)throw Error('quota');persist(key,value);};
  career.rewardedProvider=async()=>({status:'completed'});
  await garage.select('custom-02');assert.deepEqual(await garage.unlock(),{status:'completed',id:'custom-02',equipped:false});
  const restored=new RacingCareer(store);
  assert.deepEqual(restored.progress.ownedCars,['starter','custom-02']);assert.equal(restored.progress.car,'starter');
  assert.equal(garage.snapshot().id,'starter');assert.equal(garage.snapshot().canRace,true);
});
test('leaving home during post-ad equipment loading preserves the completed grant without stale equipment',async()=>{
  let home=true,calls=0,finish,started;
  const equipmentStarted=new Promise(resolve=>{started=resolve;});
  const {career,garage,store}=setup(id=>{
    if(++calls===1)return Promise.resolve(ready(id));
    started();return new Promise(resolve=>{finish=resolve;});
  },()=>home);
  career.rewardedProvider=async()=>({status:'completed'});
  await garage.select('custom-05');const pending=garage.unlock();
  await equipmentStarted;home=false;finish(ready('custom-05'));
  assert.deepEqual(await pending,{status:'completed',id:'custom-05',equipped:false});
  const restored=new RacingCareer(store);
  assert.deepEqual(restored.progress.ownedCars,['starter','custom-05']);assert.equal(restored.progress.car,'starter');
  assert.equal(calls,2);assert.equal(garage.displayedId,null);assert.equal(garage.snapshot().canRace,false);
});
