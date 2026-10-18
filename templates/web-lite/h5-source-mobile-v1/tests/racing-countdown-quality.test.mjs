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

function budgetFixture(state='countdown') {
  let clock=0,ratio=1,width=1366,height=768;
  const listeners=new Map(),calls=[],ratios=[];
  const visibility={hidden:false,addEventListener:(name,callback)=>listeners.set(name,callback)};
  const canvas={width,height,style:{width:'1366px',height:'768px'}};
  const context={identity:'same native WebGL context'};
  const renderer={domElement:canvas,getContext:()=>context,getPixelRatio:()=>ratio,
    setPixelRatio(value){
      assert.equal(this,renderer);ratio=value;ratios.push(value);
      canvas.width=Math.floor(width*ratio);canvas.height=Math.floor(height*ratio);
      return renderer;
    }};
  const game={state,renderer,settings:{quality:'low'},savedQuality:'low',cdT:1.2,raceTime:0,
    camera:{fov:68,aspect:1366/768,position:{x:0,y:3,z:9}},
    track:{length:4000},player:{progress:0,s:0,finished:false},input:{up:false},
    render(dt){calls.push({self:this,dt});return 73;},
    setupQuality(){renderer.setPixelRatio(this.settings.quality==='high'?2:1);return 'native-quality';},
    resize(){renderer.setPixelRatio(1);return 'native-resize';},
    save(){throw Error('Render budget cannot write user preferences');}};
  const install=()=>session.installCountdownQualitySafety(game,{now:()=>clock,document:visibility});
  const frame=ms=>{clock+=ms;return game.render(.05);};
  const at=value=>{clock=value;return game.render(.05);};
  const hidden=value=>{visibility.hidden=value;listeners.get('visibilitychange')?.();};
  const resize=(w,h)=>{width=w;height=h;return game.resize();};
  return {game,renderer,context,canvas,calls,ratios,install,frame,at,hidden,resize};
}
test('persistent foreground lag at low quality reduces drawing pixels within a bounded budget',()=>{
  const x=budgetFixture();x.install();x.frame(0);
  for(let i=0;i<4;i++)x.frame(400);
  assert.ok(x.renderer.getPixelRatio()<1,'low quality must have a fallback below full native pixels');
  for(let i=0;i<100;i++)x.frame(400);
  assert.equal(x.renderer.getPixelRatio(),.35,'the measured emergency floor is bounded');
  assert.ok(x.ratios.every(value=>value>=.35&&value<1));
});
test('ordinary cadence and one expensive frame keep full low-quality resolution',()=>{
  const x=budgetFixture();x.install();x.frame(0);
  for(let i=0;i<120;i++)x.frame(16.7);
  x.frame(1000);
  for(let i=0;i<120;i++)x.frame(16.7);
  assert.equal(x.renderer.getPixelRatio(),1);assert.deepEqual(x.ratios,[]);
});
test('native renderer method behavior is unchanged until a budget is earned and installation stays idempotent',()=>{
  const x=budgetFixture();assert.equal(x.install(),true);
  const setter=x.renderer.setPixelRatio,render=x.game.render;
  assert.equal(x.install(),false);assert.equal(x.renderer.setPixelRatio,setter);assert.equal(x.game.render,render);
  assert.equal(x.renderer.setPixelRatio(1.25),x.renderer);
  assert.equal(x.renderer.getPixelRatio(),1.25);
  for(let i=0;i<120;i++)x.frame(16.7);
  assert.equal(x.renderer.getPixelRatio(),1.25);
});
test('sustained near-12-FPS low-quality rendering also has a bounded fallback',()=>{
  const x=budgetFixture();x.install();x.frame(0);
  for(let i=0;i<65;i++)x.frame(80);
  assert.ok(x.renderer.getPixelRatio()<=.5);
  assert.ok(x.renderer.getPixelRatio()>=.35);
});
test('render-budget fallback preserves native render, game state, camera, viewport and storage',()=>{
  const x=budgetFixture(),g=x.game;
  const before=JSON.stringify({settings:g.settings,player:g.player,camera:g.camera,track:g.track,input:g.input,
    state:g.state,cdT:g.cdT,raceTime:g.raceTime,savedQuality:g.savedQuality,style:x.canvas.style});
  x.install();x.frame(0);
  for(let i=0;i<60;i++)assert.equal(x.frame(400),73);
  assert.equal(x.calls.length,61);
  assert.ok(x.calls.every(call=>call.self===g&&call.dt===.05));
  assert.equal(g.renderer,x.renderer);assert.equal(x.renderer.getContext(),x.context);
  assert.equal(JSON.stringify({settings:g.settings,player:g.player,camera:g.camera,track:g.track,input:g.input,
    state:g.state,cdT:g.cdT,raceTime:g.raceTime,savedQuality:g.savedQuality,style:x.canvas.style}),before);
  assert.ok(x.canvas.width<1366&&x.canvas.height<768);
});
test('a hidden interval without animation frames discards earlier low-quality stall samples',()=>{
  const x=budgetFixture();x.install();x.frame(0);
  for(let i=0;i<3;i++)x.frame(400);
  x.hidden(true);x.hidden(false);x.frame(60000);
  for(let i=0;i<3;i++)x.frame(400);
  assert.equal(x.renderer.getPixelRatio(),1);
  x.frame(400);assert.ok(x.renderer.getPixelRatio()<1);
});
test('paused frames and resuming a race cannot combine unrelated stall intervals',()=>{
  const x=budgetFixture();x.install();x.frame(0);
  for(let i=0;i<3;i++)x.frame(400);
  x.game.state='paused';x.frame(60000);
  x.game.state='countdown';x.frame(400);
  for(let i=0;i<3;i++)x.frame(400);
  assert.equal(x.renderer.getPixelRatio(),1);
  x.frame(400);assert.ok(x.renderer.getPixelRatio()<1);
});
test('invalid or backwards elapsed time resets low-quality samples',()=>{
  for(const invalid of [NaN,Infinity,-100,1200]) {
    const x=budgetFixture();x.install();x.frame(0);
    for(let i=0;i<3;i++)x.frame(400);
    x.at(invalid);x.at(5000);
    for(let i=0;i<3;i++)x.frame(400);
    assert.equal(x.renderer.getPixelRatio(),1,String(invalid));
  }
});
test('native resize and low-quality setup retain a required effective pixel budget',()=>{
  const x=budgetFixture();x.install();x.frame(0);
  for(let i=0;i<50;i++)x.frame(400);
  const ratio=x.renderer.getPixelRatio();
  assert.ok(ratio<1);
  assert.equal(x.game.setupQuality(),'native-quality');
  assert.equal(x.renderer.getPixelRatio(),ratio);
  assert.equal(x.resize(1920,1080),'native-resize');
  assert.equal(x.renderer.getPixelRatio(),ratio);
  assert.equal(x.canvas.width,Math.floor(1920*ratio));
  assert.equal(x.canvas.height,Math.floor(1080*ratio));
  assert.equal(x.game.savedQuality,'low');
});
test('explicit higher quality remains authoritative and later low setup retains the safe budget',()=>{
  const x=budgetFixture();x.install();x.frame(0);
  for(let i=0;i<50;i++)x.frame(400);
  const ratio=x.renderer.getPixelRatio();
  x.game.settings.quality='high';x.game.setupQuality();
  for(let i=0;i<100;i++)x.frame(16.7);
  assert.equal(x.game.settings.quality,'high');assert.equal(x.renderer.getPixelRatio(),2);
  x.game.settings.quality='low';x.game.setupQuality();
  assert.equal(x.renderer.getPixelRatio(),ratio);assert.equal(x.game.savedQuality,'low');
});
test('actual race rendering can degrade low pixels without taking over other quality settings',()=>{
  const x=budgetFixture('race');x.install();x.frame(0);
  for(let i=0;i<6;i++)x.frame(400);
  assert.ok(x.renderer.getPixelRatio()<1);assert.equal(x.game.state,'race');
  const y=budgetFixture('race');y.game.settings.quality='mid';y.install();y.frame(0);
  for(let i=0;i<50;i++)y.frame(400);
  assert.equal(y.game.settings.quality,'mid');assert.equal(y.renderer.getPixelRatio(),1);
});
