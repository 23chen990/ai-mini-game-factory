import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { FileRunStore } from '../../src/core/run-store.js';
import { createFactory } from '../../src/factory.js';
import {
  buildGameRunIdentityManifest,
  validateGameRunIdentityBinding,
  validateGameRunIdentityImmutability,
} from '../../src/core/game-identity.js';
import { GameRunIdentityManifestSchema } from '../../src/schemas/game-identity.js';

const seed = {
  title: '小李飞刀',
  theme: '夜行切果',
  template: 'cut-stack-dodge-v1' as const,
  runtime: 'web-lite' as const,
};

const base = buildGameRunIdentityManifest({
  runId: '20260919-identity-test',
  seed,
  seedSha256: 'a'.repeat(64),
  createdAt: '2026-09-19T00:00:00.000Z',
});

describe('game/run identity manifest', () => {
  it('builds a stable canonical identity independently from the run id', () => {
    const secondRun = buildGameRunIdentityManifest({
      runId: '20260919-identity-test-2',
      seed,
      seedSha256: base.seedSha256,
      createdAt: base.createdAt,
    });

    expect(GameRunIdentityManifestSchema.parse(base)).toEqual(base);
    expect(base).toMatchObject({
      schemaVersion: 1,
      manifestType: 'game-run-identity',
      immutable: true,
      canonicalGameId: '小李飞刀',
      displayTitle: '小李飞刀',
      seedSha256: 'a'.repeat(64),
      workspaceRelative: 'workspace/game',
    });
    expect(secondRun.canonicalGameId).toBe(base.canonicalGameId);
    expect(secondRun.runId).not.toBe(base.runId);
  });

  it('accepts the exact binding and reports every mismatched immutable field', () => {
    const passed = validateGameRunIdentityBinding(base, {
      runId: base.runId,
      canonicalGameId: base.canonicalGameId,
      seedSha256: base.seedSha256,
      template: base.template,
      runtime: base.runtime,
      workspaceRelative: base.workspaceRelative,
    });
    expect(passed).toEqual({ passed: true, blockers: [] });

    const failed = validateGameRunIdentityBinding(base, {
      runId: 'other-run',
      canonicalGameId: 'other-game',
      seedSha256: 'b'.repeat(64),
      template: 'idle-shop-v1',
      runtime: 'cocos-3d',
      workspaceRelative: 'workspace/other',
    });
    expect(failed.passed).toBe(false);
    expect(failed.blockers).toEqual(expect.arrayContaining([
      'identity:runId-mismatch',
      'identity:canonicalGameId-mismatch',
      'identity:seedSha256-mismatch',
      'identity:template-mismatch',
      'identity:runtime-mismatch',
      'identity:workspaceRelative-mismatch',
    ]));
  });

  it('rejects edits to an existing immutable manifest', () => {
    const changed = { ...base, displayTitle: '符刃夜行' };
    expect(validateGameRunIdentityImmutability(base, base)).toEqual({ passed: true, blockers: [] });
    expect(validateGameRunIdentityImmutability(base, changed)).toEqual({
      passed: false,
      blockers: ['identity:immutable-field-changed:displayTitle'],
    });
  });

  it('writes the optional manifest when a new game run is created while keeping state compatibility', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'game-identity-run-'));
    try {
      const seedFile = path.join(root, 'seed.yaml');
      await writeFile(seedFile, 'title: 小李飞刀\ntheme: 夜行切果\ntemplate: cut-stack-dodge-v1\ndesignMode: prototype_tournament\n');
      const store = new FileRunStore(root);
      await store.create('identity-run', seedFile, 'mock');

      const manifest = JSON.parse(await readFile(path.join(root, 'runs/identity-run/artifacts/game-run-identity.json'), 'utf8'));
      expect(GameRunIdentityManifestSchema.parse(manifest)).toMatchObject({
        runId: 'identity-run',
        canonicalGameId: '小李飞刀',
        displayTitle: '小李飞刀',
        immutable: true,
      });
      expect((await store.load('identity-run')).schemaVersion).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('makes the manifest observable through the public newRun API', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'game-identity-factory-'));
    try {
      const seedFile = path.join(root, 'seed.yaml');
      await writeFile(seedFile, 'title: 小李飞刀\ntheme: 夜行切果\ntemplate: cut-stack-dodge-v1\ndesignMode: prototype_tournament\n');
      const factory = createFactory({ root, repositoryRoot: process.cwd(), mode: 'mock', qaMode: 'stub' });
      const runId = await factory.newRun(seedFile);
      const manifest = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/game-run-identity.json'), 'utf8'));
      expect(GameRunIdentityManifestSchema.parse(manifest)).toMatchObject({ runId, canonicalGameId: '小李飞刀', immutable: true });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
