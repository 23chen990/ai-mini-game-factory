import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cfResetMobileTouch} from '../fps-mobile-ux.mjs';

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
