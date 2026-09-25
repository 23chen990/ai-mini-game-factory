import { z } from 'zod';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);
const RunRelativePath = Text.refine((value) => !value.startsWith('/') && !value.split(/[\\/]/u).includes('..'), 'path must stay relative to the owning run');
const AbsolutePath = Text.refine((value) => value.startsWith('/'), 'workspace must be absolute');
const Viewport = z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict();
const EvidenceFile = z.object({ path: RunRelativePath, sha256: Sha256 }).strict();
const NormalizedPoint = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict();
const NormalizedBounds = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) }).strict()
  .superRefine((bounds, context) => {
    if (bounds.x + bounds.width > 1.000_001) context.addIssue({ code: 'custom', path: ['width'], message: 'normalized bounds exceed viewport width' });
    if (bounds.y + bounds.height > 1.000_001) context.addIssue({ code: 'custom', path: ['height'], message: 'normalized bounds exceed viewport height' });
  });

export const ReferenceFrameSchema = z.object({
  id: Text,
  index: z.number().int().nonnegative(),
  requestedMs: z.number().int().nonnegative(),
  actualMs: z.number().int().nonnegative(),
  path: RunRelativePath,
  sha256: Sha256,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
}).strict();

export const ReferenceFrameManifestSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('reference-frame-manifest'),
  targetRunId: Text,
  targetGame: Text,
  workspace: AbsolutePath,
  source: z.object({
    evidenceId: Text,
    path: RunRelativePath,
    sha256: Sha256,
    mediaType: z.enum(['video/mp4', 'video/quicktime']),
    durationMs: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }).strict(),
  extraction: z.object({
    version: z.literal(2),
    engine: z.enum(['AVFoundation', 'injected-test-extractor']),
    samplingFps: z.number().positive().max(60),
    maxFrames: z.number().int().positive().max(3_600),
    requestedFrameCount: z.number().int().nonnegative(),
    extractedFrameCount: z.number().int().nonnegative(),
  }).strict(),
  frames: z.array(ReferenceFrameSchema),
  contactSheets: z.array(z.object({
    id: Text,
    index: z.number().int().nonnegative(),
    firstFrameIndex: z.number().int().nonnegative(),
    lastFrameIndex: z.number().int().nonnegative(),
    path: RunRelativePath,
    sha256: Sha256,
  }).strict()),
  status: z.enum(['READY', 'BLOCKED']),
  blockers: z.array(Text),
  extractedAt: z.string().datetime(),
}).strict().superRefine((manifest, context) => {
  if (manifest.extraction.extractedFrameCount !== manifest.frames.length) context.addIssue({ code: 'custom', path: ['extraction', 'extractedFrameCount'], message: 'extracted frame count must match frames' });
  if (manifest.extraction.requestedFrameCount < manifest.frames.length) context.addIssue({ code: 'custom', path: ['extraction', 'requestedFrameCount'], message: 'requested frame count cannot be smaller than extracted count' });
  if (manifest.status === 'READY' && (manifest.blockers.length > 0 || manifest.frames.length < 2)) context.addIssue({ code: 'custom', path: ['status'], message: 'READY frame manifests require at least two frames and no blockers' });
  if (manifest.status === 'BLOCKED' && manifest.blockers.length === 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'BLOCKED frame manifests require blockers' });
  const ids = manifest.frames.map((frame) => frame.id);
  const paths = manifest.frames.map((frame) => frame.path);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['frames'], message: 'frame ids must be unique' });
  if (new Set(paths).size !== paths.length) context.addIssue({ code: 'custom', path: ['frames'], message: 'frame paths must be unique' });
  for (const [index, frame] of manifest.frames.entries()) {
    if (frame.index !== index) context.addIssue({ code: 'custom', path: ['frames', index, 'index'], message: 'frame indexes must be contiguous' });
    if (index > 0 && frame.requestedMs <= manifest.frames[index - 1]!.requestedMs) context.addIssue({ code: 'custom', path: ['frames', index, 'requestedMs'], message: 'requested timestamps must increase' });
    if (frame.actualMs > manifest.source.durationMs + 1_000) context.addIssue({ code: 'custom', path: ['frames', index, 'actualMs'], message: 'actual timestamp exceeds source duration' });
    if (frame.width !== manifest.source.width || frame.height !== manifest.source.height) context.addIssue({ code: 'custom', path: ['frames', index], message: 'frame dimensions must match source dimensions' });
  }
});
export type ReferenceFrameManifest = z.infer<typeof ReferenceFrameManifestSchema>;

export const REFERENCE_LEVEL_PHASES = ['ready', 'input', 'interaction', 'aftermath', 'terminal', 'replay'] as const;
export const ReferenceLevelPhaseSchema = z.enum(REFERENCE_LEVEL_PHASES);
export const ReferenceObjectRoleSchema = z.enum(['player', 'cuttable', 'support', 'hazard', 'finish', 'reward', 'hud', 'replay-control', 'decorative']);
export const ReferenceObjectLifecycleSchema = z.enum(['not-spawned', 'ready', 'moving', 'contact', 'resolved', 'falling', 'settled', 'terminal', 'hidden']);
export const ReferenceCameraModeSchema = z.enum(['static', 'follow', 'scroll', 'cut', 'unknown']);
export const ReferenceInputKindSchema = z.enum(['none', 'tap', 'press', 'release', 'swipe', 'drag']);
export const ReferenceSpatialRelationSchema = z.enum(['supported-by', 'precedes', 'above', 'below', 'left-of', 'right-of', 'inside', 'attached-to', 'reachable-after', 'intersects-path', 'finish-after']);
export const ReferenceHorizontalBandSchema = z.enum(['far-left', 'left', 'center', 'right', 'far-right']);
export const ReferenceVerticalBandSchema = z.enum(['top', 'upper', 'middle', 'lower', 'bottom']);
export const ReferenceExtentBandSchema = z.enum(['tiny', 'small', 'medium', 'large', 'span']);
export const ReferenceOrientationBandSchema = z.enum(['horizontal', 'diagonal-up', 'vertical', 'diagonal-down']);

export const MeasurementRangeSchema = z.object({
  min: z.number().refine(Number.isFinite, 'measurement range minimum must be finite'),
  max: z.number().refine(Number.isFinite, 'measurement range maximum must be finite'),
}).strict().superRefine((range, context) => {
  if (range.min > range.max) context.addIssue({ code: 'custom', path: ['min'], message: 'measurement range minimum cannot exceed maximum' });
});
export const MeasurementKindSchema = z.enum(['checkpoint-interval', 'relative-distance']);
export const MeasurementUnitSchema = z.enum(['ms', 'normalized-distance']);
export const MeasurementStatusSchema = z.enum(['OBSERVED', 'INFERRED', 'UNKNOWN']);
export const MeasurementCoordinateSpaceSchema = z.enum(['screen-normalized', 'world-relative', 'unknown']);

/**
 * A small, source-bound observation that survives the projection into the
 * implementation contract. It deliberately describes a relationship and an
 * interval, rather than exposing source coordinates or guessed physics.
 */
export const ReferenceBehaviorMeasurementSchema = z.object({
  id: Text,
  kind: MeasurementKindSchema,
  status: MeasurementStatusSchema,
  unit: MeasurementUnitSchema,
  fromCheckpointId: Text,
  toCheckpointId: Text,
  fromEvent: Text,
  toEvent: Text,
  subjectObjectId: Text.nullable(),
  relatedObjectId: Text.nullable(),
  sourceCheckpointIds: z.array(Text).min(1),
  sourceFrameIds: z.array(Text).min(1),
  observedRange: MeasurementRangeSchema.nullable(),
  uncertainty: z.number().nonnegative().nullable(),
  coordinateSpace: MeasurementCoordinateSpaceSchema,
  sourceViewport: Viewport.optional(),
  applicability: Text,
  basis: Text,
}).strict().superRefine((measurement, context) => {
  if (measurement.fromCheckpointId === measurement.toCheckpointId) context.addIssue({ code: 'custom', path: ['toCheckpointId'], message: 'a measurement must compare two distinct checkpoints' });
  if (measurement.status === 'OBSERVED' && (measurement.observedRange === null || measurement.uncertainty === null)) context.addIssue({ code: 'custom', path: ['observedRange'], message: 'OBSERVED measurements require a measured range and uncertainty' });
  if (measurement.status === 'UNKNOWN' && measurement.observedRange !== null) context.addIssue({ code: 'custom', path: ['observedRange'], message: 'UNKNOWN measurements cannot carry an observed range' });
  if (measurement.kind === 'checkpoint-interval' && measurement.unit !== 'ms') context.addIssue({ code: 'custom', path: ['unit'], message: 'checkpoint intervals must use milliseconds' });
  if (measurement.kind === 'relative-distance' && (measurement.subjectObjectId === null || measurement.relatedObjectId === null)) context.addIssue({ code: 'custom', path: ['subjectObjectId'], message: 'relative-distance measurements require two semantic objects' });
});
export type ReferenceBehaviorMeasurement = z.infer<typeof ReferenceBehaviorMeasurementSchema>;

export const ReferenceBehaviorTargetSchema = z.object({
  id: Text,
  measurementId: Text,
  kind: MeasurementKindSchema,
  unit: MeasurementUnitSchema,
  fromCheckpointId: Text,
  toCheckpointId: Text,
  subjectObjectId: Text.nullable(),
  relatedObjectId: Text.nullable(),
  expectedRange: MeasurementRangeSchema,
  acceptanceRange: MeasurementRangeSchema,
  uncertainty: z.number().nonnegative(),
  coordinateSpace: MeasurementCoordinateSpaceSchema.exclude(['unknown']),
  sourceViewport: Viewport.optional(),
  applicability: Text,
  sourceFrameIds: z.array(Text).min(1),
  source: EvidenceFile,
}).strict();
export type ReferenceBehaviorTarget = z.infer<typeof ReferenceBehaviorTargetSchema>;

const RuntimeMeasurementStatusSchema = z.enum(['MEASURED', 'INSUFFICIENT']);
const RuntimeMeasurementSchema = z.object({
  measurementId: Text,
  status: RuntimeMeasurementStatusSchema,
  unit: MeasurementUnitSchema,
  actualRange: MeasurementRangeSchema.optional(),
  sourceCheckpointIds: z.array(Text).min(1),
  subjectObjectId: Text.nullable(),
  relatedObjectId: Text.nullable(),
  basis: Text,
  evidence: z.array(EvidenceFile).min(1),
}).strict().superRefine((measurement, context) => {
  if (measurement.status === 'MEASURED' && measurement.actualRange === undefined) context.addIssue({ code: 'custom', path: ['actualRange'], message: 'MEASURED runtime observations require an actual range' });
  if (measurement.status === 'INSUFFICIENT' && measurement.actualRange !== undefined) context.addIssue({ code: 'custom', path: ['actualRange'], message: 'INSUFFICIENT runtime observations cannot carry an actual range' });
});
export type ReferenceLevelRuntimeMeasurement = z.infer<typeof RuntimeMeasurementSchema>;

const PlacementSignatureSchema = z.object({
  horizontalBand: ReferenceHorizontalBandSchema,
  verticalBand: ReferenceVerticalBandSchema,
  widthBand: ReferenceExtentBandSchema,
  heightBand: ReferenceExtentBandSchema,
  orientationBand: ReferenceOrientationBandSchema,
}).strict();

const CheckpointInputSchema = z.object({
  actionId: Text.nullable(),
  kind: ReferenceInputKindSchema,
  targetObjectId: Text.nullable(),
  gestureDirection: z.enum(['none', 'up', 'down', 'left', 'right']),
  sourcePointNormalized: NormalizedPoint.nullable(),
  confidence: z.number().min(0).max(1),
}).strict().superRefine((input, context) => {
  if (input.kind === 'none' && (input.actionId !== null || input.targetObjectId !== null || input.sourcePointNormalized !== null)) context.addIssue({ code: 'custom', message: 'none input cannot carry action, target or point' });
  if (input.kind !== 'none' && input.actionId === null) context.addIssue({ code: 'custom', path: ['actionId'], message: 'natural input requires an action id' });
});

const ReferenceCheckpointSchema = z.object({
  id: Text,
  phase: ReferenceLevelPhaseSchema,
  atMs: z.number().int().nonnegative(),
  sourceFrameIds: z.array(Text).min(1),
  input: CheckpointInputSchema,
  camera: z.object({ mode: ReferenceCameraModeSchema, focusObjectIds: z.array(Text), motion: z.enum(['static', 'forward', 'backward', 'vertical', 'cut', 'unknown']), confidence: z.number().min(0).max(1) }).strict(),
  objects: z.array(z.object({
    semanticId: Text,
    role: ReferenceObjectRoleSchema,
    lifecycle: ReferenceObjectLifecycleSchema,
    boundsNormalized: NormalizedBounds,
    rotationDegrees: z.number().min(-360).max(360),
    visible: z.boolean(),
    confidence: z.number().min(0).max(1),
  }).strict()),
  visibleFeedback: z.array(z.object({ id: Text, anchorObjectId: Text.nullable(), order: z.number().int().positive(), event: Text }).strict()),
}).strict();

const SpatialRelationRecordSchema = z.object({
  id: Text,
  fromObjectId: Text,
  relation: ReferenceSpatialRelationSchema,
  toObjectId: Text,
  checkpointIds: z.array(Text).min(1),
  observed: z.boolean(),
}).strict();

const InteractionStepSchema = z.object({
  order: z.number().int().positive(),
  actionId: Text,
  kind: ReferenceInputKindSchema.exclude(['none']),
  targetObjectId: Text,
  fromCheckpointId: Text,
  toCheckpointId: Text,
  responseClass: z.enum(['immediate', 'short', 'deferred']),
  expectedStateChange: Text,
}).strict();

export const ReferenceLevelReconstructionSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('reference-level-reconstruction'),
  targetRunId: Text,
  targetGame: Text,
  workspace: AbsolutePath,
  source: z.object({ frameManifestPath: RunRelativePath, frameManifestSha256: Sha256, recordingSha256: Sha256, viewport: Viewport }).strict(),
  checkpoints: z.array(ReferenceCheckpointSchema),
  spatialRelations: z.array(SpatialRelationRecordSchema),
  interactionSequence: z.array(InteractionStepSchema),
  cameraSequence: z.array(z.object({ order: z.number().int().positive(), checkpointId: Text, mode: ReferenceCameraModeSchema, focusObjectRole: ReferenceObjectRoleSchema }).strict()),
  terminal: z.object({ checkpointId: Text, result: Text, causeVisible: z.boolean(), settlementVisible: z.boolean() }).strict().nullable(),
  replay: z.object({ checkpointId: Text, actionId: Text, targetObjectId: Text, returnsToCheckpointId: Text }).strict().nullable(),
  /** Optional R1 measurements. Omitted on legacy artifacts to preserve their
   * serialized shape and existing contract hashes. */
  behaviorMeasurements: z.array(ReferenceBehaviorMeasurementSchema).optional(),
  observations: z.array(Text),
  inferences: z.array(Text),
  unknowns: z.array(Text),
  status: z.enum(['READY', 'BLOCKED']),
  blockers: z.array(Text),
  analyzedAt: z.string().datetime(),
}).strict().superRefine((reconstruction, context) => {
  const ids = reconstruction.checkpoints.map((checkpoint) => checkpoint.id);
  const idSet = new Set(ids);
  if (idSet.size !== ids.length) context.addIssue({ code: 'custom', path: ['checkpoints'], message: 'checkpoint ids must be unique' });
  for (const [index, checkpoint] of reconstruction.checkpoints.entries()) {
    if (index > 0 && checkpoint.atMs <= reconstruction.checkpoints[index - 1]!.atMs) context.addIssue({ code: 'custom', path: ['checkpoints', index, 'atMs'], message: 'checkpoint timestamps must increase' });
  }
  const relationIds = reconstruction.spatialRelations.map((relation) => relation.id);
  if (new Set(relationIds).size !== relationIds.length) context.addIssue({ code: 'custom', path: ['spatialRelations'], message: 'spatial relation ids must be unique' });
  for (const relation of reconstruction.spatialRelations) for (const checkpointId of relation.checkpointIds) if (!idSet.has(checkpointId)) context.addIssue({ code: 'custom', path: ['spatialRelations'], message: `spatial relation references unknown checkpoint ${checkpointId}` });
  for (const item of reconstruction.interactionSequence) if (!idSet.has(item.fromCheckpointId) || !idSet.has(item.toCheckpointId)) context.addIssue({ code: 'custom', path: ['interactionSequence'], message: `interaction ${item.actionId} references an unknown checkpoint` });
  if (reconstruction.terminal && !idSet.has(reconstruction.terminal.checkpointId)) context.addIssue({ code: 'custom', path: ['terminal', 'checkpointId'], message: 'terminal checkpoint is unknown' });
  if (reconstruction.replay && (!idSet.has(reconstruction.replay.checkpointId) || !idSet.has(reconstruction.replay.returnsToCheckpointId))) context.addIssue({ code: 'custom', path: ['replay'], message: 'replay checkpoints are unknown' });
  if (reconstruction.replay) {
    const replayActions = reconstruction.interactionSequence
      .map((action, index) => ({ action, index }))
      .filter(({ action }) => action.actionId === reconstruction.replay!.actionId);
    if (replayActions.length > 1) context.addIssue({ code: 'custom', path: ['interactionSequence'], message: `replay action ${reconstruction.replay.actionId} is duplicated; keep replay separate from gameplay actions` });
    for (const { action, index } of replayActions) {
      if (action.targetObjectId !== reconstruction.replay.targetObjectId
        || action.fromCheckpointId !== reconstruction.replay.checkpointId
        || action.toCheckpointId !== reconstruction.replay.returnsToCheckpointId) {
        context.addIssue({
          code: 'custom',
          path: ['interactionSequence', index],
          message: `replay action ${reconstruction.replay.actionId} conflicts with replay definition; expected ${reconstruction.replay.checkpointId} -> ${reconstruction.replay.returnsToCheckpointId}`,
        });
      }
    }
  }
  if (reconstruction.behaviorMeasurements) {
    const measurementIds = reconstruction.behaviorMeasurements.map((measurement) => measurement.id);
    if (new Set(measurementIds).size !== measurementIds.length) context.addIssue({ code: 'custom', path: ['behaviorMeasurements'], message: 'behavior measurement ids must be unique' });
    for (const [index, measurement] of reconstruction.behaviorMeasurements.entries()) {
      if (!idSet.has(measurement.fromCheckpointId) || !idSet.has(measurement.toCheckpointId)) context.addIssue({ code: 'custom', path: ['behaviorMeasurements', index], message: `behavior measurement ${measurement.id} references an unknown checkpoint` });
      for (const checkpointId of measurement.sourceCheckpointIds) if (!idSet.has(checkpointId)) context.addIssue({ code: 'custom', path: ['behaviorMeasurements', index, 'sourceCheckpointIds'], message: `behavior measurement ${measurement.id} references an unknown source checkpoint` });
    }
  }
  if (reconstruction.status === 'READY') {
    if (reconstruction.blockers.length > 0 || reconstruction.unknowns.length > 0) context.addIssue({ code: 'custom', path: ['status'], message: 'READY reconstruction cannot retain blockers or unknowns' });
    for (const phase of ['ready', 'input', 'interaction', 'terminal', 'replay'] as const) if (!reconstruction.checkpoints.some((checkpoint) => checkpoint.phase === phase)) context.addIssue({ code: 'custom', path: ['checkpoints'], message: `READY reconstruction is missing phase ${phase}` });
    if (reconstruction.spatialRelations.length === 0 || reconstruction.interactionSequence.length === 0) context.addIssue({ code: 'custom', path: ['status'], message: 'READY reconstruction requires spatial and interaction rules' });
    if (!reconstruction.terminal || !reconstruction.terminal.causeVisible || !reconstruction.terminal.settlementVisible) context.addIssue({ code: 'custom', path: ['terminal'], message: 'READY reconstruction requires visible terminal cause and settlement' });
    if (!reconstruction.replay) context.addIssue({ code: 'custom', path: ['replay'], message: 'READY reconstruction requires a replay rule' });
  }
  if (reconstruction.status === 'BLOCKED' && reconstruction.blockers.length === 0 && reconstruction.unknowns.length === 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'BLOCKED reconstruction requires a blocker or unknown' });
});
export type ReferenceLevelReconstruction = z.infer<typeof ReferenceLevelReconstructionSchema>;

export const ReferenceLevelImplementationContractSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('reference-level-implementation-contract'),
  targetRunId: Text,
  targetGame: Text,
  workspace: AbsolutePath,
  sourceReconstruction: EvidenceFile,
  requiredObjects: z.array(z.object({ semanticId: Text, role: ReferenceObjectRoleSchema, spawnOrder: z.number().int().nonnegative(), lifecycleOrder: z.array(ReferenceObjectLifecycleSchema).min(1) }).strict()),
  checkpointSequence: z.array(z.object({ order: z.number().int().positive(), id: Text, phase: ReferenceLevelPhaseSchema, requiredVisibleObjectIds: z.array(Text), visibleFeedbackIds: z.array(Text) }).strict()),
  placementRules: z.array(z.object({ checkpointId: Text, semanticId: Text }).extend(PlacementSignatureSchema.shape).strict()),
  spatialRelations: z.array(SpatialRelationRecordSchema.omit({ observed: true })),
  interactionSequence: z.array(InteractionStepSchema),
  cameraSequence: z.array(z.object({ order: z.number().int().positive(), checkpointId: Text, mode: ReferenceCameraModeSchema, focusObjectRole: ReferenceObjectRoleSchema }).strict()),
  terminal: z.object({ checkpointId: Text, result: Text, causeVisible: z.literal(true), settlementVisible: z.literal(true) }).strict().nullable(),
  replay: z.object({ checkpointId: Text, actionId: Text, targetObjectId: Text, returnsToCheckpointId: Text }).strict().nullable(),
  /** Frozen behavior goals for Builder/QA. Raw source bounds and timestamps
   * remain in the research reconstruction and are never projected here. */
  behaviorMeasurements: z.array(ReferenceBehaviorTargetSchema).optional(),
  runtimeProbe: z.object({ globalName: z.literal('__REFERENCE_LEVEL_TEST__'), readOnly: z.literal(true), methods: z.tuple([z.literal('getSnapshot'), z.literal('getNaturalInputTarget')]) }).strict(),
  originalityBoundary: z.object({
    sourceCoordinatesExposedToBuilder: z.literal(false),
    mustBeOriginal: z.tuple([z.literal('code'), z.literal('assets'), z.literal('names-and-text'), z.literal('ui-expression'), z.literal('audio'), z.literal('raw-tuning-values')]),
  }).strict(),
  status: z.enum(['READY', 'BLOCKED']),
  blockers: z.array(Text),
  createdAt: z.string().datetime(),
}).strict().superRefine((contract, context) => {
  const objectIds = new Set(contract.requiredObjects.map((object) => object.semanticId));
  const checkpointIds = new Set(contract.checkpointSequence.map((checkpoint) => checkpoint.id));
  if (new Set(contract.checkpointSequence.map((checkpoint) => checkpoint.id)).size !== contract.checkpointSequence.length) context.addIssue({ code: 'custom', path: ['checkpointSequence'], message: 'checkpoint ids must be unique' });
  for (const [index, checkpoint] of contract.checkpointSequence.entries()) if (checkpoint.order !== index + 1) context.addIssue({ code: 'custom', path: ['checkpointSequence', index, 'order'], message: 'checkpoint order must be contiguous' });
  if (contract.status === 'READY' && (contract.blockers.length > 0 || contract.requiredObjects.length === 0 || contract.checkpointSequence.length === 0 || contract.placementRules.length === 0 || contract.spatialRelations.length === 0 || contract.interactionSequence.length === 0 || !contract.terminal || !contract.replay)) context.addIssue({ code: 'custom', path: ['status'], message: 'READY implementation contracts require complete semantic level topology and no blockers' });
  if (contract.status === 'READY') {
    for (const relation of contract.spatialRelations) if (!objectIds.has(relation.fromObjectId) || !objectIds.has(relation.toObjectId)) context.addIssue({ code: 'custom', path: ['spatialRelations'], message: `relation ${relation.id} must bind two required objects` });
    for (const placement of contract.placementRules) if (!checkpointIds.has(placement.checkpointId) || !objectIds.has(placement.semanticId)) context.addIssue({ code: 'custom', path: ['placementRules'], message: 'placement rules must bind known checkpoints and objects' });
    for (const action of contract.interactionSequence) if (!checkpointIds.has(action.fromCheckpointId) || !checkpointIds.has(action.toCheckpointId) || !objectIds.has(action.targetObjectId)) context.addIssue({ code: 'custom', path: ['interactionSequence'], message: `action ${action.actionId} must bind known checkpoints and target` });
    if (contract.behaviorMeasurements) {
      const measurementIds = new Set<string>();
      for (const [index, measurement] of contract.behaviorMeasurements.entries()) {
        if (measurementIds.has(measurement.id)) context.addIssue({ code: 'custom', path: ['behaviorMeasurements', index, 'id'], message: `behavior measurement id ${measurement.id} is duplicated` });
        measurementIds.add(measurement.id);
        if (!checkpointIds.has(measurement.fromCheckpointId) || !checkpointIds.has(measurement.toCheckpointId)) context.addIssue({ code: 'custom', path: ['behaviorMeasurements', index], message: `behavior measurement ${measurement.id} must bind known checkpoints` });
        for (const objectId of [measurement.subjectObjectId, measurement.relatedObjectId]) if (objectId !== null && !objectIds.has(objectId)) context.addIssue({ code: 'custom', path: ['behaviorMeasurements', index], message: `behavior measurement ${measurement.id} references unknown object ${objectId}` });
        if (measurement.acceptanceRange.min > measurement.expectedRange.min || measurement.acceptanceRange.max < measurement.expectedRange.max) context.addIssue({ code: 'custom', path: ['behaviorMeasurements', index, 'acceptanceRange'], message: `behavior measurement ${measurement.id} acceptance range cannot be narrower than its expected range` });
      }
    }
  }
  if (contract.status === 'BLOCKED' && contract.blockers.length === 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'BLOCKED implementation contracts require blockers' });
});
export type ReferenceLevelImplementationContract = z.infer<typeof ReferenceLevelImplementationContractSchema>;

/** Identity read from the level data actually loaded by the running game.
 * This is an implementation binding, never independent visual proof. */
export const ReferenceLevelRuntimeBindingSchema = z.object({
  runtimeDataHash: Sha256,
  contractHash: Sha256,
  resolutionHash: Sha256,
  dataPath: RunRelativePath,
}).strict();

export const ReferenceLevelRuntimeTraceSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('reference-level-runtime-trace'),
  targetRunId: Text,
  targetGame: Text,
  workspace: AbsolutePath,
  contractHash: Sha256,
  buildHash: Sha256,
  viewport: Viewport.extend({ label: Text }).strict(),
  startedFromReset: z.boolean(),
  naturalInputOnly: z.boolean(),
  actions: z.array(z.object({ order: z.number().int().positive(), actionId: Text, kind: ReferenceInputKindSchema.exclude(['none']), targetObjectId: Text, naturalInput: z.boolean(), stateChanged: z.boolean(), observedCheckpointId: Text }).strict()),
  checkpoints: z.array(z.object({
    sourceCheckpointId: Text,
    runtimeBinding: ReferenceLevelRuntimeBindingSchema.optional(),
    capturedAtMs: z.number().nonnegative().optional(),
    phase: ReferenceLevelPhaseSchema,
    objectStates: z.array(z.object({ semanticId: Text, role: ReferenceObjectRoleSchema, lifecycle: ReferenceObjectLifecycleSchema, visible: z.boolean(), placement: PlacementSignatureSchema.optional(), boundsNormalized: NormalizedBounds.optional(), coordinateSpace: z.enum(['screen-normalized', 'world-relative']).optional() }).strict()),
    observedRelationIds: z.array(Text),
    cameraMode: ReferenceCameraModeSchema,
    visibleFeedbackIds: z.array(Text),
  }).strict()),
  observedMeasurements: z.array(RuntimeMeasurementSchema).optional(),
  terminal: z.object({ reached: z.boolean(), result: Text, causeVisible: z.boolean(), settlementVisible: z.boolean() }).strict(),
  replay: z.object({ actionId: Text, returnedToCheckpointId: Text, naturalInput: z.boolean() }).strict(),
  screenshots: z.array(EvidenceFile).min(1),
  trace: EvidenceFile,
  reviewer: z.enum(['QAAgent', 'HumanReviewer']),
  authorIndependent: z.literal(true),
  observedAt: z.string().datetime(),
}).strict();
export type ReferenceLevelRuntimeTrace = z.infer<typeof ReferenceLevelRuntimeTraceSchema>;

export const ReferenceLevelComparisonGateSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('reference-level-comparison-gate'),
  targetRunId: Text,
  targetGame: Text,
  contractHash: Sha256,
  buildHash: Sha256,
  passed: z.boolean(),
  blockers: z.array(Text),
  checkedObjectIds: z.array(Text),
  checkedCheckpointIds: z.array(Text),
  checkedPlacementRuleIds: z.array(Text),
  checkedRelationIds: z.array(Text),
  checkedActionIds: z.array(Text),
  comparisonStatus: z.enum(['CONFORMING', 'DIFFERENT', 'INSUFFICIENT']).optional(),
  measurementResults: z.array(z.object({
    measurementId: Text,
    result: z.enum(['CONFORMING', 'DIFFERENT', 'INSUFFICIENT']),
    expectedRange: MeasurementRangeSchema,
    actualRange: MeasurementRangeSchema.optional(),
  evidence: z.array(EvidenceFile),
    reason: Text,
  }).strict()).optional(),
  checkedAt: z.string().datetime(),
}).strict().superRefine((gate, context) => {
  if (gate.passed !== (gate.blockers.length === 0)) context.addIssue({ code: 'custom', path: ['passed'], message: 'comparison status must match blockers' });
  if (gate.measurementResults) {
    const ids = gate.measurementResults.map((result) => result.measurementId);
    if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['measurementResults'], message: 'measurement result ids must be unique' });
    if (gate.comparisonStatus === 'CONFORMING' && gate.measurementResults.some((result) => result.result !== 'CONFORMING')) context.addIssue({ code: 'custom', path: ['comparisonStatus'], message: 'CONFORMING requires every measurement result to conform' });
    if (gate.comparisonStatus === 'DIFFERENT' && !gate.measurementResults.some((result) => result.result === 'DIFFERENT')) context.addIssue({ code: 'custom', path: ['comparisonStatus'], message: 'DIFFERENT requires a measured difference' });
    if (gate.comparisonStatus === 'INSUFFICIENT' && !gate.measurementResults.some((result) => result.result === 'INSUFFICIENT')) context.addIssue({ code: 'custom', path: ['comparisonStatus'], message: 'INSUFFICIENT requires missing or unresolved evidence' });
  }
});
export type ReferenceLevelComparisonGate = z.infer<typeof ReferenceLevelComparisonGateSchema>;
