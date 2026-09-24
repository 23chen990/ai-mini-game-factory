import { describe, expect, it } from 'vitest';
import { promoteReleaseLifecycle, promoteReleaseLifecycleThrough } from '../../src/core/release-lifecycle.js';
import { evaluateCostGate } from '../../src/core/factory-operating.js';
import { CostBudgetSchema, CostUsageSchema } from '../../src/schemas/factory-operating.js';
import { buildUnknownRegister, evaluateUnknownRegister } from '../../src/core/unknowns.js';
import { UnknownRegisterSchema } from '../../src/schemas/unknowns.js';
import { inferProductionLineDecisionFromText } from '../../src/core/production-lines.js';
import { buildEvidenceClaimSet, EvidenceClaimSetSchema } from '../../src/core/evidence-claims.js';
import { buildPlatformPackageSet, evaluatePlatformPackageSet } from '../../src/core/platform-packaging.js';
import { PlatformPackageSetSchema } from '../../src/schemas/platform-package.js';
import { evaluatePresentationQuality } from '../../src/core/presentation-evidence.js';
import { PresentationQualityReportSchema } from '../../src/schemas/presentation-evidence.js';
import { buildBuildProvenance, buildDependencyManifest, buildSbom, buildSupplyChainManifest, evaluateSupplyChainManifest, hashSupplyChainArtifact } from '../../src/core/supply-chain.js';
import { BuildProvenanceSchema, DependencyManifestSchema, SbomSchema, SupplyChainManifestSchema } from '../../src/schemas/supply-chain.js';
import { SideEffectContractSchema } from '../../src/schemas/side-effect.js';
import { evaluateBlindPlaytest } from '../../src/core/blind-playtest.js';
import { BlindPlaytestSchema } from '../../src/schemas/blind-playtest.js';
import { buildArtifactMetadata, ArtifactMetadataSchema, invalidateArtifactMetadata } from '../../src/core/artifact-metadata.js';
import { buildSideEffectJournal, beginSideEffect } from '../../src/core/side-effect-journal.js';
import { evaluateFactoryConstitution } from '../../src/core/factory-constitution.js';

const hash = 'a'.repeat(64);

describe('factory governance extensions', () => {
  it('promotes a lifecycle through only valid intermediate states', () => {
    const initial = promoteReleaseLifecycle(undefined, { gameId: 'g', releaseHash: hash, from: null, to: 'IMPLEMENTATION_READY' });
    const final = promoteReleaseLifecycleThrough(initial, { gameId: 'g', releaseHash: hash, to: 'LIVE_VERIFIED' });
    expect(final.status).toBe('LIVE_VERIFIED');
    expect(final.history.map((item) => item.to)).toEqual(['IMPLEMENTATION_READY', 'CANDIDATE_READY', 'RELEASE_READY', 'SUBMITTED', 'LIVE_VERIFIED']);
  });

  it('enforces time, asset, build and repair ceilings in addition to money', () => {
    const budget = CostBudgetSchema.parse({ currency: 'CNY', maxTotalCents: 1000, maxPaidTrafficCents: 500, maxAgentTokens: 1000, maxHumanMinutes: 60, maxFixAttempts: 2, paybackWindowDays: 30, maxWallClockMinutes: 10, maxAssetBatches: 1, maxBuildAttempts: 1, maxRepairLoops: 1 });
    const usage = CostUsageSchema.parse({ totalCents: 1, paidTrafficCents: 0, agentTokens: 1, humanMinutes: 1, fixAttempts: 0, wallClockMinutes: 11, assetBatches: 2, buildAttempts: 2, repairLoops: 2 });
    expect(evaluateCostGate(budget, usage).blockers).toEqual(expect.arrayContaining(['wall-clock', 'asset-batches', 'build-attempts', 'repair-loops']));
  });

  it('keeps unresolved blocking unknowns separate from waivable operational unknowns', () => {
    const register = buildUnknownRegister({ runId: 'run-1', items: [
      { id: 'license', class: 'license', description: 'license not verified', blocking: true, owner: 'ResearchAgent', dueStage: 'OPEN_SOURCE_RESEARCH' },
      { id: 'copy', class: 'content', description: 'copy polish', blocking: false, owner: 'ProducerAgent', dueStage: 'CONTENT_EXPANSION' },
    ] });
    expect(UnknownRegisterSchema.parse(register).items).toHaveLength(2);
    expect(evaluateUnknownRegister(register)).toMatchObject({ passed: false, blocking: ['license'] });
    const waived = { ...register, items: register.items.map((item) => item.id === 'license' ? { ...item, status: 'WAIVED' as const, waiver: { approvedBy: 'human', reason: 'explicit risk acceptance', approvedAt: new Date().toISOString() } } : item) };
    expect(evaluateUnknownRegister(waived).blocking).toEqual([]);
  });

  it('does not silently route social or exploration work to an idle line', () => {
    expect(inferProductionLineDecisionFromText('社交关系经营与聊天')).toMatchObject({ supportDecision: 'NEW_LINE_REQUIRED', line: null });
    expect(inferProductionLineDecisionFromText('规则发现解谜')).toMatchObject({ supportDecision: 'SUPPORTED', line: 'rule-puzzle' });
  });

  it('represents research claims with explicit observation, inference and unknown status', () => {
    const claims = buildEvidenceClaimSet({ source: 'https://example.com', observations: ['tap to move'], inferences: ['short-session design'], unknowns: ['retention'] });
    expect(EvidenceClaimSetSchema.parse(claims).claims.map((claim) => claim.status)).toEqual(['OBSERVED', 'INFERRED', 'UNKNOWN']);
  });

  it('requires independent hashed package evidence for every selected platform', () => {
    const packages = buildPlatformPackageSet({ gameId: 'g', coreHash: hash, targets: ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'] });
    expect(PlatformPackageSetSchema.parse(packages).packages).toHaveLength(3);
    expect(evaluatePlatformPackageSet(packages).passed).toBe(false);
    const ready = { ...packages, packages: packages.packages.map((item) => ({ ...item, status: 'READY' as const, artifactHash: hash, device: { name: 'phone', width: 390, height: 844, os: 'test-os' }, evidence: ['device smoke', 'package build'], blockers: [] })) };
    expect(evaluatePlatformPackageSet(ready).passed).toBe(true);
  });

  it('blocks a presentation report with missing performance or audio/haptics evidence', () => {
    const report = PresentationQualityReportSchema.parse({ schemaVersion: 1, gameId: 'g', buildHash: hash, profile: 'ACTION_FEEL', audio: { status: 'PASS', evidence: ['sfx'] }, haptics: { status: 'UNKNOWN', evidence: [] }, animation: { status: 'PASS', evidence: ['motion'] }, readability: { status: 'PASS', evidence: ['hud'] }, performance: { status: 'PASS', evidence: ['p95'], p95FrameMs: 20, memoryMb: 128 }, consoleErrors: [], pageErrors: [], checkedAt: new Date().toISOString() });
    expect(evaluatePresentationQuality(report).passed).toBe(false);
  });

  it('rejects dependencies without immutable source/license/build provenance', () => {
    const manifest = buildSupplyChainManifest({ gameId: 'g', lockfileHash: hash, dependencies: [{ name: 'phaser', version: '1.0.0', source: 'registry', license: 'MIT', sha256: hash }], build: { sourceCommit: hash, builder: 'BuilderAgent', command: 'pnpm build', outputHash: hash } });
    expect(SupplyChainManifestSchema.parse(manifest).dependencies).toHaveLength(1);
    expect(evaluateSupplyChainManifest({ ...manifest, dependencies: [{ ...manifest.dependencies[0]!, sha256: 'b'.repeat(64) }], build: { ...manifest.build, outputHash: '' } })).toMatchObject({ passed: false });
  });

  it('binds dependency manifest, SBOM and build provenance as separate evidence artifacts', () => {
    const dependency = { name: 'phaser', version: '1.0.0', source: 'registry', license: 'MIT', licenseEvidence: 'https://opensource.org/license/mit', sha256: hash };
    const dependencyManifest = buildDependencyManifest({ gameId: 'g', lockfileHash: hash, dependencies: [dependency] });
    const sbom = buildSbom({ gameId: 'g', lockfileHash: hash, dependencies: [dependency] });
    const provenance = buildBuildProvenance({ gameId: 'g', sourceCommit: hash, builder: 'BuilderAgent', command: 'pnpm build', lockfileHash: hash, outputHash: hash, sbom, dependencyManifest });
    expect(DependencyManifestSchema.parse(dependencyManifest).format).toBe('factory-dependency-manifest-v1');
    expect(SbomSchema.parse(sbom).components).toHaveLength(1);
    expect(BuildProvenanceSchema.parse(provenance).sbomHash).toMatch(/^[a-f0-9]{64}$/u);
    const aggregate = buildSupplyChainManifest({ gameId: 'g', lockfileHash: hash, dependencies: [dependency], build: { sourceCommit: hash, builder: 'BuilderAgent', command: 'pnpm build', outputHash: hash }, sbomHash: provenance.sbomHash, dependencyManifestHash: provenance.dependencyManifestHash, provenanceHash: hashSupplyChainArtifact(provenance), dependencyManifestPath: 'artifacts/dependency-manifest.json', sbomPath: 'artifacts/sbom.json', provenancePath: 'artifacts/build-provenance.json' });
    expect(evaluateSupplyChainManifest(aggregate, { dependencyManifest, sbom, provenance, requireEvidence: true }).passed).toBe(true);
  });

  it('requires idempotency and compensation for external side effects', () => {
    expect(() => SideEffectContractSchema.parse({ schemaVersion: 1, operation: 'publish', idempotencyKey: '', retryPolicy: { maxAttempts: 2, backoffMs: 100 }, compensation: { supported: false, action: '' }, queryBeforeRetry: false, costCapCents: 100 })).toThrow();
    expect(SideEffectContractSchema.parse({ schemaVersion: 1, operation: 'publish', idempotencyKey: 'run:g:publish:v1', retryPolicy: { maxAttempts: 2, backoffMs: 100 }, compensation: { supported: true, action: 'pause listing' }, queryBeforeRetry: true, costCapCents: 100 }).queryBeforeRetry).toBe(true);
  });

  it('requires a clean, unfamiliar-player blind test against the frozen candidate', () => {
    const test = BlindPlaytestSchema.parse({ schemaVersion: 1, candidateHash: hash, playerId: 'blind-1', unfamiliar: true, resetVerified: true, naturalInput: true, outcome: 'PASSED', taskCompletionRate: 1, notes: ['understood the goal'], evidence: ['recording.mp4'], testedAt: new Date().toISOString() });
    expect(evaluateBlindPlaytest(test).passed).toBe(true);
    expect(evaluateBlindPlaytest({ ...test, naturalInput: false }).passed).toBe(false);
  });

  it('records artifact provenance and makes approval/invalidation explicit', () => {
    const metadata = buildArtifactMetadata({ runId: 'run-1', path: 'artifacts/game-blueprint.json', producerStage: 'BLUEPRINT', inputHashes: { 'input/seed.yaml': hash }, outputHash: hash, model: 'gpt-test', reasoning: 'max' });
    expect(ArtifactMetadataSchema.parse(metadata)).toMatchObject({ approval: { status: 'PENDING' }, status: 'ACTIVE' });
    expect(invalidateArtifactMetadata(metadata, 'artifacts/experience-contract.json').invalidatedBy).toContain('artifacts/experience-contract.json');
  });

  it('makes the side-effect journal a strict release gate, including malformed journals', () => {
    const completion = {
      schemaVersion: 1 as const,
      gates: [
        { id: 'core' as const, passed: true, evidence: ['core'], owner: 'BuilderAgent' as const },
        { id: 'normalFlow' as const, passed: true, evidence: ['flow'], owner: 'QAAgent' as const },
        { id: 'visualEvidence' as const, passed: true, evidence: ['visual'], owner: 'QAAgent' as const },
        { id: 'levelDifference' as const, passed: true, evidence: ['variation'], owner: 'QAAgent' as const },
        { id: 'humanPlaytest' as const, passed: true, evidence: ['human'], owner: 'HumanReviewer' as const },
      ],
      implementationReady: true,
      candidateReady: true,
      releaseReady: true,
      blockers: [],
    };
    const started = beginSideEffect(buildSideEffectJournal('g'), { effectId: 'effect', operation: 'publish', idempotencyKey: 'g:publish', maxAttempts: 1 });
    const blocked = evaluateFactoryConstitution({ completion, requireSideEffects: true, sideEffects: started.journal });
    expect(blocked.passed).toBe(false);
    expect(blocked.blockers).toContain('side-effect-journal');
    const malformed = evaluateFactoryConstitution({ completion, requireSideEffects: true, sideEffects: { schemaVersion: 1 } });
    expect(malformed.blockers).toContain('side-effect-journal');
  });
});
