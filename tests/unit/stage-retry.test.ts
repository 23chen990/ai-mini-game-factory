import { describe, expect, it } from 'vitest';
import { prepareExplicitStageRetry, resetDeterministicQaAttemptWindow, waitingAttemptCount } from '../../src/core/stage-retry.js';
import type { StageRecord } from '../../src/schemas/index.js';

function stageRecord(overrides: Partial<StageRecord> = {}): StageRecord {
  return {
    stage: 'REFERENCE_DEEP_RESEARCH',
    status: 'failed',
    startedAt: '2026-09-09T00:00:00.000Z',
    finishedAt: '2026-09-09T00:00:01.000Z',
    attempts: 2,
    inputArtifacts: ['reference-evidence/manifest.json'],
    outputArtifacts: [],
    errors: ['permission manifest rejected before provider invocation'],
    evidence: [],
    failureReason: 'permission manifest rejected before provider invocation',
    providerCalls: { agent: 0, image: 0 },
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    ...overrides,
  };
}

describe('stage retry accounting', () => {
  it('does not spend an attempt when a stage first pauses before execution', () => {
    expect(waitingAttemptCount(undefined)).toBe(0);
    expect(waitingAttemptCount(stageRecord({ attempts: 1 }))).toBe(1);
  });

  it('restores the retry budget after a failure with no provider invocation', () => {
    const record = stageRecord();

    expect(prepareExplicitStageRetry(record)).toBe(true);
    expect(record).toMatchObject({ attempts: 0, errors: [] });
    expect(record.failureReason).toBeUndefined();
  });

  it.each([
    { agent: 1, image: 0 },
    { agent: 0, image: 1 },
  ])('preserves attempts after a real provider call: %o', (providerCalls) => {
    const record = stageRecord({ providerCalls });

    expect(prepareExplicitStageRetry(record)).toBe(false);
    expect(record).toMatchObject({ attempts: 2, providerCalls });
    expect(record.errors).toHaveLength(1);
  });

  it('never resets a formal FIX-stage attempt', () => {
    const record = stageRecord({ stage: 'FIX' });

    expect(prepareExplicitStageRetry(record)).toBe(false);
    expect(record.attempts).toBe(2);
  });

  it('preserves no-provider failures that occurred after preflight', () => {
    const record = stageRecord({
      stage: 'STYLE_LOCK',
      failureReason: 'selected_direction does not match a candidate',
      errors: ['selected_direction does not match a candidate'],
    });

    expect(prepareExplicitStageRetry(record)).toBe(false);
    expect(record.attempts).toBe(2);
  });

  it('preserves completed deterministic stages when they are intentionally rerun', () => {
    const record = stageRecord({ status: 'completed', failureReason: undefined, errors: [] });

    expect(prepareExplicitStageRetry(record)).toBe(false);
    expect(record.attempts).toBe(2);
  });

  it('recovers an interrupted retry that is pending with the original preflight failure', () => {
    const record = stageRecord({ status: 'pending', finishedAt: null });

    expect(prepareExplicitStageRetry(record)).toBe(true);
    expect(record).toMatchObject({ attempts: 0, errors: [] });
  });

  it('restores budget for a provider boundary rejection before process spawn', () => {
    const record = stageRecord({
      failureReason: 'Error: Codex outputPath must remain inside the current run root',
      errors: ['Error: Codex outputPath must remain inside the current run root'],
    });

    expect(prepareExplicitStageRetry(record)).toBe(true);
    expect(record.attempts).toBe(0);
  });

  it('restores budget when the account quota rejects the turn before model execution', () => {
    const record = stageRecord({
      stage: 'FULL_BUILD',
      attempts: 1,
      failureReason: "You've hit your usage limit. Try again at Sep 15th, 2026 9:27 AM.",
      errors: ["You've hit your usage limit. Try again at Sep 15th, 2026 9:27 AM."],
    });

    expect(prepareExplicitStageRetry(record)).toBe(true);
    expect(record.attempts).toBe(0);
  });

  it('restores budget when the selected model is temporarily at capacity', () => {
    const record = stageRecord({
      stage: 'FEEL_PROTOTYPE',
      failureReason: 'Selected model is at capacity. Please try a different model.',
      errors: ['Selected model is at capacity. Please try a different model.'],
    });

    expect(prepareExplicitStageRetry(record)).toBe(true);
    expect(record.attempts).toBe(0);
  });

  it('restores budget after a provider timeout before a structured handoff is emitted', () => {
    const record = stageRecord({
      stage: 'FEEL_PROTOTYPE',
      failureReason: 'Error: codex exec timed out after 300000ms',
      errors: ['Error: codex exec timed out after 300000ms'],
    });

    expect(prepareExplicitStageRetry(record)).toBe(true);
    expect(record.attempts).toBe(0);
  });

  it('opens a fresh deterministic QA window after an explicit rebuild or QA rerun', () => {
    const record = stageRecord({
      stage: 'QA',
      status: 'pending',
      attempts: 2,
      errors: ['recording comparison failed on the prior build'],
      providerCalls: { agent: 0, image: 0 },
    });

    expect(resetDeterministicQaAttemptWindow(record)).toBe(true);
    expect(record).toMatchObject({ attempts: 0, errors: [] });
  });

  it('never resets FIX or provider-backed model stages through the QA reset path', () => {
    expect(resetDeterministicQaAttemptWindow(stageRecord({ stage: 'FIX', attempts: 4 }))).toBe(false);
    expect(resetDeterministicQaAttemptWindow(stageRecord({ stage: 'QA', providerCalls: { agent: 1, image: 0 } }))).toBe(false);
  });
});
