import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceTrialMetrics, rankFinishGapSeconds, RACE_TRIAL_KEY } from '../racing/trial-metrics.mjs';

const stage = {course:'race-05',rank:3};
const fixture = () => ({
  finished:true, place:4, time:71.34, stats:{crash:2},
  rows:[{place:1,time:62},{place:2,time:66},{place:3,time:69.2},{place:4,time:71.34}]
});
const store = () => {const obj={};return {
  obj,getItem:key=>obj[key]??null,setItem:(key,val)=>{obj[key]=val;}
};};
test('native finish gap needs real finished ranking times',()=>{
  assert.equal(rankFinishGapSeconds(stage,fixture()),2.1);
  assert.equal(rankFinishGapSeconds(stage,{...fixture(),place:3}),null);
  assert.equal(rankFinishGapSeconds(stage,{...fixture(),finished:false}),null);
  assert.equal(rankFinishGapSeconds(stage,{...fixture(),rows:[{place:3,time:null}]}),null);
  assert.equal(rankFinishGapSeconds(stage,{...fixture(),rows:[{place:3,time:75}]}),null);
  assert.equal(rankFinishGapSeconds({course:'daily-2026-10-17',rank:3},fixture()),null);
});
test('starts, native grades, voluntary replays and ad callbacks are disjoint',()=>{
  const storage=store(),t=new RaceTrialMetrics(storage);
  assert.equal(t.finish(stage,fixture(),0,72),false,'cannot finish an unstarted run');
  assert.equal(t.start(stage),true);
  assert.equal(t.finish(stage,fixture(),0,72.31,{lostPositions:2,gainedPositions:1}),true);
  assert.equal(t.finish(stage,fixture(),0,72),false,'cannot double-count finish');
  assert.equal(t.replay(stage,false),false,'replay before next countdown is not valid');
  assert.equal(t.start(stage),true);
  assert.equal(t.replay(stage,false),true);
  assert.equal(t.finish(stage,{...fixture(),place:2},1,68),true);
  t.rewardedOutcome('failed');t.rewardedOutcome('completed');
  const s=t.snapshot();
  assert.deepEqual([s.starts,s.finishes,s.rankLosses,s.wins,s.closeRankLosses,s.replayAfterLoss],[2,2,1,1,1,1]);
  assert.deepEqual([s.rewardedRequests,s.rewardedCompletedSignals,s.rewardedNoCredit],[2,1,1]);
  assert.equal(s.passRate,.5);
  assert.equal(s.recent[0].rankGapSeconds,2.1);
  assert.equal(s.recent[0].raceSeconds,72.3);
  assert.equal(storage.obj[RACE_TRIAL_KEY].includes('secret'),false);
});
test('bounded local records, malformed storage and disabled storage never block racing',()=>{
  const storage=store(),t=new RaceTrialMetrics(storage);
  for(let i=0;i<55;i++){
    t.start(stage);t.finish(stage,{...fixture(),stats:{crash:1}},i%2?0:1,70);
  }
  const restored=new RaceTrialMetrics(storage);
  assert.equal(restored.snapshot().recent.length,40);
  assert.equal(restored.snapshot().finishes,55);
  storage.obj[RACE_TRIAL_KEY]='not JSON';
  assert.equal(new RaceTrialMetrics(storage).snapshot().starts,0);
  const broken={getItem(){throw Error('private');},setItem(){throw Error('quota');}};
  const ephemeral=new RaceTrialMetrics(broken);
  assert.equal(ephemeral.start(stage),true);
  assert.equal(ephemeral.finish(stage,fixture(),0,78),true);
  assert.equal(ephemeral.snapshot().finishes,1);
  assert.equal(ephemeral.start({course:'race-99'}),false);
});

test('opt-in local JSON export is parseable, anonymous and does not invent humans or revenue',()=>{
  const storage=store(),t=new RaceTrialMetrics(storage);
  t.start(stage);
  t.finish(stage,fixture(),0,71.3,{gainedPositions:1,lostPositions:2});
  t.rewardedOutcome('completed');
  const raw=t.exportJSON(),data=JSON.parse(raw);
  assert.deepEqual([data.schemaVersion,data.game,data.build],[1,'racing-h5','V6.2']);
  assert.equal(data.generatedOnDevice,true);
  assert.equal(data.verifiedHumanPlay,false);
  assert.equal(data.containsPersonalIdentifiers,false);
  assert.equal(data.metrics.finishes,1);
  assert.equal(data.metrics.rewardedCompletedSignals,1);
  assert.equal(data.metrics.recent[0].rankGapSeconds,2.1);
  for(const key of ['userId','userAgent','revenue','email','ipAddress','deviceId'])
    assert.equal(Object.hasOwn(data,key),false,'never leak PII or fake billing data');
});

test('route savings are real native geometry only; local ledger survives legacy storage',()=>{
  const storage=store(),t=new RaceTrialMetrics(storage);
  t.start(stage);
  t.finish(stage,fixture(),0,71,{},{
    entries:2,completed:1,aborted:1,geometricSavingMeters:46
  });
  const current=t.snapshot();
  assert.deepEqual([current.shortcutEntries,current.shortcutCompletions,
    current.shortcutAborts,current.geometricShortcutMeters],[2,1,1,46]);
  assert.deepEqual([current.recent[0].shortcutEntries,current.recent[0].shortcutCompletions,
    current.recent[0].shortcutAborts,current.recent[0].geometricShortcutMeters],[2,1,1,46]);
  assert.match(JSON.parse(t.exportJSON()).metrics.notes,/几何路程/);
  const restored=new RaceTrialMetrics(storage);
  assert.equal(restored.snapshot().shortcutEntries,2);
  assert.equal(restored.snapshot().recent[0].geometricShortcutMeters,46);
  // Old V6.1 JSON includes none of these counters. It must still be readable.
  const historical=JSON.parse(storage.obj[RACE_TRIAL_KEY]);
  delete historical.shortcutEntries;
  delete historical.shortcutCompletions;
  delete historical.shortcutAborts;
  delete historical.geometricShortcutMeters;
  for(const key of ['shortcutEntries','shortcutCompletions','shortcutAborts',
    'geometricShortcutMeters']) delete historical.recent[0][key];
  storage.obj[RACE_TRIAL_KEY]=JSON.stringify(historical);
  const old=new RaceTrialMetrics(storage).snapshot();
  assert.equal(old.finishes,1);
  assert.equal(old.shortcutEntries,0);
  assert.equal(old.recent[0].shortcutCompletions,0);
});
test('corrupted fork metrics cannot create time savings or paid revenue',()=>{
  const t=new RaceTrialMetrics(store());
  t.start(stage);
  t.finish(stage,fixture(),0,72,{},{
    entries:1,completed:99,aborted:99,geometricSavingMeters:100
  });
  const x=t.snapshot();
  assert.equal(x.shortcutEntries,1);
  assert.equal(x.shortcutCompletions,1);
  assert.equal(x.shortcutAborts,0);
  const raw=t.exportJSON();
  assert.equal(raw.includes('adRevenue'),false);
  assert.equal(raw.includes('secondsSaved'),false);
});
