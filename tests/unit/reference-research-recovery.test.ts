import { describe, expect, it } from 'vitest';
import { canRevalidateDeterministicArtifact, evaluateReferenceResearchRecovery, isSanitizedJsonPrefix } from '../../src/core/reference-research-recovery.js';
import { getDownstreamArtifactPaths } from '../../src/core/downstream-stages.js';

const completedLog = [
  JSON.stringify({ type: 'thread.started', thread_id: 'thread-luna' }),
  JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 120, output_tokens: 30, total_tokens: 150 } }),
].join('\n');

describe('reference research output recovery', () => {
  it('revalidates an unchanged deterministic lock without granting another attempt or accepting a changed human lock', () => {
    const stage = { status: 'pending', attempts: 1, providerCalls: { agent: 0, image: 0 } };
    const sameHash = 'a'.repeat(64);
    expect(canRevalidateDeterministicArtifact(stage, sameHash, sameHash)).toBe(true);
    expect(canRevalidateDeterministicArtifact(stage, sameHash, 'b'.repeat(64))).toBe(false);
    expect(canRevalidateDeterministicArtifact(undefined, sameHash, sameHash)).toBe(false);
    expect(canRevalidateDeterministicArtifact({ ...stage, status: 'running' }, sameHash, sameHash)).toBe(false);
    expect(canRevalidateDeterministicArtifact({ ...stage, status: 'failed' }, sameHash, sameHash)).toBe(false);
    expect(canRevalidateDeterministicArtifact({ ...stage, providerCalls: { agent: 1, image: 0 } }, sameHash, sameHash)).toBe(false);
    expect(canRevalidateDeterministicArtifact(stage, '', '')).toBe(false);
    expect(stage).toEqual({ status: 'pending', attempts: 1, providerCalls: { agent: 0, image: 0 } });
  });

  it('reuses a completed structured-output turn without spending another stage attempt', () => {
    expect(evaluateReferenceResearchRecovery({
      stage: { status: 'failed', attempts: 2, providerCalls: { agent: 0, image: 0 } },
      stdout: completedLog,
      model: 'gpt-5.6-luna',
    })).toEqual({
      passed: true,
      blockers: [],
      threadId: 'thread-luna',
      metrics: { provider: 'codex-cli', model: 'gpt-5.6-luna', calls: 2, usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 } },
    });
  });

  it('rejects an incomplete or already-completed stage boundary', () => {
    expect(evaluateReferenceResearchRecovery({
      stage: { status: 'completed', attempts: 2, providerCalls: { agent: 0, image: 0 } },
      stdout: completedLog,
      model: 'gpt-5.6-luna',
    }).blockers).toContain('reference-research-recovery:stage-not-recoverable');
    expect(evaluateReferenceResearchRecovery({
      stage: { status: 'failed', attempts: 2, providerCalls: { agent: 0, image: 0 } },
      stdout: JSON.stringify({ type: 'turn.failed', error: { message: 'bad output' } }),
      model: 'gpt-5.6-luna',
    }).blockers).toContain('reference-research-recovery:codex-turn-not-completed');
  });

  it.each(['completed', 'pending'])('permits explicit %s output reprojection without granting another provider attempt', (status) => {
    const result = evaluateReferenceResearchRecovery({
      stage: { status, attempts: 2, providerCalls: { agent: 2, image: 0 } },
      stdout: completedLog,
      model: 'gpt-5.6-luna',
      allowCompletedReprojection: true,
    });
    expect(result.passed).toBe(true);
    expect(result.metrics.calls).toBe(2);
    expect(evaluateReferenceResearchRecovery({
      stage: { status, attempts: 2, providerCalls: { agent: 2, image: 0 } },
      stdout: completedLog,
      model: 'gpt-5.6-luna',
    }).passed).toBe(false);
    expect(evaluateReferenceResearchRecovery({
      stage: { status: 'running', attempts: 2, providerCalls: { agent: 2, image: 0 } },
      stdout: completedLog,
      model: 'gpt-5.6-luna',
      allowCompletedReprojection: true,
    }).blockers).toContain('reference-research-recovery:stage-not-recoverable');
  });

  it('invalidates canonical research projections while preserving raw recovery evidence', () => {
    const paths = getDownstreamArtifactPaths('REFERENCE_DEEP_RESEARCH');
    expect(paths).toEqual(expect.arrayContaining([
      'artifacts/reference-research-resolution.json',
      'artifacts/reference-behavior-analysis.json',
      'artifacts/reference-level-implementation-contract.json',
    ]));
    expect(paths).not.toContain('artifacts/reference-behavior-analysis.model-output.raw.json');
    expect(paths).not.toContain('artifacts/reference-behavior-analysis.raw.json');
  });

  it('verifies a formatting-only truncated JSON prefix without erasing spaces inside strings', () => {
    const full = '{\n  "label": "two words",\n  "frames": [{ "id": 1 }, { "id": 2 }]\n}\n';
    expect(isSanitizedJsonPrefix(full, '{"label":"two words","frames":[{"id":1},{"id":')).toBe(true);
    expect(isSanitizedJsonPrefix(full, '{"label":"twowords","frames":')).toBe(false);
  });
});
