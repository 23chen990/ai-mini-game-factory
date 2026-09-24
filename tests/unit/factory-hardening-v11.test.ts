import { mkdtemp, mkdir, symlink, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RuntimeProductGateSchema, evaluateRuntimeProductGate, validateRuntimeWiredFiles, verifyRuntimeWiredFiles } from '../../src/core/runtime-product-gates.js';
import { buildUnknownRegister, evaluateUnknownRegister } from '../../src/core/unknowns.js';
import { buildHumanApprovalPlan, evaluateHumanApprovalRecords, evaluateHumanApprovalLedgerArtifact } from '../../src/core/human-approval.js';
import { buildContextPacket } from '../../src/core/context-budget.js';
import { executionPolicyForAttempt, executionPolicyForStage } from '../../src/core/model-policy.js';
import { buildModelRouteDecision } from '../../src/core/model-policy-artifact.js';
import { getStageContract, validateStageModelTier } from '../../src/core/stage-contracts.js';
import { FACTORY_EVAL_SOURCE_PATHS, collectFactorySourceEntries, buildFactorySourceSignature } from '../../src/core/factory-eval.js';
import { createFactory } from '../../src/factory.js';
import { MockAgentProvider } from '../../src/providers/mock.js';
import { FactoryEvalCaseSchema, FactoryEvalReportSchema } from '../../src/schemas/factory-operating.js';
import { evaluateReleaseUnknownGate } from '../../src/core/release.js';

const roots: string[] = [];
const hash = 'a'.repeat(64);

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const completeRuntimeGate = {
  schemaVersion: 1 as const,
  entrypoint: 'workspace/game/dist/index.html',
  defaultMode: 'tutorial-then-endless',
  journey: ['启动', '核心操作', '核心循环完成', '死亡', '结算', '再跑一次'],
  coreLoop: ['核心操作', '核心循环完成'],
  terminal: ['死亡', '结算'],
  replay: ['再跑一次'],
  runtimeWiredFiles: ['workspace/game/dist/index.html'],
  legacyBehavior: { status: 'COMPATIBILITY_ONLY' as const, evidence: ['旧入口仅保留迁移测试'] },
  browserEvidence: ['screenshots/runtime-product.png'],
};

describe('factory hardening v11', () => {
  it('requires explicit core-loop, terminal and replay evidence for a passed runtime gate', () => {
    expect(evaluateRuntimeProductGate(completeRuntimeGate).passed).toBe(true);
    expect(() => RuntimeProductGateSchema.parse({ ...completeRuntimeGate, coreLoop: [], passed: true })).toThrow(/core.loop|coreLoop/i);
    expect(() => RuntimeProductGateSchema.parse({ ...completeRuntimeGate, replay: [], passed: true })).toThrow(/replay/i);
    expect(validateRuntimeWiredFiles(['workspace/game/dist/index.html', '../secret'])).toContain('unsafe:../secret');
  });

  it('verifies runtime wiring against real run-local files and rejects symlinks or missing files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'runtime-wiring-'));
    roots.push(root);
    await mkdir(path.join(root, 'workspace/game/dist'), { recursive: true });
    await writeFile(path.join(root, 'workspace/game/dist/index.html'), '<!doctype html>');
    expect((await verifyRuntimeWiredFiles({ runRoot: root, files: ['workspace/game/dist/index.html'] })).passed).toBe(true);
    expect((await verifyRuntimeWiredFiles({ runRoot: root, files: ['workspace/game/dist/missing.js'] })).blockers).toContain('missing:workspace/game/dist/missing.js');
    await symlink(path.join(root, 'workspace/game/dist/index.html'), path.join(root, 'workspace/game/dist/link.html'));
    expect((await verifyRuntimeWiredFiles({ runRoot: root, files: ['workspace/game/dist/link.html'] })).blockers).toContain('symlink:workspace/game/dist/link.html');
  });

  it('can make every unresolved unknown blocking in strict release evaluation while preserving fast compatibility', () => {
    const register = buildUnknownRegister({ runId: 'strict-unknown', items: [{ id: 'copy', class: 'content', description: 'copy risk', blocking: false, owner: 'ProducerAgent', dueStage: 'BLUEPRINT' }] });
    expect(evaluateUnknownRegister(register).passed).toBe(true);
    const strict = evaluateUnknownRegister(register, { requireAllResolved: true });
    expect(strict.passed).toBe(false);
    expect(strict.blocking).toContain('copy');
  });

  it('requires human approval artifact references to resolve against the run artifact inventory', () => {
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
    const result = evaluateHumanApprovalRecords(plan, records, { candidateHash: hash, availableArtifacts: ['artifacts/factory-profile.json'] });
    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('scheduled:GO_NO_GO:artifact-unavailable:artifacts/business-preflight.json');
  });

  it('keeps required context paths when the packet is aggressively truncated', () => {
    const packet = buildContextPacket({ stage: 'FULL_BUILD', summary: 's'.repeat(4_000), maxChars: 700, inputs: [
      { path: 'artifacts/locked-contract.json', content: 'required contract '.repeat(500), priority: 'required' },
      { path: 'logs/noisy.log', content: 'optional '.repeat(500), priority: 'optional' },
    ] });
    expect(packet.inputs.some((item) => item.path === 'artifacts/locked-contract.json')).toBe(true);
  });

  it('keeps model policy and stage contract tiers aligned', () => {
    for (const stage of ['UI_SKELETON', 'GRAYBOX_CORE', 'CORE_SPEC_FROZEN', 'POLISH_VERTICAL_SLICE'] as const) {
      const policy = executionPolicyForStage(stage);
      expect(validateStageModelTier(getStageContract(stage), policy.tier)).toEqual({ passed: true, blockers: [] });
    }
  });

  it('caps capability escalation at the stage contract instead of crossing role boundaries', () => {
    expect(executionPolicyForAttempt('FULL_BUILD', 2, 'CAPABILITY_ERROR')).toMatchObject({ tier: 'builder', role: 'builder', sandbox: 'workspace-write' });
    expect(executionPolicyForAttempt('QA', 2, 'CAPABILITY_ERROR')).toMatchObject({ tier: 'reviewer', role: 'reviewer', sandbox: 'read-only' });
    expect(buildModelRouteDecision('FULL_BUILD', 1, 'CAPABILITY_ERROR').selected.tier).toBe('builder');
    expect(buildModelRouteDecision('ART_DIRECTIONS', 1, 'CAPABILITY_ERROR').selected.tier).toBe('frontier');
  });

  it('supports calibration and canary datasets without weakening report validation', () => {
    const calibration = FactoryEvalCaseSchema.parse({ schemaVersion: 1, caseId: 'calibration', input: '做一个小店', expectedProfile: 'STRATEGIC_SYSTEM', dataset: 'calibration', requiredStages: ['BUSINESS_PREFLIGHT'], forbiddenOutcomes: [] });
    const canary = FactoryEvalCaseSchema.parse({ schemaVersion: 1, caseId: 'canary', input: '做一个小店', expectedProfile: 'STRATEGIC_SYSTEM', dataset: 'canary', requiredStages: ['BUSINESS_PREFLIGHT'], forbiddenOutcomes: [] });
    expect(calibration.dataset).toBe('calibration');
    expect(FactoryEvalReportSchema.parse({ schemaVersion: 1, suiteVersion: 'test', modelSignature: 'm', promptSignature: 'p', cases: [
      { caseId: canary.caseId, dataset: canary.dataset, passed: true, failures: [] },
    ], passed: true, runAt: new Date().toISOString() }).cases[0]?.dataset).toBe('canary');
  });

  it('uses a strict unknown policy at the release boundary while keeping local evaluation permissive', () => {
    const register = buildUnknownRegister({ runId: 'release-unknown', items: [{ id: 'content', class: 'content', description: 'content copy review', blocking: false, owner: 'ProducerAgent', dueStage: 'BLUEPRINT' }] });
    expect(evaluateReleaseUnknownGate(register, false).passed).toBe(true);
    expect(evaluateReleaseUnknownGate(register, true).passed).toBe(false);
  });

  it('treats an expired human waiver as blocking at the release boundary', () => {
    const now = new Date('2026-09-01T00:00:00.000Z');
    const register = buildUnknownRegister({ runId: 'expired-waiver', items: [{ id: 'waived', class: 'content', description: 'old content review', blocking: false, owner: 'HumanReviewer', dueStage: 'BLUEPRINT', status: 'WAIVED', waiver: { approvedBy: 'human', reason: 'temporary', approvedAt: '2026-08-01T00:00:00.000Z', expiresAt: '2026-08-15T00:00:00.000Z' } }] });
    expect(evaluateUnknownRegister(register, { now }).passed).toBe(true);
    expect(evaluateUnknownRegister(register, { now, requireAllResolved: true })).toMatchObject({ passed: false, blocking: ['waived'] });
  });

  it('fails closed when the approval ledger is malformed or belongs to another run', () => {
    const plan = buildHumanApprovalPlan('reference_reskin');
    const malformed = evaluateHumanApprovalLedgerArtifact(plan, { schemaVersion: 1, runId: 'run-a', records: 'not-an-array', updatedAt: new Date().toISOString() }, { runId: 'run-a' });
    expect(malformed.passed).toBe(false);
    expect(malformed.blockers).toContain('ledger:schema-invalid');

    const foreign = evaluateHumanApprovalLedgerArtifact(plan, { schemaVersion: 1, runId: 'run-b', records: [], updatedAt: new Date().toISOString() }, { runId: 'run-a' });
    expect(foreign.passed).toBe(false);
    expect(foreign.blockers).toContain('ledger:run-id-mismatch');
  });

  it('reconciles a completed run before the terminal fast path and reopens downstream evidence after drift', async () => {
    class DriftReplayProvider extends MockAgentProvider {
      private blueprintCalls = 0;
      override async generateBlueprint(...args: Parameters<MockAgentProvider['generateBlueprint']>) {
        this.blueprintCalls += 1;
        if (this.blueprintCalls > 1) throw new Error('blueprint drift replay');
        return super.generateBlueprint(...args);
      }
    }
    const root = await mkdtemp(path.join(tmpdir(), 'factory-ledger-resume-'));
    roots.push(root);
    const seed = path.join(root, 'seed.yaml');
    await writeFile(seed, 'title: Drift Replay\ntheme: night market\ntemplate: idle-shop-v1\ndesignMode: prototype_tournament\n');
    const factory = createFactory({ root, repositoryRoot: process.cwd(), mode: 'mock', qaMode: 'stub', agentProvider: new DriftReplayProvider() });
    const runId = await factory.demo(seed);
    const runRoot = path.join(root, 'runs', runId);
    await writeFile(path.join(runRoot, 'artifacts/game-blueprint.json'), '{"tampered":true}\n');

    await expect(factory.run(runId)).rejects.toThrow(/blueprint drift replay/);
    const state = await factory.status(runId);
    expect(state.stages.BLUEPRINT?.status).toBe('failed');
    expect(state.stages.FULL_BUILD?.status).toBe('pending');
    const ledger = JSON.parse(await readFile(path.join(runRoot, 'artifacts/artifact-ledger.json'), 'utf8')) as { entries: Array<{ path: string; status: string }> };
    expect(ledger.entries.find((entry) => entry.path === 'artifacts/game-blueprint.json')?.status).toBe('INVALIDATED');
  });

  it('hashes provider and skill inputs in the factory regression signature', async () => {
    expect(FACTORY_EVAL_SOURCE_PATHS).toContain('src/providers/codex-account.ts');
    expect(FACTORY_EVAL_SOURCE_PATHS).toContain('.agents/skills/web-lite-game-builder/SKILL.md');
    expect(FACTORY_EVAL_SOURCE_PATHS).toContain('src/core/artifact-ledger.ts');
    expect(FACTORY_EVAL_SOURCE_PATHS).toContain('src/core/downstream-stages.ts');
    expect(FACTORY_EVAL_SOURCE_PATHS).toContain('src/core/operating-profile.ts');
    expect(FACTORY_EVAL_SOURCE_PATHS).toContain('src/core/run-readiness.ts');
    expect(FACTORY_EVAL_SOURCE_PATHS).toContain('src/schemas/permission-manifest.ts');
    const root = await mkdtemp(path.join(tmpdir(), 'factory-signature-'));
    roots.push(root);
    await mkdir(path.join(root, 'src/providers'), { recursive: true });
    await mkdir(path.join(root, '.agents/skills/web-lite-game-builder'), { recursive: true });
    await writeFile(path.join(root, 'src/providers/codex-account.ts'), 'one');
    await writeFile(path.join(root, '.agents/skills/web-lite-game-builder/SKILL.md'), 'skill-one');
    const paths = ['src/providers/codex-account.ts', '.agents/skills/web-lite-game-builder/SKILL.md'] as const;
    const first = buildFactorySourceSignature(await collectFactorySourceEntries(root, paths));
    await writeFile(path.join(root, '.agents/skills/web-lite-game-builder/SKILL.md'), 'skill-two');
    expect(buildFactorySourceSignature(await collectFactorySourceEntries(root, paths))).not.toBe(first);
  });

  it('derives production validation mode from real browser operation but keeps mock/stub runs fast', () => {
    const fast = createFactory({ mode: 'mock', qaMode: 'stub' }) as { validationMode?: string; effectiveOperatingProfile?: Record<string, unknown> };
    expect(fast.validationMode).toBe('fast');
    expect(fast.effectiveOperatingProfile?.presentationQualityRequired).toBe(false);
    const production = createFactory({ mode: 'codex-account', qaMode: 'playwright', codexExecutor: { assertChatGptLogin: async () => ({ method: 'chatgpt' as const, message: 'ok' }), execute: async () => { throw new Error('not called'); } } }) as { validationMode?: string };
    expect(production.validationMode).toBe('production');
  });

  it('exposes all production safeguards as an effective policy instead of hiding them in defaults', () => {
    const production = createFactory({ mode: 'mock', qaMode: 'playwright', validationMode: 'production' }) as { effectiveOperatingProfile?: Record<string, unknown> };
    expect(production.effectiveOperatingProfile).toMatchObject({
      certificationRequired: true,
      platformQaRequired: true,
      presentationQualityRequired: true,
      blindPlaytestRequired: true,
      supplyChainRequired: true,
      artQualityRequired: true,
      dependencyAllowlistRequired: true,
      portfolioGateRequired: true,
    });
  });
});
