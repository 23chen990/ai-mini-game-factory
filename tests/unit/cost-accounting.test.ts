import { describe, expect, it } from 'vitest';
import { deriveCostUsage, evaluateCostPreflight, projectStageUsage } from '../../src/core/cost-accounting.js';
import { CostAdjustmentLedgerSchema, CostRateCardSchema, CostPreflightReportSchema } from '../../src/schemas/cost-accounting.js';
import { CostBudgetSchema } from '../../src/schemas/factory-operating.js';

const budget = CostBudgetSchema.parse({
  currency: 'CNY',
  maxTotalCents: 1_000,
  maxPaidTrafficCents: 300,
  maxAgentTokens: 10_000,
  maxHumanMinutes: 60,
  maxFixAttempts: 2,
  paybackWindowDays: 30,
  maxWallClockMinutes: 120,
  maxAssetBatches: 4,
  maxBuildAttempts: 2,
  maxRepairLoops: 2,
});

describe('cost accounting and preflight', () => {
  it('turns stage token/image usage and explicit adjustments into auditable CNY cents', () => {
    const rateCard = CostRateCardSchema.parse({
      schemaVersion: 1,
      currency: 'CNY',
      agentInputCentsPer1k: 2,
      agentOutputCentsPer1k: 4,
      imageCallCents: 25,
      humanMinuteCents: 10,
      source: 'test-rate-card',
      effectiveAt: new Date().toISOString(),
    });
    const adjustments = CostAdjustmentLedgerSchema.parse({
      schemaVersion: 1,
      entries: [
        { id: 'paid-1', kind: 'paid-traffic', cents: 80, note: 'small capped test', recordedAt: new Date().toISOString() },
        { id: 'other-1', kind: 'other', cents: 20, note: 'review', recordedAt: new Date().toISOString() },
      ],
      updatedAt: new Date().toISOString(),
    });
    const usage = deriveCostUsage([
      { stage: 'FULL_BUILD', attempts: 1, providerCalls: { agent: 1, image: 2 }, tokenUsage: { inputTokens: 1_500, outputTokens: 500, totalTokens: 2_000 } },
    ], { rateCard, adjustments, humanMinutes: 2, wallClockMinutes: 3, buildAttempts: 1 });
    expect(usage.agentTokens).toBe(2_000);
    expect(usage.paidTrafficCents).toBe(80);
    expect(usage.totalCents).toBe(175);
    expect(usage.breakdown).toMatchObject({ agentCents: 5, imageCents: 50, adjustmentCents: 100, humanCents: 20 });
  });

  it('projects the next stage and stops before a hard ceiling is crossed', () => {
    const current = deriveCostUsage([], { rateCard: CostRateCardSchema.parse({ schemaVersion: 1, currency: 'CNY', agentInputCentsPer1k: 1, agentOutputCentsPer1k: 1, imageCallCents: 10, humanMinuteCents: 1, source: 'test', effectiveAt: new Date().toISOString() }) });
    const projected = projectStageUsage(current, 'FULL_BUILD', { agentTokens: 20_000, buildAttempts: 1 });
    const report = evaluateCostPreflight({ budget, current, projected, stage: 'FULL_BUILD' });
    expect(report.passed).toBe(false);
    expect(report.projectedBlockers).toContain('agent-tokens');
    expect(CostPreflightReportSchema.parse(report).stage).toBe('FULL_BUILD');
  });

  it('uses separate input and output token reserves when projecting model cost', () => {
    const rateCard = CostRateCardSchema.parse({ schemaVersion: 1, currency: 'CNY', agentInputCentsPer1k: 2, agentOutputCentsPer1k: 5, imageCallCents: 0, humanMinuteCents: 0, source: 'test', effectiveAt: new Date().toISOString() });
    const projected = projectStageUsage(deriveCostUsage([], { rateCard }), 'BLUEPRINT', { agentTokens: 1_000, agentInputTokens: 800, agentOutputTokens: 200 }, rateCard);
    expect(projected.agentTokens).toBe(1_000);
    expect(projected.totalCents).toBe(3);
  });
});
