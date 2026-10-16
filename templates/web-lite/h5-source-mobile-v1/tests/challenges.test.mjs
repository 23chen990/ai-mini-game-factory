import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../engine.mjs';

test('each source game offers three distinct existing-mechanic challenges',()=>{
  for(const id of ['pelican-bike','qq-speed','cf-transport-ship']) {
    const list=core.challengesFor(id);assert.equal(list.length,3);assert.equal(new Set(list.map(c=>c.id)).size,3);
    for(const c of list)assert.ok(c.title&&c.instructions&&c.limitMs>0);
  }
  assert.throws(()=>core.challengesFor('unknown'));
  assert.equal(core.challengesFor('pelican-bike')[0].limitMs,90000);
  assert.equal(core.challengesFor('pelican-bike')[0].target,8);
});
test('fish targets have an optional jump skill test without requiring random gold spawns',()=>{
  const levels=core.challengesFor('pelican-bike');
  assert.equal(core.challengeResult(levels[0],{points:8},false).outcome,'won');
  assert.equal(core.challengeResult(levels[0],{points:7},true).outcome,'lost');
  assert.equal(core.challengeResult(levels[2],{points:8,jumps:2},false).outcome,'running');
  assert.equal(core.challengeResult(levels[2],{points:8,jumps:3},false).outcome,'won');
});
test('racing uses the actual player finish and rank; intermediate podium and AI finishes cannot win',()=>{
  const levels=core.challengesFor('qq-speed');
  assert.equal(core.challengeResult(levels[0],{finished:false,place:1},true).outcome,'lost');
  assert.equal(core.challengeResult(levels[1],{finished:false,place:2},false).outcome,'running');
  assert.equal(core.challengeResult(levels[1],{finished:true,place:4},true).outcome,'lost');
  assert.equal(core.challengeResult(levels[1],{finished:true,place:3},true).outcome,'won');
  assert.equal(core.challengeResult(levels[2],{finished:true,drifts:1},true).outcome,'lost');
  assert.equal(core.challengeResult(levels[2],{finished:true,drifts:2},true).outcome,'won');
});
test('weapon missions distinguish actual hits, kills and survival, with explicit deadline failure',()=>{
  const levels=core.challengesFor('cf-transport-ship');
  assert.equal(core.challengeResult(levels[0],{hits:3,kills:0,deaths:0},false).outcome,'won');
  assert.equal(core.challengeResult(levels[1],{hits:3,kills:0,deaths:0},true).outcome,'lost');
  assert.equal(core.challengeResult(levels[1],{kills:1,awmKills:1},false).outcome,'won');
  assert.equal(core.challengeResult(levels[2],{deaths:2},false).outcome,'running');
  assert.equal(core.challengeResult(levels[2],{deaths:2,travel:20},true).outcome,'won');
  assert.equal(core.challengeResult(levels[2],{deaths:3},false).outcome,'lost');
});
test('challenge selection and independent best/results persist; old score/ad progress remains compatible',()=>{
  const p=core.newChallengeProgress('pelican-bike');const list=core.challengesFor('pelican-bike');
  p.selected=list[1].id;core.recordChallenge(p,list[1],4,'lost');core.recordChallenge(p,list[1],5,'won');
  assert.equal(p.records[list[1].id].best,5);assert.equal(p.records[list[1].id].wins,1);assert.equal(p.records[list[1].id].attempts,2);
  assert.equal(p.records[list[0].id],undefined);
  assert.deepEqual(core.loadChallengeProgress(core.saveChallengeProgress(p),'pelican-bike'),p);
  assert.equal(core.loadChallengeProgress(core.saveChallengeProgress(p),'qq-speed'),null);
  assert.equal(core.loadChallengeProgress('{bad','pelican-bike'),null);
  const corrupt=JSON.parse(core.saveChallengeProgress(p));corrupt.records[list[1].id].wins=-1;
  assert.equal(core.loadChallengeProgress(JSON.stringify(corrupt),'pelican-bike'),null);
  const old=core.newProgress();assert.deepEqual(core.loadProgress(core.saveProgress(old,'pelican-bike'),'pelican-bike'),old);
});
test('mission points reward real progress rather than crediting nonexistent shooter kills',()=>{
  const [hits,,survival]=core.challengesFor('cf-transport-ship');
  assert.equal(core.challengeResult(hits,{hits:3,kills:0},false).rewardScore,3);
  assert.equal(core.challengeResult(survival,{deaths:1,travel:20},true).rewardScore,3);
  assert.equal(core.challengeResult(survival,{deaths:3},true).rewardScore,0);
});

test('shooter rule cannot be bypassed by a rifle kill or AFK survival',()=>{
  const [,sniper,survival]=core.challengesFor('cf-transport-ship');
  assert.equal(core.challengeResult(sniper,{kills:5,awmKills:0},true).outcome,'lost');
  assert.equal(core.challengeResult(sniper,{kills:1,awmKills:1},false).outcome,'won');
  assert.equal(core.challengeResult(survival,{deaths:0,travel:0},true).outcome,'lost');
  assert.equal(core.challengeResult(survival,{deaths:0,travel:19.9},true).outcome,'lost');
  assert.equal(core.challengeResult(survival,{deaths:0,travel:20},true).outcome,'won');
});


test('CF survival requires the full clock even when native team match ends early',()=>{
  const c=core.challengesFor('cf-transport-ship').find(c=>c.kind==='survive');
  assert.equal(core.challengeResult(c,{deaths:0,travel:55},true,44000).outcome,'lost');
  assert.equal(core.challengeResult(c,{deaths:0,travel:55},false,45000).outcome,'running');
  assert.equal(core.challengeResult(c,{deaths:0,travel:55},true,45000).outcome,'won');
  assert.equal(core.challengeResult(c,{deaths:0,travel:55},true,NaN).outcome,'lost');
  assert.equal(core.challengeResult(c,{deaths:3,travel:55},true,45000).outcome,'lost');
  assert.equal(core.challengeResult(c,{deaths:0,travel:0},true,45000).outcome,'lost');
});

test('CF expert replay is optional, gated by regular win and preserves historical records',()=>{
  const p=core.newChallengeProgress('cf-transport-ship'),c=core.challengesFor('cf-transport-ship')[0];
  assert.equal(p.elite,false);
  core.recordChallenge(p,c,1,'lost');
  assert.equal(p.records[c.id].eliteWins,undefined);
  core.recordChallenge(p,c,3,'won');
  p.elite=true;
  core.recordChallenge(p,{...c,elite:true},3,'lost');
  assert.equal(p.records[c.id].eliteWins,0);
  core.recordChallenge(p,{...c,elite:true},3,'won');
  assert.deepEqual(p.records[c.id],{best:3,attempts:4,wins:2,eliteWins:1});
  assert.deepEqual(core.loadChallengeProgress(core.saveChallengeProgress(p),'cf-transport-ship'),p);
  const prior=JSON.parse(core.saveChallengeProgress(p));
  delete prior.elite;delete prior.records[c.id].eliteWins;
  assert.ok(core.loadChallengeProgress(JSON.stringify(prior),'cf-transport-ship'));
  const bad=JSON.parse(core.saveChallengeProgress(p));
  bad.records[c.id].eliteWins=3;
  assert.equal(core.loadChallengeProgress(JSON.stringify(bad),'cf-transport-ship'),null);
  bad.records[c.id].eliteWins=1;bad.elite='yes';
  assert.equal(core.loadChallengeProgress(JSON.stringify(bad),'cf-transport-ship'),null);
});
