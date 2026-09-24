import type { StageRecord } from '../schemas/index.js';

/** A pause before stage execution has not consumed the stage's retry budget. */
export function waitingAttemptCount(previous: StageRecord | undefined): number {
  return previous?.attempts ?? 0;
}

/**
 * Restore only an explicit retry that failed before any model or image
 * provider was invoked. Provider-backed attempts and formal FIX attempts keep
 * their history and remain subject to their configured caps.
 */
export function prepareExplicitStageRetry(record: StageRecord | undefined): boolean {
  if (!record || record.stage === 'FIX' || (record.status !== 'failed' && record.status !== 'pending')) return false;
  if (record.providerCalls.agent > 0 || record.providerCalls.image > 0) return false;
  const failure = [record.failureReason, record.errors.at(-1)].filter(Boolean).join('\n');
  const failedAtPreflight = /permission manifest rejected|research-network-allow-list-missing|execution boundary rejected|preflight (?:rejected|failed)|Codex (?:cwd|outputPath|logDir) must |usage limit|quota|try again at|at capacity|codex exec timed out/iu.test(failure);
  if (!failedAtPreflight) return false;
  record.attempts = 0;
  record.errors = [];
  delete record.failureReason;
  return true;
}

/**
 * QA has a bounded automatic retry loop per build, but an operator-triggered
 * rerun after shared code or a rebuilt candidate needs a fresh deterministic
 * window. The prior attempts remain in the append-only run logs and artifact
 * ledger; FIX and provider-backed stages are deliberately excluded.
 */
export function resetDeterministicQaAttemptWindow(record: StageRecord | undefined): boolean {
  if (!record || record.stage !== 'QA') return false;
  if (record.providerCalls.agent > 0 || record.providerCalls.image > 0) return false;
  record.attempts = 0;
  record.errors = [];
  delete record.failureReason;
  return true;
}
