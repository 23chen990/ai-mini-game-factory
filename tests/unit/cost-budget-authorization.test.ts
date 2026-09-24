import { describe, expect, it } from 'vitest';
import { evaluateCostBudgetAuthorization } from '../../src/core/cost-budget-authorization.js';
import { sha256Text } from '../../src/core/files.js';

const priorBudget = {
  currency: 'CNY' as const,
  maxTotalCents: 30_000,
  maxPaidTrafficCents: 10_000,
  maxAgentTokens: 500_000,
  maxHumanMinutes: 360,
  maxFixAttempts: 5,
  paybackWindowDays: 30,
  maxWallClockMinutes: 1_440,
  maxAssetBatches: 20,
  maxBuildAttempts: 2,
  maxRepairLoops: 2,
};
const usage = {
  totalCents: 0,
  paidTrafficCents: 0,
  agentTokens: 506_526,
  humanMinutes: 0,
  fixAttempts: 0,
  wallClockMinutes: 114,
  assetBatches: 0,
  buildAttempts: 0,
  repairLoops: 0,
  breakdown: { agentCents: 0, imageCents: 0, humanCents: 0, paidTrafficCents: 0, adjustmentCents: 0 },
};
const abandonment = {
  schemaVersion: 1 as const,
  runId: 'run-1',
  stage: 'REFERENCE_DEEP_RESEARCH',
  decision: 'ABANDON' as const,
  reason: 'cost-cap' as const,
  budget: priorBudget,
  usage,
  evidence: ['cost-or-fix-cap-exceeded'],
  decidedAt: new Date(0).toISOString(),
};
const abandonmentSha256 = sha256Text(JSON.stringify(abandonment));
const authorization = {
  schemaVersion: 1 as const,
  runId: 'run-1',
  scope: 'agent-token-cap' as const,
  abandonmentDecision: { path: 'artifacts/abandonment-decision.json' as const, sha256: abandonmentSha256 },
  previousMaxAgentTokens: 500_000,
  maxAgentTokens: 1_500_000,
  authorizedBy: 'human' as const,
  rationale: 'Continue the explicitly requested Luna quality run without repeating completed research.',
  authorizedAt: new Date().toISOString(),
};

describe('cost budget authorization', () => {
  it('reopens only a cost-abandoned run and changes only its agent-token ceiling', () => {
    const result = evaluateCostBudgetAuthorization({ state: { runId: 'run-1', stage: 'ABANDONED' }, abandonment, authorization, actualAbandonmentSha256: abandonmentSha256 });
    expect(result).toMatchObject({ resumeStage: 'REFERENCE_DEEP_RESEARCH', budget: { maxAgentTokens: 1_500_000 } });
    expect(result.budget).toEqual({ ...priorBudget, maxAgentTokens: 1_500_000 });
  });

  it('rejects an unbound decision or a ceiling that cannot cover measured usage', () => {
    expect(() => evaluateCostBudgetAuthorization({ state: { runId: 'run-1', stage: 'ABANDONED' }, abandonment, authorization, actualAbandonmentSha256: sha256Text('other') })).toThrow(/hash/i);
    expect(() => evaluateCostBudgetAuthorization({
      state: { runId: 'run-1', stage: 'ABANDONED' },
      abandonment,
      authorization: { ...authorization, maxAgentTokens: usage.agentTokens },
      actualAbandonmentSha256: abandonmentSha256,
    })).toThrow(/measured usage/i);
  });

  it('does not reopen manual, fix-cap, or non-terminal runs', () => {
    expect(() => evaluateCostBudgetAuthorization({ state: { runId: 'run-1', stage: 'QA' }, abandonment, authorization, actualAbandonmentSha256: abandonmentSha256 })).toThrow(/ABANDONED/i);
    expect(() => evaluateCostBudgetAuthorization({ state: { runId: 'run-1', stage: 'ABANDONED' }, abandonment: { ...abandonment, reason: 'fix-cap' }, authorization, actualAbandonmentSha256: abandonmentSha256 })).toThrow(/cost-cap/i);
  });
});
