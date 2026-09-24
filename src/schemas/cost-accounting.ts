import { z } from 'zod';
import { CostBlockerSchema, CostBudgetSchema, CostUsageSchema } from './factory-operating.js';

const Text = z.string().trim().min(1);

/** A versioned, operator-controlled price card.  Prices are deliberately
 * expressed in integer CNY cents so a run can be audited without floating
 * point or exchange-rate ambiguity. */
export const CostRateCardSchema = z.object({
  schemaVersion: z.literal(1),
  currency: z.literal('CNY'),
  agentInputCentsPer1k: z.number().nonnegative(),
  agentOutputCentsPer1k: z.number().nonnegative(),
  imageCallCents: z.number().nonnegative(),
  humanMinuteCents: z.number().nonnegative(),
  source: Text,
  effectiveAt: z.string().datetime(),
}).strict();
export type CostRateCard = z.infer<typeof CostRateCardSchema>;

export const CostAdjustmentKindSchema = z.enum(['paid-traffic', 'human-time', 'other']);
export type CostAdjustmentKind = z.infer<typeof CostAdjustmentKindSchema>;

/** External spend and human time are recorded explicitly rather than inferred
 * from model output.  Entries are append-only in normal operation. */
export const CostAdjustmentEntrySchema = z.object({
  id: Text,
  kind: CostAdjustmentKindSchema,
  cents: z.number().int().nonnegative(),
  /** Optional measured minutes for human-time entries; money remains explicit. */
  minutes: z.number().int().nonnegative().optional(),
  note: Text,
  source: Text.optional(),
  recordedAt: z.string().datetime(),
}).strict();
export type CostAdjustmentEntry = z.infer<typeof CostAdjustmentEntrySchema>;

export const CostAdjustmentLedgerSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(CostAdjustmentEntrySchema),
  updatedAt: z.string().datetime(),
}).strict().superRefine((ledger, context) => {
  const ids = ledger.entries.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['entries'], message: 'cost adjustment ids must be unique' });
});
export type CostAdjustmentLedger = z.infer<typeof CostAdjustmentLedgerSchema>;

export const CostStageReserveSchema = z.object({
  agentTokens: z.number().int().nonnegative().default(0),
  /** Optional split for conservative pricing; legacy callers may provide only
   * the aggregate agentTokens field. */
  agentInputTokens: z.number().int().nonnegative().default(0),
  agentOutputTokens: z.number().int().nonnegative().default(0),
  imageCalls: z.number().int().nonnegative().default(0),
  humanMinutes: z.number().int().nonnegative().default(0),
  wallClockMinutes: z.number().int().nonnegative().default(0),
  assetBatches: z.number().int().nonnegative().default(0),
  buildAttempts: z.number().int().nonnegative().default(0),
  repairLoops: z.number().int().nonnegative().default(0),
}).strict().superRefine((reserve, context) => {
  const split = reserve.agentInputTokens + reserve.agentOutputTokens;
  if (split > 0 && reserve.agentTokens > 0 && split > reserve.agentTokens) {
    context.addIssue({ code: 'custom', path: ['agentTokens'], message: 'agent input/output token split cannot exceed aggregate agentTokens' });
  }
});
export type CostStageReserve = z.infer<typeof CostStageReserveSchema>;

export const CostPreflightReportSchema = z.object({
  schemaVersion: z.literal(1),
  stage: Text,
  current: CostUsageSchema,
  projected: CostUsageSchema,
  passed: z.boolean(),
  currentBlockers: z.array(CostBlockerSchema),
  projectedBlockers: z.array(CostBlockerSchema),
  reserve: CostStageReserveSchema,
  checkedAt: z.string().datetime(),
}).strict().superRefine((report, context) => {
  if (report.passed && (report.currentBlockers.length > 0 || report.projectedBlockers.length > 0)) context.addIssue({ code: 'custom', message: 'passed cost preflight cannot retain blockers' });
  if (report.currentBlockers.some((item) => !report.projectedBlockers.includes(item)) && !report.projectedBlockers.length) context.addIssue({ code: 'custom', path: ['projectedBlockers'], message: 'projected blockers must include current blockers' });
});
export type CostPreflightReport = z.infer<typeof CostPreflightReportSchema>;

export type CostStageUsage = {
  stage: string;
  attempts?: number;
  providerCalls?: { agent?: number; image?: number };
  tokenUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
};

export { CostBlockerSchema, CostBudgetSchema, CostUsageSchema };
