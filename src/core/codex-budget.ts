import { randomUUID } from 'node:crypto';
import { open, readFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { ensureDir, writeJsonAtomic } from './files.js';
import type { TokenUsage } from '../providers/interfaces.js';
import type { CostStageUsage } from '../schemas/cost-accounting.js';

const UsageSchema = z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(), totalTokens: z.number().int().nonnegative() }).strict();
const ReceiptSchema = z.object({
  schemaVersion: z.literal(1), executionId: z.string().uuid(), sequence: z.number().int().positive(), stage: z.string(), model: z.string(),
  status: z.enum(['running', 'complete', 'uncertain']), usage: UsageSchema, attempts: z.number().int().nonnegative(),
  maxTotalTokens: z.number().int().positive().nullable(), startedAt: z.string(), finishedAt: z.string().nullable(),
}).strict();
export type CodexUsageReceipt = z.infer<typeof ReceiptSchema>;
const BudgetSchema = z.object({ schemaVersion: z.literal(1), maxAgentTokens: z.number().int().positive() }).strict();
const StageUsageSchema = z.object({ codexExecutionIds: z.array(z.string().uuid()).optional(), tokenUsage: UsageSchema });

// These two files are optional for direct CLI callers, not unreadable/corrupt
// files. Only ENOENT means absent; I/O and schema failures propagate.
async function optionalJson(file: string): Promise<unknown | undefined> {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}

export function codexExecutionEvidence(executionId: string) { return `codex-execution:${executionId}`; }

export async function readCodexUsageReceipts(runRoot: string): Promise<CodexUsageReceipt[]> {
  const directory = path.join(runRoot, 'logs/codex/executions');
  let names: string[];
  try { names = await readdir(directory); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  return Promise.all(names.map(async (name) => ReceiptSchema.parse(JSON.parse(await readFile(path.join(directory, name, 'receipt.json'), 'utf8')))));
}

/** Add only receipts not yet acknowledged in a persisted stage record. This
 * also retains usage if the controller died after CLI completion, before save. */
export function unaccountedCodexUsage(stages: readonly { codexExecutionIds?: string[] }[], receipts: readonly CodexUsageReceipt[]): CostStageUsage[] {
  const acknowledged = new Set(stages.flatMap((stage) => stage.codexExecutionIds ?? []));
  return receipts.filter((receipt) => !acknowledged.has(receipt.executionId))
    .map((receipt) => ({ stage: receipt.stage, tokenUsage: receipt.usage, providerCalls: { agent: receipt.attempts, image: 0 } }));
}

export async function beginCodexExecution(runRoot: string, input: { stage: string; model: string; maxTotalTokens?: number; requireRunBudget?: boolean }) {
  const directory = path.join(runRoot, 'logs/codex');
  await ensureDir(directory);
  const lockPath = path.join(directory, 'execution.lock');
  // Exclusive creation works across separate provider instances/processes.
  // A crash leaves the lease in place: never guess that unreported spend is 0.
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Codex run has an active or unresolved execution (locked); review its receipt before continuation');
    throw error;
  }
  const release = async () => { await lock.close(); await unlink(lockPath); };
  try {
    const rawBudget = await optionalJson(path.join(runRoot, 'artifacts/codex-run-budget.json'));
    const runBudget = rawBudget === undefined ? undefined : BudgetSchema.parse(rawBudget).maxAgentTokens;
    if (input.requireRunBudget === true && runBudget === undefined) {
      throw new Error(`Codex ${input.stage} requires a run token budget; invocation-only limits cannot authorize a writer`);
    }
    const receipts = await readCodexUsageReceipts(runRoot);
    const budgeted = runBudget !== undefined || input.maxTotalTokens !== undefined;
    if (budgeted && receipts.some((receipt) => receipt.status !== 'complete')) throw new Error('Codex run has unresolved usage; further budgeted launches are blocked');
    // Pre-ledger logs can contain already-spent but unaccounted tokens.
    // Do not invent their binding or silently grant a fresh allowance.
    if (budgeted) {
      const legacyNames = (await readdir(directory)).filter((name) => /\.(?:stdout\.jsonl|usage\.json)$/u.test(name));
      for (const name of legacyNames) {
        const usageName = name.replace(/\.stdout\.jsonl$/u, '.usage.json');
        const raw = await optionalJson(path.join(directory, usageName));
        const binding = raw === undefined ? undefined : z.object({ executionId: z.string().uuid().optional() }).parse(raw).executionId;
        if (binding === undefined || !receipts.some((receipt) => receipt.executionId === binding)) {
          throw new Error('Codex historical logs lack execution-ledger binding; reconcile historical usage before further budgeted launches');
        }
      }
    }
    const rawState = await optionalJson(path.join(runRoot, 'state.json'));
    const stages = rawState === undefined ? [] : Object.values(z.object({ stages: z.record(z.string(), StageUsageSchema) }).parse(rawState).stages);
    const observed = stages.reduce((sum, stage) => sum + stage.tokenUsage.totalTokens, 0)
      + receipts.filter((receipt) => !stages.some((stage) => stage.codexExecutionIds?.includes(receipt.executionId))).reduce((sum, receipt) => sum + receipt.usage.totalTokens, 0);
    const remaining = runBudget === undefined ? undefined : runBudget - observed;
    if (remaining !== undefined && remaining <= 0) throw new Error(`Codex run token budget exhausted; observed ${observed}, limit ${runBudget}`);
    const limits = [input.maxTotalTokens, remaining].filter((value): value is number => value !== undefined);
    const maxTotalTokens = limits.length > 0 ? Math.min(...limits) : undefined;
    const executionId = randomUUID();
    const logDir = path.join(directory, 'executions', executionId);
    const receipt: CodexUsageReceipt = { schemaVersion: 1, executionId, sequence: receipts.length + 1, stage: input.stage, model: input.model,
      status: 'running', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, attempts: 0,
      maxTotalTokens: maxTotalTokens ?? null, startedAt: new Date().toISOString(), finishedAt: null };
    await writeJsonAtomic(lockPath, { executionId, pid: process.pid, startedAt: receipt.startedAt });
    await writeJsonAtomic(path.join(logDir, 'receipt.json'), receipt);
    return { executionId, logDir, maxTotalTokens, release,
      async save(usage: TokenUsage, attempts: number, status: CodexUsageReceipt['status']) {
        receipt.usage = usage; receipt.attempts = attempts; receipt.status = status;
        receipt.finishedAt = status === 'running' ? null : new Date().toISOString();
        await writeJsonAtomic(path.join(logDir, 'receipt.json'), ReceiptSchema.parse(receipt));
      } };
  } catch (error) { await release(); throw error; }
}

/** Recovery must select one execution, not a stale compatibility pointer. */
export async function codexStageExecution(runRoot: string, stage: string, label: string) {
  const receipt = (await readCodexUsageReceipts(runRoot)).filter((item) => item.stage === stage).sort((a, b) => b.sequence - a.sequence)[0];
  if (receipt === undefined) return undefined; // Legacy run, no execution ledger.
  if (receipt.status !== 'complete') throw new Error(`Codex ${stage} latest execution has unresolved usage; recovery is blocked`);
  const directory = path.join(runRoot, 'logs/codex/executions', receipt.executionId);
  return { receipt, stdoutPath: path.join(directory, `${label}.attempt-${receipt.attempts}.stdout.jsonl`), outputPath: path.join(directory, `${label}.last-message.txt`) };
}

/** Cumulative execution time excludes human/engineering idle intervals. A live
 * or crashed invocation is unresolved, not a zero-cost completed interval. */
export function completedCodexExecutionMs(receipts: readonly Pick<CodexUsageReceipt, 'startedAt' | 'finishedAt'>[]): number {
  return receipts.reduce((total, receipt) => {
    if (receipt.finishedAt === null) throw new Error('Codex execution is unfinished; reconcile it before continuation');
    return total + Date.parse(receipt.finishedAt) - Date.parse(receipt.startedAt);
  }, 0);
}
