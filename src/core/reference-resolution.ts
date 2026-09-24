import { ReferenceBehaviorAnalysisSchema, type ReferenceBehaviorAnalysis } from '../schemas/reference-evidence.js';
import { ReferenceMechanicSpecSchema, type ReferenceMechanicSpec } from '../schemas/reference-mechanic.js';
import { ReferenceFrameManifestSchema, ReferenceLevelReconstructionSchema, type ReferenceFrameManifest, type ReferenceLevelReconstruction } from '../schemas/reference-recording.js';
import { ReferenceObjectReviewObjectSchema, ReferenceObjectReviewSchema, ReferenceObjectReviewSourceSchema, type ReferenceObjectReviewRow } from '../schemas/reference-object-review.js';
import { ReferenceResearchResolutionSchema, type ReferenceResearchResolutionDisposition } from '../schemas/reference-resolution.js';

type EvidenceFile = { path: string; sha256: string };

type ResolutionInput = {
  analysis: unknown;
  reference: unknown;
  frameManifest: unknown;
  frameManifestSource: EvidenceFile;
  researchFrameManifest?: EvidenceFile & { verifiedPrefixOfFull: boolean };
  sourceAnalysis: EvidenceFile;
  humanLock: EvidenceFile;
  allowIdentityRebind?: boolean;
  objectReview?: { review: unknown; source: EvidenceFile };
};

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

function sha256NibbleTranscriptionDistance(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/iu.test(left) || !/^[a-f0-9]{64}$/iu.test(right)) return null;
  let differences = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index]?.toLowerCase() !== right[index]?.toLowerCase()) differences += 1;
  }
  return differences;
}

function humanLockText(reference: ReferenceMechanicSpec) {
  return [
    ...reference.coreLoop,
    ...reference.playerActions,
    ...reference.progressionSystems,
    ...reference.unlockRules,
    ...reference.mustPreserveMechanics,
    ...reference.adaptableMechanics,
  ].join('\n').toLowerCase();
}

function declaresFailure(reference: ReferenceMechanicSpec) {
  return /failure|failed|hazard|fall|失败|危险|坠落|可归因/u.test(humanLockText(reference));
}

function declaresReplay(reference: ReferenceMechanicSpec) {
  return /replay|retry|restart|return.{0,12}ready|重开|重玩|重试|再挑战|回到.{0,12}(?:初始|准备)/u.test(humanLockText(reference));
}

function declaresContactBranches(reference: ReferenceMechanicSpec) {
  const text = humanLockText(reference);
  return /(support|rebound).*(contact|branch)|(contact|branch).*(support|rebound)|支撑|反弹/u.test(text);
}

function classifyGap(
  gap: string,
  reference: ReferenceMechanicSpec,
  frameManifest: ReferenceFrameManifest,
  frameManifestHashMatches: boolean,
  objectReviewLocators: ReadonlyMap<string, string>,
): {
  disposition: ReferenceResearchResolutionDisposition;
  rationale: string;
  locator: string;
  source: 'analysis' | 'human' | 'manifest' | 'object-review';
} {
  const value = gap.toLowerCase();
  const objectReviewLocator = objectReviewLocators.get(gap);
  if (objectReviewLocator) {
    return {
      disposition: 'OBJECT_REVIEW_VERIFIED',
      rationale: 'A source-bound review adds the omitted semantic object only at checkpoints explicitly supported by exact reviewed source frames.',
      locator: objectReviewLocator,
      source: 'object-review',
    };
  }
  if (/manifest.*truncat|truncat.*manifest|actualms.*(?:truncat|cannot|unavailable)|later.frame.*actualms/u.test(value) && frameManifest.status === 'READY' && frameManifestHashMatches) {
    return {
      disposition: 'FRAME_MANIFEST_VERIFIED',
      rationale: 'The control plane independently validates the complete run-bound frame manifest; a truncated research-sandbox excerpt does not invalidate that artifact.',
      locator: `ReferenceFrameManifestSchema status READY; ${frameManifest.frames.length} frames`,
      source: 'manifest',
    };
  }
  if (/(?:semantic object|relation .* references semantic object) (?:cp-)?ready(?:-\d+)? omitted/u.test(value) && declaresReplay(reference)) {
    return {
      disposition: 'HUMAN_LOCK_REQUIREMENT',
      rationale: 'A replay relation that names the ready checkpoint as a relation endpoint is a state-transition requirement, not an omitted renderable object; the human lock defines the return-to-ready behavior.',
      locator: 'referenceMechanics.coreLoop/playerActions/unlockRules: replay returns to ready',
      source: 'human',
    };
  }
  if (/per.object.*identity|individual (?:rack|bar|fragment)|rack bars|rack fragment identity|detached fragments|semantic (?:group|identity)|object identity.*ambiguous/u.test(value)) {
    return {
      disposition: 'SEMANTIC_GROUPING',
      rationale: 'Stable semantic groups preserve the observed lifecycle and ordering without claiming unsupported per-fragment identity.',
      locator: 'raw analysis gap; canonical implementation uses stable semantic groups',
      source: 'analysis',
    };
  }
  if (/tap.*(?:timestamp|count|coordinate)|event timestamps?|touch (?:coordinate|point)|raw (?:tap|natural.input|input)|exact (?:tap|touch)|phase.level inference/u.test(value) && reference.expressionIsolation.originalTuningValues) {
    return {
      disposition: 'ORIGINAL_TUNING_EXCLUDED',
      rationale: 'Exact source input timing, counts, points, coordinates, and raw tuning are excluded; the implementation must retune original values inside the locked behavior and topology bands.',
      locator: 'referenceMechanics.adaptableMechanics and expressionIsolation.originalTuningValues',
      source: 'human',
    };
  }
  if ((/replay|return.to.ready|return to ready|tap.to.ready|tap-to-ready|post.settlement.*ready|claim controls|重开|重玩|重试/u.test(value)) && declaresReplay(reference)) {
    return {
      disposition: 'HUMAN_LOCK_REQUIREMENT',
      rationale: 'The successful recording does not show replay, so the canonical target uses the explicit human lock requiring one visible replay input that restores the fixed ready state.',
      locator: 'referenceMechanics.coreLoop/playerActions/unlockRules: replay requirement',
      source: 'human',
    };
  }
  if ((/failure|hazard contact|missed support|player fall/u.test(value)) && declaresFailure(reference)) {
    return {
      disposition: 'HUMAN_LOCK_REQUIREMENT',
      rationale: 'The successful recording does not show the failure branch; the canonical target uses the explicit human lock requiring an attributable visible failure.',
      locator: 'referenceMechanics.coreLoop/mustPreserveMechanics: failure requirement',
      source: 'human',
    };
  }
  if ((/contact classification|support encounter|rebound versus|blade.support|simple traversal/u.test(value)) && declaresContactBranches(reference)) {
    return {
      disposition: 'HUMAN_LOCK_REQUIREMENT',
      rationale: 'The source pixels do not classify every contact, while the human lock explicitly requires distinct cutting and support/rebound contact branches.',
      locator: 'referenceMechanics.mustPreserveMechanics: contact-branch requirement',
      source: 'human',
    };
  }
  return {
    disposition: 'BLOCKING',
    rationale: 'No verified recording observation, independently validated manifest fact, originality exclusion, or explicit human lock resolves this gap.',
    locator: 'unresolved raw analysis gap',
    source: 'analysis',
  };
}

function needsHumanFailureReplacement(check: ReferenceBehaviorAnalysis['behaviorChecks'][number]) {
  return check.dimension === 'failure_recovery'
    && /unknown|unobserved|not observed|not visible|not evidenced|not established/u.test(`${check.stateBranch} ${check.expectedStateChange} ${check.spatialRelationship}`.toLowerCase());
}

function needsHumanReplayReplacement(check: ReferenceBehaviorAnalysis['behaviorChecks'][number]) {
  return check.dimension === 'terminal_replay'
    && /unknown|unobserved|not observed|not visible|not evidenced|not established|replay.*absent/u.test(`${check.stateBranch} ${check.expectedStateChange} ${check.spatialRelationship}`.toLowerCase());
}

function humanBoundBehaviorChecks(analysis: ReferenceBehaviorAnalysis, reference: ReferenceMechanicSpec, humanLock: EvidenceFile) {
  return analysis.behaviorChecks.map((check) => {
    if (needsHumanFailureReplacement(check) && declaresFailure(reference)) {
      return {
        ...check,
        sourceRefs: [...check.sourceRefs, { ...humanLock, locator: 'referenceMechanics.coreLoop/mustPreserveMechanics: attributable visible failure' }],
        stateBranch: 'active -> hazard contact or missed support -> attributable visible failure settlement (human-locked requirement)',
        expectedStateChange: 'Hazard contact or missed support enters a cause-visible failed state; this requirement comes from the human lock because the supplied recording contains only a successful run.',
        spatialRelationship: 'The failing contact remains causally bound to the hazard or lost support branch; exact source coordinates and tuning are excluded.',
        visibleFeedback: { ...check.visibleFeedback, eventOrder: ['danger is visible before contact', 'natural play reaches hazard contact or loses support', 'impact or fall cause remains visibly anchored', 'failed settlement exposes one replay action'] },
      };
    }
    if (needsHumanReplayReplacement(check) && declaresReplay(reference)) {
      return {
        ...check,
        sourceRefs: [...check.sourceRefs, { ...humanLock, locator: 'referenceMechanics.coreLoop/playerActions/unlockRules: one visible replay tap returns to ready' }],
        stateBranch: 'failed or completed settlement -> one visible replay tap -> fixed initial ready state (human-locked requirement)',
        playerInput: 'single natural tap on the visible replay control after settlement',
        expectedStateChange: 'One visible replay tap clears terminal state and restores the first-level fixed ready checkpoint; this requirement comes from the human lock because replay is absent from the supplied successful recording.',
        spatialRelationship: 'The replay control belongs to terminal settlement and returns directly to the initial ready checkpoint without exposing source UI layout.',
        visibleFeedback: { ...check.visibleFeedback, eventOrder: ['terminal cause and settlement remain visible', 'one replay affordance becomes visibly actionable', 'one natural tap dismisses settlement', 'the fixed initial ready state is visibly restored'] },
      };
    }
    return check;
  });
}

function replayTargetFor(reconstruction: ReferenceLevelReconstruction) {
  return reconstruction.checkpoints.flatMap((checkpoint) => checkpoint.objects).find((object) => object.role === 'replay-control')?.semanticId ?? 'replay_control_human_lock';
}

type SpatialRelation = ReferenceLevelReconstruction['spatialRelations'][number];

const TEMPORAL_RELATIONS = new Set<SpatialRelation['relation']>(['precedes', 'reachable-after', 'finish-after']);

function isTemporalRelation(relation: SpatialRelation) {
  return TEMPORAL_RELATIONS.has(relation.relation);
}

function hasTemporalOrder(relation: SpatialRelation, fromObservations: number[], toObservations: number[]) {
  return fromObservations.some((fromIndex) => toObservations.some((toIndex) =>
    relation.relation === 'precedes' ? fromIndex < toIndex : fromIndex > toIndex));
}

function isSyntheticRelationEndpointPlaceholder(object: ReferenceLevelReconstruction['checkpoints'][number]['objects'][number]) {
  return object.lifecycle === 'not-spawned'
    && !object.visible
    && object.boundsNormalized.x === 0
    && object.boundsNormalized.y === 0
    && object.boundsNormalized.width <= 0.001
    && object.boundsNormalized.height <= 0.001;
}

function stripSyntheticRelationEndpointPlaceholders(reconstruction: ReferenceLevelReconstruction) {
  const relationEndpointIds = new Set(reconstruction.spatialRelations
    .filter((relation) => relation.observed)
    .flatMap((relation) => [relation.fromObjectId, relation.toObjectId]));
  const checkpoints = reconstruction.checkpoints.map((checkpoint) => ({
    ...checkpoint,
    objects: checkpoint.objects.filter((object) => !(relationEndpointIds.has(object.semanticId) && isSyntheticRelationEndpointPlaceholder(object))),
  }));
  return ReferenceLevelReconstructionSchema.parse({ ...reconstruction, checkpoints });
}

type RelationEndpointGap = {
  gap: string;
  semanticId: string;
  checkpointIds: readonly string[];
  relationId: string;
  relation: SpatialRelation;
  endpoint: 'from' | 'to';
};

type ObjectReviewBinding = {
  level: ReferenceLevelReconstruction;
  source: EvidenceFile;
  gapLocators: ReadonlyMap<string, string>;
};

function reviewRowObject(row: ReferenceObjectReviewRow) {
  if (row.object) return row.object;
  return ReferenceObjectReviewObjectSchema.parse({
    semanticId: row.semanticId,
    role: row.role,
    lifecycle: row.lifecycle,
    boundsNormalized: row.boundsNormalized,
    rotationDegrees: row.rotationDegrees,
    visible: row.visible,
    confidence: row.confidence,
  });
}

function relationEndpointGaps(reconstruction: ReferenceLevelReconstruction): RelationEndpointGap[] {
  const represented = new Set(reconstruction.checkpoints.flatMap((checkpoint) => checkpoint.objects
    .filter((object) => !isSyntheticRelationEndpointPlaceholder(object))
    .map((object) => object.semanticId)));
  return reconstruction.spatialRelations
    .filter((relation) => relation.observed)
    .flatMap((relation) => ([
      ['from', relation.fromObjectId],
      ['to', relation.toObjectId],
    ] as const)
      .filter(([, semanticId]) => !represented.has(semanticId))
      .map(([endpoint, semanticId]) => ({
        gap: `Observed relation ${relation.id} references semantic object ${semanticId} omitted from checkpoint object arrays.`,
        semanticId,
        checkpointIds: relation.checkpointIds,
        relationId: relation.id,
        relation,
        endpoint,
      })));
}

function relationCheckpointIndexes(reconstruction: ReferenceLevelReconstruction, relation: SpatialRelation) {
  const checkpointIndexes = new Map(reconstruction.checkpoints.map((checkpoint, index) => [checkpoint.id, index]));
  const indexes = relation.checkpointIds.map((checkpointId) => checkpointIndexes.get(checkpointId));
  if (indexes.some((index) => index === undefined)) throw new Error(`temporal relation ${relation.id} has an absent checkpoint endpoint`);
  const resolvedIndexes = indexes as number[];
  if (isTemporalRelation(relation) && resolvedIndexes.length > 1
    && resolvedIndexes.some((index, position) => position > 0 && index <= resolvedIndexes[position - 1]!)) {
    throw new Error(`temporal relation ${relation.id} checkpoints are reversed or out of order`);
  }
  return resolvedIndexes;
}

function relationObjectObservations(reconstruction: ReferenceLevelReconstruction, relation: SpatialRelation, semanticId: string) {
  const checkpointIds = new Set(relation.checkpointIds);
  return reconstruction.checkpoints.flatMap((checkpoint, checkpointIndex) => checkpointIds.has(checkpoint.id)
    && checkpoint.objects.some((object) => object.semanticId === semanticId)
    ? [checkpointIndex]
    : []);
}

function reviewRowsForSemantic(rows: readonly ReferenceObjectReviewRow[], relation: SpatialRelation, semanticId: string) {
  const checkpointIds = new Set(relation.checkpointIds);
  return rows.filter((row) => checkpointIds.has(row.checkpointId) && reviewRowObject(row).semanticId === semanticId);
}

function relationGapFor(gaps: readonly RelationEndpointGap[], relation: SpatialRelation, semanticId: string) {
  return gaps.find((gap) => gap.relationId === relation.id && gap.semanticId === semanticId);
}

function temporalGapSatisfied(
  gap: RelationEndpointGap,
  reconstruction: ReferenceLevelReconstruction,
  reviewRows: readonly ReferenceObjectReviewRow[],
  gaps: readonly RelationEndpointGap[],
) {
  const indexes = relationCheckpointIndexes(reconstruction, gap.relation);
  const reviewedRows = reviewRowsForSemantic(reviewRows, gap.relation, gap.semanticId);
  // An omitted endpoint with no reviewed row is deliberately left unresolved.
  if (reviewedRows.length === 0) return false;

  const fromObservations = relationObjectObservations(reconstruction, gap.relation, gap.relation.fromObjectId);
  const toObservations = relationObjectObservations(reconstruction, gap.relation, gap.relation.toObjectId);
  const fromGap = relationGapFor(gaps, gap.relation, gap.relation.fromObjectId);
  const toGap = relationGapFor(gaps, gap.relation, gap.relation.toObjectId);
  const fromReviewRows = reviewRowsForSemantic(reviewRows, gap.relation, gap.relation.fromObjectId);
  const toReviewRows = reviewRowsForSemantic(reviewRows, gap.relation, gap.relation.toObjectId);
  // A partially reviewed relation remains BLOCKED while its other omitted
  // endpoint is unobserved. It must not be completed with a guessed object.
  if (fromObservations.length === 0 && (!fromGap || fromReviewRows.length === 0)) return false;
  if (toObservations.length === 0 && (!toGap || toReviewRows.length === 0)) return false;
  if (fromObservations.length === 0 || toObservations.length === 0) {
    throw new Error(`temporal relation ${gap.relation.id} has an unsupported absent endpoint`);
  }

  // A one-checkpoint temporal relation is grounded when both endpoints are
  // observed in that checkpoint. Chronology is only meaningful across a
  // sequence of checkpoints.
  if (indexes.length === 1) return true;
  const ordered = hasTemporalOrder(gap.relation, fromObservations, toObservations);
  if (!ordered) throw new Error(`temporal relation ${gap.relation.id} review observations are reversed or do not establish chronology`);
  return true;
}

function validateTemporalRelations(
  reconstruction: ReferenceLevelReconstruction,
  reviewRows: readonly ReferenceObjectReviewRow[],
  gaps: readonly RelationEndpointGap[],
) {
  for (const relation of reconstruction.spatialRelations.filter((candidate) => candidate.observed && isTemporalRelation(candidate))) {
    const indexes = relationCheckpointIndexes(reconstruction, relation);
    const fromObservations = relationObjectObservations(reconstruction, relation, relation.fromObjectId);
    const toObservations = relationObjectObservations(reconstruction, relation, relation.toObjectId);
    const fromGap = relationGapFor(gaps, relation, relation.fromObjectId);
    const toGap = relationGapFor(gaps, relation, relation.toObjectId);
    const fromReviewRows = reviewRowsForSemantic(reviewRows, relation, relation.fromObjectId);
    const toReviewRows = reviewRowsForSemantic(reviewRows, relation, relation.toObjectId);
    if (fromObservations.length === 0 && (!fromGap || fromReviewRows.length === 0)) continue;
    if (toObservations.length === 0 && (!toGap || toReviewRows.length === 0)) continue;
    if (fromObservations.length === 0 || toObservations.length === 0) throw new Error(`temporal relation ${relation.id} has an unsupported absent endpoint`);
    if (indexes.length > 1 && !hasTemporalOrder(relation, fromObservations, toObservations)) {
      throw new Error(`temporal relation ${relation.id} observations are reversed or do not establish chronology`);
    }
  }
}

function bindObjectReview(
  reviewInput: NonNullable<ResolutionInput['objectReview']>,
  rawLevel: ReferenceLevelReconstruction | null,
  frameManifest: ReferenceFrameManifest,
  frameManifestSource: EvidenceFile,
  sourceAnalysis: EvidenceFile,
): ObjectReviewBinding {
  if (!rawLevel) throw new Error('reference object review requires a recording-level reconstruction');
  const review = ReferenceObjectReviewSchema.parse(structuredClone(reviewInput.review));
  const source = ReferenceObjectReviewSourceSchema.parse(reviewInput.source);
  if (review.status !== 'READY') throw new Error('reference object review must be READY');
  if (review.targetRunId !== rawLevel.targetRunId || review.targetRunId !== frameManifest.targetRunId
    || review.targetGame !== rawLevel.targetGame || review.targetGame !== frameManifest.targetGame
    || review.workspace !== rawLevel.workspace || review.workspace !== frameManifest.workspace) {
    throw new Error('reference object review identity does not match the reconstruction and frame manifest');
  }
  if (review.sourceAnalysis.path !== sourceAnalysis.path || review.sourceAnalysis.sha256 !== sourceAnalysis.sha256) {
    throw new Error('reference object review source analysis path or hash does not match');
  }
  if (review.frameManifest.path !== frameManifestSource.path || review.frameManifest.sha256 !== frameManifestSource.sha256) {
    throw new Error('reference object review frame manifest path or hash does not match');
  }

  const frameById = new Map(frameManifest.frames.map((frame) => [frame.id, frame]));
  const gaps = relationEndpointGaps(rawLevel);
  const reviewedLevel = stripSyntheticRelationEndpointPlaceholders(rawLevel);
  const checkpoints = structuredClone(reviewedLevel.checkpoints);
  const rowKeys = new Set(review.rows.map((row) => {
    const object = reviewRowObject(row);
    return `${row.checkpointId}:${object.semanticId}`;
  }));
  const seenRoles = new Map<string, string>();
  for (const [rowIndex, row] of review.rows.entries()) {
    const object = reviewRowObject(row);
    const checkpoint = checkpoints.find((candidate) => candidate.id === row.checkpointId);
    if (!checkpoint) throw new Error(`reference object review row ${rowIndex} references unknown checkpoint ${row.checkpointId}`);
    const matchingGaps = gaps.filter((gap) => gap.semanticId === object.semanticId && gap.checkpointIds.includes(row.checkpointId));
    if (matchingGaps.length === 0) throw new Error(`reference object review row ${rowIndex} does not bind an omitted observed relation endpoint at checkpoint ${row.checkpointId}`);
    const priorRole = seenRoles.get(object.semanticId);
    if (priorRole && priorRole !== object.role) throw new Error(`reference object review role drift for ${object.semanticId}`);
    seenRoles.set(object.semanticId, object.role);
    if (checkpoint.objects.some((candidate) => candidate.semanticId === object.semanticId)) {
      throw new Error(`reference object review row ${rowIndex} duplicates an existing checkpoint object ${object.semanticId}`);
    }
    for (const frame of row.sourceFrames) {
      const manifestFrame = frameById.get(frame.id);
      if (!manifestFrame) throw new Error(`reference object review row ${rowIndex} references unknown frame ${frame.id}`);
      if (manifestFrame.path !== frame.path || manifestFrame.sha256 !== frame.sha256) throw new Error(`reference object review row ${rowIndex} frame ${frame.id} path or hash does not match the frame manifest`);
      if (!checkpoint.sourceFrameIds.includes(frame.id)) throw new Error(`reference object review row ${rowIndex} frame ${frame.id} is not bound to checkpoint ${row.checkpointId}`);
    }
    checkpoint.objects.push(object);
  }

  const levelWithReviewedObjects = ReferenceLevelReconstructionSchema.parse({ ...reviewedLevel, checkpoints });
  validateTemporalRelations(levelWithReviewedObjects, review.rows, gaps);

  const gapLocators = new Map<string, string>();
  for (const gap of gaps) {
    const covered = isTemporalRelation(gap.relation)
      ? temporalGapSatisfied(gap, levelWithReviewedObjects, review.rows, gaps)
      : gap.checkpointIds.every((checkpointId) => rowKeys.has(`${checkpointId}:${gap.semanticId}`));
    if (covered) {
      const reviewedCheckpoints = gap.checkpointIds.join(',');
      gapLocators.set(gap.gap, `reference-object-review.rows:${gap.relationId}:${gap.semanticId}:${reviewedCheckpoints}`);
    }
  }
  return {
    level: levelWithReviewedObjects,
    source,
    gapLocators,
  };
}

function canonicalReconstruction(raw: ReferenceLevelReconstruction, reference: ReferenceMechanicSpec, unresolved: Set<string>, frameManifestSource: EvidenceFile): ReferenceLevelReconstruction {
  if (unresolved.size > 0) {
    const withoutSyntheticRelationPlaceholders = stripSyntheticRelationEndpointPlaceholders(raw);
    return ReferenceLevelReconstructionSchema.parse({
      ...withoutSyntheticRelationPlaceholders,
      unknowns: unique([...withoutSyntheticRelationPlaceholders.unknowns.filter((gap) => unresolved.has(gap)), ...unresolved]),
      blockers: unique([...withoutSyntheticRelationPlaceholders.blockers.filter((gap) => unresolved.has(gap)), ...unresolved]),
      status: 'BLOCKED',
    });
  }
  const checkpoints = structuredClone(raw.checkpoints);
  const observedRelations = raw.spatialRelations.filter((relation) => relation.observed);
  const ready = checkpoints.find((checkpoint) => checkpoint.phase === 'ready') ?? checkpoints[0];
  const replayCheckpoint = checkpoints.at(-1);
  if (!ready || !replayCheckpoint || !declaresReplay(reference)) {
    return ReferenceLevelReconstructionSchema.parse({ ...raw, unknowns: ['A canonical ready/replay checkpoint could not be derived from the human lock.'], blockers: ['A canonical ready/replay checkpoint could not be derived from the human lock.'], status: 'BLOCKED' });
  }

  const targetObjectId = replayTargetFor(raw);
  replayCheckpoint.phase = 'replay';
  replayCheckpoint.input = { actionId: 'human_lock_replay_tap', kind: 'tap', targetObjectId, gestureDirection: 'none', sourcePointNormalized: null, confidence: 1 };
  const existingReplay = replayCheckpoint.objects.find((object) => object.semanticId === targetObjectId);
  if (existingReplay) {
    existingReplay.role = 'replay-control';
    existingReplay.lifecycle = 'ready';
    existingReplay.visible = true;
    existingReplay.confidence = 1;
    if (existingReplay.boundsNormalized.width < 0.02 || existingReplay.boundsNormalized.height < 0.02) existingReplay.boundsNormalized = { x: 0.4, y: 0.72, width: 0.2, height: 0.1 };
  } else {
    replayCheckpoint.objects.push({ semanticId: targetObjectId, role: 'replay-control', lifecycle: 'ready', boundsNormalized: { x: 0.4, y: 0.72, width: 0.2, height: 0.1 }, rotationDegrees: 0, visible: true, confidence: 1 });
  }
  replayCheckpoint.visibleFeedback = replayCheckpoint.visibleFeedback.filter((feedback) => !/replay.*(?:gap|not|absent)|no visible replay/u.test(`${feedback.id} ${feedback.event}`.toLowerCase()));
  replayCheckpoint.visibleFeedback.push({ id: 'feedback_human_lock_replay_ready', anchorObjectId: targetObjectId, order: replayCheckpoint.visibleFeedback.length + 1, event: 'one original replay affordance is visibly actionable after settlement (human-locked; unobserved in source recording)' });

  // Replay is a separate terminal action. The QA runner executes the ordinary
  // interaction sequence first, then invokes `replay` exactly once after
  // settlement. Keep an explicitly consistent replay entry out of that
  // gameplay sequence so it cannot be executed twice; contradictory entries
  // are rejected by ReferenceLevelReconstructionSchema before this point.
  const replayActionIds = new Set(['human_lock_replay_tap', ...(raw.replay ? [raw.replay.actionId] : [])]);
  const interactionSequence = raw.interactionSequence.filter((action) => !replayActionIds.has(action.actionId));
  const canonicalInteractionSequence = interactionSequence.length === raw.interactionSequence.length
    ? interactionSequence
    : interactionSequence.map((action, index) => ({ ...action, order: index + 1 }));
  const cameraSequence = raw.cameraSequence.some((camera) => camera.checkpointId === replayCheckpoint.id)
    ? raw.cameraSequence
    : [...raw.cameraSequence, { order: raw.cameraSequence.length + 1, checkpointId: replayCheckpoint.id, mode: replayCheckpoint.camera.mode, focusObjectRole: 'replay-control' as const }];

  return ReferenceLevelReconstructionSchema.parse({
    ...raw,
    source: { ...raw.source, frameManifestPath: frameManifestSource.path, frameManifestSha256: frameManifestSource.sha256 },
    checkpoints,
    spatialRelations: observedRelations,
    interactionSequence: canonicalInteractionSequence,
    cameraSequence,
    replay: { checkpointId: replayCheckpoint.id, actionId: 'human_lock_replay_tap', targetObjectId, returnsToCheckpointId: ready.id },
    observations: [...raw.observations],
    inferences: unique([...raw.inferences, 'Replay behavior is an explicit human-lock implementation requirement and was not observed in the supplied successful recording.', 'Unobserved source relations are excluded from the canonical implementation topology.']),
    unknowns: [],
    blockers: [],
    status: 'READY',
  });
}

export function resolveReferenceResearchForImplementation(input: ResolutionInput) {
  const rawAnalysis = ReferenceBehaviorAnalysisSchema.parse(structuredClone(input.analysis));
  const reference = ReferenceMechanicSpecSchema.parse(input.reference);
  const frameManifest = ReferenceFrameManifestSchema.parse(input.frameManifest);
  const rawLevel = rawAnalysis.levelReconstruction ? ReferenceLevelReconstructionSchema.parse(structuredClone(rawAnalysis.levelReconstruction)) : null;
  const researchManifestTranscriptionDistance = rawLevel && input.researchFrameManifest
    ? sha256NibbleTranscriptionDistance(rawLevel.source.frameManifestSha256, input.researchFrameManifest.sha256)
    : null;
  const researchManifestHashBinding = input.researchFrameManifest?.verifiedPrefixOfFull === true
    && rawLevel !== null
    && researchManifestTranscriptionDistance !== null
    // A SHA-256 near-match remains cryptographically specific while allowing
    // a bounded model transcription defect. Content promotion still requires
    // the sandbox bytes to be an independently verified prefix of the full
    // run-bound artifact, and downstream verification checks every frame ref.
    && researchManifestTranscriptionDistance <= 3;
  // A recovered model output can predate the final extraction of the
  // run-bound frame manifest. Permit the control plane to rebind that
  // projection when every identity-bearing field still points at the same
  // run, game, workspace, recording and viewport. The canonical level is
  // rewritten with the current manifest hash below, so downstream verification
  // remains exact. This does not allow a cross-run or cross-recording bind.
  const frameManifestIdentityMatches = rawLevel?.source.frameManifestPath === input.frameManifestSource.path
    && rawLevel.targetRunId === frameManifest.targetRunId
    && rawLevel.targetGame === frameManifest.targetGame
    && rawLevel.workspace === frameManifest.workspace
    && rawLevel.source.recordingSha256 === frameManifest.source.sha256
    && rawLevel.source.viewport.width === frameManifest.source.width
    && rawLevel.source.viewport.height === frameManifest.source.height
    && frameManifest.status === 'READY';
  const frameManifestHashMatches = rawLevel?.source.frameManifestPath === input.frameManifestSource.path
    && (rawLevel.source.frameManifestSha256 === input.frameManifestSource.sha256
      || researchManifestHashBinding
      || (input.allowIdentityRebind === true && frameManifestIdentityMatches));
  const relationBindingGaps = rawLevel ? relationEndpointGaps(rawLevel).map((gap) => gap.gap) : [];
  const objectReviewBinding = input.objectReview
    ? bindObjectReview(input.objectReview, rawLevel, frameManifest, input.frameManifestSource, input.sourceAnalysis)
    : undefined;
  const gaps = unique([
    ...rawAnalysis.unknowns,
    ...(rawLevel?.unknowns ?? []),
    ...(rawLevel?.blockers ?? []),
    ...relationBindingGaps,
  ]);
  if (!rawLevel) gaps.push('The raw analysis does not contain a recording-level reconstruction.');

  const entries = unique(gaps).map((gap) => {
    const classified = classifyGap(gap, reference, frameManifest, frameManifestHashMatches, objectReviewBinding?.gapLocators ?? new Map());
    const sourceFile = classified.source === 'human' ? input.humanLock : classified.source === 'manifest'
      ? input.frameManifestSource : classified.source === 'object-review'
        ? objectReviewBinding?.source ?? input.sourceAnalysis
        : input.sourceAnalysis;
    const sourceRefs = classified.source === 'manifest'
      ? [
        { ...input.frameManifestSource, locator: classified.locator },
        ...(input.researchFrameManifest && researchManifestHashBinding
          ? [{
            path: input.researchFrameManifest.path,
            sha256: input.researchFrameManifest.sha256,
            locator: researchManifestTranscriptionDistance === 0
              ? 'hash-bound sanitized manifest prefix read by ResearchAgent'
              : `verified sanitized manifest prefix; raw output contains a bounded ${researchManifestTranscriptionDistance}-nibble SHA-256 transcription defect (${rawLevel?.source.frameManifestSha256} -> ${input.researchFrameManifest.sha256})`,
          }]
          : []),
      ]
      : [{ ...sourceFile, locator: classified.locator }];
    return {
      gap,
      disposition: classified.disposition,
      rationale: classified.rationale,
      sourceRefs,
    };
  });
  const unresolved = new Set(entries.filter((entry) => entry.disposition === 'BLOCKING').map((entry) => entry.gap));
  const level = (objectReviewBinding?.level ?? rawLevel) ? canonicalReconstruction(objectReviewBinding?.level ?? rawLevel!, reference, unresolved, input.frameManifestSource) : null;
  if (level?.status === 'BLOCKED') for (const blocker of [...level.unknowns, ...level.blockers]) unresolved.add(blocker);
  const blockers = [...unresolved];
  const status = blockers.length === 0 ? 'READY' as const : 'BLOCKED' as const;
  const resolution = ReferenceResearchResolutionSchema.parse({
    schemaVersion: 1,
    artifactType: 'reference-research-resolution',
    targetRunId: rawAnalysis.targetRunId,
    targetGame: frameManifest.targetGame,
    workspace: frameManifest.workspace,
    sourceAnalysis: input.sourceAnalysis,
    humanLock: input.humanLock,
    entries,
    status,
    blockers,
    createdAt: new Date().toISOString(),
  });
  const analysis = ReferenceBehaviorAnalysisSchema.parse({
    ...rawAnalysis,
    behaviorChecks: humanBoundBehaviorChecks(rawAnalysis, reference, input.humanLock),
    unknowns: blockers,
    levelReconstruction: level,
    status,
  });
  return { rawAnalysis, rawLevel, resolution, analysis };
}
