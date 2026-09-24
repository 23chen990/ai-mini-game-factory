import { SideEffectContractSchema, type SideEffectContract } from '../schemas/side-effect.js';

export function evaluateSideEffectContract(value: unknown) {
  const parsed = SideEffectContractSchema.safeParse(value);
  if (!parsed.success) return { passed: false, blockers: ['schema-invalid'], contract: value };
  const contract = parsed.data;
  const blockers: string[] = [];
  if (!contract.idempotencyKey.trim()) blockers.push('idempotency-key-missing');
  if (contract.retryPolicy.maxAttempts > 1 && !contract.queryBeforeRetry) blockers.push('reconciliation-query-missing');
  if (contract.costCapCents <= 0) blockers.push('cost-cap-missing');
  return { passed: blockers.length === 0, blockers, contract };
}

export type SideEffectExecutionResult<T> = { value: T; attempts: number; idempotencyKey: string };

/** Small bounded retry runner for explicitly approved side effects. */
export async function runSideEffect<T>(contractValue: SideEffectContract, operation: (attempt: number) => Promise<T>): Promise<SideEffectExecutionResult<T>> {
  const contract = SideEffectContractSchema.parse(contractValue);
  let lastError: unknown;
  for (let attempt = 1; attempt <= contract.retryPolicy.maxAttempts; attempt += 1) {
    try { return { value: await operation(attempt), attempts: attempt, idempotencyKey: contract.idempotencyKey }; }
    catch (error) {
      lastError = error;
      if (attempt < contract.retryPolicy.maxAttempts && contract.retryPolicy.backoffMs > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(contract.retryPolicy.backoffMs, 5_000)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
