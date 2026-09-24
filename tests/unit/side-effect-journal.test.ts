import { describe, expect, it } from 'vitest';
import { buildSideEffectJournal, beginSideEffect, completeSideEffect, evaluateSideEffectJournal, failSideEffect, reconcileSideEffect, runSideEffectWithJournal } from '../../src/core/side-effect-journal.js';
import { SideEffectContractSchema } from '../../src/schemas/side-effect.js';
import { SideEffectCommandSchema, type SideEffectJournal } from '../../src/schemas/side-effect-journal.js';

const contract = SideEffectContractSchema.parse({
  schemaVersion: 1,
  operation: 'submit-platform-build',
  idempotencyKey: 'run:g:submit:v1',
  retryPolicy: { maxAttempts: 2, backoffMs: 0, retryableErrors: ['timeout'] },
  compensation: { supported: true, action: 'cancel submission' },
  queryBeforeRetry: true,
  costCapCents: 100,
});

describe('durable side-effect journal', () => {
  it('records a pending attempt and closes it with a result digest', () => {
    const started = beginSideEffect(buildSideEffectJournal('g'), { effectId: 'effect-1', operation: contract.operation, idempotencyKey: contract.idempotencyKey, maxAttempts: 2 });
    expect(started.record.status).toBe('PENDING');
    const completed = completeSideEffect(started.journal, 'effect-1', { submissionId: 'abc' });
    expect(evaluateSideEffectJournal(completed).passed).toBe(true);
    expect(completed.records[0]?.resultHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('does not run a completed idempotency key twice', async () => {
    const started = beginSideEffect(buildSideEffectJournal('g'), { effectId: 'effect-2', operation: contract.operation, idempotencyKey: 'run:g:submit:v2', maxAttempts: 2 });
    const completed = completeSideEffect(started.journal, 'effect-2', 'ok');
    let calls = 0;
    const result = await runSideEffectWithJournal({ ...contract, idempotencyKey: 'run:g:submit:v2' }, completed, async () => { calls += 1; return 'should-not-run'; });
    expect(result.reused).toBe(true);
    expect(calls).toBe(0);
  });

  it('blocks unresolved or failed effects and enforces a retry ceiling', () => {
    const started = beginSideEffect(buildSideEffectJournal('g'), { effectId: 'effect-3', operation: 'publish', idempotencyKey: 'run:g:publish:v1', maxAttempts: 1 });
    const failed = failSideEffect(started.journal, 'effect-3', new Error('network timeout'));
    expect(evaluateSideEffectJournal(failed).passed).toBe(false);
    expect(() => beginSideEffect(failed, { effectId: 'effect-3', operation: 'publish', idempotencyKey: 'run:g:publish:v1', maxAttempts: 1 })).toThrow(/retry policy/i);
  });

  it('marks an uncertain non-queryable failure for reconciliation instead of retrying blindly', async () => {
    const noQuery = SideEffectContractSchema.parse({ ...contract, idempotencyKey: 'run:g:unknown:v1', queryBeforeRetry: false, retryPolicy: { ...contract.retryPolicy, maxAttempts: 1 } });
    const started = beginSideEffect(buildSideEffectJournal('g'), { effectId: 'effect-4', operation: noQuery.operation, idempotencyKey: noQuery.idempotencyKey, maxAttempts: 1 });
    const reconciliation = failSideEffect(started.journal, 'effect-4', 'unknown outcome', { reconciliationRequired: true });
    expect(evaluateSideEffectJournal(reconciliation).blockers).toContain('effect-4:reconciliation-required');
  });

  it('marks an executed non-queryable operation as reconciliation-required even on its final attempt', async () => {
    const noQuery = SideEffectContractSchema.parse({
      ...contract,
      idempotencyKey: 'run:g:unknown-final:v1',
      queryBeforeRetry: false,
      retryPolicy: { ...contract.retryPolicy, maxAttempts: 1 },
    });
    let latest: SideEffectJournal | undefined;
    await expect(runSideEffectWithJournal(noQuery, buildSideEffectJournal('g'), async () => {
      throw new Error('transport ended after remote acceptance');
    }, { persist: async (journal) => { latest = journal; } })).rejects.toThrow(/remote acceptance/);
    // The bounded runner reports the outcome through the journal instead of
    // throwing away the distinction between "definitely failed" and
    // "possibly accepted remotely".
    expect(latest?.records[0]?.status).toBe('RECONCILIATION_REQUIRED');
    expect(evaluateSideEffectJournal(latest).passed).toBe(false);
  });

  it('requires an explicit reconciliation transition before an uncertain effect can pass', () => {
    const started = beginSideEffect(buildSideEffectJournal('g'), {
      effectId: 'effect-5', operation: 'publish', idempotencyKey: 'run:g:publish:v5', maxAttempts: 1,
    });
    const pending = failSideEffect(started.journal, 'effect-5', 'remote status unavailable', { reconciliationRequired: true });
    const resolved = reconcileSideEffect(pending, 'effect-5', { remoteId: 'ok' });
    expect(resolved.records[0]?.status).toBe('SUCCEEDED');
    expect(evaluateSideEffectJournal(resolved, { requireAllSucceeded: true }).passed).toBe(true);
  });

  it('validates operator commands so journal transitions are explicit and bounded', () => {
    expect(SideEffectCommandSchema.parse({ schemaVersion: 1, action: 'begin', effectId: 'e', operation: 'publish', idempotencyKey: 'k', maxAttempts: 2 }).action).toBe('begin');
    expect(() => SideEffectCommandSchema.parse({ schemaVersion: 1, action: 'complete', effectId: 'e', operation: 'publish', idempotencyKey: 'k' })).toThrow(/result/i);
    expect(() => SideEffectCommandSchema.parse({ schemaVersion: 1, action: 'begin', effectId: 'e', operation: 'publish', idempotencyKey: 'k', maxAttempts: 99 })).toThrow(/maxAttempts/i);
  });
});
