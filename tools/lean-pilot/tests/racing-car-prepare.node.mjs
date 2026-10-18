/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import * as api from '../racing-car-prepare.mjs';

const axles = [
  { name: 'Wheel_FL', side: -1, x: -0.22, y: 0.08, z: 0.345 },
  { name: 'Wheel_FR', side: 1, x: 0.22, y: 0.08, z: 0.345 },
  { name: 'Wheel_RL', side: -1, x: -0.22, y: 0.08, z: -0.34 },
  { name: 'Wheel_RR', side: 1, x: 0.22, y: 0.08, z: -0.34 },
];

test('classifies original tire and rim triangles inside the observed wheel cylinders', () => {
  assert.equal(typeof api.classifyTriangle, 'function');
  assert.equal(api.classifyTriangle({ center: [0.22, 0.08, 0.44], normal: [1, 0, 0], color: [45, 45, 45], axles }), 'Tire');
  assert.equal(api.classifyTriangle({ center: [0.22, 0.08, 0.37], normal: [1, 0, 0], color: [80, 80, 80], axles }), 'Rim');
  assert.equal(api.classifyTriangle({ center: [0.22, 0.08, 0.50], normal: [1, 0, 0], color: [45, 45, 45], axles }), 'BodyPaint');
});

test('keeps pale source faces outside the tire rubber on the chassis while bright inner wheel faces stay rim', () => {
  assert.equal(api.classifyTriangle({ center: [0.22, 0.08, 0.44], normal: [1, 0, 0], color: [225, 225, 225], axles }), 'BodyPaint');
  assert.equal(api.classifyTriangle({ center: [0.22, 0.08, 0.44], normal: [1, 0, 0], color: [45, 45, 45], axles }), 'Tire');
  assert.equal(api.classifyTriangle({ center: [0.22, 0.08, 0.37], normal: [1, 0, 0], color: [225, 225, 225], axles }), 'Rim');
});

test('separates glass, colored lamps, lower aero trim and recolorable body shell', () => {
  assert.equal(typeof api.classifyTriangle, 'function');
  assert.equal(api.classifyTriangle({ center: [0.12, 0.21, 0.32], normal: [0.25, 0.45, 0.86], color: [90, 120, 190], axles }), 'Glass');
  assert.equal(api.classifyTriangle({ center: [0.12, 0.1, 0.59], normal: [0.1, 0.1, 0.98], color: [70, 130, 220], axles }), 'Headlight');
  assert.equal(api.classifyTriangle({ center: [0.12, 0.1, -0.49], normal: [0.1, 0.1, -0.98], color: [220, 45, 35], axles }), 'Taillight');
  assert.equal(api.classifyTriangle({ center: [0.22, 0.03, 0.1], normal: [1, 0, 0], color: [40, 40, 40], axles }), 'Trim');
  assert.equal(api.classifyTriangle({ center: [0.22, 0.14, -0.1], normal: [1, 0, 0], color: [45, 45, 45], axles }), 'BodyPaint');
});

test('keeps pale hood, door and bumper texels on the paint mask without recoloring dark glass, trim or lamps', () => {
  assert.equal(api.classifyTriangle({ center: [0.12, 0.21, 0.32], normal: [0.25, 0.45, 0.86], color: [225, 225, 225], axles }), 'BodyPaint');
  assert.equal(api.classifyTriangle({ center: [0.12, 0.21, 0.32], normal: [0.25, 0.45, 0.86], color: [90, 120, 190], axles }), 'Glass');
  assert.equal(api.classifyTriangle({ center: [0.22, 0.2, 0.1], normal: [1, 0, 0], color: [225, 225, 225], axles }), 'BodyPaint');
  assert.equal(api.classifyTriangle({ center: [0.22, 0.2, 0.1], normal: [1, 0, 0], color: [90, 90, 90], axles }), 'Glass');
  assert.equal(api.classifyTriangle({ center: [0.22, 0.03, 0.58], normal: [1, 0, 0], color: [225, 225, 225], axles }), 'BodyPaint');
  assert.equal(api.classifyTriangle({ center: [0.22, 0.03, 0.58], normal: [1, 0, 0], color: [40, 40, 40], axles }), 'Trim');
  assert.equal(api.classifyTriangle({ center: [0.12, 0.1, 0.59], normal: [0.1, 0.1, 0.98], color: [200, 220, 255], axles }), 'Headlight');
});

test('bakes source coordinates to +Y-up and keeps the axle pivot flat at the root', () => {
  assert.equal(typeof api.transformSourcePoint, 'function');
  assert.deepEqual(api.transformSourcePoint([2, 3, 4], { centerX: 0, centerY: 0, centerZ: 0, scale: 1 }), [2, -4, 3]);
  const local = api.transformWheelPoint([0.22, 0.08, 0.44], axles[1], 4);
  assert.ok(local.every((value, index) => Math.abs(value - [0, 0, 0.38][index]) < 1e-12));
  assert.deepEqual(api.exhaustPositions, [[-0.3, 0.5, -2.3], [0.3, 0.5, -2.3]]);
});

test('authors a circular 48-segment rounded tire with a 10-spoke rim and central hub around the X axle', () => {
  const wheel = api.createWheelAssemblyGeometry();
  const radii = Array.from({ length: wheel.tire.positions.length / 3 }, (_, index) => {
    const offset = index * 3;
    return Math.hypot(wheel.tire.positions[offset + 1], wheel.tire.positions[offset + 2]);
  });
  const outerRadius = Math.max(...radii);
  const outerAngles = new Set(radii.flatMap((radius, index) => {
    if (Math.abs(radius - outerRadius) > 1e-6) return [];
    const offset = index * 3;
    return [Math.atan2(wheel.tire.positions[offset + 2], wheel.tire.positions[offset + 1]).toFixed(6)];
  }));
  const xValues = Array.from({ length: wheel.tire.positions.length / 3 }, (_, index) => wheel.tire.positions[index * 3]);
  assert.equal(wheel.tire.radialSegments, 48);
  assert.equal(wheel.tire.profileSegments, 10);
  assert.equal(outerAngles.size, 48);
  assert.ok(Math.abs(outerRadius - 0.4) < 1e-6);
  assert.ok(Math.min(...xValues) < -0.13);
  assert.ok(Math.max(...xValues) > 0.13);
  assert.equal(wheel.rim.spokeCount, 10);
  assert.equal(wheel.rim.hubRadius, 0.09);
  assert.equal(wheel.rim.spokeTriangles, 120);
});

test('writes an optimized GLB with its geometry and texture resources in the binary', { skip: !process.env.CAR_PREPARE_TOOL_ROOT }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'racer-prepare-'));
  const outputPath = path.join(directory, 'optimized-racer.glb');
  const manifestPath = path.join(directory, 'optimized-racer.manifest.json');
  const result = await api.prepareRacer({ sourcePath: process.env.CAR_PREPARE_SOURCE, outputPath, manifestPath, toolRoot: process.env.CAR_PREPARE_TOOL_ROOT });
  const binary = await readFile(outputPath);
  assert.equal(binary.subarray(0, 4).toString(), 'glTF');
  assert.ok(result.output.bytes <= 1_572_864);
  assert.ok(result.output.triangles <= 18000);
  const baseColor = result.textures.find(texture => texture.name === 'BaseColor (1024)');
  assert.equal(baseColor.width, 1024);
  assert.equal(baseColor.height, 1024);
  assert.ok(baseColor.bytes > 0 && baseColor.bytes < 300_000);
  assert.equal(result.materials.length, 7);
  assert.equal(result.wheels.length, 4);
  for (const wheel of result.wheels) {
    assert.ok(wheel.componentMaterials.includes('Tire'));
    assert.ok(wheel.componentMaterials.includes('Rim'));
    assert.ok(wheel.componentMaterials.every(name => name === 'Tire' || name === 'Rim'));
    assert.equal(wheel.sourcePosition[1], 0.08);
    assert.equal(wheel.sourcePosition[2], wheel.name.includes('_F') ? 0.345 : -0.34);
    assert.equal(wheel.sourceTrianglesRetained, 0);
    assert.ok(wheel.sourceRegion.sourceTrianglesRemoved > 0);
    assert.equal(wheel.geometry, 'hand-authored-mechanical');
  }
  assert.equal(Object.keys(result.triangleCounts.Chassis).some(name => name === 'Tire' || name === 'Rim'), false);
  const chassisMaterials = new Set(['BodyPaint', 'Glass', 'Headlight', 'Taillight', 'Trim']);
  for (const material of result.materials) {
    assert.equal(material.baseColorTexture, chassisMaterials.has(material.name));
    assert.equal(material.normalTexture, chassisMaterials.has(material.name));
    assert.equal(material.metallicRoughnessTexture, chassisMaterials.has(material.name));
    if (chassisMaterials.has(material.name)) assert.deepEqual(material.factor.color, [1, 1, 1, 1]);
  }
  const require = createRequire(path.join(process.env.CAR_PREPARE_TOOL_ROOT, 'package.json'));
  const { NodeIO } = require('@gltf-transform/core');
  const document = await new NodeIO().read(outputPath);
  const outputMaterials = document.getRoot().listMaterials();
  assert.equal(outputMaterials.length, 7);
  for (const material of outputMaterials) {
    if (chassisMaterials.has(material.getName())) {
      assert.ok(material.getBaseColorTexture());
      assert.ok(material.getNormalTexture());
      assert.ok(material.getMetallicRoughnessTexture());
      assert.deepEqual(material.getBaseColorFactor(), [1, 1, 1, 1]);
    } else {
      assert.equal(material.getBaseColorTexture(), null);
      assert.equal(material.getNormalTexture(), null);
      assert.equal(material.getMetallicRoughnessTexture(), null);
      if (material.getName() === 'Tire') {
        assert.ok(Math.max(...material.getBaseColorFactor().slice(0, 3)) <= 0.012, 'rubber must remain charcoal under bright PBR lighting');
        assert.deepEqual(material.getBaseColorFactor(), [0.006, 0.008, 0.012, 1]);
        assert.equal(material.getMetallicFactor(), 0);
        assert.equal(material.getRoughnessFactor(), 0.85);
      } else {
        assert.deepEqual(material.getBaseColorFactor(), [1, 1, 1, 1]);
        assert.equal(material.getMetallicFactor(), 0.85);
        assert.equal(material.getRoughnessFactor(), 0.25);
      }
    }
  }
  assert.equal(result.assetComposition.sourceWheelGeometryRetained, false);
  assert.equal(result.assetComposition.wheelGeometry, 'Locally hand-authored mechanical retopology');
  assert.equal(result.wheelRetopology.radialSegments, 48);
  assert.equal(result.wheelRetopology.spokeCount, 10);
  assert.equal(result.wheelRetopology.tireMaterial.roughness, 0.85);
  assert.equal(result.wheelRetopology.rimMaterial.metallic, 0.85);
  const outputNodes = new Map(document.getRoot().listNodes().map(node => [node.getName(), node]));
  const expectedWheel = api.createWheelAssemblyGeometry();
  for (const wheel of result.wheels) {
    const node = outputNodes.get(wheel.name);
    const primitives = node.getMesh().listPrimitives();
    assert.deepEqual(primitives.map(primitive => primitive.getMaterial().getName()).sort(), ['Rim', 'Tire']);
    assert.equal(node.getExtras().spinAxis, 'X');
    assert.equal(node.getExtras().steerAxis, wheel.name.includes('_F') ? 'Y' : undefined);
    assert.equal(node.getExtras().wheelGeometry, 'hand-authored-mechanical');
    assert.equal(primitives.find(primitive => primitive.getMaterial().getName() === 'Tire').getAttribute('POSITION').getCount(), expectedWheel.tire.positions.length / 3);
    assert.equal(primitives.find(primitive => primitive.getMaterial().getName() === 'Rim').getAttribute('POSITION').getCount(), expectedWheel.rim.positions.length / 3);
  }
  await rm(directory, { recursive: true });
});
