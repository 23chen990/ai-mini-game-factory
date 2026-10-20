/* global process, URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';

const THREE = await import(pathToFileURL(process.env.RACE_THREE_MODULE).href);
const owned = new URL('../../../templates/web-lite/h5-source-mobile-v1/racing/', import.meta.url);
const metadata = { paintable: false, wheelMode: 'static-baked', bounds: { min: [-1, 0, -2.4], max: [1, 1.2, 2.4] }, normalization: { up: '+Y', forward: '+Z', groundY: 0, centerXZ: [0, 0], lengthM: 4.8, runtimeScale: 1 } };
const ids = ['starter', 'custom-01', 'custom-02', 'custom-03', 'custom-04', 'custom-05'];
const identity = id => ({ id, carId: id, sha256: id === 'custom-01' ? 'a'.repeat(64) : 'b'.repeat(64) });

function template() {
  const scene = new THREE.Group();
  const map = new THREE.DataTexture(new Uint8Array([60, 90, 120, 255]), 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x8293a4, map });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 4.8), material);
  mesh.geometry.translate(0, 0.6, 0);
  mesh.name = 'BakedUserCar'; scene.add(mesh);
  return { scene, mesh, material, map };
}

function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function onDispose(resource) { let count = 0; resource.addEventListener('dispose', () => count++); return () => count; }

test('real Three clone retains each baked material and shared texture, with honest static wheels and exact identity', async () => {
  const { createUserCarFactory } = await import(new URL('user-car.mjs', owned));
  const original = template();
  const { instantiate } = createUserCarFactory(THREE, original.scene, identity('custom-01'), metadata);
  const first = instantiate({ body: 0xff0000, rim: 0x000000 });
  const second = instantiate({ body: 0x00ff00, rim: 0xffffff });
  const a = first.body.getObjectByName('BakedUserCar'), b = second.body.getObjectByName('BakedUserCar');
  assert.notEqual(a, original.mesh); assert.notEqual(a.material, original.material); assert.notEqual(a.material, b.material);
  assert.equal(a.geometry, original.mesh.geometry); assert.equal(a.material.map, original.map);
  assert.equal(a.material.color.getHex(), original.material.color.getHex()); assert.equal(a.material.color.getHex(), b.material.color.getHex());
  assert.deepEqual(first.wheels, []); assert.equal(first.tailMaterial, null);
  assert.deepEqual(first.assetIdentity, identity('custom-01')); assert.ok(Object.isFrozen(first.assetIdentity));
  assert.equal(first.exhausts.length, 2); assert.ok(first.exhausts.every(v => v.z < -2.3 && v.y > 0));
  const box = new THREE.Box3().setFromObject(first.body);
  assert.ok(Math.abs(box.min.y) < 1e-5); assert.ok(Math.abs(box.max.z - box.min.z - 4.8) < 1e-5);
  assert.deepEqual(first.body.scale.toArray(), [1, 1, 1]);
});

test('imported cars bound specular glare only on private material clones, preserving every original PBR map and color', async () => {
  const { createUserCarFactory } = await import(new URL('user-car.mjs', owned));
  const original = template();
  original.material.envMapIntensity = 1;
  original.material.metalness = .8;
  original.material.roughnessMap = original.map;
  original.material.normalMap = original.map;
  const result = createUserCarFactory(THREE, original.scene, identity('custom-01'), metadata).instantiate();
  const material = result.body.getObjectByName('BakedUserCar').material;
  assert.equal(material.envMapIntensity, .45);
  assert.equal(original.material.envMapIntensity, 1);
  assert.equal(material.metalness, .8 * .55);
  assert.equal(original.material.metalness, .8);
  assert.equal(material.map, original.map);
  assert.equal(material.roughnessMap, original.map);
  assert.equal(material.normalMap, original.map);
  assert.equal(material.color.getHex(), original.material.color.getHex());
  const shader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader);
  assert.match(shader.fragmentShader, /#include <roughnessmap_fragment>\nroughnessFactor = max\(roughnessFactor, 0\.38\);/);
  assert.equal(material.customProgramCacheKey(), 'user-car-bounded-finish-v1');
  const sourceShader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  original.material.onBeforeCompile(sourceShader);
  assert.equal(sourceShader.fragmentShader, THREE.ShaderLib.standard.fragmentShader);
  assert.deepEqual(result.wheels, []);
});

test('wrong normalization and animated/skinned user meshes fail instead of silently rescaling or pretending wheel rigs', async () => {
  const { createUserCarFactory } = await import(new URL('user-car.mjs', owned));
  const wrong = template(); wrong.scene.scale.setScalar(2);
  assert.throws(() => createUserCarFactory(THREE, wrong.scene, identity('custom-01'), metadata), /normaliz|bound|length/iu);
  const skinned = template(); skinned.mesh.isSkinnedMesh = true;
  assert.throws(() => createUserCarFactory(THREE, skinned.scene, identity('custom-01'), metadata), /skin|animated/iu);
});

async function cacheFixture(parseOverride) {
  const { createCarAssetCache, disposeCarModel } = await import(new URL('car-asset-cache.mjs', owned));
  const { createUserCarFactory } = await import(new URL('user-car.mjs', owned));
  const calls = [], templates = new Map();
  const cache = createCarAssetCache({ descriptors: ids.map(id => ({ id, identity: identity(id), metadata })), maxTemplates: 3,
    parse: async descriptor => { calls.push(descriptor.id); if (parseOverride) await parseOverride(descriptor.id); const value = template(); templates.set(descriptor.id, value); return value.scene; },
    createFactory: (descriptor, scene) => createUserCarFactory(THREE, scene, descriptor.identity, descriptor.metadata),
  });
  return { cache, calls, templates, disposeCarModel };
}

test('cache is lazy, deduplicates a request, serializes decode, skips cancelled queued models, and has no unknown fallback', async () => {
  const gate = deferred();
  const { cache, calls } = await cacheFixture(id => id === 'custom-01' ? gate.promise : undefined);
  assert.deepEqual(calls, []);
  const a = cache.prepare('custom-01'), b = cache.prepare('custom-01');
  let current = true;
  const skipped = cache.prepare('custom-02', { isCurrent: () => current });
  const c = cache.prepare('custom-03'); current = false;
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(calls, ['custom-01']); gate.resolve();
  const results = await Promise.all([a, b, skipped, c]);
  assert.deepEqual(calls, ['custom-01', 'custom-03']);
  assert.equal(results[2].status, 'stale'); assert.equal(cache.isReady('custom-02'), false);
  assert.equal(cache.isReady('custom-01'), true); assert.equal(cache.isReady('custom-03'), true);
  await assert.rejects(cache.prepare('unknown'), /Unknown/u);
  assert.throws(() => cache.instantiate('custom-02', {}), /not ready/iu);
});

test('decode failure rejects accurately, leaves no ready factory, and permits one later real retry', async () => {
  let attempt = 0;
  const { cache, calls } = await cacheFixture(() => { if (!attempt++) throw Error('invalid GLB'); });
  await assert.rejects(cache.prepare('custom-01'), /invalid GLB/u);
  assert.equal(cache.isReady('custom-01'), false);
  assert.equal((await cache.prepare('custom-01')).status, 'ready'); assert.equal(calls.length, 2);
});

test('an in-flight cancelled preview cannot evict the owned model being prepared for native map startup', async () => {
  const gate = deferred();
  const { cache } = await cacheFixture(id => id === 'custom-03' ? gate.promise : undefined);
  await cache.prepare('starter'); await cache.prepare('custom-01'); await cache.prepare('custom-02');
  const lockedPreview = cache.instantiate('custom-02', {});
  let current = true;
  const abandoned = cache.prepare('custom-03', { isCurrent: () => current });
  await Promise.resolve(); await Promise.resolve();
  current = false;
  await cache.prepare('custom-01'); // Canonical owned selection awaits native map construction.
  gate.resolve();
  assert.equal((await abandoned).status, 'stale');
  assert.equal(cache.isReady('custom-03'), false);
  assert.equal(cache.isReady('custom-01'), true, 'a late cancelled scene must not evict the owned ready car');
  const owned = cache.instantiate('custom-01', {});
  assert.equal(owned.assetIdentity.carId, 'custom-01'); owned.release(); lockedPreview.release();
});

test('bounded cache preserves active cars and starter; removal frees private materials once but not shared assets or native cached textures', async () => {
  const { cache, templates, disposeCarModel } = await cacheFixture();
  await cache.prepare('starter'); await cache.prepare('custom-01');
  const original = templates.get('custom-01'), geoDisposed = onDispose(original.mesh.geometry), textureDisposed = onDispose(original.map);
  const first = cache.instantiate('custom-01', {}), second = cache.instantiate('custom-01', {});
  const firstMat = first.body.getObjectByName('BakedUserCar').material, privateDisposed = onDispose(firstMat);
  const model = new THREE.Group(); model.add(first.body);
  model.userData = { assetRelease: first.release, assetMaterials: first.privateMaterials, assetGeometries: first.sharedGeometries };
  const nativeTexture = new THREE.Texture(), nativeTextureDisposed = onDispose(nativeTexture);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ map: nativeTexture }));
  const effectMatDisposed = onDispose(glow.material), effectGeoDisposed = onDispose(glow.geometry); model.add(glow);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nativeTexture }));
  const spriteGeoDisposed = onDispose(tag.geometry), spriteMatDisposed = onDispose(tag.material); model.add(tag);
  disposeCarModel(model); disposeCarModel(model);
  assert.equal(privateDisposed(), 1); assert.equal(effectMatDisposed(), 1); assert.equal(effectGeoDisposed(), 1); assert.equal(spriteMatDisposed(), 1);
  assert.equal(geoDisposed(), 0); assert.equal(textureDisposed(), 0); assert.equal(nativeTextureDisposed(), 0); assert.equal(spriteGeoDisposed(), 0);
  for (const id of ['custom-02', 'custom-03', 'custom-04', 'custom-05']) await cache.prepare(id);
  assert.ok(cache.isReady('starter')); assert.ok(cache.isReady('custom-01')); assert.ok(ids.filter(id => cache.isReady(id)).length <= 3);
  assert.equal(geoDisposed(), 0); second.release();
  await cache.prepare('custom-02'); await cache.prepare('custom-03');
  assert.equal(cache.isReady('custom-01'), false); assert.equal(geoDisposed(), 1); assert.equal(textureDisposed(), 1);
});

test('native preview swaps only the home model, is last-request-wins and never mutates selected car or racer physics', async () => {
  const { patchUserCarWorldSource } = await import('../racing-mobile-build.mjs');
  assert.equal(typeof patchUserCarWorldSource, 'function');
  const source = await readFile(new URL('../../../runs/h5-qq-mobile-20261013/workspace/source/qq-speed/src/main.js', import.meta.url), 'utf8');
  const patched = patchUserCarWorldSource(source);
  const methods = patched.slice(patched.indexOf('  // User car preview lifecycle'), patched.indexOf('  clearRacers()'));
  assert.ok(methods.includes('async previewCar'));
  const gates = new Map(), disposed = [];
  const prepareCar = (id, options) => { const d = deferred(); gates.set(id, { ...d, options }); return d.promise; };
  const buildCar = (skin, { carId }) => { const model = new THREE.Group(); model.userData = { carId, skin, tag: { visible: true } }; return model; };
  const Game = new Function('prepareCar', 'carIsReady', 'buildCar', 'CAR_SKINS', 'disposeCarModel', 'return class {' + methods + '}')(prepareCar, () => true, buildCar, [{}], model => disposed.push(model));
  const game = new Game(); game.state = 'menu'; game.loading = false; game.settings = { car: 'starter', skin: 0 }; game.scene = new THREE.Scene();
  const original = new THREE.Group(); original.position.set(12, 0.4, -8); original.rotation.y = 0.7;
  const racer = { model: original, name: 'native', x: 12, y: 0.4, z: -8, h: 0.7, s: 25, d: 456 }; game.racers = [racer]; game.scene.add(original);
  const first = game.previewCar('custom-01'), second = game.previewCar('custom-02');
  gates.get('custom-02').resolve({ status: 'ready' }); assert.equal((await second).status, 'ready');
  gates.get('custom-01').resolve({ status: 'ready' }); assert.equal((await first).status, 'stale');
  assert.equal(racer.model.userData.carId, 'custom-02'); assert.deepEqual(racer.model.position.toArray(), [12, 0.4, -8]);
  assert.equal(racer.model.parent, game.scene); assert.deepEqual(disposed, [original]); assert.equal(game.settings.car, 'starter');
  assert.deepEqual({ x: racer.x, y: racer.y, z: racer.z, h: racer.h, s: racer.s, d: racer.d }, { x: 12, y: 0.4, z: -8, h: 0.7, s: 25, d: 456 });
  const cancelled = game.previewCar('custom-03'); game.cancelCarPreview(); gates.get('custom-03').resolve({ status: 'ready' });
  assert.equal((await cancelled).status, 'stale'); assert.equal(racer.model.userData.carId, 'custom-02');
  game.state = 'race'; assert.equal((await game.previewCar('custom-04')).status, 'blocked');
});

test('all six actual GLB geometries/material links parse through pinned GLTFLoader and match their identity/normalization', async t => {
  // This Node geometry check stubs browser bitmap decoding only. Actual JPEG
  // pixels, WebGL rendering and default home/race/result are separate browser
  // gates, not conclusions of this test.
  const { GLTFLoader } = await import(new URL('../examples/jsm/loaders/GLTFLoader.js', pathToFileURL(process.env.RACE_THREE_MODULE)));
  const { loadPreparedRacingCars } = await import('../racing-mobile-build.mjs');
  const { createGeneratedCarFactory } = await import(new URL('generated-car.mjs', owned));
  const { createUserCarFactory } = await import(new URL('user-car.mjs', owned));
  const { createCarAssetCache } = await import(new URL('car-asset-cache.mjs', owned));
  const models = (await loadPreparedRacingCars(fileURLToPath(owned))).models;
  const saved = new Map(['self', 'createImageBitmap'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  globalThis.self = globalThis;
  globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
  t.after(() => { for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const scenes = new Map(), evidence = [];
  const cache = createCarAssetCache({ descriptors: models.map(model => ({ ...model, id: model.identity.carId })),
    parse: async descriptor => {
      const { bytes } = descriptor;
      const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
      scenes.set(descriptor.id, scene); return scene;
    },
    createFactory: (descriptor, scene) => descriptor.id === 'starter'
      ? createGeneratedCarFactory(THREE, scene, Object.freeze(descriptor.identity))
      : createUserCarFactory(THREE, scene, descriptor.identity, descriptor.metadata),
  });
  for (const descriptor of models) {
    const id = descriptor.identity.carId;
    assert.equal((await cache.prepare(id)).status, 'ready');
    const asset = cache.instantiate(id, { body: 0x33bbff, rim: 0x999999 });
    assert.equal(asset.assetIdentity.carId, id); assert.equal(asset.assetIdentity.sha256, descriptor.identity.sha256);
    assert.equal(asset.wheels.length, id === 'starter' ? 4 : 0);
    if (id !== 'starter') {
      const actual = new THREE.Box3().setFromObject(asset.body);
      assert.ok(Math.abs(actual.min.y) < 0.025); assert.ok(Math.abs(actual.max.z - actual.min.z - 4.8) < 0.025);
      assert.ok(Math.abs(actual.min.x + actual.max.x) < 0.025);
      const gltf = JSON.parse(descriptor.bytes.subarray(20, 20 + descriptor.bytes.readUInt32LE(12)).toString());
      if (gltf.extensionsUsed?.includes('KHR_mesh_quantization')) {
        let checked = 0;
        scenes.get(id).traverse(object => {
          if (!object.isMesh) return;
          for (const name of ['normal', 'uv']) if (object.geometry.attributes[name]?.array.BYTES_PER_ELEMENT === 2) {
            assert.equal(object.geometry.attributes[name].normalized, true); checked++;
          }
        });
        assert.ok(checked > 0, 'declared quantization must survive actual loader attributes');
      }
    }
    evidence.push({ carId: id, sha256: asset.assetIdentity.sha256, triangles: descriptor.stats.triangles, wheels: asset.wheels.length });
    asset.release();
  }
  assert.deepEqual(evidence.map(model => model.carId), ids);
  t.diagnostic(JSON.stringify({ scope: 'Actual GLB geometry/material topology; browser bitmap decoding stubbed', models: evidence }));
});
