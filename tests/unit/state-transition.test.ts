import { describe, expect, it } from 'vitest';
import { evaluateStageTransition, evaluateTransitionHistory } from '../../src/core/state-machine.js';
import { StateTransitionRecordSchema } from '../../src/schemas/state-transition.js';

describe('durable state transition audit', () => {
  it('allows explicit edges and planned forward jumps, but rejects unplanned backtracking', () => {
    expect(evaluateStageTransition('CREATED', 'BUSINESS_PREFLIGHT').passed).toBe(true);
    expect(evaluateStageTransition('CREATED', 'FULL_BUILD', { plannedStages: ['CREATED', 'FULL_BUILD'] }).passed).toBe(true);
    expect(evaluateStageTransition('FULL_BUILD', 'CREATED', { plannedStages: ['CREATED', 'FULL_BUILD'] }).passed).toBe(false);
  });

  it('validates a transition history as structured data', () => {
    const history = [
      StateTransitionRecordSchema.parse({ from: 'CREATED', to: 'BUSINESS_PREFLIGHT', reason: 'stage-start', at: new Date().toISOString() }),
      StateTransitionRecordSchema.parse({ from: 'BUSINESS_PREFLIGHT', to: 'PRODUCTION_LINE_REVIEW', reason: 'stage-start', at: new Date().toISOString() }),
    ];
    expect(evaluateTransitionHistory(history, { plannedStages: ['CREATED', 'BUSINESS_PREFLIGHT', 'PRODUCTION_LINE_REVIEW'] })).toMatchObject({ passed: true, blockers: [] });
    expect(evaluateTransitionHistory([...history, { from: 'PRODUCTION_LINE_REVIEW', to: 'CREATED', reason: 'tampered', at: new Date().toISOString() }]).passed).toBe(false);
  });

  it('accepts a hash-bound cost continuation back to the recorded planned stage', () => {
    const at = new Date().toISOString();
    const history = [
      StateTransitionRecordSchema.parse({ from: 'REFERENCE_DEEP_RESEARCH', to: 'ABANDONED', reason: 'cost-cap', at }),
      StateTransitionRecordSchema.parse({ from: 'ABANDONED', to: 'REFERENCE_DEEP_RESEARCH', reason: `cost-cap-authorized:${'a'.repeat(64)}`, at }),
    ];
    expect(evaluateTransitionHistory(history, { plannedStages: ['REFERENCE_DEEP_RESEARCH', 'REFERENCE_MECHANIC_LOCK'] })).toMatchObject({ passed: true, blockers: [] });
    expect(evaluateTransitionHistory([{ ...history[1]!, reason: 'state-save' }], { plannedStages: ['REFERENCE_DEEP_RESEARCH'] }).passed).toBe(false);
  });
});
