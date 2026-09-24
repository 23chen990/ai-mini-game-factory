import { describe, expect, it } from 'vitest';
import { FactoryOperatingProfileSchema } from '../../src/schemas/operating-profile.js';
import { defaultOperatingProfile, mergeOperatingProfile } from '../../src/core/operating-profile.js';
import { buildBusinessStrategy } from '../../src/core/business-strategy.js';

describe('factory operating profile', () => {
  it('defaults to one-person, IAA-only, domestic mini-games with optional capped overseas rollout', () => {
    const profile = defaultOperatingProfile();
    expect(FactoryOperatingProfileSchema.parse(profile)).toMatchObject({ entity: 'personal', monetization: 'IAA', appDistribution: false, humanApprovalSessions: ['GO_NO_GO', 'CORE_DEMO', 'FINAL_RELEASE'] });
    expect(profile.requiredTargets).toEqual(['wechat-minigame', 'douyin-minigame', 'taptap-minigame']);
    expect(profile.optionalTargets).toContain('poki-web');
    expect(profile.platformPolicyRequired).toBe(false);
    expect(profile.budget.maxFixAttempts).toBeUndefined();
  });

  it('merges only validated overrides and never enables uncapped paid traffic', () => {
    const profile = mergeOperatingProfile({ paidTraffic: { enabled: true, maxBudgetCents: 12_000 } });
    expect(profile.paidTraffic).toMatchObject({ enabled: true, maxBudgetCents: 12_000 });
    expect(() => mergeOperatingProfile({ paidTraffic: { enabled: true, maxBudgetCents: 0 } })).toThrow();
  });

  it('derives a one-person IAA strategy with organic-first and capped paid traffic', () => {
    const strategy = buildBusinessStrategy(defaultOperatingProfile());
    expect(strategy).toMatchObject({ entity: 'personal', monetization: 'IAA', appDistribution: false, traffic: { organicFirst: true, paidEnabled: false, maxBudgetCents: 0 } });
    expect(strategy.targetPlatforms).toEqual(expect.arrayContaining(['wechat-minigame', 'douyin-minigame', 'taptap-minigame']));
    expect(strategy.credentialChecklist.length).toBeGreaterThan(0);
  });
});
