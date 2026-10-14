/* global URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const api = await import('../racing-mobile-build.mjs').catch(() => ({}));
const patchFixture = `const fovT = 66 + Math.abs(P.s) * 0.12 + (P.nitroTime > 0 ? 9 : 0) + (P.smallBoost > 0 ? 4 : 0);
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
  assert.ok(mobile.includes('career.itemInput(g, canStep)'));
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
  assert.match(patchedLayouts, /applyTrackDesign\(LAYOUTS\)/);
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
