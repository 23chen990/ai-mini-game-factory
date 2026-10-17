import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceDuelTracker, cornerEntryCue, replayCue, readRaceAttempt, saveRaceAttempt, RETRY_LEDGER_KEY }
  from '../racing/duel-loop.mjs';

const make = () => {
  const player={isPlayer:true,name:'我',progress:100,s:42,d:100,spin:0,
    stats:{crash:0},finished:false};
  const rival={isPlayer:false,name:'追风者',progress:70,s:45,d:70,finished:false};
  return {state:'race',raceTime:5,player,racers:[player,rival],
    standings:[player,rival],track:{curvAhead:()=>0,length:1200,halfW:9}};
};
test('opponent physically crosses the player by meters before a reversal is counted',()=>{
  const g=make(),t=new RaceDuelTracker();
  const originalAI={progress:g.racers[1].progress,s:g.racers[1].s};
  assert.equal(t.frame(g),null);
  g.raceTime=5.5;g.standings=[g.racers[1],g.player];
  assert.equal(t.frame(g),null,'shuffling standings must not create a pass');
  g.raceTime=6;g.player.progress=120;g.racers[1].progress=118;
  assert.equal(t.frame(g),null,'inside 3m hysteresis is not a completed pass');
  g.raceTime=6.8;g.player.progress=138;g.racers[1].progress=148;
  assert.deepEqual(t.frame(g),{title:'追风者反超了你',kind:'threat'});
  assert.equal(t.frame(g),null,'same game time is never double-counted');
  const run=t.snapshot(g,{rank:1});
  assert.equal(run.lostPositions,1);
  assert.equal(run.gainedPositions,0);
  assert.equal(run.gapToPassM,10);
  assert.equal(run.lostLead,1);
  g.raceTime=7.3;g.player.progress=168;g.racers[1].progress=161;
  g.standings=[g.player,g.racers[1]];
  assert.deepEqual(t.frame(g),{title:'你追回了 追风者',kind:'skill'});
  assert.equal(t.snapshot(g,{rank:1}).gainedPositions,1);
  assert.ok(g.racers[1].progress>originalAI.progress,'test moved a physical racer');
  assert.equal(g.racers[1].s,originalAI.s,'tracker never touches velocity');
});
test('non-race, negative progress reset, and near ties cannot fabricate an overtake',()=>{
  const g=make(),t=new RaceDuelTracker();
  g.state='paused';assert.equal(t.frame(g),null);
  g.state='race';t.frame(g);
  g.raceTime=6;g.player.progress=30;g.racers[1].progress=74;
  assert.equal(t.frame(g),null,'native recovery reset is not an earned AI attack');
  assert.equal(t.snapshot(g,{rank:2}).lostPositions,0);
  g.raceTime=6.4;g.player.progress=31;g.racers[1].progress=32;
  assert.equal(t.frame(g),null,'within real distance hysteresis, do not invent pass');
  assert.equal(t.snapshot(g,{rank:2}).lostPositions,0);
});
test('approach/corner/exit gives real native speed loss and crash evidence',()=>{
  const g=make(),t=new RaceDuelTracker();
  g.track.curvAhead=()=>.022;
  t.frame(g);
  g.raceTime=6;g.player.progress=133;g.player.d=133;g.player.s=27;
  g.player.stats.crash=1;
  t.frame(g);
  g.raceTime=7;g.player.progress=173;g.player.d=173;g.player.s=23;
  g.track.curvAhead=()=>.002;
  t.frame(g);
  const run=t.snapshot(g,{rank:1});
  assert.equal(run.corners,1);
  assert.equal(run.cornerContacts,1);
  assert.equal(run.nativeCrashes,1);
  assert.equal(run.worstCornerDropKmh,68);
  assert.equal(run.gainedPositions,0);
  assert.equal(run.lostPositions,0);
});
test('replay shows near miss only from measured native race position, never false seconds',()=>{
  const stage={course:'race-01',rank:3,kind:'race',laps:2};
  const result={finished:true,place:4};
  const cue=replayCue(stage,result,{},{gapToPassM:22,nativeCrashes:2,lostPositions:1});
  assert.match(cue.headline,/只差 22 米/);
  assert.match(cue.tip,/撞墙 2 次/);
  assert.equal(cue.headline.includes('秒'),false);
  const none=replayCue(stage,result,{},{gapToPassM:null,nativeCrashes:0});
  assert.doesNotMatch(none.headline,/只差/);
  const better=replayCue(stage,result,{},{gapToPassM:17},
    {stage:'race-01',finished:true,place:4,gapToPassM:41});
  assert.match(better.headline,/比上局追近 24 米/);
});
test('replay cues prioritize actual mission deficit and rank pressure',()=>{
  const result={finished:true,place:2};
  assert.match(replayCue({kind:'drift',target:5,rank:3,course:'race-04'},
    result,{cleanDrifts:4},{nativeCrashes:0}).tip,/还差 1 次有效漂移/);
  assert.match(replayCue({kind:'speed',target:190,rank:2,course:'race-14'},
    result,{gateSpeed:178},{nativeCrashes:0}).tip,/还差 12 km\/h/);
  assert.match(replayCue({kind:'item',target:4,rank:2,course:'race-15'},
    result,{pickups:3},{nativeCrashes:0}).tip,/还差 1 个/);
  assert.match(replayCue({kind:'race',rank:3,course:'race-01'},
    {finished:true,place:4},{},{lostPositions:2,nativeCrashes:0}).tip,/被真实反超 2 次/);
});
test('anonymous replay snapshot is local, per actual race, bounded and crash-safe',()=>{
  const obj={};
  const storage={getItem:k=>obj[k]??null,setItem:(k,v)=>{obj[k]=v;}};
  const result={finished:true,place:4};
  const run={gapToPassM:17,other:'secret must not persist'};
  assert.equal(readRaceAttempt(storage,'race-01'),null);
  assert.equal(saveRaceAttempt(storage,'race-01',result,run),true);
  assert.deepEqual(readRaceAttempt(storage,'race-01'),{
    stage:'race-01',finished:true,place:4,gapToPassM:17});
  assert.equal(readRaceAttempt(storage,'race-02'),null);
  assert.equal(obj[RETRY_LEDGER_KEY].includes('secret'),false);
  assert.equal(saveRaceAttempt(storage,'daily-2026-10-17',result,run),false);
  const throwing={getItem(){throw Error('private storage');},setItem(){throw Error('quota');}};
  assert.equal(readRaceAttempt(throwing,'race-01'),null);
  assert.equal(saveRaceAttempt(throwing,'race-01',result,run),false);
  obj[RETRY_LEDGER_KEY]='{"v":1,"stage":"race-01","finished":true,"place":99,"gapToPassM":-1}';
  assert.equal(readRaceAttempt(storage,'race-01'),null);
});


test('hard-corner advice is signed native geometry, compact and only inside existing HUD',()=>{
  const g=make();g.player.d=200;g.player.s=37;
  g.track.curvAhead=()=>.024;
  assert.equal(cornerEntryCue(g),'↶ 左急弯·提前入弯');
  g.track.curvAhead=()=>-.024;
  assert.equal(cornerEntryCue(g),'↷ 右急弯·提前入弯');
  g.track.curvAhead=(d)=>d<250?.024:-.02;
  assert.equal(cornerEntryCue(g),'↶↷ S弯·及时反打');
  g.player.s=18;assert.equal(cornerEntryCue(g),'');
  g.player.s=45;g.state='paused';assert.equal(cornerEntryCue(g),'');
  g.state='race';g.player.wrongWay=.9;assert.equal(cornerEntryCue(g),'');
  g.player.wrongWay=0;g.player.airborne=true;assert.equal(cornerEntryCue(g),'');
});
