import { describe, expect, it } from 'vitest';
import { measureRuntimeBehaviors } from '../../src/qa/reference-level-qa.js';
import { classifyCutStackGeometryObservation } from '../../src/qa/cut-stack-playwright-qa.js';
import type { ReferenceLevelImplementationContract, ReferenceLevelRuntimeTrace } from '../../src/schemas/reference-recording.js';

const contract = {
  behaviorMeasurements: [{
    id: 'ready-to-interaction', measurementId: 'ready-to-interaction', kind: 'checkpoint-interval', unit: 'ms',
    fromCheckpointId: 'ready', toCheckpointId: 'interaction', subjectObjectId: null, relatedObjectId: null,
    expectedRange: { min: 180, max: 220 }, acceptanceRange: { min: 150, max: 250 }, uncertainty: 20,
    coordinateSpace: 'screen-normalized', applicability: 'crosses two natural actions', sourceFrameIds: ['a', 'c'],
    source: { path: 'artifacts/reference-level-reconstruction.json', sha256: 'a'.repeat(64) },
  }],
} as unknown as ReferenceLevelImplementationContract;

const distanceContract = (direction: 'approaching' | 'separating' | 'stable' | undefined, acceptanceRange = { min: 0.02, max: 0.08 }) => ({
  behaviorMeasurements: [{
    id: 'spacing', measurementId: 'spacing', kind: 'relative-distance', unit: 'normalized-distance',
    fromCheckpointId: 'ready', toCheckpointId: 'interaction', subjectObjectId: 'hero', relatedObjectId: 'target',
    expectedRange: { min: 0, max: 0.06 }, acceptanceRange, uncertainty: 0.01,
    coordinateSpace: 'screen-normalized', ...(direction === undefined ? {} : { direction }), applicability: 'same viewport', sourceFrameIds: ['a', 'c'],
    source: { path: 'artifacts/reference-level-reconstruction.json', sha256: 'a'.repeat(64) },
  }],
} as unknown as ReferenceLevelImplementationContract);

function distanceCheckpoints(heroFromX: number, heroToX: number): ReferenceLevelRuntimeTrace['checkpoints'] {
  const objectStates = (heroX: number) => [
    { semanticId: 'hero', role: 'player' as const, lifecycle: 'ready' as const, visible: true, boundsNormalized: { x: heroX, y: 0.4, width: 0.05, height: 0.05 }, coordinateSpace: 'screen-normalized' as const },
    { semanticId: 'target', role: 'cuttable' as const, lifecycle: 'ready' as const, visible: true, boundsNormalized: { x: 0.7, y: 0.4, width: 0.05, height: 0.05 }, coordinateSpace: 'screen-normalized' as const },
  ];
  return [
    { sourceCheckpointId: 'ready', capturedAtMs: 100, observationWindow: { startMs: 90, endMs: 100 }, phase: 'ready', objectStates: objectStates(heroFromX), observedRelationIds: [], cameraMode: 'static', visibleFeedbackIds: [] },
    { sourceCheckpointId: 'interaction', capturedAtMs: 200, observationWindow: { startMs: 190, endMs: 200 }, phase: 'interaction', objectStates: objectStates(heroToX), observedRelationIds: [], cameraMode: 'static', visibleFeedbackIds: [] },
  ] as unknown as ReferenceLevelRuntimeTrace['checkpoints'];
}

const checkpoints = [
  { sourceCheckpointId: 'ready', capturedAtMs: 100, sampleGapMs: 20, observationWindow: { startMs: 80, endMs: 100 }, phase: 'ready', objectStates: [], observedRelationIds: [], cameraMode: 'static', visibleFeedbackIds: [] },
  { sourceCheckpointId: 'input', capturedAtMs: 400, sampleGapMs: 300, observationWindow: { startMs: 380, endMs: 400 }, phase: 'input', objectStates: [], observedRelationIds: [], cameraMode: 'static', visibleFeedbackIds: [] },
  { sourceCheckpointId: 'interaction', capturedAtMs: 700, sampleGapMs: 300, observationWindow: { startMs: 680, endMs: 700 }, phase: 'interaction', objectStates: [], observedRelationIds: [], cameraMode: 'static', visibleFeedbackIds: [] },
] as unknown as ReferenceLevelRuntimeTrace['checkpoints'];

describe('reference-level QA measurement timing', () => {
  it('uses the declared A→C checkpoint interval across multiple actions', () => {
    const result = measureRuntimeBehaviors(contract, checkpoints, [{ path: 'logs/trace.json', sha256: 'b'.repeat(64) }], { width: 390, height: 844 });

    expect(result?.[0]).toMatchObject({ status: 'MEASURED', actualRange: { min: 580, max: 620 } });
    expect(result?.[0]?.basis).toMatch(/观察窗口/);
  });

  it('does not let a later unrelated sample change a completed A→C interval', () => {
    const withLateSample = [...checkpoints, { ...checkpoints[2]!, sourceCheckpointId: 'aftermath', capturedAtMs: 10_700, sampleGapMs: 10_000, observationWindow: { startMs: 10_000, endMs: 10_700 } }] as ReferenceLevelRuntimeTrace['checkpoints'];
    const result = measureRuntimeBehaviors(contract, withLateSample, [{ path: 'logs/trace.json', sha256: 'b'.repeat(64) }], { width: 390, height: 844 });

    expect(result?.[0]).toMatchObject({ status: 'MEASURED', actualRange: { min: 580, max: 620 } });
  });

  it('reports INSUFFICIENT when the start has no endpoint observation basis', () => {
    const missingStart = checkpoints.map((checkpoint) => checkpoint.sourceCheckpointId === 'ready' ? { ...checkpoint, observationWindow: undefined } : checkpoint) as ReferenceLevelRuntimeTrace['checkpoints'];
    const withLateSample = [...missingStart, { ...checkpoints[2]!, sourceCheckpointId: 'late', capturedAtMs: 20_000, sampleGapMs: 19_300 }] as ReferenceLevelRuntimeTrace['checkpoints'];
    const result = measureRuntimeBehaviors(contract, withLateSample, [{ path: 'logs/trace.json', sha256: 'b'.repeat(64) }], { width: 390, height: 844 });

    expect(result?.[0]).toMatchObject({ status: 'INSUFFICIENT' });
    expect(result?.[0]?.basis).toMatch(/观察窗口/);
  });

  it('uses the window before the next observation and ignores screenshot delay after C', () => {
    const delayedObservation = checkpoints.map((checkpoint) => ({
      ...checkpoint,
      ...(checkpoint.sourceCheckpointId === 'interaction' ? { observationWindow: { startMs: 980, endMs: 1_020 }, captureDelayMs: 500 } : {}),
    })) as ReferenceLevelRuntimeTrace['checkpoints'];
    const result = measureRuntimeBehaviors(contract, delayedObservation, [{ path: 'logs/trace.json', sha256: 'b'.repeat(64) }], { width: 390, height: 844 });

    expect(result?.[0]).toMatchObject({ status: 'MEASURED', actualRange: { min: 880, max: 940 } });
  });

  it('declares approaching only when the signed interval is fully below zero', () => {
    const result = measureRuntimeBehaviors(distanceContract('approaching'), distanceCheckpoints(0.1, 0.2), [{ path: 'logs/trace.json', sha256: 'b'.repeat(64) }], { width: 390, height: 844 });

    expect(result?.[0]).toMatchObject({ status: 'MEASURED', direction: 'approaching' });
    expect(result?.[0]?.basis).toMatch(/resolution|分辨率/iu);
  });

  it('returns INSUFFICIENT when a small negative change is unresolved at candidate resolution', () => {
    const result = measureRuntimeBehaviors(distanceContract('approaching'), distanceCheckpoints(0.1, 0.104), [{ path: 'logs/trace.json', sha256: 'b'.repeat(64) }], { width: 390, height: 844 });

    expect(result?.[0]).toMatchObject({ status: 'INSUFFICIENT' });
    expect(result?.[0]).not.toHaveProperty('direction');
  });

  it('keeps a positive signed change as separating and the comparison as DIFFERENT', () => {
    const result = measureRuntimeBehaviors(distanceContract('approaching'), distanceCheckpoints(0.2, 0.1), [{ path: 'logs/trace.json', sha256: 'b'.repeat(64) }], { width: 390, height: 844 });

    expect(result?.[0]).toMatchObject({ status: 'MEASURED', direction: 'separating' });
  });

  it('declares stable only when the candidate interval fits the source stable acceptance range', () => {
    const result = measureRuntimeBehaviors(distanceContract('stable', { min: 0, max: 0.02 }), distanceCheckpoints(0.1, 0.101), [{ path: 'logs/trace.json', sha256: 'b'.repeat(64) }], { width: 390, height: 844 });

    expect(result?.[0]).toMatchObject({ status: 'MEASURED', direction: 'stable' });
  });
});

describe('cut-stack visual evidence tri-state', () => {
  const visualObserved = { x: 0.2, y: 0.3, width: 0.2, height: 0.3 };

  it('classifies complete matching geometry as CONFORMING', () => {
    expect(classifyCutStackGeometryObservation({ observed: visualObserved, renderColor: '#ff00aa', components: [visualObserved] })).toMatchObject({ status: 'CONFORMING' });
  });

  it('classifies withheld renderColor instead of turning it into a geometry mismatch', () => {
    expect(classifyCutStackGeometryObservation({ observed: visualObserved, components: [visualObserved] })).toMatchObject({ status: 'INSUFFICIENT', reason: expect.stringMatching(/renderColor/i) });
  });

  it('isolates a dominant component and ignores an outside decoration', () => {
    expect(classifyCutStackGeometryObservation({ observed: visualObserved, renderColor: '#ff00aa', components: [
      { x: 0.21, y: 0.31, width: 0.19, height: 0.29 },
      { x: 0.8, y: 0.8, width: 0.05, height: 0.05 },
    ] })).toMatchObject({ status: 'CONFORMING' });
  });

  it('classifies close same-color components as INSUFFICIENT', () => {
    expect(classifyCutStackGeometryObservation({ observed: visualObserved, renderColor: '#ff00aa', components: [
      { x: 0.21, y: 0.31, width: 0.09, height: 0.29 },
      { x: 0.32, y: 0.31, width: 0.08, height: 0.29 },
    ] })).toMatchObject({ status: 'INSUFFICIENT', reason: expect.stringMatching(/component|隔离/i) });
  });

  it('keeps a reliably isolated geometry error as MISMATCH', () => {
    expect(classifyCutStackGeometryObservation({ observed: visualObserved, renderColor: '#ff00aa', components: [{ x: 0.27, y: 0.3, width: 0.2, height: 0.3 }] })).toMatchObject({ status: 'MISMATCH' });
  });

  it('classifies missing visible-control geometry as INSUFFICIENT', () => {
    expect(classifyCutStackGeometryObservation({ observationFailure: 'visible primary control boundingBox unavailable' })).toMatchObject({ status: 'INSUFFICIENT' });
  });
});
