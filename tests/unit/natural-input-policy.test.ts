import { describe, expect, it } from 'vitest';
import { buildNaturalInputPolicy, evaluateNaturalFlowAgainstPolicy } from '../../src/core/natural-input-policy.js';
import { evaluateNaturalFlow } from '../../src/core/qa-evidence.js';

const hash = 'a'.repeat(64);

describe('natural input policy', () => {
  it('builds a line-specific policy instead of using one generic flow', () => {
    const action = buildNaturalInputPolicy('cut-stack-dodge');
    const narrative = buildNaturalInputPolicy('choice-life');
    expect(action.profile).toBe('ACTION_FEEL');
    expect(narrative.profile).toBe('NARRATIVE_AGENCY');
    expect(action.requiredTransitions).not.toEqual(narrative.requiredTransitions);
    expect(action.minimumActions).toBeGreaterThanOrEqual(3);
  });

  it('rejects a trace that technically changes state but skips the line contract', () => {
    const policy = buildNaturalInputPolicy('cut-stack-dodge');
    const trace = evaluateNaturalFlow({
      line: 'cut-stack-dodge',
      startedFromReset: true,
      actions: ['page.goto', 'click:primary', 'page.reload'],
      transitions: [{ name: 'primary', changed: true, evidence: 'state changed' }],
      completion: 'terminal',
      replayObserved: true,
      forbiddenOperations: [],
      screenshots: ['screenshots/start.png', 'screenshots/end.png'],
    });
    const result = evaluateNaturalFlowAgainstPolicy(trace, policy);
    expect(result.passed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining(['natural-required-transition-missing:cut']));
  });

  it('accepts a complete line-specific trace and binds the exact build', () => {
    const policy = buildNaturalInputPolicy('idle-management');
    const trace = evaluateNaturalFlow({
      line: 'idle-management',
      startedFromReset: true,
      actions: ['page.goto', 'click:produce', 'click:deliver', 'click:upgrade', 'page.reload', 'click:produce'],
      transitions: [
        { name: 'produce', changed: true, evidence: 'inventory changed' },
        { name: 'deliver', changed: true, evidence: 'currency settled' },
        { name: 'upgrade', changed: true, evidence: 'level changed' },
        { name: 'refresh-recovery', changed: true, evidence: 'state restored' },
      ],
      completion: 'settlement',
      replayObserved: true,
      forbiddenOperations: [],
      screenshots: ['screenshots/start.png', 'screenshots/end.png'],
    });
    const bound = {
      ...trace,
      buildHash: hash,
      runtime: 'web-lite',
      device: { width: 390, height: 844, label: 'phone' },
      seed: 42,
      runner: 'trusted-qa-runner',
    };
    expect(evaluateNaturalFlowAgainstPolicy(bound, policy, { expectedBuildHash: hash })).toMatchObject({ passed: true, blockers: [] });
  });
});
