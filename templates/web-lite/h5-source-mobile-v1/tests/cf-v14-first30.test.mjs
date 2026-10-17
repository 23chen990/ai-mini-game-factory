import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cfScoutHoldSeconds,cfScoutReadyDelaySeconds,cfRealCombatFeedback}
  from '../fps-mobile-ux.mjs';
import {cfNewPlaytest,cfLoadPlaytest,cfBeginPlaytest,cfSamplePlaytest,
  cfFinishPlaytest,cfMarkReplay,cfExportPlaytest} from '../cf-player-loop.mjs';

test('V14 first enemy becomes an actual threat within the opening, then returns to native AI',()=>{
  const first={kind:'hits',drill:'reposition',elite:false,limitMs:60000};
  assert.ok(cfScoutReadyDelaySeconds(first)>=3&&cfScoutReadyDelaySeconds(first)<=6,
    'a rookie has a clear 3-6s aim window before bullets can return');
  assert.ok(cfScoutHoldSeconds(first)>=8&&cfScoutHoldSeconds(first)<=12,
    'one opponent must not be held stationary for an entire 60s mission');
  const sniper={kind:'kills',elite:false};
  assert.ok(cfScoutReadyDelaySeconds(sniper)>cfScoutReadyDelaySeconds(first));
  assert.ok(cfScoutHoldSeconds(sniper)>cfScoutHoldSeconds(first));
  assert.ok(cfScoutHoldSeconds({...first,elite:true})<cfScoutHoldSeconds(first));
  assert.ok(cfScoutReadyDelaySeconds({...first,elite:true})<
    cfScoutReadyDelaySeconds(first));
  assert.equal(cfScoutHoldSeconds({kind:'survive'}),7,'other missions unchanged');
});

test('V14 combat effects require a change in actual native hits, kills or damage',()=>{
  const a={hits:2,kills:1,hp:90,alive:true};
  assert.deepEqual(cfRealCombatFeedback(a,a),{kind:null,hpLoss:0,hits:0,kills:0});
  assert.deepEqual(cfRealCombatFeedback(a,{...a,hits:3}),{
    kind:'hit',hpLoss:0,hits:1,kills:0});
  assert.deepEqual(cfRealCombatFeedback(a,{...a,hits:3,kills:2}),{
    kind:'kill',hpLoss:0,hits:1,kills:1});
  assert.deepEqual(cfRealCombatFeedback(a,{...a,hp:68}),{
    kind:'damage',hpLoss:22,hits:0,kills:0});
  assert.deepEqual(cfRealCombatFeedback(a,{...a,alive:false,hp:0}),{
    kind:null,hpLoss:0,hits:0,kills:0},'do not duplicate native death effect');
  assert.deepEqual(cfRealCombatFeedback(a,{...a,hp:100,hits:0,kills:0}),{
    kind:null,hpLoss:0,hits:0,kills:0},'new player respawn cannot flash phantom hits');
  assert.deepEqual(cfRealCombatFeedback(null,a),{kind:null,hpLoss:0,hits:0,kills:0});
});

test('V14 first30 local record captures only real native counter increases, not a predicted hit',()=>{
  const book=cfNewPlaytest();
  const s=cfBeginPlaytest(book,'tags',{shots:2,hits:1,k:0,d:0});
  assert.equal(book.starts,1);
  cfSamplePlaytest(s,1500,{shots:2,hits:1,k:0,d:0,travel:0});
  assert.equal(s.firstShotMs,null);
  cfSamplePlaytest(s,1800,{shots:3,hits:1,k:0,d:0,travel:0});
  cfSamplePlaytest(s,2900,{shots:3,hits:2,k:0,d:0,travel:1.8});
  cfSamplePlaytest(s,12000,{shots:6,hits:4,k:1,d:0,travel:9.1});
  cfSamplePlaytest(s,20000,{shots:6,hits:4,k:1,d:0,travel:9.1});
  cfSamplePlaytest(s,36000,{shots:6,hits:4,k:1,d:0,travel:9.1});
  const entry=cfFinishPlaytest(book,s,45876,'lost',
    {shots:6,hits:4,k:1,d:2,travel:28});
  assert.equal(book.finishes,1);
  assert.equal(entry.mission,'tags');
  assert.equal(entry.durationSec,46);
  assert.equal(entry.firstShotMs,1800);
  assert.equal(entry.firstHitMs,2900);
  assert.equal(entry.firstMoveMs,2900);
  assert.equal(entry.firstKillMs,12000);
  assert.equal(entry.shots,4);assert.equal(entry.hits,3);
  assert.equal(entry.kills,1);assert.equal(entry.deaths,2);
  assert.equal(entry.result,'lost');
  assert.equal(cfFinishPlaytest(book,s,46000,'won',{shots:40,hits:30,k:8,d:0}),entry,
    'a stale callback cannot create a second win or alter the genuine loss');
  assert.equal(book.finishes,1);
});

test('V14 replay statistic counts only deliberate finished-game free retry',()=>{
 const book=cfNewPlaytest();
 assert.equal(cfMarkReplay(book,{phase:'running',outcome:'lost'}),false);
 assert.equal(cfMarkReplay(book,{phase:'finished',outcome:'won'}),false);
 assert.equal(cfMarkReplay(book,{phase:'finished',outcome:'lost'}),true);
 assert.equal(book.retriesAfterLoss,1);
 assert.equal(book.claimedAdViews,undefined,'no fabricated revenue/impressions field');
});

test('V14 first30 analytics are strictly local, bounded, versioned and safe on bad storage',()=>{
 const book=cfNewPlaytest();
 for(let i=0;i<44;i++){
   const session=cfBeginPlaytest(book,i%2===0?'tags':'precision');
   cfSamplePlaytest(session,30000,{shots:0,hits:0,k:0,d:0,travel:0});
   cfFinishPlaytest(book,session,45000,'lost',{shots:0,hits:0,k:0,d:0,travel:0});
 }
 assert.ok(book.recent.length<=30);
 const json=cfExportPlaytest(book);
 const data=JSON.parse(json);
 assert.equal(data.scope,'only-local-voluntary-export');
 assert.equal(data.notRetentionOrRevenueProof,true);
 assert.ok(!/(userAgent|ipAddress|deviceId|geo|fingerprint|personalId)/i.test(json));
 assert.deepEqual(cfLoadPlaytest(JSON.stringify(book)),book);
 for(const invalid of ['oops','{}','{"version":2}',null,
   '{"version":1,"starts":-1,"finishes":0,"retriesAfterLoss":0,"recent":[]}']){
   assert.deepEqual(cfLoadPlaytest(invalid),cfNewPlaytest());
 }
});

test('V14 local metrics run from existing registered CF-only runtime module',()=>{
  const main=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
  assert.equal(main.includes('cf-playtest-metrics.mjs'),false);
  assert.equal(main.match(/^import /gm)?.length,4,'standalone H5 supports exactly four registered imports');
});
