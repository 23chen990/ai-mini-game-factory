import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyReferenceFidelityReview as verify } from '../../src/core/reference-evidence.js';
import { sha256Text } from '../../src/core/files.js';
import { ReferenceFidelityContractSchema } from '../../src/schemas/reference-fidelity.js';
import { referenceBehaviorChecks } from '../fixtures/reference-behavior.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'fidelity-qa-'));
  roots.push(runRoot);
  await mkdir(path.join(runRoot, 'screenshots'));
  await mkdir(path.join(runRoot, 'logs'));
  const source = { path: 'reference.txt', sha256: sha256Text('reference') };
  const behaviorChecks = referenceBehaviorChecks(source);
  const contract = ReferenceFidelityContractSchema.parse({
    schemaVersion: 1, targetRunId: 'run-1', referenceName: 'synthetic reference', provenance: [source],
    coreLoopOrder: ['observe', 'act', 'resolve', 'replay'], inputStateTransitions: ['resolve'], failureRecoveryRules: ['retry'],
    mustPreserveMechanics: ['causal reward'], progressionSystems: ['progress'], unlockRules: ['unlock'], behaviorChecks,
    feedbackTimingBands: { immediateSeconds: 1, microGoalMinSeconds: 10, microGoalMaxSeconds: 60 }, status: 'READY', blockers: [],
  });
  const buildHash = sha256Text('synthetic build');
  const screenshot = { path: 'screenshots/synthetic.png', sha256: sha256Text('synthetic image bytes') };
  await writeFile(path.join(runRoot, screenshot.path), 'synthetic image bytes');
  const flow = {
    schemaVersion: 1, startedFromReset: true, actions: ['page.tap target', 'page.tap replay'],
    transitions: behaviorChecks.map((check) => ({ name: check.id, changed: true, evidence: check.expectedStateChange })),
    completion: 'settlement', replayObserved: true, forbiddenOperations: [] as string[], screenshots: [screenshot.path],
    passed: true, blockers: [], buildHash, runtime: 'web-lite', device: { width: 390, height: 844, label: 'mobile' }, seed: 1,
    runner: 'synthetic-test-only', observedAt: new Date(0).toISOString(),
  };
  const trace = { path: 'logs/natural.json', sha256: sha256Text(JSON.stringify(flow)) };
  await writeFile(path.join(runRoot, trace.path), JSON.stringify(flow));
  const workspace = path.join(runRoot, 'workspace/game');
  const review = {
    schemaVersion: 1, targetRunId: 'run-1', workspace, buildHash, contractHash: sha256Text(JSON.stringify(contract)),
    reviewer: 'QAAgent', authorIndependent: true,
    cases: behaviorChecks.map((check) => ({
      checkId: check.id, objectType: check.objectType, stateBranch: check.stateBranch, viewport: check.viewport,
      passed: true, perceptualPassed: true, observedStateChange: check.expectedStateChange, observedFeedback: 'target-local reward follows resolution',
      screenshots: [screenshot], trace,
    })),
  };
  return { runRoot, targetRunId: 'run-1', workspace, contract, buildHash, review, flow };
}

async function pairedFixture() {
  const input = await fixture();
  await writeFile(path.join(input.runRoot, 'reference.txt'), 'reference');
  const contract = {
    ...input.contract,
    behaviorChecks: input.contract.behaviorChecks.map((check) => ({ ...check, comparison: {
      evidenceBasis: 'runtime-observed', referenceArtifact: input.contract.provenance[0]!,
      condition: 'fresh session; target ready', protocol: 'activate target; replay',
      metric: 'response', unit: 'ms', comparisonMode: 'mean' as const, referenceRange: { min: 80, max: 120 }, maxDelta: 20, minimumSamples: 2,
    } })),
  };
  const contractHash = sha256Text(JSON.stringify(contract));
  const captures = [];
  for (const target of ['reference', 'candidate'] as const) {
    const capture = {
      schemaVersion: 1, targetRunId: input.targetRunId, contractHash, target,
      artifactHash: target === 'reference' ? contract.provenance[0]!.sha256 : input.buildHash,
      authority: 'normal-input', startedFromReset: true, forbiddenOperations: [],
      actions: ['tap target', 'tap replay'], observedAt: new Date(0).toISOString(), durationMs: 180_000,
      observations: contract.behaviorChecks.map((check) => ({
        checkId: check.id, objectType: check.objectType, stateBranch: check.stateBranch, viewport: check.viewport,
        condition: check.comparison.condition, protocol: check.comparison.protocol,
        metric: check.comparison.metric, unit: check.comparison.unit,
        samples: target === 'reference' ? [100, 110] : [110, 115], screenshots: input.review.cases[0]!.screenshots,
      })),
    };
    const file = { path: `logs/${target}-capture.json`, sha256: sha256Text(JSON.stringify(capture)) };
    await writeFile(path.join(input.runRoot, file.path), JSON.stringify(capture));
    captures.push({ capture, file });
  }
  const comparison = { reference: captures[0]!.file, candidate: captures[1]!.file };
  return { ...input, contract, review: { ...input.review, contractHash, comparison }, captures };
}

describe('reference fidelity QA gate', () => {
  it('represents unmeasured timing as unknown rather than forcing invented placeholder numbers', async () => {
    const input = await fixture();
    const partial = {...input.contract, feedbackTimingBands:null, status:'BLOCKED', blockers:['timing-not-measured']};
    expect(ReferenceFidelityContractSchema.safeParse(partial).success).toBe(true);
    expect(ReferenceFidelityContractSchema.safeParse({...partial,status:'READY',blockers:[]}).success).toBe(false);
  });
  it('blocks a generic QA pass without an independent reference comparison', async () => {
    const input = await fixture();
    const result = await verify({ ...input, review: undefined });
    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('fidelity:review-missing');
  });

  it('routes known research blockers back to Research even before a QA review exists', async () => {
    const input = await fixture();
    const result = await verify({ ...input, review: undefined,
      contract: { ...input.contract, feedbackTimingBands: null, status: 'BLOCKED', blockers: ['timing-not-measured'] } });
    expect(result.differences).toContainEqual({ checkId: '*', route: 'RESEARCH', reason: 'contract-blocked:timing-not-measured' });
  });

  it('does not call candidate-only evidence a reference comparison', async () => {
    const result = await verify(await fixture());
    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('fidelity:reference-comparison-missing');
  });

  it('accepts paired natural measurements bound to the same contract, exact branch and build', async () => {
    expect((await verify(await pairedFixture())).passed).toBe(true);
  });

  it.each(['reference', 'candidate'] as const)('does not silently discard an independent %s observation outside the contract', async (target) => {
    const input = await pairedFixture();
    const item = input.captures[target === 'reference' ? 0 : 1]!;
    item.capture.observations.push({
      ...item.capture.observations[0]!, checkId: 'unplanned-grouped-slicing',
      objectType: 'target group', stateBranch: 'crossing-successive-cuts',
      metric: 'independent-cut-units', unit: 'count', samples: [5, 5],
    });
    const body = JSON.stringify(item.capture);
    await writeFile(path.join(input.runRoot, item.file.path), body);
    item.file.sha256 = sha256Text(body);
    const result = await verify(input);
    expect(result.passed).toBe(false);
    expect(result.differences).toContainEqual({
      checkId: 'unplanned-grouped-slicing', route: target === 'reference' ? 'CONTRACT' : 'QA',
      reason: target === 'reference' ? 'reference-observation-outside-contract' : 'candidate-observation-without-reference-check',
    });
  });

  it.each([
    ['candidate-drift', 'BUILDER'], ['reference-contradiction', 'RESEARCH'], ['inferred-rule', 'RESEARCH'],
    ['missing-plan', 'CONTRACT'], ['missing-samples', 'QA'], ['fixture-only', 'QA'],
    ['different-condition', 'QA'], ['different-protocol', 'QA'], ['stale-build', 'QA'],
    ['stale-contract', 'QA'], ['wrong-branch', 'QA'], ['wrong-device', 'QA'], ['unbound-reference', 'RESEARCH'],
  ])('routes %s to %s without lowering comparison thresholds', async (failure, route) => {
    const input = await pairedFixture();
    const reference = input.captures[0]!;
    const candidate = input.captures[1]!;
    if (failure === 'candidate-drift') candidate.capture.observations[0]!.samples = [200, 210];
    if (failure === 'reference-contradiction') reference.capture.observations[0]!.samples = [200, 210];
    if (failure === 'inferred-rule') input.contract.behaviorChecks[0]!.comparison.evidenceBasis = 'inferred';
    if (failure === 'missing-plan') Reflect.deleteProperty(input.contract.behaviorChecks[0]!, 'comparison');
    if (failure === 'missing-samples') candidate.capture.observations[0]!.samples = [];
    if (failure === 'fixture-only') candidate.capture.authority = 'fixture';
    if (failure === 'different-condition') candidate.capture.observations[0]!.condition = 'debug checkpoint';
    if (failure === 'different-protocol') candidate.capture.observations[0]!.protocol = 'auto win';
    if (failure === 'stale-build') candidate.capture.artifactHash = sha256Text('old candidate');
    if (failure === 'stale-contract') candidate.capture.contractHash = sha256Text('old contract');
    if (failure === 'wrong-branch') candidate.capture.observations[0]!.stateBranch = 'sibling';
    if (failure === 'wrong-device') candidate.capture.observations[0]!.viewport = {width: 1280, height: 900};
    if (failure === 'unbound-reference') reference.capture.artifactHash = sha256Text('other game');
    input.review.contractHash = sha256Text(JSON.stringify(input.contract));
    for (const item of input.captures) {
      if (failure !== 'stale-contract') item.capture.contractHash = input.review.contractHash;
      const body = JSON.stringify(item.capture);
      await writeFile(path.join(input.runRoot, item.file.path), body);
      item.file.sha256 = sha256Text(body);
    }
    const result = await verify(input);
    expect(result.passed).toBe(false);
    expect(result).toMatchObject({ differences: expect.arrayContaining([expect.objectContaining({ route })]) });
  });

  it('propagates corrupted external comparison evidence instead of treating it as a cache miss', async () => {
    const input = await pairedFixture();
    await writeFile(path.join(input.runRoot, input.captures[0]!.file.path), 'changed bytes');
    await expect(verify(input)).rejects.toThrow('hash mismatch');
  });

  it.each(['missing', 'duplicate', 'wrong-branch', 'wrong-device', 'stale-build', 'stale-contract', 'builder-self-review', 'perceptual-blocked', 'missing-image', 'changed-image', 'fixture-trace', 'failed-natural-report', 'no-branch-trigger'])('blocks %s evidence', async (failure) => {
    const input = await fixture();
    const row = input.review.cases[0]!;
    if (failure === 'missing') input.review.cases.pop();
    if (failure === 'duplicate') input.review.cases.push(row);
    if (failure === 'wrong-branch') row.objectType = 'sibling-object';
    if (failure === 'wrong-device') row.viewport = { width: 1280, height: 900 };
    if (failure === 'stale-build') input.review.buildHash = sha256Text('old build');
    if (failure === 'stale-contract') input.review.contractHash = sha256Text('old contract');
    if (failure === 'builder-self-review') input.review.reviewer = 'BuilderAgent';
    if (failure === 'perceptual-blocked') row.perceptualPassed = false;
    if (failure === 'missing-image') await rm(path.join(input.runRoot, row.screenshots[0]!.path));
    if (failure === 'changed-image') await writeFile(path.join(input.runRoot, row.screenshots[0]!.path), 'different image');
    if (['fixture-trace', 'failed-natural-report', 'no-branch-trigger'].includes(failure)) {
      if (failure === 'fixture-trace') input.flow.forbiddenOperations.push('setState');
      if (failure === 'failed-natural-report') input.flow.passed = false;
      if (failure === 'no-branch-trigger') input.flow.transitions = [];
      const body = JSON.stringify(input.flow);
      await writeFile(path.join(input.runRoot, row.trace.path), body);
      input.review.cases.forEach((item) => { item.trace = { ...item.trace, sha256: sha256Text(body) }; });
    }
    expect((await verify(input)).passed).toBe(false);
  });
});
