import { ReferenceLevelRuntimeDataSchema, type ReferenceLevelRuntimeData } from '../schemas/reference-level-runtime.js';
import {
  CUT_STACK_OBJECT_ROLES,
  ReferenceLevelLayoutSchema,
  ReferenceLevelSaveIdentitySchema,
  type CutStackLevelConfigData,
  type ReferenceLevelLayout,
  type ReferenceLevelSaveIdentity,
} from '../schemas/reference-level-layout.js';
import { sha256Text } from './files.js';

const RUNTIME_DATA_PATH = 'src/generated/reference-level.json' as const;
const EMPTY_HASH = '0'.repeat(64);
const COURSE_ROLE_SET = new Set<string>(CUT_STACK_OBJECT_ROLES);

export type ReferenceLevelRuntimeBinding = {
  runtimeDataHash: string;
  contractHash: string;
  resolutionHash: string;
  dataPath: typeof RUNTIME_DATA_PATH;
};

export type LoadedReferenceLevelLayout = {
  mode: 'recording' | 'demo';
  layout: ReferenceLevelLayout;
  level: CutStackLevelConfigData;
  layoutHash: string;
  playerObjectId: string;
  objectIds: string[];
  runtimeBinding?: ReferenceLevelRuntimeBinding;
};

function issueSummary(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/\s+/gu, ' ').trim();
  return String(error).replace(/\s+/gu, ' ').trim();
}

function parseLayout(value: unknown): ReferenceLevelLayout {
  try {
    return ReferenceLevelLayoutSchema.parse(value);
  } catch (error) {
    throw new Error(`reference-level-layout: authored layout invalid: ${issueSummary(error)}`);
  }
}

function parseRuntimeData(value: unknown): ReferenceLevelRuntimeData {
  let data: ReferenceLevelRuntimeData;
  try {
    data = ReferenceLevelRuntimeDataSchema.parse(value);
  } catch (error) {
    throw new Error(`reference-level-layout: runtime data invalid: ${issueSummary(error)}`);
  }
  const { runtimeDataHash, ...payload } = data;
  if (runtimeDataHash === EMPTY_HASH || sha256Text(JSON.stringify(payload)) !== runtimeDataHash) {
    throw new Error('reference-level-layout: runtime data hash mismatch');
  }
  if (data.production.template !== 'cut-stack-dodge-v1' || data.production.runtime !== 'web-lite') {
    throw new Error('reference-level-layout: runtime data template/runtime mismatch');
  }
  return data;
}

function compareRequiredObjects(layout: ReferenceLevelLayout, runtimeData: ReferenceLevelRuntimeData): void {
  const playerObjects = runtimeData.level.objects.filter((object) => object.role === 'player');
  if (playerObjects.length !== 1) throw new Error('reference-level-layout: runtime data must contain exactly one player object');
  if (layout.playerObjectId !== playerObjects[0]!.semanticId) {
    throw new Error(`reference-level-layout: player object mismatch: ${layout.playerObjectId} !== ${playerObjects[0]!.semanticId}`);
  }

  const requiredObjects = runtimeData.level.objects.filter((object) => COURSE_ROLE_SET.has(object.role));
  const authoredById = new Map(layout.level.objects.map((object) => [object.id, object]));
  if (authoredById.size !== layout.level.objects.length) throw new Error('reference-level-layout: authored object ids must be unique');
  if (requiredObjects.length !== layout.level.objects.length) throw new Error('reference-level-layout: authored object list is missing or has foreign objects');
  for (const required of requiredObjects) {
    const authored = authoredById.get(required.semanticId);
    if (!authored) throw new Error(`reference-level-layout: missing required object ${required.semanticId}`);
    if (authored.role !== required.role) throw new Error(`reference-level-layout: object role mismatch for ${required.semanticId}`);
  }
  for (const authored of layout.level.objects) {
    const required = requiredObjects.find((object) => object.semanticId === authored.id);
    if (!required || required.role !== authored.role) throw new Error(`reference-level-layout: foreign object ${authored.id}`);
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function layoutHash(layout: ReferenceLevelLayout): string {
  return sha256Text(canonicalJson(layout));
}

/**
 * Build a deterministic, original numeric layout for the mock mechanics
 * preview. This is a Builder-owned fallback only; production BuilderAgent
 * output still has to author and verify its own layout values.
 */
export function buildDeterministicReferenceLevelLayout(value: unknown): ReferenceLevelLayout {
  const data = ReferenceLevelRuntimeDataSchema.parse(value);
  const player = data.level.objects.find((object) => object.role === 'player');
  if (!player) throw new Error('reference-level-layout: deterministic preview requires a player object');
  const objects = data.level.objects.filter((object) => COURSE_ROLE_SET.has(object.role));
  if (objects.length === 0) throw new Error('reference-level-layout: deterministic preview requires course objects');
  // Keep the mock course's causal order explicit: the player crosses the
  // target first, then the lower hazard lane, and finally the far-right
  // finish. The positions are original preview values, not source recording
  // coordinates; their only contract is the locked coarse topology.
  const levelObjects = objects.map((object) => {
    if (object.role === 'support') return { id: object.semanticId, role: object.role, x: 360, y: 500, width: 300, height: 42 };
    if (object.role === 'hazard') return { id: object.semanticId, role: object.role, x: 700, y: 400, width: 100, height: 140 };
    if (object.role === 'finish') return { id: object.semanticId, role: object.role, x: 900, y: 210, width: 28, height: 200 };
    return { id: object.semanticId, role: object.role, x: 420, y: 205, width: 100, height: 50 };
  });
  const finish = levelObjects.find((object) => object.role === 'finish');
  const finishX = Math.max(960, (finish?.x ?? 0) + (finish?.width ?? 0) + 24);
  return ReferenceLevelLayoutSchema.parse({
    schemaVersion: 1,
    artifactType: 'reference-level-layout',
    template: 'cut-stack-dodge-v1',
    runtime: 'web-lite',
    sourceRuntimeDataHash: data.runtimeDataHash,
    playerObjectId: player.semanticId,
    level: {
      fixedStepSeconds: 1 / 60,
      gravity: 720,
      tapImpulse: -280,
      forwardSpeed: 600,
      angularImpulse: Math.PI * 2,
      failY: 720,
      finishX,
      player: { x: 120, y: 300, radius: 18, angle: Math.PI / 2 },
      objects: levelObjects,
    },
  });
}

/**
 * Validate the Builder-authored numeric layout against the immutable runtime
 * projection. A null runtime projection is the explicit legacy/demo mode.
 */
export function loadReferenceLevelLayout(layoutValue: unknown, runtimeDataValue: unknown): LoadedReferenceLevelLayout {
  const layout = parseLayout(layoutValue);
  const hash = layoutHash(layout);
  const objectIds = layout.level.objects.map((object) => object.id);
  if (runtimeDataValue === null) {
    if (layout.sourceRuntimeDataHash !== null) throw new Error('reference-level-layout: demo layout must not carry a runtime data hash');
    if (objectIds.includes(layout.playerObjectId)) throw new Error('reference-level-layout: player id must be separate from course object ids');
    return { mode: 'demo', layout, level: layout.level, layoutHash: hash, playerObjectId: layout.playerObjectId, objectIds };
  }
  if (runtimeDataValue === undefined) throw new Error('reference-level-layout: recording runtime data is missing');

  const runtimeData = parseRuntimeData(runtimeDataValue);
  if (layout.sourceRuntimeDataHash === null || layout.sourceRuntimeDataHash !== runtimeData.runtimeDataHash) {
    throw new Error('reference-level-layout: source runtime data hash mismatch');
  }
  compareRequiredObjects(layout, runtimeData);
  return {
    mode: 'recording',
    layout,
    level: layout.level,
    layoutHash: hash,
    playerObjectId: layout.playerObjectId,
    objectIds,
    runtimeBinding: {
      runtimeDataHash: runtimeData.runtimeDataHash,
      contractHash: runtimeData.sourceContract.sha256,
      resolutionHash: runtimeData.production.resolutionHash,
      dataPath: RUNTIME_DATA_PATH,
    },
  };
}

/** Alias used by callers that want validation without emphasizing loading. */
export const validateReferenceLevelLayout = loadReferenceLevelLayout;

export function createReferenceLevelSaveIdentity(loaded: LoadedReferenceLevelLayout): ReferenceLevelSaveIdentity {
  return ReferenceLevelSaveIdentitySchema.parse({
    runtimeDataHash: loaded.runtimeBinding?.runtimeDataHash ?? null,
    layoutHash: loaded.layoutHash,
    playerObjectId: loaded.playerObjectId,
    objectIds: [...loaded.objectIds],
  });
}

/**
 * Save files carry the exact loaded layout identity. A stale object list or
 * data hash is rejected so a changed authored course cannot hydrate old state.
 */
export function validateReferenceLevelSave(value: unknown, expected: ReferenceLevelSaveIdentity): ReferenceLevelSaveIdentity {
  let actual: ReferenceLevelSaveIdentity;
  try {
    if (!value || typeof value !== 'object') throw new Error('save is not an object');
    const candidate = value as Record<string, unknown>;
    actual = ReferenceLevelSaveIdentitySchema.parse({
      runtimeDataHash: candidate.runtimeDataHash,
      layoutHash: candidate.layoutHash,
      playerObjectId: candidate.playerObjectId,
      objectIds: candidate.objectIds,
    });
  } catch (error) {
    throw new Error(`reference-level-layout: save identity invalid: ${issueSummary(error)}`);
  }
  const expectedParsed = ReferenceLevelSaveIdentitySchema.parse(expected);
  if (actual.runtimeDataHash !== expectedParsed.runtimeDataHash) throw new Error('reference-level-layout: save runtime data hash is stale');
  if (actual.layoutHash !== expectedParsed.layoutHash) throw new Error('reference-level-layout: save layout hash is stale');
  if (actual.playerObjectId !== expectedParsed.playerObjectId) throw new Error('reference-level-layout: save player id is stale');
  if (JSON.stringify(actual.objectIds) !== JSON.stringify(expectedParsed.objectIds)) throw new Error('reference-level-layout: save object list is stale');
  return actual;
}

export { RUNTIME_DATA_PATH as REFERENCE_LEVEL_RUNTIME_DATA_PATH };
