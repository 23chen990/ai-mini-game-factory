import test from 'node:test';
import assert from 'node:assert/strict';
import {challengesFor,cfEliteChallenge} from '../engine.mjs';
import {CF_CONTROL_DEFAULTS,cfNormalizeControls,cfLoadControls,cfSaveControls,
  cfApplyControls,cfMissionMedal,cfNewMastery,cfMasteryKey,
  cfRecordMastery,cfLoadMastery,cfSaveMastery,cfRecordLabel,cfNextMedalGoal,cfMobileMission
} from '../cf-player-loop.mjs';

const [rifle,sniper,survive]=challengesFor('cf-transport-ship');
const rifleWin={hits:8,shots:26,deaths:2,drillFirstHit:true,drillStage:2,
  drillTravel:8,drillFollowUpHits:3};
const sniperWin={hits:1,shots:5,kills:1,awmKills:1,deaths:0};
const survivalWin={hits:0,shots:0,deaths:0,travel:25};

test('CF controls clamp corrupt, huge, outdated and poisoned saved values',()=>{
 assert.deepEqual(cfNormalizeControls({sensitivity:20,opacity:-99}),
  {sensitivity:1.55,opacity:.4});
 assert.deepEqual(cfNormalizeControls({sensitivity:NaN,opacity:Infinity}),
  {...CF_CONTROL_DEFAULTS});
 assert.deepEqual(cfLoadControls('bad'),{...CF_CONTROL_DEFAULTS});
 assert.deepEqual(cfLoadControls('x'.repeat(600)),{...CF_CONTROL_DEFAULTS});
 assert.deepEqual(cfLoadControls('{"version":2,"controls":{"sensitivity":1.2}}'),
  {...CF_CONTROL_DEFAULTS});
 const custom={sensitivity:1.27,opacity:.64};
 assert.deepEqual(cfLoadControls(cfSaveControls(custom)),custom);
 assert.deepEqual(cfLoadControls('{"version":1,"controls":{"sensitivity":"evil","opacity":null}}'),
  {...CF_CONTROL_DEFAULTS});
});

test('CF single native sensitivity multiplier does not change bullet or recoil statistics',()=>{
 const opts={sens:.88,fov:75};
 const g={opts,player:{hp:100,stats:{shots:6,hits:2},weapon:{mag:15}}};
 assert.equal(cfApplyControls(g,{sensitivity:1.4,opacity:.65},.88),true);
 assert.equal(opts.sens,1.232);
 assert.equal(opts.fov,75);
 assert.deepEqual(g.player,{hp:100,stats:{shots:6,hits:2},weapon:{mag:15}});
 assert.equal(cfApplyControls(g,{sensitivity:1.4},.88),true);
 assert.equal(opts.sens,1.232,'setting cannot compound across repeated panels and reloads');
 assert.equal(cfApplyControls(g,{sensitivity:1.4},NaN),false);
 assert.equal(cfApplyControls(null,CF_CONTROL_DEFAULTS,1),false);
});

test('CF medals require exact genuine engine success, not just source hit counters',()=>{
 assert.equal(cfMissionMedal(rifle,{...rifleWin,drillStage:1},'won',32000),null);
 assert.equal(cfMissionMedal(rifle,{...rifleWin,drillTravel:7},'won',32000),null);
 assert.equal(cfMissionMedal(rifle,{...rifleWin,deaths:3},'won',32000),null);
 assert.equal(cfMissionMedal(rifle,rifleWin,'lost',32000),null);
 assert.equal(cfMissionMedal(rifle,rifleWin,'won',61000),null);
 assert.equal(cfMissionMedal(rifle,rifleWin,'won',NaN),null);
 assert.equal(cfMissionMedal(rifle,rifleWin,'won',31900)?.stars,1);
 const clean=cfMissionMedal(rifle,{...rifleWin,deaths:0},'won',25000);
 assert.equal(clean.stars,3);assert.equal(clean.label,'完美');
 assert.equal(clean.accuracy,31);
 assert.equal(cfMissionMedal(sniper,sniperWin,'won',51000)?.stars,3);
 assert.equal(cfMissionMedal(sniper,{...sniperWin,awmKills:0},'won',51000),null);
 assert.equal(cfMissionMedal(survive,survivalWin,'won',45000)?.stars,2);
 const earnedGold=cfMissionMedal(survive,{...survivalWin,travel:30},'won',45000);
 assert.equal(earnedGold?.stars,3,
   '45s survival must have a reachable three-star path after its required full clock');
 assert.equal(cfNextMedalGoal(survive,cfMissionMedal(survive,survivalWin,'won',45000)),
   '三星目标：零阵亡，真实移动至少30米');
 assert.equal(cfNextMedalGoal(rifle,cfMissionMedal(rifle,rifleWin,'won',31900)),
   '三星目标：零阵亡，在45秒内完成');
 assert.equal(cfNextMedalGoal(survive,earnedGold),'');
 assert.equal(cfMissionMedal(survive,{...survivalWin,travel:0},'won',45000),null);
 assert.equal(cfMissionMedal(survive,survivalWin,'won',44900),null,
   'survival cannot earn a completion badge before 45 simulated seconds');
});

test('CF mastery is game- and elite-mode scoped, tries count once and failures never mint stars',()=>{
 const p=cfNewMastery(),advanced=cfEliteChallenge(rifle);
 assert.equal(cfMasteryKey(advanced),'tags:elite');
 assert.equal(cfMasteryKey(rifle),'tags:normal');
 assert.equal(cfRecordLabel(p,rifle),'尚未通关');
 const lost=cfRecordMastery(p,rifle,rifleWin,'lost',25000);
 assert.equal(lost.record.attempts,1);assert.equal(lost.medal,null);
 assert.equal(p.records['tags:normal'].wins,0);
 const won=cfRecordMastery(p,rifle,rifleWin,'won',31900);
 assert.equal(won.medal.stars,1);assert.equal(won.newBest,true);
 assert.equal(won.newMedal,true);
 assert.equal(p.records['tags:normal'].wins,1);
 const slow=cfRecordMastery(p,rifle,{...rifleWin,deaths:1},'won',49000);
 assert.equal(slow.medal.stars,2);assert.equal(slow.newBest,false);
 assert.equal(slow.newMedal,true);
 assert.equal(cfRecordLabel(p,rifle),'★★☆ · 最速 31.9秒');
 assert.equal(cfRecordLabel(p,advanced),'尚未通关');
 assert.equal(p.records['tags:normal'].attempts,3);
 const saved=cfSaveMastery(p);
 assert.deepEqual(cfLoadMastery(saved),p);
 assert.equal(cfRecordMastery(p,advanced,{...rifleWin,drillTravel:8,
   deaths:0},'won',25000).medal,null,'elite cannot borrow regular mission wins');
 assert.equal(p.records['tags:elite'].wins,0);
});

test('CF corrupted local mastery never leaks scores or breaks older challenge saves',()=>{
 assert.deepEqual(cfLoadMastery('null'),cfNewMastery());
 assert.deepEqual(cfLoadMastery('{not json}'),cfNewMastery());
 assert.deepEqual(cfLoadMastery(' '.repeat(4000)),cfNewMastery());
 const r=cfNewMastery();
 r.records['tags:normal']={attempts:3,wins:2,bestMs:31900,bestStars:3};
 const bad=JSON.parse(JSON.stringify(r));
 bad.records['tags:normal'].wins=4;
 assert.deepEqual(cfLoadMastery(JSON.stringify(bad)),cfNewMastery());
 assert.deepEqual(cfLoadMastery(JSON.stringify({version:1,records:{evil:r.records['tags:normal']}})),cfNewMastery());
 assert.deepEqual(cfLoadMastery(JSON.stringify(r)),r);
 assert.equal(cfRecordMastery(r,{id:'pelican-bike'},rifleWin,'won',1000),null);
 assert.equal(cfMissionMedal(rifle,rifleWin,'won',31900).timeMs,31900);
});

test('CF V18 lite keeps immutable campaign IDs while using transparent goals',()=>{
 const old=challengesFor('cf-transport-ship');
 const now=old.map(cfMobileMission);
 assert.deepEqual(now.map(x=>x.id),old.map(x=>x.id));
 assert.deepEqual(old[0].minTravel,8);
 assert.equal(now[0].lite,true);
 assert.equal(now[0].target,2);
 assert.match(now[0].objective,/击倒2名/);
 assert.equal(now[0].minTravel,8,'historical map data is not rewritten');
 assert.equal(now[6].minTravel,0);
 assert.equal(now[6].finishOnExtract,true);
 assert.equal(now[3].target,1);
 assert.equal(now[7].target,1);
 assert.equal(now[1].weapon,'awm');
 assert.deepEqual(cfMobileMission(null),null);
});
test('CF V18 lite awards actual native eliminations and complete extraction',async()=>{
 const {challengeResult}=await import('../engine.mjs');
 const [rifle,,,,,,evac]=challengesFor('cf-transport-ship').map(cfMobileMission);
 assert.equal(challengeResult(rifle,{kills:1,deaths:0},false).outcome,'running');
 assert.equal(challengeResult(rifle,{kills:2,deaths:0},false).outcome,'won');
 assert.equal(challengeResult(rifle,{hits:90,kills:0,deaths:0},true).outcome,'lost');
 assert.equal(challengeResult(evac,{kills:1,deaths:0,travel:0,
   evacSiteValid:true,evacExtracted:true},false,35000).outcome,'won');
 assert.equal(challengeResult(evac,{kills:0,deaths:0,travel:0,
   evacSiteValid:true,evacExtracted:true},false,35000).outcome,'running');
});

test('CF V18 lite survival mastery rewards fighting instead of hidden walking quotas',()=>{
 const lite=cfMobileMission(survive),elapsedMs=45000;
 assert.equal(lite.minTravel,0);
 const one={shots:7,hits:4,kills:1,deaths:0,travel:0};
 const two={...one,kills:2};
 assert.equal(cfMissionMedal(lite,one,'won',elapsedMs)?.stars,2,
  'one real kill and zero deaths wins, but optional elite mastery needs two');
 assert.equal(cfMissionMedal(lite,two,'won',elapsedMs)?.stars,3,
  'two real native player kills and no deaths earn three stars');
 const next=cfNextMedalGoal(lite,cfMissionMedal(lite,one,'won',elapsedMs));
 assert.match(next,/亲手击倒至少2人/);
 assert.doesNotMatch(next,/移动|行进|米/);
});
