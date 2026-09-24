import { describe, expect, it } from 'vitest';
import { resolveReferenceResearchForImplementation } from '../../src/core/reference-resolution.js';
import { deriveReferenceLevelImplementationContract, verifyReferenceLevelReconstruction } from '../../src/core/reference-level.js';
import { sha256Text } from '../../src/core/files.js';
import { ReferenceBehaviorAnalysisSchema } from '../../src/schemas/reference-evidence.js';
import { ReferenceFrameManifestSchema, ReferenceLevelReconstructionSchema } from '../../src/schemas/reference-recording.js';
import { referenceBehaviorChecks, referenceFailurePressureContract } from '../fixtures/reference-behavior.js';

const hash = (value: string) => sha256Text(value);
const recording = { path: 'reference-evidence/verified/level.mp4', sha256: hash('video') };
const humanLock = { path: 'input/seed.yaml', sha256: hash('seed') };
const reference = {
  schemaVersion: 1 as const,
  lockedBy: 'human' as const,
  source: { name: 'recording', url: 'https://example.com/game', researchFiles: [] },
  coreLoop: ['ready', 'tap and move', 'hazard contact causes a visible failure', 'finish settles', 'one visible replay tap returns to ready'],
  playerActions: ['tap the play area', 'tap the visible replay control'],
  progressionSystems: ['authored level order'],
  unlockRules: ['replay is available after terminal settlement'],
  feedbackCadence: { immediateSeconds: 0.2, microGoalMinSeconds: 1, microGoalMaxSeconds: 12 },
  mustPreserveMechanics: ['support and rebound use a distinct contact branch', 'failure is attributable', 'replay restores ready'],
  adaptableMechanics: ['original tuning values and touch coordinates'],
  fidelityPolicy: { level: 'maximum_core_mechanics' as const, preserveInputStateTransitions: true as const, preserveCoreLoopOrder: true as const, preserveProgressionTopology: true as const, preserveUnlockDependencies: true as const, preserveFailureAndRecoveryRules: true as const, preserveFeedbackTimingBands: true as const },
  expressionIsolation: { originalCode: true as const, originalAssets: true as const, originalNamesAndText: true as const, originalUiLayout: true as const, originalAudio: true as const, originalTuningValues: true as const },
};

const manifest = ReferenceFrameManifestSchema.parse({
  schemaVersion: 1,
  artifactType: 'reference-frame-manifest',
  targetRunId: 'run-1',
  targetGame: 'game',
  workspace: '/tmp/run/workspace/game',
  source: { evidenceId: 'level', ...recording, mediaType: 'video/mp4', durationMs: 4_000, width: 1100, height: 720 },
  extraction: { version: 2, engine: 'AVFoundation', samplingFps: 1, maxFrames: 10, requestedFrameCount: 5, extractedFrameCount: 5 },
  frames: Array.from({ length: 5 }, (_, index) => ({ id: `frame-${index}`, index, requestedMs: index * 1_000, actualMs: index * 1_000, path: `reference-evidence/derived/frame-${index}.jpg`, sha256: hash(`frame-${index}`), width: 1100, height: 720 })),
  contactSheets: [],
  status: 'READY',
  blockers: [],
  extractedAt: new Date(0).toISOString(),
});

const checkpoint = (id: string, phase: 'ready' | 'input' | 'interaction' | 'terminal', index: number) => ({
  id,
  phase,
  atMs: index * 1_000,
  sourceFrameIds: [`frame-${index}`],
  input: phase === 'input'
    ? { actionId: 'tap-1', kind: 'tap' as const, targetObjectId: 'blade', gestureDirection: 'none' as const, sourcePointNormalized: { x: 0.5, y: 0.5 }, confidence: 0.8 }
    : { actionId: null, kind: 'none' as const, targetObjectId: null, gestureDirection: 'none' as const, sourcePointNormalized: null, confidence: 0.9 },
  camera: { mode: phase === 'terminal' ? 'cut' as const : 'follow' as const, focusObjectIds: ['blade'], motion: phase === 'ready' ? 'static' as const : phase === 'terminal' ? 'cut' as const : 'forward' as const, confidence: 0.9 },
  objects: [
    { semanticId: 'blade', role: 'player' as const, lifecycle: phase === 'ready' ? 'ready' as const : phase === 'terminal' ? 'settled' as const : 'moving' as const, boundsNormalized: { x: 0.1 + index * 0.1, y: 0.4, width: 0.1, height: 0.1 }, rotationDegrees: 0, visible: true, confidence: 0.9 },
    { semanticId: 'support', role: 'support' as const, lifecycle: 'ready' as const, boundsNormalized: { x: 0.05, y: 0.7, width: 0.7, height: 0.15 }, rotationDegrees: 0, visible: true, confidence: 0.9 },
    { semanticId: 'hazard', role: 'hazard' as const, lifecycle: 'ready' as const, boundsNormalized: { x: 0.6, y: 0.6, width: 0.1, height: 0.1 }, rotationDegrees: 0, visible: true, confidence: 0.8 },
    { semanticId: 'finish', role: 'finish' as const, lifecycle: phase === 'terminal' ? 'terminal' as const : 'ready' as const, boundsNormalized: { x: 0.8, y: 0.45, width: 0.1, height: 0.2 }, rotationDegrees: 0, visible: phase === 'terminal', confidence: 0.8 },
    { semanticId: 'replay-unobserved', role: 'replay-control' as const, lifecycle: 'hidden' as const, boundsNormalized: { x: 0.45, y: 0.75, width: 0.1, height: 0.1 }, rotationDegrees: 0, visible: false, confidence: 0.1 },
  ],
  visibleFeedback: [{ id: `feedback-${id}`, anchorObjectId: 'blade', order: 1, event: `${phase} visible` }],
});

function blockedAnalysis() {
  const level = ReferenceLevelReconstructionSchema.parse({
    schemaVersion: 1,
    artifactType: 'reference-level-reconstruction',
    targetRunId: 'run-1',
    targetGame: 'game',
    workspace: '/tmp/run/workspace/game',
    source: { frameManifestPath: 'artifacts/reference-frame-manifest.json', frameManifestSha256: hash('manifest'), recordingSha256: recording.sha256, viewport: { width: 1100, height: 720 } },
    checkpoints: [checkpoint('ready', 'ready', 0), checkpoint('tap', 'input', 1), checkpoint('hazard', 'interaction', 2), checkpoint('finish', 'terminal', 3), checkpoint('settlement', 'terminal', 4)],
    spatialRelations: [
      { id: 'supported', fromObjectId: 'blade', relation: 'supported-by', toObjectId: 'support', checkpointIds: ['ready'], observed: true },
      { id: 'hazard-contact-unobserved', fromObjectId: 'blade', relation: 'intersects-path', toObjectId: 'hazard', checkpointIds: ['hazard'], observed: false },
    ],
    interactionSequence: [{ order: 1, actionId: 'tap-1', kind: 'tap', targetObjectId: 'blade', fromCheckpointId: 'ready', toCheckpointId: 'hazard', responseClass: 'immediate', expectedStateChange: 'blade moves' }],
    cameraSequence: [{ order: 1, checkpointId: 'ready', mode: 'follow', focusObjectRole: 'player' }, { order: 2, checkpointId: 'finish', mode: 'cut', focusObjectRole: 'finish' }],
    terminal: { checkpointId: 'finish', result: 'level-complete', causeVisible: true, settlementVisible: true },
    replay: null,
    observations: ['successful route observed'],
    inferences: [],
    unknowns: ['Raw tap timestamps and touch coordinates are unavailable.', 'Replay return-to-ready is not evidenced.'],
    status: 'BLOCKED',
    blockers: ['Required visible replay-control interaction is absent.', 'The local frame manifest copy is truncated.'],
    analyzedAt: new Date(0).toISOString(),
  });
  const checks = referenceBehaviorChecks(recording);
  checks[2]!.expectedStateChange = 'Failure outcome is unknown from pixels.';
  checks[4]!.expectedStateChange = 'Replay return is unobserved.';
  return ReferenceBehaviorAnalysisSchema.parse({
    schemaVersion: 1,
    targetRunId: 'run-1',
    behaviorChecks: checks,
    observations: ['successful route observed'],
    inferences: [],
    unknowns: ['No natural failure run is present.', 'No visible replay return-to-ready is present.', 'Exact tap timestamps and touch coordinates are unavailable.', 'Per-object rack fragment identity is ambiguous.', 'Later actualMs values cannot be read from the truncated manifest copy.'],
    failurePressureContract: referenceFailurePressureContract(recording),
    levelReconstruction: level,
    status: 'BLOCKED',
  });
}

function reviewedObjectRow(checkpointId: string, frameIndex: number, semanticId: string, role: string = 'support', lifecycle: string = 'ready') {
  return {
    checkpointId,
    object: {
      semanticId,
      role,
      lifecycle,
      boundsNormalized: { x: 0.2, y: 0.7, width: 0.4, height: 0.1 },
      rotationDegrees: 0,
      visible: true,
      confidence: 0.82,
    },
    sourceFrames: [{ id: `frame-${frameIndex}`, path: `reference-evidence/derived/frame-${frameIndex}.jpg`, sha256: hash(`frame-${frameIndex}`) }],
    rationale: `Reviewed ${semanticId} at ${checkpointId}.`,
  };
}

function objectReviewArtifact(rows: unknown[]) {
  return {
    schemaVersion: 1,
    artifactType: 'reference-object-review',
    targetRunId: 'run-1',
    targetGame: 'game',
    workspace: '/tmp/run/workspace/game',
    sourceAnalysis: { path: 'artifacts/reference-behavior-analysis.raw.json', sha256: hash('analysis') },
    frameManifest: { path: 'artifacts/reference-frame-manifest.json', sha256: hash('manifest') },
    rows,
    reviewedAt: new Date(0).toISOString(),
  };
}

describe('reference research resolution', () => {
  it('keeps an omitted relation endpoint blocked without a source-bound object review', () => {
    const raw = blockedAnalysis();
    raw.levelReconstruction!.spatialRelations.push({ id: 'omitted-support', fromObjectId: 'blade', relation: 'supported-by', toObjectId: 'support-omitted', checkpointIds: ['ready'], observed: true });
    const result = resolveReferenceResearchForImplementation({
      analysis: raw,
      reference,
      frameManifest: manifest,
      frameManifestSource: { path: 'artifacts/reference-frame-manifest.json', sha256: hash('manifest') },
      sourceAnalysis: { path: 'artifacts/reference-behavior-analysis.raw.json', sha256: hash('analysis') },
      humanLock,
    });

    expect(raw.status).toBe('BLOCKED');
    expect(result.resolution.status).toBe('BLOCKED');
    expect(result.resolution.blockers).toContain('Observed relation omitted-support references semantic object support-omitted omitted from checkpoint object arrays.');
    expect(result.analysis).toMatchObject({ status: 'BLOCKED', levelReconstruction: { status: 'BLOCKED' } });
    expect(result.resolution.entries.map((entry) => entry.disposition)).toEqual(expect.arrayContaining(['HUMAN_LOCK_REQUIREMENT', 'ORIGINAL_TUNING_EXCLUDED', 'FRAME_MANIFEST_VERIFIED', 'BLOCKING']));
    expect(result.analysis.behaviorChecks.filter((check) => ['failure_recovery', 'terminal_replay'].includes(check.dimension)).some((check) => check.sourceRefs.some((source) => source.path === humanLock.path && source.sha256 === humanLock.sha256))).toBe(true);
    expect(result.analysis.levelReconstruction?.spatialRelations.some((relation) => !relation.observed)).toBe(true);
    expect(result.analysis.levelReconstruction?.checkpoints.flatMap((item) => item.objects).some((item) => item.semanticId === 'support-omitted')).toBe(false);
  });

  it('binds a replay-to-ready checkpoint relation to the human lock instead of treating the checkpoint id as an omitted object', () => {
    const raw = blockedAnalysis();
    raw.levelReconstruction!.spatialRelations.push({
      id: 'rel-017-real',
      fromObjectId: 'replay-unobserved',
      relation: 'reachable-after',
      toObjectId: 'cp-ready-000',
      checkpointIds: ['settlement'],
      observed: true,
    });
    raw.unknowns.push('Post-settlement tap-to-ready transition is not observed.');
    const result = resolveReferenceResearchForImplementation({
      analysis: raw,
      reference,
      frameManifest: manifest,
      frameManifestSource: { path: 'artifacts/reference-frame-manifest.json', sha256: hash('manifest') },
      sourceAnalysis: { path: 'artifacts/reference-behavior-analysis.raw.json', sha256: hash('analysis') },
      humanLock,
    });

    const replayEntry = result.resolution.entries.find((entry) => entry.gap.includes('rel-017-real'));
    expect(replayEntry).toMatchObject({
      disposition: 'HUMAN_LOCK_REQUIREMENT',
      sourceRefs: [expect.objectContaining({ path: humanLock.path, sha256: humanLock.sha256 })],
    });
    expect(result.resolution.blockers).not.toContain(expect.stringContaining('rel-017-real'));
    expect(result.resolution.blockers).not.toContain('Post-settlement tap-to-ready transition is not observed.');
  });

  it('rebinds a stale model manifest hash only when run identity and recording provenance still match', () => {
    const raw = blockedAnalysis();
    const currentManifestHash = hash('current-manifest');
    const result = resolveReferenceResearchForImplementation({
      analysis: raw,
      reference,
      frameManifest: manifest,
      frameManifestSource: { path: 'artifacts/reference-frame-manifest.json', sha256: currentManifestHash },
      sourceAnalysis: { path: 'artifacts/reference-behavior-analysis.raw.json', sha256: hash('analysis') },
      humanLock,
      allowIdentityRebind: true,
    });
    expect(result.resolution.status).toBe('READY');
    expect(result.resolution.blockers).toEqual([]);
    expect(result.analysis.levelReconstruction).toMatchObject({
      status: 'READY',
      source: { frameManifestPath: 'artifacts/reference-frame-manifest.json', frameManifestSha256: currentManifestHash },
    });
    expect(result.analysis.levelReconstruction?.spatialRelations.some((relation) => !relation.observed)).toBe(false);
  });

  it('adds a reviewed omitted endpoint only at its reviewed checkpoint and retains the review source', () => {
    const raw = blockedAnalysis();
    raw.levelReconstruction!.spatialRelations.push({ id: 'omitted-support', fromObjectId: 'blade', relation: 'supported-by', toObjectId: 'support-omitted', checkpointIds: ['ready'], observed: true });
    const reviewInput = {
      schemaVersion: 1,
      artifactType: 'reference-object-review',
      targetRunId: 'run-1',
      targetGame: 'game',
      workspace: '/tmp/run/workspace/game',
      sourceAnalysis: { path: 'artifacts/reference-behavior-analysis.raw.json', sha256: hash('analysis') },
      frameManifest: { path: 'artifacts/reference-frame-manifest.json', sha256: hash('manifest') },
      rows: [{
        checkpointId: 'ready',
        object: { semanticId: 'support-omitted', role: 'support', lifecycle: 'ready', boundsNormalized: { x: 0.2, y: 0.7, width: 0.4, height: 0.1 }, rotationDegrees: 0, visible: true, confidence: 0.82 },
        sourceFrames: [{ id: 'frame-0', path: 'reference-evidence/derived/frame-0.jpg', sha256: hash('frame-0') }],
        rationale: 'The support is visible in the ready checkpoint and its frame-bound bounds support the observed relation.',
      }],
      reviewedAt: new Date(0).toISOString(),
    };
    const result = resolveReferenceResearchForImplementation({
      analysis: raw,
      reference,
      frameManifest: manifest,
      frameManifestSource: { path: 'artifacts/reference-frame-manifest.json', sha256: hash('manifest') },
      sourceAnalysis: { path: 'artifacts/reference-behavior-analysis.raw.json', sha256: hash('analysis') },
      humanLock,
      objectReview: { review: reviewInput, source: { path: 'artifacts/reference-object-review.json', sha256: hash('review') } },
    });

    expect(result.resolution.status).toBe('READY');
    expect(result.resolution.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ disposition: 'OBJECT_REVIEW_VERIFIED', gap: expect.stringContaining('support-omitted'), sourceRefs: [expect.objectContaining({ path: 'artifacts/reference-object-review.json', sha256: hash('review') })] }),
    ]));
    const checkpoints = result.analysis.levelReconstruction!.checkpoints;
    expect(checkpoints.find((item) => item.id === 'ready')?.objects.some((item) => item.semanticId === 'support-omitted' && item.visible)).toBe(true);
    expect(checkpoints.filter((item) => item.id !== 'ready').some((checkpoint) => checkpoint.objects.some((item) => item.semanticId === 'support-omitted'))).toBe(false);
    expect(result.analysis.levelReconstruction?.spatialRelations.some((relation) => relation.id === 'omitted-support' && relation.observed)).toBe(true);
    expect(result.analysis.levelReconstruction?.interactionSequence.map((action) => action.actionId)).toEqual(['tap-1']);
    expect(result.analysis.levelReconstruction?.replay).toMatchObject({ actionId: 'human_lock_replay_tap', checkpointId: 'settlement', returnsToCheckpointId: 'ready' });
    expect(verifyReferenceLevelReconstruction(result.analysis.levelReconstruction, manifest, { frameManifestSha256: hash('manifest') })).toMatchObject({ passed: true, blockers: [] });
    const contract = deriveReferenceLevelImplementationContract(result.analysis.levelReconstruction, { path: 'artifacts/reference-level-reconstruction.json', sha256: hash('resolved') });
    expect(contract.status).toBe('READY');
    expect(contract.interactionSequence.map((action) => action.actionId)).toEqual(['tap-1']);
    expect(contract.replay).toMatchObject({ actionId: 'human_lock_replay_tap', checkpointId: 'settlement', returnsToCheckpointId: 'ready' });
  });

  it('keeps an omitted endpoint blocked when a relation checkpoint has no reviewed row', () => {
    const raw = blockedAnalysis();
    raw.levelReconstruction!.spatialRelations.push({ id: 'omitted-support', fromObjectId: 'blade', relation: 'supported-by', toObjectId: 'support-omitted', checkpointIds: ['ready', 'tap'], observed: true });
    const review = {
      schemaVersion: 1,
      artifactType: 'reference-object-review',
      targetRunId: 'run-1',
      targetGame: 'game',
      workspace: '/tmp/run/workspace/game',
      sourceAnalysis: { path: 'artifacts/reference-behavior-analysis.raw.json', sha256: hash('analysis') },
      frameManifest: { path: 'artifacts/reference-frame-manifest.json', sha256: hash('manifest') },
      rows: [{ checkpointId: 'ready', object: { semanticId: 'support-omitted', role: 'support', lifecycle: 'ready', boundsNormalized: { x: 0.2, y: 0.7, width: 0.4, height: 0.1 }, rotationDegrees: 0, visible: true, confidence: 0.82 }, sourceFrames: [{ id: 'frame-0', path: 'reference-evidence/derived/frame-0.jpg', sha256: hash('frame-0') }], rationale: 'Reviewed frame-bound object.' }],
      reviewedAt: new Date(0).toISOString(),
    };
    const result = resolveReferenceResearchForImplementation({
      analysis: raw,
      reference,
      frameManifest: manifest,
      frameManifestSource: { path: 'artifacts/reference-frame-manifest.json', sha256: hash('manifest') },
      sourceAnalysis: { path: 'artifacts/reference-behavior-analysis.raw.json', sha256: hash('analysis') },
      humanLock,
      objectReview: { review, source: { path: 'artifacts/reference-object-review.json', sha256: hash('review') } },
    });

    expect(result.resolution.status).toBe('BLOCKED');
    expect(result.resolution.blockers).toContain('Observed relation omitted-support references semantic object support-omitted omitted from checkpoint object arrays.');
    expect(result.analysis.levelReconstruction?.checkpoints.find((item) => item.id === 'ready')?.objects.some((item) => item.semanticId === 'support-omitted')).toBe(true);
    expect(result.analysis.levelReconstruction?.checkpoints.find((item) => item.id === 'tap')?.objects.some((item) => item.semanticId === 'support-omitted')).toBe(false);
  });

  it('grounds a multi-checkpoint precedes relation from an earlier from-object to a later reviewed to-object', () => {
    const raw = blockedAnalysis();
    raw.levelReconstruction!.spatialRelations.push({ id: 'omitted-precedes', fromObjectId: 'precedes-from', relation: 'precedes', toObjectId: 'precedes-to', checkpointIds: ['ready', 'tap'], observed: true });
    const result = resolveReferenceResearchForImplementation({
      analysis: raw,
      reference,
      frameManifest: manifest,
      frameManifestSource: { path: 'artifacts/reference-frame-manifest.json', sha256: hash('manifest') },
      sourceAnalysis: { path: 'artifacts/reference-behavior-analysis.raw.json', sha256: hash('analysis') },
      humanLock,
      objectReview: {
        review: objectReviewArtifact([
          reviewedObjectRow('ready', 0, 'precedes-from', 'cuttable'),
          reviewedObjectRow('tap', 1, 'precedes-to', 'cuttable'),
        ]),
        source: { path: 'artifacts/reference-object-review.json', sha256: hash('review') },
      },
    });

    expect(result.resolution.status).toBe('READY');
    expect(result.resolution.entries.filter((entry) => entry.disposition === 'OBJECT_REVIEW_VERIFIED').map((entry) => entry.gap)).toEqual(expect.arrayContaining([
      expect.stringContaining('precedes-from'),
      expect.stringContaining('precedes-to'),
    ]));
    expect(result.analysis.levelReconstruction?.checkpoints.find((item) => item.id === 'ready')?.objects.some((item) => item.semanticId === 'precedes-from')).toBe(true);
    expect(result.analysis.levelReconstruction?.checkpoints.find((item) => item.id === 'tap')?.objects.some((item) => item.semanticId === 'precedes-to')).toBe(true);
  });

  it('keeps an unobserved temporal endpoint blocked without inventing its checkpoint object', () => {
    const raw = blockedAnalysis();
    raw.levelReconstruction!.spatialRelations.push({ id: 'omitted-precedes', fromObjectId: 'precedes-from', relation: 'precedes', toObjectId: 'precedes-to', checkpointIds: ['ready', 'tap'], observed: true });
    const result = resolveReferenceResearchForImplementation({
      analysis: raw,
      reference,
      frameManifest: manifest,
      frameManifestSource: { path: 'artifacts/reference-frame-manifest.json', sha256: hash('manifest') },
      sourceAnalysis: { path: 'artifacts/reference-behavior-analysis.raw.json', sha256: hash('analysis') },
      humanLock,
      objectReview: {
        review: objectReviewArtifact([reviewedObjectRow('ready', 0, 'precedes-from', 'cuttable')]),
        source: { path: 'artifacts/reference-object-review.json', sha256: hash('review') },
      },
    });

    expect(result.resolution.status).toBe('BLOCKED');
    expect(result.resolution.blockers).toContain('Observed relation omitted-precedes references semantic object precedes-to omitted from checkpoint object arrays.');
    expect(result.analysis.levelReconstruction?.checkpoints.find((item) => item.id === 'ready')?.objects.some((item) => item.semanticId === 'precedes-from')).toBe(true);
    expect(result.analysis.levelReconstruction?.checkpoints.find((item) => item.id === 'tap')?.objects.some((item) => item.semanticId === 'precedes-to')).toBe(false);
  });

  it.each(['finish-after', 'reachable-after'] as const)('grounds %s with the from-object observed after the to-object', (relation) => {
    const raw = blockedAnalysis();
    raw.levelReconstruction!.spatialRelations.push({ id: 'omitted-after', fromObjectId: 'after-from', relation, toObjectId: 'after-to', checkpointIds: ['ready', 'tap'], observed: true });
    const resolve = (reversed: boolean) => resolveReferenceResearchForImplementation({
      analysis: raw,
      reference,
      frameManifest: manifest,
      frameManifestSource: { path: 'artifacts/reference-frame-manifest.json', sha256: hash('manifest') },
      sourceAnalysis: { path: 'artifacts/reference-behavior-analysis.raw.json', sha256: hash('analysis') },
      humanLock,
      objectReview: {
        review: objectReviewArtifact([
          reviewedObjectRow(reversed ? 'ready' : 'tap', reversed ? 0 : 1, 'after-from', relation === 'finish-after' ? 'finish' : 'support'),
          reviewedObjectRow(reversed ? 'tap' : 'ready', reversed ? 1 : 0, 'after-to', 'cuttable'),
        ]),
        source: { path: 'artifacts/reference-object-review.json', sha256: hash('review') },
      },
    });

    expect(resolve(false).resolution.status).toBe('READY');
    expect(() => resolve(true)).toThrow(/temporal|chronolog|reversed|order/i);
  });

  it('rejects reversed temporal review observations', () => {
    const raw = blockedAnalysis();
    raw.levelReconstruction!.spatialRelations.push({ id: 'omitted-precedes', fromObjectId: 'precedes-from', relation: 'precedes', toObjectId: 'precedes-to', checkpointIds: ['ready', 'tap'], observed: true });
    expect(() => resolveReferenceResearchForImplementation({
      analysis: raw,
      reference,
      frameManifest: manifest,
      frameManifestSource: { path: 'artifacts/reference-frame-manifest.json', sha256: hash('manifest') },
      sourceAnalysis: { path: 'artifacts/reference-behavior-analysis.raw.json', sha256: hash('analysis') },
      humanLock,
      objectReview: {
        review: objectReviewArtifact([
          reviewedObjectRow('tap', 1, 'precedes-from', 'cuttable'),
          reviewedObjectRow('ready', 0, 'precedes-to', 'cuttable'),
        ]),
        source: { path: 'artifacts/reference-object-review.json', sha256: hash('review') },
      },
    })).toThrow(/precedes|temporal|chronolog|reversed|order/i);
  });

  it.each([
    ['foreign identity', { targetRunId: 'foreign-run' }, /identity|target/i],
    ['source analysis hash', { sourceAnalysis: { path: 'artifacts/reference-behavior-analysis.raw.json', sha256: hash('foreign-analysis') } }, /source analysis|analysis.*hash/i],
    ['frame manifest hash', { frameManifest: { path: 'artifacts/reference-frame-manifest.json', sha256: hash('foreign-manifest') } }, /frame manifest|manifest.*hash/i],
  ] as const)('rejects an object review with %s', (_label, override, expected) => {
    const raw = blockedAnalysis();
    raw.levelReconstruction!.spatialRelations.push({ id: 'omitted-support', fromObjectId: 'blade', relation: 'supported-by', toObjectId: 'support-omitted', checkpointIds: ['ready'], observed: true });
    const review = {
      schemaVersion: 1,
      artifactType: 'reference-object-review',
      targetRunId: 'run-1',
      targetGame: 'game',
      workspace: '/tmp/run/workspace/game',
      sourceAnalysis: { path: 'artifacts/reference-behavior-analysis.raw.json', sha256: hash('analysis') },
      frameManifest: { path: 'artifacts/reference-frame-manifest.json', sha256: hash('manifest') },
      rows: [{ checkpointId: 'ready', object: { semanticId: 'support-omitted', role: 'support', lifecycle: 'ready', boundsNormalized: { x: 0.2, y: 0.7, width: 0.4, height: 0.1 }, rotationDegrees: 0, visible: true, confidence: 0.82 }, sourceFrames: [{ id: 'frame-0', path: 'reference-evidence/derived/frame-0.jpg', sha256: hash('frame-0') }], rationale: 'Reviewed frame-bound object.' }],
      reviewedAt: new Date(0).toISOString(),
      ...override,
    };
    expect(() => resolveReferenceResearchForImplementation({
      analysis: raw,
      reference,
      frameManifest: manifest,
      frameManifestSource: { path: 'artifacts/reference-frame-manifest.json', sha256: hash('manifest') },
      sourceAnalysis: { path: 'artifacts/reference-behavior-analysis.raw.json', sha256: hash('analysis') },
      humanLock,
      objectReview: { review, source: { path: 'artifacts/reference-object-review.json', sha256: hash('review') } },
    })).toThrow(expected);
  });

  it.each([
    ['unknown frame', [{ id: 'missing-frame', path: 'reference-evidence/derived/missing.jpg', sha256: hash('missing-frame') }], /unknown frame/i],
    ['frame hash', [{ id: 'frame-0', path: 'reference-evidence/derived/frame-0.jpg', sha256: hash('wrong-frame') }], /frame.*hash|hash.*frame/i],
  ] as const)('rejects an object review with an invalid %s', (_label, sourceFrames, expected) => {
    const raw = blockedAnalysis();
    raw.levelReconstruction!.spatialRelations.push({ id: 'omitted-support', fromObjectId: 'blade', relation: 'supported-by', toObjectId: 'support-omitted', checkpointIds: ['ready'], observed: true });
    const review = {
      schemaVersion: 1,
      artifactType: 'reference-object-review',
      targetRunId: 'run-1',
      targetGame: 'game',
      workspace: '/tmp/run/workspace/game',
      sourceAnalysis: { path: 'artifacts/reference-behavior-analysis.raw.json', sha256: hash('analysis') },
      frameManifest: { path: 'artifacts/reference-frame-manifest.json', sha256: hash('manifest') },
      rows: [{ checkpointId: 'ready', object: { semanticId: 'support-omitted', role: 'support', lifecycle: 'ready', boundsNormalized: { x: 0.2, y: 0.7, width: 0.4, height: 0.1 }, rotationDegrees: 0, visible: true, confidence: 0.82 }, sourceFrames, rationale: 'Reviewed frame-bound object.' }],
      reviewedAt: new Date(0).toISOString(),
    };
    expect(() => resolveReferenceResearchForImplementation({
      analysis: raw,
      reference,
      frameManifest: manifest,
      frameManifestSource: { path: 'artifacts/reference-frame-manifest.json', sha256: hash('manifest') },
      sourceAnalysis: { path: 'artifacts/reference-behavior-analysis.raw.json', sha256: hash('analysis') },
      humanLock,
      objectReview: { review, source: { path: 'artifacts/reference-object-review.json', sha256: hash('review') } },
    })).toThrow(expected);
  });

  it('rejects duplicate object review rows for the same checkpoint and semantic object', () => {
    const raw = blockedAnalysis();
    raw.levelReconstruction!.spatialRelations.push({ id: 'omitted-support', fromObjectId: 'blade', relation: 'supported-by', toObjectId: 'support-omitted', checkpointIds: ['ready'], observed: true });
    const row = { checkpointId: 'ready', object: { semanticId: 'support-omitted', role: 'support', lifecycle: 'ready', boundsNormalized: { x: 0.2, y: 0.7, width: 0.4, height: 0.1 }, rotationDegrees: 0, visible: true, confidence: 0.82 }, sourceFrames: [{ id: 'frame-0', path: 'reference-evidence/derived/frame-0.jpg', sha256: hash('frame-0') }], rationale: 'Reviewed frame-bound object.' };
    const review = {
      schemaVersion: 1,
      artifactType: 'reference-object-review',
      targetRunId: 'run-1',
      targetGame: 'game',
      workspace: '/tmp/run/workspace/game',
      sourceAnalysis: { path: 'artifacts/reference-behavior-analysis.raw.json', sha256: hash('analysis') },
      frameManifest: { path: 'artifacts/reference-frame-manifest.json', sha256: hash('manifest') },
      rows: [row, row],
      reviewedAt: new Date(0).toISOString(),
    };
    expect(() => resolveReferenceResearchForImplementation({
      analysis: raw,
      reference,
      frameManifest: manifest,
      frameManifestSource: { path: 'artifacts/reference-frame-manifest.json', sha256: hash('manifest') },
      sourceAnalysis: { path: 'artifacts/reference-behavior-analysis.raw.json', sha256: hash('analysis') },
      humanLock,
      objectReview: { review, source: { path: 'artifacts/reference-object-review.json', sha256: hash('review') } },
    })).toThrow(/duplicate|unique/i);
  });

  it('preserves an unmatched evidence gap as blocking', () => {
    const raw = blockedAnalysis();
    const result = resolveReferenceResearchForImplementation({
      analysis: { ...raw, unknowns: [...raw.unknowns, 'Unknown multiplayer synchronization semantics.'] },
      reference,
      frameManifest: manifest,
      frameManifestSource: { path: 'artifacts/reference-frame-manifest.json', sha256: hash('manifest') },
      sourceAnalysis: { path: 'artifacts/reference-behavior-analysis.raw.json', sha256: hash('analysis') },
      humanLock,
    });

    expect(result.resolution.status).toBe('BLOCKED');
    expect(result.resolution.blockers).toContain('Unknown multiplayer synchronization semantics.');
    expect(result.analysis.status).toBe('BLOCKED');
  });

  it('does not resolve a truncated-sandbox gap with a mismatched full manifest hash', () => {
    const raw = blockedAnalysis();
    const result = resolveReferenceResearchForImplementation({
      analysis: raw,
      reference,
      frameManifest: manifest,
      frameManifestSource: { path: 'artifacts/reference-frame-manifest.json', sha256: hash('different-manifest') },
      sourceAnalysis: { path: 'artifacts/reference-behavior-analysis.raw.json', sha256: hash('analysis') },
      humanLock,
    });
    expect(result.resolution.status).toBe('BLOCKED');
    expect(result.resolution.blockers).toContain('The local frame manifest copy is truncated.');
  });

  it('promotes a hash-bound truncated sandbox prefix to the independently verified full manifest', () => {
    const raw = blockedAnalysis();
    raw.levelReconstruction!.source.frameManifestSha256 = hash('sandbox-manifest');
    const result = resolveReferenceResearchForImplementation({
      analysis: raw,
      reference,
      frameManifest: manifest,
      frameManifestSource: { path: 'artifacts/reference-frame-manifest.json', sha256: hash('manifest') },
      researchFrameManifest: { path: 'research-sandbox/reference_deep_research/artifacts/reference-frame-manifest.json', sha256: hash('sandbox-manifest'), verifiedPrefixOfFull: true },
      sourceAnalysis: { path: 'artifacts/reference-behavior-analysis.raw.json', sha256: hash('analysis') },
      humanLock,
    });
    expect(result.resolution.status).toBe('READY');
    expect(result.analysis.levelReconstruction?.source.frameManifestSha256).toBe(hash('manifest'));
    expect(result.resolution.entries.find((entry) => entry.disposition === 'FRAME_MANIFEST_VERIFIED')?.sourceRefs).toHaveLength(2);
  });

  it('repairs at most three SHA-256 transcription nibbles only when the sandbox prefix independently binds the full manifest', () => {
    const raw = blockedAnalysis();
    const sandboxHash = hash('sandbox-manifest');
    const mutate = (value: string, positions: number[]) => [...value].map((character, index) => positions.includes(index) ? (character === 'a' ? 'b' : 'a') : character).join('');
    const transcribedHash = mutate(sandboxHash, [0, 7, 12]);
    raw.levelReconstruction!.source.frameManifestSha256 = transcribedHash;
    const result = resolveReferenceResearchForImplementation({
      analysis: raw,
      reference,
      frameManifest: manifest,
      frameManifestSource: { path: 'artifacts/reference-frame-manifest.json', sha256: hash('manifest') },
      researchFrameManifest: { path: 'research-sandbox/reference_deep_research/artifacts/reference-frame-manifest.json', sha256: sandboxHash, verifiedPrefixOfFull: true },
      sourceAnalysis: { path: 'artifacts/reference-behavior-analysis.raw.json', sha256: hash('analysis') },
      humanLock,
    });
    expect(result.resolution.status).toBe('READY');
    expect(result.analysis.levelReconstruction?.source.frameManifestSha256).toBe(hash('manifest'));
    expect(result.resolution.entries.find((entry) => entry.disposition === 'FRAME_MANIFEST_VERIFIED')?.sourceRefs)
      .toEqual(expect.arrayContaining([expect.objectContaining({ locator: expect.stringContaining('bounded 3-nibble SHA-256 transcription') })]));

    raw.levelReconstruction!.source.frameManifestSha256 = mutate(sandboxHash, [0, 1, 2, 3]);
    const fourNibbleMismatch = resolveReferenceResearchForImplementation({
      analysis: raw,
      reference,
      frameManifest: manifest,
      frameManifestSource: { path: 'artifacts/reference-frame-manifest.json', sha256: hash('manifest') },
      researchFrameManifest: { path: 'research-sandbox/reference_deep_research/artifacts/reference-frame-manifest.json', sha256: sandboxHash, verifiedPrefixOfFull: true },
      sourceAnalysis: { path: 'artifacts/reference-behavior-analysis.raw.json', sha256: hash('analysis') },
      humanLock,
    });
    expect(fourNibbleMismatch.resolution.status).toBe('BLOCKED');
  });
});
