import { describe, expect, it } from 'vitest';
import {
  InteractionContinuityContractSchema,
  evaluateInteractionContinuity,
  type InteractionContinuityObservation,
  upgradeLegacyActionRealizability,
} from '../../src/qa/interaction-continuity.js';

const contract = {
  schemaVersion: 1 as const,
  contractId: 'demo-interaction-continuity',
  gameId: 'demo',
  targetWorkspace: 'workspace/game',
  fixedStepMs: 16,
  actions: [{
    actionId: 'primary',
    feedbackSignal: 'target glow and affordance label',
    successCondition: 'target state is resolved',
    constraints: [{ id: 'response', measure: 'stepsToResponse', operator: '<=' as const, target: 3 }],
    recovery: { required: true, description: 'retry returns to the next playable node', mechanism: 'retry affordance', maxSteps: 30 },
    repetition: { attempts: 3, minimumSuccesses: 2 },
    evidence: { flow: ['trace:normal'], state: ['state:success'], visual: ['shot:feedback'] },
  }],
  nodes: [{
    nodeId: 'n1', actionId: 'primary', feedbackVisible: true, highlightedActionId: 'primary',
    actionCandidates: ['primary'], selectedActionId: 'primary', success: true,
    successState: 'resolved', terminal: false, recoverable: true, successorIds: ['n2'],
    failure: false, recoverySuccessorIds: [], physicalResult: 'state transition observed',
    candidateVerified: true, stateTransitionVerified: true, physicalResultVerified: true,
    fixedStepTick: 10,
  }],
  scenarios: [
    { id: 'normal', path: ['n1', 'n2'], simulated: true, passed: true, fixedStepTicks: 20, evidence: ['trace:normal'] },
    { id: 'edge', path: ['n1', 'n2'], simulated: true, passed: true, fixedStepTicks: 24, evidence: ['trace:edge'] },
    { id: 'rescue', path: ['n1', 'n2'], simulated: true, passed: true, fixedStepTicks: 30, evidence: ['trace:rescue'] },
  ],
};

  const observation: InteractionContinuityObservation = {
  nodes: [{
    nodeId: 'n1', actionId: 'primary', feedbackVisible: true, actionCandidates: ['primary'],
    highlightedActionId: 'primary', selectedActionId: 'primary', success: true, terminal: false,
    recoverable: true, successorIds: ['n2'], failure: false, recoverySuccessorIds: [],
    physicalResult: 'state transition observed',
    candidateVerified: true, stateTransitionVerified: true, physicalResultVerified: true,
  }],
    repetitions: [{ actionId: 'primary', attempts: 3, successes: 2 }],
    scenarios: [
      { id: 'normal', path: ['n1', 'n2'], simulated: true, passed: true, fixedStepTicks: 20, evidence: ['trace:normal'] },
      { id: 'edge', path: ['n1', 'n2'], simulated: true, passed: true, fixedStepTicks: 24, evidence: ['trace:edge'] },
      { id: 'rescue', path: ['n1', 'n2'], simulated: true, passed: true, fixedStepTicks: 30, evidence: ['trace:rescue'] },
    ],
  };

describe('interaction continuity contract', () => {
  it('accepts a mechanic-neutral contract and passes a complete observation', () => {
    const parsed = InteractionContinuityContractSchema.parse(contract);
    const result = evaluateInteractionContinuity(parsed, observation);
    expect(result.passed).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.evidence).toEqual(expect.arrayContaining(['trace:normal', 'trace:edge', 'trace:rescue']));
  });

  it('rejects feedback without an actual candidate and a dead-end success', () => {
    const result = evaluateInteractionContinuity(contract, {
      ...observation,
      nodes: [{ ...observation.nodes[0]!, actionCandidates: [], successorIds: [], terminal: true, candidateVerified: false }],
    });
    expect(result.passed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'node:n1:feedback-without-action-candidate',
      'node:n1:success-is-terminal-or-irrecoverable',
      'node:n1:no-playable-successor',
      'node:n1:feedback-candidate-mismatch',
    ]));
  });

  it('requires recovery evidence when a declared action can fail', () => {
    const result = evaluateInteractionContinuity(contract, {
      ...observation,
      nodes: [{ ...observation.nodes[0]!, success: false, failure: true, recoverable: false, recoverySuccessorIds: [] }],
    });
    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('node:n1:failure-recovery-missing');
  });

  it('requires all fixed-step paths and repetition minimums', () => {
    const result = evaluateInteractionContinuity(contract, {
      ...observation,
      repetitions: [{ actionId: 'primary', attempts: 3, successes: 1 }],
      scenarios: [{ id: 'normal', simulated: true, passed: true, fixedStepTicks: 10, evidence: ['x'] }],
    });
    expect(result.passed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'scenario:edge:missing', 'scenario:rescue:missing', 'repetition:primary:minimum-successes-not-met',
    ]));
  });

  it('does not treat Builder-declared scenarios as QA simulation evidence', () => {
    const withoutQaScenarios = { ...observation };
    delete withoutQaScenarios.scenarios;
    const result = evaluateInteractionContinuity(contract, withoutQaScenarios);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'scenario:normal:missing', 'scenario:edge:missing', 'scenario:rescue:missing',
    ]));
  });

  it('adapts legacy ActionRealizability without claiming runtime continuity', () => {
    const action = upgradeLegacyActionRealizability({
      schemaVersion: 1, actionId: 'legacy', feedbackSignal: 'button', successCondition: 'done',
      constraints: [{ id: 'response', measure: 'steps', operator: '<=', target: 2 }],
      recovery: { required: true, description: 'retry' }, repetition: { attempts: 2, minimumSuccesses: 1 }, evidence: ['legacy:evidence'],
    });
    expect(action.actionId).toBe('legacy');
    expect(action.evidence.flow).toEqual(['legacy:evidence']);
    expect(action.successTerminalMode).toBe('forbidden');
  });
});
