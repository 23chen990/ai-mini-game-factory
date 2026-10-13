import { describe, expect, it } from 'vitest';
import { sha256Text } from '../../src/core/files.js';
import { evaluateReferenceLevelRuntimeTrace, renderReferenceLevelComparisonReport } from '../../src/core/reference-level.js';
import {
  ReferenceLevelImplementationContractSchema,
  ReferenceLevelRuntimeTraceSchema,
  ReferenceBehaviorMeasurementSchema,
  type ReferenceLevelImplementationContract,
  type ReferenceLevelRuntimeTrace,
} from '../../src/schemas/reference-recording.js';

const hash = (value: string) => sha256Text(value);

const identity = {
  targetRunId: 'run-r1-measurements',
  targetGame: 'cut-stack-dodge-fixture',
  workspace: '/tmp/run-r1-measurements/workspace/game',
};

const measurementTargets = [
  {
    id: 'cut-latency',
    measurementId: 'cut-latency',
    kind: 'checkpoint-interval' as const,
    unit: 'ms' as const,
    fromCheckpointId: 'input',
    toCheckpointId: 'interaction',
    subjectObjectId: null,
    relatedObjectId: null,
    expectedRange: { min: 90, max: 110 },
    acceptanceRange: { min: 90, max: 110 },
    uncertainty: 0,
    coordinateSpace: 'screen-normalized' as const,
    applicability: 'same viewport and normal tap input',
    sourceFrameIds: ['frame-input', 'frame-interaction'],
    source: { path: 'artifacts/reference-level-reconstruction.json', sha256: hash('reconstruction') },
  },
  {
    id: 'hero-target-distance',
    measurementId: 'hero-target-distance',
    kind: 'relative-distance' as const,
    unit: 'normalized-distance' as const,
    fromCheckpointId: 'input',
    toCheckpointId: 'interaction',
    subjectObjectId: 'hero',
    relatedObjectId: 'target',
    expectedRange: { min: 0.2, max: 0.3 },
    acceptanceRange: { min: 0.2, max: 0.3 },
    uncertainty: 0,
    coordinateSpace: 'screen-normalized' as const,
    applicability: 'same viewport and follow camera',
    sourceFrameIds: ['frame-input', 'frame-interaction'],
    source: { path: 'artifacts/reference-level-reconstruction.json', sha256: hash('reconstruction') },
  },
];

const placement = {
  horizontalBand: 'center' as const,
  verticalBand: 'middle' as const,
  widthBand: 'small' as const,
  heightBand: 'small' as const,
  orientationBand: 'horizontal' as const,
};

function contractWithMeasurements(includeMeasurements = true): ReferenceLevelImplementationContract {
  return ReferenceLevelImplementationContractSchema.parse({
    schemaVersion: 1,
    artifactType: 'reference-level-implementation-contract',
    ...identity,
    sourceReconstruction: { path: 'artifacts/reference-level-reconstruction.json', sha256: hash('reconstruction') },
    requiredObjects: [
      { semanticId: 'hero', role: 'player', spawnOrder: 0, lifecycleOrder: ['ready', 'moving', 'contact'] },
      { semanticId: 'target', role: 'cuttable', spawnOrder: 1, lifecycleOrder: ['ready', 'contact', 'resolved'] },
      { semanticId: 'ground', role: 'support', spawnOrder: 2, lifecycleOrder: ['ready', 'settled'] },
      { semanticId: 'replay-control', role: 'replay-control', spawnOrder: 3, lifecycleOrder: ['hidden', 'ready', 'resolved'] },
    ],
    checkpointSequence: [
      { order: 1, id: 'ready', phase: 'ready', requiredVisibleObjectIds: ['hero', 'target', 'ground'], visibleFeedbackIds: ['feedback-ready'] },
      { order: 2, id: 'input', phase: 'input', requiredVisibleObjectIds: ['hero', 'target', 'ground'], visibleFeedbackIds: ['feedback-input'] },
      { order: 3, id: 'interaction', phase: 'interaction', requiredVisibleObjectIds: ['hero', 'target', 'ground'], visibleFeedbackIds: ['feedback-interaction'] },
      { order: 4, id: 'terminal', phase: 'terminal', requiredVisibleObjectIds: ['hero', 'ground'], visibleFeedbackIds: ['feedback-terminal'] },
      { order: 5, id: 'replay', phase: 'replay', requiredVisibleObjectIds: ['hero', 'replay-control'], visibleFeedbackIds: ['feedback-replay'] },
    ],
    placementRules: [
      ...['ready', 'input', 'interaction'].flatMap((checkpointId) => [
        { checkpointId, semanticId: 'hero', ...placement },
        { checkpointId, semanticId: 'target', ...placement },
        { checkpointId, semanticId: 'ground', ...placement },
      ]),
      { checkpointId: 'terminal', semanticId: 'hero', ...placement },
      { checkpointId: 'terminal', semanticId: 'ground', ...placement },
      { checkpointId: 'replay', semanticId: 'hero', ...placement },
      { checkpointId: 'replay', semanticId: 'replay-control', ...placement },
    ],
    spatialRelations: [{ id: 'target-supported', fromObjectId: 'target', relation: 'supported-by', toObjectId: 'ground', checkpointIds: ['ready', 'input', 'interaction'] }],
    interactionSequence: [{ order: 1, actionId: 'cut', kind: 'tap', targetObjectId: 'hero', fromCheckpointId: 'input', toCheckpointId: 'interaction', responseClass: 'immediate', expectedStateChange: 'hero contacts target' }],
    cameraSequence: [
      { order: 1, checkpointId: 'ready', mode: 'follow', focusObjectRole: 'player' },
      { order: 2, checkpointId: 'terminal', mode: 'follow', focusObjectRole: 'player' },
    ],
    terminal: { checkpointId: 'terminal', result: 'level-complete', causeVisible: true, settlementVisible: true },
    replay: { checkpointId: 'replay', actionId: 'replay', targetObjectId: 'replay-control', returnsToCheckpointId: 'ready' },
    ...(includeMeasurements ? { behaviorMeasurements: measurementTargets } : {}),
    runtimeProbe: { globalName: '__REFERENCE_LEVEL_TEST__', readOnly: true, methods: ['getSnapshot', 'getNaturalInputTarget'] },
    originalityBoundary: { sourceCoordinatesExposedToBuilder: false, mustBeOriginal: ['code', 'assets', 'names-and-text', 'ui-expression', 'audio', 'raw-tuning-values'] },
    status: 'READY',
    blockers: [],
    createdAt: new Date(0).toISOString(),
  });
}

function runtimeTrace(observedMeasurements?: ReferenceLevelRuntimeTrace['observedMeasurements'], includeMeasurements = true): ReferenceLevelRuntimeTrace {
  const contract = contractWithMeasurements(includeMeasurements);
  const object = (semanticId: string, role: 'player' | 'cuttable' | 'support' | 'replay-control', checkpointId: string, visible = true) => ({
    semanticId,
    role,
    lifecycle: role === 'player'
      ? checkpointId === 'ready' ? 'ready' as const : checkpointId === 'interaction' ? 'contact' as const : 'moving' as const
      : role === 'cuttable'
        ? checkpointId === 'interaction' ? 'contact' as const : checkpointId === 'terminal' || checkpointId === 'replay' ? 'resolved' as const : 'ready' as const
        : role === 'support'
          ? checkpointId === 'terminal' || checkpointId === 'replay' ? 'settled' as const : 'ready' as const
          : checkpointId === 'replay' ? 'resolved' as const : checkpointId === 'terminal' ? 'ready' as const : 'hidden' as const,
    visible,
    placement,
  });
  const checkpoints = [
    { sourceCheckpointId: 'ready', phase: 'ready' as const, objectStates: [object('hero', 'player', 'ready'), object('target', 'cuttable', 'ready'), object('ground', 'support', 'ready'), object('replay-control', 'replay-control', 'ready', false)], observedRelationIds: ['target-supported'], cameraMode: 'follow' as const, visibleFeedbackIds: ['feedback-ready'] },
    { sourceCheckpointId: 'input', phase: 'input' as const, objectStates: [object('hero', 'player', 'input'), object('target', 'cuttable', 'input'), object('ground', 'support', 'input'), object('replay-control', 'replay-control', 'input', false)], observedRelationIds: ['target-supported'], cameraMode: 'follow' as const, visibleFeedbackIds: ['feedback-input'] },
    { sourceCheckpointId: 'interaction', phase: 'interaction' as const, objectStates: [object('hero', 'player', 'interaction'), object('target', 'cuttable', 'interaction'), object('ground', 'support', 'interaction'), object('replay-control', 'replay-control', 'interaction', false)], observedRelationIds: ['target-supported'], cameraMode: 'follow' as const, visibleFeedbackIds: ['feedback-interaction'] },
    { sourceCheckpointId: 'terminal', phase: 'terminal' as const, objectStates: [object('hero', 'player', 'terminal'), object('target', 'cuttable', 'terminal', false), object('ground', 'support', 'terminal'), object('replay-control', 'replay-control', 'terminal')], observedRelationIds: [], cameraMode: 'follow' as const, visibleFeedbackIds: ['feedback-terminal'] },
    { sourceCheckpointId: 'replay', phase: 'replay' as const, objectStates: [object('hero', 'player', 'replay'), object('target', 'cuttable', 'replay', false), object('ground', 'support', 'replay'), object('replay-control', 'replay-control', 'replay')], observedRelationIds: [], cameraMode: 'follow' as const, visibleFeedbackIds: ['feedback-replay'] },
  ];
  return ReferenceLevelRuntimeTraceSchema.parse({
    schemaVersion: 1,
    artifactType: 'reference-level-runtime-trace',
    ...identity,
    contractHash: hash(JSON.stringify(contract)),
    buildHash: hash('candidate-build'),
    viewport: { width: 390, height: 844, label: 'phone' },
    startedFromReset: true,
    naturalInputOnly: true,
    actions: [{ order: 1, actionId: 'cut', kind: 'tap', targetObjectId: 'hero', naturalInput: true, stateChanged: true, observedCheckpointId: 'interaction' }],
    checkpoints,
    ...(observedMeasurements === undefined ? {} : { observedMeasurements }),
    terminal: { reached: true, result: 'level-complete', causeVisible: true, settlementVisible: true },
    replay: { actionId: 'replay', returnedToCheckpointId: 'ready', naturalInput: true },
    screenshots: [{ path: 'screenshots/candidate.png', sha256: hash('candidate-screenshot') }],
    trace: { path: 'logs/candidate-trace.json', sha256: hash('candidate-trace') },
    reviewer: 'QAAgent',
    authorIndependent: true,
    observedAt: new Date(0).toISOString(),
  });
}

const evidence = [{ path: 'screenshots/candidate.png', sha256: hash('candidate-screenshot') }];
const measured = (latency: { min: number; max: number }, distance: { min: number; max: number }) => [
  { measurementId: 'cut-latency', status: 'MEASURED' as const, unit: 'ms' as const, coordinateSpace: 'screen-normalized' as const, actualRange: latency, sourceCheckpointIds: ['input', 'interaction'], subjectObjectId: null, relatedObjectId: null, basis: 'capturedAtMs delta', evidence },
  { measurementId: 'hero-target-distance', status: 'MEASURED' as const, unit: 'normalized-distance' as const, coordinateSpace: 'screen-normalized' as const, actualRange: distance, sourceCheckpointIds: ['input', 'interaction'], subjectObjectId: 'hero', relatedObjectId: 'target', basis: 'screen-normalized bounds', evidence },
];

describe('R1 reference behavior measurement gate', () => {
  it('keeps inferred source observations explicitly value-free', () => {
    const result = ReferenceBehaviorMeasurementSchema.safeParse({
      id: 'inferred-latency', kind: 'checkpoint-interval', status: 'INFERRED', unit: 'ms', fromCheckpointId: 'input', toCheckpointId: 'interaction', fromEvent: 'tap', toEvent: 'feedback',
      subjectObjectId: null, relatedObjectId: null, sourceCheckpointIds: ['input', 'interaction'], sourceFrameIds: ['frame-input', 'frame-interaction'], observedRange: { min: 10, max: 20 }, uncertainty: 5, coordinateSpace: 'screen-normalized', applicability: 'inferred only', basis: 'input timestamp is not visible',
    });

    expect(result.success).toBe(false);
  });

  it('marks two measured behaviors CONFORMING when both candidate ranges fit', () => {
    const contract = contractWithMeasurements();
    const gate = evaluateReferenceLevelRuntimeTrace(contract, runtimeTrace(measured({ min: 95, max: 105 }, { min: 0.22, max: 0.28 })));

    expect(gate.comparisonStatus).toBe('CONFORMING');
    expect(gate.measurementResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ measurementId: 'cut-latency', result: 'CONFORMING' }),
      expect.objectContaining({ measurementId: 'hero-target-distance', result: 'CONFORMING' }),
    ]));
  });

  it('marks a disjoint candidate range DIFFERENT', () => {
    const contract = contractWithMeasurements();
    const gate = evaluateReferenceLevelRuntimeTrace(contract, runtimeTrace(measured({ min: 140, max: 160 }, { min: 0.8, max: 0.9 })));

    expect(gate.comparisonStatus).toBe('DIFFERENT');
    expect(gate.measurementResults?.every((result) => result.result === 'DIFFERENT')).toBe(true);
    expect(gate.blockers).toEqual(expect.arrayContaining([
      'reference-level:measurement-different:cut-latency',
      'reference-level:measurement-different:hero-target-distance',
    ]));
  });

  it('marks an overlapping range INSUFFICIENT instead of forcing a pass or fail', () => {
    const contract = contractWithMeasurements();
    const gate = evaluateReferenceLevelRuntimeTrace(contract, runtimeTrace(measured({ min: 105, max: 130 }, { min: 0.28, max: 0.35 })));

    expect(gate.comparisonStatus).toBe('INSUFFICIENT');
    expect(gate.measurementResults?.every((result) => result.result === 'INSUFFICIENT')).toBe(true);
    expect(gate.blockers).toEqual(expect.arrayContaining([
      'reference-level:measurement-insufficient:cut-latency',
      'reference-level:measurement-insufficient:hero-target-distance',
    ]));
  });

  it('retains both detail results when time is INSUFFICIENT and distance is DIFFERENT', () => {
    const contract = contractWithMeasurements();
    const available = measured({ min: 95, max: 105 }, { min: 0.8, max: 0.9 });
    const gate = evaluateReferenceLevelRuntimeTrace(contract, runtimeTrace([
      { ...available[0]!, status: 'INSUFFICIENT', actualRange: undefined, basis: 'endpoint observation window missing' },
      available[1]!,
    ]));

    expect(gate.comparisonStatus).toBe('INSUFFICIENT');
    expect(gate.passed).toBe(false);
    expect(gate.measurementResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ measurementId: 'cut-latency', result: 'INSUFFICIENT' }),
      expect.objectContaining({ measurementId: 'hero-target-distance', result: 'DIFFERENT' }),
    ]));
  });

  it('marks a missing runtime measurement INSUFFICIENT and carries available evidence', () => {
    const contract = contractWithMeasurements();
    const available = measured({ min: 95, max: 105 }, { min: 0.22, max: 0.28 })[0]!;
    const gate = evaluateReferenceLevelRuntimeTrace(contract, runtimeTrace([available]));

    expect(gate.comparisonStatus).toBe('INSUFFICIENT');
    expect(gate.measurementResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ measurementId: 'cut-latency', result: 'CONFORMING', evidence }),
      expect.objectContaining({ measurementId: 'hero-target-distance', result: 'INSUFFICIENT', evidence: [] }),
    ]));
  });

  it('rejects a measured range sourced from the wrong checkpoints', () => {
    const contract = contractWithMeasurements();
    const wrongSource = measured({ min: 95, max: 105 }, { min: 0.22, max: 0.28 }).map((measurement) => ({
      ...measurement,
      sourceCheckpointIds: ['ready', 'terminal'],
    }));
    const gate = evaluateReferenceLevelRuntimeTrace(contract, runtimeTrace(wrongSource));

    expect(gate.comparisonStatus).toBe('INSUFFICIENT');
    expect(gate.measurementResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ measurementId: 'cut-latency', result: 'INSUFFICIENT' }),
      expect.objectContaining({ measurementId: 'hero-target-distance', result: 'INSUFFICIENT' }),
    ]));
    expect(gate.blockers).toEqual(expect.arrayContaining([
      'reference-level:measurement-insufficient:cut-latency',
      'reference-level:measurement-insufficient:hero-target-distance',
    ]));
  });

  it('keeps the aggregate status INSUFFICIENT when one measured space is invalid', () => {
    const contract = contractWithMeasurements();
    const wrongSpace = measured({ min: 95, max: 105 }, { min: 0.22, max: 0.28 }).map((measurement, index) => index === 0
      ? { ...measurement, coordinateSpace: 'world-relative' as const }
      : measurement);
    const gate = evaluateReferenceLevelRuntimeTrace(contract, runtimeTrace(wrongSpace));

    expect(gate.comparisonStatus).toBe('INSUFFICIENT');
    expect(gate.measurementResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ measurementId: 'cut-latency', result: 'INSUFFICIENT' }),
      expect.objectContaining({ measurementId: 'hero-target-distance', result: 'CONFORMING' }),
    ]));
  });

  it('keeps legacy contracts without behaviorMeasurements compatible', () => {
    const contract = contractWithMeasurements(false);
    const trace = runtimeTrace(undefined, false);
    const gate = evaluateReferenceLevelRuntimeTrace(contract, trace);

    expect(gate.comparisonStatus).toBeUndefined();
    expect(gate.measurementResults).toBeUndefined();
    expect(gate.passed).toBe(true);
    expect(gate.blockers).toEqual([]);
  });

  it('renders a product-readable report with source and candidate evidence', () => {
    const contract = contractWithMeasurements();
    const trace = runtimeTrace(measured({ min: 95, max: 105 }, { min: 0.22, max: 0.28 }));
    const gate = evaluateReferenceLevelRuntimeTrace(contract, trace);
    const report = renderReferenceLevelComparisonReport(contract, trace, gate);

    expect(report).toContain('参考行为契约');
    expect(report).toContain('候选构建');
    expect(report).toContain('CONFORMING');
    expect(report).toContain('来源帧');
    expect(report).toContain('候选证据');
    expect(report).toContain('下一步');
  });
});
