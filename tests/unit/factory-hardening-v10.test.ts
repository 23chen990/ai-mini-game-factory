import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFactory } from '../../src/factory.js';
import { buildPlatformReleaseMatrix, evaluatePlatformQa } from '../../src/core/factory-operating.js';
import { executionPolicyForAttempt } from '../../src/core/model-policy.js';
import { getDownstreamArtifactPaths } from '../../src/core/downstream-stages.js';

const hash = 'e'.repeat(64);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('factory hardening v10', () => {
  it('requires line-specific platform evidence in strict QA mode', () => {
    const matrix = buildPlatformReleaseMatrix({
      gameId: 'strict-platform',
      coreHash: hash,
      primaryPlatform: 'wechat-minigame',
      targets: ['wechat-minigame'],
    });
    const result = evaluatePlatformQa(matrix, [{
      platform: 'wechat-minigame',
      passed: true,
      evidence: ['package-hash'],
      artifactHash: hash,
      packagePath: 'platform-builds/wechat-minigame',
      normalFlowEvidence: [],
      visualEvidence: [],
      runtimeEvidence: [],
    }], { strict: true });
    expect(result.passed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'wechat-minigame:normal-flow',
      'wechat-minigame:visual-evidence',
      'wechat-minigame:runtime-evidence',
    ]));
  });

  it('uses the base model on the first attempt and escalates only after a capability retry', () => {
    expect(executionPolicyForAttempt('UI_SKELETON', 1)).toMatchObject({ tier: 'reviewer', sandbox: 'read-only', role: 'reviewer' });
    expect(executionPolicyForAttempt('UI_SKELETON', 2)).toMatchObject({ tier: 'frontier', sandbox: 'read-only', role: 'reviewer' });
    expect(executionPolicyForAttempt('UI_SKELETON', 2, 'SPEC_ERROR')).toMatchObject({ tier: 'reviewer', sandbox: 'read-only', role: 'reviewer' });
  });

  it('invalidates the production-line capability evidence when the line review is retried', () => {
    expect(getDownstreamArtifactPaths('PRODUCTION_LINE_REVIEW')).toContain('artifacts/production-line-capability.json');
  });

  it('invalidates both research content and its provenance audit together', () => {
    const paths = getDownstreamArtifactPaths('COMPETITOR_RESEARCH');
    expect(paths).toEqual(expect.arrayContaining([
      'artifacts/competitor-research.json',
      'artifacts/competitor-research-evidence.json',
    ]));
    expect(paths).toContain('artifacts/stage-contracts/COMPETITOR_RESEARCH.json');
  });

  it('persists factory eval with source and feedback signatures', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'factory-eval-persist-'));
    roots.push(root);
    await mkdir(path.join(root, 'factory-eval'), { recursive: true });
    await writeFile(path.join(root, 'factory-eval/feedback-regressions.json'), JSON.stringify({
      schemaVersion: 1,
      cases: [{
        schemaVersion: 1,
        regressionId: 'manual-1',
        sourceRunId: 'run-1',
        project: 'demo',
        artifact_version: 'v1',
        rejected_dimension: 'feel',
        reason: 'drop',
        before: 'snap',
        after: 'arc',
        accepted_result: 'arc',
        new_regression_case: 'drop remains continuous',
        createdAt: new Date().toISOString(),
      }],
      updatedAt: new Date().toISOString(),
    }));
    const factory = createFactory({ root, repositoryRoot: process.cwd(), mode: 'mock', qaMode: 'stub' });
    const persisted = await factory.persistFactoryEval();
    expect(persisted.report.promptSignature).toBe('factory-prompts-v2');
    expect(persisted.report.factorySignature).toMatch(/^[a-f0-9]{64}$/u);
    expect(persisted.report.feedbackRegressionSignature).toMatch(/^[a-f0-9]{64}$/u);
    expect(persisted.report.feedbackRegressionIds).toEqual(['manual-1']);
    expect(persisted.report.feedbackRegressionCoverage).toEqual({ total: 1, executable: 0, executed: 0 });
  });
});
