import { parseCodexJsonl } from '../providers/codex-cli.js';
import type { AgentCallMetrics } from '../providers/interfaces.js';

type RecoverableStage = {
  status: string;
  attempts: number;
  providerCalls: { agent: number; image: number };
};

/** A successful deterministic lock may be revalidated after dependency-only
 * reprojection when its complete, schema-normalized content is unchanged. */
export function canRevalidateDeterministicArtifact(stage: RecoverableStage | undefined, actualHash: string, expectedHash: string) {
  return Boolean(stage && stage.attempts > 0 && ['completed', 'pending'].includes(stage.status)
    && stage.providerCalls.agent === 0 && stage.providerCalls.image === 0
    && /^[a-f0-9]{64}$/u.test(actualHash) && actualHash === expectedHash);
}

function compactJsonWhitespace(value: string) {
  let output = '';
  let inString = false;
  let escaped = false;
  for (const character of value) {
    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') { inString = true; output += character; }
    else if (!/\s/u.test(character)) output += character;
  }
  return output;
}

/** Prove that a bounded sandbox copy contains the exact opening bytes of the
 * complete artifact, allowing formatting whitespace outside JSON strings. */
export function isSanitizedJsonPrefix(full: string, boundedCopy: string) {
  const fullCompact = compactJsonWhitespace(full);
  const boundedCompact = compactJsonWhitespace(boundedCopy);
  return boundedCompact.length > 0 && fullCompact.startsWith(boundedCompact);
}

export function evaluateReferenceResearchRecovery(input: { stage: RecoverableStage; stdout: string; model: string; allowCompletedReprojection?: boolean }): {
  passed: boolean;
  blockers: string[];
  threadId?: string;
  metrics: AgentCallMetrics;
} {
  const parsed = parseCodexJsonl(input.stdout);
  const blockers: string[] = [];
  const eligibleStatus = ['failed', 'waiting'].includes(input.stage.status)
    || (input.allowCompletedReprojection === true && ['completed', 'pending'].includes(input.stage.status));
  if (!eligibleStatus) blockers.push('reference-research-recovery:stage-not-recoverable');
  if (input.stage.attempts < 1) blockers.push('reference-research-recovery:no-recorded-stage-attempt');
  if (!parsed.completed || parsed.failed) blockers.push('reference-research-recovery:codex-turn-not-completed');
  if (!parsed.threadId) blockers.push('reference-research-recovery:codex-thread-id-missing');
  if (!input.model.trim()) blockers.push('reference-research-recovery:model-route-missing');
  const metrics: AgentCallMetrics = {
    provider: 'codex-cli',
    model: input.model.trim(),
    // Stage attempts are the durable lower bound. Earlier timed-out processes
    // may not have a usage event, but they still count as provider calls.
    calls: Math.max(1, input.stage.attempts, input.stage.providerCalls.agent),
    usage: parsed.usage,
  };
  return { passed: blockers.length === 0, blockers, ...(parsed.threadId ? { threadId: parsed.threadId } : {}), metrics };
}
