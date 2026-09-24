import { BusinessStrategySchema, type BusinessStrategy } from '../schemas/business-strategy.js';
import type { FactoryOperatingProfile } from '../schemas/operating-profile.js';
import { sha256Text } from './files.js';

/** Derive a bounded launch/traffic plan from the validated operating profile. */
export function buildBusinessStrategy(profile: FactoryOperatingProfile): BusinessStrategy {
  const targetPlatforms = [...new Set([...profile.requiredTargets, ...profile.optionalTargets])];
  const paidEnabled = profile.paidTraffic.enabled;
  const maxBudgetCents = profile.paidTraffic.maxBudgetCents;
  return BusinessStrategySchema.parse({
    schemaVersion: 1,
    strategyId: `strategy-${sha256Text(JSON.stringify({ entity: profile.entity, targets: targetPlatforms, paidEnabled, maxBudgetCents })).slice(0, 16)}`,
    entity: profile.entity,
    monetization: 'IAA',
    appDistribution: false,
    targetPlatforms,
    platformPriority: profile.platformPriority,
    traffic: {
      organicFirst: true,
      paidEnabled,
      maxBudgetCents,
      paidShareCap: paidEnabled && profile.budget.maxTotalCents > 0 ? Math.min(1, maxBudgetCents / profile.budget.maxTotalCents) : 0,
      channels: paidEnabled ? ['platform-discovery', 'short-video', 'community', 'cross-promo', 'paid-acquisition'] : ['platform-discovery', 'short-video', 'community', 'cross-promo'],
    },
    launch: {
      maxTitlesInFlight: 1,
      minimumObservedDays: profile.launchThresholds.minimumObservedDays,
      iterateAtMostOnce: true,
      killSignals: ['crash-rate-over-threshold', 'paid-cac-not-recovered', 'repeated-core-experience-failure', 'unresolved-platform-or-rights-blocker'],
    },
    credentialChecklist: ['platform account ownership', 'developer/mini-game access', 'IAA provider account and payout path', 'privacy and filing materials'],
    rightsChecklist: ['reference expression separated from original expression', 'asset source and license evidence recorded', 'third-party names/logos excluded', 'unverified infrastructure rejected'],
    assumptions: ['short-session 2D/lightweight products', 'IAA is optional and never required to complete the core loop', 'organic discovery is attempted before scaling paid traffic', 'platform rules and account eligibility are verified by a human before release'],
    generatedAt: new Date().toISOString(),
  });
}
