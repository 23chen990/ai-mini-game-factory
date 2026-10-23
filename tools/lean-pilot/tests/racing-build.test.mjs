/* global URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const api = await import('../racing-mobile-build.mjs').catch(() => ({}));
test('warm rebuild refreshes the compatibility bridge without changing frozen acceptance',async t=>{
  const game=await mkdtemp(path.join(tmpdir(),'racing-warm-bridge-'));
  t.after(()=>rm(game,{recursive:true,force:true}));
  await mkdir(path.join(game,'tests'));
  await writeFile(path.join(game,'themes.mjs'),'stale bridge');
  await writeFile(path.join(game,'tests/ads.test.mjs'),'frozen acceptance');
  const bridge=await readFile(new URL('../../../templates/web-lite/h5-source-mobile-v1/themes.mjs',import.meta.url),'utf8');
  assert.equal(typeof api.syncRacingCompatibilityBridge,'function');
  await api.syncRacingCompatibilityBridge(game,bridge);
  assert.equal(await readFile(path.join(game,'themes.mjs'),'utf8'),bridge);
  await api.syncRacingCompatibilityBridge(game,bridge);
  assert.equal(await readFile(path.join(game,'themes.mjs'),'utf8'),bridge);
  assert.equal(await readFile(path.join(game,'tests/ads.test.mjs'),'utf8'),'frozen acceptance');
  const builder=await readFile(new URL('../racing-mobile-build.mjs',import.meta.url),'utf8');
  assert.match(builder,/await syncRacingCompatibilityBridge\(game, sharedDeps\[1\]\)/);
});
const patchFixture = `import * as THREE from 'three';
const fovT = 66 + Math.abs(P.s) * 0.12 + (P.nitroTime > 0 ? 9 : 0) + (P.smallBoost > 0 ? 4 : 0);
if (P.nitroTime > 0) {
      cam.position.x += jitter;
const k = this.shake * this.shake;
if (this.bloom) this.bloom.strength = (this.settings.quality === 'high' ? 0.75 : 0.6) + (P && P.nitroTime > 0 ? 0.3 : 0);
const inp = this.input.frame();
P.update(DT, first ? pin : noEdge, active, this.itemMode);
r.update(DT, aiActive, this.raceTime, this.rubber(r));`;
test('赛车源补丁保留原输入、物理和AI流程，只约束手机镜头与渲染', async () => {
  assert.equal(typeof api.patchRacingSource, 'function', '缺少隔离赛车构建');
  const source = await readFile(new URL('../../../runs/h5-qq-mobile-20261013/workspace/source/qq-speed/src/main.js', import.meta.url), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return patchFixture;
    throw error;
  });
  const output = api.patchRacingSource(source);
  assert.ok(output.includes('raceCameraFov(P.s'));
  assert.ok(output.includes('this.mobileMode ? raceBloomStrength('));
  assert.ok(output.includes('window.__RACE_THREE__ = THREE;'),'do not bundle duplicate Three.js in mobile');
  assert.equal(output.split('window.__RACE_THREE__ = THREE;').length,2,'inject native namespace only once');
  for (const exact of ['const inp = this.input.frame();', 'P.update(DT, first ? pin : noEdge, active, this.itemMode);', 'r.update(DT, aiActive, this.raceTime, this.rubber(r));', 'if (r.half)']) {
    if (source.includes(exact)) assert.ok(output.includes(exact), exact);
  }
  assert.equal(api.patchRacingSource(output), output);
});
test('未知源版本不能静默套用补丁', () => {
  assert.equal(typeof api.patchRacingSource, 'function', '缺少隔离赛车构建');
  assert.throws(() => api.patchRacingSource('class OtherGame {}'), /anchor|锚点/u);
});


test('V11.6 pre-race quality follows the live renderer and warms up only in visible ready phase', async () => {
  const mobile = await readFile(new URL('../../../templates/web-lite/h5-source-mobile-v1/racing/mobile.mjs', import.meta.url), 'utf8');
  assert.match(mobile, /\$\('quality'\)\.value = g\.settings\.quality/);
  assert.match(mobile, /const adaptWarmGraphics = dt =>/);
  assert.match(mobile, /phase === 'ready' && !loading && !backgrounded && !document\.hidden && !portrait\(\)/);
  assert.match(mobile, /adaptWarmGraphics\(dt\)/);
  assert.match(mobile, /\$\('quality'\)\.value = lower/);
  assert.match(mobile, /Countdown already has its own native render-budget guard/);
});

test('registered build includes live career, items, runtime and fuel dependencies', async () => {
  const source = await readFile(new URL('../racing-mobile-build.mjs', import.meta.url), 'utf8');
  for (const name of ['career.mjs', 'items.mjs', 'runtime.mjs', 'fuel.mjs', 'themes.mjs']) assert.ok(source.includes(name), name);
  const mobile = await readFile(new URL('../../../templates/web-lite/h5-source-mobile-v1/racing/mobile.mjs', import.meta.url), 'utf8');
  assert.ok(mobile.includes("from './runtime.mjs'"));
  assert.ok(mobile.includes('career.patchNative(g)'));
  assert.match(mobile,/driver\.frame\(raw,g\.player,g\.state/);
  assert.ok(!mobile.includes('career.itemInput(g, canStep)'), 'automatic item-use assist was removed');
  assert.ok(!mobile.includes('race-control-mode'), 'no player-facing alternate control mode');
});
test('race text labels remove known third-party signboards in build output', () => {
  const data = 'START · 11城 SPEEDQQ.COM QQ飞车 情迷爱琴海 法老金字塔 雪地大冒险';
  const got = api.neutralizeRaceBranding(data);
  for (const name of ['11城','SPEEDQQ.COM','QQ飞车','情迷爱琴海','法老金字塔','雪地大冒险']) assert.ok(!got.includes(name), name);
  assert.equal(api.neutralizeRaceBranding(got), got);
});

test('instrument clean native drift without changing dynamics, and reject unknown source', () => {
  const native = "  this.emit('driftEnd', { time: this.driftTime });";
  const result = api.annotateDriftResult(native);
  assert.match(result, /time: this.driftTime, clean/);
  assert.equal(api.annotateDriftResult(result), result);
  assert.throws(() => api.annotateDriftResult('no drift logic'), /anchor changed/);
});


test('recognizable character balloons are replaced with generic scene assets',()=>{
  const native = "const b = buildMascotBalloon(bcols[i % bcols.length]);";
  const modern = api.neutralizeRaceBranding(native);
  assert.match(modern,/buildHotAirBalloon/);
  assert.ok(!modern.includes('buildMascotBalloon'));
});

test('actual esbuild script injection keeps valid $& tokens and exactly one closing body',()=>{
  // Previous build used html.replace('</body>', '<script>'+minifiedJs+...).
  // JS identifier '$' followed by '&' gets turned into literal '</body>' there.
  const native = '<!doctype html><html><body><main>Game</main></body></html>';
  const minified = 'let $=1,f=2;if($&!f){window.live=true}';
  const html = api.injectRaceBundle(native,minified);
  assert.ok(html.includes(minified), 'the JS bytes must be preserved across HTML injection');
  assert.equal(html.split('</body>').length,2,'exactly one body close outside the script');
  assert.equal(html.split('<script>').length,2);
  assert.equal(api.injectRaceBundle(native,'x').includes('<script>x</script></body>'),true);
  assert.throws(()=>api.injectRaceBundle('<main>missing body</main>','ok'),/one HTML body/);
});

test('V3.1 build adds pinned geometry and question-box source patches once, rejects unknown shapes',()=>{
  const layouts = "export const LAYOUTS = { city: {}, egypt: {}, snow: {}, aegean: {} };";
  const patchedLayouts = api.patchRaceLayouts(layouts);
  assert.match(patchedLayouts, /applyTrackDesign\(LAYOUTS, \{ v8: true, v9: true, v10: true, v11: true \}\)/);
  assert.equal(api.patchRaceLayouts(patchedLayouts),patchedLayouts);
  for(const legacyCall of [
    'applyTrackDesign(LAYOUTS);',
    'applyTrackDesign(LAYOUTS, { v8: true });',
    'applyTrackDesign(LAYOUTS, { v8: true, v9: true });',
    'applyTrackDesign(LAYOUTS, { v8: true, v9: true, v10: true });',
  ]) {
    const older="import { applyTrackDesign } from './race-track-design.mjs';\n"+layouts+'\n'+legacyCall+'\n';
    assert.equal(api.patchRaceLayouts(older),patchedLayouts,'migrate one existing invocation without applying geometry twice');
  }
  assert.throws(()=>api.patchRaceLayouts('const X = {};'), /Pinned track/);
  const src = "import * as THREE from 'three';\nexport class ItemSystem {\n  constructor() {\n    this.foo=1;\n  }\n\n  reset() {}\n}";
  const maps="export const MAPS = [{ id: 'city' }];";
  const lanePatched=api.patchRaceMaps(maps);
  assert.match(lanePatched,/applyLaneDesign\(MAPS\)/);
  assert.equal(api.patchRaceMaps(lanePatched),lanePatched);
  assert.throws(()=>api.patchRaceMaps('const MAPS = []'),/MAPS export changed/);
  const patched = api.patchRaceItems(src);
  assert.match(patched, /upgradeItemBoxes\(this, THREE\)/);
  assert.match(patched, /from '.\/race-item-visuals.mjs'/);
  assert.equal(api.patchRaceItems(patched),patched);
  assert.throws(()=>api.patchRaceItems('class OtherItems {}'),/Pinned item constructor/);
});
test('V3.1 model and spline modules are hashed into H5 build and kept scoped to racing',async()=>{
  const source=await readFile(new URL('../racing-mobile-build.mjs', import.meta.url),'utf8');
  for(const name of ['track-design.mjs','lane-design.mjs','item-visuals.mjs','recovery.mjs'])
    assert.ok(source.includes(name),name);
  assert.ok(source.includes('patchRaceLayouts'));
  assert.ok(source.includes('patchRaceItems'));
  const runtime=await readFile(new URL('../../../templates/web-lite/h5-source-mobile-v1/racing/runtime.mjs',import.meta.url),'utf8');
  assert.match(runtime,/game.items.applyMobileVisuals\?\.\(\)/);
  assert.match(runtime,/new WrongWayRecovery\(\)/);
});

test('desert dune relief edits only the original generated sand base, never native physics',()=>{
  const line='let h = 2 + noise.fbm(x * 0.0045, z * 0.0045, 4) * 18 + Math.max(0, Math.hypot(x - cx, z - cz) - 900) * 0.1;';
  const source="if (id === 'egypt') {"+line+"}\nconst nativePhysics='PlayerCar.update';";
  const revised=api.patchRaceDesertRelief(source);
  assert.notEqual(revised,source);
  assert.match(revised,/z \* 0\.0045, 4\) \* 26/);
  assert.match(revised,/PlayerCar\.update/);
  assert.equal(api.patchRaceDesertRelief(revised),revised,'terrain adapter is idempotent');
  assert.throws(()=>api.patchRaceDesertRelief("unrecognized source"),/anchor changed/);
});

test('native stage-specific course selection is strict, idempotent and does not rewrite driving physics',()=>{
  const original="const track = new Track(LAYOUTS[map.layout], { isBridge: map.isBridge });";
  const src=original+"\nP.update(DT, first ? pin : noEdge, active, this.itemMode);";
  const adapted=api.patchCareerRouteSource(src);
  assert.match(adapted,/this\.settings\.course \|\| map\.layout/);
  assert.match(adapted,/track\.__RACE_COURSE_ID = requestedCourse/);
  assert.match(adapted,/Unknown career course/);
  assert.match(adapted,/P\.update\(DT, first \? pin : noEdge/);
  assert.equal(api.patchCareerRouteSource(adapted),adapted);
  assert.throws(()=>api.patchCareerRouteSource("new Track(other, {})"),/constructor changed/);
});

test('native fork adapters are exact, idempotent and preserve original acceleration/AI',()=>{
  const track=[
    'export class Track {',
    'for (let r = 0; r < N; r++) {',
    '  const a = startW + r * 3, b = a + 3;',
    '  if (side < 0) {}',
    '}',
    '}',
  ].join('\n');
  const road=api.patchShortcutNativeTrack(track);
  assert.match(road,/__RACE_SHORTCUT__\?\.opening\(/);
  assert.equal(api.patchShortcutNativeTrack(road),road);
  assert.throws(()=>api.patchShortcutNativeTrack('class Unknown {}'),/guardrail construction changed/);
  const vehicle='export class PlayerCar {const lim = tr.halfW - 1.1;}';
  const collision=api.patchShortcutNativeCar(vehicle);
  assert.match(collision,/p\.__RACE_SHORTCUT_HALF_WIDTH/);
  assert.equal(api.patchShortcutNativeCar(collision),collision);
  assert.throws(()=>api.patchShortcutNativeCar('class Unknown {}'),/collision-width anchor changed/);
  const world=[
    "import * as THREE from 'three';",
    'track.__RACE_COURSE_ID = requestedCourse;',
    'const ground = buildGround(track, { base: 123 });',
    'root.add(track.build(map.track, ground.heightAt));',
    'this.hud.setupMinimap(track);',
    '  resetPlayer() {\n    const P = this.player;',
    'P.update(DT, first ? pin : noEdge, active, this.itemMode);',
  ].join('\n');
  const patched=api.patchShortcutNativeWorld(world);
  assert.match(patched,/installPhysicalShortcut\(track, requestedCourse, \{v8:true,v9:true,v10:true\}\)/);
  assert.match(patched,/terrainProxy\(track\)/);
  assert.match(patched,/physical|buildMesh\(THREE, ground.heightAt\)/);
  assert.match(patched,/__RACE_SHORTCUT__\?\.recover\(P\)/);
  assert.match(patched,/P\.update\(DT, first \? pin : noEdge/);
  assert.equal(api.patchShortcutNativeWorld(patched),patched);
  assert.throws(()=>api.patchShortcutNativeWorld('class Unknown {}'),/world anchor changed/);
});

test('stage-scenery pipeline changes only sky/props, never native car or track physics',()=>{
  const before=[
    "const rnd = mulberry32(id.length * 997 + 13);",
    'const { sky, sunDir } = buildSky(map.sky);',
    'this.scene.fog = new THREE.Fog(map.fog[0], map.fog[1], map.fog[2]);',
    'this.scene.background = new THREE.Color(map.sky.horizon);',
    'const nativeMotion = P.update(dt,input);',
  ].join('\n');
  const result=api.patchCourseSkyAndScenery(before);
  assert.match(result,/stageSeed \* 9176/);
  assert.match(result,/createRaceSky\(map\.sky,requestedCourse\)/);
  assert.match(result,/buildSky\(courseSky\)/);
  assert.match(result,/new THREE\.Fog\(courseSky\.horizon/);
  assert.match(result,/P\.update\(dt,input\)/,'native physics preserved');
  assert.equal(api.patchCourseSkyAndScenery(result),result);
  assert.throws(()=>api.patchCourseSkyAndScenery('broken stage'),/course-light anchor drifted/);
});

test('fixed desert monument safety keeps pyramid models away from new racing surfaces',()=>{
  const input='function egyptProps(ctx) {const track=ctx.track;\nfor (const [x, z, h] of pyramids) { buildPyramid(); }}';
  const out=api.patchFixedDesertLandmarks(input);
  assert.match(out,/if \(!isFree\(track, x, z, h \* \.58 \+ 10\)\) continue;/);
  assert.match(out,/buildPyramid\(\)/,'original sculpture remains when safe');
  assert.equal(api.patchFixedDesertLandmarks(out),out);
  assert.throws(()=>api.patchFixedDesertLandmarks('unexpected native geometry'),/landmark placement changed/);
});

test('V8 native AI hook is strict and avoids checkpoint/progress surgery',()=>{
  const src=[
    "import { TUNE } from './vehicle.js';",
    "export class AICar {",
    "const hw = tr.halfW - 2.2;",
    "let vt = Math.min(vmaxBase, vCorner + (this.nitroTime > 0 ? 6 : 0));",
    "const target = clamp(inside + this.personal * hw * 0.8, -hw, hw);",
    "this.dist += this.s * dt + this.pushD;\n    this.pushD = 0;\n    const s = tr.sample(this.dist, this.s2);",
    "this.slope = tr.slope[s.i];",
    "}"
  ].join('\n');
  const adapted=api.patchV8NativeAi(src);
  assert.match(adapted,/advanceAiV8Road\(this,tr,travel\)/);
  assert.match(adapted,/aiV8TargetLine\(this,tr/);
  assert.ok(adapted.includes('const travel = this.s * dt + this.pushD;'));
  assert.equal(api.patchV8NativeAi(adapted),adapted);
  assert.throws(()=>api.patchV8NativeAi('class NonRacing {}'),/AI anchors changed/);
});

test('V11 build adapter preserves AI names and instantiates the native PlayerCar subclass',async()=>{
  const original="export const AI_NAMES = ['North','South'];\nexport class AICar { update(dt) { this.dist += 90 * dt; } }";
  const patched=api.patchV11PhysicalAi(original);
  assert.equal(api.patchV11PhysicalAi(patched),patched);
  assert.ok(!patched.includes('this.dist += 90 * dt'),'the old on-rail movement is replaced');
  const nativeUrl='data:text/javascript,'+encodeURIComponent('export class PlayerCar {} export const TUNE={steerRate:1.9};');
  const moduleUrl=new URL('../../../templates/web-lite/h5-source-mobile-v1/racing/v11-physical-ai.mjs',import.meta.url).href;
  const executable=patched.replace("'./vehicle.js'",JSON.stringify(nativeUrl))
    .replace("'./race-v11-physical-ai.mjs'",JSON.stringify(moduleUrl));
  const built=await import('data:text/javascript,'+encodeURIComponent(executable));
  const native=await import(nativeUrl);
  assert.deepEqual(built.AI_NAMES,['North','South']);
  assert.equal(Object.getPrototypeOf(built.AICar),native.PlayerCar,
    'generated rivals inherit the actual native movement/collision class');
  assert.throws(()=>api.patchV11PhysicalAi('export class AICar {}'),/constructor\/name interface changed/);
  assert.throws(()=>api.patchV11PhysicalAi(original+"\nexport const AI_NAMES = ['Duplicate'];"),/constructor\/name interface changed/);
});

test('V11 world adapter projects physical rivals and applies real impulses without taking player ownership',()=>{
  const original=`export class NativeWorld {
  progress(r) {
    if (r.isPlayer) {
      const d = r.d;
      return d;
    }
    return r.dist;
  }
  velocity(r) {
    if (r.isPlayer) return [Math.sin(r.m) * r.s, Math.cos(r.m) * r.s];
    return [r.legacyVx,r.legacyVz];
  }
  offset(r,px,pz) {
    if (r.isPlayer) { r.x += px; r.z += pz; return; }
    r.lat+=px; r.dist+=pz;
  }
  impulse(r,vx,vz) {
    if (r.isPlayer) {
      const cx = Math.sin(r.m) * r.s + vx,
        cz = Math.cos(r.m) * r.s + vz;
      r.m=Math.atan2(cx,cz); r.s=Math.hypot(cx,cz); return;
    }
    r.pushL+=vx; r.pushD+=vz;
  }
  tick(r) {
    const P=this.player,DT=.05,aiActive=true;
    r.__V10_RIVAL_PLAYER__=P; r.update(DT, aiActive, this.raceTime, this.rubber(r));
  }
  winner(r) { return r.isPlayer ? 'player-result' : 'rival-result'; }
}`;
  const patched=api.patchV11PhysicalRivalWorld(original);
  assert.equal(api.patchV11PhysicalRivalWorld(patched),patched);
  const World=new Function(patched.replace('export class','class')+';return NativeWorld;')();
  const world=new World();
  const physical={isPlayer:false,__V11_PHYSICAL_AI__:true,d:321,dist:9000,x:2,z:3,m:0,s:10};
  assert.equal(world.progress(physical),321,'checkpoint distance comes from native road projection');
  assert.deepEqual(world.velocity(physical),[0,10]);
  world.offset(physical,4,6);
  assert.deepEqual([physical.x,physical.z,physical.dist],[6,9,9000]);
  world.impulse(physical,3,4);
  const velocity=world.velocity(physical);
  assert.ok(Math.abs(velocity[0]-3)<1e-12&&Math.abs(velocity[1]-14)<1e-12);
  assert.equal(world.winner(physical),'rival-result','physical rivals do not own input, HUD or result effects');
  const legacy={isPlayer:false,d:20,dist:50,lat:1,legacyVx:2,legacyVz:3,pushL:0,pushD:0};
  assert.equal(world.progress(legacy),50);
  assert.deepEqual(world.velocity(legacy),[2,3]);
  world.offset(legacy,4,6);world.impulse(legacy,3,4);
  assert.deepEqual([legacy.lat,legacy.dist,legacy.pushL,legacy.pushD],[5,56,3,4]);
  world.player={isPlayer:true};world.itemMode=true;world.raceTime=15;world.rubber=()=>1.1;
  physical.update=(...args)=>{physical.lastUpdate=args;};world.tick(physical);
  assert.equal(physical.__V10_RIVAL_PLAYER__,world.player);
  assert.equal(physical.__V11_ITEM_MODE__,true);
  assert.deepEqual(physical.lastUpdate,[.05,true,15,1.1]);
  assert.equal(world.winner(world.player),'player-result');
  const partial=original.replace('const d = r.d;','const d = r.otherD;');
  assert.throws(()=>api.patchV11PhysicalRivalWorld(partial),/branch changed or partly applied/);
  assert.throws(()=>api.patchV11PhysicalRivalWorld('class Unknown {}'),/branch changed or partly applied/);
});

test('V8 one-way finish hooks preserve native progress and onLap bookkeeping',()=>{
  const native=[
    'export class NativeWorld {',
    '  updateProgress(r,init=false) {',
    '    const L=this.track.length;',
    '    if(r.isPlayer){r.progress=r.d}else {',
    '      r.progress = r.dist;',
    '    }',
    '  }',
    '',
    '  onLap(r) {',
    '    if(r.lapsDone>=this.settings.laps) r.finished=true;',
    '  }',
    '}'
  ].join('\n');
  const patched=api.patchV8PointToPoint(native);
  assert.ok(patched.includes("this.settings.course === 'race-07' ? .82"));
  assert.ok(patched.includes("this.settings.course === 'race-22' ? .84"));
  assert.ok(patched.includes('r.progress >= L * finishAt'));
  assert.ok(patched.includes('this.onLap(r);'));
  assert.equal(api.patchV8PointToPoint(patched),patched);
  assert.throws(()=>api.patchV8PointToPoint('class AnotherGame {}'),
    /one-way progress anchor changed/);
});

test('phone and desktop camera differences preserve native car/road physics',()=>{
 assert.equal(typeof api.patchDualPlatformCamera,'function');
 const before=[
  "import { racePhoneCamera } from './race-session.mjs';",
  'const m = modes[this.camMode];',
  'const dist = m.dist + Math.abs(P.s) * 0.018 + boostPull;',
  'const look = new THREE.Vector3(P.x + Math.sin(this.camYaw) * m.look, P.y + m.lookH, P.z + Math.cos(this.camYaw) * m.look);'
 ].join('\n');
 const after=api.patchDualPlatformCamera(before);
 assert.ok(after.includes('this.mobileMode ? racePhoneCamera('));
 assert.ok(after.includes('this.mobileMode ? 0.010 : 0.018'));
 assert.ok(after.includes('this.mobileMode ? boostPull * .25 : boostPull'));
 assert.ok(after.includes('racePhoneLookOffset(this.track,P,m.look)'));
 assert.equal(api.patchDualPlatformCamera(after),after);
 assert.throws(()=>api.patchDualPlatformCamera('const m = modes[this.camMode];'),/Missing racing phone camera import/);
});

test('native eight-item HUD matches V8 pickups and never crashes on a new item ID',()=>{
  const original=[
    "export const ITEM_INFO = {",
    "  nitro: { icon: '🔥', name: '氮气' },",
    "  missile: { icon: '🚀', name: '导弹' },",
    "  banana: { icon: '🍌', name: '香蕉皮' },",
    "  shield: { icon: '😇', name: '天使' },",
    "  magnet: { icon: '🧲', name: '磁铁' },",
    "};",
    "const html = it ? `${ITEM_INFO[it].icon}<small>${ITEM_INFO[it].name}</small>` : '';",
  ].join('\n');
  const patched=api.patchV8NativeHudItems(original);
  assert.equal(api.patchV8NativeHudItems(patched),patched,'native HUD adapter must be idempotent');
  assert.match(patched,/shockwave: \{ icon: '💥', name: '近身冲击波' \}/u);
  assert.match(patched,/thunder: \{ icon: '🌩️', name: '雷电攻击' \}/u);
  assert.match(patched,/barricade: \{ icon: '🚧', name: '后方路障' \}/u);
  assert.match(patched,/ITEM_INFO\[it\]\?\.icon/u,'unknown source items must not stop a race');
  for(const [id,name] of [['nitro','氮气'],['shockwave','近身冲击波'],['thunder','雷电攻击'],['barricade','后方路障']])
    assert.ok(patched.includes("  "+id+":")&&patched.includes(name),id);
  assert.throws(()=>api.patchV8NativeHudItems('export const ITEM_INFO = {};'),/HUD item|pinned|anchor/iu);
  assert.throws(()=>api.patchV8NativeHudItems(original.replace("  magnet: { icon: '🧲', name: '磁铁' },","")),/HUD item|pinned|anchor/iu);
});

test('V6.2 graphics safety is re-integrated into native generated WebGL with fail-closed anchors',()=>{
 const basic=[
  "quality: IS_TOUCH ? 'mid' : 'high'",
  "canvas: this.canvas, antialias: true, powerPreference: 'high-performance'"
 ].join('\n');
 const init=api.patchMobileInitialRendering(basic);
 assert.ok(init.includes("quality: IS_TOUCH ? 'low' : 'high'"));
 assert.ok(init.includes('antialias: false'));
 assert.equal(api.patchMobileInitialRendering(init),init);
 const mid=[
  "q === 'mid' ? Math.min(dpr, 1.5) : 1",
  "this.renderer.shadowMap.enabled = q !== 'low';",
  "this.sun.castShadow = q !== 'low';",
  "if (q === 'low') return;"
 ].join('\n');
 const slim=api.patchMobileMidRendering(mid);
 assert.ok(slim.includes('Math.min(dpr, IS_TOUCH ? 1.2 : 1.5)'));
 assert.ok(slim.includes('this.sun.castShadow = q !=='));
 assert.ok(slim.includes("if (q === 'low' || (IS_TOUCH && q === 'mid')) return;"));
 assert.equal(api.patchMobileMidRendering(slim),slim);
 assert.throws(()=>api.patchMobileInitialRendering('unknown racing engine'),/anchor changed/);
 assert.throws(()=>api.patchMobileMidRendering('unknown racing renderer'),/anchor changed/);
});

// Native constructor/quality/render statements; Three objects below only record
// the requested pipeline. Actual GPU support remains an independent browser gate.
const nativeGraphicsFixture = `class NativeGraphics {
  constructor(canvas, saved, scene, camera) {
    this.settings = Object.assign({ quality: IS_TOUCH ? 'mid' : 'high' }, saved);
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.scene = scene;
    this.camera = camera;
    this.setupQuality();
  }
  setupQuality() {
    const q = this.settings.quality;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'high' ? Math.min(dpr, 2) : q === 'mid' ? Math.min(dpr, 1.5) : 1);
    this.renderer.shadowMap.enabled = q !== 'low';
    if (this.sun) {
      this.sun.castShadow = q !== 'low';
      const ms = q === 'high' ? 2048 : 1024;
      if (this.sun.shadow.mapSize.x !== ms) {
        this.sun.shadow.mapSize.set(ms, ms);
        if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
      }
    }
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    if (this.composer) {
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
      this.composer = null;
      this.bloom = null;
    }
    if (q === 'low') return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q === 'high' ? 4 : 0 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.7, 0.5, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.resize();
  }
  resize() { this.resizeCalls = (this.resizeCalls || 0) + 1; }
  render(dt) {
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}`;

function graphicsFixture(isTouch, saved = {}) {
  const renderers = [], draws = [], surface = { material: {} };
  class Vector2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } }
  class WebGLRenderer {
    constructor(options) { this.options = options; this.shadowMap = {}; renderers.push(this); }
    setPixelRatio(value) { this.pixelRatio = value; }
    getDrawingBufferSize(size) { size.x = 1366 * this.pixelRatio; size.y = 768 * this.pixelRatio; return size; }
    render(scene, camera) { draws.push({ scene, camera }); }
  }
  class WebGLRenderTarget {
    constructor(width, height, options) { this.width = width; this.height = height; this.options = options; }
    dispose() { this.disposed = true; }
  }
  class EffectComposer {
    constructor(renderer, target) {
      this.renderer = renderer; this.renderTarget1 = target;
      this.renderTarget2 = new WebGLRenderTarget(target.width, target.height, target.options);
      this.passes = [];
    }
    addPass(pass) { this.passes.push(pass); }
    render(dt) { this.lastDelta = dt; }
  }
  class RenderPass { constructor(scene, camera) { this.scene = scene; this.camera = camera; } }
  class UnrealBloomPass { constructor(size, strength, radius, threshold) { Object.assign(this, { size, strength, radius, threshold }); } }
  class OutputPass {}
  const THREE = { Vector2, WebGLRenderer, WebGLRenderTarget, HalfFloatType: 'HalfFloatType' };
  const source = api.patchMobileMidRendering(api.patchMobileInitialRendering(nativeGraphicsFixture));
  const NativeGraphics = new Function('IS_TOUCH', 'THREE', 'window', 'EffectComposer', 'RenderPass', 'UnrealBloomPass', 'OutputPass', source + ';return NativeGraphics;')(
    isTouch, THREE, { devicePixelRatio: 2 }, EffectComposer, RenderPass, UnrealBloomPass, OutputPass);
  const canvas = {}, scene = { traverse(visitor) { visitor(surface); } }, camera = {};
  const game = new NativeGraphics(canvas, saved, scene, camera);
  return { game, canvas, scene, camera, surface, renderers, draws, RenderPass, UnrealBloomPass, OutputPass };
}

test('V11.6 default framebuffer avoids MSAA on desktop and touch while preserving saved quality', () => {
  const output = api.patchMobileInitialRendering(nativeGraphicsFixture);
  assert.equal(output, nativeGraphicsFixture
    .replace("quality: IS_TOUCH ? 'mid' : 'high'", "quality: IS_TOUCH ? 'low' : 'high'")
    .replace('antialias: true', 'antialias: false'), 'only the two reviewed constructor defaults may change');
  for (const isTouch of [false, true]) for (const quality of [undefined, 'low', 'mid', 'high']) {
    const saved = quality ? { quality } : {}, before = { ...saved };
    const { game, canvas, renderers } = graphicsFixture(isTouch, saved);
    assert.equal(game.renderer.options.antialias, false);
    assert.equal(game.renderer.options.canvas, canvas);
    assert.equal(game.renderer.options.powerPreference, 'high-performance');
    assert.equal(game.settings.quality, quality || (isTouch ? 'low' : 'high'));
    assert.deepEqual(saved, before, 'native saved preferences remain untouched');
    assert.equal(renderers.length, 1, 'quality setup must reuse the original renderer');
  }
});

test('V11.6 explicit high retains four-sample offscreen rendering before native low direct rendering', () => {
  for (const isTouch of [false, true]) {
    const fixture = graphicsFixture(isTouch, { quality: 'high' });
    const { game, scene, camera, surface, renderers, draws, RenderPass, UnrealBloomPass, OutputPass } = fixture;
    const renderer = game.renderer, composer = game.composer;
    assert.equal(renderer.options.antialias, false);
    assert.deepEqual(composer.renderTarget1.options, { type: 'HalfFloatType', samples: 4 });
    assert.deepEqual([composer.renderTarget1.width, composer.renderTarget1.height], [2732, 1536]);
    assert.equal(renderer.pixelRatio, 2);
    assert.equal(renderer.shadowMap.enabled, true);
    assert.equal(surface.material.needsUpdate, true);
    assert.equal(composer.passes.length, 3);
    assert.ok(composer.passes[0] instanceof RenderPass);
    assert.equal(composer.passes[0].scene, scene);
    assert.equal(composer.passes[0].camera, camera);
    assert.ok(composer.passes[1] instanceof UnrealBloomPass);
    assert.deepEqual([game.bloom.strength, game.bloom.radius, game.bloom.threshold], [0.7, 0.5, 1]);
    assert.ok(composer.passes[2] instanceof OutputPass);
    assert.equal(game.resizeCalls, 1);
    game.render(0.017);
    assert.equal(composer.lastDelta, 0.017);
    assert.equal(draws.length, 0);
    game.settings.quality = 'low';
    game.setupQuality();
    assert.equal(game.renderer, renderer);
    assert.equal(renderers.length, 1);
    assert.equal(renderer.options.antialias, false);
    assert.equal(renderer.pixelRatio, 1);
    assert.equal(renderer.shadowMap.enabled, false);
    assert.equal(composer.renderTarget1.disposed, true);
    assert.equal(composer.renderTarget2.disposed, true);
    assert.equal(game.composer, null);
    assert.equal(game.bloom, null);
    game.render(0.018);
    assert.deepEqual(draws, [{ scene, camera }], 'low still submits the complete native scene and camera');
  }
});

test('V11.6 mid keeps desktop offscreen zero samples and the existing touch budget', () => {
  for (const isTouch of [false, true]) {
    const { game, scene, camera, draws } = graphicsFixture(isTouch, { quality: 'mid' });
    assert.equal(game.renderer.options.antialias, false);
    assert.equal(game.renderer.pixelRatio, isTouch ? 1.2 : 1.5);
    assert.equal(game.renderer.shadowMap.enabled, !isTouch);
    if (isTouch) {
      assert.equal(game.composer, undefined);
      game.render(0.016);
      assert.deepEqual(draws, [{ scene, camera }]);
    } else {
      assert.deepEqual(game.composer.renderTarget1.options, { type: 'HalfFloatType', samples: 0 });
      assert.equal(game.composer.passes.length, 3);
    }
  }
});

test('V11.6 initial render adapter rejects partial and changed native constructor anchors', () => {
  const partials = [
    nativeGraphicsFixture.replace("quality: IS_TOUCH ? 'mid' : 'high'", "quality: IS_TOUCH ? 'low' : 'high'"),
    nativeGraphicsFixture.replace('antialias: true', 'antialias: false'),
    nativeGraphicsFixture.replace("quality: IS_TOUCH ? 'mid' : 'high'", "quality: IS_TOUCH ? 'low' : 'high'")
      .replace('antialias: true', 'antialias: !IS_TOUCH'),
  ];
  for (const source of partials) assert.throws(() => api.patchMobileInitialRendering(source), /Partial native phone render patch/);
  for (const source of [
    nativeGraphicsFixture.replace('antialias: true', 'antialias: rendererChoice'),
    nativeGraphicsFixture.replace("powerPreference: 'high-performance'", "powerPreference: 'default'"),
    nativeGraphicsFixture + nativeGraphicsFixture,
  ]) assert.throws(() => api.patchMobileInitialRendering(source), /anchor changed/);
  const patched = api.patchMobileInitialRendering(nativeGraphicsFixture);
  assert.equal(api.patchMobileInitialRendering(patched), patched);
});

test('V11.8 urban foliage and grass palette mute saturation with no new geometry or AI edits', () => {
  const props = [
    'function addTree(b, x, y, z, s, rot, leafColor = 0x4caf50) {',
    '  b.add(g.crown, flat(leafColor), M(x, y, z, rot, s));',
    '}',
    'const light = rnd() < 0.3 ? 0x6fbf4a : 0x3f9e4a;',
  ].join('\n');
  const tree = api.patchUrbanTreeColor(props);
  assert.match(tree, /leafColor = 0x4b8960/);
  assert.match(tree, /0x689467 : 0x437b55/);
  assert.match(tree, /b\.add\(g\.crown, flat\(leafColor\)/);
  assert.equal(api.patchUrbanTreeColor(tree), tree);
  assert.throws(() => api.patchUrbanTreeColor(props.replace('0x6fbf4a','0x6fbf4b')), /anchor/);
  const road = 'else col.setRGB(0.88 + n * 0.2, 0.97 + n * 0.08, 0.86);';
  const tuned = api.patchUrbanGrassColor('if (id === "city") {\n'+road+'\n}');
  assert.match(tuned, /0\.78 \+ n \* 0\.10, 0\.85 \+ n \* 0\.06, 0\.78/);
  assert.equal(api.patchUrbanGrassColor(tuned), tuned);
  assert.throws(() => api.patchUrbanGrassColor('new unknown ground'), /anchor/);
});

test('tree crowns use existing smooth normals without extra geometry, draws or changing pine branches', () => {
  const source = 'b.add(g.crown, flat(leafColor), M(x, y, z, rot, s));\nb.add(g.green, flat(0x2f6b45), M(x, y, z, rot, s));';
  const patched = api.patchTreeSurface(source);
  assert.equal(patched, source.replace('flat(leafColor)', 'std(leafColor, { roughness: .95 })'));
  assert.equal(api.patchTreeSurface(patched), patched);
  assert.throws(() => api.patchTreeSurface('unrecognized upstream'), /anchor/);
});
