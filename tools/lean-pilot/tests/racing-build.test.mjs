/* global URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const api = await import('../racing-mobile-build.mjs').catch(() => ({}));
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
  assert.match(patchedLayouts, /applyTrackDesign\(LAYOUTS, \{ v8: true, v9: true \}\)/);
  assert.equal(api.patchRaceLayouts(patchedLayouts),patchedLayouts);
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
  assert.match(patched,/installPhysicalShortcut\(track, requestedCourse, \{v8:true,v9:true\}\)/);
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
 assert.ok(init.includes('antialias: !IS_TOUCH'));
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
