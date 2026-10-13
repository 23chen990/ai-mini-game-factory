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
  assert.equal(core.challengeResult(levels[1],{kills:1},false).outcome,'won');
  assert.equal(core.challengeResult(levels[2],{deaths:2},false).outcome,'running');
  assert.equal(core.challengeResult(levels[2],{deaths:2},true).outcome,'won');
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
  assert.equal(core.challengeResult(survival,{deaths:1},true).rewardScore,3);
  assert.equal(core.challengeResult(survival,{deaths:3},true).rewardScore,0);
});
