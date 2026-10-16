import test from 'node:test';
import assert from 'node:assert/strict';
import { awardCornerPass } from '../racing/items.mjs';

function race(itemMode=true, options={}) {
  const player={ isPlayer:true, s:43, spin:0, slowTime:0, smallBoost:0,
    smallBoostPower:0, nitroTime:0, items:[], progress:150, ...options };
  const opponent={ isPlayer:false, progress:155 };
  const events=[];
  const game={state:'race',itemMode,player,standings:[player,opponent],racers:[player,opponent],
    items:{giveRandom(p,rank,total){ events.push({rank,total,bonus:game.__RACE_BONUS_DROP__});p.items.push('nitro'); }},
  };
  return {game,player,events};
}

test('a VERIFIED corner overtake in item mode earns a short native boost and one bonus item',()=>{
  const {game,player,events}=race();
  const before={s:player.s,progress:player.progress};
  assert.equal(awardCornerPass(game),'item+boost');
  assert.deepEqual(events,[{rank:1,total:2,bonus:true}]);
  assert.deepEqual(player.items,['nitro']);
  assert.ok(player.smallBoost>0&&player.smallBoost<=.5);
  assert.equal(player.smallBoostPower,9);
  assert.deepEqual({s:player.s,progress:player.progress},before,
    'earned boost uses native acceleration on later physics ticks, never fake speed/progress');
  assert.equal(game.__RACE_BONUS_DROP__,false,'bonus attribution may not leak into next box pickup');
});

test('item-race boost does not stack when already boosted, stunned or critically slow',()=>{
  for(const state of [{smallBoost:.8},{nitroTime:1},{spin:.3},{slowTime:.5},{s:12}]) {
    const {game,player}=race(true,{items:['shield','banana'],...state});
    const before={smallBoost:player.smallBoost,smallBoostPower:player.smallBoostPower};
    assert.equal(awardCornerPass(game),'none',JSON.stringify(state));
    assert.deepEqual({smallBoost:player.smallBoost,smallBoostPower:player.smallBoostPower},before);
  }
});

test('item race with full inventory can earn a clean-pass boost without forging another item',()=>{
  const {game,player,events}=race(true,{items:['shield','banana']});
  assert.equal(awardCornerPass(game),'boost');
  assert.equal(events.length,0);
  assert.equal(player.items.length,2);
  assert.equal(player.smallBoostPower,9);
});

test('original speed-mode clean-pass reward is preserved',()=>{
  const {game,player,events}=race(false);
  assert.equal(awardCornerPass(game),'boost');
  assert.equal(player.smallBoost,.45);
  assert.equal(player.smallBoostPower,11);
  assert.equal(events.length,0);
});

test('no race and no player never create an acceleration reward',()=>{
  const {game,player}=race();
  game.state='paused';assert.equal(awardCornerPass(game),'none');
  game.state='race';game.player=null;assert.equal(awardCornerPass(game),'none');
  assert.equal(player.smallBoost,0);
});
