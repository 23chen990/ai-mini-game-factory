import test from 'node:test';
import assert from 'node:assert/strict';
import * as session from '../racing/session.mjs';
function fixture(quality='mid') {
  let clock=0;
  const nativeCalls=[];
  const game={state:'countdown',settings:{quality},cdT:1.2,raceTime:0,
    player:{progress:0,finished:false,s:0},savedQuality:quality,rebuilds:[],
    render(dt){nativeCalls.push({self:this,dt});return 73;},
    setupQuality(){this.rebuilds.push(this.settings.quality);},
    save(){throw Error('A transient quality downgrade must not rewrite preferences');}};
  const install=()=>session.installCountdownQualitySafety(game,{now:()=>clock});
  const frame=ms=>{clock+=ms;return game.render(.05);};
  return {game,nativeCalls,install,frame};
}
test('repeated long render stalls can lower graphics before the race begins',()=>{
  const x=fixture();x.install();x.frame(0);
  for(let i=0;i<4;i++)x.frame(400);
  assert.equal(x.game.settings.quality,'low');
  assert.deepEqual(x.game.rebuilds,['low']);
  assert.equal(x.game.savedQuality,'mid');
});
test('countdown protection retains the native renderer and does not advance the game',()=>{
  const x=fixture(),player=JSON.stringify(x.game.player);x.install();
  for(let i=0;i<10;i++)assert.equal(x.frame(500),73);
  assert.equal(x.nativeCalls.length,10);
  assert.ok(x.nativeCalls.every(call=>call.self===x.game&&call.dt===.05));
  assert.equal(JSON.stringify(x.game.player),player);
  assert.equal(x.game.state,'countdown');assert.equal(x.game.cdT,1.2);assert.equal(x.game.raceTime,0);
});
test('normal frame cadence and an isolated stall leave selected graphics unchanged',()=>{
  const x=fixture('high');x.install();x.frame(0);
  for(let i=0;i<120;i++)x.frame(16.7);
  x.frame(600);
  for(let i=0;i<120;i++)x.frame(16.7);
  assert.equal(x.game.settings.quality,'high');assert.deepEqual(x.game.rebuilds,[]);
});
test('pause and return do not combine unrelated stalls into a downgrade',()=>{
  const x=fixture();x.install();x.frame(0);
  for(let i=0;i<3;i++)x.frame(400);
  x.game.state='paused';x.frame(60000);
  x.game.state='countdown';x.frame(16);
  for(let i=0;i<3;i++)x.frame(400);
  assert.equal(x.game.settings.quality,'mid');
});
test('race/menu/finished states keep the existing quality owner',()=>{
  for(const state of ['race','menu','finish','paused']){
    const x=fixture();x.game.state=state;x.install();
    for(let i=0;i<30;i++)x.frame(500);
    assert.equal(x.game.settings.quality,'mid',state);
  }
});
test('installation is idempotent and invalid rendering interfaces are ignored',()=>{
  const x=fixture();assert.equal(x.install(),true);const once=x.game.render;
  assert.equal(x.install(),false);assert.equal(x.game.render,once);
  assert.equal(session.installCountdownQualitySafety({}),false);
  assert.equal(session.installCountdownQualitySafety(null),false);
});
test('severe continuous low FPS can step high to mid to low without changing preference',()=>{
  const x=fixture('high');x.install();x.frame(0);
  for(let i=0;i<40;i++)x.frame(80);
  assert.deepEqual(x.game.rebuilds,['mid','low']);assert.equal(x.game.savedQuality,'high');
});
test('actual runtime FX setup installs the countdown guard even when no particle pools exist',()=>{
  const x=fixture(),native=x.game.render;
  session.tuneRaceFx(x.game);
  assert.notEqual(x.game.render,native);
  const first=x.game.render;session.tuneRaceFx(x.game);assert.equal(x.game.render,first);
});
