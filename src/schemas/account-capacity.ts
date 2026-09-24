import { z } from 'zod';
import { DistributionPlatformSchema } from './factory-operating.js';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);
const CapacitySchema = z.object({ platform: DistributionPlatformSchema, maxGames: z.number().int().positive() }).strict();
const CountSchema = z.object({ platform: DistributionPlatformSchema, activeGames: z.number().int().nonnegative(), reservedGames: z.number().int().nonnegative().default(0) }).strict();

export const AccountCapacityPlanSchema = z.object({
  schemaVersion: z.literal(1),
  entity: z.enum(['personal', 'sole_proprietor', 'company', 'publisher']),
  capacities: z.array(CapacitySchema).min(1),
  activeCounts: z.array(CountSchema).min(1),
  blockers: z.array(Text).default([]),
  source: z.enum(['portfolio', 'default-zero', 'manual']).default('default-zero'),
  /** Hash of the operator-maintained cross-run portfolio used to derive the
   * counts below.  A plan made from a portfolio must carry this binding so a
   * later run cannot silently reuse stale capacity numbers. */
  portfolioSnapshotHash: Sha256.optional(),
  portfolioUpdatedAt: z.string().datetime().optional(),
  generatedAt: z.string().datetime(),
}).strict().superRefine((plan, context) => {
  if (new Set(plan.capacities.map((item) => item.platform)).size !== plan.capacities.length) context.addIssue({ code: 'custom', path: ['capacities'], message: 'capacity platforms must be unique' });
  if (new Set(plan.activeCounts.map((item) => item.platform)).size !== plan.activeCounts.length) context.addIssue({ code: 'custom', path: ['activeCounts'], message: 'active count platforms must be unique' });
  if (plan.portfolioSnapshotHash && !plan.portfolioUpdatedAt) context.addIssue({ code: 'custom', path: ['portfolioUpdatedAt'], message: 'portfolioUpdatedAt is required when a portfolio snapshot hash is present' });
});
export type AccountCapacityPlan = z.infer<typeof AccountCapacityPlanSchema>;

export const AccountCapacityReportSchema = z.object({
  schemaVersion: z.literal(1),
  entity: z.enum(['personal', 'sole_proprietor', 'company', 'publisher']),
  passed: z.boolean(),
  blockers: z.array(Text),
  utilization: z.array(z.object({ platform: DistributionPlatformSchema, used: z.number().int().nonnegative(), capacity: z.number().int().positive(), remaining: z.number().int() }).strict()),
  portfolioSnapshotHash: Sha256.optional(),
  portfolioUpdatedAt: z.string().datetime().optional(),
  generatedAt: z.string().datetime(),
}).strict().superRefine((report, context) => {
  if (report.passed && report.blockers.length > 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'passed capacity report cannot retain blockers' });
  if (report.portfolioSnapshotHash && !report.portfolioUpdatedAt) context.addIssue({ code: 'custom', path: ['portfolioUpdatedAt'], message: 'portfolioUpdatedAt is required when a portfolio snapshot hash is present' });
});
export type AccountCapacityReport = z.infer<typeof AccountCapacityReportSchema>;

export const AccountPortfolioEntrySchema = z.object({
  gameId: Text,
  platform: DistributionPlatformSchema,
  status: z.enum(['active', 'reserved', 'retired']),
  releaseHash: z.string().regex(/^[a-f0-9]{64}$/iu).optional(),
  note: Text.optional(),
  updatedAt: z.string().datetime(),
}).strict();
export type AccountPortfolioEntry = z.infer<typeof AccountPortfolioEntrySchema>;

export const AccountPortfolioSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(AccountPortfolioEntrySchema),
  updatedAt: z.string().datetime(),
}).strict().superRefine((portfolio, context) => {
  const keys = portfolio.entries.map((entry) => `${entry.gameId}:${entry.platform}`);
  if (new Set(keys).size !== keys.length) context.addIssue({ code: 'custom', path: ['entries'], message: 'portfolio game/platform entries must be unique' });
});
export type AccountPortfolio = z.infer<typeof AccountPortfolioSchema>;
