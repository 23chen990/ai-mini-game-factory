import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { FileRunStore } from '../../src/core/run-store.js';
import { beginCodexExecution, readCodexUsageReceipts, unaccountedCodexUsage } from '../../src/core/codex-budget.js';
import { deriveCostUsage } from '../../src/core/cost-accounting.js';

it('keeps cost acknowledgements when a retry discards obsolete gameplay evidence', () => {
  const store = new FileRunStore('/tmp/codex-accounting-no-io');
  const previous = { ...store.record('BLUEPRINT'), codexExecutionIds: ['c7034409-23b3-48b8-955f-2b900a202a60'] };
  expect(store.record('BLUEPRINT', previous)).toHaveProperty('codexExecutionIds', previous.codexExecutionIds);
});

it('adds orphan receipts to mixed-provider usage and deduplicates acknowledged receipts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'codex-accounting-'));
  try {
    const first = await beginCodexExecution(root, { stage: 'BLUEPRINT', model: 'controlled', maxTotalTokens: 100 });
    await first.save({ inputTokens: 30, outputTokens: 10, totalTokens: 40 }, 1, 'complete'); await first.release();
    const second = await beginCodexExecution(root, { stage: 'FIX', model: 'controlled', maxTotalTokens: 100 });
    await second.save({ inputTokens: 20, outputTokens: 10, totalTokens: 30 }, 1, 'uncertain'); await second.release();
    // 40 acknowledged Codex tokens + 20 tokens from another provider, same stage.
    const stages = [{ stage: 'BLUEPRINT', evidence: [], codexExecutionIds: [first.executionId], tokenUsage: { inputTokens: 45, outputTokens: 15, totalTokens: 60 } }];
    const extra = unaccountedCodexUsage(stages, await readCodexUsageReceipts(root));
    expect(extra).toHaveLength(1);
    expect(deriveCostUsage([...stages, ...extra]).agentTokens).toBe(90);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('selects the latest uniquely bound execution for recovery instead of a first-call pointer', async () => {
  const { codexStageExecution } = await import('../../src/core/codex-budget.js');
  const root = await mkdtemp(path.join(tmpdir(), 'codex-recovery-'));
  try {
    const first = await beginCodexExecution(root, { stage: 'FULL_BUILD', model: 'controlled' });
    await first.save({ inputTokens: 10, outputTokens: 0, totalTokens: 10 }, 1, 'complete'); await first.release();
    const second = await beginCodexExecution(root, { stage: 'FULL_BUILD', model: 'controlled' });
    await second.save({ inputTokens: 20, outputTokens: 0, totalTokens: 20 }, 1, 'complete'); await second.release();
    expect(await codexStageExecution(root, 'FULL_BUILD', 'BUILD')).toMatchObject({ receipt: { executionId: second.executionId }, stdoutPath: path.join(second.logDir, 'BUILD.attempt-1.stdout.jsonl') });
    const interrupted = await beginCodexExecution(root, { stage: 'FULL_BUILD', model: 'controlled' });
    await interrupted.save({ inputTokens: 5, outputTokens: 0, totalTokens: 5 }, 1, 'uncertain'); await interrupted.release();
    await expect(codexStageExecution(root, 'FULL_BUILD', 'BUILD')).rejects.toThrow(/unresolved/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('sums completed invocation wall time without charging idle time between calls', async () => {
 const budget=await import('../../src/core/codex-budget.js');
 expect(budget).toHaveProperty('completedCodexExecutionMs');
 expect(budget.completedCodexExecutionMs([{startedAt:'2026-10-28T09:00:00Z',finishedAt:'2026-10-28T09:00:10Z'},{startedAt:'2026-10-28T15:00:00Z',finishedAt:'2026-10-28T15:00:20Z'}])).toBe(30000);
 expect(()=>budget.completedCodexExecutionMs([{startedAt:'2026-10-28T15:00:00Z',finishedAt:null}])).toThrow('unfinished');
});
