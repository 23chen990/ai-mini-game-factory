import { InteractionContinuityContractSchema, InteractionContinuityObservationSchema } from '../../src/schemas/interaction-continuity.js';

export function continuityFixture() {
  const observation = InteractionContinuityObservationSchema.parse({
    nodes: [{
      nodeId: 'repeatable-action', actionId: 'primary',
      feedbackVisible: true, highlightedActionId: 'primary',
      actionCandidates: ['primary'], selectedActionId: 'primary',
      success: true, terminal: false, recoverable: true,
      successorIds: ['repeatable-action'], failure: false, recoverySuccessorIds: [],
      physicalResult: 'target resolved and next target available',
      candidateVerified: true, stateTransitionVerified: true, physicalResultVerified: true,
    }],
    repetitions: [{ actionId: 'primary', attempts: 3, successes: 2 }],
    scenarios: ['normal', 'edge', 'rescue'].map((id) => ({
      id, path: ['repeatable-action', 'repeatable-action'],
      simulated: true, passed: true, fixedStepTicks: 30, evidence: [`trace:${id}`],
    })),
  });
  const contract = InteractionContinuityContractSchema.parse({
    schemaVersion: 1, contractId: 'run-owned-continuity', gameId: 'qa-continuity-regression',
    targetWorkspace: 'workspace/game', fixedStepMs: 16,
    actions: [{
      actionId: 'primary', feedbackSignal: 'target highlight', successCondition: 'target resolved',
      constraints: [{ id: 'response', measure: 'steps', operator: '<=', target: 3 }],
      recovery: { required: true, description: 'retry returns to playable state', maxSteps: 30 },
      repetition: { attempts: 3, minimumSuccesses: 2 },
      evidence: { flow: ['trace:normal'], state: ['trace:state'], visual: ['shot:feedback'] },
    }],
    nodes: observation.nodes.map((node) => ({ ...node, successState: 'resolved' })),
    scenarios: observation.scenarios,
  });
  return { contract, observation };
}
