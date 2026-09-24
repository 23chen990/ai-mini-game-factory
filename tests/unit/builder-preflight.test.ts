import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyBuilderPreflight } from '../../src/core/builder-preflight.js';

describe('Builder preflight', () => {
  it('accepts the exact generated workspace with locked design artifacts', async () => {
    const runRoot = await mkdtemp(path.join(os.tmpdir(), 'night-market-builder-preflight-'));
    try {
      await mkdir(path.join(runRoot, 'workspace', 'game'), { recursive: true });
      await mkdir(path.join(runRoot, 'artifacts'), { recursive: true });
      await writeFile(path.join(runRoot, 'artifacts', 'core-spec-lock.json'), '{}');
      await writeFile(path.join(runRoot, 'artifacts', 'natural-play-plan.json'), '{}');
      const result = await verifyBuilderPreflight({
        runRoot,
        workspace: path.join(runRoot, 'workspace', 'game'),
        targetGameId: 'night-market-hero',
        targetWorkspaceRelative: 'workspace/game',
        requiredArtifacts: ['artifacts/core-spec-lock.json', 'artifacts/natural-play-plan.json'],
      });
      expect(result).toEqual({ passed: true, blockers: [], checkedArtifacts: ['artifacts/core-spec-lock.json', 'artifacts/natural-play-plan.json'] });
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });

  it('rejects a workspace from another project even when it is inside the run root', async () => {
    const runRoot = await mkdtemp(path.join(os.tmpdir(), 'night-market-builder-preflight-wrong-workspace-'));
    try {
      await mkdir(path.join(runRoot, 'workspace', 'prototype-a'), { recursive: true });
      await mkdir(path.join(runRoot, 'artifacts'), { recursive: true });
      await writeFile(path.join(runRoot, 'artifacts', 'core-spec-lock.json'), '{}');
      const result = await verifyBuilderPreflight({
        runRoot,
        workspace: path.join(runRoot, 'workspace', 'prototype-a'),
        targetGameId: 'night-market-hero',
        targetWorkspaceRelative: 'workspace/game',
        requiredArtifacts: ['artifacts/core-spec-lock.json'],
      });
      expect(result.passed).toBe(false);
      expect(result.blockers).toContain('workspace-mismatch:workspace/prototype-a');
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });

  it('rejects a build when the design lock or natural-play plan is missing', async () => {
    const runRoot = await mkdtemp(path.join(os.tmpdir(), 'night-market-builder-preflight-missing-'));
    try {
      await mkdir(path.join(runRoot, 'workspace', 'game'), { recursive: true });
      const result = await verifyBuilderPreflight({
        runRoot,
        workspace: path.join(runRoot, 'workspace', 'game'),
        targetGameId: 'night-market-hero',
        targetWorkspaceRelative: 'workspace/game',
        requiredArtifacts: ['artifacts/core-spec-lock.json', 'artifacts/natural-play-plan.json'],
      });
      expect(result.passed).toBe(false);
      expect(result.blockers).toEqual([
        'missing-artifact:artifacts/core-spec-lock.json',
        'missing-artifact:artifacts/natural-play-plan.json',
      ]);
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });
});
