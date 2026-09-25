import { describe, expect, it } from 'vitest';
import { measureRuntimeBehaviors } from '../../src/qa/reference-level-qa.js';
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
});
