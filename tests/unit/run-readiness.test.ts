import { describe, expect, it } from 'vitest';
import { deriveRunReadiness } from '../../src/core/run-readiness.js';
import { RunReadinessSchema } from '../../src/schemas/index.js';
import { FileRunStore } from '../../src/core/run-store.js';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('run readiness', () => {
  it('distinguishes active, waiting, implementation, candidate and release states', () => {
    expect(deriveRunReadiness({ stage: 'BLUEPRINT', status: 'running' })).toBe('IN_PROGRESS');
    expect(deriveRunReadiness({ stage: 'WAITING_FOR_ART_APPROVAL', status: 'waiting' })).toBe('WAITING');
    expect(deriveRunReadiness({ stage: 'FULL_BUILD', status: 'running', stages: { FULL_BUILD: { status: 'completed' } } })).toBe('IMPLEMENTATION_READY');
    expect(deriveRunReadiness({ stage: 'RELEASE_CANDIDATE', status: 'running', stages: { RELEASE_CANDIDATE: { status: 'completed' } } })).toBe('CANDIDATE_READY');
    expect(deriveRunReadiness({ stage: 'COMPLETED', status: 'completed', readiness: 'RELEASE_READY' })).toBe('RELEASE_READY');
  });

  it('keeps terminal stop reasons explicit and schema-valid', () => {
    expect(deriveRunReadiness({ stage: 'FAILED', status: 'failed' })).toBe('FAILED');
    expect(deriveRunReadiness({ stage: 'ABANDONED', status: 'completed' })).toBe('ABANDONED');
    expect(deriveRunReadiness({ stage: 'NOT_GREENLIT', status: 'completed' })).toBe('NOT_GREENLIT');
    expect(RunReadinessSchema.options).toContain('CANDIDATE_READY');
  });

  it('normalizes readiness on persistence so legacy callers cannot omit it', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'run-readiness-'));
    try {
      const store = new FileRunStore(root);
      const now = new Date().toISOString();
      const seedFile = path.join(root, 'seed.yaml');
      await writeFile(seedFile, 'title: Readiness\ntheme: test\ntemplate: idle-shop-v1\n');
      await store.create('r1', seedFile, 'mock');
      const state = await store.load('r1');
      state.stage = 'FULL_BUILD';
      state.status = 'running';
      state.stages.FULL_BUILD = { stage: 'FULL_BUILD', status: 'completed', startedAt: now, finishedAt: now, attempts: 1, inputArtifacts: [], outputArtifacts: [], errors: [], evidence: [], providerCalls: { agent: 0, image: 0 }, tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
      await store.save(state);
      expect((await store.load('r1')).readiness).toBe('IMPLEMENTATION_READY');
      expect(JSON.parse(await readFile(path.join(root, 'runs/r1/state.json'), 'utf8')).readiness).toBe('IMPLEMENTATION_READY');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
