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

it('admits a frozen normal-input no-response counterexample without claiming a successful transition', async () => {
 const input = await fixture(); const first = input.review.cases[0]!;
 input.flow.transitions[0]!.changed = false;
 input.flow.transitions[0]!.evidence = 'Normal tap observed; the visible state remained unchanged for two seconds.';
 const body = JSON.stringify(input.flow); await writeFile(path.join(input.runRoot, first.trace.path), body);
 const review = {...input.review,cases:[{...first,passed:false,perceptualPassed:false,rootCause:'implementation',hypothesis:'The input listener does not invoke the declared action.',trace:{...first.trace,sha256:sha256Text(body)}}]};
 expect((await referenceEvidence.verifyReferenceRepairReview({...input,review})).blockers).toEqual([]);
 expect((await verify({...input,review})).passed).toBe(false);
});

it('retains known gaps across upstream contract rework, not only Fixer attempts', async () => {
 const input=await fixture();const first=input.review.cases[0]!;
 const previous={...input.review,discoveries:[{id:'upstream-gap',severity:'error',rootCause:'design',hypothesis:'The contract omitted the choice.',message:'Observed choice gap',evidence:first.trace.path,objectType:'cluster',stateBranch:'approach',viewport:first.viewport,screenshots:first.screenshots,trace:first.trace}]};
 const dir=path.join(input.runRoot,'history/reference-reviews');await mkdir(dir,{recursive:true});
 await writeFile(path.join(dir,`${'a'.repeat(64)}.json`),JSON.stringify(previous));
 expect((await verify(input)).blockers).toContain('fidelity:check-missing:upstream-gap');
});

it('cannot close a deferred evidence gap by repairing an unrelated implementation issue', async () => {
 const input=await fixture();
 await mkdir(path.join(input.runRoot,'artifacts'));
 await writeFile(path.join(input.runRoot,'artifacts/qa-deferred-issues.json'),JSON.stringify({schemaVersion:1,passed:false,checks:[],issues:[{id:'unresolved-source-branch',severity:'error',rootCause:'evidence',hypothesis:'This branch lacks source observations.',message:'Source causality is unobserved',evidence:JSON.stringify({objectType:'source target',stateBranch:'contact',viewport:{width:390,height:844}})}],screenshots:[],consoleLog:'logs/console.log',testedAt:new Date().toISOString()}));
 expect((await verify(input)).blockers).toContain('fidelity:check-missing:unresolved-source-branch');
});

it('keeps unavailable paired captures explicitly unknown rather than requiring fabricated file pointers', async () => {
 const input=await fixture();
 const result=await verify({...input,review:{...input.review,comparison:null}});
 expect(result.blockers).toContain('fidelity:reference-comparison-missing');
 expect(result.blockers).not.toContain('fidelity:review-invalid');
 expect(result.passed).toBe(false);
});
