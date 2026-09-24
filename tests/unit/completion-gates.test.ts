import { describe, expect, it } from 'vitest';
import { CompletionGateReportSchema, evaluateCompletionGates } from '../../src/core/completion-gates.js';
import { BuildReportSchema } from '../../src/schemas/index.js';

const evidence = {
  core: { passed: true, evidence: ['artifacts/build-report.json', 'artifacts/core-test-report.json'] },
  normalFlow: { passed: true, evidence: ['artifacts/qa-report.json', 'screenshots/gameplay.png'] },
  visualEvidence: { passed: true, evidence: ['artifacts/visual-evidence.json'] },
  levelDifference: { passed: true, evidence: ['artifacts/level-difference.json'] },
  humanPlaytest: { passed: true, evidence: ['human/playtest-acceptance.yaml'] },
};

describe('completion gates', () => {
  it('derives implementation, candidate, and release readiness from five gates', () => {
    const report = evaluateCompletionGates(evidence);
    expect(report.implementationReady).toBe(true);
    expect(report.candidateReady).toBe(true);
    expect(report.releaseReady).toBe(true);
    expect(CompletionGateReportSchema.parse(report).gates).toHaveLength(5);
  });

  it('does not let a passing build hide missing experience evidence', () => {
    const report = evaluateCompletionGates({ ...evidence, visualEvidence: { passed: false, evidence: ['missing'] } });
    expect(report.implementationReady).toBe(true);
    expect(report.candidateReady).toBe(false);
    expect(report.releaseReady).toBe(false);
    expect(report.blockers).toContain('visualEvidence');
  });

  it('rejects a gate with no evidence even when marked passed', () => {
    expect(() => CompletionGateReportSchema.parse({ ...evaluateCompletionGates(evidence), gates: evaluateCompletionGates(evidence).gates.map((gate) => gate.id === 'core' ? { ...gate, evidence: [] } : gate) })).toThrow();
  });

  it('labels a Builder build as implementation-ready, never release-ready', () => {
    const report = BuildReportSchema.parse({
      schemaVersion: 1, success: true, runtime: 'web-lite', template: 'idle-shop-v1', workspace: 'workspace/game',
      webBuild: 'workspace/game/dist', files: ['index.html'], verification: ['vite:build-success', 'tests:passed'], builtAt: new Date().toISOString(),
      completion: { status: 'IMPLEMENTATION_READY', blockers: ['normalFlow', 'visualEvidence', 'levelDifference', 'humanPlaytest'] },
    });
    expect(report.completion?.status).toBe('IMPLEMENTATION_READY');
    expect(report.completion?.blockers).toContain('humanPlaytest');
  });

  it('records an immutable candidate binding and refuses a mismatched final player gate', () => {
    const candidateHash = 'c'.repeat(64);
    const report = evaluateCompletionGates(evidence, {
      candidateHash,
      candidateBinding: { passed: false, evidence: ['human/playtest-acceptance.json:candidate-hash-mismatch'], blockers: ['candidate-hash-mismatch'] },
    });
    expect(report.candidateHash).toBe(candidateHash);
    expect(report.candidateBinding).toMatchObject({ passed: false, blockers: ['candidate-hash-mismatch'] });
    expect(report.releaseReady).toBe(false);
  });

  it('accepts a final gate only when the candidate binding is explicitly verified', () => {
    const candidateHash = 'd'.repeat(64);
    const report = evaluateCompletionGates(evidence, {
      candidateHash,
      candidateBinding: { passed: true, evidence: ['human/playtest-acceptance.json', `candidate:${candidateHash}`], blockers: [] },
    });
    expect(report.candidateBinding).toMatchObject({ passed: true, blockers: [] });
    expect(report.releaseReady).toBe(true);
  });
});
