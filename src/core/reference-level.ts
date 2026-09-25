import { ReferenceFrameManifestSchema, ReferenceLevelComparisonGateSchema, ReferenceLevelImplementationContractSchema, ReferenceLevelReconstructionSchema, ReferenceLevelRuntimeTraceSchema, type ReferenceLevelComparisonGate, type ReferenceLevelImplementationContract, type ReferenceLevelReconstruction, type ReferenceLevelRuntimeTrace } from '../schemas/reference-recording.js';
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
  for (let index = 1; index < frameManifest.frames.length; index += 1) {
    const previous = frameManifest.frames[index - 1]!;
    const current = frameManifest.frames[index]!;
    if (current.actualMs <= previous.actualMs) blockers.push(`reference-level:frame-actual-time-not-monotonic:${previous.id}:${current.id}`);
  }
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
  const frameGaps = frameManifest.frames.slice(1).map((frame, index) => frame.actualMs - frameManifest.frames[index]!.actualMs).filter((gap) => gap > 0);
  const halfFrameInterval = frameGaps.length > 0 ? Math.max(1, Math.max(...frameGaps) / 2) : Math.max(1, 500 / frameManifest.extraction.samplingFps);
  const checkpointById = new Map(reconstruction.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
  const objectAt = (checkpointId: string, objectId: string) => checkpointById.get(checkpointId)?.objects.find((object) => object.semanticId === objectId);
  const centerDistance = (left: { boundsNormalized: { x: number; y: number; width: number; height: number } }, right: { boundsNormalized: { x: number; y: number; width: number; height: number } }, aspectRatio: number) => {
    const leftCenter = { x: left.boundsNormalized.x + left.boundsNormalized.width / 2, y: left.boundsNormalized.y + left.boundsNormalized.height / 2 };
    const rightCenter = { x: right.boundsNormalized.x + right.boundsNormalized.width / 2, y: right.boundsNormalized.y + right.boundsNormalized.height / 2 };
    return Math.hypot(leftCenter.x - rightCenter.x, (leftCenter.y - rightCenter.y) * aspectRatio);
  };
  for (const measurement of reconstruction.behaviorMeasurements ?? []) {
    const from = checkpointById.get(measurement.fromCheckpointId);
    const to = checkpointById.get(measurement.toCheckpointId);
    if (!from || !to) continue;
    if (!measurement.sourceCheckpointIds.includes(from.id) || !measurement.sourceCheckpointIds.includes(to.id)) blockers.push(`reference-level:measurement-checkpoint-provenance:${measurement.id}`);
    if (!measurement.sourceFrameIds.some((frameId) => from.sourceFrameIds.includes(frameId)) || !measurement.sourceFrameIds.some((frameId) => to.sourceFrameIds.includes(frameId))) blockers.push(`reference-level:measurement-frame-provenance:${measurement.id}`);
    const citedFrames = measurement.sourceFrameIds.map((frameId) => frames.get(frameId));
    if (citedFrames.some((frame) => !frame)) blockers.push(`reference-level:measurement-frame-unbound:${measurement.id}`);
    const actualTimes = citedFrames.filter((frame): frame is NonNullable<typeof frame> => frame !== undefined).map((frame) => frame.actualMs);
    if (new Set(measurement.sourceFrameIds).size !== measurement.sourceFrameIds.length) blockers.push(`reference-level:measurement-duplicate-frame:${measurement.id}`);
    if (actualTimes.some((time, index) => index > 0 && time <= actualTimes[index - 1]!)) blockers.push(`reference-level:measurement-frame-order:${measurement.id}`);
    if (measurement.status !== 'OBSERVED') {
      blockers.push(`reference-level:measurement-not-observed:${measurement.id}`);
      continue;
    }
    if (measurement.observedRange === null || measurement.uncertainty === null) continue;
    if (measurement.kind === 'checkpoint-interval' && measurement.uncertainty < halfFrameInterval) blockers.push(`reference-level:measurement-uncertainty-too-precise:${measurement.id}`);
    const fromFrame = measurement.sourceFrameIds.map((frameId) => frames.get(frameId)).find((frame) => frame !== undefined && from.sourceFrameIds.includes(frame.id));
    const toFrame = measurement.sourceFrameIds.map((frameId) => frames.get(frameId)).find((frame) => frame !== undefined && to.sourceFrameIds.includes(frame.id));
    if (!fromFrame || !toFrame) continue;
    if (toFrame.actualMs <= fromFrame.actualMs) blockers.push(`reference-level:measurement-time-order:${measurement.id}`);
    if (measurement.kind === 'checkpoint-interval') {
      const observed = toFrame.actualMs - fromFrame.actualMs;
      if (measurement.unit !== 'ms' || observed < measurement.observedRange.min || observed > measurement.observedRange.max) blockers.push(`reference-level:measurement-range-does-not-cover-source:${measurement.id}`);
    } else if (measurement.coordinateSpace !== 'screen-normalized') {
      blockers.push(`reference-level:measurement-coordinate-space-unsupported:${measurement.id}`);
    } else {
      const fromSubject = measurement.subjectObjectId ? objectAt(from.id, measurement.subjectObjectId) : undefined;
      const fromRelated = measurement.relatedObjectId ? objectAt(from.id, measurement.relatedObjectId) : undefined;
      const toSubject = measurement.subjectObjectId ? objectAt(to.id, measurement.subjectObjectId) : undefined;
      const toRelated = measurement.relatedObjectId ? objectAt(to.id, measurement.relatedObjectId) : undefined;
      if (!fromSubject || !fromRelated || !toSubject || !toRelated) {
        blockers.push(`reference-level:measurement-object-provenance:${measurement.id}`);
      } else if (from.camera.mode !== to.camera.mode) {
        blockers.push(`reference-level:measurement-camera-transition:${measurement.id}`);
      } else {
        const observed = Math.abs(centerDistance(toSubject, toRelated, frameManifest.source.height / frameManifest.source.width) - centerDistance(fromSubject, fromRelated, frameManifest.source.height / frameManifest.source.width));
        if (measurement.unit !== 'normalized-distance' || observed < measurement.observedRange.min || observed > measurement.observedRange.max) blockers.push(`reference-level:measurement-range-does-not-cover-source:${measurement.id}`);
      }
    }
  }
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

function measurementAcceptanceRange(observed: { min: number; max: number }, uncertainty: number) {
  const lower = observed.min - uncertainty;
  const upper = observed.max + uncertainty;
  return {
    min: Math.max(0, lower),
    max: Math.max(0, upper),
  };
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
  const sourceMeasurements = reconstruction.behaviorMeasurements;
  if (sourceMeasurements !== undefined && sourceMeasurements.length < 2) blockers.push('behavior-measurements:at-least-two-required');
  const behaviorMeasurements = sourceMeasurements?.map((measurement) => {
    if (measurement.status !== 'OBSERVED' || measurement.observedRange === null || measurement.uncertainty === null) {
      blockers.push(`behavior-measurement-unusable:${measurement.id}`);
      return undefined;
    }
    if (measurement.coordinateSpace === 'unknown') {
      blockers.push(`behavior-measurement-coordinate-space-unknown:${measurement.id}`);
      return undefined;
    }
    return {
      id: measurement.id,
      measurementId: measurement.id,
      kind: measurement.kind,
      unit: measurement.unit,
      fromCheckpointId: measurement.fromCheckpointId,
      toCheckpointId: measurement.toCheckpointId,
      subjectObjectId: measurement.subjectObjectId,
      relatedObjectId: measurement.relatedObjectId,
      expectedRange: measurement.observedRange,
      acceptanceRange: measurementAcceptanceRange(measurement.observedRange, measurement.uncertainty),
      uncertainty: measurement.uncertainty,
      coordinateSpace: measurement.coordinateSpace,
      sourceViewport: reconstruction.source.viewport,
      applicability: measurement.applicability,
      sourceFrameIds: measurement.sourceFrameIds,
      source: sourceReconstruction,
    };
  }).filter((measurement): measurement is NonNullable<typeof measurement> => measurement !== undefined);
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
    ...(behaviorMeasurements && behaviorMeasurements.length > 0 ? { behaviorMeasurements } : {}),
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
  const measurementResults: NonNullable<ReferenceLevelComparisonGate['measurementResults']> = [];
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

  if (contract.behaviorMeasurements !== undefined) {
    const observed = new Map((trace.observedMeasurements ?? []).map((measurement) => [measurement.measurementId, measurement]));
    for (const expected of contract.behaviorMeasurements) {
      const actual = observed.get(expected.measurementId);
      if (!actual || actual.status !== 'MEASURED' || actual.actualRange === undefined || actual.unit !== expected.unit
        || actual.subjectObjectId !== expected.subjectObjectId || actual.relatedObjectId !== expected.relatedObjectId) {
        measurementResults.push({ measurementId: expected.measurementId, result: 'INSUFFICIENT', expectedRange: expected.acceptanceRange, evidence: actual?.evidence ?? [], reason: actual?.basis ?? '候选运行没有提供该指标的真实测量区间。' });
        blockers.push(`reference-level:measurement-insufficient:${expected.measurementId}`);
        continue;
      }
      const outside = actual.actualRange.max < expected.acceptanceRange.min || actual.actualRange.min > expected.acceptanceRange.max;
      const inside = actual.actualRange.min >= expected.acceptanceRange.min && actual.actualRange.max <= expected.acceptanceRange.max;
      if (inside) {
        measurementResults.push({ measurementId: expected.measurementId, result: 'CONFORMING', expectedRange: expected.acceptanceRange, actualRange: actual.actualRange, evidence: actual.evidence, reason: '候选区间完整落在预先冻结的参考接受区间内。' });
      } else if (outside) {
        measurementResults.push({ measurementId: expected.measurementId, result: 'DIFFERENT', expectedRange: expected.acceptanceRange, actualRange: actual.actualRange, evidence: actual.evidence, reason: '候选区间与预先冻结的参考接受区间完全分离。' });
        blockers.push(`reference-level:measurement-different:${expected.measurementId}`);
      } else {
        measurementResults.push({ measurementId: expected.measurementId, result: 'INSUFFICIENT', expectedRange: expected.acceptanceRange, actualRange: actual.actualRange, evidence: actual.evidence, reason: '候选区间与接受区间重叠，现有采样分辨率不足以判定。' });
        blockers.push(`reference-level:measurement-insufficient:${expected.measurementId}`);
      }
    }
  }

  const comparisonStatus = measurementResults.length === 0
    ? undefined
    : measurementResults.some((result) => result.result === 'DIFFERENT')
      ? 'DIFFERENT' as const
      : measurementResults.some((result) => result.result === 'INSUFFICIENT')
        ? 'INSUFFICIENT' as const
        : 'CONFORMING' as const;

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
    ...(comparisonStatus ? { comparisonStatus, measurementResults } : {}),
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
    const measurementEvidence = (trace.observedMeasurements ?? []).flatMap((measurement) => measurement.evidence);
    for (const evidence of [...trace.screenshots, trace.trace, ...measurementEvidence]) if (!await options.verifyEvidenceFile(evidence)) blockers.push(`reference-level:evidence-invalid:${evidence.path}`);
  }
  return ReferenceLevelComparisonGateSchema.parse({ ...base, passed: blockers.length === 0, blockers: [...new Set(blockers)], checkedAt: new Date().toISOString() });
}

/** Render the bounded comparison in product language. This is deliberately a
 * run-local Markdown artifact, not a second reporting system. */
export function renderReferenceLevelComparisonReport(contractValue: unknown, traceValue: unknown, gateValue: unknown, frameManifestValue?: unknown): string {
  const contract = ReferenceLevelImplementationContractSchema.parse(contractValue);
  const trace = ReferenceLevelRuntimeTraceSchema.parse(traceValue);
  const gate = ReferenceLevelComparisonGateSchema.parse(gateValue);
  const frames = frameManifestValue === undefined ? new Map<string, { path: string; sha256: string; actualMs: number }>() : new Map(ReferenceFrameManifestSchema.parse(frameManifestValue).frames.map((frame) => [frame.id, frame]));
  const lines = [
    '# 参考玩法差异报告',
    '',
    `- 参考行为契约：${contract.sourceReconstruction.path}（${contract.sourceReconstruction.sha256}）`,
    `- 候选构建：${trace.buildHash}`,
    `- 候选视口：${trace.viewport.width}×${trace.viewport.height}（${trace.viewport.label}）`,
    `- 本地候选入口：${contract.workspace}/dist/index.html`,
    `- 正常输入：${trace.naturalInputOnly ? '是' : '否'}；从重置开始：${trace.startedFromReset ? '是' : '否'}`,
    '',
  ];
  if (gate.comparisonStatus) {
    const title = gate.comparisonStatus === 'CONFORMING' ? '有证据支持符合' : gate.comparisonStatus === 'DIFFERENT' ? '确认存在行为差异' : '证据不足，暂不能判断';
    lines.push(`## 行为测量：${gate.comparisonStatus} · ${title}`, '');
    for (const result of gate.measurementResults ?? []) {
      const target = contract.behaviorMeasurements?.find((measurement) => measurement.id === result.measurementId);
      const sourceFrames = target?.sourceFrameIds.map((id) => {
        const frame = frames.get(id);
        return frame ? `${id} (${frame.actualMs}ms, ${frame.path}, SHA-256 ${frame.sha256})` : id;
      }).join('；') ?? '未绑定源帧';
      const actual = result.actualRange ? `${result.actualRange.min}–${result.actualRange.max}` : '未采到';
      const expected = `${result.expectedRange.min}–${result.expectedRange.max}`;
      const label = result.result === 'CONFORMING' ? '符合' : result.result === 'DIFFERENT' ? '确认不同' : '证据不足';
      lines.push(`- **${result.measurementId} · ${label}**：${target?.kind ?? '未知指标'}，参考接受区间 ${expected} ${target?.unit ?? ''}，候选区间 ${actual} ${target?.unit ?? ''}。${result.reason}`);
      if (target) lines.push(`  - 适用条件：${target.applicability}；源视口 ${target.sourceViewport ? `${target.sourceViewport.width}×${target.sourceViewport.height}` : '未记录'}。`);
      lines.push(`  - 来源帧：${sourceFrames}`);
      lines.push(`  - 候选证据：${result.evidence.length > 0 ? result.evidence.map((item) => item.path).join(', ') : '缺少候选证据'}`);
      lines.push(`  - 下一步：${result.result === 'DIFFERENT' ? '检查候选实现对应的真实状态分支和响应参数。' : result.result === 'INSUFFICIENT' ? '补采对应参考帧或候选自然输入证据，再重新比较。' : '保留当前证据，继续由独立画面审查确认反馈可见性。'}`);
    }
  } else {
    lines.push('## 行为测量：未执行', '', '当前契约没有 R1 行为测量，结果只覆盖既有对象、状态、粗位置、动作顺序、终态和重玩检查。');
  }
  lines.push('', '## 工程与产品边界', '', `- 工程对照门：${gate.passed ? '通过' : '未通过'}。`, '- 该门只判断来源绑定和可测行为；换皮颜色、装饰和 UI 表达不作为玩法差异。', '- 独立画面审查和产品经理接受仍由现有 fidelity review / human playtest 门负责。');
  if (gate.blockers.length > 0) lines.push('', '## 当前阻塞', '', ...gate.blockers.map((blocker) => `- ${blocker}`));
  return `${lines.join('\n')}\n`;
}
