import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileRunStore } from '../../src/core/run-store.js';

describe('FileRunStore run id validation', () => {
  it('accepts generated ids and collision suffixes as a single run directory name', () => {
    const store = new FileRunStore('/tmp/factory-run-store-test');

    expect(store.runRoot('20260830033859-67260d1f')).toBe('/tmp/factory-run-store-test/runs/20260830033859-67260d1f');
    expect(store.runRoot('20260830033859-67260d1f-2')).toBe('/tmp/factory-run-store-test/runs/20260830033859-67260d1f-2');
    // Test fixtures may use a simple, non-generated id as long as it is one path segment.
    expect(store.runRoot('temporary-run')).toBe('/tmp/factory-run-store-test/runs/temporary-run');
  });

  it.each(['/tmp/outside', '../escape', '..', '.', 'nested/run', String.raw`nested\run`])('rejects unsafe run id %s', (runId) => {
    const store = new FileRunStore('/tmp/factory-run-store-test');

    expect(() => store.runRoot(runId)).toThrow(/invalid run id/i);
    expect(() => store.artifact(runId, 'state.json')).toThrow(/invalid run id/i);
  });

  it.each(['../escape.json', '/tmp/outside.json', 'nested/../escape.json', String.raw`nested\\..\\escape.json`])('rejects unsafe artifact name %s', (name) => {
    const store = new FileRunStore('/tmp/factory-run-store-test');
    expect(() => store.artifact('temporary-run', name)).toThrow(/artifact|path|invalid/i);
  });

  it('rejects an artifacts root that is itself a symlink', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'run-store-symlink-'));
    const runRoot = path.join(root, 'runs', 'run');
    const outside = path.join(root, 'outside');
    await mkdir(runRoot, { recursive: true });
    await mkdir(outside, { recursive: true });
    await symlink(outside, path.join(runRoot, 'artifacts'));
    const store = new FileRunStore(root);
    await expect(store.writeArtifact('run', 'unsafe.json', { secret: true })).rejects.toThrow(/symlink/i);
    await rm(root, { recursive: true, force: true });
  });
});
