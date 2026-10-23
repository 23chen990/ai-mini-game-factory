/** Offline preparation of the five SHA-pinned user car attachments.
 * Tools are installed in an isolated directory, never in the game runtime.
 * custom-01's 64k budget follows reviewed original/18k/32k/64k renders.
 * Wheels remain the real, merged source surfaces; no artificial rig is added.
 */
import assert from 'node:assert/strict';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

export const USER_CAR_SOURCES = Object.freeze([
  { id: 'custom-01', file: '1b92ee2529bb8003391d3ad46c5cb742.glb', sha256: '1f584e61eb0f1a19117ea7672dfdb93ee903c4184e13fc5f559cfe081e486566', displayName: '银紫超跑' },
  { id: 'custom-02', file: '614902d6b59a245a9b86708fb2659633.glb', sha256: '54b9b8167e7aac0d58c837b7a62785ce54577d1f0a3771ce534f3bd1515b6bed', displayName: '荧光跑车' },
  { id: 'custom-03', file: '7c328ebcef61fba065dac57cac892617.glb', sha256: 'ae2569ddf9efb7860db9d33645e3199d889dde0a2c0ceb106e7c740d76018dbe', displayName: '黄金方程式' },
  { id: 'custom-04', file: '695043a75e2c833f35a8456acc099569.glb', sha256: '3afa72252768c34fac1ebadc56cbc8e12f9e7ec343a15d4d1bf73c0869f077cc', displayName: '赤焰超跑' },
  { id: 'custom-05', file: '6879fce5f010ad8727988f1b81efdd1b.glb', sha256: '2fa814d247ee1324a52080ccbaa561c3459b02e8f4a7a534666eaf4de90116c3', displayName: '蓝白拉力' },
]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const Vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const CarSchema = z.object({
  id: z.string(), displayName: z.string(), file: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive(), triangles: z.number().int().positive(), vertices: z.number().int().positive(),
  bounds: z.object({ min: Vec3, max: Vec3 }), normalization: z.object({ baked: z.literal(true), axes: z.literal('+Y-up/+Z-nose'), up: z.literal('+Y'), forward: z.literal('+Z'), centerXZ: z.tuple([z.literal(0), z.literal(0)]), lengthM: z.literal(4.8), groundY: z.literal(0), length: z.literal(4.8), runtimeScale: z.literal(1), runtimeYawRadians: z.literal(0) }).passthrough(),
  wheelMode: z.literal('static-source-mesh'), paintable: z.literal(false),
  limits: z.object({ maxTriangles: z.number().int(), maxBytes: z.number().int(), maxTexture: z.literal(1024) }),
  textures: z.array(z.object({ name: z.string(), mimeType: z.literal('image/jpeg'), width: z.literal(1024), height: z.literal(1024), bytes: z.number().int(), sha256: z.string() })).length(3),
}).passthrough();

function bounds(array) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < array.length; i++) { const a = i % 3; min[a] = Math.min(min[a], array[i]); max[a] = Math.max(max[a], array[i]); }
  return { min, max };
}

export async function prepareUserCars({ sourceDir, outputDir, toolRoot, sharpRoot }) {
  const requireTool = createRequire(path.resolve(toolRoot, 'package.json'));
  const { NodeIO } = requireTool('@gltf-transform/core');
  const { KHRMaterialsSpecular, KHRMeshQuantization } = requireTool('@gltf-transform/extensions');
  const { MeshoptSimplifier } = await import(pathToFileURL(requireTool.resolve('meshoptimizer')).href);
  const sharp = createRequire(path.resolve(sharpRoot, 'package.json'))('sharp');
  for (const name of ['core', 'extensions']) assert.equal(JSON.parse(await readFile(path.join(toolRoot, 'node_modules/@gltf-transform', name, 'package.json'))).version, '4.5.1');
  assert.equal(JSON.parse(await readFile(path.join(toolRoot, 'node_modules/meshoptimizer/package.json'))).version, '1.2.0');
  assert.equal(sharp.versions.sharp, '0.35.5');
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions([KHRMaterialsSpecular, KHRMeshQuantization]);
  await mkdir(outputDir, { recursive: true });
  const cars = [];
  for (const source of USER_CAR_SOURCES) {
    const sourceBytes = await readFile(path.join(sourceDir, source.file));
    assert.equal(hash(sourceBytes), source.sha256, 'Source identity changed: ' + source.id);
    assert.equal(sourceBytes.readUInt32LE(0), 0x46546c67);
    assert.equal(sourceBytes.readUInt32LE(4), 2);
    assert.equal(sourceBytes.readUInt32LE(8), sourceBytes.length);
    const sourceJSON = JSON.parse(sourceBytes.subarray(20, 20 + sourceBytes.readUInt32LE(12)));
    assert.ok([...(sourceJSON.buffers || []), ...(sourceJSON.images || [])].every(item => !item.uri), 'Source must be self-contained');
    const document = await io.readBinary(sourceBytes), root = document.getRoot();
    assert.equal(root.listMeshes().length, 1); assert.equal(root.listMaterials().length, 1); assert.equal(root.listTextures().length, 3);
    const node = root.listNodes().find(n => n.getMesh()), primitive = node.getMesh().listPrimitives()[0];
    const inputP = primitive.getAttribute('POSITION').getArray(), inputN = primitive.getAttribute('NORMAL').getArray(), inputUV = primitive.getAttribute('TEXCOORD_0').getArray();
    const inputIndices = new Uint32Array(primitive.getIndices().getArray()), matrix = node.getWorldMatrix();
    const position = new Float32Array(inputP.length), normal = new Float32Array(inputN.length);
    for (let i = 0; i < inputP.length; i += 3) for (let a = 0; a < 3; a++) {
      position[i + a] = matrix[a] * inputP[i] + matrix[a + 4] * inputP[i + 1] + matrix[a + 8] * inputP[i + 2] + matrix[a + 12];
      normal[i + a] = matrix[a] * inputN[i] + matrix[a + 4] * inputN[i + 1] + matrix[a + 8] * inputN[i + 2];
    }
    const sourceBounds = bounds(position), origin = [(sourceBounds.min[0] + sourceBounds.max[0]) / 2, sourceBounds.min[1], (sourceBounds.min[2] + sourceBounds.max[2]) / 2];
    const scale = 4.8 / (sourceBounds.max[2] - sourceBounds.min[2]);
    const highFidelity = source.id === 'custom-01';
    // Preserve the precise arithmetic used by the reviewed 64k candidate.
    for (let i = 0; i < position.length; i += 3) for (let a = 0; a < 3; a++) position[i + a] = ((highFidelity ? matrix[a] * inputP[i] + matrix[a + 4] * inputP[i + 1] + matrix[a + 8] * inputP[i + 2] + matrix[a + 12] : position[i + a]) - origin[a]) * scale;
    const attributes = new Float32Array(inputP.length / 3 * 5);
    for (let i = 0; i < inputP.length / 3; i++) { attributes.set(normal.subarray(i * 3, i * 3 + 3), i * 5); attributes.set(inputUV.subarray(i * 2, i * 2 + 2), i * 5 + 3); }
    const targetTriangles = highFidelity ? 64000 : 18000, errorLimit = highFidelity ? .02 : .01;
    let reduced, resultError, selectedFlags;
    const attempts = [];
    for (const flags of highFidelity ? [[]] : [[], ['Permissive']]) {
      [reduced, resultError] = MeshoptSimplifier.simplifyWithAttributes(inputIndices, position, 3, attributes, 5, [.25, .25, .25, 1, 1], null, targetTriangles * 3, errorLimit, flags);
      selectedFlags = flags; attempts.push({ flags, triangles: reduced.length / 3, error: resultError });
      if (reduced.length / 3 <= targetTriangles) break;
    }
    assert.ok(reduced.length / 3 <= targetTriangles, 'Chosen geometry budget not met: ' + source.id);
    const [remap, vertexCount] = MeshoptSimplifier.compactMesh(reduced);
    const p = new Float32Array(vertexCount * 3), n = new Float32Array(vertexCount * 3), uv = new Float32Array(vertexCount * 2);
    for (let i = 0; i < remap.length; i++) if (remap[i] !== 0xffffffff) {
      const dest = remap[i], nx = normal[i * 3], ny = normal[i * 3 + 1], nz = normal[i * 3 + 2], length = Math.hypot(nx, ny, nz) || 1;
      p.set(position.subarray(i * 3, i * 3 + 3), dest * 3); n.set([nx / length, ny / length, nz / length], dest * 3); uv.set(inputUV.subarray(i * 2, i * 2 + 2), dest * 2);
    }
    const before = bounds(p), correctionOrigin = [(before.min[0] + before.max[0]) / 2, before.min[1], (before.min[2] + before.max[2]) / 2], correctionScale = 4.8 / (before.max[2] - before.min[2]);
    for (let i = 0; i < p.length; i++) p[i] = (p[i] - correctionOrigin[i % 3]) * correctionScale;
    primitive.getAttribute('POSITION').setArray(p);
    primitive.getIndices().setArray(vertexCount < 65536 ? new Uint16Array(reduced) : reduced);
    let quantization = { enabled: false, position: 'FLOAT32', normal: 'FLOAT32', texcoord: 'FLOAT32' };
    if (highFidelity) {
      const qn = new Int16Array(n.length), quv = new Uint16Array(uv.length); let maxNormalComponentError = 0, maxUVError = 0;
      for (let i = 0; i < n.length; i++) { assert.ok(n[i] >= -1 && n[i] <= 1); qn[i] = Math.round(n[i] * 32767); maxNormalComponentError = Math.max(maxNormalComponentError, Math.abs(n[i] - qn[i] / 32767)); }
      for (let i = 0; i < uv.length; i++) { assert.ok(uv[i] >= 0 && uv[i] <= 1, 'No UV clamping permitted'); quv[i] = Math.round(uv[i] * 65535); maxUVError = Math.max(maxUVError, Math.abs(uv[i] - quv[i] / 65535)); }
      primitive.getAttribute('NORMAL').setArray(qn).setNormalized(true); primitive.getAttribute('TEXCOORD_0').setArray(quv).setNormalized(true);
      document.createExtension(KHRMeshQuantization).setRequired(true);
      quantization = { enabled: true, extension: 'KHR_mesh_quantization', position: 'FLOAT32', normal: 'INT16_NORMALIZED', texcoord: 'UINT16_NORMALIZED', maxNormalComponentError, maxUVError, maxUVErrorAt1024Pixels: maxUVError * 1024 };
    } else { primitive.getAttribute('NORMAL').setArray(n); primitive.getAttribute('TEXCOORD_0').setArray(uv); }
    node.setRotation([0, 0, 0, 1]).setTranslation([0, 0, 0]).setScale([1, 1, 1]).setName(source.id + '-source-static-mesh');
    node.getMesh().setName(source.id + '-source-static-mesh'); primitive.getMaterial().setName(source.id + '-original-pbr');
    const textures = [];
    for (const texture of root.listTextures()) {
      const encoded = await sharp(texture.getImage()).resize(1024, 1024, { fit: 'fill' }).jpeg({ quality: 82, chromaSubsampling: '4:4:4' }).toBuffer();
      texture.setImage(encoded).setMimeType('image/jpeg');
      textures.push({ name: texture.getName(), mimeType: 'image/jpeg', width: 1024, height: 1024, bytes: encoded.length, sha256: hash(encoded) });
    }
    root.getDefaultScene().setName(source.id + '-scene').setExtras({ assetId: source.id, sourceSha256: source.sha256, wheelMode: 'static-source-mesh', axes: '+Y-up/+Z-nose', groundY: 0, normalizedLength: 4.8 });
    const bytes = await io.writeBinary(document), file = 'custom-racer-' + source.id.slice(-2) + '.glb';
    const limits = { maxTriangles: targetTriangles, maxBytes: highFidelity ? 3670016 : 1572864, maxTexture: 1024 };
    assert.ok(bytes.length <= limits.maxBytes, 'Chosen binary budget not met: ' + source.id);
    const car = CarSchema.parse({
      id: source.id, displayName: source.displayName, file, sha256: hash(bytes), bytes: bytes.length, triangles: reduced.length / 3, vertices: vertexCount, bounds: bounds(p),
      source: { file: source.file, sha256: source.sha256, bytes: sourceBytes.length, triangles: inputIndices.length / 3, vertices: inputP.length / 3 },
      normalization: { baked: true, axes: '+Y-up/+Z-nose', up: '+Y', forward: '+Z', centerXZ: [0, 0], lengthM: 4.8, groundY: 0, length: 4.8, runtimeScale: 1, runtimeYawRadians: 0, sourceWorldBounds: sourceBounds, sourceWorldOrigin: origin, sourceUniformScale: scale, postSimplificationOrigin: correctionOrigin, postSimplificationUniformScale: correctionScale, sourceFrontVerifiedByRender: '+Z after original node X90 rotation' },
      wheelMode: 'static-source-mesh', paintable: false, limits, textures, quantization,
      simplification: { targetTriangles, errorLimit, reportedError: resultError, attributeWeights: [.25, .25, .25, 1, 1], flags: selectedFlags, attempts, retainedSourceSurfaces: true, artificialWheels: false },
      budgetDecision: highFidelity ? 'Reviewed source/18k/24k/32k/64k/96k renders support a 64k fidelity exception; gameplay/performance QA thresholds are unchanged.' : 'Original requested 18k geometry budget.',
      material: { originalPBRMapsRetained: true, materialCount: 1, doubleSided: primitive.getMaterial().getDoubleSided(), extensions: ['KHR_materials_specular'] },
    });
    await writeFile(path.join(outputDir, file), bytes); cars.push(car);
    console.log(JSON.stringify({ id: car.id, file, sha256: car.sha256, bytes: car.bytes, triangles: car.triangles, bounds: car.bounds }));
  }
  const manifest = z.object({ schemaVersion: z.literal(1), targetGame: z.string(), cars: z.array(CarSchema).length(5), toolchain: z.object({ gltfTransform: z.literal('4.5.1'), meshoptimizer: z.literal('1.2.0'), sharp: z.literal('0.35.5') }), runtimeDependenciesAdded: z.literal(0) }).parse({ schemaVersion: 1, targetGame: 'qq-speed / 极速飞驰', cars, toolchain: { gltfTransform: '4.5.1', meshoptimizer: '1.2.0', sharp: '0.35.5' }, runtimeDependenciesAdded: 0 });
  await writeFile(path.join(outputDir, 'user-cars-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const value = name => { const index = process.argv.indexOf(name); assert.ok(index > 0 && process.argv[index + 1], 'Missing ' + name); return path.resolve(process.argv[index + 1]); };
  await prepareUserCars({ sourceDir: value('--source-dir'), outputDir: value('--output-dir'), toolRoot: value('--tool-root'), sharpRoot: value('--sharp-root') });
}
