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
  await writeFile(path.join(runRoot,source.path),'reference');
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
    reviewer: 'QAAgent', authorIndependent: true, reviewProtocol:'reference-comparison-v1',
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

it('does not pass when independent QA finds an important out-of-contract issue', async () => {
  const input = await fixture();
  const evidence = input.review.cases[0]!;
  const review = { ...input.review, discoveries: [{
    id: 'unexpected-bypass', severity: 'error', evidence: evidence.trace.path,
    rootCause: 'design', hypothesis: 'The declared contract omitted the risk/reward decision.',
    message: 'A normal-input route bypasses every risk.', objectType: 'hazard cluster', stateBranch: 'approach -> bypass',
    viewport: evidence.viewport, screenshots: evidence.screenshots, trace: evidence.trace,
  }] };
  const result = await verify({ ...input, review });
  expect(result.blockers).toContain('fidelity:discovery:unexpected-bypass');
  expect(result.passed).toBe(false);
});

import * as referenceEvidence from '../../src/core/reference-evidence.js';
it('accepts partial natural failure evidence for repair without accepting it as gameplay completion', async () => {
  const input = await fixture();
  const first = input.review.cases[0]!;
  const review = { ...input.review, cases: [{ ...first, passed: false, rootCause: 'implementation', hypothesis: 'Collision resolves before visible contact.' }] };
  const result = await referenceEvidence.verifyReferenceRepairReview({ ...input, review });
  expect(result.blockers).toEqual([]);
  expect(result.report.passed).toBe(false);
  expect(result.report.issues[0]).toMatchObject({rootCause:'implementation', hypothesis:'Collision resolves before visible contact.'});
});
it('refuses stale or injected failure evidence before repair dispatch', async () => {
  const input = await fixture();
  const first = input.review.cases[0]!;
  input.flow.forbiddenOperations.push('setState');
  const body = JSON.stringify(input.flow);
  await writeFile(path.join(input.runRoot, first.trace.path),body);
  const review = { ...input.review, cases: [{ ...first, passed: false, trace:{...first.trace,sha256:sha256Text(body)} }] };
  expect((await referenceEvidence.verifyReferenceRepairReview({...input,review})).blockers.length).toBeGreaterThan(0);
  expect((await referenceEvidence.verifyReferenceRepairReview({...input,buildHash:'d'.repeat(64),review})).blockers).toContain('repair:review-identity-mismatch');
});
it('cannot lose a previously discovered gap when the next build passes only its original contract', async () => {
  const input=await fixture();
  const result=await verify({...input,requiredRetests:[{id:'historical-cluster-gap',objectType:'target cluster',stateBranch:'contact -> separate -> fall',viewport:{width:390,height:844}}]});
  expect(result.passed).toBe(false);
  expect(result.blockers).toContain('fidelity:check-missing:historical-cluster-gap');
});

it('invalidates an otherwise matching comparison when the reference bytes change',async()=>{
 const input=await fixture();
 await writeFile(path.join(input.runRoot,'reference.txt'),'different reference bytes');
 expect((await verify(input)).blockers).toContain('fidelity:source-file-invalid:reference.txt');
});

it('blocks legacy comparison methodology even when all old evidence hashes match',async()=>{
 const input=await fixture();
 expect((await verify({...input,review:{...input.review,reviewProtocol:undefined}})).blockers).toContain('fidelity:review-protocol-missing');
});
it('does not dispatch a repair from a sibling branch mislabeled as a historical retest',async()=>{
 const input=await fixture();const first=input.review.cases[0]!;
 const row={...first,checkId:'prior-gap',objectType:'sibling-object',passed:false,rootCause:'implementation'};
 const result=await referenceEvidence.verifyReferenceRepairReview({...input,review:{...input.review,cases:[],retests:[row]},requiredRetests:[{id:'prior-gap',objectType:'original-object',stateBranch:first.stateBranch,viewport:first.viewport}]});
 expect(result.blockers).toContain('repair:branch-mismatch:prior-gap');
});
it('loads retained discoveries from repair history even when audit callers omit retest arguments',async()=>{
 const input=await fixture();const first=input.review.cases[0]!;
 const previous={...input.review,discoveries:[{id:'retained-outside-contract',severity:'error',rootCause:'implementation',hypothesis:'Wrong causal ordering.',message:'Earlier discovered branch',evidence:first.trace.path,objectType:'cluster',stateBranch:'contact -> separate',viewport:first.viewport,screenshots:first.screenshots,trace:first.trace}]};
 const dir=path.join(input.runRoot,'history/reference-repairs/attempt-1');await mkdir(dir,{recursive:true});
 await writeFile(path.join(dir,'reference-fidelity-review.json'),JSON.stringify(previous));
 expect((await verify(input)).blockers).toContain('fidelity:check-missing:retained-outside-contract');
});
