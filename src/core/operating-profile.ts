import { FactoryOperatingProfileSchema, type FactoryOperatingProfile } from '../schemas/operating-profile.js';

export function defaultOperatingProfile(): FactoryOperatingProfile {
  return FactoryOperatingProfileSchema.parse({
    schemaVersion: 1,
    pipelineMode: 'replica-preview',
    entity: 'personal',
    monetization: 'IAA',
    appDistribution: false,
    requiredTargets: ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'],
    optionalTargets: ['poki-web'],
    platformPriority: ['douyin-minigame', 'wechat-minigame', 'taptap-minigame', 'poki-web'],
    accountCapacities: [
      { platform: 'wechat-minigame', maxGames: 5 },
      { platform: 'douyin-minigame', maxGames: 50 },
      { platform: 'taptap-minigame', maxGames: 20 },
      { platform: 'poki-web', maxGames: 20 },
    ],
    certificationRequired: false,
    platformQaRequired: true,
    presentationQualityRequired: false,
    blindPlaytestRequired: false,
    liveVerificationRequired: false,
    supplyChainRequired: false,
    portfolioGateRequired: false,
    dependencyAllowlistRequired: false,
    platformPolicyRequired: false,
    factoryEvalOnChange: true,
    artQualityRequired: false,
    autoAbandonOnCostCap: true,
    launchThresholds: { minimumUsers: 100, minimumObservedDays: 3, maxCrashRate: 0.05, minSessionCompletionRate: 0.25, minAdShowRate: 0.2, minEcpmCents: 1 },
    paidTraffic: { enabled: false, maxBudgetCents: 0 },
    budget: { currency: 'CNY', maxTotalCents: 30_000, maxPaidTrafficCents: 10_000, maxAgentTokens: 500_000, maxHumanMinutes: 360, paybackWindowDays: 30, maxWallClockMinutes: 24 * 60, maxAssetBatches: 20, maxBuildAttempts: 2, maxRepairLoops: 2 },
    humanApprovalSessions: ['GO_NO_GO', 'CORE_DEMO', 'FINAL_RELEASE'],
    deviceBaselines: [{ width: 360, height: 800, label: 'small-phone' }, { width: 390, height: 844, label: 'baseline-phone' }, { width: 430, height: 932, label: 'large-phone' }],
  });
}

export function mergeOperatingProfile(overrides: Partial<FactoryOperatingProfile>): FactoryOperatingProfile {
  const base = defaultOperatingProfile();
  return FactoryOperatingProfileSchema.parse({
    ...base,
    ...overrides,
    paidTraffic: { ...base.paidTraffic, ...(overrides.paidTraffic ?? {}) },
    budget: { ...base.budget, ...(overrides.budget ?? {}) },
    launchThresholds: { ...base.launchThresholds, ...(overrides.launchThresholds ?? {}) },
    deviceBaselines: overrides.deviceBaselines ?? base.deviceBaselines,
    requiredTargets: overrides.requiredTargets ?? base.requiredTargets,
    optionalTargets: overrides.optionalTargets ?? base.optionalTargets,
    platformPriority: overrides.platformPriority ?? base.platformPriority,
    accountCapacities: overrides.accountCapacities ?? base.accountCapacities,
    humanApprovalSessions: overrides.humanApprovalSessions ?? base.humanApprovalSessions,
  });
}
