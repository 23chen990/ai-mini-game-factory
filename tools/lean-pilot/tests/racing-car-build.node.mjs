import { URL } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import * as builder from '../racing-mobile-build.mjs';

const carSource = `import * as THREE from 'three';
import { softDotTexture, textTexture } from './textures.js';
export const CAR_SKINS = ['eight native paints'];
function profileShape(pts) { return pts; }
function geos() { return 'legacy geometry'; }
export function buildCar(skin, { name = null, isPlayer = false } = {}) {
  const G = geos();
  const car = new THREE.Group();
  const root = new THREE.Group();
  car.add(root);
  const paint = new THREE.MeshPhysicalMaterial({ color: skin.body });
  root.add(new THREE.Mesh(G.body, paint));
  // 底盘光
  const glowMat = softDotTexture();
  // 车轮
  const wheels = ['legacy wheels'];
  // 氮气尾焰（两个锥体，加色混合）
  const flames = ['native flames'];
  const shield = 'native shield';
  car.userData = { root, wheels, flames, exhausts, flameMatOuter, under, glowMat, tag, shield, skin, isPlayer, tailM };
  return car;
}`;

test('generated car replaces every procedural body/wheel path while preserving native effects and skins', () => {
  assert.equal(typeof builder.patchGeneratedCarModelSource, 'function', 'generated car build adapter is missing');
  const output = builder.patchGeneratedCarModelSource(carSource);
  assert.match(output, /instantiateGeneratedCar\(skin\)/u);
  assert.match(output, /root\.add\(asset\.body\)/u);
  assert.match(output, /const wheels = asset\.wheels/u);
  assert.match(output, /const exhausts = asset\.exhausts/u);
  assert.match(output, /const tailM = asset\.tailMaterial/u);
  assert.match(output, /'native flames'/u);
  assert.match(output, /'native shield'/u);
  assert.match(output, /'eight native paints'/u);
  assert.doesNotMatch(output, /function geos|legacy wheels|MeshPhysicalMaterial/u);
  assert.equal(builder.patchGeneratedCarModelSource(output), output);
  assert.throws(() => builder.patchGeneratedCarModelSource('unreviewed upstream source'), /car model.*anchor/iu);
});

test('all native map startups await the cached GLB before racers can be built', () => {
  assert.equal(typeof builder.patchGeneratedCarStartup, 'function', 'generated car startup gate is missing');
  const source = "import { buildCar, CAR_SKINS } from './carModel.js';\nclass Game {\n  async loadMap(id) {\n    this.loading = true;\n    this.physics = 'untouched';\n  }\n}";
  const output = builder.patchGeneratedCarStartup(source);
  assert.match(output, /await carAssetReady/u);
  assert.ok(output.indexOf('this.loading = true;') < output.indexOf('await carAssetReady'));
  assert.match(output, /this\.physics = 'untouched'/u);
  assert.equal(builder.patchGeneratedCarStartup(output), output);
  assert.throws(() => builder.patchGeneratedCarStartup('unreviewed startup'), /car startup.*anchor/iu);
});

test('embedded original GLB is byte-exact, shared and standalone; no network or legacy fallback', () => {
  assert.equal(typeof builder.renderEmbeddedCarModule, 'function', 'embedded GLB module is missing');
  const bytes = Buffer.from([0x67, 0x6c, 0x54, 0x46, 0, 1, 255, 127]);
  const identity = { id: 'original-racer', sha256: 'a'.repeat(64) };
  const module = builder.renderEmbeddedCarModule(bytes, identity);
  assert.ok(module.includes(bytes.toString('base64')));
  assert.match(module, /parseAsync\(bytes\.buffer, ''\)/u);
  assert.match(module, /createGeneratedCarFactory/u);
  assert.match(module, /export const carAssetReady/u);
  assert.match(module, /export const instantiateGeneratedCar/u);
  assert.doesNotMatch(module, /fetch\(|https:|buildCar\(/u);
});

test('car identity survives native userData and is an integrity input, not homepage-only decoration', () => {
  const output = builder.patchGeneratedCarModelSource(carSource);
  assert.match(output, /assetIdentity: asset\.assetIdentity/u);
  assert.ok(builder.RACING_OWNED_NAMES.includes('generated-car.mjs'));
});

test('racer PR CI actually selects the new branch and exercises compiled car and asset checks', async () => {
  const { readFile } = await import('node:fs/promises');
  const workflow = await readFile(new URL('../../../.github/workflows/racing-v3-smoke.yml', import.meta.url), 'utf8');
  for (const text of ['codex/hunyuan-racer-', 'racing-car-build.node.mjs', 'racing-car-prepare.node.mjs', 'racing-car-model-runtime.mjs']) assert.ok(workflow.includes(text), text);
});

test('build rejects raw-heavy or unrigged GLBs rather than loading them as a mobile car', async () => {
  assert.equal(typeof builder.validatePreparedCar, 'function', 'prepared GLB budget/rig gate is missing');
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile(new URL('../../../templates/web-lite/h5-source-mobile-v1/racing/assets/original-racer.glb', import.meta.url));
  const stats = builder.validatePreparedCar(bytes);
  assert.ok(stats.triangles <= 18000 && stats.bytes <= 1572864);
  assert.equal(stats.materials.length, 7);
  assert.throws(() => builder.validatePreparedCar(Buffer.alloc(1572865)), /budget/iu);
  const wrongRig = Buffer.from(bytes);
  const jsonLength = wrongRig.readUInt32LE(12);
  const json = wrongRig.subarray(20, 20 + jsonLength).toString('utf8').replaceAll('Chassis', 'BADNODE');
  wrongRig.write(json, 20, 'utf8');
  assert.throws(() => builder.validatePreparedCar(wrongRig), /Chassis/u);
});

test('home and settlement frame the selected true native car without replacing gameplay cameras', () => {
  assert.equal(typeof builder.patchGeneratedCarPresentation, 'function');
  const source = `  updateCamera(dt) {
    const cam = this.camera;
    const st = this.state;
    let target = this.player;
    if (st === 'menu') {
      this.demoT += dt;
      if (this.demoT > 9) { this.demoT = 0; this.demoTarget = (this.demoTarget + 1) % this.racers.length; this.demoCut = true; }
      target = this.racers[this.demoTarget];
    }
    if (!target) return;
    const tx = target.x, ty = target.y, tz = target.z;
    if (st === 'menu' || (st === 'finish' && this.resultShown)) {
      originalOrbit();
      return;
    }
    const P = target;
    nativeRaceCamera(P, dt);
  }`;
  const output = builder.patchGeneratedCarPresentation(source);
  assert.match(output, /target = this\.racers\[0\]/u);
  assert.match(output, /this\.camPos\.copy\(want\)/u);
  assert.match(output, /cam\.aspect/u);
  assert.match(output, /r\.model\.visible = r === target/u);
  assert.match(output, /if \(!r\.isPlayer\) r\.model\.userData\.tag\.visible = false/u);
  assert.match(output, /nativeRaceCamera\(P, dt\)/u);
  assert.doesNotMatch(output, /demoTarget =|originalOrbit\(\)/u);
  assert.equal(builder.patchGeneratedCarPresentation(output), output);
  assert.equal(builder.patchGeneratedCarPresentation(output.replace('const distance = 7.8', 'const distance = 99')), output);
  assert.throws(() => builder.patchGeneratedCarPresentation('unreviewed camera'), /presentation.*anchor/iu);
});
