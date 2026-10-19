/* global process, URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const THREE = await import(pathToFileURL(process.env.RACE_THREE_MODULE).href);
const adapterUrl = new URL('../../../templates/web-lite/h5-source-mobile-v1/racing/generated-car.mjs', import.meta.url);
const skins = [
  { body: 0xe64537, rim: 0xc8d2dc },
  { body: 0x3da9fc, rim: 0x172b4d },
  { body: 0x8a55d7, rim: 0xf0c94d },
  { body: 0xf0bd39, rim: 0x212934 },
  { body: 0xe9edf2, rim: 0x788592 },
  { body: 0xf183a6, rim: 0x521e46 },
  { body: 0x2eb780, rim: 0xe5f3de },
  { body: 0x202632, rim: 0x58d8ef },
];

function makeTemplate(exhausts = [[-0.3, 0.5, -2.3], [0.3, 0.5, -2.3]]) {
  const scene = new THREE.Group();
  scene.userData.exhausts = exhausts;
  const colors = {
    BodyPaint: 0xb92128,
    Glass: 0x274c67,
    Tire: 0x17191b,
    Rim: 0x9fa8b2,
    Headlight: 0xffe4a3,
    Taillight: 0xb80f16,
    Trim: 0x222b33,
  };
  const materials = Object.fromEntries(Object.entries(colors).map(([name, color]) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: name === 'Glass' ? 0.18 : 0.7 });
    material.name = name;
    return [name, material];
  }));
  materials.BodyPaint.map = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const sharedTireTexture = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  materials.Tire.map = sharedTireTexture;

  const chassis = new THREE.Group();
  chassis.name = 'Chassis';
  chassis.position.set(0, 0.35, 0.08);
  const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.9, 4.4), materials.BodyPaint);
  bodyMesh.name = 'PaintedBody';
  chassis.add(bodyMesh);
  const fender = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.24, 1.1), materials.BodyPaint);
  fender.name = 'PaintedFender';
  chassis.add(fender);
  const glassMesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.4), materials.Glass);
  glassMesh.name = 'Canopy';
  chassis.add(glassMesh);
  for (const [name, z] of [['Headlight', 2.1], ['Taillight', -2.1], ['Trim', 0]]) {
    const detail = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.1), materials[name]);
    detail.name = `${name}Detail`;
    detail.position.z = z;
    chassis.add(detail);
  }
  scene.add(chassis);

  const wheelPositions = [
    ['Wheel_FL', -0.82, 0.2, 1.32],
    ['Wheel_FR', 0.82, 0.2, 1.32],
    ['Wheel_RL', -0.82, 0.2, -1.34],
    ['Wheel_RR', 0.82, 0.2, -1.34],
  ];
  for (const [name, x, y, z] of wheelPositions) {
    const wheel = new THREE.Group();
    wheel.name = name;
    wheel.position.set(x, y, z);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.24, 12), materials.Tire);
    tire.name = `${name}_Tire`;
    tire.rotation.z = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.25, 10), materials.Rim);
    rim.name = `${name}_Rim`;
    rim.rotation.z = Math.PI / 2;
    wheel.add(tire, rim);
    scene.add(wheel);
  }
  return { scene, materials, chassis };
}

function meshesByMaterialName(root, name) {
  const materials = [];
  root.traverse(object => {
    if (object.isMesh) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material.name === name && !materials.includes(material)) materials.push(material);
      }
    }
  });
  return materials;
}

function meshByName(root, name) {
  let result;
  root.traverse(object => {
    if (object.isMesh && object.name === name) result = object;
  });
  return result;
}

function mountCar(car) {
  const outer = new THREE.Group();
  outer.add(car.body, ...car.wheels.map(wheel => wheel.steer));
  return outer;
}

test('factory exposes the native loader contract as instantiate(skin)', async () => {
  const { createGeneratedCarFactory } = await import(adapterUrl);
  const { scene } = makeTemplate();
  const factory = createGeneratedCarFactory(THREE, scene, 'racer-hy-001');

  assert.equal(typeof factory.instantiate, 'function');
});

test('all eight skins recolor only body paint and rims, preserving glass, tires and lights', async () => {
  const { createGeneratedCarFactory } = await import(adapterUrl);
  const { scene, materials } = makeTemplate();
  const { instantiate } = createGeneratedCarFactory(THREE, scene, 'racer-hy-001');
  const sourceFixedColors = ['Glass', 'Tire', 'Headlight', 'Taillight', 'Trim']
    .map(name => [name, materials[name].color.getHex()]);

  for (const skin of skins) {
    const car = instantiate(skin);
    const model = mountCar(car);
    assert.equal(meshesByMaterialName(model, 'BodyPaint').length, 1);
    assert.equal(meshesByMaterialName(model, 'Rim').length, 1);
    assert.equal(meshesByMaterialName(model, 'BodyPaint')[0].color.getHex(), skin.body);
    assert.equal(meshesByMaterialName(model, 'Rim')[0].color.getHex(), skin.rim);
    for (const [name, color] of sourceFixedColors) {
      assert.equal(meshesByMaterialName(model, name)[0].color.getHex(), color);
    }
    assert.equal(car.tailMaterial, meshesByMaterialName(model, 'Taillight')[0]);
  }
});

test('instances share source geometry and textures but own one deduplicated cloned material set', async () => {
  const { createGeneratedCarFactory } = await import(adapterUrl);
  const { scene, materials } = makeTemplate();
  const { instantiate } = createGeneratedCarFactory(THREE, scene, 'racer-hy-001');
  const first = instantiate(skins[0]);
  const second = instantiate(skins[1]);
  const firstModel = mountCar(first);
  const secondModel = mountCar(second);

  assert.equal(meshByName(firstModel, 'PaintedBody').geometry, meshByName(scene, 'PaintedBody').geometry);
  assert.equal(meshByName(secondModel, 'PaintedBody').geometry, meshByName(scene, 'PaintedBody').geometry);
  assert.equal(meshesByMaterialName(firstModel, 'BodyPaint')[0].map, materials.BodyPaint.map);
  assert.equal(meshesByMaterialName(firstModel, 'BodyPaint').length, 1);
  assert.equal(meshByName(firstModel, 'PaintedBody').material, meshByName(firstModel, 'PaintedFender').material);
  assert.equal(meshByName(firstModel, 'Wheel_FL_Rim').material, meshByName(firstModel, 'Wheel_FR_Rim').material);
  assert.equal(meshByName(firstModel, 'Wheel_FL_Tire').material, meshByName(firstModel, 'Wheel_RR_Tire').material);
  assert.notEqual(meshesByMaterialName(firstModel, 'BodyPaint')[0], materials.BodyPaint);
  assert.notEqual(meshesByMaterialName(firstModel, 'BodyPaint')[0], meshesByMaterialName(secondModel, 'BodyPaint')[0]);
  for (const name of ['BodyPaint', 'Glass', 'Tire', 'Rim', 'Headlight', 'Taillight', 'Trim']) {
    const firstMaterial = meshesByMaterialName(firstModel, name)[0];
    const secondMaterial = meshesByMaterialName(secondModel, name)[0];
    assert.notEqual(firstMaterial, materials[name]);
    assert.notEqual(firstMaterial, secondMaterial);
  }
  assert.equal(meshByName(firstModel, 'Wheel_FL_Tire').material.map, materials.Tire.map);

  const firstPaint = meshesByMaterialName(firstModel, 'BodyPaint')[0];
  const secondPaint = meshesByMaterialName(secondModel, 'BodyPaint')[0];
  firstPaint.color.set(0x010203);
  assert.equal(secondPaint.color.getHex(), skins[1].body);
  assert.equal(materials.BodyPaint.color.getHex(), 0xb92128);
});

test('four wheel pivots retain car-space axle positions with independent steering and spin axes', async () => {
  const { createGeneratedCarFactory } = await import(adapterUrl);
  const { scene } = makeTemplate();
  const car = createGeneratedCarFactory(THREE, scene, 'racer-hy-001').instantiate(skins[0]);

  assert.deepEqual(car.wheels.map(({ x, z, front }) => [x, z, front]), [
    [-0.82, 1.32, true],
    [0.82, 1.32, true],
    [-0.82, -1.34, false],
    [0.82, -1.34, false],
  ]);
  for (const wheel of car.wheels) {
    assert.equal(wheel.steer.parent, null);
    assert.equal(wheel.spin.parent, wheel.steer);
    assert.equal(wheel.steer.position.x, wheel.x);
    assert.equal(wheel.steer.position.z, wheel.z);
    assert.notEqual(wheel.steer, wheel.spin);
  }
  assert.equal(car.body.children.length, 1);
  assert.equal(car.body.children[0].name, 'Chassis');
  const outer = mountCar(car);
  car.body.rotation.x = 0.4;
  outer.updateMatrixWorld(true);
  for (const wheel of car.wheels) {
    assert.deepEqual(wheel.steer.getWorldPosition(new THREE.Vector3()).toArray(), [wheel.x, 0.2, wheel.z]);
  }
  const chassis = car.body.getObjectByName('Chassis');
  assert.notEqual(chassis.getWorldPosition(new THREE.Vector3()).y, chassis.position.y);
  assert.notEqual(chassis.getWorldPosition(new THREE.Vector3()).z, chassis.position.z);
  car.wheels[0].spin.rotation.x = 1.25;
  car.wheels[0].steer.rotation.y = -0.3;
  assert.equal(car.wheels[0].spin.rotation.x, 1.25);
  assert.equal(car.wheels[0].steer.rotation.y, -0.3);
  assert.equal(car.wheels[1].spin.rotation.x, 0);
  assert.equal(car.wheels[1].steer.rotation.y, 0);
  assert.equal(car.wheels[0].spin.getObjectByName('Wheel_FL_Tire').geometry, meshByName(scene, 'Wheel_FL_Tire').geometry);
  assert.equal(chassis.parent, car.body);
  assert.equal(car.body.getObjectByName('Wheel_FL_Tire'), undefined);
});

test('each car carries two independent exhaust vectors and the configured asset identity', async () => {
  const { createGeneratedCarFactory } = await import(adapterUrl);
  const { scene } = makeTemplate();
  const identity = { file: 'cars/original-racer.glb', sha256: 'a'.repeat(64) };
  const { instantiate } = createGeneratedCarFactory(THREE, scene, identity);
  const first = instantiate(skins[0]);
  const second = instantiate(skins[1]);

  assert.equal(first.assetIdentity, identity);
  assert.deepEqual(first.exhausts.map(position => position.toArray()), [
    [-0.3, 0.5, -2.3], [0.3, 0.5, -2.3],
  ]);
  assert.ok(first.exhausts.every(position => position instanceof THREE.Vector3));
  assert.notEqual(first.exhausts[0], second.exhausts[0]);
});

test('template hierarchy, transforms and source materials stay unchanged after instantiation', async () => {
  const { createGeneratedCarFactory } = await import(adapterUrl);
  const configuredExhausts = [[-0.32, 0.48, -2.26], [0.32, 0.48, -2.26]];
  const { scene, materials, chassis } = makeTemplate(configuredExhausts);
  const originalChildren = scene.children.slice();
  const originalPositions = [chassis, ...scene.children.filter(child => child.name.startsWith('Wheel_'))]
    .map(node => [node.name, node.position.toArray()]);
  const originalColors = Object.entries(materials).map(([name, material]) => [name, material.color.getHex()]);
  const { instantiate } = createGeneratedCarFactory(THREE, scene, 'racer-hy-001');
  const car = instantiate(skins[0]);

  assert.deepEqual(scene.children, originalChildren);
  assert.deepEqual([chassis, ...scene.children.filter(child => child.name.startsWith('Wheel_'))]
    .map(node => [node.name, node.position.toArray()]), originalPositions);
  assert.deepEqual(Object.entries(materials).map(([name, material]) => [name, material.color.getHex()]), originalColors);
  assert.equal(car.exhausts[0].toArray().join(','), configuredExhausts[0].join(','));
  assert.equal(car.exhausts[1].toArray().join(','), configuredExhausts[1].join(','));
  assert.equal(meshByName(scene, 'PaintedBody').material, materials.BodyPaint);
  assert.equal(meshByName(car.body, 'PaintedBody').material === materials.BodyPaint, false);
});

test('a missing named GLB material fails at instantiation instead of silently leaving it unadapted', async () => {
  const { createGeneratedCarFactory } = await import(adapterUrl);
  const { scene, materials } = makeTemplate();
  materials.Glass.name = 'UnnamedGlass';
  const { instantiate } = createGeneratedCarFactory(THREE, scene, 'racer-hy-001');

  assert.throws(() => instantiate(skins[0]), TypeError);
});

test('missing processed exhaust metadata fails instead of synthesizing outlet defaults', async () => {
  const { createGeneratedCarFactory } = await import(adapterUrl);
  const { scene } = makeTemplate();
  delete scene.userData.exhausts;
  const { instantiate } = createGeneratedCarFactory(THREE, scene, 'racer-hy-001');

  assert.throws(() => instantiate(skins[0]), TypeError);
});

test('body paint masks the original atlas per texel while retaining the native skin color uniform', async () => {
  const { createGeneratedCarFactory } = await import(adapterUrl);
  const { scene } = makeTemplate();
  const car = createGeneratedCarFactory(THREE, scene, 'racer-hy-001').instantiate(skins[0]);
  const paint = meshesByMaterialName(car.body, 'BodyPaint')[0];
  const shader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader };

  paint.onBeforeCompile(shader, null);

  assert.equal(paint.color.getHex(), skins[0].body);
  assert.match(shader.fragmentShader, /#include <map_fragment>\s*\n\s*float paintMask = smoothstep\(0\.16, 0\.6, min\(sampledDiffuseColor\.r, min\(sampledDiffuseColor\.g, sampledDiffuseColor\.b\)\)\);/);
  assert.match(shader.fragmentShader, /diffuseColor\.rgb = sampledDiffuseColor\.rgb \* mix\(vec3\(1\.0\), diffuse, paintMask\);/);
  assert.ok(shader.fragmentShader.indexOf('diffuseColor.rgb = sampledDiffuseColor.rgb') > shader.fragmentShader.indexOf('#include <map_fragment>'));
});

test('body paint shader has an explicit material-program cache key', async () => {
  const { createGeneratedCarFactory } = await import(adapterUrl);
  const { scene } = makeTemplate();
  const car = createGeneratedCarFactory(THREE, scene, 'racer-hy-001').instantiate(skins[0]);
  const paint = meshesByMaterialName(car.body, 'BodyPaint')[0];

  assert.equal(paint.customProgramCacheKey(), 'generated-car-body-paint-mask-v1');
});

test('starter visual polish uses bounded cloned PBR uniforms without mutating source meshes', async () => {
  const { createGeneratedCarFactory } = await import(adapterUrl);
  const { scene, materials } = makeTemplate();
  const car = createGeneratedCarFactory(THREE, scene, 'racer-hy-001').instantiate(skins[0]);
  const body = meshesByMaterialName(car.body, 'BodyPaint')[0];
  const glass = meshesByMaterialName(car.body, 'Glass')[0];
  const rim = meshesByMaterialName(mountCar(car), 'Rim')[0];
  assert.deepEqual([body.metalness, body.roughness], [0.58, 0.42]);
  assert.deepEqual([glass.metalness, glass.roughness], [0.18, 0.22]);
  assert.deepEqual([rim.metalness, rim.roughness], [0.46, 0.36]);
  assert.equal(body.color.getHex(), skins[0].body);
  assert.equal(rim.color.getHex(), skins[0].rim);
  assert.equal(body.map, materials.BodyPaint.map);
  assert.equal(glass.color.getHex(), materials.Glass.color.getHex());
  assert.equal(materials.BodyPaint.metalness, 0);
  assert.equal(materials.BodyPaint.roughness, 0.7);
  assert.equal(materials.Rim.roughness, 0.7);
  assert.equal(car.wheels.length, 4);
  assert.equal(car.wheels.every(wheel => wheel.steer.children.length === 1), true);
});
