/* global process, console */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const EXPECTED_SOURCE_HASH = '8af8f5579f645017ba3d9120210579d2db20008c3f815de856cb44411e2a9171';
const TRIANGLE_LIMIT = 18000;
const BINARY_LIMIT = 1_572_864;
const TEXTURE_SIZE = 1024;
const SIMPLIFY_RATIO = 0.32;
const SIMPLIFY_ERROR = 0.02;
const EXHAUST_POSITIONS = [[-0.3, 0.5, -2.3], [0.3, 0.5, -2.3]];
const WHEEL_RADIAL_SEGMENTS = 48;
const TIRE_PROFILE_SEGMENTS = 10;
const TIRE_MAJOR_RADIUS = 0.33;
const TIRE_MINOR_RADIUS = 0.07;
const TIRE_WIDTH = 0.28;
const TIRE_HALF_WIDTH = TIRE_WIDTH / 2 / Math.sin(Math.PI * 4 / TIRE_PROFILE_SEGMENTS);
const RIM_PROFILE = [[-0.09, 0.22], [-0.09, 0.26], [-0.07, 0.28], [0.07, 0.28], [0.09, 0.26], [0.09, 0.22]];
const RIM_SPOKES = 10;
const RIM_HUB_RADIUS = 0.09;
const WHEEL_SEEDS = [
  { name: 'Wheel_FL', side: -1, y: 0.08, z: 0.345 },
  { name: 'Wheel_FR', side: 1, y: 0.08, z: 0.345 },
  { name: 'Wheel_RL', side: -1, y: 0.08, z: -0.34 },
  { name: 'Wheel_RR', side: 1, y: 0.08, z: -0.34 },
];
const MATERIAL_NAMES = ['BodyPaint', 'Glass', 'Tire', 'Rim', 'Headlight', 'Taillight', 'Trim'];
const WHEEL_MATERIAL_NAMES = new Set(['Tire', 'Rim']);

export const exhaustPositions = EXHAUST_POSITIONS;

const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const distanceToAxle = (center, axle) => Math.hypot(center[1] - axle.y, center[2] - axle.z);

function isPaleNeutralSourceTexel(color) {
  const minChannel = Math.min(...color);
  const chroma = Math.max(...color) - minChannel;
  return minChannel > 170 && chroma <= 55;
}

export function locateWheel(center, axles) {
  if (Math.abs(center[0]) < 0.16) return null;
  const candidates = axles.filter(axle => center[0] * axle.side > 0);
  const axle = candidates.reduce((best, current) => distanceToAxle(center, current) < distanceToAxle(center, best) ? current : best);
  return distanceToAxle(center, axle) < 0.12 ? { axle, radius: distanceToAxle(center, axle) } : null;
}

export function classifyTriangle({ center, normal, color, axles }) {
  const wheel = locateWheel(center, axles);
  if (wheel) {
    if (wheel.radius < 0.075) return 'Rim';
    if (color.every(channel => channel > 170)) return 'BodyPaint';
    return 'Tire';
  }

  const [red, green, blue] = color;
  if (center[2] > 0.48 && center[1] > 0.01 && center[1] < 0.19 && blue > red * 1.12 && blue > green * 1.05 && blue > 80) return 'Headlight';
  if (center[2] < -0.43 && center[1] > 0.01 && center[1] < 0.2 && red > green * 1.25 && red > blue * 1.15 && red > 80) return 'Taillight';
  if (isPaleNeutralSourceTexel(color)) return 'BodyPaint';

  const sideWindow = Math.abs(center[0]) > 0.18 && center[1] > 0.14 && center[1] < 0.27 && center[2] > -0.2 && center[2] < 0.22 && Math.abs(normal[0]) > 0.45;
  const frontWindow = center[1] > 0.16 && center[2] > 0.16 && center[2] < 0.47 && normal[2] > 0.35;
  const rearWindow = center[1] > 0.16 && center[2] < -0.16 && center[2] > -0.43 && normal[2] < -0.35;
  if (sideWindow || frontWindow || rearWindow) return 'Glass';

  const lowerTrim = center[1] < 0.06;
  const bumperTrim = (center[2] > 0.52 || center[2] < -0.47) && center[1] < 0.13;
  const sideIntake = Math.abs(center[0]) > 0.2 && center[2] > 0.04 && center[2] < 0.12 && center[1] < 0.17;
  if (lowerTrim || bumperTrim || sideIntake) return 'Trim';
  return 'BodyPaint';
}

export function transformSourcePoint(point, { centerX, centerY, centerZ, scale }) {
  return [(point[0] - centerX) * scale, (-point[2] - centerY) * scale, (point[1] - centerZ) * scale];
}

function transformAlignedPoint(point, { centerX, centerY, centerZ, scale }) {
  return [(point[0] - centerX) * scale, (point[1] - centerY) * scale, (point[2] - centerZ) * scale];
}

export function transformWheelPoint(point, axle, scale) {
  return [(point[0] - axle.x) * scale, (point[1] - axle.y) * scale, (point[2] - axle.z) * scale];
}

function latheGeometry(profile, radialSegments) {
  const positions = [], normals = [], texcoords = [], indices = [];
  for (let ring = 0; ring < profile.length; ring++) {
    const previous = profile[(ring + profile.length - 1) % profile.length];
    const next = profile[(ring + 1) % profile.length];
    const dx = next[0] - previous[0];
    const dr = next[1] - previous[1];
    for (let segment = 0; segment < radialSegments; segment++) {
      const angle = segment * Math.PI * 2 / radialSegments;
      const cosine = Math.cos(angle), sine = Math.sin(angle);
      const normalLength = Math.hypot(dr, dx);
      positions.push(profile[ring][0], profile[ring][1] * cosine, profile[ring][1] * sine);
      normals.push(-dr / normalLength, dx * cosine / normalLength, dx * sine / normalLength);
      texcoords.push(segment / radialSegments, ring / profile.length);
    }
  }
  for (let ring = 0; ring < profile.length; ring++) for (let segment = 0; segment < radialSegments; segment++) {
    const nextRing = (ring + 1) % profile.length;
    const nextSegment = (segment + 1) % radialSegments;
    const a = ring * radialSegments + segment;
    const b = ring * radialSegments + nextSegment;
    const c = nextRing * radialSegments + nextSegment;
    const d = nextRing * radialSegments + segment;
    indices.push(a, b, c, a, c, d);
  }
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), texcoords: Float32Array.from(texcoords), indices: Uint16Array.from(indices), radialSegments, profileSegments: profile.length };
}

function appendTriangle(geometry, corners, expectedNormal) {
  const edgeA = corners[1].map((value, axis) => value - corners[0][axis]);
  const edgeB = corners[2].map((value, axis) => value - corners[0][axis]);
  const faceNormal = [edgeA[1] * edgeB[2] - edgeA[2] * edgeB[1], edgeA[2] * edgeB[0] - edgeA[0] * edgeB[2], edgeA[0] * edgeB[1] - edgeA[1] * edgeB[0]];
  const ordered = faceNormal.reduce((sum, value, axis) => sum + value * expectedNormal[axis], 0) < 0
    ? [corners[0], corners[2], corners[1]]
    : corners;
  const base = geometry.positions.length / 3;
  for (const [index, point] of ordered.entries()) {
    geometry.positions.push(...point);
    geometry.normals.push(...expectedNormal);
    geometry.texcoords.push(index === 1 ? 1 : 0, index === 2 ? 1 : 0);
  }
  geometry.indices.push(base, base + 1, base + 2);
}

function appendQuad(geometry, corners, expectedNormal) {
  const edgeA = corners[1].map((value, axis) => value - corners[0][axis]);
  const edgeB = corners[2].map((value, axis) => value - corners[0][axis]);
  const faceNormal = [edgeA[1] * edgeB[2] - edgeA[2] * edgeB[1], edgeA[2] * edgeB[0] - edgeA[0] * edgeB[2], edgeA[0] * edgeB[1] - edgeA[1] * edgeB[0]];
  const ordered = faceNormal.reduce((sum, value, axis) => sum + value * expectedNormal[axis], 0) < 0
    ? [corners[0], corners[3], corners[2], corners[1]]
    : corners;
  const base = geometry.positions.length / 3;
  for (const [index, point] of ordered.entries()) {
    geometry.positions.push(...point);
    geometry.normals.push(...expectedNormal);
    geometry.texcoords.push(index === 1 || index === 2 ? 1 : 0, index >= 2 ? 1 : 0);
  }
  geometry.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function createRimGeometry() {
  const ring = latheGeometry(RIM_PROFILE, WHEEL_RADIAL_SEGMENTS);
  const geometry = { positions: [...ring.positions], normals: [...ring.normals], texcoords: [...ring.texcoords], indices: [...ring.indices] };
  const halfSpokeWidth = 0.06;
  const innerRadius = 0.075;
  const outerRadius = 0.26;
  const innerTaper = 0.043;
  const outerTaper = 0.028;
  for (let spoke = 0; spoke < RIM_SPOKES; spoke++) {
    const angle = spoke * Math.PI * 2 / RIM_SPOKES;
    const radial = [Math.cos(angle), Math.sin(angle)];
    const tangent = [-radial[1], radial[0]];
    const point = (x, radius, side) => [x, radius * radial[0] + side * tangent[0], radius * radial[1] + side * tangent[1]];
    const back = [point(-halfSpokeWidth, innerRadius, -innerTaper), point(-halfSpokeWidth, innerRadius, innerTaper), point(-halfSpokeWidth, outerRadius, outerTaper), point(-halfSpokeWidth, outerRadius, -outerTaper)];
    const front = back.map(vertex => [halfSpokeWidth, vertex[1], vertex[2]]);
    appendQuad(geometry, back, [-1, 0, 0]);
    appendQuad(geometry, front, [1, 0, 0]);
    appendQuad(geometry, [back[0], front[0], front[1], back[1]], [0, -radial[0], -radial[1]]);
    appendQuad(geometry, [back[3], back[2], front[2], front[3]], [0, radial[0], radial[1]]);
    appendQuad(geometry, [back[0], back[3], front[3], front[0]], [0, -tangent[0], -tangent[1]]);
    appendQuad(geometry, [back[1], front[1], front[2], back[2]], [0, tangent[0], tangent[1]]);
  }

  const hubHalfWidth = 0.075;
  const hubSegments = 24;
  for (let segment = 0; segment < hubSegments; segment++) {
    const angle = segment * Math.PI * 2 / hubSegments;
    const nextAngle = (segment + 1) * Math.PI * 2 / hubSegments;
    const back = radiusAngle => [-hubHalfWidth, RIM_HUB_RADIUS * Math.cos(radiusAngle), RIM_HUB_RADIUS * Math.sin(radiusAngle)];
    const front = radiusAngle => [hubHalfWidth, RIM_HUB_RADIUS * Math.cos(radiusAngle), RIM_HUB_RADIUS * Math.sin(radiusAngle)];
    const middle = (angle + nextAngle) / 2;
    appendQuad(geometry, [back(angle), back(nextAngle), front(nextAngle), front(angle)], [0, Math.cos(middle), Math.sin(middle)]);
    appendTriangle(geometry, [[hubHalfWidth, 0, 0], front(angle), front(nextAngle)], [1, 0, 0]);
    appendTriangle(geometry, [[-hubHalfWidth, 0, 0], back(nextAngle), back(angle)], [-1, 0, 0]);
  }
  return { ...ring, positions: Float32Array.from(geometry.positions), normals: Float32Array.from(geometry.normals), texcoords: Float32Array.from(geometry.texcoords), indices: Uint16Array.from(geometry.indices), spokeCount: RIM_SPOKES, spokeTriangles: RIM_SPOKES * 12, hubRadius: RIM_HUB_RADIUS, hubTriangles: hubSegments * 4 };
}

export function createWheelAssemblyGeometry() {
  const profile = Array.from({ length: TIRE_PROFILE_SEGMENTS }, (_, index) => {
    const angle = index * Math.PI * 2 / TIRE_PROFILE_SEGMENTS;
    return [TIRE_HALF_WIDTH * Math.sin(angle), TIRE_MAJOR_RADIUS + TIRE_MINOR_RADIUS * Math.cos(angle)];
  });
  return { tire: latheGeometry(profile, WHEEL_RADIAL_SEGMENTS), rim: createRimGeometry() };
}

function rotateVector(vector, quaternion) {
  const [x, y, z] = vector;
  const [qx, qy, qz, qw] = quaternion;
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + qy * tz - qz * ty, y + qw * ty + qz * tx - qx * tz, z + qw * tz + qx * ty - qy * tx];
}

function transformedSourceData(sourceNode, primitive) {
  const positions = primitive.getAttribute('POSITION').getArray();
  const normals = primitive.getAttribute('NORMAL').getArray();
  const uvs = primitive.getAttribute('TEXCOORD_0').getArray();
  const indices = primitive.getIndices().getArray();
  const rotation = sourceNode.getRotation();
  const translation = sourceNode.getTranslation();
  const scale = sourceNode.getScale();
  const points = new Array(positions.length / 3);
  const directions = new Array(normals.length / 3);

  for (let i = 0; i < points.length; i++) {
    const offset = i * 3;
    const local = [positions[offset] * scale[0], positions[offset + 1] * scale[1], positions[offset + 2] * scale[2]];
    const rotated = rotateVector(local, rotation);
    points[i] = [rotated[0] + translation[0], rotated[1] + translation[1], rotated[2] + translation[2]];
    const normal = rotateVector([normals[offset] / scale[0], normals[offset + 1] / scale[1], normals[offset + 2] / scale[2]], rotation);
    const length = Math.hypot(...normal);
    directions[i] = normal.map(value => value / length);
  }

  return { points, directions, uvs, indices };
}

function triangleCenters(points, indices) {
  const centers = new Array(indices.length / 3);
  for (let triangle = 0; triangle < centers.length; triangle++) {
    const offset = triangle * 3;
    const a = points[indices[offset]], b = points[indices[offset + 1]], c = points[indices[offset + 2]];
    centers[triangle] = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
  }
  return centers;
}

function deriveAxles(points, indices, centers) {
  return WHEEL_SEEDS.map(seed => {
    const inner = centers.map((center, index) => ({ center, index }))
      .filter(({ center }) => center[0] * seed.side > 0.18 && Math.hypot(center[1] - seed.y, center[2] - seed.z) < 0.07);
    const wheelPoints = inner.flatMap(({ index }) => [0, 1, 2].map(k => points[indices[index * 3 + k]]));
    const xValues = wheelPoints.map(point => point[0]);
    const minX = Math.min(...xValues), maxX = Math.max(...xValues);
    return { name: seed.name, side: seed.side, x: (minX + maxX) / 2, y: seed.y, z: seed.z,
      seed: { y: seed.y, z: seed.z }, innerSamples: inner.length };
  });
}

function triangleColor(uvs, triangleIndices, image) {
  const { width, height, channels } = image.info;
  const colors = [];
  const uvSamples = [
    [(uvs[triangleIndices[0] * 2] + uvs[triangleIndices[1] * 2] + uvs[triangleIndices[2] * 2]) / 3,
      (uvs[triangleIndices[0] * 2 + 1] + uvs[triangleIndices[1] * 2 + 1] + uvs[triangleIndices[2] * 2 + 1]) / 3],
  ];
  for (const uv of uvSamples) {
    const u = ((uv[0] % 1) + 1) % 1;
    const v = ((uv[1] % 1) + 1) % 1;
    const offset = (Math.min(height - 1, Math.floor(v * height)) * width + Math.min(width - 1, Math.floor(u * width))) * channels;
    colors.push([image.data[offset], image.data[offset + 1], image.data[offset + 2]]);
  }
  return colors[0];
}

function medianVector(values) {
  return [0, 1, 2].map(axis => median(values.map(value => value[axis])));
}

function collectGroups(geometry, image, axles) {
  const chassis = new Map(MATERIAL_NAMES.map(name => [name, []]));
  const wheels = new Map(axles.map(axle => [axle.name, new Map(['Tire', 'Rim'].map(name => [name, []]))]));
  const { points, directions, uvs, indices } = geometry;
  const centers = triangleCenters(points, indices);
  const materialCounts = new Map(MATERIAL_NAMES.map(name => [name, 0]));

  for (let triangle = 0; triangle < centers.length; triangle++) {
    const offset = triangle * 3;
    const triIndices = [indices[offset], indices[offset + 1], indices[offset + 2]];
    const center = centers[triangle];
    const normal = medianVector(triIndices.map(index => directions[index]));
    const color = triangleColor(uvs, triIndices, image);
    const material = classifyTriangle({ center, normal, color, axles });
    materialCounts.set(material, materialCounts.get(material) + 1);
    const wheel = locateWheel(center, axles);
    if (wheel && (material === 'Tire' || material === 'Rim')) wheels.get(wheel.axle.name).get(material).push(triIndices);
    else chassis.get(material).push(triIndices);
  }

  return { chassis, wheels, materialCounts };
}

function addGeometryPrimitive(document, buffer, mesh, material, triangles, geometry, origin, scale, wheel) {
  const { points, directions, uvs } = geometry;
  const indices = [];
  const positions = [], normals = [], texcoords = [];
  const vertexMap = new Map();
  const localPoint = wheel ? point => transformWheelPoint(point, origin, scale) : point => transformAlignedPoint(point, origin);

  for (const triangle of triangles) for (const sourceIndex of triangle) {
    let targetIndex = vertexMap.get(sourceIndex);
    if (targetIndex === undefined) {
      targetIndex = vertexMap.size;
      vertexMap.set(sourceIndex, targetIndex);
      const position = localPoint(points[sourceIndex]);
      positions.push(position[0], position[1], position[2]);
      const normal = directions[sourceIndex];
      normals.push(normal[0], normal[1], normal[2]);
      texcoords.push(uvs[sourceIndex * 2], uvs[sourceIndex * 2 + 1]);
    }
    indices.push(targetIndex);
  }

  const prefix = mesh.getName() + ':' + material.getName();
  const primitive = document.createPrimitive().setMaterial(material)
    .setAttribute('POSITION', document.createAccessor(prefix + ':POSITION').setType('VEC3').setArray(Float32Array.from(positions)).setBuffer(buffer))
    .setAttribute('NORMAL', document.createAccessor(prefix + ':NORMAL').setType('VEC3').setArray(Float32Array.from(normals)).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', document.createAccessor(prefix + ':TEXCOORD_0').setType('VEC2').setArray(Float32Array.from(texcoords)).setBuffer(buffer))
    .setIndices(document.createAccessor(prefix + ':INDICES').setType('SCALAR').setArray(Uint16Array.from(indices)).setBuffer(buffer));
  mesh.addPrimitive(primitive);
}

function addGeneratedPrimitive(document, buffer, mesh, material, geometry) {
  const prefix = mesh.getName() + ':' + material.getName();
  const primitive = document.createPrimitive().setMaterial(material)
    .setAttribute('POSITION', document.createAccessor(prefix + ':POSITION').setType('VEC3').setArray(geometry.positions).setBuffer(buffer))
    .setAttribute('NORMAL', document.createAccessor(prefix + ':NORMAL').setType('VEC3').setArray(geometry.normals).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', document.createAccessor(prefix + ':TEXCOORD_0').setType('VEC2').setArray(geometry.texcoords).setBuffer(buffer))
    .setIndices(document.createAccessor(prefix + ':INDICES').setType('SCALAR').setArray(geometry.indices).setBuffer(buffer));
  mesh.addPrimitive(primitive);
}

const MATERIAL_SPECS = {
  BodyPaint: { color: [1, 1, 1, 1], metallic: 1, roughness: 1 },
  Glass: { color: [1, 1, 1, 1], metallic: 1, roughness: 1, doubleSided: true },
  Tire: { color: [0.006, 0.008, 0.012, 1], metallic: 0, roughness: 0.85 },
  Rim: { color: [1, 1, 1, 1], metallic: 0.85, roughness: 0.25 },
  Headlight: { color: [1, 1, 1, 1], metallic: 1, roughness: 1 },
  Taillight: { color: [1, 1, 1, 1], metallic: 1, roughness: 1 },
  Trim: { color: [1, 1, 1, 1], metallic: 1, roughness: 1 },
};

function createMaterials(document, textures) {
  return new Map(MATERIAL_NAMES.map(name => {
    const spec = MATERIAL_SPECS[name];
    const material = document.createMaterial(name).setBaseColorFactor(spec.color).setMetallicFactor(spec.metallic).setRoughnessFactor(spec.roughness);
    if (!WHEEL_MATERIAL_NAMES.has(name)) material.setBaseColorTexture(textures.baseColor).setNormalTexture(textures.normal).setMetallicRoughnessTexture(textures.metallicRoughness);
    if (spec.doubleSided) material.setDoubleSided(true);
    return [name, material];
  }));
}

function requiredValue(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Required CLI option ${name}`);
  return args[index + 1];
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function prepareRacer({ sourcePath, outputPath, manifestPath, toolRoot }) {
  const sourceBytes = await readFile(sourcePath);
  const sourceHash = sha256(sourceBytes);
  if (sourceHash !== EXPECTED_SOURCE_HASH) throw new Error('Source GLB hash does not match the reviewed Tencent Hunyuan v3.1 asset');

  const root = path.resolve(toolRoot);
  const require = createRequire(path.join(root, 'package.json'));
  const { NodeIO } = require('@gltf-transform/core');
  const { KHRMaterialsSpecular } = require('@gltf-transform/extensions');
  const { simplify } = require('@gltf-transform/functions');
  const sharp = require('sharp');
  const meshoptimizer = await import(pathToFileURL(require.resolve('meshoptimizer')).href);
  const gltfTransformVersion = JSON.parse(await readFile(path.join(root, 'node_modules/@gltf-transform/core/package.json'), 'utf8')).version;
  const meshoptimizerVersion = JSON.parse(await readFile(path.join(root, 'node_modules/meshoptimizer/package.json'), 'utf8')).version;
  if (gltfTransformVersion !== '4.5.1') throw new Error('Expected pinned glTF Transform 4.5.1');
  if (meshoptimizerVersion !== '1.2.0') throw new Error('Expected pinned meshoptimizer 1.2.0');

  const io = new NodeIO().registerExtensions([KHRMaterialsSpecular]);
  const sourceDocument = await io.read(sourcePath);
  const sourceNode = sourceDocument.getRoot().listNodes().find(node => node.getMesh());
  const sourcePrimitive = sourceNode.getMesh().listPrimitives()[0];
  const sourceMaterial = sourcePrimitive.getMaterial();
  const geometry = transformedSourceData(sourceNode, sourcePrimitive);
  const centers = triangleCenters(geometry.points, geometry.indices);
  const axles = deriveAxles(geometry.points, geometry.indices, centers);
  const min = [0, 1, 2].map(axis => Math.min(...geometry.points.map(point => point[axis])));
  const max = [0, 1, 2].map(axis => Math.max(...geometry.points.map(point => point[axis])));
  const centerX = (min[0] + max[0]) / 2;
  const centerY = min[1];
  const centerZ = (min[2] + max[2]) / 2;
  const scale = 4.8 / (max[2] - min[2]);
  const origin = { centerX, centerY, centerZ, scale };
  const imageBytes = sourceMaterial.getBaseColorTexture().getImage();
  const baseImage = await sharp(imageBytes).raw().toBuffer({ resolveWithObject: true });
  const groups = collectGroups(geometry, baseImage, axles);
  const newDocument = new (require('@gltf-transform/core').Document)();
  const textures = {};

  const baseColorImage = await sharp(sourceMaterial.getBaseColorTexture().getImage())
    .resize(TEXTURE_SIZE, TEXTURE_SIZE, { fit: 'fill' })
    .jpeg({ quality: 86, chromaSubsampling: '4:4:4' }).toBuffer();
  textures.baseColor = newDocument.createTexture('BaseColor (1024)').setImage(baseColorImage).setMimeType('image/jpeg');

  for (const [key, sourceTexture] of [['normal', sourceMaterial.getNormalTexture()], ['metallicRoughness', sourceMaterial.getMetallicRoughnessTexture()]]) {
    const compressed = await sharp(sourceTexture.getImage()).resize(TEXTURE_SIZE, TEXTURE_SIZE, { fit: 'fill' }).jpeg({ quality: 86, chromaSubsampling: '4:4:4' }).toBuffer();
    textures[key] = newDocument.createTexture(key === 'normal' ? 'PBR Normal (1024)' : 'PBR Metallic-Roughness (1024)').setImage(compressed).setMimeType('image/jpeg');
  }

  const materials = createMaterials(newDocument, textures);
  const buffer = newDocument.createBuffer('Racer GLB binary');
  const scene = newDocument.createScene('RacerScene');
  const chassisMesh = newDocument.createMesh('Chassis');
  const chassisNode = newDocument.createNode('Chassis').setMesh(chassisMesh);
  scene.addChild(chassisNode);
  for (const materialName of MATERIAL_NAMES) {
    const triangles = groups.chassis.get(materialName);
    if (!triangles.length) continue;
    addGeometryPrimitive(newDocument, buffer, chassisMesh, materials.get(materialName), triangles, geometry, origin, scale, null);
  }

  scene.setExtras({ exhausts: EXHAUST_POSITIONS });
  newDocument.getRoot().setDefaultScene(scene);

  await meshoptimizer.MeshoptSimplifier.ready;
  await newDocument.transform(simplify({ simplifier: meshoptimizer.MeshoptSimplifier, ratio: SIMPLIFY_RATIO, error: SIMPLIFY_ERROR }));

  const wheelGeometry = createWheelAssemblyGeometry();
  const outputAxles = [];
  for (const axle of axles) {
    const removedSourceTriangles = ['Tire', 'Rim'].reduce((count, materialName) => count + groups.wheels.get(axle.name).get(materialName).length, 0);
    const wheelMesh = newDocument.createMesh(axle.name);
    const extras = { spinAxis: 'X', wheelGeometry: 'hand-authored-mechanical', radialSegments: WHEEL_RADIAL_SEGMENTS, spokeCount: RIM_SPOKES, sourceTrianglesRetained: 0 };
    if (axle.z > 0) extras.steerAxis = 'Y';
    const wheelNode = newDocument.createNode(axle.name).setMesh(wheelMesh)
      .setTranslation([(axle.x - centerX) * scale, (axle.y - centerY) * scale, (axle.z - centerZ) * scale])
      .setExtras(extras);
    scene.addChild(wheelNode);
    addGeneratedPrimitive(newDocument, buffer, wheelMesh, materials.get('Tire'), wheelGeometry.tire);
    addGeneratedPrimitive(newDocument, buffer, wheelMesh, materials.get('Rim'), wheelGeometry.rim);
    outputAxles.push({ name: axle.name, sourcePosition: [axle.x, axle.y, axle.z], rootPosition: wheelNode.getTranslation(), sourceRegion: { seed: axle.seed, innerSamples: axle.innerSamples, sourceTrianglesRemoved: removedSourceTriangles } });
  }
  const outputBytes = await io.writeBinary(newDocument);
  if (outputBytes.byteLength > BINARY_LIMIT) throw new Error(`Processed GLB exceeds ${BINARY_LIMIT} bytes`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, outputBytes);

  const outputDocument = await io.read(outputPath);
  const outputNodes = outputDocument.getRoot().listNodes();
  const triangleCounts = {};
  const outputMaterialCounts = Object.fromEntries(MATERIAL_NAMES.map(name => [name, 0]));
  for (const node of outputNodes) if (node.getMesh()) {
    triangleCounts[node.getName()] = {};
    for (const primitive of node.getMesh().listPrimitives()) {
      const count = primitive.getIndices().getCount() / 3;
      const name = primitive.getMaterial().getName();
      triangleCounts[node.getName()][name] = count;
      outputMaterialCounts[name] += count;
    }
  }
  const totalTriangles = Object.values(outputMaterialCounts).reduce((total, count) => total + count, 0);
  if (totalTriangles > TRIANGLE_LIMIT) throw new Error(`Processed GLB has ${totalTriangles} triangles, limit is ${TRIANGLE_LIMIT}`);
  const outputWheelNodes = outputAxles.map(axle => outputNodes.find(node => node.getName() === axle.name));
  if (outputWheelNodes.some(node => !node || !node.getMesh())) throw new Error('Processed GLB is missing a named independent wheel node');
  const requiredMaterials = new Set(outputNodes.flatMap(node => node.getMesh() ? node.getMesh().listPrimitives().map(primitive => primitive.getMaterial().getName()) : []));
  if (MATERIAL_NAMES.some(name => !requiredMaterials.has(name))) throw new Error('Processed GLB is missing a semantic material region');
  const outputTextures = outputDocument.getRoot().listTextures().map(texture => ({ name: texture.getName(), width: TEXTURE_SIZE, height: TEXTURE_SIZE, mimeType: texture.getMimeType(), bytes: texture.getImage().byteLength }));

  const manifest = {
    schemaVersion: 1,
    targetGame: '极速飞驰',
    assetComposition: { chassis: 'Original Tencent Hunyuan v3.1 chassis geometry', wheelGeometry: 'Locally hand-authored mechanical retopology', sourceWheelGeometryRetained: false },
    source: { path: sourcePath, sha256: sourceHash, triangles: geometry.indices.length / 3, vertices: geometry.points.length },
    output: { path: outputPath, sha256: sha256(outputBytes), bytes: outputBytes.byteLength, triangles: totalTriangles, vertices: outputDocument.getRoot().listMeshes().flatMap(mesh => mesh.listPrimitives()).reduce((total, primitive) => total + primitive.getAttribute('POSITION').getCount(), 0), length: 4.8, uniformScale: scale, axes: '+Y-up/+Z-nose', groundY: 0 },
    toolchain: { gltfTransform: gltfTransformVersion, meshoptimizer: meshoptimizerVersion, meshoptimizerLicense: 'MIT', meshoptimizerPackageIntegrity: 'sha512-davRZeIJbxJrE24cwQle7ZDsxjdk/OphNOV83oX+efQinyoHY9Jcyz3MHbaoG0qySZajldGztNZ1RN/T19PZsg==', meshoptimizerLicenseFileSha256: 'f03037ca7bad1e3eb7f4a63fa6084a8baabd5ba30d3c239a9a7f35705d873e26', textureEncoder: 'sharp ' + sharp.versions.sharp },
    parameters: { simplifyRatio: SIMPLIFY_RATIO, simplifyError: SIMPLIFY_ERROR, textureSize: TEXTURE_SIZE, binaryLimit: BINARY_LIMIT, triangleLimit: TRIANGLE_LIMIT, wheelRegionRadius: 0.12, wheelRimRadius: 0.075, bodyPaintMinSourceTexelChannel: 170, bodyPaintMaxSourceTexelChroma: 55, wheelSeedReason: 'Source inner wheel rings near y=.08 and front z=.345/rear z=-.34; lateral centers derive from the inner source ring extent, not the larger fender bounding box.' },
    wheelRetopology: { radialSegments: WHEEL_RADIAL_SEGMENTS, tireProfileSegments: TIRE_PROFILE_SEGMENTS, tireMajorRadius: TIRE_MAJOR_RADIUS, tireMinorRadius: TIRE_MINOR_RADIUS, tireWidth: TIRE_WIDTH, tireOuterRadius: TIRE_MAJOR_RADIUS + TIRE_MINOR_RADIUS, tireMaterial: MATERIAL_SPECS.Tire, rimOuterRadius: 0.28, spokeCount: RIM_SPOKES, hubRadius: RIM_HUB_RADIUS, rimMaterial: MATERIAL_SPECS.Rim, wheelAxis: 'X', sourceWheelGeometryRetained: false },
    materials: MATERIAL_NAMES.map(name => { const sourceMaps = !WHEEL_MATERIAL_NAMES.has(name); return { name, triangles: outputMaterialCounts[name], baseColorTexture: sourceMaps, normalTexture: sourceMaps, metallicRoughnessTexture: sourceMaps, factor: MATERIAL_SPECS[name] }; }),
    triangleCounts,
    wheels: outputAxles.map(axle => ({ ...axle, rootPosition: outputNodes.find(node => node.getName() === axle.name).getTranslation(), geometry: 'hand-authored-mechanical', sourceTrianglesRetained: 0, componentMaterials: Object.keys(triangleCounts[axle.name]) })),
    textures: outputTextures,
    exhaustPositions: EXHAUST_POSITIONS,
    limits: { triangleLimit: TRIANGLE_LIMIT, binaryLimitBytes: BINARY_LIMIT, textureLimit: TEXTURE_SIZE },
    visualReview: { optimizedBrowserRender: 'NOT_RUN', mobileRuntime: 'NOT_RUN', paintColorSwitch: 'NOT_RUN', wheelAnimation: 'NOT_RUN' },
    notes: ['The chassis retains the resized source base-color, normal and metallic-roughness maps on its five semantic materials; Tire and Rim are texture-free, locally-authored mechanical materials.', 'Source albedo texels with all channels above 170 and chroma at most 55 are assigned BodyPaint before broad window/trim geometry rules; blue/red lamp checks precede this rule and dark glass/trim keeps its named regions.', 'All original source wheel-region triangles are removed from the output. Four locally authored 48-segment rounded tires, ten-spoke metal rims and central hubs replace them; pale source fender faces remain on the chassis.', 'Meshoptimizer is the pinned MIT simplifier used through the approved glTF Transform 4.5.1 simplify transform on chassis geometry only.'],
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('tools/lean-pilot/racing-car-prepare.mjs')) {
  const manifestPath = path.resolve(requiredValue(process.argv, '--manifest'));
  prepareRacer({ sourcePath: path.resolve(requiredValue(process.argv, '--source')), outputPath: path.resolve(requiredValue(process.argv, '--output')), manifestPath, toolRoot: path.resolve(requiredValue(process.argv, '--tool-root')) })
    .then(result => console.log(JSON.stringify({ output: result.output, materials: result.materials, wheels: result.wheels }, null, 2)));
}
