import test from 'node:test';
import assert from 'node:assert/strict';
import {challengesFor,challengeResult,cfEliteChallenge,cfStartDefense,cfStepDefense} from '../engine.mjs';
import {cfChooseDefenseSites,cfRouteDefenseBots,cfTouchTutorial,mobileChallengeCopy,
  cfMissionFacts,cfMissionDebrief,cfResultFacts} from '../fps-mobile-ux.mjs';
import {cfNewMastery,cfRecordMastery,cfRecordLabel,cfLoadMastery,cfSaveMastery} from '../cf-player-loop.mjs';

const c=challengesFor('cf-transport-ship').find(item=>item.id==='defense');
const points=[{id:'A',x:-20,z:-6.8},{id:'B',x:-8,z:6.8}];
const me={alive:true,team:'BL',pos:{x:-20,z:-6.8}};
const foe={alive:true,team:'GR',pos:{x:25,z:2},lastSeenT:-99,
  stats:{d:0},weapon:{mag:30},hp:100,role:'rush',path:null,pi:0};
function step(state,time,{player=me,enemies=[foe]}={}) {
 return cfStepDefense(state,{gameTime:time,player,actors:enemies,team:'BL',
   holdSeconds:c.holdSeconds,breachSeconds:c.breachSeconds,radius:c.radius});
}
function repeat(state,start,end,options={}) {
 for(let t=start;t<=end+1e-6;t=+(t+.1).toFixed(2))
   state=step(state,t,options);
 return state;
}

test('CF defense is a fourth truly distinct mode, without altering three legacy missions',()=>{
 const missions=challengesFor('cf-transport-ship');
 assert.deepEqual(missions.map(item=>item.id),['tags','precision','survive','defense']);
 assert.equal(c.kind,'defend');assert.equal(c.target,2);
 assert.equal(c.limitMs,100000);assert.equal(c.holdSeconds,5);
 assert.equal(c.breachSeconds,8);assert.equal(c.maxDeaths,2);
 const elite=cfEliteChallenge(c);
 assert.equal(elite.elite,true);assert.equal(elite.holdSeconds,7);
 assert.equal(elite.maxDeaths,0);assert.equal(elite.limitMs,85000);
 assert.equal(elite.breachSeconds,7);
 assert.equal(challengesFor('pelican-bike').length,3);
 assert.equal(challengesFor('qq-speed').length,3);
});

test('two sites require real authored walkable routes for both player and living opponent',()=>{
 const paths=[];
 const nav={idx:()=>4,walkable:()=>true,
   findPath:(x,z,a,b)=>{paths.push([x,z,a,b]);return [[x,z],[a,b]];}};
 const world={blocked:()=>false};
 const own={pos:{x:-31,z:-7},team:'BL'};
 const bots=[{alive:true,team:'GR',pos:{x:31,z:7}}];
 const sites=cfChooseDefenseSites({player:own,nav,world,actors:bots});
 assert.deepEqual(sites,[{id:'A',x:-22,z:-6.8},{id:'B',x:-8,z:6.8}]);
 assert.ok(paths.length>=4,'every site has both a player path and a bot path');
 assert.ok(Math.hypot(sites[0].x-sites[1].x,sites[0].z-sites[1].z)>8);
 const mirrored=cfChooseDefenseSites({
   player:{pos:{x:31,z:7},team:'GR'},nav,world,
   actors:[{alive:true,team:'BL',pos:{x:-31,z:-7}}]
 });
 assert.deepEqual(mirrored,[{id:'A',x:22,z:6.8},{id:'B',x:8,z:-6.8}]);
 assert.equal(cfChooseDefenseSites({player:own,nav,world,actors:[]}),null);
 assert.equal(cfChooseDefenseSites({player:own,nav,world:{
   blocked:()=>true},actors:bots}),null);
 assert.equal(cfChooseDefenseSites({player:own,nav:{...nav,findPath:()=>null},
   world,actors:bots}),null);
});

test('one enemy actually follows a native NavGrid path and retains original combat properties',()=>{
 const planned=[],nav={findPath:(x,z,tx,tz)=>{
   planned.push([x,z,tx,tz]);return [[x,z],[tx,tz]];}};
 const bot={...foe,pos:{x:26,z:7},stats:{d:0},path:null};
 const scene={player:me,nav,actors:[me,bot],time:0};
 assert.equal(cfRouteDefenseBots(scene,points[0]),1);
 assert.deepEqual(bot.goal,[-20,-6.8]);
 assert.equal(bot.role,'rush');assert.equal(bot.pi,1);
 assert.equal(planned.length,1);
 assert.equal(bot.hp,100);assert.equal(bot.weapon.mag,30);
 assert.deepEqual(bot.pos,{x:26,z:7},'No teleport or spawn change');
 assert.equal(cfRouteDefenseBots(scene,points[0]),0,
   'Do not restart an already underway path every browser frame');
 bot.visible=true;
 assert.equal(cfRouteDefenseBots(scene,points[1]),0,
   'Native vision and attack supersede scripted mission routing');
 bot.visible=false;bot.lastSeenT=-99;bot.stats.d=1;
 assert.equal(cfRouteDefenseBots(scene,points[1]),1,
   'Native respawn may replan to the new active site');
 assert.deepEqual(bot.goal,[-8,6.8]);
});

test('genuine player needs to defend A then B for independent real-time spans',()=>{
 let s=cfStartDefense(points);
 assert.equal(s.valid,true);assert.equal(s.stage,0);
 s=repeat(s,0,5.1);
 assert.equal(s.captured,1);assert.equal(s.stage,1);
 assert.ok(s.held<1,'First location time never carries into B');
 assert.equal(challengeResult(c,{defenseSitesValid:true,defenseCaptured:1,
   defenseStage:1,deaths:0},false).outcome,'running');
 const atB={...me,pos:{x:-8,z:6.8}};
 s=repeat(s,5.2,10.6,{player:atB});
 assert.equal(s.captured,2);assert.equal(s.stage,2);
 const actual={defenseSitesValid:s.valid,defenseCaptured:s.captured,
   defenseStage:s.stage,defenseBreached:s.breached,deaths:1};
 const result=challengeResult(c,actual,false);
 assert.equal(result.outcome,'won');assert.equal(result.rewardScore,5);
 assert.equal(cfStepDefense(s,{gameTime:99,player:atB,actors:[foe],team:'BL'}),s,
   'Terminal score cannot advance to ghost third point');
});

test('AFK, idle teammate, dead player, visible enemy contest and wall-clock jump never capture',()=>{
 let s=cfStartDefense(points);
 s=repeat(s,0,13,{player:{...me,pos:{x:-35,z:0}}});
 assert.equal(s.captured,0);assert.equal(s.held,0);
 s=repeat(s,13.1,21,{player:{...me,alive:false}});
 assert.equal(s.captured,0);
 s=repeat(s,21.1,28,{enemies:[{...foe,pos:{x:-20,z:-6.8}}]});
 assert.equal(s.captured,0);
 assert.equal(s.contested,true);
 const frozen=cfStepDefense(s,{gameTime:27,player:me,actors:[foe],team:'BL'});
 assert.equal(frozen,s,'Backward native clock must be discarded');
 const jump=cfStepDefense(s,{gameTime:500,player:me,actors:[foe],team:'BL'});
 assert.ok(jump.held<1,'An arbitrary huge browser wall-time gap cannot grant 5s control');
 assert.equal(jump.captured,0);
 assert.equal(cfStartDefense(null).valid,false);
 assert.equal(cfStartDefense([{id:'A',x:2,z:0},{id:'B',x:5,z:0}]).valid,false);
});

test('enemy must be genuinely alive on contested site to build breach clock',()=>{
 let s=cfStartDefense(points);
 const bot={...foe,pos:{x:-20,z:-6.8}};
 const away={...me,pos:{x:-36,z:0}};
 s=repeat(s,0,8.2,{player:away,enemies:[bot]});
 assert.equal(s.breached,true);
 assert.equal(s.captured,0);
 assert.equal(challengeResult(c,{defenseSitesValid:true,defenseCaptured:0,
   defenseStage:0,defenseBreached:true,deaths:0},false).outcome,'lost');
 const noEnemy=repeat(cfStartDefense(points),0,9,
   {player:away,enemies:[{...bot,alive:false}]});
 assert.equal(noEnemy.breached,false);
 assert.equal(noEnemy.enemyHeld,0);
 const lost=challengeResult(c,{defenseSitesValid:false,
   defenseCaptured:2,defenseStage:2,deaths:0},false);
 assert.equal(lost.outcome,'lost','Invalid map cannot mint an unearned win');
});

test('death budget, elite restrictions and high-score cannot substitute for site occupancy',()=>{
 const done={defenseSitesValid:true,defenseCaptured:2,defenseStage:2,
   defenseBreached:false,deaths:0};
 assert.equal(challengeResult(c,{...done,deaths:3},false).outcome,'lost');
 assert.equal(challengeResult(c,{...done,defenseCaptured:1},true).outcome,'lost');
 assert.equal(challengeResult(c,{...done,defenseBreached:true},false).outcome,'lost');
 assert.equal(challengeResult(c,{hits:100,kills:100,deaths:0},true).outcome,'lost');
 const elite=cfEliteChallenge(c);
 assert.equal(challengeResult(elite,{...done,deaths:1},false).outcome,'lost');
 assert.equal(challengeResult(elite,done,false).outcome,'won');
 const profile=cfNewMastery();
 const notWon=cfRecordMastery(profile,c,{...done,shots:8,hits:4},
   'lost',20000);
 assert.equal(notWon.medal,null);
 const won=cfRecordMastery(profile,c,{...done,shots:8,hits:4},'won',60000);
 assert.ok(won.medal?.stars>=1);
 assert.match(cfRecordLabel(profile,c),/最速/);
 assert.deepEqual(cfLoadMastery(cfSaveMastery(profile)),profile);
});

test('point UI shows the real mission mechanics and honest loss information',()=>{
 assert.match(cfTouchTutorial(c),/据点/);
 assert.match(mobileChallengeCopy(c),/100秒双点反击/);
 assert.match(mobileChallengeCopy(cfEliteChallenge(c)),/零阵亡/);
 const cards=cfMissionFacts(c);
 assert.equal(cards.length,3);assert.match(cards[1].value,/A → B/);
 const facts=cfResultFacts(c,{defenseCaptured:1,defenseBreached:true,deaths:2});
 assert.equal(facts.length,3);assert.equal(facts[0].value,'1 / 2');
 assert.match(cfMissionDebrief(c,{defenseCaptured:1,
   defenseBreached:true,defenseSitesValid:true},'lost'),/独占/);
 assert.match(cfMissionDebrief(c,{defenseCaptured:0,
   defenseBreached:false,defenseSitesValid:true,deaths:0},'lost'),/玩家亲自/);
});
