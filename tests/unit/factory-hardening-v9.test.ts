import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildHumanApprovalPlan, evaluateHumanApprovalRecords } from '../../src/core/human-approval.js';
import type { HumanApprovalRecord } from '../../src/schemas/human-approval.js';
import { buildProductionLinePlayPlan, deriveProductionLinePlayEvidence, evaluateProductionLinePlayEvidence } from '../../src/qa/production-line-qa.js';
import { evaluateNaturalFlow } from '../../src/core/qa-evidence.js';
import { buildFactorySourceSignature, collectFactorySourceEntries, runFactoryEvalSuite, defaultFactoryEvalCases } from '../../src/core/factory-eval.js';
import { buildPlatformPackageSet, markPlatformPackageReady, verifyPlatformPackageArtifact, verifyPlatformPackageSetArtifacts } from '../../src/core/platform-packaging.js';
import { RequestRouter } from '../../src/core/request-router.js';
import { evaluateFactoryConstitution } from '../../src/core/factory-constitution.js';
import { evaluateCompletionGates } from '../../src/core/completion-gates.js';
import { buildUnknownRegister } from '../../src/core/unknowns.js';

const hash = 'c'.repeat(64);
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('factory hardening v9', () => {
  it('requires exactly the three scheduled approvals and binds final approval to the candidate hash', () => {
    const plan = buildHumanApprovalPlan('reference_reskin');
    const records = plan.sessions.map((session) => ({
      schemaVersion: 1 as const,
      recordId: `record-${session.id}`,
      sessionId: session.id,
      approvalClass: 'scheduled' as const,
      decision: 'APPROVE' as const,
      reviewer: 'owner',
      artifactRefs: session.requiredArtifacts,
      ...(session.id === 'FINAL_RELEASE' ? { candidateHash: hash } : {}),
      notes: ['played'],
      recordedAt: new Date().toISOString(),
    }));
    expect(evaluateHumanApprovalRecords(plan, records, { candidateHash: hash }).passed).toBe(true);
    expect(evaluateHumanApprovalRecords(plan, records.slice(1), { candidateHash: hash }).blockers).toContain('scheduled:GO_NO_GO:missing');
    expect(evaluateHumanApprovalRecords(plan, records, { candidateHash: 'd'.repeat(64) }).blockers).toContain('scheduled:FINAL_RELEASE:candidate-hash-mismatch');
  });

  it('does not count conditional or async records as a scheduled approval', () => {
    const plan = buildHumanApprovalPlan('prototype_tournament');
    const records: HumanApprovalRecord[] = plan.sessions.slice(0, 2).map((session) => ({
      schemaVersion: 1 as const,
      recordId: `record-${session.id}`,
      sessionId: session.id,
      approvalClass: 'scheduled' as const,
      decision: 'APPROVE' as const,
      reviewer: 'owner',
      artifactRefs: session.requiredArtifacts,
      notes: ['played'],
      recordedAt: new Date().toISOString(),
    }));
    records.push({
      schemaVersion: 1,
      recordId: 'async-release',
      sessionId: 'release-promotion',
      approvalClass: 'async',
      decision: 'ACK',
      reviewer: 'owner',
      artifactRefs: ['artifacts/live-verification/'],
      notes: ['paperwork'],
      recordedAt: new Date().toISOString(),
    });
    const result = evaluateHumanApprovalRecords(plan, records);
    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('scheduled:FINAL_RELEASE:missing');
  });

  it('requires line-specific representative play evidence instead of generic idle evidence', () => {
    const plan = buildProductionLinePlayPlan('choice-life');
    const generic = evaluateProductionLinePlayEvidence(plan, {
      line: 'idle-management',
      buildHash: hash,
      naturalInput: true,
      steps: plan.steps.map((step) => ({ id: step.id, passed: true, evidence: ['produce', 'deliver'] })),
      forbiddenOperations: [],
    });
    expect(generic.passed).toBe(false);
    expect(generic.blockers).toContain('line-mismatch');
    const valid = evaluateProductionLinePlayEvidence(plan, {
      line: 'choice-life',
      buildHash: hash,
      naturalInput: true,
      steps: plan.steps.map((step) => ({ id: step.id, passed: true, evidence: [`trace:${step.id}`] })),
      forbiddenOperations: [],
    });
    expect(valid.passed).toBe(true);
  });

  it('derives cut-line evidence only when natural input proves cut, drop, obstacle, failure, and retry', () => {
    const plan = buildProductionLinePlayPlan('cut-stack-dodge');
    const natural = evaluateNaturalFlow({
      line: 'cut-stack-dodge',
      startedFromReset: true,
      actions: ['page.goto', 'pointer:tap', 'observe:cut', 'observe:drop', 'observe:obstacle', 'pointer:retry', 'pointer:finish'],
      transitions: [
        { name: 'cut', changed: true, evidence: 'cut target changed' },
        { name: 'drop', changed: true, evidence: 'fragment fell' },
        { name: 'obstacle-failure', changed: true, evidence: 'hazard caused failure' },
        { name: 'retry', changed: true, evidence: 'retry returned to ready' },
        { name: 'finish', changed: true, evidence: 'finish settled' },
      ],
      completion: 'terminal',
      replayObserved: true,
      forbiddenOperations: [],
      screenshots: ['start.png', 'failure.png', 'finish.png'],
    });
    const evidence = deriveProductionLinePlayEvidence(plan, natural, hash);
    expect(evidence.steps.every((step) => step.passed)).toBe(true);
    expect(evaluateProductionLinePlayEvidence(plan, evidence, { expectedBuildHash: hash })).toMatchObject({ passed: true, blockers: [] });

    const missingDrop = { ...natural, transitions: natural.transitions.filter((transition) => transition.name !== 'drop') };
    expect(deriveProductionLinePlayEvidence(plan, missingDrop, hash).steps.some((step) => !step.passed)).toBe(true);
  });

  it('reads only allow-listed factory source files and changes the signature when one changes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'factory-source-'));
    roots.push(root);
    await mkdir(path.join(root, 'src/core'), { recursive: true });
    await writeFile(path.join(root, 'src/factory.ts'), 'one');
    await writeFile(path.join(root, 'src/core/model-policy.ts'), 'two');
    const entries = await collectFactorySourceEntries(root, ['src/factory.ts', 'src/core/model-policy.ts', 'src/not-present.ts']);
    expect(entries.map((entry) => entry.path)).toEqual(['src/factory.ts', 'src/core/model-policy.ts', 'src/not-present.ts']);
    const first = buildFactorySourceSignature(entries);
    await writeFile(path.join(root, 'src/factory.ts'), 'changed');
    const second = buildFactorySourceSignature(await collectFactorySourceEntries(root, ['src/factory.ts', 'src/core/model-policy.ts', 'src/not-present.ts']));
    expect(second).not.toBe(first);
  });

  it('rejects a platform child path that escapes its platform namespace and verifies an on-disk package hash', async () => {
    const set = buildPlatformPackageSet({ gameId: 'g', coreHash: hash, targets: ['wechat-minigame'] });
    expect(() => markPlatformPackageReady(set, 'wechat-minigame', {
      artifactHash: hash,
      childRoot: '../other',
      device: { name: 'phone', width: 390, height: 844, os: 'android' },
      evidence: ['device'],
    })).toThrow(/child|platform|unsafe/i);
    const root = await mkdtemp(path.join(tmpdir(), 'platform-package-'));
    roots.push(root);
    const child = path.join(root, 'platform-builds/wechat-minigame');
    await mkdir(child, { recursive: true });
    await writeFile(path.join(child, 'index.js'), 'package');
    const actual = await verifyPlatformPackageArtifact({ runRoot: root, platform: 'wechat-minigame', childRoot: 'platform-builds/wechat-minigame' });
    expect(actual.passed).toBe(true);
    expect(actual.artifactHash).toMatch(/^[a-f0-9]{64}$/u);
    expect((await verifyPlatformPackageArtifact({ runRoot: root, platform: 'wechat-minigame', childRoot: 'platform-builds/wechat-minigame', expectedHash: 'd'.repeat(64) })).passed).toBe(false);
  });

  it('rechecks strict package records against the child bytes before release', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'platform-package-set-'));
    roots.push(root);
    const child = path.join(root, 'platform-builds/wechat-minigame');
    await mkdir(child, { recursive: true });
    await writeFile(path.join(child, 'game.json'), '{"entry":"index.js"}');
    const verified = await verifyPlatformPackageArtifact({ runRoot: root, platform: 'wechat-minigame', childRoot: 'platform-builds/wechat-minigame' });
    const ready = markPlatformPackageReady(buildPlatformPackageSet({ gameId: 'g', coreHash: hash, targets: ['wechat-minigame'] }), 'wechat-minigame', {
      artifactHash: verified.artifactHash!, childRoot: 'platform-builds/wechat-minigame', device: { name: 'phone', width: 390, height: 844, os: 'test' }, evidence: ['device'], normalFlowEvidence: ['flow'], visualEvidence: ['visual'], runtimeEvidence: ['runtime'],
    });
    expect((await verifyPlatformPackageSetArtifacts(ready, root)).passed).toBe(true);
    await writeFile(path.join(child, 'game.json'), '{"entry":"tampered"}');
    const tampered = await verifyPlatformPackageSetArtifacts(ready, root);
    expect(tampered.passed).toBe(false);
    expect(tampered.blockers).toContain('wechat-minigame:artifact-hash-mismatch');
  });

  it('keeps the eval route deterministic while carrying a source signature', () => {
    const report = runFactoryEvalSuite(defaultFactoryEvalCases(), (input) => new RequestRouter().route(input), {
      modelSignature: 'm', promptSignature: 'p', factorySignature: hash, feedbackRegressionIds: ['r1'], feedbackRegressionSignature: hash,
    });
    expect(report.factorySignature).toBe(hash);
    expect(report.feedbackRegressionIds).toEqual(['r1']);
    expect(report.feedbackRegressionSignature).toBe(hash);
  });

  it('makes the approval ledger a strict constitution gate only when requested', () => {
    const completion = evaluateCompletionGates({
      core: { passed: true, evidence: ['core'] },
      normalFlow: { passed: true, evidence: ['flow'] },
      visualEvidence: { passed: true, evidence: ['visual'] },
      levelDifference: { passed: true, evidence: ['variation'] },
      humanPlaytest: { passed: true, evidence: ['human'] },
    });
    const base = { completion, unknowns: buildUnknownRegister({ runId: 'g', items: [] }), ledger: { schemaVersion: 1 as const, entries: [], updatedAt: new Date().toISOString() }, requireHumanApprovals: true };
    expect(evaluateFactoryConstitution(base).blockers).toContain('human-approvals');
    expect(evaluateFactoryConstitution({ ...base, humanApprovals: { passed: true } }).passed).toBe(true);
  });
});
