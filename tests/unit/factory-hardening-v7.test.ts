import { describe, expect, it } from 'vitest';
import { buildProfileQaReport } from '../../src/core/profile-qa.js';
import { evaluateIaaContract } from '../../src/core/iaa-contract.js';
import { buildPermissionManifest, evaluatePermissionManifest, assertPermissionOperation } from '../../src/core/permission-manifest.js';
import { getStageContract, evaluateStageContract } from '../../src/core/stage-contracts.js';
import { buildContextPacket, verifyContextPacketIntegrity } from '../../src/core/context-budget.js';
import { buildPlatformPackageSet, evaluatePlatformPackageSet, markPlatformPackageReady } from '../../src/core/platform-packaging.js';
import { decideLaunchDisposition } from '../../src/core/launch-operations.js';
import { buildAccountCapacityPlan, evaluateAccountCapacity } from '../../src/core/account-capacity.js';
import { routeFailureToEarliestStage } from '../../src/core/failure-routing.js';
import { buildVariationCoveragePlan, buildVariationCoverageObservation, evaluateVariationCoverage } from '../../src/core/variation-coverage.js';
import { IaaContractSchema } from '../../src/schemas/iaa-contract.js';
import { LaunchMetricSnapshotSchema, LaunchThresholdsSchema } from '../../src/schemas/launch-operations.js';

const hash = 'a'.repeat(64);

describe('factory hardening contracts', () => {
  it('builds profile-specific evidence instead of treating every game as generic feel QA', () => {
    const report = buildProfileQaReport({
      gameId: 'story-game',
      buildHash: hash,
      profile: 'NARRATIVE_AGENCY',
      qaPassed: true,
      checks: [
        { id: 'choice-distinction', passed: true, evidence: 'choice distinction: A and B diverge' },
        { id: 'consequence-readability', passed: true, evidence: 'consequence readability: flag shown' },
        { id: 'character-response', passed: true, evidence: 'character response: trust changes' },
        { id: 'delayed-consequence', passed: true, evidence: 'delayed consequence: chapter 2 echo' },
        { id: 'replay-reason', passed: true, evidence: 'replay reason: alternate ending' },
      ],
    });
    expect(report.passed).toBe(true);
    expect(report.profile).toBe('NARRATIVE_AGENCY');
    expect(report.requiredDimensions).toContain('delayed consequence');
  });

  it('blocks an IAA contract without consent, terminal-only reward and idempotency safeguards', () => {
    const unsafe = IaaContractSchema.parse({
      schemaVersion: 1,
      gameId: 'unsafe',
      monetization: 'IAA',
      placements: [{ id: 'p1', format: 'rewarded', trigger: 'optional boost', playerValue: 'extra move', frequencyCapSeconds: 180, maxPerSession: 2, optional: true }],
      delivery: { firstRun: 'ENDING_ONLY', minSecondsBetweenAds: 180, maxAdsPerSession: 2, rewardRequiredForRewarded: true, noFill: 'continue-without-ad', closeBehavior: 'after-reward', backgroundBehavior: 'pause-and-resume' },
      analyticsEvents: ['ad_show', 'ad_complete', 'ad_no_fill'],
      status: 'PASS', blockers: [], sourceReview: 'review', createdAt: new Date().toISOString(),
      safety: { consent: false, ageGate: false, testUnitsExcluded: false, rewardGrantTerminalOnly: false, rewardIdempotent: false, forbiddenContexts: [] },
    });
    const result = evaluateIaaContract(unsafe);
    expect(result.passed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining(['consent-missing', 'reward-not-terminal-only', 'reward-not-idempotent']));
  });

  it('gives research a read-only allow-list and rejects mutation or arbitrary commands', () => {
    const manifest = buildPermissionManifest('COMPETITOR_RESEARCH');
    expect(manifest.readScope).toContain('input/');
    expect(manifest.allowedCommands).toEqual([]);
    expect(evaluatePermissionManifest(manifest).passed).toBe(true);
    expect(() => assertPermissionOperation(manifest, { kind: 'write', path: 'workspace/game/src/game.ts' })).toThrow();
    expect(() => assertPermissionOperation(manifest, { kind: 'command', command: 'curl https://example.com' })).toThrow();
  });

  it('lets reference research read only the owning run evidence directory', () => {
    const manifest = buildPermissionManifest('REFERENCE_DEEP_RESEARCH');
    expect(manifest.readScope).toContain('reference-evidence/');
    expect(assertPermissionOperation(manifest, { kind: 'read', path: 'reference-evidence/incoming/reference.docx.analysis.txt' })).toBe(true);
    expect(() => assertPermissionOperation(manifest, { kind: 'read', path: '../other-run/reference.docx' })).toThrow();
  });

  it('records verifier, retry and side-effect policy on every stage contract', () => {
    const contract = getStageContract('FULL_BUILD');
    expect(contract.verifierRole).toBe('QAAgent');
    expect(contract.retryPolicy.maxAttempts ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(contract.maxAttempts ?? Number.POSITIVE_INFINITY);
    expect(contract.sideEffects).toEqual(expect.objectContaining({ workspaceWrite: true, externalNetwork: false }));
    const audit = evaluateStageContract(contract, {
      inputs: contract.inputs.filter((item) => item.required).map((item) => item.path),
      artifacts: contract.outputs.filter((item) => item.required).map((item) => item.path),
      evidence: contract.evidenceRequired.filter((item) => item.required).flatMap((item) => item.id.split('|')[0]!),
      artifactVersions: Object.fromEntries(contract.outputs.filter((item) => item.required).map((item) => [item.path, item.artifactVersion])),
    });
    expect(audit.passed).toBe(true);
  });

  it('includes a token estimate and explicit truncation strategy in handoffs', () => {
    const packet = buildContextPacket({ stage: 'FIX', summary: 'fix', maxChars: 500, inputs: [{ path: 'artifacts/qa.json', content: 'x'.repeat(400), priority: 'required' }] });
    expect(packet.estimatedTokens).toBeGreaterThan(0);
    expect(packet.tokenBudget).toBeGreaterThanOrEqual(packet.estimatedTokens);
    expect(packet.truncationStrategy).toBe('priority-preserving');
    expect(packet.integrityHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(verifyContextPacketIntegrity(packet)).toEqual({ passed: true, blockers: [] });
    expect(verifyContextPacketIntegrity({ ...packet, summary: 'tampered' }).passed).toBe(false);
  });

  it('requires platform child isolation and normal-flow evidence in strict package evaluation', () => {
    const set = buildPlatformPackageSet({ gameId: 'g', coreHash: hash, targets: ['wechat-minigame'] });
    const ready = markPlatformPackageReady(set, 'wechat-minigame', {
      artifactHash: hash,
      childRoot: 'platform-builds/wechat-minigame',
      device: { name: 'phone', width: 390, height: 844, os: 'android' },
      evidence: ['startup'],
      normalFlowEvidence: ['normal-flow'],
      visualEvidence: ['screenshot'],
      runtimeEvidence: ['adapter-runtime'],
    });
    expect(evaluatePlatformPackageSet(ready, { strict: true }).passed).toBe(true);
    const missing = { ...ready, packages: ready.packages.map((pkg) => ({ ...pkg, childRoot: undefined, normalFlowEvidence: [] })) };
    expect(evaluatePlatformPackageSet(missing, { strict: true }).passed).toBe(false);
  });

  it('uses D1 and market kill rules only after an observed cohort is large enough', () => {
    const thresholds = LaunchThresholdsSchema.parse({ minimumUsers: 100, minimumObservedDays: 3, maxCrashRate: 0.05, minSessionCompletionRate: 0.25, minAdShowRate: 0.2, minEcpmCents: 1, minD1Retention: 0.2, minOrganicShare: 0.1 });
    const snapshot = LaunchMetricSnapshotSchema.parse({ schemaVersion: 1, gameId: 'g', platform: 'douyin-minigame', releaseHash: hash, starts: 200, users: 200, observedDays: 3, d1Retention: 0.05, sessionCompletionRate: 0.5, crashRate: 0, adShowRate: 0.5, adCompletionRate: 0.5, eCPMCents: 20, netRevenueCents: 100, spendCents: 0, organicShare: 0.5, dataQuality: 'observed', notes: [], observedAt: new Date().toISOString() });
    const decision = decideLaunchDisposition(snapshot, thresholds);
    expect(decision.decision).toBe('KILL');
    expect(decision.blockers).toContain('d1-retention');
  });

  it('blocks a run when the account capacity for a platform is exhausted', () => {
    const plan = buildAccountCapacityPlan({ entity: 'personal', capacities: [{ platform: 'wechat-minigame', maxGames: 5 }], activeCounts: [{ platform: 'wechat-minigame', activeGames: 5, reservedGames: 0 }] });
    const result = evaluateAccountCapacity(plan);
    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('wechat-minigame:capacity-exhausted');
  });

  it('routes failures to the earliest owning stage rather than always to Fixer', () => {
    expect(routeFailureToEarliestStage({ symptomStage: 'FINAL_PROFILE_QA', failureClass: 'core_experience', message: 'choice consequence is missing' })).toMatchObject({ stage: 'EXPERIENCE_HYPOTHESIS', owner: 'ProducerAgent' });
    expect(routeFailureToEarliestStage({ symptomStage: 'QA', failureClass: 'build', message: 'vite build failed' })).toMatchObject({ stage: 'FULL_BUILD', owner: 'BuilderAgent' });
  });

  it('turns content-variation reports into line-specific coverage evidence', () => {
    const plan = buildVariationCoveragePlan('cut-stack-dodge');
    const observation = buildVariationCoverageObservation('cut-stack-dodge', {
      schemaVersion: 1,
      passed: true,
      variants: [
        { id: 'a', differences: ['cutGeometry changes'], evidence: ['cutGeometry:wide'] },
        { id: 'b', differences: ['dropTrajectory changes'], evidence: ['dropTrajectory:heavy'] },
      ],
      rationale: 'two structural variants',
    });
    expect(evaluateVariationCoverage(plan, observation).passed).toBe(true);
    expect(observation.dimensions).toEqual(expect.arrayContaining(['cutGeometry', 'dropTrajectory']));
  });
});
