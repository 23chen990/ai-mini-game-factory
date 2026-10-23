import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import * as factoryEval from '../../src/core/factory-eval.js';
import type { FactoryAgentEvalObservation } from '../../src/schemas/factory-operating.js';
import { sha256File, sha256Text } from '../../src/core/files.js';

const file = { path: 'evidence.json', sha256: sha256Text('evidence') };
const binding = { targetRunId: 'historical-pilot', workspace: 'workspace/prototype-a', contractHash: null, buildHash: 'b'.repeat(64) };
function fixture() {
  const corpus = { schemaVersion: 1, suiteVersion: 'factory-eval-v3', cases: [{
    caseId: 'qa-history', familyId: 'slice-history', agent: 'QA', dataset: 'golden', category: 'historical-failure',
    binding, sourceEvidence: [file],
    labels: [
      { id: 'known-defect', expected: true, route: 'BUILDER' },
      { id: 'missed-defect', expected: true, route: 'CONTRACT' },
      { id: 'clean-behavior', expected: false },
      { id: 'clean-recovery', expected: false },
    ],
  }] };
  const observation: FactoryAgentEvalObservation = {
    caseId: 'qa-history', binding, sourceRevision: 'a'.repeat(40), status: 'COMPLETED', blocker: null,
    evidenceMode: 'historical-agent', subject: 'QAAgent-instance', reviewer: 'independent-reviewer', exposedToLabels: false,
    inputEvidence: [file], outputEvidence: file, reviewEvidence: file, protocolEvidence: file,
    judgments: [
      { labelId: 'known-defect', observed: true, route: 'BUILDER' },
      { labelId: 'missed-defect', observed: false },
      { labelId: 'clean-behavior', observed: true, route: 'QA' },
      { labelId: 'clean-recovery', observed: false },
    ], measurements: { durationMs: 100, humanInterventions: 0, totalTokens: null, costUsd: null },
  };
  return { corpus, observations: [observation] };
}
function score(input = fixture()) {
  expect(factoryEval).toHaveProperty('scoreFactoryAgentEval');
  return factoryEval.scoreFactoryAgentEval(input.corpus, input.observations);
}
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('Agent evidence within Factory Eval, never route-only capability claims', () => {
  it('reports exact QA confusion denominators and attribution, including misses', () => {
    const report = score();
    expect(report.productQuality).toBe('NOT_ASSESSED');
    expect(report.cohorts[0]).toMatchObject({
      agent: 'QA', dataset: 'golden', evidenceMode: 'historical-agent',
      confusion: { truePositive: 1, falsePositive: 1, trueNegative: 1, falseNegative: 1 },
      metrics: {
        defectDetectionRate: { numerator: 1, denominator: 2, value: 0.5 },
        falsePositiveRate: { numerator: 1, denominator: 2, value: 0.5 },
        missedDefectRate: { numerator: 1, denominator: 2, value: 0.5 },
        attributionAccuracy: { numerator: 1, denominator: 2, value: 0.5 },
      }, totals: { totalTokens: { total: null, measuredCases: 0 }, humanInterventions: { total: 0, measuredCases: 1 } },
    });
  });

  it('keeps absent and blocked observations unverified rather than perfect or false negatives', () => {
    const input = fixture(); input.observations = [];
    expect(score(input)).toMatchObject({ status: 'UNVERIFIED', coverage: { total: 1, completed: 0, blocked: 0, unobserved: 1 }, cohorts: [] });
    const blocked = fixture();
    blocked.observations[0]!.status = 'BLOCKED'; blocked.observations[0]!.blocker = 'reference input trace unavailable'; blocked.observations[0]!.judgments = [];
    expect(score(blocked)).toMatchObject({ status: 'PARTIAL', coverage: { total: 1, completed: 0, blocked: 1, unobserved: 0 }, cohorts: [{ metrics: { defectDetectionRate: { value: null } }, totals: { durationMs: { total: 100, measuredCases: 1 } } }] });
  });

  it('does not combine deterministic regressions with actual Agent observations', () => {
    const input = fixture();
    input.corpus.cases.push({ ...input.corpus.cases[0]!, caseId: 'negative-control', familyId: 'injected-qa', category: 'injected-defect' });
    input.observations.push({ ...input.observations[0]!, caseId: 'negative-control', evidenceMode: 'deterministic-regression' });
    expect(score(input).cohorts.map((cohort) => cohort.evidenceMode)).toEqual(['historical-agent', 'deterministic-regression']);
  });

  it.each(['Research', 'Builder', 'Fixer', 'Pipeline'])('keeps %s unmeasured denominators null', (agent) => {
    const input = fixture(); input.corpus.cases[0]!.agent = agent;
    const cohort = score(input).cohorts[0]!;
    const key = { Research: 'evidenceValidity', Builder: 'firstSlicePassRate', Fixer: 'averageRepairAttempts', Pipeline: 'qualifiedDeliveryRate' }[agent]!;
    if (agent === 'Pipeline') expect(cohort.metrics[key]).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
    else expect(cohort.metrics[key]).toEqual({ numerator: 0, denominator: 0, value: null });
  });

  it.each(['binding', 'self-review', 'missing-judgment', 'duplicate-judgment', 'unknown-case', 'duplicate-observation'])('rejects invalid evidence accounting: %s', (failure) => {
    const input = fixture(); const observation = input.observations[0]!;
    if (failure === 'binding') observation.binding = { ...binding, buildHash: 'c'.repeat(64) };
    if (failure === 'self-review') observation.reviewer = observation.subject;
    if (failure === 'missing-judgment') observation.judgments.pop();
    if (failure === 'duplicate-judgment') observation.judgments.push(observation.judgments[0]!);
    if (failure === 'unknown-case') observation.caseId = 'unknown';
    if (failure === 'duplicate-observation') input.observations.push(observation);
    expect(() => score(input)).toThrow();
  });

  it('rejects holdout family leakage and exposed holdout labels', () => {
    const input = fixture();
    input.corpus.cases.push({ ...input.corpus.cases[0]!, caseId: 'leaked-holdout', dataset: 'holdout' });
    expect(() => score(input)).toThrow(/family/);
    const exposed = fixture(); exposed.corpus.cases[0]!.dataset = 'holdout'; exposed.observations[0]!.exposedToLabels = true;
    expect(() => score(exposed)).toThrow(/holdout/);
  });

  it('binds the result to content, not just case ids', () => {
    const before = score(); const input = fixture(); input.corpus.cases[0]!.labels[0]!.route = 'RESEARCH';
    expect(score(input).corpusHash).not.toBe(before.corpusHash);
    input.observations[0]!.measurements.durationMs = 101;
    expect(score(input).observationsHash).not.toBe(before.observationsHash);
  });

  it('verifies every evidence file and rejects tampering or traversal before scoring', async () => {
    expect(factoryEval).toHaveProperty('verifyFactoryAgentEvalEvidence');
    const root = await mkdtemp(path.join(tmpdir(), 'agent-eval-')); roots.push(root);
    await writeFile(path.join(root, file.path), 'evidence');
    const input = fixture();
    await factoryEval.verifyFactoryAgentEvalEvidence(root, input.corpus, input.observations);
    await writeFile(path.join(root, file.path), 'changed');
    await expect(factoryEval.verifyFactoryAgentEvalEvidence(root, input.corpus, input.observations)).rejects.toThrow(/hash/);
    input.corpus.cases[0]!.sourceEvidence = [{ ...file, path: '../outside' }];
    await expect(factoryEval.verifyFactoryAgentEvalEvidence(root, input.corpus, input.observations)).rejects.toThrow(/unsafe/);
  });
  it('hashes binary evidence as exact bytes rather than UTF-8 replacement text', async () => {
    expect(factoryEval).toHaveProperty('verifyFactoryAgentEvalEvidence');
    const root = await mkdtemp(path.join(tmpdir(), 'agent-eval-binary-')); roots.push(root);
    await writeFile(path.join(root, file.path), Buffer.from([0xff, 0xfe, 0x89, 0x50]));
    const binaryFile = { path: file.path, sha256: await sha256File(path.join(root, file.path)) };
    const input = fixture(); input.corpus.cases[0]!.sourceEvidence = [binaryFile];
    const observation = input.observations[0]!;
    observation.inputEvidence = [binaryFile]; observation.outputEvidence = binaryFile;
    observation.reviewEvidence = binaryFile; observation.protocolEvidence = binaryFile;
    await factoryEval.verifyFactoryAgentEvalEvidence(root, input.corpus, input.observations);
  });

  it('does not score blocked semantic self-reports and preserves unknown historical source revisions', () => {
    const input = fixture(); input.corpus.cases[0]!.agent = 'Builder';
    const observation = input.observations[0]!;
    observation.status = 'BLOCKED'; observation.blocker = 'unpinned historical source';
    observation.sourceRevision = null; observation.judgments = [];
    observation.measurements.firstPass = true;
    expect(score(input).cohorts[0]!.metrics.firstSlicePassRate).toEqual({ numerator: 0, denominator: 0, value: null });
    observation.status = 'COMPLETED'; observation.blocker = null;
    expect(() => score(input)).toThrow();
  });

  it('does not call all-deterministic evidence completed Agent ability', () => {
    const input = fixture(); input.observations[0]!.evidenceMode = 'deterministic-regression';
    expect(score(input)).toMatchObject({ status: 'CONTROL_ONLY', executionCoverage: { liveCompleted: 0, historicalCompleted: 0, deterministicCompleted: 1 } });
  });

  it('retains blocked repair effort without including it in a successful quality average', () => {
    const input = fixture(); input.corpus.cases[0]!.agent = 'Fixer';
    const observation = input.observations[0]!; observation.status = 'BLOCKED'; observation.blocker = 'independent retest incomplete';
    observation.judgments = []; observation.measurements.repairAttempts = 5;
    expect(score(input).cohorts[0]).toMatchObject({ metrics: { averageRepairAttempts: { denominator: 0, value: null } }, totals: { repairAttempts: { total: 5, measuredCases: 1 } } });
  });

  it('counts forbidden-behavior violations against Builder requirement correctness', () => {
    const input = fixture(); input.corpus.cases[0]!.agent = 'Builder';
    input.observations[0]!.judgments[1]!.observed = true;
    expect(score(input).cohorts[0]!.metrics.requirementCorrectness).toEqual({ numerator: 3, denominator: 4, value: 0.75 });
  });

});
