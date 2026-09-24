import { SideEffectContractSchema, type SideEffectContract } from '../schemas/side-effect.js';
import { SideEffectJournalEvaluationSchema, SideEffectJournalSchema, SideEffectRecordSchema, type SideEffectJournal, type SideEffectRecord, type SideEffectJournalEvaluation } from '../schemas/side-effect-journal.js';
import { sha256Text } from './files.js';

function now(): string { return new Date().toISOString(); }

export function buildSideEffectJournal(runId: string): SideEffectJournal {
  return SideEffectJournalSchema.parse({ schemaVersion: 1, runId, records: [], updatedAt: now() });
}

export function findSideEffectByKey(value: unknown, idempotencyKey: string): SideEffectRecord | undefined {
  const journal = SideEffectJournalSchema.parse(value);
  return journal.records.find((record) => record.idempotencyKey === idempotencyKey);
}

export type BeginSideEffectInput = {
  effectId: string;
  operation: string;
  idempotencyKey: string;
  maxAttempts?: number;
  costCents?: number;
};

/** Start (or safely resume) one idempotent effect. */
export function beginSideEffect(value: unknown, input: BeginSideEffectInput): { journal: SideEffectJournal; record: SideEffectRecord; reused: boolean } {
  const journal = SideEffectJournalSchema.parse(value);
  const existingIndex = journal.records.findIndex((record) => record.idempotencyKey === input.idempotencyKey);
  const timestamp = now();
  if (existingIndex >= 0) {
    const existing = journal.records[existingIndex]!;
    if (existing.effectId !== input.effectId || existing.operation !== input.operation) throw new Error(`idempotency key ${input.idempotencyKey} is bound to a different side effect`);
    if (existing.status === 'SUCCEEDED') return { journal, record: existing, reused: true };
    if (existing.status === 'RECONCILIATION_REQUIRED') throw new Error(`side effect ${existing.effectId} requires reconciliation before retry`);
    const maxAttempts = Math.max(1, Math.trunc(input.maxAttempts ?? 3));
    if (existing.attempts >= maxAttempts) throw new Error(`side effect ${existing.effectId} exceeded its bounded retry policy`);
    const next: SideEffectRecord = SideEffectRecordSchema.parse({ ...existing, status: 'PENDING', attempts: existing.attempts + 1, startedAt: timestamp, finishedAt: null, resultHash: undefined, error: undefined, costCents: input.costCents ?? existing.costCents });
    const records = [...journal.records]; records[existingIndex] = next;
    return { journal: SideEffectJournalSchema.parse({ ...journal, records, updatedAt: timestamp }), record: next, reused: false };
  }
  const record = SideEffectRecordSchema.parse({ schemaVersion: 1, effectId: input.effectId, operation: input.operation, idempotencyKey: input.idempotencyKey, status: 'PENDING', attempts: 1, startedAt: timestamp, finishedAt: null, costCents: input.costCents ?? 0 });
  return { journal: SideEffectJournalSchema.parse({ ...journal, records: [...journal.records, record], updatedAt: timestamp }), record, reused: false };
}

export function completeSideEffect(value: unknown, effectId: string, result: unknown): SideEffectJournal {
  const journal = SideEffectJournalSchema.parse(value);
  const index = journal.records.findIndex((record) => record.effectId === effectId);
  if (index < 0) throw new Error(`side effect ${effectId} does not exist`);
  const current = journal.records[index]!;
  if (current.status === 'SUCCEEDED') return journal;
  if (current.status !== 'PENDING') throw new Error(`side effect ${effectId} is not pending`);
  const next = SideEffectRecordSchema.parse({ ...current, status: 'SUCCEEDED', resultHash: sha256Text(JSON.stringify(result)), finishedAt: now(), error: undefined });
  const records = [...journal.records]; records[index] = next;
  return SideEffectJournalSchema.parse({ ...journal, records, updatedAt: new Date().toISOString() });
}

export function failSideEffect(value: unknown, effectId: string, error: unknown, options: { reconciliationRequired?: boolean } = {}): SideEffectJournal {
  const journal = SideEffectJournalSchema.parse(value);
  const index = journal.records.findIndex((record) => record.effectId === effectId);
  if (index < 0) throw new Error(`side effect ${effectId} does not exist`);
  const current = journal.records[index]!;
  if (current.status === 'SUCCEEDED') return journal;
  const message = String(error instanceof Error ? error.message : error).trim() || 'side effect failed';
  const next = SideEffectRecordSchema.parse({ ...current, status: options.reconciliationRequired ? 'RECONCILIATION_REQUIRED' : 'FAILED', error: message, finishedAt: options.reconciliationRequired ? null : now(), resultHash: undefined });
  const records = [...journal.records]; records[index] = next;
  return SideEffectJournalSchema.parse({ ...journal, records, updatedAt: new Date().toISOString() });
}

/**
 * Resolve an effect whose remote outcome could not be observed locally.  An
 * operator (or a trusted reconciliation worker) must make this transition
 * explicitly; callers may not turn an open record into a success merely by
 * retrying the original operation.  The default form treats the supplied
 * value as the remote result, while the optional status/error form can record
 * a confirmed remote failure as well.
 */
export function reconcileSideEffect(
  value: unknown,
  effectId: string,
  result: unknown,
  options: { outcome?: 'SUCCEEDED' | 'FAILED'; error?: unknown } = {},
): SideEffectJournal {
  const journal = SideEffectJournalSchema.parse(value);
  const index = journal.records.findIndex((record) => record.effectId === effectId);
  if (index < 0) throw new Error(`side effect ${effectId} does not exist`);
  const current = journal.records[index]!;
  if (current.status === 'SUCCEEDED' || current.status === 'FAILED') return journal;
  if (current.status !== 'RECONCILIATION_REQUIRED') throw new Error(`side effect ${effectId} is not awaiting reconciliation`);
  const outcome = options.outcome ?? 'SUCCEEDED';
  const next = outcome === 'SUCCEEDED'
    ? SideEffectRecordSchema.parse({ ...current, status: 'SUCCEEDED', resultHash: sha256Text(JSON.stringify(result)), error: undefined, finishedAt: now() })
    : SideEffectRecordSchema.parse({ ...current, status: 'FAILED', resultHash: undefined, error: String(options.error ?? result).trim() || 'reconciled remote failure', finishedAt: now() });
  const records = [...journal.records]; records[index] = next;
  return SideEffectJournalSchema.parse({ ...journal, records, updatedAt: now() });
}

export function evaluateSideEffectJournal(value: unknown, options: { maxAttempts?: number; maxCostCents?: number; requireAllSucceeded?: boolean } = {}) {
  const parsed = SideEffectJournalSchema.safeParse(value);
  if (!parsed.success) return { passed: false, blockers: ['schema-invalid'], open: [], failed: [], totalCostCents: 0, journal: value };
  const journal = parsed.data;
  const maxAttempts = Math.max(1, Math.trunc(options.maxAttempts ?? 3));
  const blockers: string[] = [];
  const open: string[] = [];
  const failed: string[] = [];
  let totalCostCents = 0;
  for (const record of journal.records) {
    totalCostCents += record.costCents;
    if (record.attempts > maxAttempts) blockers.push(`${record.effectId}:attempt-cap`);
    if (record.status === 'PENDING' || record.status === 'RECONCILIATION_REQUIRED') { open.push(record.effectId); blockers.push(`${record.effectId}:reconciliation-required`); }
    if (record.status === 'FAILED') { failed.push(record.effectId); if (options.requireAllSucceeded !== false) blockers.push(`${record.effectId}:failed`); }
  }
  if (options.maxCostCents !== undefined && totalCostCents > options.maxCostCents) blockers.push('cost-cap');
  return { passed: blockers.length === 0, blockers: [...new Set(blockers)], open, failed, totalCostCents, journal };
}

/** Add the run id and timestamp only at the persistence boundary. The core
 * evaluator above stays deterministic for tests and callers that compare
 * decisions. */
export function buildSideEffectJournalEvaluation(value: unknown, options: { maxAttempts?: number; maxCostCents?: number; requireAllSucceeded?: boolean } = {}): SideEffectJournalEvaluation {
  const journal = SideEffectJournalSchema.parse(value);
  const result = evaluateSideEffectJournal(journal, options);
  return SideEffectJournalEvaluationSchema.parse({
    schemaVersion: 1,
    runId: journal.runId,
    passed: result.passed,
    blockers: result.blockers,
    open: result.open,
    failed: result.failed,
    totalCostCents: result.totalCostCents,
    checkedAt: now(),
  });
}

export type JournalRunResult<T> = { value: T; journal: SideEffectJournal; attempts: number; idempotencyKey: string; reused: boolean };

/**
 * Bounded side-effect execution with a durable journal callback.  The caller
 * decides where to persist the journal (normally a run artifact); persistence
 * happens before the operation and after every terminal outcome.
 */
export async function runSideEffectWithJournal<T>(
  contractValue: SideEffectContract,
  journalValue: SideEffectJournal,
  operation: (attempt: number) => Promise<T>,
  options: { effectId?: string; persist?: (journal: SideEffectJournal) => Promise<void> } = {},
): Promise<JournalRunResult<T>> {
  const contract = SideEffectContractSchema.parse(contractValue);
  let journal = SideEffectJournalSchema.parse(journalValue);
  const effectId = options.effectId ?? contract.idempotencyKey;
  const existing = findSideEffectByKey(journal, contract.idempotencyKey);
  if (existing?.status === 'SUCCEEDED') {
    // A journal intentionally stores a result digest rather than arbitrary
    // result data.  Reusing an already-completed effect is therefore safe but
    // cannot fabricate a return value; callers should treat this as a no-op.
    return { value: undefined as T, journal, attempts: existing.attempts, idempotencyKey: contract.idempotencyKey, reused: true };
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= contract.retryPolicy.maxAttempts; attempt += 1) {
    const begun = beginSideEffect(journal, { effectId, operation: contract.operation, idempotencyKey: contract.idempotencyKey, maxAttempts: contract.retryPolicy.maxAttempts, costCents: contract.costCapCents });
    journal = begun.journal;
    if (options.persist) await options.persist(journal);
    try {
      const value = await operation(begun.record.attempts);
      journal = completeSideEffect(journal, effectId, value);
      if (options.persist) await options.persist(journal);
      return { value, journal, attempts: begun.record.attempts, idempotencyKey: contract.idempotencyKey, reused: begun.reused };
    } catch (error) {
      lastError = error;
      const finalAttempt = attempt >= contract.retryPolicy.maxAttempts;
      // If the operation cannot be queried safely, *any* transport failure
      // leaves the remote side ambiguous, including the final bounded
      // attempt. Never label it definitively failed and then permit a blind
      // duplicate on resume; require an explicit reconciliation record.
      journal = failSideEffect(journal, effectId, error, { reconciliationRequired: contract.queryBeforeRetry === false });
      if (options.persist) await options.persist(journal);
      if (!finalAttempt && contract.queryBeforeRetry !== false && contract.retryPolicy.backoffMs > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(contract.retryPolicy.backoffMs, 5_000)));
      if (contract.queryBeforeRetry === false) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
