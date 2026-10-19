import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createArtifactLedger, recordArtifact, reconcileArtifactLedger } from '../../src/core/artifact-ledger.js';
import { buildHumanApprovalPlan } from '../../src/core/human-approval.js';
import { HumanApprovalPlanSchema } from '../../src/schemas/human-approval.js';
import { buildArtifactMetadata } from '../../src/core/artifact-metadata.js';
import { ArtifactMetadataSchema } from '../../src/schemas/artifact-metadata.js';
import { sha256Text } from '../../src/core/files.js';
import { createFactory } from '../../src/factory.js';
import { promoteReleaseLifecycleThrough } from '../../src/core/release-lifecycle.js';
import { buildPlatformPackageSet, markPlatformPackageReady, verifyPlatformPackageArtifact } from '../../src/core/platform-packaging.js';

const hash = (letter: string) => letter.repeat(64);

describe('factory control plane v6 contracts', () => {
  it('reconciles on-disk drift and invalidates direct and transitive dependents', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'factory-ledger-reconcile-'));
    await writeFile(path.join(root, 'a.json'), 'a');
    await writeFile(path.join(root, 'b.json'), 'b');
    await writeFile(path.join(root, 'c.json'), 'c');
    let ledger = createArtifactLedger();
    ledger = recordArtifact(ledger, { path: 'a.json', sha256: sha256Text('a'), producerStage: 'BLUEPRINT', inputHashes: {} });
    ledger = recordArtifact(ledger, { path: 'b.json', sha256: sha256Text('b'), producerStage: 'FULL_BUILD', inputHashes: { 'a.json': sha256Text('a') } });
    ledger = recordArtifact(ledger, { path: 'c.json', sha256: sha256Text('c'), producerStage: 'QA', inputHashes: { 'b.json': sha256Text('b') } });

    await writeFile(path.join(root, 'a.json'), 'tampered');
    const result = await reconcileArtifactLedger(ledger, root);
    expect(result.changed).toEqual(['a.json']);
    expect(result.missing).toEqual([]);
    expect(result.passed).toBe(false);
    expect(result.ledger.entries.find((entry) => entry.path === 'a.json')?.invalidatedBy).toContain('drift:a.json');
    expect(result.ledger.entries.find((entry) => entry.path === 'b.json')?.status).toBe('INVALIDATED');
    expect(result.ledger.entries.find((entry) => entry.path === 'c.json')?.status).toBe('INVALIDATED');
  });

  it('treats missing files and traversal paths as blocking integrity failures', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'factory-ledger-missing-'));
    let ledger = createArtifactLedger();
    ledger = recordArtifact(ledger, { path: 'missing.json', sha256: hash('a'), producerStage: 'QA', inputHashes: {} });
    const missing = await reconcileArtifactLedger(ledger, root);
    expect(missing.missing).toEqual(['missing.json']);
    expect(missing.passed).toBe(false);
    ledger = recordArtifact(ledger, { path: '../escape.json', sha256: hash('b'), producerStage: 'QA', inputHashes: {} });
    const traversal = await reconcileArtifactLedger(ledger, root);
    expect(traversal.passed).toBe(false);
    expect(traversal.blockers.some((item) => /unsafe|escape|path/i.test(item))).toBe(true);
  });

  it('makes the three scheduled sessions and conditional/async approvals explicit', () => {
    const plan = HumanApprovalPlanSchema.parse(buildHumanApprovalPlan('reference_reskin'));
    expect(plan.scheduledSessions).toHaveLength(3);
    expect(plan.scheduledSessions.every((session) => session.countsTowardScheduledSession)).toBe(true);
    expect(plan.conditionalGates.length).toBeGreaterThan(0);
    expect(plan.conditionalGates.every((gate) => gate.countsTowardScheduledSession === false)).toBe(true);
    expect(plan.conditionalGates.map((gate) => gate.id)).toContain('differentiation-review');
    expect(plan.asyncRecords.length).toBeGreaterThan(0);
    expect(plan.sessions.map((session) => session.id)).toEqual(['GO_NO_GO', 'CORE_DEMO', 'FINAL_RELEASE']);
  });

  it('records artifact identity, provenance and retention metadata without breaking old callers', () => {
    const metadata = buildArtifactMetadata({
      runId: 'run-1', path: 'artifacts/a.json', producerStage: 'BLUEPRINT', inputHashes: {},
      outputHash: hash('a'), model: 'gpt-5.6-sol', reasoning: 'max',
      artifactType: 'design', promptVersion: 'prompt-v2', policyVersion: 'policy-v3',
      dataClassification: 'internal', retentionPolicy: 'run-lifetime',
    });
    const parsed = ArtifactMetadataSchema.parse(metadata);
    expect(parsed.artifactId).toMatch(/^[a-f0-9]{64}$/u);
    expect(parsed.artifactType).toBe('design');
    expect(parsed.promptVersion).toBe('prompt-v2');
    expect(parsed.policyVersion).toBe('policy-v3');
    expect(parsed.dataClassification).toBe('internal');
    expect(parsed.retentionPolicy).toBe('run-lifetime');
    expect(parsed.dependsOn).toEqual([]);
  });

  async function liveFixture() {
    const root = await mkdtemp(path.join(tmpdir(), 'factory-live-verify-'));
    const seed = path.join(root, 'seed.yaml');
    await writeFile(seed, 'title: Live Verify\ntheme: spirits\ntemplate: idle-shop-v1\ndesignMode: prototype_tournament\n');
    const factory = createFactory({ root, mode: 'mock', qaMode: 'stub' });
    const runId = await factory.newRun(seed);
    const runRoot = path.join(root, 'runs', runId);
    const contents = '<h1>First-party test build</h1>';
    const releaseHash = sha256Text(`index.html:${sha256Text(contents)}`);
    const childRoot = 'platform-builds/douyin-minigame';
    for (const folder of ['workspace/game/dist', 'release-candidate/web', childRoot]) await mkdir(path.join(runRoot, folder), { recursive: true });
    await writeFile(path.join(runRoot, 'workspace/game/dist/index.html'), contents);
    await writeFile(path.join(runRoot, 'release-candidate/web/index.html'), contents);
    await writeFile(path.join(runRoot, childRoot, 'game.js'), '// first-party native package fixture');
    const native = await verifyPlatformPackageArtifact({ runRoot, platform: 'douyin-minigame', childRoot });
    expect(native.passed).toBe(true);
    assert(native.artifactHash);
    const packageHash = native.artifactHash;
    await writeFile(path.join(runRoot, 'artifacts/build-report.json'), JSON.stringify({ schemaVersion: 1, success: true, runtime: 'web-lite', template: 'idle-shop-v1', workspace: 'workspace/game', webBuild: 'workspace/game/dist', files: ['index.html'], verification: ['test:passed', 'typecheck:passed'], builtAt: new Date().toISOString() }));
    await writeFile(path.join(runRoot, 'artifacts/release-candidate.json'), JSON.stringify({ schemaVersion: 1, gameId: 'live-verify', coreHash: releaseHash, acceptanceArtifact: 'reports/qa-report.json', testedAt: new Date().toISOString(), status: 'READY', files: [{ path: 'web/index.html', sha256: sha256Text(contents) }] }));
    const packages = markPlatformPackageReady(buildPlatformPackageSet({ gameId: 'live-verify', coreHash: releaseHash, targets: ['douyin-minigame'] }), 'douyin-minigame', {
      artifactHash: packageHash, childRoot,
      device: { name: 'fixture device', width: 390, height: 844, os: 'fixture' },
      evidence: ['device://test-fixture'], normalFlowEvidence: ['device://flow'], visualEvidence: ['device://visual'], runtimeEvidence: ['device://runtime'],
    });
    await writeFile(path.join(runRoot, 'artifacts/platform-package-set.json'), JSON.stringify(packages));
    await writeFile(path.join(runRoot, 'artifacts/release-lifecycle.json'), JSON.stringify(promoteReleaseLifecycleThrough(undefined, { gameId: 'live-verify', releaseHash, to: 'SUBMITTED' })));
    const input = {
      gameId: 'live-verify', platform: 'douyin-minigame', releaseHash, packageHash,
      checks: { startup: true, coreLoop: true, terminalState: true, replay: true, adFallback: true, rewardIdempotency: true, saveRestore: true, telemetry: true, noConsoleErrors: true, packageHashMatch: true },
      evidence: ['device://capture/1'], verifier: 'HumanReviewer',
    };
    return { factory, runId, runRoot, childRoot, input };
  }

  it('promotes only a submitted frozen release with the exact distinct native package hash', async () => {
    const { factory, runId, runRoot, input } = await liveFixture();
    expect(input.packageHash).not.toBe(input.releaseHash);
    const result = await factory.recordLiveVerification(runId, input);
    expect(result.report.status).toBe('LIVE_VERIFIED');
    expect(JSON.parse(await readFile(path.join(runRoot, 'artifacts/release-lifecycle.json'), 'utf8')).status).toBe('LIVE_VERIFIED');
  });

  it('does not promote H5-only claims without a native package hash', async () => {
    const { factory, runId, runRoot, input } = await liveFixture();
    await expect(factory.recordLiveVerification(runId, { ...input, packageHash: undefined })).rejects.toThrow(/packageHash/);
    expect(JSON.parse(await readFile(path.join(runRoot, 'artifacts/release-lifecycle.json'), 'utf8')).status).toBe('SUBMITTED');
  });

  it('rejects a claimed package hash that does not identify the platform child', async () => {
    const { factory, runId, input } = await liveFixture();
    await expect(factory.recordLiveVerification(runId, { ...input, packageHash: input.releaseHash })).rejects.toThrow(/package.*hash|packageHash/i);
  });

  it('rejects native package bytes changed after device QA', async () => {
    const { factory, runId, runRoot, childRoot, input } = await liveFixture();
    await writeFile(path.join(runRoot, childRoot, 'game.js'), '// changed after QA');
    await expect(factory.recordLiveVerification(runId, input)).rejects.toThrow(/artifact-hash-mismatch/);
  });

  it('rejects a stale frozen candidate even if the report repeats its old hash', async () => {
    const { factory, runId, runRoot, input } = await liveFixture();
    await writeFile(path.join(runRoot, 'release-candidate/web/index.html'), 'changed after acceptance');
    await expect(factory.recordLiveVerification(runId, input)).rejects.toThrow(/frozen|candidate/i);
  });

  it('cannot synthesize platform submission from a candidate-only lifecycle', async () => {
    const { factory, runId, runRoot, input } = await liveFixture();
    await writeFile(path.join(runRoot, 'artifacts/release-lifecycle.json'), JSON.stringify(promoteReleaseLifecycleThrough(undefined, { gameId: input.gameId, releaseHash: input.releaseHash, to: 'CANDIDATE_READY' })));
    await expect(factory.recordLiveVerification(runId, input)).rejects.toThrow(/SUBMITTED/);
  });
});
