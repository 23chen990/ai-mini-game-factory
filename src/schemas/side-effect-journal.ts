import { z } from 'zod';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);
const DateTime = z.string().datetime({ offset: true });

export const SideEffectStatusSchema = z.enum(['PENDING', 'SUCCEEDED', 'FAILED', 'RECONCILIATION_REQUIRED']);
export type SideEffectStatus = z.infer<typeof SideEffectStatusSchema>;

export const SideEffectRecordSchema = z.object({
  schemaVersion: z.literal(1),
  effectId: Text,
  operation: Text,
  idempotencyKey: Text,
  status: SideEffectStatusSchema,
  attempts: z.number().int().nonnegative(),
  resultHash: Sha256.optional(),
  error: Text.optional(),
  startedAt: DateTime,
  finishedAt: DateTime.nullable(),
  costCents: z.number().int().nonnegative().default(0),
}).strict().superRefine((record, context) => {
  if (record.status === 'SUCCEEDED' && (!record.resultHash || record.finishedAt === null)) {
    context.addIssue({ code: 'custom', message: 'succeeded side effects require a result hash and finishedAt' });
  }
  if (record.status === 'FAILED' && (!record.error || record.finishedAt === null)) {
    context.addIssue({ code: 'custom', message: 'failed side effects require an error and finishedAt' });
  }
  if (record.status === 'RECONCILIATION_REQUIRED' && record.finishedAt !== null) {
    context.addIssue({ code: 'custom', path: ['finishedAt'], message: 'reconciliation-required effects remain open until reconciled' });
  }
  if (record.status === 'PENDING' && record.finishedAt !== null) {
    context.addIssue({ code: 'custom', path: ['finishedAt'], message: 'pending effects cannot have finishedAt' });
  }
});
export type SideEffectRecord = z.infer<typeof SideEffectRecordSchema>;

export const SideEffectJournalSchema = z.object({
  schemaVersion: z.literal(1),
  runId: Text,
  records: z.array(SideEffectRecordSchema),
  updatedAt: DateTime,
}).strict().superRefine((journal, context) => {
  const effectIds = journal.records.map((record) => record.effectId);
  if (new Set(effectIds).size !== effectIds.length) context.addIssue({ code: 'custom', path: ['records'], message: 'side effect ids must be unique' });
  const keys = journal.records.map((record) => record.idempotencyKey);
  if (new Set(keys).size !== keys.length) context.addIssue({ code: 'custom', path: ['records'], message: 'idempotency keys must be unique' });
});
export type SideEffectJournal = z.infer<typeof SideEffectJournalSchema>;

export const SideEffectJournalEvaluationSchema = z.object({
  schemaVersion: z.literal(1),
  runId: Text,
  passed: z.boolean(),
  blockers: z.array(Text),
  open: z.array(Text),
  failed: z.array(Text),
  totalCostCents: z.number().int().nonnegative(),
  checkedAt: DateTime,
}).strict();
export type SideEffectJournalEvaluation = z.infer<typeof SideEffectJournalEvaluationSchema>;

/** Explicit operator/control-plane transition.  Keeping this separate from
 * the journal record prevents a caller from forging a terminal record without
 * going through the bounded transition rules in `side-effect-journal.ts`. */
export const SideEffectCommandSchema = z.object({
  schemaVersion: z.literal(1),
  action: z.enum(['begin', 'complete', 'fail', 'reconcile']),
  effectId: Text,
  operation: Text,
  idempotencyKey: Text,
  maxAttempts: z.number().int().positive().max(3).default(3),
  costCents: z.number().int().nonnegative().default(0),
  reconciliationRequired: z.boolean().default(false),
  outcome: z.enum(['SUCCEEDED', 'FAILED']).optional(),
  result: z.unknown().optional(),
  error: Text.optional(),
}).strict().superRefine((command, context) => {
  const hasResult = command.result !== undefined;
  if (command.action === 'complete' && !hasResult) context.addIssue({ code: 'custom', path: ['result'], message: 'complete commands require result' });
  if (command.action === 'fail' && !command.error) context.addIssue({ code: 'custom', path: ['error'], message: 'fail commands require error' });
  if (command.action === 'reconcile') {
    const outcome = command.outcome ?? 'SUCCEEDED';
    if (outcome === 'SUCCEEDED' && !hasResult) context.addIssue({ code: 'custom', path: ['result'], message: 'successful reconciliation requires result' });
    if (outcome === 'FAILED' && !command.error && !hasResult) context.addIssue({ code: 'custom', path: ['error'], message: 'failed reconciliation requires error or result' });
  }
  if (command.action !== 'fail' && command.reconciliationRequired) context.addIssue({ code: 'custom', path: ['reconciliationRequired'], message: 'reconciliationRequired is only valid for fail commands' });
  if (command.action !== 'reconcile' && command.outcome !== undefined) context.addIssue({ code: 'custom', path: ['outcome'], message: 'outcome is only valid for reconcile commands' });
});
export type SideEffectCommand = z.infer<typeof SideEffectCommandSchema>;
