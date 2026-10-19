import test from 'node:test';
import assert from 'node:assert/strict';
import {cfNativeKillPayoff,cfBattleRecap,cfFirstKillWinBanner} from '../fps-mobile-ux.mjs';

test('CF V17 shows first REAL player elimination only on native kill counter increase',()=>{
  assert.equal(cfNativeKillPayoff(0,0),'');
  assert.equal(cfNativeKillPayoff(0,1),'✦ 首杀 · 打开突破口');
  assert.equal(cfNativeKillPayoff(1,2),'✦ 亲手击倒 +1');
  assert.equal(cfNativeKillPayoff(1,3),'✦ 连续击倒 +2');
  assert.equal(cfNativeKillPayoff(2,0),'','round reset is not a kill');
  for(const input of [[NaN,1],[-1,0],[0,-2],[1,Infinity],[1,1.5],[.4,1]])
    assert.equal(cfNativeKillPayoff(...input),'','malformed counters cannot award a kill');
});

test('CF V17 postround recap reports original player and enemy shots independently',()=>{
  const native={shots:12,hits:8,kills:1,enemyShots:37};
  assert.equal(cfBattleRecap(native,3400),
    '实战：命中8次 · 亲手击倒1人 · 敌方开火37发 · 首杀3.4秒');
  assert.equal(cfBattleRecap({...native,kills:0},3400),
    '实战：命中8次 · 亲手击倒0人 · 敌方开火37发');
  assert.equal(cfBattleRecap({...native,enemyShots:0},null),
    '实战：命中8次 · 亲手击倒1人 · 敌方开火0发');
  assert.equal(cfBattleRecap({shots:5,hits:6,kills:1,enemyShots:0},300),
    '实战：命中6次 · 亲手击倒1人 · 敌方开火0发 · 首杀0.3秒',
    'one bullet can produce multiple genuine original hit callbacks');
});

test('CF V17 refuses phantom result counts, future time and missing evidence',()=>{
  for(const v of [null,{}, {shots:2,hits:1,kills:1},
    {shots:4,hits:NaN,kills:1,enemyShots:1},
    {shots:1,hits:1,kills:-1,enemyShots:1},
    {shots:1,hits:1,kills:1,enemyShots:-1}])
    assert.equal(cfBattleRecap(v,500),'');
  assert.equal(cfBattleRecap({shots:10,hits:1,kills:1,enemyShots:3},45000),
    '实战：命中1次 · 亲手击倒1人 · 敌方开火3发');
  assert.equal(cfBattleRecap({shots:10,hits:1,kills:1,enemyShots:3},-1),
    '实战：命中1次 · 亲手击倒1人 · 敌方开火3发');
});

test('Fast solo first-kill win remains visible in result, never granted from a non-win',()=>{
 const challenge={id:'tags',lite:true,title:'01 · 货箱破门'};
 const metrics={shots:2,hits:2,kills:1,enemyShots:0};
 assert.equal(cfFirstKillWinBanner(challenge,metrics,'won'),
   '✦ 首杀达成 · 01 · 货箱破门完成！');
 assert.equal(cfFirstKillWinBanner(challenge,{...metrics,kills:0},'won'),'');
 assert.equal(cfFirstKillWinBanner(challenge,metrics,'lost'),'');
 assert.equal(cfFirstKillWinBanner({...challenge,id:'survive'},metrics,'won'),'');
 assert.equal(cfFirstKillWinBanner({...challenge,lite:false},metrics,'won'),'');
 assert.equal(cfFirstKillWinBanner(challenge,{...metrics,kills:NaN},'won'),'');
});
