import path from 'node:path';
import { ReferenceLevelImplementationContractSchema, type ReferenceLevelImplementationContract } from '../schemas/reference-recording.js';
import { ProductionLineResolutionSchema, type ProductionLineResolution } from '../schemas/production-line-resolution.js';
import { ReferenceLevelRuntimeDataSchema, type ReferenceLevelRuntimeData } from '../schemas/reference-level-runtime.js';
import { sha256Text } from './files.js';

const SOURCE_CONTRACT_PATH = 'artifacts/reference-level-implementation-contract.json';
const EMPTY_HASH = '0'.repeat(64);

type RuntimeIdentity = { targetRunId: string; targetGame: string; workspace: string };

function withoutResolutionMetadata(resolution: ProductionLineResolution) {
  return Object.fromEntries(Object.entries(resolution).filter(([key]) => key !== 'resolutionHash' && key !== 'resolvedAt'));
}

function resolutionHash(resolution: ProductionLineResolution): string {
  return sha256Text(JSON.stringify(withoutResolutionMetadata(resolution)));
}

function duplicateId(values: readonly string[], kind: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`reference-level-runtime: duplicate ${kind} id ${value}`);
    seen.add(value);
  }
}

function requireObject(value: string, objectIds: ReadonlySet<string>, context: string) {
  if (!objectIds.has(value)) throw new Error(`reference-level-runtime: unknown object reference ${value} in ${context}`);
}

function requireCheckpoint(value: string, checkpointIds: ReadonlySet<string>, context: string) {
  if (!checkpointIds.has(value)) throw new Error(`reference-level-runtime: unknown checkpoint reference ${value} in ${context}`);
}

/** Validate the semantic topology before projecting it into runtime data. */
function validateContractTopology(contract: ReferenceLevelImplementationContract) {
  duplicateId(contract.requiredObjects.map((object) => object.semanticId), 'object');
  duplicateId(contract.checkpointSequence.map((checkpoint) => checkpoint.id), 'checkpoint');
  duplicateId(contract.spatialRelations.map((relation) => relation.id), 'relation');
  duplicateId(contract.interactionSequence.map((action) => action.actionId), 'action');
  const objectIds = new Set(contract.requiredObjects.map((object) => object.semanticId));
  const checkpointIds = new Set(contract.checkpointSequence.map((checkpoint) => checkpoint.id));

  for (const checkpoint of contract.checkpointSequence) {
    for (const objectId of checkpoint.requiredVisibleObjectIds) requireObject(objectId, objectIds, `checkpoint ${checkpoint.id}`);
  }
  for (const relation of contract.spatialRelations) {
    requireObject(relation.fromObjectId, objectIds, `relation ${relation.id}`);
    requireObject(relation.toObjectId, objectIds, `relation ${relation.id}`);
    for (const checkpointId of relation.checkpointIds) requireCheckpoint(checkpointId, checkpointIds, `relation ${relation.id}`);
  }
  for (const placement of contract.placementRules) {
    requireObject(placement.semanticId, objectIds, `placement ${placement.checkpointId}:${placement.semanticId}`);
    requireCheckpoint(placement.checkpointId, checkpointIds, `placement ${placement.checkpointId}:${placement.semanticId}`);
  }
  for (const action of contract.interactionSequence) {
    requireObject(action.targetObjectId, objectIds, `action ${action.actionId}`);
    requireCheckpoint(action.fromCheckpointId, checkpointIds, `action ${action.actionId}`);
    requireCheckpoint(action.toCheckpointId, checkpointIds, `action ${action.actionId}`);
  }
  for (const camera of contract.cameraSequence) requireCheckpoint(camera.checkpointId, checkpointIds, `camera ${camera.order}`);
  if (contract.terminal) requireCheckpoint(contract.terminal.checkpointId, checkpointIds, 'terminal');
  if (contract.replay) {
    requireObject(contract.replay.targetObjectId, objectIds, 'replay');
    requireCheckpoint(contract.replay.checkpointId, checkpointIds, 'replay');
    requireCheckpoint(contract.replay.returnsToCheckpointId, checkpointIds, 'replay');
  }
}

function assertIdentity(contract: ReferenceLevelImplementationContract, expected: RuntimeIdentity) {
  if (contract.targetRunId !== expected.targetRunId) throw new Error('reference-level-runtime: identity mismatch for targetRunId');
  if (contract.targetGame !== expected.targetGame) throw new Error('reference-level-runtime: identity mismatch for targetGame');
  if (path.resolve(contract.workspace) !== path.resolve(expected.workspace)) throw new Error('reference-level-runtime: identity mismatch for workspace');
}

function parseAndValidateInputs(contractValue: unknown, resolutionValue: unknown, expected: RuntimeIdentity) {
  let contract: ReferenceLevelImplementationContract;
  try {
    contract = ReferenceLevelImplementationContractSchema.parse(contractValue);
  } catch (error) {
    throw new Error(`reference-level-runtime: implementation contract invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  let resolution: ProductionLineResolution;
  try {
    resolution = ProductionLineResolutionSchema.parse(resolutionValue);
  } catch (error) {
    throw new Error(`reference-level-runtime: production line resolution invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (contract.status !== 'READY') throw new Error('reference-level-runtime: implementation contract must be READY');
  if (resolution.status !== 'RESOLVED') throw new Error('reference-level-runtime: production line resolution must be RESOLVED');
  if (resolutionHash(resolution) !== resolution.resolutionHash) throw new Error('reference-level-runtime: production line resolution hash mismatch');
  assertIdentity(contract, expected);
  validateContractTopology(contract);
  return { contract, resolution };
}

function runtimePayload(contract: ReferenceLevelImplementationContract, resolution: ProductionLineResolution) {
  return {
    schemaVersion: 1 as const,
    artifactType: 'reference-level-runtime-data' as const,
    targetRunId: contract.targetRunId,
    targetGame: contract.targetGame,
    workspace: path.resolve(contract.workspace),
    production: {
      line: resolution.line!,
      template: resolution.template,
      runtime: resolution.runtime,
      resolutionHash: resolution.resolutionHash,
    },
    sourceContract: {
      path: SOURCE_CONTRACT_PATH as typeof SOURCE_CONTRACT_PATH,
      sha256: sha256Text(JSON.stringify(contract)),
    },
    level: {
      objects: contract.requiredObjects,
      checkpoints: contract.checkpointSequence,
      placements: contract.placementRules,
      relations: contract.spatialRelations,
      actions: contract.interactionSequence,
      camera: contract.cameraSequence,
      terminal: contract.terminal,
      replay: contract.replay,
    },
  };
}

/** Compile the semantic implementation contract into deterministic runtime data. */
export function compileReferenceLevelRuntimeData(
  contractValue: unknown,
  resolutionValue: unknown,
  expected: RuntimeIdentity,
): ReferenceLevelRuntimeData {
  const { contract, resolution } = parseAndValidateInputs(contractValue, resolutionValue, expected);
  const payload = runtimePayload(contract, resolution);
  return ReferenceLevelRuntimeDataSchema.parse({ ...payload, runtimeDataHash: sha256Text(JSON.stringify(payload)) });
}

function issueSummary(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/\s+/gu, ' ').trim();
  return String(error).replace(/\s+/gu, ' ').trim();
}

/** Verify runtime data without allowing malformed/stale inputs to throw. */
export function verifyReferenceLevelRuntimeData(
  dataValue: unknown,
  contractValue: unknown,
  resolutionValue: unknown,
  expected: RuntimeIdentity,
): { passed: boolean; blockers: string[] } {
  const blockers: string[] = [];
  const dataResult = ReferenceLevelRuntimeDataSchema.safeParse(dataValue);
  const contractResult = ReferenceLevelImplementationContractSchema.safeParse(contractValue);
  const resolutionResult = ProductionLineResolutionSchema.safeParse(resolutionValue);

  if (!dataResult.success) blockers.push(`reference-level-runtime: data invalid: ${issueSummary(dataResult.error)}`);
  if (!contractResult.success) blockers.push(`reference-level-runtime: implementation contract invalid: ${issueSummary(contractResult.error)}`);
  if (!resolutionResult.success) blockers.push(`reference-level-runtime: production line resolution invalid: ${issueSummary(resolutionResult.error)}`);

  if (dataResult.success) {
    const { runtimeDataHash: actualHash, ...payload } = dataResult.data;
    if (actualHash === EMPTY_HASH || sha256Text(JSON.stringify(payload)) !== actualHash) blockers.push('reference-level-runtime: runtime data hash mismatch');
  }

  if (contractResult.success && resolutionResult.success) {
    let expectedData: ReferenceLevelRuntimeData | undefined;
    try {
      expectedData = compileReferenceLevelRuntimeData(contractResult.data, resolutionResult.data, expected);
    } catch (error) {
      blockers.push(issueSummary(error));
    }
    if (expectedData && dataResult.success && JSON.stringify(dataResult.data) !== JSON.stringify(expectedData)) blockers.push('reference-level-runtime: complete artifact mismatch');
  }

  return { passed: blockers.length === 0, blockers: [...new Set(blockers)] };
}

export function referenceLevelRuntimeDataPath(runtime: 'web-lite' | 'cocos-3d'): string {
  return runtime === 'web-lite' ? 'src/generated/reference-level.json' : 'assets/resources/generated/reference-level.json';
}
