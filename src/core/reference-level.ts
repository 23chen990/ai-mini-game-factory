import { ReferenceFrameManifestSchema, ReferenceLevelComparisonGateSchema, ReferenceLevelImplementationContractSchema, ReferenceLevelReconstructionSchema, ReferenceLevelRuntimeTraceSchema, type ReferenceLevelImplementationContract, type ReferenceLevelReconstruction, type ReferenceLevelRuntimeTrace } from '../schemas/reference-recording.js';
import { sha256Text } from './files.js';
import { ReferenceLevelRuntimeDataSchema, type ReferenceLevelRuntimeData } from '../schemas/reference-level-runtime.js';
import { referenceLevelRuntimeDataPath } from './reference-level-runtime.js';

export function verifyReferenceLevelReconstruction(
  reconstructionValue: unknown,
  frameManifestValue: unknown,
  expected: { frameManifestSha256: string },
) {
  const reconstruction = ReferenceLevelReconstructionSchema.parse(reconstructionValue);
  const frameManifest = ReferenceFrameManifestSchema.parse(frameManifestValue);
  const blockers: string[] = [];
  if (reconstruction.targetRunId !== frameManifest.targetRunId) blockers.push('reference-level:run-mismatch');
  if (reconstruction.targetGame !== frameManifest.targetGame) blockers.push('reference-level:game-mismatch');
  if (reconstruction.workspace !== frameManifest.workspace) blockers.push('reference-level:workspace-mismatch');
  if (reconstruction.source.frameManifestPath !== 'artifacts/reference-frame-manifest.json') blockers.push('reference-level:frame-manifest-path-mismatch');
  if (reconstruction.source.frameManifestSha256 !== expected.frameManifestSha256) blockers.push('reference-level:frame-manifest-hash-mismatch');
  if (reconstruction.source.recordingSha256 !== frameManifest.source.sha256) blockers.push('reference-level:recording-hash-mismatch');
  if (reconstruction.source.viewport.width !== frameManifest.source.width || reconstruction.source.viewport.height !== frameManifest.source.height) blockers.push('reference-level:source-viewport-mismatch');
  if (frameManifest.status !== 'READY') blockers.push('reference-level:frame-manifest-not-ready');
  if (reconstruction.status !== 'READY') blockers.push(...reconstruction.blockers.map((blocker) => `reference-level:analysis-blocked:${blocker}`));

  const frames = new Map(frameManifest.frames.map((frame) => [frame.id, frame]));
  const frameTimeToleranceMs = Math.max(250, Math.ceil(2_000 / frameManifest.extraction.samplingFps));
  const roleByObject = new Map<string, string>();
  for (const checkpoint of reconstruction.checkpoints) {
    if (checkpoint.atMs > frameManifest.source.durationMs + 1_000) blockers.push(`reference-level:checkpoint-after-recording:${checkpoint.id}`);
    for (const frameId of checkpoint.sourceFrameIds) {
      const frame = frames.get(frameId);
      if (!frame) blockers.push(`reference-level:frame-unbound:${checkpoint.id}:${frameId}`);
      else if (Math.abs(frame.actualMs - checkpoint.atMs) > frameTimeToleranceMs) blockers.push(`reference-level:frame-time-mismatch:${checkpoint.id}:${frameId}`);
    }
    for (const object of checkpoint.objects) {
      const priorRole = roleByObject.get(object.semanticId);
      if (priorRole && priorRole !== object.role) blockers.push(`reference-level:object-role-drift:${object.semanticId}`);
      roleByObject.set(object.semanticId, object.role);
    }
  }
  for (const relation of reconstruction.spatialRelations) {
    for (const endpoint of [relation.fromObjectId, relation.toObjectId]) if (!roleByObject.has(endpoint)) blockers.push(`reference-level:relation-object-unbound:${relation.id}:${endpoint}`);
  }
  for (const action of reconstruction.interactionSequence) if (!roleByObject.has(action.targetObjectId)) blockers.push(`reference-level:action-target-unbound:${action.actionId}:${action.targetObjectId}`);
  if (reconstruction.replay && !roleByObject.has(reconstruction.replay.targetObjectId)) blockers.push(`reference-level:replay-target-unbound:${reconstruction.replay.actionId}:${reconstruction.replay.targetObjectId}`);
  return { passed: blockers.length === 0, blockers: [...new Set(blockers)], reconstruction, frameManifest };
}

function orderedUnique<T>(values: readonly T[]): T[] {
  const seen = new Set<T>();
  return values.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function canonicalInteractionSequence(reconstruction: ReferenceLevelReconstruction) {
  const replayActionId = reconstruction.replay?.actionId;
  const gameplayActions = replayActionId
    ? reconstruction.interactionSequence.filter((action) => action.actionId !== replayActionId)
    : reconstruction.interactionSequence;
  const ordered = [...gameplayActions].sort((left, right) => left.order - right.order);
  return gameplayActions.length === reconstruction.interactionSequence.length
    ? ordered
    : ordered.map((action, index) => ({ ...action, order: index + 1 }));
}

function positionBand(value: number, bands: readonly [string, string, string, string, string]) {
  if (value < 0.2) return bands[0];
  if (value < 0.4) return bands[1];
  if (value < 0.6) return bands[2];
  if (value < 0.8) return bands[3];
  return bands[4];
}

function extentBand(value: number): 'tiny' | 'small' | 'medium' | 'large' | 'span' {
  if (value < 0.06) return 'tiny';
  if (value < 0.16) return 'small';
  if (value < 0.32) return 'medium';
  if (value < 0.62) return 'large';
  return 'span';
}

function orientationBand(degrees: number): 'horizontal' | 'diagonal-up' | 'vertical' | 'diagonal-down' {
  const normalized = ((degrees % 180) + 180) % 180;
  if (normalized < 22.5 || normalized >= 157.5) return 'horizontal';
  if (normalized < 67.5) return 'diagonal-down';
  if (normalized < 112.5) return 'vertical';
  return 'diagonal-up';
}

export function deriveReferenceLevelImplementationContract(
  reconstructionValue: unknown,
  sourceReconstruction: { path: string; sha256: string },
): ReferenceLevelImplementationContract {
  const reconstruction = ReferenceLevelReconstructionSchema.parse(reconstructionValue);
  const firstSeen = new Map<string, { role: ReferenceLevelReconstruction['checkpoints'][number]['objects'][number]['role']; checkpointIndex: number }>();
  for (const [checkpointIndex, checkpoint] of reconstruction.checkpoints.entries()) {
    for (const object of checkpoint.objects) if (!firstSeen.has(object.semanticId)) firstSeen.set(object.semanticId, { role: object.role, checkpointIndex });
  }
  const requiredObjects = [...firstSeen.entries()]
    .sort((left, right) => left[1].checkpointIndex - right[1].checkpointIndex || left[0].localeCompare(right[0]))
    .map(([semanticId, first], spawnOrder) => ({
      semanticId,
      role: first.role,
      spawnOrder,
      lifecycleOrder: orderedUnique(reconstruction.checkpoints.flatMap((checkpoint) => checkpoint.objects.filter((object) => object.semanticId === semanticId).map((object) => object.lifecycle))),
    }));
  const blockers = [
    ...reconstruction.blockers,
    ...reconstruction.unknowns.map((unknown) => `unknown:${unknown}`),
    ...(reconstruction.spatialRelations.some((relation) => !relation.observed) ? ['unobserved-spatial-relation'] : []),
  ];
  const objectIds = new Set(requiredObjects.map((object) => object.semanticId));
  for (const relation of reconstruction.spatialRelations) {
    for (const endpoint of [relation.fromObjectId, relation.toObjectId]) if (!objectIds.has(endpoint)) blockers.push(`relation-object-unbound:${relation.id}:${endpoint}`);
  }
  for (const action of reconstruction.interactionSequence) if (!objectIds.has(action.targetObjectId)) blockers.push(`action-target-unbound:${action.actionId}:${action.targetObjectId}`);
  if (reconstruction.replay && !objectIds.has(reconstruction.replay.targetObjectId)) blockers.push(`replay-target-unbound:${reconstruction.replay.actionId}:${reconstruction.replay.targetObjectId}`);
  const checkpointSequence = reconstruction.checkpoints.map((checkpoint, index) => ({
    order: index + 1,
    id: checkpoint.id,
    phase: checkpoint.phase,
    requiredVisibleObjectIds: checkpoint.objects.filter((object) => object.visible).map((object) => object.semanticId),
    visibleFeedbackIds: checkpoint.visibleFeedback.map((feedback) => feedback.id),
  }));
  const excludedPlacementRoles = new Set(['hud', 'replay-control', 'decorative']);
  const placementRules = reconstruction.checkpoints.flatMap((checkpoint) => checkpoint.objects
    .filter((object) => object.visible && !excludedPlacementRoles.has(object.role))
    .map((object) => ({
      checkpointId: checkpoint.id,
      semanticId: object.semanticId,
      horizontalBand: positionBand(object.boundsNormalized.x + object.boundsNormalized.width / 2, ['far-left', 'left', 'center', 'right', 'far-right']),
      verticalBand: positionBand(object.boundsNormalized.y + object.boundsNormalized.height / 2, ['top', 'upper', 'middle', 'lower', 'bottom']),
      widthBand: extentBand(object.boundsNormalized.width),
      heightBand: extentBand(object.boundsNormalized.height),
      orientationBand: orientationBand(object.rotationDegrees),
    })));
  return ReferenceLevelImplementationContractSchema.parse({
    schemaVersion: 1,
    artifactType: 'reference-level-implementation-contract',
    targetRunId: reconstruction.targetRunId,
    targetGame: reconstruction.targetGame,
    workspace: reconstruction.workspace,
    sourceReconstruction,
    requiredObjects,
    checkpointSequence,
    placementRules,
    spatialRelations: reconstruction.spatialRelations.filter((relation) => relation.observed).map((relation) => ({
      id: relation.id,
      fromObjectId: relation.fromObjectId,
      relation: relation.relation,
      toObjectId: relation.toObjectId,
      checkpointIds: relation.checkpointIds,
    })),
    interactionSequence: canonicalInteractionSequence(reconstruction),
    cameraSequence: [...reconstruction.cameraSequence].sort((left, right) => left.order - right.order),
    terminal: reconstruction.terminal,
    replay: reconstruction.replay,
    runtimeProbe: { globalName: '__REFERENCE_LEVEL_TEST__', readOnly: true, methods: ['getSnapshot', 'getNaturalInputTarget'] },
    originalityBoundary: { sourceCoordinatesExposedToBuilder: false, mustBeOriginal: ['code', 'assets', 'names-and-text', 'ui-expression', 'audio', 'raw-tuning-values'] },
    status: reconstruction.status === 'READY' && blockers.length === 0 ? 'READY' : 'BLOCKED',
    blockers: [...new Set(blockers)],
    createdAt: new Date().toISOString(),
  });
}

/** Re-derive a stored Builder contract on resume so an edited or stale
 * projection cannot pass merely because it still cites the right source hash.
 * The creation timestamp is metadata and does not affect equivalence. */
export function verifyReferenceLevelImplementationContract(
  reconstructionValue: unknown,
  contractValue: unknown,
  sourceReconstruction: ReferenceLevelImplementationContract['sourceReconstruction'],
) {
  const contract = ReferenceLevelImplementationContractSchema.parse(contractValue);
  const expected = deriveReferenceLevelImplementationContract(reconstructionValue, sourceReconstruction);
  const expectedAtStoredTime = { ...expected, createdAt: contract.createdAt };
  const blockers = JSON.stringify(expectedAtStoredTime) === JSON.stringify(contract)
    ? []
    : ['reference-level:implementation-contract-derived-mismatch'];
  return { passed: blockers.length === 0, blockers };
}

export function evaluateReferenceLevelRuntimeTrace(contractValue: unknown, traceValue: unknown, runtimeDataValue?: unknown) {
  const contract = ReferenceLevelImplementationContractSchema.parse(contractValue);
  const trace = ReferenceLevelRuntimeTraceSchema.parse(traceValue);
  const expectedContractHash = sha256Text(JSON.stringify(contract));
  const blockers: string[] = [];
  if (trace.targetRunId !== contract.targetRunId) blockers.push('reference-level:trace-run-mismatch');
  if (trace.targetGame !== contract.targetGame) blockers.push('reference-level:trace-game-mismatch');
  if (trace.workspace !== contract.workspace) blockers.push('reference-level:trace-workspace-mismatch');
  if (trace.contractHash !== expectedContractHash) blockers.push('reference-level:trace-contract-hash-mismatch');
  if (contract.status !== 'READY') blockers.push('reference-level:implementation-contract-not-ready');
  if (!trace.startedFromReset) blockers.push('reference-level:trace-not-started-from-reset');
  if (!trace.naturalInputOnly || trace.actions.some((action) => !action.naturalInput)) blockers.push('reference-level:trace-used-non-natural-input');
  if (runtimeDataValue !== undefined) {
    const data = ReferenceLevelRuntimeDataSchema.parse(runtimeDataValue);
    const { runtimeDataHash, ...payload } = data;
    if (runtimeDataHash !== sha256Text(JSON.stringify(payload))) blockers.push('reference-level:runtime-data-hash-mismatch');
    if (data.sourceContract.sha256 !== expectedContractHash) blockers.push('reference-level:runtime-data-contract-mismatch');
    if (data.targetRunId !== contract.targetRunId || data.targetGame !== contract.targetGame || data.workspace !== contract.workspace) blockers.push('reference-level:runtime-data-target-mismatch');
    if (trace.checkpoints.length === 0) blockers.push('reference-level:runtime-binding-unobserved');
    for (const checkpoint of trace.checkpoints) {
      const binding = checkpoint.runtimeBinding;
      if (!binding) blockers.push(`reference-level:runtime-binding-missing:${checkpoint.sourceCheckpointId}`);
      else if (binding.runtimeDataHash !== runtimeDataHash || binding.contractHash !== expectedContractHash
        || binding.resolutionHash !== data.production.resolutionHash || binding.dataPath !== referenceLevelRuntimeDataPath(data.production.runtime)) {
        blockers.push(`reference-level:runtime-binding-mismatch:${checkpoint.sourceCheckpointId}`);
      }
    }
  }

  const checkedObjectIds: string[] = [];
  for (const object of contract.requiredObjects) {
    const observations = trace.checkpoints.flatMap((checkpoint) => checkpoint.objectStates.filter((candidate) => candidate.semanticId === object.semanticId));
    if (observations.length === 0) {
      blockers.push(`reference-level:object-missing:${object.semanticId}`);
      continue;
    }
    if (observations.some((candidate) => candidate.role !== object.role)) blockers.push(`reference-level:object-role-mismatch:${object.semanticId}`);
    const lifecycle = orderedUnique(observations.map((candidate) => candidate.lifecycle));
    for (const required of object.lifecycleOrder) if (!lifecycle.includes(required)) blockers.push(`reference-level:lifecycle-missing:${object.semanticId}:${required}`);
    if (!blockers.some((blocker) => blocker.includes(`:${object.semanticId}`))) checkedObjectIds.push(object.semanticId);
  }

  const checkpointsById = new Map<string, ReferenceLevelRuntimeTrace['checkpoints']>();
  for (const checkpoint of trace.checkpoints) checkpointsById.set(checkpoint.sourceCheckpointId, [...(checkpointsById.get(checkpoint.sourceCheckpointId) ?? []), checkpoint]);
  const checkedCheckpointIds: string[] = [];
  for (const expected of contract.checkpointSequence) {
    const candidates = checkpointsById.get(expected.id) ?? [];
    const matching = candidates.find((candidate) => candidate.phase === expected.phase
      && expected.requiredVisibleObjectIds.every((id) => candidate.objectStates.some((object) => object.semanticId === id && object.visible))
      && expected.visibleFeedbackIds.every((id) => candidate.visibleFeedbackIds.includes(id)));
    if (!matching) blockers.push(`reference-level:checkpoint-mismatch:${expected.id}`);
    else checkedCheckpointIds.push(expected.id);
  }

  const checkedPlacementRuleIds: string[] = [];
  for (const expected of contract.placementRules) {
    const id = `${expected.checkpointId}:${expected.semanticId}`;
    const observed = (checkpointsById.get(expected.checkpointId) ?? []).flatMap((checkpoint) => checkpoint.objectStates).find((object) => object.semanticId === expected.semanticId && object.visible);
    if (!observed?.placement) blockers.push(`reference-level:placement-missing:${id}`);
    else if (observed.placement.horizontalBand !== expected.horizontalBand
      || observed.placement.verticalBand !== expected.verticalBand
      || observed.placement.widthBand !== expected.widthBand
      || observed.placement.heightBand !== expected.heightBand
      || observed.placement.orientationBand !== expected.orientationBand) blockers.push(`reference-level:placement-mismatch:${id}`);
    else checkedPlacementRuleIds.push(id);
  }

  const observedRelations = new Set(trace.checkpoints.flatMap((checkpoint) => checkpoint.observedRelationIds));
  const checkedRelationIds: string[] = [];
  for (const relation of contract.spatialRelations) {
    if (!observedRelations.has(relation.id)) blockers.push(`reference-level:relation-missing:${relation.id}`);
    else checkedRelationIds.push(relation.id);
  }

  const actions = [...trace.actions].sort((left, right) => left.order - right.order);
  const checkedActionIds: string[] = [];
  for (const [index, expected] of [...contract.interactionSequence].sort((left, right) => left.order - right.order).entries()) {
    const actual = actions[index];
    if (!actual || actual.actionId !== expected.actionId || actual.kind !== expected.kind || actual.targetObjectId !== expected.targetObjectId) blockers.push(`reference-level:action-mismatch:${expected.actionId}`);
    else if (!actual.stateChanged) blockers.push(`reference-level:action-no-state-change:${expected.actionId}`);
    else if (actual.observedCheckpointId !== expected.toCheckpointId) blockers.push(`reference-level:action-checkpoint-mismatch:${expected.actionId}:${expected.toCheckpointId}`);
    else checkedActionIds.push(expected.actionId);
  }

  for (const camera of contract.cameraSequence) {
    const observed = (checkpointsById.get(camera.checkpointId) ?? []).find((checkpoint) => checkpoint.cameraMode === camera.mode);
    if (!observed) blockers.push(`reference-level:camera-mismatch:${camera.checkpointId}`);
  }
  if (!trace.terminal.reached) blockers.push('reference-level:terminal-not-reached');
  if (!contract.terminal) blockers.push('reference-level:terminal-contract-missing');
  else if (trace.terminal.result !== contract.terminal.result) blockers.push('reference-level:terminal-result-mismatch');
  if (!trace.terminal.causeVisible) blockers.push('reference-level:terminal-cause-not-visible');
  if (!trace.terminal.settlementVisible) blockers.push('reference-level:settlement-not-visible');
  if (!contract.replay || !trace.replay.naturalInput || trace.replay.actionId !== contract.replay.actionId || trace.replay.returnedToCheckpointId !== contract.replay.returnsToCheckpointId) blockers.push('reference-level:replay-mismatch');

  return ReferenceLevelComparisonGateSchema.parse({
    schemaVersion: 1,
    artifactType: 'reference-level-comparison-gate',
    targetRunId: contract.targetRunId,
    targetGame: contract.targetGame,
    contractHash: expectedContractHash,
    buildHash: trace.buildHash,
    passed: blockers.length === 0,
    blockers: [...new Set(blockers)],
    checkedObjectIds,
    checkedCheckpointIds,
    checkedPlacementRuleIds,
    checkedRelationIds,
    checkedActionIds,
    checkedAt: new Date().toISOString(),
  });
}

export async function verifyReferenceLevelRuntimeTrace(
  contractValue: unknown,
  traceValue: unknown,
  options: { verifyEvidenceFile?: (evidence: { path: string; sha256: string }) => Promise<boolean>; runtimeData?: ReferenceLevelRuntimeData } = {},
) {
  const contract = ReferenceLevelImplementationContractSchema.parse(contractValue);
  const trace = ReferenceLevelRuntimeTraceSchema.parse(traceValue);
  const base = evaluateReferenceLevelRuntimeTrace(contract, trace, options.runtimeData);
  const blockers = [...base.blockers];
  if (options.verifyEvidenceFile) {
    for (const evidence of [...trace.screenshots, trace.trace]) if (!await options.verifyEvidenceFile(evidence)) blockers.push(`reference-level:evidence-invalid:${evidence.path}`);
  }
  return ReferenceLevelComparisonGateSchema.parse({ ...base, passed: blockers.length === 0, blockers: [...new Set(blockers)], checkedAt: new Date().toISOString() });
}
