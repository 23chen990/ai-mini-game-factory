import { describe, expect, it } from 'vitest';
import { GrowthExperimentSchema } from '../../src/schemas/factory-operating.js';
import { decideGrowthExperiment, makeGrowthExperiment } from '../../src/core/factory-operating.js';

describe('growth and IAA loop', () => {
  it('creates both organic and paid plans without granting paid traffic an automatic pass', () => {
    const plan = makeGrowthExperiment({ gameId: 'game-1', platform: 'douyin-minigame', maxBudgetCents: 5_000 });
    expect(plan.channels.map((channel) => channel.kind)).toEqual(['organic', 'paid']);
    expect(GrowthExperimentSchema.parse(plan).channels[1]?.stopRules.length).toBeGreaterThan(0);
  });

  it('kills paid growth when conservative net LTV cannot cover CPI', () => {
    const decision = decideGrowthExperiment({
      platform: 'douyin-minigame',
      channel: 'paid',
      users: 100,
      spendCents: 20_000,
      netRevenueCents: 5_000,
      observedDays: 7,
      minimumUsers: 50,
      paybackWindowDays: 14,
    });
    expect(decision.decision).toBe('KILL');
    expect(decision.blockers).toContain('cpi-above-conservative-ltv');
  });
});
