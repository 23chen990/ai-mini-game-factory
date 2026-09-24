import { z } from 'zod';
import { ProductionLineResolutionSchema } from './production-line-resolution.js';
import { ReferenceLevelImplementationContractSchema } from './reference-recording.js';

const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);
const contractShape = ReferenceLevelImplementationContractSchema.shape;
const resolutionShape = ProductionLineResolutionSchema.shape;

const RuntimeProductionSchema = z.object({
  line: resolutionShape.line.unwrap(),
  template: resolutionShape.template,
  runtime: resolutionShape.runtime,
  resolutionHash: resolutionShape.resolutionHash,
}).strict();

const SourceContractSchema = z.object({
  path: z.literal('artifacts/reference-level-implementation-contract.json'),
  sha256: Sha256,
}).strict();

const RuntimeLevelSchema = z.object({
  objects: contractShape.requiredObjects,
  checkpoints: contractShape.checkpointSequence,
  placements: contractShape.placementRules,
  relations: contractShape.spatialRelations,
  actions: contractShape.interactionSequence,
  camera: contractShape.cameraSequence,
  terminal: contractShape.terminal,
  replay: contractShape.replay,
}).strict();

/**
 * Coordinates and recording evidence stay in the research artifacts.  This
 * runtime projection carries only the semantic contract needed by a template
 * and is deliberately free of timestamps so it can be compiled idempotently.
 */
export const ReferenceLevelRuntimeDataSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('reference-level-runtime-data'),
  targetRunId: contractShape.targetRunId,
  targetGame: contractShape.targetGame,
  workspace: contractShape.workspace,
  production: RuntimeProductionSchema,
  sourceContract: SourceContractSchema,
  level: RuntimeLevelSchema,
  runtimeDataHash: Sha256,
}).strict().superRefine((data, context) => {
  const objectIds = new Set<string>();
  for (const [index, object] of data.level.objects.entries()) {
    if (objectIds.has(object.semanticId)) context.addIssue({ code: 'custom', path: ['level', 'objects', index, 'semanticId'], message: `duplicate object id ${object.semanticId}` });
    objectIds.add(object.semanticId);
  }

  const checkpointIds = new Set<string>();
  for (const [index, checkpoint] of data.level.checkpoints.entries()) {
    if (checkpointIds.has(checkpoint.id)) context.addIssue({ code: 'custom', path: ['level', 'checkpoints', index, 'id'], message: `duplicate checkpoint id ${checkpoint.id}` });
    checkpointIds.add(checkpoint.id);
  }

  const relationIds = new Set<string>();
  for (const [index, relation] of data.level.relations.entries()) {
    if (relationIds.has(relation.id)) context.addIssue({ code: 'custom', path: ['level', 'relations', index, 'id'], message: `duplicate relation id ${relation.id}` });
    relationIds.add(relation.id);
  }

  const actionIds = new Set<string>();
  for (const [index, action] of data.level.actions.entries()) {
    if (actionIds.has(action.actionId)) context.addIssue({ code: 'custom', path: ['level', 'actions', index, 'actionId'], message: `duplicate action id ${action.actionId}` });
    actionIds.add(action.actionId);
  }

  const requireObject = (value: string, path: (string | number)[]) => {
    if (!objectIds.has(value)) context.addIssue({ code: 'custom', path, message: `unknown object reference ${value}` });
  };
  const requireCheckpoint = (value: string, path: (string | number)[]) => {
    if (!checkpointIds.has(value)) context.addIssue({ code: 'custom', path, message: `unknown checkpoint reference ${value}` });
  };

  for (const [checkpointIndex, checkpoint] of data.level.checkpoints.entries()) {
    for (const [objectIndex, objectId] of checkpoint.requiredVisibleObjectIds.entries()) {
      requireObject(objectId, ['level', 'checkpoints', checkpointIndex, 'requiredVisibleObjectIds', objectIndex]);
    }
  }
  for (const [relationIndex, relation] of data.level.relations.entries()) {
    requireObject(relation.fromObjectId, ['level', 'relations', relationIndex, 'fromObjectId']);
    requireObject(relation.toObjectId, ['level', 'relations', relationIndex, 'toObjectId']);
    for (const [checkpointIndex, checkpointId] of relation.checkpointIds.entries()) requireCheckpoint(checkpointId, ['level', 'relations', relationIndex, 'checkpointIds', checkpointIndex]);
  }
  for (const [placementIndex, placement] of data.level.placements.entries()) {
    requireObject(placement.semanticId, ['level', 'placements', placementIndex, 'semanticId']);
    requireCheckpoint(placement.checkpointId, ['level', 'placements', placementIndex, 'checkpointId']);
  }
  for (const [actionIndex, action] of data.level.actions.entries()) {
    requireObject(action.targetObjectId, ['level', 'actions', actionIndex, 'targetObjectId']);
    requireCheckpoint(action.fromCheckpointId, ['level', 'actions', actionIndex, 'fromCheckpointId']);
    requireCheckpoint(action.toCheckpointId, ['level', 'actions', actionIndex, 'toCheckpointId']);
  }
  for (const [cameraIndex, camera] of data.level.camera.entries()) requireCheckpoint(camera.checkpointId, ['level', 'camera', cameraIndex, 'checkpointId']);
  if (data.level.terminal) requireCheckpoint(data.level.terminal.checkpointId, ['level', 'terminal', 'checkpointId']);
  if (data.level.replay) {
    requireObject(data.level.replay.targetObjectId, ['level', 'replay', 'targetObjectId']);
    requireCheckpoint(data.level.replay.checkpointId, ['level', 'replay', 'checkpointId']);
    requireCheckpoint(data.level.replay.returnsToCheckpointId, ['level', 'replay', 'returnsToCheckpointId']);
  }
});

export type ReferenceLevelRuntimeData = z.infer<typeof ReferenceLevelRuntimeDataSchema>;
