import { describe, expect, it } from 'vitest';
import { deriveReferenceLevelImplementationContract, evaluateReferenceLevelRuntimeTrace, verifyReferenceLevelImplementationContract, verifyReferenceLevelReconstruction } from '../../src/core/reference-level.js';
import { ReferenceFrameManifestSchema, ReferenceLevelReconstructionSchema, ReferenceLevelRuntimeTraceSchema } from '../../src/schemas/reference-recording.js';
import { sha256Text } from '../../src/core/files.js';
import { mergeReferenceLevelQaReport } from '../../src/qa/reference-level-qa.js';

const hash = (value: string) => sha256Text(value);
const frameManifest = ReferenceFrameManifestSchema.parse({
  schemaVersion: 1, artifactType: 'reference-frame-manifest', targetRunId: 'run-1', targetGame: 'slice-game', workspace: '/tmp/run/workspace/game',
  source: { evidenceId: 'level-1', path: 'reference-evidence/incoming/level-1.mp4', sha256: hash('video'), mediaType: 'video/mp4', durationMs: 4_000, width: 1100, height: 720 },
  extraction: { version: 2, engine: 'AVFoundation', samplingFps: 8, maxFrames: 100, requestedFrameCount: 6, extractedFrameCount: 6 },
  frames: Array.from({ length: 6 }, (_, index) => ({ id: `frame-${index}`, index, requestedMs: index * 600, actualMs: index * 600, path: `reference-evidence/derived/level-1/frame-${index}.png`, sha256: hash(`frame-${index}`), width: 1100, height: 720 })),
  contactSheets: [], status: 'READY', blockers: [], extractedAt: new Date(0).toISOString(),
});

function reconstruction() {
  const checkpoint = (id: string, phase: 'ready' | 'input' | 'interaction' | 'aftermath' | 'terminal' | 'replay', index: number, input: { actionId: string | null; kind: 'none' | 'tap'; targetObjectId: string | null }) => ({
    id, phase, atMs: index * 600, sourceFrameIds: [`frame-${index}`],
    input: { ...input, gestureDirection: 'none' as const, sourcePointNormalized: input.kind === 'none' ? null : { x: 0.5, y: 0.5 }, confidence: 0.95 },
    camera: { mode: phase === 'replay' ? 'cut' as const : 'follow' as const, focusObjectIds: ['blade'], motion: phase === 'ready' ? 'static' as const : 'forward' as const, confidence: 0.9 },
    objects: [
      { semanticId: 'blade', role: 'player' as const, lifecycle: phase === 'ready' ? 'ready' as const : phase === 'terminal' ? 'settled' as const : 'moving' as const, boundsNormalized: { x: 0.1 + index * 0.04, y: 0.4, width: 0.1, height: 0.1 }, rotationDegrees: 0, visible: true, confidence: 0.95 },
      { semanticId: 'fruit-1', role: 'cuttable' as const, lifecycle: phase === 'interaction' ? 'contact' as const : phase === 'aftermath' ? 'resolved' as const : 'ready' as const, boundsNormalized: { x: 0.5, y: 0.55, width: 0.15, height: 0.15 }, rotationDegrees: 0, visible: phase !== 'replay', confidence: 0.95 },
      { semanticId: 'ground', role: 'support' as const, lifecycle: 'ready' as const, boundsNormalized: { x: 0.05, y: 0.72, width: 0.9, height: 0.18 }, rotationDegrees: 0, visible: phase !== 'replay', confidence: 0.95 },
      { semanticId: 'replay-control', role: 'replay-control' as const, lifecycle: phase === 'terminal' ? 'ready' as const : phase === 'replay' ? 'resolved' as const : 'hidden' as const, boundsNormalized: { x: 0.4, y: 0.75, width: 0.2, height: 0.1 }, rotationDegrees: 0, visible: phase === 'terminal' || phase === 'replay', confidence: 0.95 },
    ],
    visibleFeedback: [{ id: `feedback-${id}`, anchorObjectId: phase === 'interaction' ? 'fruit-1' : 'blade', order: 1, event: `${phase} is visible` }],
  });
  return ReferenceLevelReconstructionSchema.parse({
    schemaVersion: 1, artifactType: 'reference-level-reconstruction', targetRunId: 'run-1', targetGame: 'slice-game', workspace: '/tmp/run/workspace/game',
    source: { frameManifestPath: 'artifacts/reference-frame-manifest.json', frameManifestSha256: hash('manifest'), recordingSha256: hash('video'), viewport: { width: 1100, height: 720 } },
    checkpoints: [
      checkpoint('ready', 'ready', 0, { actionId: null, kind: 'none', targetObjectId: null }),
      checkpoint('tap-1', 'input', 1, { actionId: 'flip', kind: 'tap', targetObjectId: 'blade' }),
      checkpoint('cut-1', 'interaction', 2, { actionId: null, kind: 'none', targetObjectId: null }),
      checkpoint('fall-1', 'aftermath', 3, { actionId: null, kind: 'none', targetObjectId: null }),
      checkpoint('settled', 'terminal', 4, { actionId: null, kind: 'none', targetObjectId: null }),
      checkpoint('replayed', 'replay', 5, { actionId: 'replay', kind: 'tap', targetObjectId: 'replay-control' }),
    ],
    spatialRelations: [{ id: 'fruit-supported', fromObjectId: 'fruit-1', relation: 'supported-by', toObjectId: 'ground', checkpointIds: ['ready', 'tap-1'], observed: true }],
    interactionSequence: [{ order: 1, actionId: 'flip', kind: 'tap', targetObjectId: 'blade', fromCheckpointId: 'ready', toCheckpointId: 'cut-1', responseClass: 'immediate', expectedStateChange: 'blade flips and cuts fruit-1' }],
    cameraSequence: [
      { order: 1, checkpointId: 'ready', mode: 'follow', focusObjectRole: 'player' },
      { order: 2, checkpointId: 'settled', mode: 'follow', focusObjectRole: 'player' },
    ],
    terminal: { checkpointId: 'settled', result: 'level-complete', causeVisible: true, settlementVisible: true },
    replay: { checkpointId: 'replayed', actionId: 'replay', targetObjectId: 'replay-control', returnsToCheckpointId: 'ready' },
    observations: ['The player object reaches the terminal after one cut.'], inferences: [], unknowns: [], status: 'READY', blockers: [], analyzedAt: new Date(0).toISOString(),
  });
}

describe('recording-derived level contracts', () => {
  it('binds every observation to real extracted frames and strips raw coordinates from the Builder contract', () => {
    const raw = reconstruction();
    expect(verifyReferenceLevelReconstruction(raw, frameManifest, { frameManifestSha256: hash('manifest') })).toMatchObject({ passed: true, blockers: [] });
    const contract = deriveReferenceLevelImplementationContract(raw, { path: 'artifacts/reference-level-reconstruction.json', sha256: hash('reconstruction') });
    expect(contract).toMatchObject({
      artifactType: 'reference-level-implementation-contract', status: 'READY',
      requiredObjects: expect.arrayContaining([expect.objectContaining({ semanticId: 'blade', role: 'player' }), expect.objectContaining({ semanticId: 'fruit-1', role: 'cuttable' })]),
      runtimeProbe: { globalName: '__REFERENCE_LEVEL_TEST__', readOnly: true },
      originalityBoundary: { sourceCoordinatesExposedToBuilder: false },
      checkpointSequence: expect.arrayContaining([expect.objectContaining({ id: 'ready', phase: 'ready' }), expect.objectContaining({ id: 'cut-1', phase: 'interaction' })]),
      placementRules: expect.arrayContaining([expect.objectContaining({ checkpointId: 'ready', semanticId: 'blade', horizontalBand: 'far-left', verticalBand: 'middle', orientationBand: 'horizontal' })]),
    });
    expect(JSON.stringify(contract)).not.toContain('boundsNormalized');
    expect(JSON.stringify(contract)).not.toContain('atMs');
  });

  it.each(['replay-alpha', 'replay-beta'])('rejects contradictory same-id replay definitions for %s', (actionId) => {
    const raw = reconstruction();
    const conflicting = {
      ...raw,
      replay: { ...raw.replay!, actionId },
      interactionSequence: [...raw.interactionSequence, {
        order: 2,
        actionId,
        kind: 'tap' as const,
        targetObjectId: 'replay-control',
        fromCheckpointId: 'settled',
        toCheckpointId: 'replayed',
        responseClass: 'immediate' as const,
        expectedStateChange: 'terminal settlement clears and ready is restored',
      }],
    };
    const parsed = ReferenceLevelReconstructionSchema.safeParse(conflicting);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some((issue) => issue.message.includes(`replay action ${actionId} conflicts`))).toBe(true);
  });

  it.each(['replay-alpha', 'replay-beta'])('keeps a consistent explicit replay action separate from gameplay for %s', (actionId) => {
    const raw = reconstruction();
    const consistent = ReferenceLevelReconstructionSchema.parse({
      ...raw,
      replay: { ...raw.replay!, actionId },
      interactionSequence: [...raw.interactionSequence, {
        order: 2,
        actionId,
        kind: 'tap' as const,
        targetObjectId: 'replay-control',
        fromCheckpointId: 'replayed',
        toCheckpointId: 'ready',
        responseClass: 'immediate' as const,
        expectedStateChange: 'terminal settlement clears and ready is restored',
      }],
    });
    const contract = deriveReferenceLevelImplementationContract(consistent, { path: 'artifacts/reference-level-reconstruction.json', sha256: hash('reconstruction') });
    expect(contract.interactionSequence.map((action) => action.actionId)).toEqual(['flip']);
    expect(contract.replay).toMatchObject({ actionId, checkpointId: 'replayed', returnsToCheckpointId: 'ready' });
  });

  it('rejects a stored implementation contract whose placement rules were changed after derivation', () => {
    const raw = reconstruction();
    const sourceReconstruction = { path: 'artifacts/reference-level-reconstruction.json', sha256: hash('reconstruction') };
    const contract = deriveReferenceLevelImplementationContract(raw, sourceReconstruction);
    expect(verifyReferenceLevelImplementationContract(raw, contract, sourceReconstruction)).toEqual({ passed: true, blockers: [] });
    const tampered = {
      ...contract,
      placementRules: contract.placementRules.map((rule, index) => index === 0 ? { ...rule, horizontalBand: 'far-right' as const } : rule),
    };
    expect(verifyReferenceLevelImplementationContract(raw, tampered, sourceReconstruction)).toEqual({
      passed: false,
      blockers: ['reference-level:implementation-contract-derived-mismatch'],
    });
  });

  it('blocks a READY reconstruction whose checkpoint cites a missing frame', () => {
    const raw = reconstruction();
    const tampered = { ...raw, checkpoints: raw.checkpoints.map((item, index) => index === 2 ? { ...item, sourceFrameIds: ['frame-missing'] } : item) };
    expect(verifyReferenceLevelReconstruction(tampered, frameManifest, { frameManifestSha256: hash('manifest') })).toMatchObject({
      passed: false, blockers: expect.arrayContaining(['reference-level:frame-unbound:cut-1:frame-missing']),
    });
  });

  it('blocks a checkpoint that cites a real frame from the wrong moment', () => {
    const raw = reconstruction();
    const tampered = { ...raw, checkpoints: raw.checkpoints.map((item) => item.id === 'cut-1' ? { ...item, sourceFrameIds: ['frame-0'] } : item) };
    expect(verifyReferenceLevelReconstruction(tampered, frameManifest, { frameManifestSha256: hash('manifest') })).toMatchObject({
      passed: false,
      blockers: expect.arrayContaining(['reference-level:frame-time-mismatch:cut-1:frame-0']),
    });
  });

  it('blocks a spatial relation whose endpoint is not a recorded semantic object', () => {
    const raw = reconstruction();
    const tampered = { ...raw, spatialRelations: raw.spatialRelations.map((relation) => ({ ...relation, toObjectId: 'unobserved-support' })) };
    expect(verifyReferenceLevelReconstruction(tampered, frameManifest, { frameManifestSha256: hash('manifest') })).toMatchObject({
      passed: false,
      blockers: expect.arrayContaining(['reference-level:relation-object-unbound:fruit-supported:unobserved-support']),
    });
  });

  it('carries two source-bound measurements only when frame timing and geometry support them', () => {
    const raw = reconstruction();
    const measured = ReferenceLevelReconstructionSchema.parse({
      ...raw,
      behaviorMeasurements: [
        {
          id: 'input-to-contact', kind: 'checkpoint-interval', status: 'OBSERVED', unit: 'ms',
          fromCheckpointId: 'tap-1', toCheckpointId: 'cut-1', fromEvent: 'tap accepted', toEvent: 'contact feedback',
          subjectObjectId: null, relatedObjectId: null, sourceCheckpointIds: ['tap-1', 'cut-1'], sourceFrameIds: ['frame-1', 'frame-2'],
          observedRange: { min: 550, max: 650 }, uncertainty: 300, coordinateSpace: 'screen-normalized', applicability: 'same source viewport', basis: 'adjacent extracted frames bracket the visible response',
        },
        {
          id: 'blade-fruit-spacing', kind: 'relative-distance', status: 'OBSERVED', unit: 'normalized-distance',
          fromCheckpointId: 'ready', toCheckpointId: 'cut-1', fromEvent: 'ready spacing', toEvent: 'contact spacing',
          subjectObjectId: 'blade', relatedObjectId: 'fruit-1', sourceCheckpointIds: ['ready', 'cut-1'], sourceFrameIds: ['frame-0', 'frame-2'],
          observedRange: { min: 0.05, max: 0.15 }, uncertainty: 0.1, coordinateSpace: 'screen-normalized', applicability: 'same follow camera', basis: 'center distance changes across two stable source checkpoints',
        },
      ],
    });
    expect(verifyReferenceLevelReconstruction(measured, frameManifest, { frameManifestSha256: hash('manifest') })).toMatchObject({ passed: true, blockers: [] });
    const contract = deriveReferenceLevelImplementationContract(measured, { path: 'artifacts/reference-level-reconstruction.json', sha256: hash('reconstruction-with-measurements') });
    expect(contract.behaviorMeasurements).toHaveLength(2);
    expect(contract.behaviorMeasurements?.[0]).toMatchObject({ sourceViewport: { width: 1100, height: 720 }, sourceFrameIds: ['frame-1', 'frame-2'] });
    expect(JSON.stringify(contract)).not.toContain('observedRange');
  });

  it('blocks source measurements that claim more precision than the frame spacing supports', () => {
    const raw = reconstruction();
    const tooPrecise = ReferenceLevelReconstructionSchema.parse({
      ...raw,
      behaviorMeasurements: [
        {
          id: 'input-to-contact', kind: 'checkpoint-interval', status: 'OBSERVED', unit: 'ms',
          fromCheckpointId: 'tap-1', toCheckpointId: 'cut-1', fromEvent: 'tap accepted', toEvent: 'contact feedback',
          subjectObjectId: null, relatedObjectId: null, sourceCheckpointIds: ['tap-1', 'cut-1'], sourceFrameIds: ['frame-1', 'frame-2'],
          observedRange: { min: 600, max: 600 }, uncertainty: 1, coordinateSpace: 'screen-normalized', applicability: 'same source viewport', basis: 'claimed exact timing',
        },
        {
          id: 'blade-fruit-spacing', kind: 'relative-distance', status: 'UNKNOWN', unit: 'normalized-distance',
          fromCheckpointId: 'ready', toCheckpointId: 'cut-1', fromEvent: 'unknown', toEvent: 'unknown',
          subjectObjectId: 'blade', relatedObjectId: 'fruit-1', sourceCheckpointIds: ['ready', 'cut-1'], sourceFrameIds: ['frame-0', 'frame-2'],
          observedRange: null, uncertainty: null, coordinateSpace: 'unknown', applicability: 'camera cannot be aligned', basis: 'source pixels do not establish comparable geometry',
        },
      ],
    });
    const result = verifyReferenceLevelReconstruction(tooPrecise, frameManifest, { frameManifestSha256: hash('manifest') });
    expect(result.blockers).toEqual(expect.arrayContaining([
      'reference-level:measurement-uncertainty-too-precise:input-to-contact',
      'reference-level:measurement-not-observed:blade-fruit-spacing',
    ]));
  });

  it('keeps verification blockers on the derived Builder contract', () => {
    const raw = reconstruction();
    const contract = deriveReferenceLevelImplementationContract(raw, { path: 'artifacts/reference-level-reconstruction.json', sha256: hash('reconstruction') }, { verificationBlockers: ['reference-level:measurement-uncertainty-too-precise:input-to-contact'] });

    expect(contract.status).toBe('BLOCKED');
    expect(contract.blockers).toContain('reference-level:measurement-uncertainty-too-precise:input-to-contact');
    expect(verifyReferenceLevelImplementationContract(raw, contract, contract.sourceReconstruction, { verificationBlockers: ['reference-level:measurement-uncertainty-too-precise:input-to-contact'] })).toEqual({ passed: true, blockers: [] });
  });

  it('compares a natural runtime trace against semantic object, relation, camera, terminal, and replay requirements', () => {
    const source = reconstruction();
    const contract = deriveReferenceLevelImplementationContract(source, { path: 'artifacts/reference-level-reconstruction.json', sha256: hash('reconstruction') });
    const contractHash = sha256Text(JSON.stringify(contract));
    const runtimeCheckpoints = source.checkpoints.map((checkpoint) => ({
      sourceCheckpointId: checkpoint.id,
      phase: checkpoint.phase,
      objectStates: checkpoint.objects.map((object) => {
        const placement = contract.placementRules.find((rule) => rule.checkpointId === checkpoint.id && rule.semanticId === object.semanticId);
        return {
          semanticId: object.semanticId,
          role: object.role,
          lifecycle: object.lifecycle,
          visible: object.visible,
          ...(placement ? { placement: { horizontalBand: placement.horizontalBand, verticalBand: placement.verticalBand, widthBand: placement.widthBand, heightBand: placement.heightBand, orientationBand: placement.orientationBand } } : {}),
        };
      }),
      observedRelationIds: source.spatialRelations.filter((relation) => relation.checkpointIds.includes(checkpoint.id)).map((relation) => relation.id),
      cameraMode: checkpoint.camera.mode,
      visibleFeedbackIds: checkpoint.visibleFeedback.map((feedback) => feedback.id),
    }));
    const trace = ReferenceLevelRuntimeTraceSchema.parse({
      schemaVersion: 1, artifactType: 'reference-level-runtime-trace', targetRunId: 'run-1', targetGame: 'slice-game', workspace: '/tmp/run/workspace/game',
      contractHash, buildHash: hash('build'), viewport: { width: 390, height: 844, label: 'phone' }, startedFromReset: true, naturalInputOnly: true,
      actions: [{ order: 1, actionId: 'flip', kind: 'tap', targetObjectId: 'blade', naturalInput: true, stateChanged: true, observedCheckpointId: 'cut-1' }],
      checkpoints: runtimeCheckpoints,
      terminal: { reached: true, result: 'level-complete', causeVisible: true, settlementVisible: true }, replay: { actionId: 'replay', returnedToCheckpointId: 'ready', naturalInput: true },
      screenshots: [{ path: 'screenshots/reference-level.png', sha256: hash('shot') }], trace: { path: 'logs/reference-level.json', sha256: hash('trace') }, reviewer: 'QAAgent', authorIndependent: true, observedAt: new Date(0).toISOString(),
    });
    expect(evaluateReferenceLevelRuntimeTrace(contract, trace)).toMatchObject({ passed: true, blockers: [] });
    const runtimePayload = {
      schemaVersion: 1, artifactType: 'reference-level-runtime-data',
      targetRunId: contract.targetRunId, targetGame: contract.targetGame, workspace: contract.workspace,
      production: { line: 'cut-stack-dodge', template: 'cut-stack-dodge-v1', runtime: 'web-lite', resolutionHash: hash('resolution') },
      sourceContract: { path: 'artifacts/reference-level-implementation-contract.json', sha256: contractHash },
      level: { objects: contract.requiredObjects, checkpoints: contract.checkpointSequence, placements: contract.placementRules, relations: contract.spatialRelations, actions: contract.interactionSequence, camera: contract.cameraSequence, terminal: contract.terminal, replay: contract.replay },
    };
    const runtimeData = { ...runtimePayload, runtimeDataHash: sha256Text(JSON.stringify(runtimePayload)) };
    expect(evaluateReferenceLevelRuntimeTrace(contract, trace, runtimeData)).toMatchObject({
      passed: false, blockers: expect.arrayContaining(['reference-level:runtime-binding-missing:ready']),
    });
    const runtimeBinding = { runtimeDataHash: runtimeData.runtimeDataHash, contractHash, resolutionHash: hash('resolution'), dataPath: 'src/generated/reference-level.json' };
    const boundTrace = { ...trace, checkpoints: trace.checkpoints.map((checkpoint) => ({ ...checkpoint, runtimeBinding })) };
    expect(evaluateReferenceLevelRuntimeTrace(contract, boundTrace, runtimeData)).toMatchObject({ passed: true, blockers: [] });
    const staleBinding = { ...boundTrace, checkpoints: boundTrace.checkpoints.map((checkpoint, index) => index === 1 ? { ...checkpoint, runtimeBinding: { ...runtimeBinding, runtimeDataHash: hash('old level') } } : checkpoint) };
    expect(evaluateReferenceLevelRuntimeTrace(contract, staleBinding, runtimeData)).toMatchObject({
      passed: false, blockers: expect.arrayContaining(['reference-level:runtime-binding-mismatch:tap-1']),
    });
    const broken = { ...trace, terminal: { ...trace.terminal, causeVisible: false }, checkpoints: trace.checkpoints.map((item) => ({ ...item, observedRelationIds: [] })) };
    expect(evaluateReferenceLevelRuntimeTrace(contract, broken)).toMatchObject({
      passed: false,
      blockers: expect.arrayContaining(['reference-level:relation-missing:fruit-supported', 'reference-level:terminal-cause-not-visible']),
    });
    const wrongCheckpoint = {
      ...trace,
      actions: trace.actions.map((action) => ({ ...action, observedCheckpointId: 'ready' })),
    };
    expect(evaluateReferenceLevelRuntimeTrace(contract, wrongCheckpoint)).toMatchObject({
      passed: false,
      blockers: expect.arrayContaining(['reference-level:action-checkpoint-mismatch:flip:cut-1']),
    });
    const wrongPlacement = {
      ...trace,
      checkpoints: trace.checkpoints.map((checkpoint) => checkpoint.sourceCheckpointId === 'ready'
        ? { ...checkpoint, objectStates: checkpoint.objectStates.map((object) => object.semanticId === 'blade' ? { ...object, placement: { ...object.placement!, horizontalBand: 'far-right' as const } } : object) }
        : checkpoint),
    };
    expect(evaluateReferenceLevelRuntimeTrace(contract, wrongPlacement)).toMatchObject({
      passed: false,
      blockers: expect.arrayContaining(['reference-level:placement-mismatch:ready:blade']),
    });
  });

  it('turns a failed recording-level comparison into an explicit QA issue and carries its screenshots', () => {
    const report = {
      schemaVersion: 1 as const,
      passed: true,
      checks: [{ name: 'core-loop', passed: true, evidence: 'browser trace' }],
      issues: [],
      screenshots: ['screenshots/base.png'],
      consoleLog: 'logs/console.log',
      testedAt: new Date(0).toISOString(),
    };
    const gate = {
      schemaVersion: 1 as const,
      artifactType: 'reference-level-comparison-gate' as const,
      targetRunId: 'run-1',
      targetGame: 'slice-game',
      contractHash: hash('contract'),
      buildHash: hash('build'),
      passed: false,
      blockers: ['reference-level:relation-missing:fruit-supported'],
      checkedObjectIds: ['blade'],
      checkedCheckpointIds: [],
      checkedPlacementRuleIds: [],
      checkedRelationIds: [],
      checkedActionIds: ['flip'],
      checkedAt: new Date(0).toISOString(),
    };
    const merged = mergeReferenceLevelQaReport(report, gate, ['screenshots/reference-level-terminal.png']);
    expect(merged).toMatchObject({
      passed: false,
      checks: expect.arrayContaining([expect.objectContaining({ name: 'recording-level-comparison', passed: false })]),
      issues: expect.arrayContaining([expect.objectContaining({ id: 'recording-level-comparison', severity: 'error' })]),
      screenshots: ['screenshots/base.png', 'screenshots/reference-level-terminal.png'],
    });
  });
});
