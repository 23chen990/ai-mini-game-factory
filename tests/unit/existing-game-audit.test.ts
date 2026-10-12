import { describe, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { auditExistingGame } from '../../src/core/existing-game-audit.js';
import { QUALITY_DIMENSIONS } from '../../src/schemas/quality-gates.js';

const digest = (data: string) => createHash('sha256').update(data).digest('hex');
const sh = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
describe('external existing-game audit is fail-closed', () => {
  test('an imported game needs independent QA, human review and an exact build', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'factory-external-'));
    try {
      sh(workspace, 'init', '-q');
      sh(workspace, '-c', 'user.email=qa@example.invalid', '-c', 'user.name=QA', 'commit', '--allow-empty', '-m', 'audited');
      const commit = sh(workspace, 'rev-parse', 'HEAD');
      await mkdir(path.join(workspace, 'dist'));
      await writeFile(path.join(workspace, 'dist', 'index.html'), '<html>actual game</html>');
      await writeFile(path.join(workspace, 'capture.log'), 'actual QA log');
      const caseEvidence = { path: 'capture.log', sha256: digest('actual QA log'), kind: 'log' } as const;
      const manifest = {
        schemaVersion: 1, repository: 'test/example', commit, workspace,
        build: { path: 'dist/index.html', sha256: digest('<html>actual game</html>'), kind: 'report' },
        profile: 'general', requiredCaseIds: ['core-action'],
        cases: QUALITY_DIMENSIONS.map(dimension => ({
          id: dimension === 'coreExperience' ? 'core-action' : dimension,
          dimension, objectType: 'player', stateBranch: 'running', rendererPath: 'main',
          viewport: { width: 844, height: 390 }, expected: 'visible action', observed: 'visible action',
          status: 'PASS', reviewer: 'independent-qa', evidence: [caseEvidence],
        })),
      };
      const noHuman = await auditExistingGame(manifest);
      expect(noHuman.matrix.passed).toBe(true);
      expect(noHuman.passed).toBe(false);
      expect(noHuman.problems).toContain('human-exact-build-playtest-not-approved');
      const forgedBuild = await auditExistingGame({ ...manifest,
        build: { ...manifest.build, sha256: digest('different') } });
      expect(forgedBuild.passed).toBe(false);
      expect(forgedBuild.buildValid).toBe(false);
      const absentMedia = await auditExistingGame({ ...manifest,
        cases: manifest.cases.map(item => ({ ...item,
          evidence: [{ path: '../../etc/passwd', sha256: caseEvidence.sha256, kind: 'log' }] })) });
      expect(absentMedia.matrix.passed).toBe(false);
      expect(absentMedia.problems.some(x => x.startsWith('unverified-case-evidence:'))).toBe(true);
      const missingAction = await auditExistingGame({ ...manifest, profile: 'action-runner' });
      expect(missingAction.passed).toBe(false);
      expect(missingAction.missingRequired).toContain('pursuit-caught');
      expect(missingAction.missingRequired).toContain('seam-motion');
    } finally { await rm(workspace, { recursive: true, force: true }); }
  });
});
