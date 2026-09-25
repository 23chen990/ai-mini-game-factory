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
  { sourceCheckpointId: 'ready', capturedAtMs: 100, phase: 'ready', objectStates: [], observedRelationIds: [], cameraMode: 'static', visibleFeedbackIds: [] },
  { sourceCheckpointId: 'input', capturedAtMs: 200, phase: 'input', objectStates: [], observedRelationIds: [], cameraMode: 'static', visibleFeedbackIds: [] },
  { sourceCheckpointId: 'interaction', capturedAtMs: 300, phase: 'interaction', objectStates: [], observedRelationIds: [], cameraMode: 'static', visibleFeedbackIds: [] },
] as unknown as ReferenceLevelRuntimeTrace['checkpoints'];

describe('reference-level QA measurement timing', () => {
  it('uses the declared A→C checkpoint interval across multiple actions', () => {
    const result = measureRuntimeBehaviors(contract, checkpoints, [{ path: 'logs/trace.json', sha256: 'b'.repeat(64) }], { width: 390, height: 844 });

    expect(result?.[0]).toMatchObject({ status: 'MEASURED', actualRange: { min: 150, max: 250 } });
  });
});
