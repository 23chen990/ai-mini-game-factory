import { describe, expect, it } from 'vitest';
import { sha256Text } from '../../src/core/files.js';
import {
  ReferenceBehaviorTargetSchema,
  ReferenceLevelComparisonGateSchema,
  ReferenceLevelImplementationContractSchema,
  ReferenceLevelRuntimeTraceSchema,
} from '../../src/schemas/reference-recording.js';

const hash = (value: string) => sha256Text(value);

const evidence = { path: 'screenshots/candidate.png', sha256: hash('candidate') };

const target = {
  id: 'response-interval',
  measurementId: 'response-interval',
  kind: 'checkpoint-interval' as const,
  unit: 'ms' as const,
  fromCheckpointId: 'ready',
  toCheckpointId: 'interaction',
  subjectObjectId: null,
  relatedObjectId: null,
  expectedRange: { min: 100, max: 120 },
  acceptanceRange: { min: 50, max: 180 },
  uncertainty: 20,
  coordinateSpace: 'screen-normalized' as const,
  applicability: 'same natural tap',
  sourceFrameIds: ['frame-ready', 'frame-interaction'],
  source: { path: 'artifacts/reference-level-reconstruction.json', sha256: hash('reconstruction') },
};

function runtimeTraceWithMeasurements(measurements: unknown[]) {
  return {
    schemaVersion: 1 as const,
    artifactType: 'reference-level-runtime-trace' as const,
    targetRunId: 'run-schema-test',
    targetGame: 'schema-test-game',
    workspace: '/tmp/run-schema-test/workspace/game',
    contractHash: hash('contract'),
    buildHash: hash('build'),
    viewport: { width: 390, height: 844, label: 'phone' },
    startedFromReset: true,
    naturalInputOnly: true,
    actions: [],
    checkpoints: [],
    observedMeasurements: measurements,
    terminal: { reached: false, result: 'not-observed', causeVisible: false, settlementVisible: false },
    replay: { actionId: 'replay', returnedToCheckpointId: 'not-observed', naturalInput: false },
    screenshots: [evidence],
    trace: { path: 'logs/trace.json', sha256: hash('trace') },
    reviewer: 'QAAgent' as const,
    authorIndependent: true as const,
    observedAt: new Date(0).toISOString(),
  };
}

describe('reference measurement schemas', () => {
  it('keeps old targets and traces readable when optional R1 fields are absent', () => {
    expect(ReferenceBehaviorTargetSchema.safeParse(target).success).toBe(true);
    expect(ReferenceLevelRuntimeTraceSchema.safeParse(runtimeTraceWithMeasurements([{
      measurementId: 'response-interval',
      status: 'INSUFFICIENT',
      unit: 'ms',
      sourceCheckpointIds: ['ready', 'interaction'],
      subjectObjectId: null,
      relatedObjectId: null,
      basis: 'legacy trace has no coordinate evidence',
      evidence: [evidence],
    }])).success).toBe(true);
  });

  it('rejects inferred source measurements that contain observed values', async () => {
    const { ReferenceBehaviorMeasurementSchema } = await import('../../src/schemas/reference-recording.js');
    const result = ReferenceBehaviorMeasurementSchema.safeParse({
      id: 'inferred-latency',
      kind: 'checkpoint-interval',
      status: 'INFERRED',
      unit: 'ms',
      fromCheckpointId: 'ready',
      toCheckpointId: 'interaction',
      fromEvent: 'tap',
      toEvent: 'feedback',
      subjectObjectId: null,
      relatedObjectId: null,
      sourceCheckpointIds: ['ready', 'interaction'],
      sourceFrameIds: ['frame-ready', 'frame-interaction'],
      observedRange: { min: 10, max: 20 },
      uncertainty: 5,
      coordinateSpace: 'screen-normalized',
      applicability: 'inferred only',
      basis: 'input timestamp is not visible',
    });

    expect(result.success).toBe(false);
  });

  it.each([
    ['interval with distance unit', { ...target, unit: 'normalized-distance' }],
    ['distance with millisecond unit', { ...target, id: 'distance', measurementId: 'distance', kind: 'relative-distance', unit: 'ms', subjectObjectId: 'hero', relatedObjectId: 'target' }],
    ['distance without two objects', { ...target, id: 'distance', measurementId: 'distance', kind: 'relative-distance', unit: 'normalized-distance', subjectObjectId: null, relatedObjectId: null }],
    ['narrow acceptance range', { ...target, acceptanceRange: { min: 110, max: 115 } }],
    ['mismatched ids', { ...target, measurementId: 'other-id' }],
  ])('rejects malformed target: %s', (_label, value) => {
    expect(ReferenceBehaviorTargetSchema.safeParse(value).success).toBe(false);
  });

  it('accepts world-relative runtime evidence for comparator-level rejection', () => {
    const result = ReferenceLevelRuntimeTraceSchema.safeParse(runtimeTraceWithMeasurements([{
      measurementId: 'hero-target-distance',
      status: 'MEASURED',
      unit: 'normalized-distance',
      coordinateSpace: 'world-relative',
      actualRange: { min: 0.2, max: 0.3 },
      sourceCheckpointIds: ['ready', 'interaction'],
      subjectObjectId: 'hero',
      relatedObjectId: 'target',
      basis: 'world simulation bounds',
      evidence: [evidence],
    }]));

    expect(result.success).toBe(true);
  });

  it('rejects duplicate measured ids while preserving optional coordinate evidence', () => {
    const measurement = {
      measurementId: 'response-interval',
      status: 'INSUFFICIENT' as const,
      unit: 'ms' as const,
      sourceCheckpointIds: ['ready', 'interaction'],
      subjectObjectId: null,
      relatedObjectId: null,
      basis: 'duplicate test',
      evidence: [evidence],
    };
    const result = ReferenceLevelRuntimeTraceSchema.safeParse(runtimeTraceWithMeasurements([measurement, measurement]));

    expect(result.success).toBe(false);
  });

  it('requires comparison status and result rows to appear together', () => {
    const base = {
      schemaVersion: 1 as const,
      artifactType: 'reference-level-comparison-gate' as const,
      targetRunId: 'run-schema-test',
      targetGame: 'schema-test-game',
      contractHash: hash('contract'),
      buildHash: hash('build'),
      passed: true,
      blockers: [],
      checkedObjectIds: [],
      checkedCheckpointIds: [],
      checkedPlacementRuleIds: [],
      checkedRelationIds: [],
      checkedActionIds: [],
      checkedAt: new Date(0).toISOString(),
    };

    expect(ReferenceLevelComparisonGateSchema.safeParse({ ...base, comparisonStatus: 'CONFORMING' }).success).toBe(false);
    expect(ReferenceLevelComparisonGateSchema.safeParse({
      ...base,
      measurementResults: [{ measurementId: 'response-interval', result: 'CONFORMING', expectedRange: { min: 1, max: 2 }, evidence: [evidence], reason: 'ok' }],
    }).success).toBe(false);
  });

  it('keeps the implementation contract hash unchanged when optional target context is absent', () => {
    const value = {
      schemaVersion: 1 as const,
      artifactType: 'reference-level-implementation-contract' as const,
      targetRunId: 'run-schema-test',
      targetGame: 'schema-test-game',
      workspace: '/tmp/run-schema-test/workspace/game',
      sourceReconstruction: { path: 'artifacts/reference-level-reconstruction.json', sha256: hash('reconstruction') },
      requiredObjects: [{ semanticId: 'hero', role: 'player' as const, spawnOrder: 0, lifecycleOrder: ['ready' as const] }],
      checkpointSequence: [{ order: 1, id: 'ready', phase: 'ready' as const, requiredVisibleObjectIds: ['hero'], visibleFeedbackIds: [] }],
      placementRules: [{ checkpointId: 'ready', semanticId: 'hero', horizontalBand: 'center' as const, verticalBand: 'middle' as const, widthBand: 'small' as const, heightBand: 'small' as const, orientationBand: 'horizontal' as const }],
      spatialRelations: [{ id: 'hero-ready', fromObjectId: 'hero', relation: 'attached-to' as const, toObjectId: 'hero', checkpointIds: ['ready'] }],
      interactionSequence: [],
      cameraSequence: [{ order: 1, checkpointId: 'ready', mode: 'static' as const, focusObjectRole: 'player' as const }],
      terminal: null,
      replay: null,
      runtimeProbe: { globalName: '__REFERENCE_LEVEL_TEST__' as const, readOnly: true as const, methods: ['getSnapshot' as const, 'getNaturalInputTarget' as const] },
      originalityBoundary: { sourceCoordinatesExposedToBuilder: false as const, mustBeOriginal: ['code', 'assets', 'names-and-text', 'ui-expression', 'audio', 'raw-tuning-values'] as const },
      status: 'BLOCKED' as const,
      blockers: ['fixture-blocked'],
      createdAt: new Date(0).toISOString(),
    };
    const parsed = ReferenceLevelImplementationContractSchema.parse(value);
    expect(sha256Text(JSON.stringify(parsed))).toBe(sha256Text(JSON.stringify(value)));
  });
});
