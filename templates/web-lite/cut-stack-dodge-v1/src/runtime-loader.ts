import type { CutStackLevelConfig, CourseObjectRole } from './simulation.js';

export const REFERENCE_RUNTIME_DATA_PATH = 'src/generated/reference-level.json' as const;
const COURSE_ROLES = ['cuttable', 'support', 'hazard', 'finish'] as const;
const COURSE_ROLE_SET = new Set<string>(COURSE_ROLES);
type RuntimeMode = 'recording' | 'demo';

export type RuntimeBinding = {
  runtimeDataHash: string;
  contractHash: string;
  resolutionHash: string;
  dataPath: typeof REFERENCE_RUNTIME_DATA_PATH;
};

export type LoadedCutStackRuntime = {
  mode: RuntimeMode;
  level: CutStackLevelConfig;
  layoutHash: string;
  playerObjectId: string;
  objectIds: string[];
  runtimeBinding?: RuntimeBinding;
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`cut-stack runtime data: ${label} must be an object`);
  return value as UnknownRecord;
}

function keys(value: UnknownRecord, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) throw new Error(`cut-stack runtime data: ${label} has unexpected or missing fields`);
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`cut-stack runtime data: ${label} must be finite`);
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`cut-stack runtime data: ${label} must be non-empty text`);
  return value;
}

const SHA256_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

function rotateRight(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

/** Small synchronous SHA-256 implementation keeps the packaged file classic-script safe. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashText(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000) >>> 0);
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const hash = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
      const first = words[index - 15]!;
      const second = words[index - 2]!;
      const smallSigma0 = rotateRight(first, 7) ^ rotateRight(first, 18) ^ (first >>> 3);
      const smallSigma1 = rotateRight(second, 17) ^ rotateRight(second, 19) ^ (second >>> 10);
      words[index] = (words[index - 16]! + smallSigma0 + words[index - 7]! + smallSigma1) >>> 0;
    }
    let a = hash[0]!;
    let b = hash[1]!;
    let c = hash[2]!;
    let d = hash[3]!;
    let e = hash[4]!;
    let f = hash[5]!;
    let g = hash[6]!;
    let h = hash[7]!;
    for (let index = 0; index < 64; index += 1) {
      const bigSigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temporary1 = (h + bigSigma1 + choose + SHA256_CONSTANTS[index]! + words[index]!) >>> 0;
      const bigSigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (bigSigma0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    hash[0] = (hash[0]! + a) >>> 0;
    hash[1] = (hash[1]! + b) >>> 0;
    hash[2] = (hash[2]! + c) >>> 0;
    hash[3] = (hash[3]! + d) >>> 0;
    hash[4] = (hash[4]! + e) >>> 0;
    hash[5] = (hash[5]! + f) >>> 0;
    hash[6] = (hash[6]! + g) >>> 0;
    hash[7] = (hash[7]! + h) >>> 0;
  }
  return [...hash].map((word) => word.toString(16).padStart(8, '0')).join('');
}

function hashJson(value: unknown): string {
  return hashText(canonicalJson(value));
}

function hashSerializedJson(value: unknown): string {
  return hashText(JSON.stringify(value));
}

function cloneLevel(level: CutStackLevelConfig): CutStackLevelConfig {
  return structuredClone(level);
}

function validateLevel(value: unknown): CutStackLevelConfig {
  const level = record(value, 'layout.level');
  keys(level, ['fixedStepSeconds', 'gravity', 'tapImpulse', 'forwardSpeed', 'angularImpulse', 'failY', 'finishX', 'player', 'objects'], 'layout.level');
  const fixedStepSeconds = finite(level.fixedStepSeconds, 'layout.level.fixedStepSeconds');
  const gravity = finite(level.gravity, 'layout.level.gravity');
  const tapImpulse = finite(level.tapImpulse, 'layout.level.tapImpulse');
  const forwardSpeed = finite(level.forwardSpeed, 'layout.level.forwardSpeed');
  const angularImpulse = finite(level.angularImpulse, 'layout.level.angularImpulse');
  const failY = finite(level.failY, 'layout.level.failY');
  const finishX = finite(level.finishX, 'layout.level.finishX');
  if (fixedStepSeconds <= 0 || fixedStepSeconds > 1 || gravity < 0 || forwardSpeed <= 0 || finishX <= 0) throw new Error('cut-stack runtime data: invalid authored physics');
  const player = record(level.player, 'layout.level.player');
  keys(player, ['x', 'y', 'radius', 'angle'], 'layout.level.player');
  const playerValue = { x: finite(player.x, 'layout.level.player.x'), y: finite(player.y, 'layout.level.player.y'), radius: finite(player.radius, 'layout.level.player.radius'), angle: finite(player.angle, 'layout.level.player.angle') };
  if (playerValue.radius <= 0 || failY <= playerValue.y + playerValue.radius || finishX <= playerValue.x) throw new Error('cut-stack runtime data: invalid player bounds or terminal physics');
  if (!Array.isArray(level.objects) || level.objects.length === 0) throw new Error('cut-stack runtime data: layout.level.objects must not be empty');
  const seen = new Set<string>();
  const objects = level.objects.map((value, index) => {
    const object = record(value, `layout.level.objects[${index}]`);
    keys(object, ['id', 'role', 'x', 'y', 'width', 'height'], `layout.level.objects[${index}]`);
    const id = text(object.id, `layout.level.objects[${index}].id`);
    const role = text(object.role, `layout.level.objects[${index}].role`) as CourseObjectRole;
    if (!COURSE_ROLE_SET.has(role)) throw new Error(`cut-stack runtime data: unknown course role ${role}`);
    if (seen.has(id)) throw new Error(`cut-stack runtime data: duplicate course object ${id}`);
    seen.add(id);
    const x = finite(object.x, `layout.level.objects[${index}].x`);
    const y = finite(object.y, `layout.level.objects[${index}].y`);
    const width = finite(object.width, `layout.level.objects[${index}].width`);
    const height = finite(object.height, `layout.level.objects[${index}].height`);
    if (width <= 0 || height <= 0) throw new Error(`cut-stack runtime data: invalid size for ${id}`);
    return { id, role, x, y, width, height };
  });
  return { fixedStepSeconds, gravity, tapImpulse, forwardSpeed, angularImpulse, failY, finishX, player: playerValue, objects };
}

function validateRuntimeData(value: unknown): UnknownRecord {
  const data = record(value, 'reference-level.json');
  keys(data, ['schemaVersion', 'artifactType', 'targetRunId', 'targetGame', 'workspace', 'production', 'sourceContract', 'level', 'runtimeDataHash'], 'reference-level.json');
  if (data.schemaVersion !== 1 || data.artifactType !== 'reference-level-runtime-data') throw new Error('cut-stack runtime data: unsupported runtime data artifact');
  text(data.runtimeDataHash, 'reference-level.json.runtimeDataHash');
  const production = record(data.production, 'reference-level.json.production');
  keys(production, ['line', 'template', 'runtime', 'resolutionHash'], 'reference-level.json.production');
  if (production.template !== 'cut-stack-dodge-v1' || production.runtime !== 'web-lite') throw new Error('cut-stack runtime data: template/runtime mismatch');
  text(production.resolutionHash, 'reference-level.json.production.resolutionHash');
  const sourceContract = record(data.sourceContract, 'reference-level.json.sourceContract');
  keys(sourceContract, ['path', 'sha256'], 'reference-level.json.sourceContract');
  text(sourceContract.sha256, 'reference-level.json.sourceContract.sha256');
  const level = record(data.level, 'reference-level.json.level');
  keys(level, ['objects', 'checkpoints', 'placements', 'relations', 'actions', 'camera', 'terminal', 'replay'], 'reference-level.json.level');
  if (!Array.isArray(level.objects)) throw new Error('cut-stack runtime data: reference-level.json.level.objects must be an array');
  return data;
}

function validateObjectBinding(layout: UnknownRecord, runtimeData: UnknownRecord): { playerObjectId: string; objectIds: string[] } {
  const runtimeLevel = record(runtimeData.level, 'reference-level.json.level');
  const runtimeObjects = runtimeLevel.objects as unknown[];
  const playerObjects = runtimeObjects.map((value, index) => record(value, `reference-level.json.level.objects[${index}]`)).filter((object) => object.role === 'player');
  if (playerObjects.length !== 1) throw new Error('cut-stack runtime data: exactly one player object is required');
  const playerObjectId = text(playerObjects[0]!.semanticId, 'reference-level.json.level.player.semanticId');
  const expected = runtimeObjects
    .map((value, index) => record(value, `reference-level.json.level.objects[${index}]`))
    .filter((object) => COURSE_ROLE_SET.has(String(object.role)))
    .map((object) => ({ id: text(object.semanticId, 'reference-level.json.level.objects.semanticId'), role: text(object.role, 'reference-level.json.level.objects.role') }));
  const authoredLevel = record(layout.level, 'layout.level');
  const authoredObjects = authoredLevel.objects as unknown[];
  const authored = authoredObjects.map((value, index) => {
    const object = record(value, `layout.level.objects[${index}]`);
    return { id: text(object.id, `layout.level.objects[${index}].id`), role: text(object.role, `layout.level.objects[${index}].role`) };
  });
  if (new Set(authored.map((object) => object.id)).size !== authored.length || expected.length !== authored.length) throw new Error('cut-stack runtime data: authored object list is stale or incomplete');
  for (const required of expected) {
    const object = authored.find((candidate) => candidate.id === required.id);
    if (!object || object.role !== required.role) throw new Error(`cut-stack runtime data: authored object mismatch for ${required.id}`);
  }
  if (authored.some((object) => !expected.some((candidate) => candidate.id === object.id && candidate.role === object.role))) throw new Error('cut-stack runtime data: authored object list contains a foreign object');
  const playerId = text(layout.playerObjectId, 'layout.playerObjectId');
  if (playerId !== playerObjectId || authored.some((object) => object.id === playerId)) throw new Error('cut-stack runtime data: authored player object mismatch');
  return { playerObjectId, objectIds: authored.map((object) => object.id) };
}

export function loadCutStackRuntime(runtimeDataValue: unknown, layoutValue: unknown, legacyLevel: CutStackLevelConfig): LoadedCutStackRuntime {
  if (runtimeDataValue === null) {
    return {
      mode: 'demo',
      level: cloneLevel(legacyLevel),
      layoutHash: hashJson({ mode: 'demo', level: legacyLevel }),
      playerObjectId: 'player-blade',
      objectIds: legacyLevel.objects.map((object) => object.id),
    };
  }
  if (runtimeDataValue === undefined) throw new Error('cut-stack runtime data: recording data is missing');
  const runtimeData = validateRuntimeData(runtimeDataValue);
  const { runtimeDataHash, ...runtimePayload } = runtimeData;
  if (runtimeDataHash !== hashSerializedJson(runtimePayload)) throw new Error('cut-stack runtime data: runtimeDataHash mismatch');
  const layout = record(layoutValue, 'reference-level-layout.json');
  keys(layout, ['schemaVersion', 'artifactType', 'template', 'runtime', 'sourceRuntimeDataHash', 'playerObjectId', 'level'], 'reference-level-layout.json');
  if (layout.schemaVersion !== 1 || layout.artifactType !== 'reference-level-layout' || layout.template !== 'cut-stack-dodge-v1' || layout.runtime !== 'web-lite') throw new Error('cut-stack runtime data: authored layout template/runtime mismatch');
  if (layout.sourceRuntimeDataHash !== runtimeDataHash) throw new Error('cut-stack runtime data: authored layout source hash mismatch');
  const binding = validateObjectBinding(layout, runtimeData);
  const level = validateLevel(layout.level);
  return {
    mode: 'recording',
    level,
    layoutHash: hashJson(layout),
    playerObjectId: binding.playerObjectId,
    objectIds: binding.objectIds,
    runtimeBinding: {
      runtimeDataHash: text(runtimeDataHash, 'runtimeDataHash'),
      contractHash: text(record(runtimeData.sourceContract, 'sourceContract').sha256, 'sourceContract.sha256'),
      resolutionHash: text(record(runtimeData.production, 'production').resolutionHash, 'production.resolutionHash'),
      dataPath: REFERENCE_RUNTIME_DATA_PATH,
    },
  };
}
