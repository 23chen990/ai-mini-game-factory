import test from 'node:test';
import assert from 'node:assert/strict';
import {cfReactToRealScoutThreat} from '../fps-mobile-ux.mjs';
import {cfNewPlaytest,cfLoadPlaytest,cfBeginPlaytest,cfSamplePlaytest,
  cfFinishPlaytest,cfExportPlaytest} from '../cf-player-loop.mjs';

const rifle={id:'tags',kind:'hits',drill:'reposition',elite:false};
const fighter=()=>({
  __mobileTrainingScout:true,alive:true,team:'GR',readyAt:4.5,
  __mobileTrainingHoldUntil:10,lastHurt:-99,lastAttacker:null
});
const player=()=>({alive:true,team:'BL',stats:{shots:0}});
test('V16 first native shot alerts only the real opposing opening scout',()=>{
  const foe=fighter(),me=player();
  assert.equal(cfReactToRealScoutThreat({actor:foe,player:me,challenge:rifle,now:1.5}),false);
  assert.equal(foe.readyAt,4.5);
  me.stats.shots=1;
  assert.equal(cfReactToRealScoutThreat({actor:foe,player:me,challenge:rifle,now:1.6}),true);
  assert.equal(foe.__mkIntroThreatStage,1);
  assert.ok(foe.readyAt<=3.81 && foe.readyAt>1.6);
  assert.ok(foe.__mobileTrainingHoldUntil<=6.11);
  assert.equal(cfReactToRealScoutThreat({actor:foe,player:me,challenge:rifle,now:1.8}),false);
  assert.equal(foe.__mkIntroThreatStage,1,'do not renew a once-observed alarm each frame');
});
test('V16 real received hit accelerates return fire without player-health edits',()=>{
  const foe=fighter(),me=player();
  foe.lastHurt=1.75;foe.lastAttacker=me;
  assert.equal(cfReactToRealScoutThreat({actor:foe,player:me,challenge:rifle,now:1.9}),true);
  assert.equal(foe.__mkIntroThreatStage,2);
  assert.ok(foe.readyAt<=3.01 && foe.readyAt>=1.9);
  assert.ok(foe.__mobileTrainingHoldUntil<=4.61);
  assert.equal(me.stats.shots,0,'native damage event, not fabricated player shooting');
  assert.equal(foe.hp,undefined,'response must not modify bot health');
});
test('V16 counters cannot wake unrelated, friendly, hidden or stale bots',()=>{
  const me=player(),list=[
    {actor:{...fighter(),team:'BL'},player:me,challenge:rifle,now:2},
    {actor:{...fighter(),alive:false},player:me,challenge:rifle,now:2},
    {actor:{...fighter(),__mobileTrainingScout:false},player:me,challenge:rifle,now:2},
    {actor:fighter(),player:me,challenge:{...rifle,elite:true},now:2},
    {actor:fighter(),player:me,challenge:{...rifle,id:'survive'},now:2},
    {actor:fighter(),player:me,challenge:rifle,now:NaN},
  ];
  me.stats.shots=2;
  for(const x of list)assert.equal(cfReactToRealScoutThreat(x),false,JSON.stringify(x.challenge));
  const old=fighter();old.lastAttacker=me;old.lastHurt=0;
  me.stats.shots=0;
  assert.equal(cfReactToRealScoutThreat({actor:old,player:me,challenge:rifle,now:5}),false);
});

test('V16 local first30 records only original enemy shots and actual enemy damage',()=>{
  const book=cfNewPlaytest();
  const b={shots:0,hits:0,k:0,d:0,enemyShots:4,hp:100,travel:0};
  const s=cfBeginPlaytest(book,'tags',b);
  cfSamplePlaytest(s,900,{...b,enemyShots:4,hp:100,recentEnemyDamage:false});
  cfSamplePlaytest(s,1760,{...b,enemyShots:6,hp:100,recentEnemyDamage:false});
  cfSamplePlaytest(s,2410,{...b,enemyShots:7,hp:88,recentEnemyDamage:true});
  cfSamplePlaytest(s,3700,{...b,enemyShots:9,hp:92,recentEnemyDamage:false});
  cfSamplePlaytest(s,5100,{...b,enemyShots:10,hp:68,recentEnemyDamage:false,k:1});
  assert.equal(s.firstEnemyShotMs,1800);
  assert.equal(s.firstDamageMs,2400,'only native HP loss with an enemy as fresh attacker');
  assert.equal(s.firstKillMs,5100);
  const entry=cfFinishPlaytest(book,s,42000,'lost',{
    ...b,enemyShots:12,hp:68,k:1});
  assert.equal(entry.enemyShots,8);
  assert.equal(entry.firstEnemyShotMs,1800);
  assert.equal(entry.firstDamageMs,2400);
  assert.equal(entry.firstKillMs,5100);
  assert.equal(book.recent.length,1);
  const data=cfLoadPlaytest(JSON.stringify(book));
  assert.deepEqual(data,book);
  const exported=cfExportPlaytest(book);
  assert.ok(!/(deviceId|userAgent|ipAddress|adRevenue|GPS)/i.test(exported));
});
test('V16 never mistakes respawn HP reset for new attack or invented victim',()=>{
 const book=cfNewPlaytest();
 const s=cfBeginPlaytest(book,'survive',{hp:100,d:0,enemyShots:0});
 cfSamplePlaytest(s,4000,{hp:100,d:0,enemyShots:0,recentEnemyDamage:false});
 cfSamplePlaytest(s,4900,{hp:100,d:1,enemyShots:0,recentEnemyDamage:true});
 cfSamplePlaytest(s,5200,{hp:94,d:1,enemyShots:0,recentEnemyDamage:false});
 assert.equal(s.firstDamageMs,null);
 assert.equal(s.firstEnemyShotMs,null);
 cfSamplePlaytest(s,5900,{hp:80,d:1,enemyShots:0,recentEnemyDamage:true});
 assert.equal(s.firstDamageMs,5900);
});
test('V16 accepts V14/V15 saved playtests without clearing 30 existing runs',()=>{
 const prior={version:1,starts:1,finishes:1,retriesAfterLoss:0,recent:[{
   mission:'tags',result:'lost',durationSec:30,assisted:false,
   firstMoveMs:1000,firstShotMs:1500,firstHitMs:2000,firstKillMs:null,
   shots:7,hits:2,kills:0,deaths:2
 }]};
 const loaded=cfLoadPlaytest(JSON.stringify(prior));
 assert.equal(loaded.finishes,1);
 assert.equal(loaded.recent[0].hits,2);
 assert.equal(loaded.recent[0].firstEnemyShotMs,null);
 assert.equal(loaded.recent[0].firstDamageMs,null);
 assert.equal(loaded.recent[0].enemyShots,0);
 const invalid={...prior,recent:[{...prior.recent[0],enemyShots:-2}]};
 assert.deepEqual(cfLoadPlaytest(JSON.stringify(invalid)),cfNewPlaytest());
});
