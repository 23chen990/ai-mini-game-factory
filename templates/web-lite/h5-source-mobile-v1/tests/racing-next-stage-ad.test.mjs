import test from 'node:test';
import assert from 'node:assert/strict';
import { CAREER_KEY, STAGES, newCareer, loadCareer, stageUnlocked } from '../racing/career.mjs';
import { RacingCareer } from '../racing/runtime.mjs';

const memory=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};
function setup(){
  const storage=memory(),career=new RacingCareer(storage);
  career.adReady=true;career.fuelEnabled=true;
  const player={isPlayer:true,progress:0,stats:{crash:0},items:[],s:0,d:0};
  const rival={isPlayer:false,progress:0,stats:{crash:0},items:[],s:0,d:0,skill:1};
  const game={player,racers:[player,rival],standings:[rival,player],itemMode:false};
  return {career,storage,game};
}
function finishLoss(career,game){
  career.begin(game);
  return career.finalize(game,{finished:true,place:4,time:108,stats:{crash:2}});
}

test('next-stage reward needs a real failed result and a usable completed-ad provider',async()=>{
  const {career,game}=setup();
  assert.equal(career.canOfferNextStageAd(),false);
  assert.equal((await career.watchNextStageAd()).status,'unavailable');
  career.begin(game);assert.equal(career.canOfferNextStageAd(),false);
  career.finalize(game,{finished:true,place:4,time:108,stats:{crash:2}});
  assert.equal(career.canOfferNextStageAd(),true);
  career.adReady=false;assert.equal(career.canOfferNextStageAd(),false);
});

test('completed reward opens only the adjacent level and preserves real medals, times and fuel',async()=>{
  const {career,storage,game}=setup();finishLoss(career,game);
  const before=JSON.stringify({stars:career.progress.stars,times:career.progress.times,fuel:career.fuel,rounds:career.progress.rounds});
  career.rewardedProvider=async()=>({status:'completed'});
  const outcome=await career.watchNextStageAd();
  assert.equal(outcome.status,'completed');assert.equal(outcome.stageId,'02');
  assert.equal(stageUnlocked(career.progress,1),true);
  assert.equal(stageUnlocked(career.progress,2),false);
  assert.equal(career.progress.stagePasses['02'],'ad');
  assert.equal(JSON.stringify({stars:career.progress.stars,times:career.progress.times,fuel:career.fuel,rounds:career.progress.rounds}),before);
  const reloaded=new RacingCareer(storage);
  assert.equal(reloaded.stage.id,'02','home resumes the newest permanently open level');
  assert.equal(stageUnlocked(reloaded.progress,1),true);
  assert.equal(reloaded.progress.stars['01']??0,0);
});

test('a second completed view cannot consume another ad or open another stage',async()=>{
  const {career,game}=setup();finishLoss(career,game);let calls=0;
  career.rewardedProvider=async()=>{calls++;return {status:'completed'};};
  await career.watchNextStageAd();
  assert.equal((await career.watchNextStageAd()).status,'unavailable');
  assert.equal(calls,1);assert.equal(stageUnlocked(career.progress,2),false);
});

for(const status of ['cancelled','failed','timed-out','busy','unavailable']){
  test(status+' reward never opens the next level',async()=>{
    const {career,game}=setup();finishLoss(career,game);
    const saved=JSON.stringify(career.progress);
    career.rewardedProvider=async()=>({status});
    assert.equal((await career.watchNextStageAd()).status,status);
    assert.equal(JSON.stringify(career.progress),saved);
    assert.equal(career.adBusy,false);assert.equal(stageUnlocked(career.progress,1),false);
  });
}

test('storage failure keeps the level locked and prevents another wasted ad',async()=>{
  const {career,storage,game}=setup();finishLoss(career,game);
  career.rewardedProvider=async()=>({status:'completed'});
  storage.setItem=()=>{throw Error('quota');};
  assert.equal((await career.watchNextStageAd()).status,'save-failed');
  assert.equal(stageUnlocked(career.progress,1),false);
  assert.equal(career.storageOK,false);assert.equal(career.canOfferNextStageAd(),false);
});

test('parallel views and late callbacks after a new attempt cannot grant a level',async()=>{
  const {career,game}=setup();finishLoss(career,game);let resolve;
  career.rewardedProvider=()=>new Promise(done=>{resolve=done;});
  const pending=career.watchNextStageAd();
  assert.equal((await career.watchNextStageAd()).status,'unavailable');
  career.begin(game);resolve({status:'completed'});
  assert.equal((await pending).status,'stale');
  assert.equal(stageUnlocked(career.progress,1),false);
});

test('leave-and-return to the same level invalidates a pending reward ticket',async()=>{
  const {career,game}=setup();finishLoss(career,game);let resolve;
  career.rewardedProvider=()=>new Promise(done=>{resolve=done;});
  const pending=career.watchNextStageAd();
  career.setStage(0);resolve({status:'completed'});
  assert.equal((await pending).status,'stale');
  assert.equal(stageUnlocked(career.progress,1),false);
});

test('sequential ad-opened stages can continue without fabricating passed stages or star-gate medals',async()=>{
  const {career,storage,game}=setup();career.rewardedProvider=async()=>({status:'completed'});
  for(let index=0;index<6;index++){
    assert.equal(career.setStage(index),true);
    finishLoss(career,game);
    assert.equal((await career.watchNextStageAd()).stageId,STAGES[index+1].id);
  }
  const state=loadCareer(storage.getItem(CAREER_KEY));
  assert.equal(stageUnlocked(state,6),true);
  assert.equal(stageUnlocked(state,7),false);
  assert.equal(Object.values(state.stars).reduce((a,b)=>a+b,0),0);
  assert.equal(new RacingCareer(storage).stage.id,'07');
});

test('last stage and a successful podium never offer failure-based next-stage rewards',()=>{
  const {career,game}=setup();career.begin(game);
  career.finalize(game,{finished:true,place:1,time:90,stats:{crash:0}});
  assert.equal(career.canOfferNextStageAd(),false);
  career.index=29;finishLoss(career,game);
  assert.equal(career.canOfferNextStageAd(),false);
});

test('stage-pass persistence whitelists the existing numbered career and rejects invented passes',()=>{
  const state=newCareer();state.stagePasses={'00':'ad','01':'ad','02':'ad','03':'legacy','31':'ad','daily-2026-10-18':'ad'};
  const loaded=loadCareer(JSON.stringify(state));
  assert.deepEqual(loaded.stagePasses,{'02':'ad'});
});
