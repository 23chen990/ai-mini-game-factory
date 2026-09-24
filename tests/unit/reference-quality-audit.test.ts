import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditReferenceQuality } from '../../src/core/reference-quality-audit.js';
import { sha256File, sha256Text } from '../../src/core/files.js';
import { FileRunStore } from '../../src/core/run-store.js';
import { buildPermissionManifestBundle } from '../../src/core/permission-manifest.js';
import { buildPipelinePlan } from '../../src/core/pipeline-plan.js';
import { buildProductExperienceContract } from '../../src/core/product-experience.js';
import { verifyPerceptualQaReview } from '../../src/core/product-experience-qa.js';
import { verifyReferenceFidelityReview } from '../../src/core/reference-evidence.js';
import { ReferenceQualityAuditSchema } from '../../src/schemas/reference-quality-audit.js';
import { ReferenceFidelityContractSchema } from '../../src/schemas/reference-fidelity.js';
import { referenceBehaviorChecks } from '../fixtures/reference-behavior.js';

const canonicalTargetGame = '逆袭公主';

async function writeVerifiedEvidence(runRoot: string, targetGame: string, workspace: string) {
  const storedPath = 'reference-evidence/incoming/reference-notes.txt';
  const absolute = path.join(runRoot, storedPath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, 'verified reference behavior');
  const sha256 = createHash('sha256').update(await readFile(absolute)).digest('hex');
  await writeFile(path.join(runRoot, 'reference-evidence/manifest.json'), `${JSON.stringify({
    schemaVersion: 1,
    targetGame,
    workspace,
    entries: [{
      id: 'reference-notes',
      sourcePath: absolute,
      storedPath,
      purpose: 'design-document',
      sha256,
      targetGame,
      workspace,
      identityStatus: 'VERIFIED_TARGET',
      reviewStatus: 'VERIFIED',
      usableAsEvidence: true,
    }],
  }, null, 2)}\n`);
  return { absolute, storedPath, sha256 };
}

async function writeJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function createCanonicalRun(root: string, runId: string) {
  const seedFile = path.join(root, 'reference-seed.yaml');
  await writeFile(seedFile, await readFile(path.join(process.cwd(), 'examples/seeds/relic-revival-workshop.yaml'), 'utf8'));
  const store = new FileRunStore(root);
  await store.create(runId, seedFile, 'mock');
  await store.writeArtifact(runId, 'pipeline-plan.json', buildPipelinePlan({
    mode: 'replica-preview',
    designMode: 'reference_reskin',
    productionLine: 'idle-shop',
    primaryProfile: 'ACTION_FEEL',
  }));
  return { store, runRoot: store.runRoot(runId) };
}

describe('reference quality audit', () => {
  it('requires a new canonical run when a historical game has evidence but no resumable factory bootstrap', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'reference-quality-history-'));
    const runId = 'historical-slice';
    const runRoot = path.join(root, 'runs', runId);
    const workspace = path.join(runRoot, 'workspace/prototype-a');
    await mkdir(workspace, { recursive: true });
    await writeVerifiedEvidence(runRoot, canonicalTargetGame, workspace);

    const report = await auditReferenceQuality({ runRoot, targetRunId: runId, targetWorkspace: workspace });

    expect(ReferenceQualityAuditSchema.parse(report)).toEqual(report);
    expect(report.disposition).toBe('REQUIRES_NEW_RUN_MIGRATION');
    expect(report.evidence.status).toBe('VERIFIED');
    expect(report.bootstrap.status).toBe('INCOMPLETE');
    expect(report.summary).toEqual({ standardResumeSafe: false, migrationRequired: true, completionClaimAllowed: false });
    expect(report.generatedWorkspaceModified).toBe(false);
  });

  it('blocks a canonical run whose research permission cannot read run-bound evidence', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'reference-quality-permission-'));
    const runId = 'stale-permission';
    const { store, runRoot } = await createCanonicalRun(root, runId);
    const workspace = path.join(runRoot, 'workspace/game');
    await writeVerifiedEvidence(runRoot, canonicalTargetGame, workspace);
    const stale = buildPermissionManifestBundle();
    for (const manifest of stale.manifests) {
      if (manifest.stage === 'REFERENCE_DEEP_RESEARCH') manifest.readScope = manifest.readScope.filter((scope) => scope !== 'reference-evidence/');
    }
    await store.writeArtifact(runId, 'permission-manifest.json', stale);

    const report = await auditReferenceQuality({ runRoot, targetRunId: runId });

    expect(report.disposition).toBe('BLOCKED_CONTROL_PLANE');
    expect(report.permissionManifest.status).toBe('STALE');
    expect(report.blockers).toContain('permission-manifest:reference-evidence-read-scope-missing');
    expect(report.summary.standardResumeSafe).toBe(false);
  });

  it('allows a canonical pre-research run to resume without pretending quality review has passed', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'reference-quality-ready-'));
    const runId = 'ready-reference';
    const { store, runRoot } = await createCanonicalRun(root, runId);
    const workspace = path.join(runRoot, 'workspace/game');
    await writeVerifiedEvidence(runRoot, canonicalTargetGame, workspace);
    await store.writeArtifact(runId, 'permission-manifest.json', buildPermissionManifestBundle());

    const report = await auditReferenceQuality({ runRoot, targetRunId: runId });

    expect(report.disposition).toBe('READY_FOR_STANDARD_RESUME');
    expect(report.build).toMatchObject({ status: 'PENDING', requiredNow: false });
    expect(report.contracts.every((contract) => contract.status === 'PENDING')).toBe(true);
    expect(report.summary).toEqual({ standardResumeSafe: true, migrationRequired: false, completionClaimAllowed: false });
  });

  it('fails closed when verified evidence bytes no longer match the manifest hash', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'reference-quality-hash-'));
    const runId = 'changed-evidence';
    const { store, runRoot } = await createCanonicalRun(root, runId);
    const workspace = path.join(runRoot, 'workspace/game');
    const evidence = await writeVerifiedEvidence(runRoot, canonicalTargetGame, workspace);
    await store.writeArtifact(runId, 'permission-manifest.json', buildPermissionManifestBundle());
    await writeFile(evidence.absolute, 'changed after verification');

    const report = await auditReferenceQuality({ runRoot, targetRunId: runId });

    expect(report.disposition).toBe('BLOCKED_EVIDENCE');
    expect(report.evidence.status).toBe('BLOCKED');
    expect(report.blockers).toContain('evidence-provenance:hash-mismatch:reference-notes');
  });

  it('distinguishes a malformed manifest from missing evidence', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'reference-quality-invalid-manifest-'));
    const runId = 'invalid-manifest';
    const runRoot = path.join(root, 'runs', runId);
    const workspace = path.join(runRoot, 'workspace/prototype-a');
    await mkdir(path.join(runRoot, 'reference-evidence'), { recursive: true });
    await mkdir(workspace, { recursive: true });
    await writeFile(path.join(runRoot, 'reference-evidence/manifest.json'), '{not-json');

    const report = await auditReferenceQuality({ runRoot, targetRunId: runId, targetWorkspace: workspace });

    expect(report.disposition).toBe('BLOCKED_EVIDENCE');
    expect(report.evidence.status).toBe('INVALID');
    expect(report.evidence.blockers).toEqual(['evidence-provenance:schema-invalid']);
  });

  it('requires contract regeneration when research is marked complete without its five-dimensional artifacts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'reference-quality-contracts-'));
    const runId = 'missing-contracts';
    const { store, runRoot } = await createCanonicalRun(root, runId);
    const workspace = path.join(runRoot, 'workspace/game');
    await writeVerifiedEvidence(runRoot, canonicalTargetGame, workspace);
    await store.writeArtifact(runId, 'permission-manifest.json', buildPermissionManifestBundle());
    const state = await store.load(runId);
    const record = store.record('REFERENCE_DEEP_RESEARCH');
    record.status = 'completed';
    record.finishedAt = new Date().toISOString();
    state.stage = 'REFERENCE_DEEP_RESEARCH';
    state.status = 'completed';
    state.stages.REFERENCE_DEEP_RESEARCH = record;
    await store.save(state);

    const report = await auditReferenceQuality({ runRoot, targetRunId: runId });

    expect(report.disposition).toBe('REQUIRES_QUALITY_RETEST');
    expect(report.contracts.slice(0, 2).map((contract) => contract.status)).toEqual(['MISSING', 'MISSING']);
    expect(report.blockers).toContain('reference-quality:artifact-missing:artifacts/reference-behavior-analysis.json');
  });

  it('allows a completion claim only for the actual build with independent exact-branch evidence and CORE_DEMO acceptance', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'reference-quality-accepted-'));
    const runId = 'accepted-reference';
    const { store, runRoot } = await createCanonicalRun(root, runId);
    const workspace = path.join(runRoot, 'workspace/game');
    const source = await writeVerifiedEvidence(runRoot, canonicalTargetGame, workspace);
    await store.writeArtifact(runId, 'permission-manifest.json', buildPermissionManifestBundle());
    const checks = referenceBehaviorChecks({ path: source.storedPath, sha256: source.sha256 });
    await store.writeArtifact(runId, 'reference-behavior-analysis.json', {
      schemaVersion: 1, targetRunId: runId, behaviorChecks: checks, observations: ['observed'], inferences: [], unknowns: [], status: 'READY',
    });
    const fidelity = ReferenceFidelityContractSchema.parse({
      schemaVersion: 1, targetRunId: runId, referenceName: 'synthetic reference', provenance: [{ path: source.storedPath, sha256: source.sha256 }],
      coreLoopOrder: ['observe', 'act', 'resolve', 'replay'], inputStateTransitions: ['resolve'], failureRecoveryRules: ['retry'],
      mustPreserveMechanics: ['causal sequence'], progressionSystems: ['progress'], unlockRules: ['unlock'], behaviorChecks: checks,
      feedbackTimingBands: { immediateSeconds: 1, microGoalMinSeconds: 10, microGoalMaxSeconds: 60 }, status: 'READY', blockers: [],
    });
    const fidelityFile = path.join(runRoot, 'artifacts/reference-fidelity-contract.json');
    await writeJson(fidelityFile, fidelity);
    await mkdir(path.join(workspace, 'src'), { recursive: true });
    await mkdir(path.join(workspace, 'dist'), { recursive: true });
    await writeFile(path.join(workspace, 'src/main.ts'), 'runtime entry');
    await writeFile(path.join(workspace, 'dist/index.html'), 'playable build');
    await store.writeArtifact(runId, 'build-report.json', {
      schemaVersion: 1, success: true, runtime: 'web-lite', template: 'idle-shop-v1', workspace,
      webBuild: 'workspace/game/dist', files: ['index.html'], verification: ['test:passed', 'typecheck:passed'], builtAt: new Date().toISOString(),
    });
    const distFileHash = await sha256File(path.join(workspace, 'dist/index.html'));
    const buildHash = sha256Text(`index.html:${distFileHash}`);
    const product = buildProductExperienceContract({
      targetGame: canonicalTargetGame, targetRunId: runId, targetWorkspace: workspace, runtime: 'web-lite',
      sourceArtifact: { kind: 'reference-fidelity', path: 'artifacts/reference-fidelity-contract.json', sha256: await sha256File(fidelityFile) },
      referenceBehaviorChecks: checks, deviceBaselines: [{ width: 390, height: 844, label: 'phone-portrait' }],
    });
    await store.writeArtifact(runId, 'product-experience-contract.json', product);

    const screenshotBody = 'synthetic pixels';
    const screenshot = { path: 'screenshots/reference-core.png', sha256: sha256Text(screenshotBody) };
    await mkdir(path.join(runRoot, 'screenshots'), { recursive: true });
    await writeFile(path.join(runRoot, screenshot.path), screenshotBody);
    const flow = {
      schemaVersion: 1, startedFromReset: true, actions: ['tap target', 'tap replay'],
      transitions: checks.map((check) => ({ name: check.id, changed: true, evidence: check.expectedStateChange })),
      completion: 'settlement', replayObserved: true, forbiddenOperations: [], screenshots: [screenshot.path], passed: true, blockers: [],
      buildHash, runtime: 'web-lite', device: { width: 390, height: 844, label: 'phone-portrait' }, seed: 1,
      runner: 'synthetic-test-only', observedAt: new Date().toISOString(),
    };
    const traceBody = JSON.stringify(flow);
    const trace = { path: 'logs/reference-core.json', sha256: sha256Text(traceBody) };
    await mkdir(path.join(runRoot, 'logs'), { recursive: true });
    await writeFile(path.join(runRoot, trace.path), traceBody);
    const fidelityReview = {
      schemaVersion: 1, targetRunId: runId, workspace, contractHash: sha256Text(JSON.stringify(fidelity)), buildHash,
      reviewer: 'QAAgent', authorIndependent: true,
      cases: checks.map((check) => ({ checkId: check.id, objectType: check.objectType, stateBranch: check.stateBranch, viewport: check.viewport, passed: true, perceptualPassed: true, observedStateChange: check.expectedStateChange, observedFeedback: 'target-local feedback', screenshots: [screenshot], trace })),
    };
    await store.writeArtifact(runId, 'reference-fidelity-review.json', fidelityReview);
    await store.writeArtifact(runId, 'reference-fidelity-gate.json', await verifyReferenceFidelityReview({ runRoot, targetRunId: runId, workspace, buildHash, contract: fidelity, review: fidelityReview }));
    const perceptualReport = {
      schemaVersion: 2, artifactType: 'perceptual-qa-report', targetGame: canonicalTargetGame, targetRunId: runId, targetWorkspace: workspace,
      runtimeEntrypoints: product.runtimeEntrypoints, contractHash: sha256Text(JSON.stringify(product)), buildHash, runtime: 'web-lite', reviewer: 'QAAgent', authorIndependent: true,
      passed: true, blockers: [], checkedAt: new Date().toISOString(),
      cases: product.features.map((feature) => ({ featureId: feature.id, sourceCheckIds: feature.sourceCheckIds, objectType: feature.objectType, stateBranch: feature.stateBranch, viewport: feature.requiredViewports[0], playerVisible: true, naturalTriggerVerified: true, eventOrderVerified: true, negativeAssertionsPassed: true, perceptualPassed: true, observedSignal: feature.visibleSignal, observedEventOrder: feature.expectedEventOrder, screenshots: [screenshot], trace, evidence: ['independent pixel review'], notes: [] })),
    };
    await store.writeArtifact(runId, 'perceptual-qa-report.json', perceptualReport);
    await store.writeArtifact(runId, 'perceptual-qa-gate.json', await verifyPerceptualQaReview({ runRoot, workspace, contract: product, buildHash, report: perceptualReport }));
    await writeJson(path.join(runRoot, 'human/playtest-acceptance.json'), { schemaVersion: 1, passed: true, sessionId: 'CORE_DEMO', buildHash, inputMode: 'touch', notes: ['core loop accepted'], evidence: ['natural play'], approvedAt: new Date().toISOString() });

    const state = await store.load(runId);
    for (const stage of ['REFERENCE_DEEP_RESEARCH', 'PRODUCT_EXPERIENCE_CONTRACT', 'FULL_BUILD', 'QA', 'PERCEPTUAL_QA'] as const) {
      const record = store.record(stage);
      record.status = 'completed';
      record.finishedAt = new Date().toISOString();
      state.stages[stage] = record;
    }
    const waiting = store.record('WAITING_FOR_HUMAN_PLAYTEST');
    waiting.status = 'waiting';
    state.stages.WAITING_FOR_HUMAN_PLAYTEST = waiting;
    state.stage = 'WAITING_FOR_HUMAN_PLAYTEST';
    state.status = 'waiting';
    await store.save(state);

    const report = await auditReferenceQuality({ runRoot, targetRunId: runId });

    expect(report.disposition).toBe('CORE_DEMO_ACCEPTED');
    expect(report.build).toMatchObject({ status: 'READY', buildHash });
    expect(report.contracts.map((contract) => contract.status)).toEqual(['READY', 'READY', 'READY', 'PASSED', 'PASSED', 'ACCEPTED']);
    expect(report.summary.completionClaimAllowed).toBe(true);
    expect(report.blockers).toEqual([]);
  });
});
