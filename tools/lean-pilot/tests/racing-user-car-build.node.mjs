/* global Buffer, URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as builder from '../racing-mobile-build.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// Exact patch-boundary fixtures keep this pre-build suite independent of the
// generated project. Post-build real-Three tests exercise the actual World.
const carSource = `export function buildCar(skin, { name = null, isPlayer = false } = {}) {
  const asset = instantiateGeneratedCar(skin);
  // 底盘光
  softDotTexture(); new THREE.PlaneGeometry(3.2, 5.6);
  // 氮气尾焰
  // 名字标签
  textTexture(name);
  // 护盾
  new THREE.SphereGeometry(2.9, 24, 16);
  car.userData = { assetIdentity: asset.assetIdentity, root, wheels, flames, shield };
}`;
const worldSource = `import { carAssetReady } from './race-car-loader.mjs';
class World {
  constructor() { this.settings = Object.assign({ skin: 0, laps: 2, diff: 1 }, this.load()); }
  async loadMap() {
    await carAssetReady;
  }
  clearRacers() {
    for (const r of this.racers) {
      r.model.traverse((o) => {
        if (o.material && !o.isSprite) o.material.dispose();
      });
    }
  }
  makeRacers(withPlayer) {
    this.clearRacers();
    const a = buildCar(CAR_SKINS[S.skin], { isPlayer: true });
    const b = buildCar(skin, { name: names[ai % names.length] });
    r = new PlayerCar(this.track, a, '我');
    r.reset(d, lat);
  }
  startDemo() {
    if (!this.track) return;
  }
  startRace() {
    if (this.loading) return;
  }
  // ---------- 主循环 ----------
  step(dt) { this.nativeDrivingAndCollision(dt); }
}`;

test('six-car loader embeds exact bytes but decodes only requested assets with no remote dependency', () => {
  assert.equal(typeof builder.renderEmbeddedCarGarageModule, 'function');
  const models = ['starter', 'custom-01', 'custom-02', 'custom-03', 'custom-04', 'custom-05'].map((id, i) => {
    const bytes = Buffer.from('actual model ' + i);
    return { bytes, identity: { id, carId: id, sha256: hash(bytes) }, metadata: { paintable: id === 'starter' } };
  });
  const source = builder.renderEmbeddedCarGarageModule(models);
  for (const model of models) assert.ok(source.includes(model.bytes.toString('base64')));
  assert.match(source, /createCarAssetCache/u);
  assert.match(source, /createUserCarFactory/u);
  assert.match(source, /createGeneratedCarFactory/u);
  assert.match(source, /prepare\('starter'\)/u);
  assert.match(source, /export const prepareCar/u);
  assert.match(source, /export const carIsReady/u);
  assert.doesNotMatch(source, /fetch\(|https?:|Promise\.all|\.map\([^\n]*parseAsync/u);
});

test('native car construction uses stable model identity and preserves original effects', () => {
  assert.equal(typeof builder.patchUserCarModelSource, 'function');
  const source = carSource;
  const output = builder.patchUserCarModelSource(source);
  assert.match(output, /carId = 'starter'/u);
  assert.match(output, /instantiateGeneratedCar\(skin, carId\)/u);
  assert.match(output, /carId: asset\.assetIdentity\.carId/u);
  assert.match(output, /assetRelease: asset\.release/u);
  assert.match(output, /assetGeometries: asset\.sharedGeometries/u);
  for (const anchor of ['// 底盘光', '// 氮气尾焰', '// 名字标签', '// 护盾']) assert.ok(output.includes(anchor));
  for (const effect of ['softDotTexture()', 'textTexture(name', 'new THREE.SphereGeometry(2.9, 24, 16)', 'new THREE.PlaneGeometry(3.2, 5.6)']) assert.ok(output.includes(effect));
  assert.equal(builder.patchUserCarModelSource(output), output);
  assert.throws(() => builder.patchUserCarModelSource('changed external input'), /anchor/iu);
});

test('native home/race model selection loads settings.car and does not change any driving methods', () => {
  assert.equal(typeof builder.patchUserCarWorldSource, 'function');
  const source = worldSource;
  const output = builder.patchUserCarWorldSource(source);
  assert.match(output, /await prepareCar\(this\.settings\.car \|\| 'starter'\)/u);
  assert.match(output, /buildCar\(CAR_SKINS\[S\.skin\], \{ isPlayer: true, carId: S\.car \|\| 'starter' \}\)/u);
  assert.match(output, /carId: !withPlayer && k === 0 \? S\.car \|\| 'starter' : 'starter'/u);
  assert.match(output, /disposeCarModel\(r\.model\)/u);
  assert.match(output, /async previewCar\(id\)/u);
  const previewMethods = output.slice(output.indexOf('  // User car preview lifecycle'), output.indexOf('  clearRacers()'));
  assert.doesNotMatch(previewMethods, /this\.settings\.car\s*=|racer\.(?:x|y|z|s|d|h|lat)\s*=/u);
  const drivingStart = '  // ---------- 主循环 ----------';
  assert.equal(output.slice(output.indexOf(drivingStart)), source.slice(source.indexOf(drivingStart)), 'model selection changed the native driving/collision/camera loop');
  assert.equal(builder.patchUserCarWorldSource(output), output);
  assert.throws(() => builder.patchUserCarWorldSource('changed external input'), /anchor/iu);
});

for (const storedCar of ['unknown-removed-model', 'custom-05']) test('bootstrap ignores untrusted native car ' + storedCar + ' while retaining all other settings', () => {
  const output = builder.patchUserCarWorldSource(worldSource);
  const assignment = output.match(/this\.settings = Object\.assign\([^\n]*?\);/u)?.[0];
  assert.ok(assignment);
  const nativeSave = { car: storedCar, skin: 6, laps: 3, diff: 2, map: 'snow', mode: 'item', quality: 'low', song: 4 };
  const game = { load: () => ({ ...nativeSave }) };
  new Function(assignment).call(game);
  assert.equal(game.settings.car, 'starter', 'native storage must not select a model before canonical ownership is restored');
  assert.deepEqual(game.settings, { ...nativeSave, car: 'starter' });
  game.settings.car = 'custom-03'; // The later canonical RacingCareer.configure owns this separate step.
  assert.equal(game.settings.car, 'custom-03');
  assert.match(output, /await prepareCar\(this\.settings\.car \|\| 'starter'\)/u);
});

test('all new model modules, thumbnails and exact GLB hashes are fingerprinted', () => {
  for (const name of ['generated-car.mjs', 'user-car.mjs', 'car-asset-cache.mjs', 'garage.mjs', 'car-thumbnails.mjs'])
    assert.ok(builder.RACING_OWNED_NAMES.includes(name), name);
  assert.deepEqual(builder.RACING_CAR_ASSET_PATHS, ['assets/original-racer.glb', 'assets/custom-racer-01.glb', 'assets/custom-racer-02.glb', 'assets/custom-racer-03.glb', 'assets/custom-racer-04.glb', 'assets/custom-racer-05.glb', 'assets/user-cars-manifest.json']);
});

test('prepared user models have a separate strict contract from the articulated starter', () => {
  assert.equal(typeof builder.validatePreparedUserCar, 'function');
  assert.throws(() => builder.validatePreparedUserCar(Buffer.alloc(8), {}), /GLB|glTF|binary/iu);
  assert.throws(() => builder.validatePreparedUserCar(Buffer.alloc(1_572_865), {}, { maxBytes: 1_572_864, maxTriangles: 18000, maxTextureSize: 1024 }), /budget/iu);
});

function tinyUserGlb({ triangles = 1, change = () => {} } = {}) {
  const positions = Buffer.alloc(36), uv = Buffer.alloc(24), indices = Buffer.alloc(triangles * 6);
  [-1, 0, -2.4, 1, 0, 0, 0, 1.2, 2.4].forEach((value, index) => positions.writeFloatLE(value, index * 4));
  for (let i = 0; i < triangles * 3; i++) indices.writeUInt16LE(i % 3, i * 2);
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=', 'base64');
  const alignedIndices = Buffer.concat([indices, Buffer.alloc((4 - indices.length % 4) % 4)]);
  const imageOffset = positions.length + uv.length + alignedIndices.length;
  const payload = Buffer.concat([positions, uv, alignedIndices, image]);
  const binary = Buffer.concat([payload, Buffer.alloc((4 - payload.length % 4) % 4)]);
  const gltf = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, 0, -2.4], max: [1, 1.2, 2.4] },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' }, { bufferView: 2, componentType: 5123, count: triangles * 3, type: 'SCALAR' }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }], textures: [{ source: 0 }],
    images: [{ bufferView: 3, mimeType: 'image/png' }], buffers: [{ byteLength: payload.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.length }, { buffer: 0, byteOffset: positions.length, byteLength: uv.length },
      { buffer: 0, byteOffset: positions.length + uv.length, byteLength: indices.length }, { buffer: 0, byteOffset: imageOffset, byteLength: image.length }] };
  change(gltf);
  const raw = Buffer.from(JSON.stringify(gltf)), json = Buffer.concat([raw, Buffer.alloc((4 - raw.length % 4) % 4, 0x20)]);
  const header = Buffer.alloc(20), binHeader = Buffer.alloc(8), length = 20 + json.length + 8 + binary.length;
  [0x46546c67, 2, length, json.length, 0x4e4f534a].forEach((value, index) => header.writeUInt32LE(value, index * 4));
  binHeader.writeUInt32LE(binary.length); binHeader.writeUInt32LE(0x004e4942, 4);
  const bytes = Buffer.concat([header, json, binHeader, binary]);
  return { bytes, metadata: { paintable: false, wheelMode: 'static-source-mesh', triangles, bytes: bytes.length, sha256: hash(bytes) } };
}
const fixtureLimits = { maxBytes: 100_000, maxTriangles: 2, maxTextureSize: 1024 };

test('single mesh textured GLB validates without invented starter rig, and explicit budgets are actually enforced', () => {
  const asset = tinyUserGlb();
  const result = builder.validatePreparedUserCar(asset.bytes, asset.metadata, fixtureLimits);
  assert.equal(result.triangles, 1); assert.deepEqual(result.textures, [{ width: 1, height: 1, mimeType: 'image/png' }]);
  assert.throws(() => builder.validatePreparedCar(asset.bytes), /Chassis/u);
  assert.throws(() => builder.validatePreparedUserCar(asset.bytes, asset.metadata), /explicit approved mobile budget/u);
  const heavy = tinyUserGlb({ triangles: 3 });
  assert.throws(() => builder.validatePreparedUserCar(heavy.bytes, heavy.metadata, fixtureLimits), /triangle budget/u);
  assert.equal(builder.validatePreparedUserCar(heavy.bytes, heavy.metadata, { ...fixtureLimits, maxTriangles: 3 }).triangles, 3);
});

test('user GLB integrity rejects external images, animated rigs, missing UVs, decoder dependencies and stale manifest hashes', () => {
  for (const change of [gltf => { gltf.images[0].uri = 'https://invalid.example/texture.png'; },
    gltf => { gltf.animations = [{}]; }, gltf => { delete gltf.meshes[0].primitives[0].attributes.TEXCOORD_0; },
    gltf => { gltf.extensionsUsed = ['EXT_meshopt_compression']; }]) {
    const asset = tinyUserGlb({ change });
    assert.throws(() => builder.validatePreparedUserCar(asset.bytes, asset.metadata, fixtureLimits), /embedded|Animated|UV|decoder/u);
  }
  const asset = tinyUserGlb();
  assert.throws(() => builder.validatePreparedUserCar(asset.bytes, { ...asset.metadata, sha256: 'a'.repeat(64) }, fixtureLimits), /identity manifest/u);
  const truncated = asset.bytes.subarray(0, asset.bytes.length - 4);
  assert.throws(() => builder.validatePreparedUserCar(truncated, asset.metadata, fixtureLimits), /complete binary/u);
});

test('CI exercises the actual garage before legacy entry smoke and keeps publication dependent on the complete job', async () => {
  const workflow = await readFile(new URL('../../../.github/workflows/racing-v3-smoke.yml', import.meta.url), 'utf8');
  assert.ok(workflow.includes('tests/racing-user-car-build.node.mjs'));
  assert.ok(workflow.includes('tests/racing-user-car-runtime.mjs'));
  assert.ok(workflow.indexOf('name: Verify six actual garage models') < workflow.indexOf('name: Launch actual bundled WebGL racing'));
  assert.ok(workflow.includes('artifacts/car-garage-ci/*'));
  assert.match(workflow, /publish-qa-preview:[\s\S]*needs: racing-v3/u);
});
