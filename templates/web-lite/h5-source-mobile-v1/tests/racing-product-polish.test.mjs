import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import * as presentation from '../racing/presentation.mjs';
import * as driver from '../racing/driver.mjs';
import { raceCameraFov, tuneRaceFx } from '../racing/session.mjs';
import { v10MobileCameraPreset } from '../racing/v10-driving-feel.mjs';
import { patchGeneratedCarModelSource } from '../../../../tools/lean-pilot/racing-mobile-build.mjs';

const source=readFileSync(new URL('../racing/mobile.mjs',import.meta.url),'utf8');
test('phone high-speed composition keeps a readable car without borrowing desktop camera values',()=>{
  assert.ok(raceCameraFov(70,true,false)<=70,'phone boost must not open to an 85 degree spectator view');
  assert.ok(raceCameraFov(0,false,false)>=58,'retain enough road context, not a telephoto crop');
  assert.ok(raceCameraFov(70,true,false)>raceCameraFov(70,false,false));
  assert.ok(v10MobileCameraPreset(70,false,0).dist<=8.1);
  const build=readFileSync(new URL('../../../../tools/lean-pilot/racing-mobile-build.mjs',import.meta.url),'utf8');
  assert.ok(build.includes(': 66 + Math.abs(P.s) * 0.12 + (P.nitroTime > 0 ? 9 : 0) + (P.smallBoost > 0 ? 4 : 0)'),'desktop FOV must stay native');
  assert.ok(build.includes(': m.dist + Math.abs(P.s) * .018 + boostPull'),'desktop chase must stay native');
});
test('browser camera observation enforces the new phone range, not the retired wide-angle range',()=>{
  const smoke=readFileSync(new URL('../../../../tools/lean-pilot/racing-v3-smoke.mjs',import.meta.url),'utf8');
  assert.match(smoke,/after\.actualCameraFov<63/);
  assert.match(smoke,/after\.actualCameraFov>72/);
  assert.match(smoke,/after\.mobileChaseDistance>16\.0/,'retain the existing chase bound');
});
test('action states expose real earned resources and current item, not duplicate button subtitles',()=>{
  assert.equal(typeof presentation.raceActionView,'function');
  const player={drifting:false,smallWindow:0,nitroCount:0,gauge:.4,items:[],nitroTime:0,smallBoost:0};
  const empty=presentation.raceActionView(player);
  assert.equal(empty.small.ready,false);assert.equal(empty.nitro.ready,false);
  assert.equal(empty.nitro.badge,'0');assert.equal(empty.item.icon,'◇');
  const earned=presentation.raceActionView({...player,drifting:true,smallWindow:.3,nitroCount:2,items:['shield']});
  assert.equal(earned.small.ready,true);assert.equal(earned.nitro.badge,'2');
  assert.equal(earned.item.icon,'🛡');assert.equal(earned.item.label,'护盾');assert.equal(earned.drift.active,true);
  assert.deepEqual(player.items,[],'presentation must not consume an item');
});
test('result stars describe THIS finish; best record belongs in secondary copy',()=>{
  assert.equal(typeof presentation.raceResultView,'function');
  const loss=presentation.raceResultView({finished:true,place:5,time:125},0,3,1.7);
  assert.equal(loss.stars,0);assert.equal(loss.primary,'replay');
  assert.match(loss.subtitle,/1\.7/);assert.match(loss.record,/3/);
  const win=presentation.raceResultView({finished:true,place:2,time:120},2,3,null);
  assert.equal(win.stars,2);assert.equal(win.primary,'next');
  assert.match(win.subtitle,/下一关/);
});
test('loss recap gives factual performance without fabricated coaching',()=>{
  const close=presentation.raceResultView({finished:true,place:4,time:125,stats:{crash:3}},0,2,1.26);
  assert.equal(close.primary,'replay');
  assert.equal(close.subtitle,'距前三 1.3 秒 · 碰撞 3 次');
  const unfinished=presentation.raceResultView({finished:false,completion:.627,stats:{crash:1}},0,0,null);
  assert.equal(unfinished.subtitle,'本场未完赛 · 进度 63% · 碰撞 1 次');
  const unknown=presentation.raceResultView({finished:true,stats:{crash:0}},0,0,undefined);
  assert.equal(unknown.subtitle,'本场未进前三');
  assert.equal(presentation.raceResultView({finished:true,stats:{crash:8}},2,3,1).subtitle,'进入前三 · 下一关已解锁');
});
test('running HUD only writes changed button state and spray progress',()=>{
  assert.match(source,/const writeRaceText=\(node,value\)=>\{if\(node\.textContent!==value\)/);
  assert.match(source,/if\(node\.style\.getPropertyValue\('--spray-progress'\)!==nextProgress\)/);
  assert.match(source,/if\(actionButtons\[action\]\.getAttribute\('aria-label'\)!==ariaLabel\)/);
});
test('normal fuel UI is quiet while retry and real shortage are visible',()=>{
  assert.match(source,/const low=metered && !freeReplay && career\.fuel\.amount<=FUEL_RULES\.raceCost\*2/);
  assert.match(source,/本关免费重试/);
  const css=readFileSync(new URL('../racing/mobile.css',import.meta.url),'utf8');
  assert.match(css,/#race-fuel-box:not\(\.low\):not\(\.empty\):not\(\.notice\) #race-fuel-gauge/);
});
test('paused restart remains actionable at zero fuel without enabling a fresh paid entry',()=>{
  assert.match(source,/const pausedRestart=phase==='paused' && started && !result/);
  assert.match(source,/if \(!pausedRestart && !career\.canStart\(\)\)/);
  assert.match(source,/career\.begin\(g,\{reuseCurrentEntry:pausedRestart\}\)/);
  assert.match(source,/id==='restart' && pausedRestart/);
});
test('real overtake feedback pulses existing HUD without any new driving overlay',()=>{
  assert.match(source,/const duelMoment=duel\.frame\(g\)/);
  assert.match(source,/root\.dataset\.raceDuel=duelMoment\.kind/);
  assert.match(source,/now-lastDuelPulseAt>650/);
  const css=readFileSync(new URL('../racing/mobile.css',import.meta.url),'utf8');
  assert.match(css,/#race-kit\[data-phase="race"\]\[data-race-duel="skill"\] #race-speed/);
  assert.match(css,/#race-kit\[data-phase="race"\]\[data-race-duel="threat"\] #race-speed/);
});
test('default results keep diagnostics and detailed statistics out of the main action path',()=>{
  assert.match(source,/id="race-result-details"/);
  assert.match(source,/qaDiagnostics/);
  assert.match(source,/\$\('export'\)\.hidden\s*=\s*!qaDiagnostics/);
  assert.match(source,/raceActionView\(player\)/);
  assert.match(source,/renderActions\(g\.player\)/);
});
test('exhaust silhouette stays compact without removing the native boost animation',()=>{
  const builder=patchGeneratedCarModelSource.toString();
  assert.match(builder,/outer\.scale\.set\(\.85,\.6,\.85\)/);
  assert.match(builder,/inner\.scale\.set\(\.8,\.55,\.8\)/);
});
test('desktop item races distinguish Space nitro from Ctrl item without consuming both',()=>{
  assert.equal(typeof driver.keyboardRaceActions,'function');
  const raw={up:true,nitroPressed:true,wPressed:false};
  assert.deepEqual(driver.keyboardRaceActions(raw,true,true,false),{...raw,nitroPressed:false,manualNitroPressed:true});
  assert.deepEqual(driver.keyboardRaceActions(raw,true,false,true),{...raw,nitroPressed:true,manualNitroPressed:false});
  assert.equal(driver.keyboardRaceActions(raw,false,true,false),raw);
});
test('settlement is not covered by the still-running race HUD',()=>{
  assert.match(source,/document\.documentElement\.dataset\.racePhase=next/);
  const css=readFileSync(new URL('../racing/mobile.css',import.meta.url),'utf8');
  assert.match(css,/\[data-race-phase="finished"\] #hud\s*\{visibility:hidden;\}/);
});
test('desktop drift smoke no longer forms a car-sized opaque white cloud',()=>{
  const calls=[];
  const game={mobileMode:false,fx:{smoke:{emit(...args){calls.push(args);}},glow:{emit(){}}}};
  const args=[0,1,2,3,4,5,.8,1.3,7,.95,.95,.97,.42,-.6,1.2];
  tuneRaceFx(game);game.fx.smoke.emit(...args);
  assert.ok(calls[0][8]<3.5);assert.ok(calls[0][12]<.2);
  assert.deepEqual(calls[0].slice(0,7),args.slice(0,7),'particle positions, velocity and lifetime stay native');
});
test('completed fuel reward remains visible when the result no longer has an empty tank',()=>{
  assert.match(source,/\$\('fuel-box'\)\.classList\.toggle\('notice',performance\.now\(\)<adNoticeUntil\)/);
  const css=readFileSync(new URL('../racing/mobile.css',import.meta.url),'utf8');
  assert.match(css,/#race-fuel-box:not\(\.empty\):not\(\.notice\)/);
});
