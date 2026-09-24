import { z } from 'zod';
import { DistributionPlatformSchema } from './factory-operating.js';

const Text = z.string().trim().min(1);

/** Operational choices for a small one-person factory; this is planning data,
 * not a claim about any platform's current approval or revenue policy. */
export const BusinessStrategySchema = z.object({
  schemaVersion: z.literal(1),
  strategyId: Text,
  entity: z.enum(['personal', 'sole_proprietor', 'company', 'publisher']),
  monetization: z.literal('IAA'),
  appDistribution: z.literal(false),
  targetPlatforms: z.array(DistributionPlatformSchema).min(3),
  platformPriority: z.array(DistributionPlatformSchema).min(1),
  traffic: z.object({
    organicFirst: z.boolean(),
    paidEnabled: z.boolean(),
    maxBudgetCents: z.number().int().nonnegative(),
    paidShareCap: z.number().min(0).max(1),
    channels: z.array(z.enum(['platform-discovery', 'short-video', 'community', 'cross-promo', 'paid-acquisition'])).min(1),
  }).strict(),
  launch: z.object({
    maxTitlesInFlight: z.number().int().positive(),
    minimumObservedDays: z.number().int().positive(),
    iterateAtMostOnce: z.boolean(),
    killSignals: z.array(Text).min(1),
  }).strict(),
  credentialChecklist: z.array(Text).min(1),
  rightsChecklist: z.array(Text).min(1),
  assumptions: z.array(Text).min(1),
  generatedAt: z.string().datetime(),
}).strict().superRefine((strategy, context) => {
  if (new Set(strategy.targetPlatforms).size !== strategy.targetPlatforms.length) context.addIssue({ code: 'custom', path: ['targetPlatforms'], message: 'target platforms must be unique' });
  if (new Set(strategy.platformPriority).size !== strategy.platformPriority.length) context.addIssue({ code: 'custom', path: ['platformPriority'], message: 'platform priority must be unique' });
  if (strategy.traffic.paidEnabled && strategy.traffic.maxBudgetCents <= 0) context.addIssue({ code: 'custom', path: ['traffic', 'maxBudgetCents'], message: 'enabled paid acquisition requires a positive cap' });
  if (!strategy.traffic.paidEnabled && strategy.traffic.paidShareCap !== 0) context.addIssue({ code: 'custom', path: ['traffic', 'paidShareCap'], message: 'disabled paid acquisition must have a zero share cap' });
});
export type BusinessStrategy = z.infer<typeof BusinessStrategySchema>;
