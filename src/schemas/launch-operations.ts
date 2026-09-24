import { z } from 'zod';
import { CostBudgetSchema, CostUsageSchema, DistributionPlatformSchema } from './factory-operating.js';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);
const DateTime = z.string().datetime();

export const CertificationKindSchema = z.enum([
  'SOFTWARE_COPYRIGHT',
  'SELF_REVIEW_REPORT',
  'MINIGAME_FILING',
  'ICP_FILING',
  'PLATFORM_REVIEW',
  'PRIVACY_POLICY',
  'ANTI_ADDICTION',
]);
export type CertificationKind = z.infer<typeof CertificationKindSchema>;

export const CertificationStatusSchema = z.enum(['pending', 'in_progress', 'ready', 'blocked', 'waived']);
export type CertificationStatus = z.infer<typeof CertificationStatusSchema>;

export const CertificationItemSchema = z.object({
  id: Text,
  kind: CertificationKindSchema,
  platform: DistributionPlatformSchema.nullable(),
  required: z.boolean(),
  status: CertificationStatusSchema,
  owner: z.enum(['human', 'agent']),
  evidence: z.array(Text),
  notes: z.array(Text),
  updatedAt: DateTime,
}).strict().superRefine((item, context) => {
  if (item.required && ['ready', 'waived'].includes(item.status) && item.evidence.length === 0) {
    context.addIssue({ code: 'custom', path: ['evidence'], message: 'ready certification items require evidence' });
  }
  if (item.status === 'waived' && item.notes.length === 0) {
    context.addIssue({ code: 'custom', path: ['notes'], message: 'waived certification items require a written reason' });
  }
  if (['MINIGAME_FILING', 'PLATFORM_REVIEW'].includes(item.kind) && item.platform === null) {
    context.addIssue({ code: 'custom', path: ['platform'], message: `${item.kind} must identify a platform` });
  }
  if (!['MINIGAME_FILING', 'PLATFORM_REVIEW'].includes(item.kind) && item.platform !== null) {
    context.addIssue({ code: 'custom', path: ['platform'], message: `${item.kind} is not platform-specific` });
  }
});
export type CertificationItem = z.infer<typeof CertificationItemSchema>;

export const CertificationChecklistSchema = z.object({
  schemaVersion: z.literal(1),
  gameId: Text,
  title: Text,
  entity: z.enum(['personal', 'sole_proprietor', 'company', 'publisher']),
  items: z.array(CertificationItemSchema).min(1),
  naming: z.object({
    gameName: Text,
    softwareCopyrightName: Text,
    exactMatchPlatforms: z.array(DistributionPlatformSchema),
  }).strict(),
  blockers: z.array(Text),
  unknowns: z.array(Text),
  ready: z.boolean(),
  updatedAt: DateTime,
}).strict().superRefine((checklist, context) => {
  const ids = checklist.items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['items'], message: 'certification item ids must be unique' });
  if (checklist.naming.exactMatchPlatforms.length !== new Set(checklist.naming.exactMatchPlatforms).size) {
    context.addIssue({ code: 'custom', path: ['naming', 'exactMatchPlatforms'], message: 'exact-match platforms must be unique' });
  }
  if (checklist.naming.exactMatchPlatforms.length > 0 && checklist.naming.gameName !== checklist.naming.softwareCopyrightName) {
    context.addIssue({ code: 'custom', path: ['naming'], message: 'game name and software copyright name must match on exact-match platforms' });
  }
  const unresolved = checklist.items.some((item) => item.required && !['ready', 'waived'].includes(item.status));
  const derivedReady = !unresolved && checklist.blockers.length === 0 && checklist.unknowns.length === 0;
  if (checklist.ready !== derivedReady) context.addIssue({ code: 'custom', path: ['ready'], message: 'ready must be derived from required items, blockers and unknowns' });
});
export type CertificationChecklist = z.infer<typeof CertificationChecklistSchema>;

export const LaunchThresholdsSchema = z.object({
  minimumUsers: z.number().int().positive(),
  minimumObservedDays: z.number().int().positive(),
  maxCrashRate: z.number().min(0).max(1),
  minSessionCompletionRate: z.number().min(0).max(1),
  minAdShowRate: z.number().min(0).max(1),
  minEcpmCents: z.number().nonnegative(),
  /** Optional market-quality gates; null keeps a pre-launch profile compatible. */
  minD1Retention: z.number().min(0).max(1).nullable().default(null),
  minOrganicShare: z.number().min(0).max(1).nullable().default(null),
  marketKill: z.object({
    enabled: z.boolean().default(false),
    minimumUsers: z.number().int().positive().default(100),
    minimumObservedDays: z.number().int().positive().default(3),
    maxCrashRate: z.number().min(0).max(1).default(0.2),
    minD1Retention: z.number().min(0).max(1).nullable().default(null),
    minEcpmCents: z.number().nonnegative().nullable().default(null),
  }).strict().default({ enabled: false, minimumUsers: 100, minimumObservedDays: 3, maxCrashRate: 0.2, minD1Retention: null, minEcpmCents: null }),
}).strict();
export type LaunchThresholds = z.infer<typeof LaunchThresholdsSchema>;

export const LaunchMetricSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  gameId: Text,
  platform: DistributionPlatformSchema,
  releaseHash: Sha256,
  starts: z.number().int().nonnegative(),
  users: z.number().int().nonnegative(),
  observedDays: z.number().int().nonnegative(),
  d1Retention: z.number().min(0).max(1).nullable(),
  sessionCompletionRate: z.number().min(0).max(1),
  crashRate: z.number().min(0).max(1),
  adShowRate: z.number().min(0).max(1),
  adCompletionRate: z.number().min(0).max(1),
  eCPMCents: z.number().nonnegative(),
  netRevenueCents: z.number().int().nonnegative(),
  spendCents: z.number().int().nonnegative(),
  organicShare: z.number().min(0).max(1),
  dataQuality: z.enum(['observed', 'partial', 'estimated']),
  notes: z.array(Text),
  observedAt: DateTime,
}).strict();
export type LaunchMetricSnapshot = z.infer<typeof LaunchMetricSnapshotSchema>;

export const LaunchDecisionSchema = z.object({
  schemaVersion: z.literal(1),
  gameId: Text,
  platform: DistributionPlatformSchema,
  releaseHash: Sha256,
  decision: z.enum(['COLLECTING', 'SCALE', 'ITERATE_ONCE', 'KILL']),
  users: z.number().int().nonnegative(),
  spendCents: z.number().int().nonnegative(),
  netRevenueCents: z.number().int().nonnegative(),
  cpiCents: z.number().nonnegative(),
  netLtvCents: z.number().nonnegative(),
  blockers: z.array(Text),
  rationale: Text,
  decidedAt: DateTime,
}).strict();
export type LaunchDecision = z.infer<typeof LaunchDecisionSchema>;

export const AbandonmentDecisionSchema = z.object({
  schemaVersion: z.literal(1),
  runId: Text,
  stage: Text,
  decision: z.enum(['CONTINUE', 'PAUSE', 'ABANDON']),
  reason: z.enum(['within-budget', 'cost-cap', 'fix-cap', 'manual', 'platform-blocked', 'market-kill', 'unknown']),
  budget: CostBudgetSchema,
  usage: CostUsageSchema,
  evidence: z.array(Text).min(1),
  decidedAt: DateTime,
}).strict();
export type AbandonmentDecision = z.infer<typeof AbandonmentDecisionSchema>;
