/* global URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cfResetMobileTouch,cfJoystickVector,cfWarmRestartAllowed} from '../fps-mobile-ux.mjs';

test('CF V12 interrupted multitouch releases native fire, joystick and unconsumed tap',()=>{
  const player={
    touch:{fire:true,firePressed:true,jump:true,mx:.7,mz:-.8},
    touchLook:{x:67,y:-28},
    mouse:{l:true,r:true,lp:true,rp:true},
    stats:{shots:7,hits:3,k:1,d:2}
  };
  const aimTouches=new Map([[12,{x:430,y:130}]]);
  const fireTouches=new Map([[18,{x:570,y:232}]]);
  assert.equal(cfResetMobileTouch(player,aimTouches,fireTouches),true);
  assert.equal(aimTouches.size,0);
  assert.equal(fireTouches.size,0);
  assert.deepEqual(player.touch,{fire:false,firePressed:false,jump:false,mx:0,mz:0});
  assert.deepEqual(player.touchLook,{x:0,y:0});
  assert.deepEqual(player.mouse,{l:false,r:false,lp:false,rp:false});
  assert.deepEqual(player.stats,{shots:7,hits:3,k:1,d:2},
    'interrupted gestures cannot manufacture or remove any combat result');
});

test('CF V12 touch reset is idempotent and tolerates pre-spawn or missing maps',()=>{
  const aim=new Map([[1,{}]]),fire=new Map([[2,{}]]);
  assert.equal(cfResetMobileTouch(null,aim,fire),true);
  assert.equal(aim.size,0);
  assert.equal(fire.size,0);
  assert.equal(cfResetMobileTouch(null,aim,fire),false);
  const player={touch:{fire:false,firePressed:false,mx:0,mz:0,jump:false}};
  assert.equal(cfResetMobileTouch(player),false);
  assert.equal(cfResetMobileTouch(player),false);
});

test('CF V12 game-only touch suppression does not disable scrolling in ready dialogs',()=>{
  const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
  const activeSelector='html[data-reference-game="cf-transport-ship"][data-fps-active="true"]';
  assert.ok(css.includes(activeSelector+' #touch'));
  assert.ok(css.includes(activeSelector+' #touch .pad'));
  assert.ok(css.includes('touch-action:none!important'),
    'avoid browser panning/zooming while the native joystick and fire fingers are held');
  assert.equal(css.includes('html[data-reference-game="cf-transport-ship"] #mk-panel{touch-action:none'),
    false,'ready/revive/finished panels must retain normal scrolling');
});

test('CF V12 circular pad has proportional precision, radial clamp and release center',()=>{
  assert.deepEqual(cfJoystickVector(98,265,98,265),{mx:0,mz:0,dx:0,dy:0});
  assert.deepEqual(cfJoystickVector(102,263,98,265),{mx:0,mz:0,dx:0,dy:0});
  const forward=cfJoystickVector(98,205,98,265);
  assert.equal(forward.mx,0);
  assert.equal(forward.mz,1);
  assert.equal(forward.dy,-60);
  const rear=cfJoystickVector(98,325,98,265);
  assert.equal(rear.mz,-1);
  const lateral=cfJoystickVector(158,265,98,265);
  assert.equal(lateral.mx,1);
  const diagonal=cfJoystickVector(158,205,98,265);
  assert.ok(Math.hypot(diagonal.mx,diagonal.mz)<=1.001);
  assert.ok(diagonal.mx>0&&diagonal.mz>0);
  const subtle=cfJoystickVector(117,255,98,265);
  assert.ok(subtle.mx>0&&subtle.mx<.5);
  assert.ok(subtle.mz>0&&subtle.mz<.5);
  assert.equal(cfJoystickVector(NaN,265,98,265).mz,0);
  assert.equal(cfJoystickVector(98,205,98,265,0).mz,0);
  assert.equal(cfJoystickVector(98,205,98,265,60,1).mz,0);
});

test('CF V12 pause reset releases an old crouch toggle but not native combat stats',()=>{
  const player={touch:{fire:false,firePressed:false,jump:false,crouch:true,mx:0,mz:0},stats:{k:4,shots:32}};
  assert.equal(cfResetMobileTouch(player),true);
  assert.equal(player.touch.crouch,false);
  assert.deepEqual(player.stats,{k:4,shots:32});
});

test('CF V12 only real completed match can instantly restart its original 3D engine',()=>{
 assert.equal(cfWarmRestartAllowed('cf-transport-ship','finished'),true);
 for(const phase of ['ready','running','paused','revive','loading'])
   assert.equal(cfWarmRestartAllowed('cf-transport-ship',phase),false);
 for(const theme of ['pelican-bike','qq-speed',null])
   assert.equal(cfWarmRestartAllowed(theme,'finished'),false);
 const main=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
 assert.match(main,/cfWarmRestartAllowed\(id,root\.dataset\.phase\)/);
 assert.match(main,/void start\(\)/);
});

test('CF V12 restores native team spawn array before immediate restart of original match',()=>{
 const main=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
 const adapter=readFileSync(new URL('../fps-mobile-ux.mjs',import.meta.url),'utf8');
 const reset=main.indexOf('fpsUx?.beforeNativeStart?.();');
 const choose=main.indexOf('g.opts.primary = c.weapon;',reset);
 const match=main.indexOf('originalStart(c);',choose);
 assert.ok(reset>=0&&choose>reset&&match>choose,
  'native team spawn restore must precede weapon selection and match restart');
 assert.match(main,/if\(c\?\.lite===true\)\{/,
  'lite optimization must remain explicitly scoped to CF');
 const anchor=adapter.indexOf('beforeNativeStart() {');
 const restore=adapter.indexOf('game.map.spawns[trainingSpawnTeam]=originalEnemySpawns;',anchor);
 assert.ok(anchor>0&&restore>anchor,'restore map spawns before native start');
});

test('CF V18 final native adapter honors lite actor budget and PVE quota',async()=>{
 const {createFpsAdapter}=await import('../themes.mjs');
 const game={opts:{size:6,goal:50},hud:{syncControls(){}}};
 let launches=0;
 const doc={getElementById(id){
   assert.equal(id,'btnStart');
   return {click(){launches++;}};
 }};
 const native=createFpsAdapter(game,doc);
 native.start({id:'tags',kind:'hits',lite:true});
 assert.equal(game.opts.size,1,'first H5 fight intentionally uses genuine 1v1');
 assert.equal(game.opts.goal,300,'native team score cannot preempt PVE goal');
 assert.equal(launches,1);
 const {cfMobileActorBudget}=await import('../themes.mjs');
 const sizes={tags:1,precision:2,survive:3,defense:3,
   assault:3,marksman:2,evac:3,counter:4};
 for(const [id,size] of Object.entries(sizes)){
   const mission={id,kind:id==='precision'?'kills':'hits',lite:true};
   assert.equal(cfMobileActorBudget(mission),size,id);
   native.start(mission);
   assert.equal(game.opts.size,size,id+' actual native team size');
   assert.equal(game.opts.goal,300,id+' PVE overrides native score');
 }
 assert.equal(cfMobileActorBudget({id:'tags',lite:true,elite:true}),2);
 assert.equal(cfMobileActorBudget({id:'counter',lite:true,elite:true}),4);
 assert.equal(cfMobileActorBudget({id:'tags',lite:false}),null);
 native.start({id:'tags',kind:'hits',lite:false});
 assert.equal(game.opts.size,1,'legacy original behavior stays isolated');
 assert.equal(game.opts.goal,30);
 assert.equal(launches,10);
});

test('CF solo PvE removes AI comrades from the native 3D lifecycle, not just HUD',async()=>{
 const {cfRemoveNativeAllies}=await import('../themes.mjs');
 const player={isPlayer:true,team:'BL'};
 const friendA={team:'BL',soldier:{root:{id:'friend-1'}}};
 const friendB={team:'BL',soldier:{root:{id:'friend-2'}}};
 const enemyA={team:'GR',soldier:{root:{id:'enemy-1'}}};
 const enemyB={team:'GR',soldier:{root:{id:'enemy-2'}}};
 const removed=[],disposed=[];
 const aTag={actor:friendA,sprite:{id:'tag-friend',
   material:{map:{dispose(){disposed.push('map')}},dispose(){disposed.push('material')}}}};
 const enemyTag={actor:enemyA,sprite:{id:'tag-enemy'}};
 const game={
   player,actors:[player,friendA,enemyA,friendB,enemyB],
   tags:[aTag,enemyTag],
   renderer:{scene:{remove(node){removed.push(node.id)}}}
 };
 const record=cfRemoveNativeAllies(game,{id:'counter',lite:true});
 assert.deepEqual(record,{applied:true,removed:2,playerCount:1,enemyCount:2});
 assert.deepEqual(game.actors,[player,enemyA,enemyB]);
 assert.deepEqual(game.tags,[enemyTag]);
 assert.deepEqual(removed,['friend-1','friend-2','tag-friend']);
 assert.deepEqual(disposed,['map','material']);
 assert.equal(game.__mkSoloPve,true);
 assert.equal(cfRemoveNativeAllies(game,{id:'counter',lite:true}).removed,0,
  'native warm replays remain idempotent');
 const fallback={
   player,actors:[player,friendA,enemyA],tags:[aTag],
   renderer:{scene:{remove(node){removed.push(node.id)}}}
 };
 assert.equal(cfRemoveNativeAllies(fallback,{lite:false}).applied,false);
 assert.deepEqual(fallback.actors,[player,friendA,enemyA]);
 assert.equal(fallback.__mkSoloPve,undefined);
});
