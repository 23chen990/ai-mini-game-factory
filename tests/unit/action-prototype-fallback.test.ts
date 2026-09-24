import { describe, expect, it } from 'vitest';
import { actionPrototypeHtml, hasActionPrototypeContract, hasCompleteActionPrototypeContract } from '../../src/agents/index.js';

const variant = {
  slot: 'B' as const,
  name: 'fallback',
  workspace: 'workspace/feel-prototype-b',
  geometryFixtureHash: 'sha256:' + 'a'.repeat(64),
  treatmentHash: 'sha256:' + 'b'.repeat(64),
  hypothesis: 'fallback contract',
  treatment: ['visible events'],
};

describe('action prototype fallback', () => {
  it('requires the full manifest and scenario contract before resuming output', () => {
    expect(hasActionPrototypeContract('<script>window.__ACTION_TEST__={contractVersion:1}</script>')).toBe(true);
    expect(hasCompleteActionPrototypeContract('<script>window.__ACTION_TEST__={contractVersion:1}</script>')).toBe(false);
    expect(hasCompleteActionPrototypeContract(actionPrototypeHtml(variant))).toBe(true);
  });

  it('contains every deterministic QA scenario and the retry/finish semantics', () => {
    const html = actionPrototypeHtml(variant);
    for (const scenario of ['input-response', 'release-kinematics', 'hook-selection', 'event-gap', 'retry-friction', 'finish-crossing']) {
      expect(html).toContain(scenario);
    }
    expect(html).toContain("emit('retry'");
    expect(html).toContain("emit('finish'");
  });
});
