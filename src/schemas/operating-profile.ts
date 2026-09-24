import { z } from 'zod';
import { CostBudgetSchema, DistributionPlatformSchema } from './factory-operating.js';
import { LaunchThresholdsSchema } from './launch-operations.js';

const PlatformCapacitySchema = z.object({
  platform: DistributionPlatformSchema,
  /** Maximum active titles the configured account is expected to carry. This is
   * a planning limit, not a claim about a platform's current policy. */
  maxGames: z.number().int().positive(),
}).strict();

export const FactoryOperatingProfileSchema = z.object({
  schemaVersion: z.literal(1),
  /** Reference games default to the compact preview lane; release work stays explicit. */
  pipelineMode: z.enum(['replica-preview', 'fast-reskin', 'full-validation']).default('replica-preview'),
  entity: z.enum(['personal', 'sole_proprietor', 'company', 'publisher']),
  monetization: z.literal('IAA'),
  appDistribution: z.literal(false),
  requiredTargets: z.array(z.enum(['wechat-minigame', 'douyin-minigame', 'taptap-minigame'])).length(3),
  optionalTargets: z.array(DistributionPlatformSchema),
  platformPriority: z.array(DistributionPlatformSchema).min(1).default(['douyin-minigame', 'wechat-minigame', 'taptap-minigame']),
  accountCapacities: z.array(PlatformCapacitySchema).min(1).default([
    { platform: 'wechat-minigame', maxGames: 5 },
    { platform: 'douyin-minigame', maxGames: 50 },
    { platform: 'taptap-minigame', maxGames: 20 },
    { platform: 'poki-web', maxGames: 20 },
    { platform: 'crazygames-web', maxGames: 20 },
  ]),
  /** Keep this false for local prototype runs; production release profiles turn
   * it on after the human has supplied the platform paperwork. */
  certificationRequired: z.boolean().default(false),
  /** Production profiles can turn these optional evidence families into hard gates. */
  platformQaRequired: z.boolean().default(true),
  presentationQualityRequired: z.boolean().default(false),
  blindPlaytestRequired: z.boolean().default(false),
  liveVerificationRequired: z.boolean().default(false),
  supplyChainRequired: z.boolean().default(false),
  /** Keep portfolio expansion behind a measured first-game result. */
  portfolioGateRequired: z.boolean().default(false),
  /** Require every build dependency to appear in the reviewed allowlist. */
  dependencyAllowlistRequired: z.boolean().default(false),
  /** Require an operator-verified snapshot of current platform rules. */
  platformPolicyRequired: z.boolean().default(false),
  factoryEvalOnChange: z.boolean().default(true),
  /** Deterministic alpha/provenance scanner is opt-in for mock assets. */
  artQualityRequired: z.boolean().default(false),
  autoAbandonOnCostCap: z.boolean().default(true),
  launchThresholds: LaunchThresholdsSchema.default({
    minimumUsers: 100,
    minimumObservedDays: 3,
    maxCrashRate: 0.05,
    minSessionCompletionRate: 0.25,
    minAdShowRate: 0.2,
    minEcpmCents: 1,
    minD1Retention: null,
    minOrganicShare: null,
    marketKill: { enabled: false, minimumUsers: 100, minimumObservedDays: 3, maxCrashRate: 0.2, minD1Retention: null, minEcpmCents: null },
  }),
  paidTraffic: z.object({ enabled: z.boolean(), maxBudgetCents: z.number().int().nonnegative() }).strict(),
  budget: CostBudgetSchema,
  humanApprovalSessions: z.array(z.enum(['GO_NO_GO', 'CORE_DEMO', 'FINAL_RELEASE'])).length(3),
  deviceBaselines: z.array(z.object({ width: z.number().int().positive(), height: z.number().int().positive(), label: z.string().trim().min(1) }).strict()).min(1),
}).strict().superRefine((profile, context) => {
  const domestic = ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'] as const;
  if (new Set(profile.requiredTargets).size !== domestic.length || domestic.some((target) => !profile.requiredTargets.includes(target))) {
    context.addIssue({ code: 'custom', path: ['requiredTargets'], message: 'requiredTargets must contain WeChat, Douyin and TapTap exactly once' });
  }
  if (new Set(profile.optionalTargets).size !== profile.optionalTargets.length) {
    context.addIssue({ code: 'custom', path: ['optionalTargets'], message: 'optionalTargets must be unique' });
  }
  if (new Set(profile.platformPriority).size !== profile.platformPriority.length) {
    context.addIssue({ code: 'custom', path: ['platformPriority'], message: 'platformPriority must be unique' });
  }
  const selectedTargets = new Set([...profile.requiredTargets, ...profile.optionalTargets]);
  for (const target of profile.platformPriority) {
    if (!selectedTargets.has(target)) context.addIssue({ code: 'custom', path: ['platformPriority'], message: `platformPriority contains an unselected target: ${target}` });
  }
  const capacities = new Map(profile.accountCapacities.map((item) => [item.platform, item.maxGames]));
  if (capacities.size !== profile.accountCapacities.length) context.addIssue({ code: 'custom', path: ['accountCapacities'], message: 'accountCapacities must contain one entry per platform' });
  for (const target of selectedTargets) if (!capacities.has(target)) context.addIssue({ code: 'custom', path: ['accountCapacities'], message: `missing account capacity for ${target}` });
  if (profile.paidTraffic.enabled && profile.paidTraffic.maxBudgetCents <= 0) context.addIssue({ code: 'custom', path: ['paidTraffic', 'maxBudgetCents'], message: 'paid traffic must have a positive cap when enabled' });
  if (profile.optionalTargets.some((target) => profile.requiredTargets.includes(target as never))) context.addIssue({ code: 'custom', path: ['optionalTargets'], message: 'optional targets must not duplicate required domestic targets' });
});
export type FactoryOperatingProfile = z.infer<typeof FactoryOperatingProfileSchema>;
