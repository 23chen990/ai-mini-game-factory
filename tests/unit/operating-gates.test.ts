import { describe, expect, it } from 'vitest';
import { buildBusinessPreflightTemplate, evaluateOperatingGates } from '../../src/core/operating-gates.js';
import { evaluateCompletionGates } from '../../src/core/completion-gates.js';
import { buildPlatformReleaseMatrix } from '../../src/core/factory-operating.js';

const hash = 'c'.repeat(64);

describe('operating gates', () => {
  it('creates an explicit PAUSE template instead of assuming account, rights or payout readiness', () => {
    const preflight = buildBusinessPreflightTemplate({ targets: ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'], budget: { currency: 'CNY', maxTotalCents: 30_000, maxPaidTrafficCents: 10_000, maxAgentTokens: 500_000, maxHumanMinutes: 360, maxFixAttempts: 2, paybackWindowDays: 30 } });
    expect(preflight.decision).toBe('PAUSE');
    expect(preflight.unknowns).toEqual(expect.arrayContaining(['rights', 'payout', 'wechat-minigame']));
  });

  it('requires every quality and operating gate before release', () => {
    const completion = evaluateCompletionGates({
      core: { passed: true, evidence: ['core'] }, normalFlow: { passed: true, evidence: ['flow'] }, visualEvidence: { passed: true, evidence: ['visual'] }, levelDifference: { passed: true, evidence: ['variation'] }, humanPlaytest: { passed: true, evidence: ['human'] },
    });
    const platform = buildPlatformReleaseMatrix({ gameId: 'g', coreHash: hash, primaryPlatform: 'douyin-minigame', targets: ['douyin-minigame'] });
    const blocked = evaluateOperatingGates({ completion, qaEvidence: [], business: buildBusinessPreflightTemplate({ targets: ['douyin-minigame'], budget: completionBudget() }), platform });
    expect(blocked.passed).toBe(false);
    expect(blocked.blockers).toEqual(expect.arrayContaining(['business-preflight', 'platform-release-matrix', 'natural-e2e']));
  });
});

function completionBudget() {
  return { currency: 'CNY' as const, maxTotalCents: 30_000, maxPaidTrafficCents: 10_000, maxAgentTokens: 500_000, maxHumanMinutes: 360, maxFixAttempts: 2, paybackWindowDays: 30 };
}
