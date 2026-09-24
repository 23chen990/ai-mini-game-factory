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

describe('reference fidelity QA gate', () => {
  it('blocks a generic QA pass without an independent reference comparison', async () => {
    const input = await fixture();
    const result = await verify({ ...input, review: undefined });
    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('fidelity:review-missing');
  });

  it('accepts complete matching branch evidence for the exact contract and build', async () => {
    expect((await verify(await fixture())).passed).toBe(true);
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
