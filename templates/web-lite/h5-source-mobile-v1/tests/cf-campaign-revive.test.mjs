import test from 'node:test';
import assert from 'node:assert/strict';
import {
  challengesFor,challengeResult,cfEliteChallenge,cfAdvanceAssault,
  cfStartDefense,cfStepDefense,cfCanOfferRevive,newChallengeProgress,
  recordChallenge,saveChallengeProgress,loadChallengeProgress
} from '../engine.mjs';
import {cfTouchTutorial,mobileChallengeCopy,cfMissionFacts,
  cfMissionDebrief,cfResultFacts,cfEliteUnlocked} from '../fps-mobile-ux.mjs';
import {cfNewMastery,cfRecordMastery,cfMasteryKey,
  cfMissionMedal,cfLoadMastery,cfSaveMastery} from '../cf-player-loop.mjs';

const list=challengesFor('cf-transport-ship');
const by=id=>list.find(c=>c.id===id);
const realAd={status:1,source:'check_ads_status',
  appId:'TEST_FIXTURE_NOT_REAL',spaceId:'TEST_FIXTURE_NOT_REAL',
  screenOrientation:1};
test('two readable groups, exactly eight unique unlocked base challenges, no paywalled content',()=>{
 assert.deepEqual(list.map(c=>c.id),[
  'tags','precision','survive','defense','assault','marksman','evac','counter']);
 assert.deepEqual(list.slice(0,4).map(c=>c.kind),['hits','kills','survive','defend']);
 assert.deepEqual(list.slice(4).map(c=>c.kind),['assault','kills','survive','defend']);
 for(const c of list){
   assert.ok(c.limitMs>0&&c.weapon&&c.title);
   assert.match(mobileChallengeCopy(c),/秒/);
   assert.equal(cfMissionFacts(c).length,3);
   assert.equal(cfResultFacts(c,{}).length,3);
   assert.equal(typeof c.id,'string');
   assert.equal(cfEliteChallenge(c).elite,true);
 }
 assert.equal(challengesFor('qq-speed').length,3);
 assert.equal(challengesFor('pelican-bike').length,3);
});

test('flanking requires authentic walked meters AND net displacement before native player kills count',()=>{
 const c=by('assault');
 assert.equal(c.minTravel,12);
 let state=cfAdvanceAssault(c,null,{kills:0,travel:0,x:-32,z:-6});
 assert.equal(state.stage,0);
 state=cfAdvanceAssault(c,state,{kills:3,travel:12.1,x:-30,z:-6});
 assert.equal(state.stage,0,'Walking in place cannot unlock kill scoring');
 assert.equal(state.postKills,0);
 state=cfAdvanceAssault(c,state,{kills:4,travel:14,x:-21,z:-6});
 assert.equal(state.stage,1);
 assert.equal(state.killBaseline,4,'Native early kills cannot count as post-flank');
 assert.equal(state.postKills,0);
 state=cfAdvanceAssault(c,state,{kills:5,travel:14.8,x:-20,z:-6});
 assert.equal(state.postKills,1);
 assert.equal(challengeResult(c,{assaultStage:state.stage,
  assaultTravel:state.travel,assaultKills:state.postKills,deaths:0},false).outcome,'running');
 state=cfAdvanceAssault(c,state,{kills:6,travel:17.2,x:-18,z:-7});
 const native={assaultStage:state.stage,assaultTravel:state.travel,
  assaultKills:state.postKills,deaths:1};
 assert.equal(challengeResult(c,native,false).outcome,'won');
 assert.equal(challengeResult(c,{...native,deaths:3},false).outcome,'lost');
 assert.equal(challengeResult(c,{...native,assaultTravel:2},true).outcome,'lost');
 assert.equal(challengeResult(c,{...native,assaultStage:0},true).outcome,'lost');
 assert.equal(challengeResult(c,{hits:500,kills:90,deaths:0},true).outcome,'lost');
 assert.match(cfMissionDebrief(c,native,'won'),/自己击杀/);
 const elite=cfEliteChallenge(c);
 assert.equal(elite.target,3);assert.equal(elite.minTravel,18);
 assert.equal(elite.maxDeaths,1);
});

test('two-player-verified sniper kills AND genuine walking are both required',()=>{
 const c=by('marksman');
 assert.equal(c.weapon,'awm');assert.equal(c.target,2);
 const full={awmKills:2,kills:2,travel:10,deaths:1};
 assert.equal(challengeResult(c,full,false).outcome,'won');
 assert.equal(challengeResult(c,{...full,awmKills:1},true).outcome,'lost');
 assert.equal(challengeResult(c,{...full,travel:9.99},false).outcome,'running');
 assert.equal(challengeResult(c,{...full,travel:9.99},true).outcome,'lost');
 assert.equal(challengeResult(c,{...full,deaths:3},false).outcome,'lost');
 assert.equal(challengeResult(c,{kills:10,awmKills:0,travel:100},true).outcome,'lost');
 assert.match(cfResultFacts(c,full)[1].value,/10/);
 assert.match(cfMissionFacts(c)[1].value,/10米/);
 const elite=cfEliteChallenge(c);
 assert.equal(elite.target,3);assert.equal(elite.minTravel,15);
});

test('evac cannot be won from idling or teammate kills, or early normal game termination',()=>{
 const c=by('evac');
 assert.equal(c.kind,'survive');assert.equal(c.minKills,1);
 const full={kills:1,deaths:1,travel:35};
 assert.equal(challengeResult(c,full,true,70000).outcome,'won');
 assert.equal(challengeResult(c,{...full,kills:0},true,70000).outcome,'lost');
 assert.equal(challengeResult(c,{...full,travel:34.9},true,70000).outcome,'lost');
 assert.equal(challengeResult(c,full,true,69999).outcome,'lost');
 assert.equal(challengeResult(c,full,false,70000).outcome,'running');
 assert.equal(challengeResult(c,{...full,deaths:2},true,70000).outcome,'lost');
 const elite=cfEliteChallenge(c);
 assert.equal(elite.target,0);
 assert.equal(elite.minTravel,50);assert.equal(elite.minKills,2);
 assert.equal(challengeResult(elite,{kills:2,deaths:0,travel:50},true,80000).outcome,'won');
 assert.equal(challengeResult(elite,{kills:1,deaths:0,travel:50},true,80000).outcome,'lost');
 assert.match(cfResultFacts(c,full)[2].value,/1/);
 assert.match(cfMissionDebrief(c,{...full,kills:0},'lost'),/队友击杀不计算/);
});

test('counterattack genuinely reverses the same 3D point ownership B then A, with enemy contest',()=>{
 const c=by('counter');
 assert.equal(c.reverse,true);
 const sites=[{id:'B',x:-8,z:6.8},{id:'A',x:-22,z:-6.8}];
 const atB={alive:true,team:'BL',pos:{x:-8,z:6.8}};
 const atA={alive:true,team:'BL',pos:{x:-22,z:-6.8}};
 let state=cfStartDefense(sites);
 assert.equal(state.valid,true);
 const tick=(t,player,enemies=[])=>{
   state=cfStepDefense(state,{gameTime:t,player,actors:enemies,team:'BL',
     holdSeconds:c.holdSeconds,breachSeconds:c.breachSeconds,radius:c.radius});
 };
 for(let i=0;i<55;i++)tick(i*.1,atB);
 assert.equal(state.stage,1);assert.equal(state.captured,1);
 for(let i=55;i<112;i++)tick(i*.1,atA);
 assert.equal(state.stage,2);assert.equal(state.captured,2);
 assert.equal(challengeResult(c,{defenseSitesValid:true,defenseCaptured:2,
   defenseStage:2,deaths:1},false).outcome,'won');
 const elite=cfEliteChallenge(c);
 assert.equal(elite.maxDeaths,0);assert.equal(elite.breachSeconds,6);
 assert.match(mobileChallengeCopy(c),/远端B点→近端A点/);
 assert.match(cfMissionFacts(c)[1].value,/B → A/);
});

test('rewarded revive remains an opt-in second-session eligible placement only',()=>{
 const c=by('defense');
 const round={phase:'running'},progress={rounds:1};
 const metrics={deaths:3,defenseBreached:false};
 const eligible={challenge:c,round,progress,metrics,config:realAd,
   sdkReady:true,sinceStartupMs:61000};
 assert.equal(cfCanOfferRevive(eligible),true);
 for(const settings of [
   {progress:{rounds:0}},{sinceStartupMs:59999},{sdkReady:false},
   {config:{status:'PENDING'}},{config:{...realAd,source:'unknown'}},
   {round:{phase:'finished'}},{used:true},{declined:true},
   {metrics:{...metrics,deaths:2}},
   {metrics:{...metrics,deaths:4}},
   {metrics:{...metrics,defenseBreached:true}},
   {challenge:cfEliteChallenge(c)}
 ])assert.equal(cfCanOfferRevive({...eligible,...settings}),false,JSON.stringify(settings));
 assert.equal(cfCanOfferRevive({...eligible,
   challenge:{...c,bonusDeaths:1}}),false,'Only once per round');
 assert.equal(cfCanOfferRevive({...eligible,
   challenge:by('precision')}),false,'No fictional death budget');
});

test('one completed ad can increase DEATH ALLOWANCE, never stats or legitimate medals',()=>{
 const base=by('defense');
 const full={defenseSitesValid:true,defenseCaptured:2,
   defenseStage:2,defenseBreached:false,deaths:3};
 assert.equal(challengeResult(base,full,false).outcome,'lost');
 assert.equal(challengeResult({...base,bonusDeaths:1},full,false).outcome,'won');
 assert.equal(challengeResult({...base,bonusDeaths:1},
   {...full,deaths:4},false).outcome,'lost','No two-for-one revive');
 assert.equal(cfMissionMedal({...base,bonusDeaths:1},full,'won',54000),null);
 const p=newChallengeProgress('cf-transport-ship');
 recordChallenge(p,base,5,'won',{assisted:true});
 assert.equal(p.records.defense.attempts,1);
 assert.equal(p.records.defense.wins,0);
 assert.equal(p.records.defense.assistedWins,1);
 assert.equal(p.records.defense.best,0);
 assert.equal(cfEliteUnlocked(p.records.defense),false);
 assert.deepEqual(loadChallengeProgress(saveChallengeProgress(p),
   'cf-transport-ship'),p);
 const mastery=cfNewMastery();
 const reward=cfRecordMastery(mastery,{...base,bonusDeaths:1},
   {...full,adRevived:true},'won',54000);
 assert.equal(reward.medal,null);
 assert.equal(reward.record.wins,0);
 assert.equal(cfMasteryKey(base),'defense:normal');
 assert.deepEqual(cfLoadMastery(cfSaveMastery(mastery)),mastery);
 const normal={...full,deaths:0};
 assert.equal(cfMissionMedal(base,normal,'won',54000)?.stars,3,
   'Normal unassisted match can still earn mastery');
});

test('normal first four missions and historical saves keep exactly their original identities',()=>{
 const base=newChallengeProgress('cf-transport-ship');
 const ids=list.slice(0,4).map(x=>x.id);
 assert.deepEqual(ids,['tags','precision','survive','defense']);
 base.selected='precision';
 recordChallenge(base,by('precision'),1,'won');
 const old=saveChallengeProgress(base);
 assert.equal(loadChallengeProgress(old,'cf-transport-ship').selected,'precision');
 for(const id of list.slice(4).map(x=>x.id))
   assert.match(cfMasteryKey(by(id)),new RegExp('^'+id+':normal$'));
 assert.equal(cfTouchTutorial(by('assault')),'先真实换位，再亲手击杀敌人');
});
