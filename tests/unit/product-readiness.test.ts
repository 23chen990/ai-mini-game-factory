import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildLiveVerification } from '../../src/core/live-verification.js';
import { promoteReleaseLifecycleThrough } from '../../src/core/release-lifecycle.js';
import { buildProductReadinessReport, evaluateProductReadiness, type ProductReadinessEvidence } from '../../src/core/product-readiness.js';
import { evaluateRuntimeProductGate } from '../../src/core/runtime-product-gates.js';
import { buildPlatformPackageSet, markPlatformPackageReady } from '../../src/core/platform-packaging.js';
import { buildPlatformReleaseMatrix } from '../../src/core/factory-operating.js';
import { buildIaaContract } from '../../src/core/iaa-contract.js';
import { buildReleaseIntegrity } from '../../src/core/release-integrity.js';

const hash = 'a'.repeat(64);
const platforms = ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'] as const;
const now = new Date(0).toISOString();
const device = { width: 390, height: 844, label: 'phone portrait' };

function fixture(overrides: Partial<ProductReadinessEvidence> = {}): ProductReadinessEvidence {
  const state = {
    schemaVersion: 1,
    runId: 'run-1',
    runKind: 'game',
    stage: 'COMPLETED',
    status: 'completed',
    readiness: 'RELEASE_READY',
    createdAt: now,
    updatedAt: now,
    fixAttempts: 0,
    providerMode: 'codex-account',
    stages: {},
  };
  const gameBlueprint = {
    schemaVersion: 1,
    gameId: 'game-1',
    title: 'Night Market',
    theme: 'night market',
    runtime: 'web-lite',
    template: 'idle-shop-v1',
    designMode: 'prototype_tournament',
    targetPlatforms: [...platforms],
    concept: 'Serve customers in a lively market.',
    coreLoop: ['serve', 'earn', 'upgrade', 'repeat'],
    content: { productName: 'tea', customerName: 'guest', currencyName: 'coins' },
    balance: { startingCurrency: 0, orderReward: 1, baseUpgradeCost: 1 },
    preferences: {},
  };
  const buildReport = {
    schemaVersion: 1,
    success: true,
    runtime: 'web-lite',
    template: 'idle-shop-v1',
    workspace: 'workspace/game',
    webBuild: 'workspace/game/dist',
    files: ['index.html'],
    verification: ['test:passed', 'typecheck:passed'],
    builtAt: now,
  };
  const naturalFlow = {
    schemaVersion: 1,
    startedFromReset: true,
    actions: ['start', 'tap'],
    transitions: [{ name: 'deliver and settle', changed: true, evidence: 'screenshots/gameplay.png' }],
    completion: 'terminal',
    replayObserved: true,
    forbiddenOperations: [],
    screenshots: ['screenshots/gameplay.png'],
    passed: true,
    blockers: [],
    runner: 'trusted-qa-runner',
    buildHash: hash,
    runtime: 'web-lite',
    device: { ...device, label: device.label },
    seed: 1,
    observedAt: now,
  };
  const qaEvidence = (mode: 'NATURAL_E2E' | 'STATE_COVERAGE') => ({
    schemaVersion: 1,
    mode,
    actions: ['start', 'tap'],
    artifacts: ['screenshots/gameplay.png'],
    forbiddenOperations: [],
    buildHash: hash,
    runtime: 'web-lite',
    device,
    seed: 1,
    runner: 'trusted-qa-runner',
  });
  const qaReport = {
    schemaVersion: 1,
    passed: true,
    checks: [{ name: 'core', passed: true, evidence: 'test report' }],
    issues: [],
    screenshots: ['screenshots/gameplay.png'],
    consoleLog: 'logs/console.log',
    testedAt: now,
    evidence: [qaEvidence('NATURAL_E2E'), qaEvidence('STATE_COVERAGE')],
    naturalFlow,
  };
  const candidate = {
    schemaVersion: 1,
    gameId: 'game-1',
    coreHash: hash,
    platformMatrix: 'reports/platform-release-matrix.json',
    platformHash: hash,
    acceptanceArtifact: 'reports/qa-report.json',
    testedAt: now,
    status: 'READY',
    files: [{ path: 'web/index.html', sha256: 'b'.repeat(64) }],
  };
  const runtimeProductGate = evaluateRuntimeProductGate({
    schemaVersion: 1,
    entrypoint: 'workspace/game/index.html',
    defaultMode: 'web-lite',
    journey: ['startup', 'deliver order', 'settlement', 'replay'],
    coreLoop: ['deliver order'],
    terminal: ['settlement'],
    replay: ['replay'],
    runtimeWiredFiles: ['workspace/game/index.html', 'workspace/game/src/main.ts'],
    legacyBehavior: { status: 'REMOVED_FROM_DEFAULT_PATH', evidence: ['default path uses current game'] },
    browserEvidence: ['screenshots/gameplay.png'],
    passed: true,
  });
  const humanAcceptance = {
    schemaVersion: 1,
    passed: true,
    sessionId: 'human-session-1',
    buildHash: hash,
    inputMode: 'touch',
    notes: ['Completed a fresh natural-input playtest.'],
    evidence: ['human/playtest-recording.mp4'],
    approvedAt: now,
  };
  const iaaContract = buildIaaContract({
    gameId: 'game-1',
    review: {
      schemaVersion: 1,
      audienceFit: 'casual',
      sessionFit: 'medium',
      placements: [{ format: 'rewarded', trigger: 'optional reward after settlement', playerValue: 'optional bonus', frequencyCap: 'once per session' }],
      retentionRisk: 'low',
      revenuePotential: 'medium',
      complianceRisks: [],
      recommendation: 'test_cautiously',
      rationale: 'optional reward after a completed session',
    },
  });
  const businessPreflight = {
    schemaVersion: 1,
    entity: 'company',
    monetization: 'IAA',
    targets: [...platforms],
    accountChecks: platforms.map((platform) => ({ platform, status: 'pass', evidence: [`accounts/${platform}.txt`], checkedAt: now })),
    rightsStatus: 'pass',
    payoutStatus: 'pass',
    budget: { currency: 'CNY', maxTotalCents: 10000, maxPaidTrafficCents: 0, maxAgentTokens: 1000, maxHumanMinutes: 60, paybackWindowDays: 30 },
    decision: 'GO',
    blockers: [],
    unknowns: [],
    checkedAt: now,
  };
  let platformPackageSet = buildPlatformPackageSet({ gameId: 'game-1', coreHash: hash, requiredTargets: [...platforms] });
  for (const platform of platforms) {
    platformPackageSet = markPlatformPackageReady(platformPackageSet, platform, {
      artifactHash: 'c'.repeat(64),
      device: { name: 'test phone', width: 390, height: 844, os: 'mobile' },
      childRoot: `platform-builds/${platform}`,
      evidence: [`qa/${platform}/device.png`],
      normalFlowEvidence: [`qa/${platform}/flow.json`],
      visualEvidence: [`qa/${platform}/visual.png`],
      runtimeEvidence: [`qa/${platform}/runtime.json`],
    });
  }
  const platformReleaseMatrix = buildPlatformReleaseMatrix({
    gameId: 'game-1',
    coreHash: hash,
    primaryPlatform: platforms[0],
    requiredTargets: [...platforms],
  });
  platformReleaseMatrix.children = platformReleaseMatrix.children.map((child) => ({
    ...child,
    status: 'ready',
    evidence: [`qa/${child.platform}/device.png`],
    normalFlowEvidence: [`qa/${child.platform}/flow.json`],
    visualEvidence: [`qa/${child.platform}/visual.png`],
    runtimeEvidence: [`qa/${child.platform}/runtime.json`],
    blockers: [],
    artifactHash: 'c'.repeat(64),
  }));
  candidate.platformHash = buildReleaseIntegrity({
    coreHash: hash,
    platformChildren: platformReleaseMatrix.children,
    acceptance: null,
  }).platformHash;
  const liveVerifications = Object.fromEntries(platforms.map((platform) => [platform, buildLiveVerification({
    gameId: 'game-1',
    platform,
    releaseHash: hash,
    packageHash: 'c'.repeat(64),
    checks: {
      startup: true,
      coreLoop: true,
      terminalState: true,
      replay: true,
      adFallback: true,
      rewardIdempotency: true,
      saveRestore: true,
      telemetry: true,
      noConsoleErrors: true,
      packageHashMatch: true,
    },
    evidence: [`live/${platform}/device-recording.mp4`],
  })]));
  const releaseLifecycle = promoteReleaseLifecycleThrough(undefined, { gameId: 'game-1', releaseHash: hash, to: 'RELEASE_READY' });
  return {
    runId: 'run-1',
    currentBuildHash: hash,
    artifacts: {
      state,
      gameBlueprint,
      buildReport,
      candidate,
      candidateFilesVerified: true,
      qaReport,
      runtimeProductGate,
      humanAcceptance,
      iaaContract,
      businessPreflight,
      platformReleaseMatrix,
      platformPackageSet,
      platformPackageBytesVerified: true,
      releaseLifecycle,
      liveVerifications,
      perceptualQaGate: {
        schemaVersion: 1,
        targetRunId: 'run-1',
        contractHash: null,
        buildHash: hash,
        passed: true,
        blockers: [],
        requiredCaseIds: ['core-feedback'],
        checkedCaseIds: ['core-feedback'],
      },
    },
    ...overrides,
  };
}

describe('five-dimensional product readiness', () => {
  it('keeps engineering, fidelity, human experience, monetization, and platform gates independent', () => {
    const evidence = fixture({
      artifacts: {
        ...fixture().artifacts,
        humanAcceptance: undefined,
        liveVerifications: {},
        platformPackageSet: undefined,
        platformPackageBytesVerified: false,
      },
    });

    const report = evaluateProductReadiness(evidence);

    expect(report.dimensions.codeCorrectness.status).toBe('PASS');
    expect(report.dimensions.gameplayFidelity.status).toBe('PASS');
    expect(report.dimensions.experienceQuality.status).toBe('NEEDS_HUMAN');
    expect(report.dimensions.monetizationReadiness.status).toBe('NEEDS_HUMAN');
    expect(report.dimensions.platformReleaseReadiness.status).not.toBe('PASS');
  });

  it('does not infer human experience quality from natural QA', () => {
    const evidence = fixture();
    evidence.artifacts.humanAcceptance = undefined;

    const report = evaluateProductReadiness(evidence);

    expect(report.dimensions.gameplayFidelity.status).toBe('PASS');
    expect(report.dimensions.experienceQuality.status).toBe('NEEDS_HUMAN');
    expect(report.dimensions.experienceQuality.requiredActions).toContain('Have a human play the current build from a clean reset and record human/playtest-acceptance.json with its exact build hash.');
  });

  it('blocks code correctness when the QA report itself failed despite valid evidence metadata', () => {
    const evidence = fixture();
    evidence.artifacts.qaReport = {
      ...evidence.artifacts.qaReport as object,
      passed: false,
    };

    const report = evaluateProductReadiness(evidence);

    expect(report.dimensions.codeCorrectness.status).toBe('BLOCKED');
    expect(report.dimensions.codeCorrectness.blockers).toContain('qa-report-failed');
  });

  it('lets a hash-bound browser preview pass fidelity and human experience without a frozen release', () => {
    const evidence = fixture();
    evidence.artifacts.candidate = undefined;
    evidence.artifacts.candidateFilesVerified = undefined;
    evidence.artifacts.state = { ...evidence.artifacts.state as object, providerMode: 'mock' };

    const report = evaluateProductReadiness(evidence);

    expect(report.candidate.status).toBe('UNFROZEN');
    expect(report.providerMode).toBe('mock');
    expect(report.dimensions.codeCorrectness.status).toBe('PASS');
    expect(report.dimensions.gameplayFidelity.status).toBe('PASS');
    expect(report.dimensions.experienceQuality.status).toBe('PASS');
    expect(report.dimensions.monetizationReadiness.status).not.toBe('PASS');
    expect(report.dimensions.platformReleaseReadiness.status).not.toBe('PASS');
  });

  it('does not promote simulation-only QA evidence for a mock run', () => {
    const evidence = fixture();
    evidence.artifacts.state = { ...evidence.artifacts.state as object, providerMode: 'mock' };
    const qaReport = evidence.artifacts.qaReport as { evidence: Array<Record<string, unknown>> };
    qaReport.evidence = qaReport.evidence.map((item) => ({ ...item, mode: 'SIMULATION_FUZZ' }));

    const report = evaluateProductReadiness(evidence);

    expect(report.providerMode).toBe('mock');
    expect(report.dimensions.codeCorrectness.status).not.toBe('PASS');
    expect(report.dimensions.gameplayFidelity.status).not.toBe('PASS');
  });

  it('rejects the generated human-playtest example even when its pass flag is edited', () => {
    const evidence = fixture();
    evidence.artifacts.humanAcceptance = {
      ...evidence.artifacts.humanAcceptance as object,
      sessionId: 'human-session-required',
      evidence: ['attach a recording or screenshots'],
    };

    const report = evaluateProductReadiness(evidence);

    expect(report.dimensions.experienceQuality.status).toBe('BLOCKED');
    expect(report.dimensions.experienceQuality.blockers).toContain('human-playtest-placeholder-evidence');
  });

  it('rejects stale candidate and human evidence instead of carrying them forward', () => {
    const evidence = fixture();
    evidence.artifacts.candidate = { ...evidence.artifacts.candidate as object, coreHash: 'd'.repeat(64) };
    evidence.artifacts.humanAcceptance = { ...evidence.artifacts.humanAcceptance as object, buildHash: 'd'.repeat(64) };

    const report = evaluateProductReadiness(evidence);

    expect(report.candidate.status).toBe('STALE');
    expect(report.dimensions.experienceQuality.status).toBe('BLOCKED');
    expect(report.dimensions.platformReleaseReadiness.status).toBe('BLOCKED');
    expect(report.overall.status).toBe('BLOCKED');

    const staleHuman = fixture();
    staleHuman.artifacts.humanAcceptance = { ...staleHuman.artifacts.humanAcceptance as object, buildHash: 'd'.repeat(64) };
    const staleHumanReport = evaluateProductReadiness(staleHuman);
    expect(staleHumanReport.candidate.status).toBe('FROZEN');
    expect(staleHumanReport.dimensions.experienceQuality.status).toBe('BLOCKED');
    expect(staleHumanReport.dimensions.experienceQuality.blockers).toContain('human-playtest-build-hash-mismatch');
  });

  it('distinguishes mock/browser evidence from publishable platform packages', () => {
    const browserOnly = fixture();
    browserOnly.artifacts.platformPackageSet = undefined;
    browserOnly.artifacts.platformPackageBytesVerified = false;
    browserOnly.artifacts.platformReleaseMatrix = undefined;

    const browserReport = evaluateProductReadiness(browserOnly);
    expect(browserReport.dimensions.gameplayFidelity.status).toBe('PASS');
    expect(browserReport.dimensions.platformReleaseReadiness.status).toBe('NEEDS_HUMAN');
    expect(browserReport.dimensions.platformReleaseReadiness.blockers).toContain('platform-release-matrix-missing');

    browserOnly.artifacts.state = { ...browserOnly.artifacts.state as object, providerMode: 'mock' };

    const report = evaluateProductReadiness(browserOnly);

    expect(report.providerMode).toBe('mock');
    expect(report.dimensions.codeCorrectness.status).toBe('PASS');
    expect(report.dimensions.monetizationReadiness.status).not.toBe('PASS');
    expect(report.dimensions.platformReleaseReadiness.status).toBe('NEEDS_HUMAN');
  });

  it('rejects a release candidate whose platform hash does not match the tested platform matrix', () => {
    const evidence = fixture();
    evidence.artifacts.candidate = { ...evidence.artifacts.candidate as object, platformHash: 'd'.repeat(64) };

    const report = evaluateProductReadiness(evidence);

    expect(report.dimensions.platformReleaseReadiness.status).toBe('BLOCKED');
    expect(report.dimensions.platformReleaseReadiness.blockers).toContain('release-candidate-platform-hash-mismatch');
  });

  it('does not pass monetization when a required platform is omitted from business preflight', () => {
    const evidence = fixture();
    evidence.artifacts.businessPreflight = {
      ...evidence.artifacts.businessPreflight as object,
      targets: ['wechat-minigame'],
    };

    const report = evaluateProductReadiness(evidence);

    expect(report.dimensions.monetizationReadiness.status).toBe('NEEDS_HUMAN');
    expect(report.dimensions.monetizationReadiness.blockers).toContain('business-preflight-platforms-missing:douyin-minigame,taptap-minigame');
  });

  it('binds live monetization verification to native package hashes and platform identity', () => {
    const nativePackageHash = 'c'.repeat(64);
    const evidence = fixture();
    evidence.artifacts.liveVerifications = Object.fromEntries(platforms.map((platform) => [
      platform,
      Object.assign({}, evidence.artifacts.liveVerifications?.[platform], { packageHash: hash }),
    ]));

    const browserHashReport = evaluateProductReadiness(evidence);
    expect(browserHashReport.dimensions.monetizationReadiness.status).toBe('BLOCKED');
    expect(browserHashReport.dimensions.monetizationReadiness.blockers).toContain('wechat-minigame:live-verification-failed-or-stale');

    evidence.artifacts.liveVerifications = Object.fromEntries(platforms.map((platform) => [
      platform,
      Object.assign({}, evidence.artifacts.liveVerifications?.[platform], { packageHash: nativePackageHash }),
    ]));

    const report = evaluateProductReadiness(evidence);
    expect(report.dimensions.monetizationReadiness.status).toBe('PASS');

    evidence.artifacts.liveVerifications = Object.fromEntries(platforms.map((platform) => [
      platform,
      Object.assign({}, evidence.artifacts.liveVerifications?.[platform], { platform: platforms[0] }),
    ]));

    const mismatchedPlatformReport = evaluateProductReadiness(evidence);
    expect(mismatchedPlatformReport.dimensions.monetizationReadiness.status).toBe('BLOCKED');
    expect(mismatchedPlatformReport.dimensions.monetizationReadiness.blockers).toContain('douyin-minigame:live-verification-failed-or-stale');

    evidence.artifacts.liveVerifications = Object.fromEntries(platforms.map((platform) => [
      platform,
      Object.assign({}, evidence.artifacts.liveVerifications?.[platform], { gameId: 'other-game' }),
    ]));

    const mismatchedGameReport = evaluateProductReadiness(evidence);
    expect(mismatchedGameReport.dimensions.monetizationReadiness.status).toBe('BLOCKED');
    expect(mismatchedGameReport.dimensions.monetizationReadiness.blockers).toContain('taptap-minigame:live-verification-failed-or-stale');
  });

  it('emits concrete actions for dimensions without qualified evidence', () => {
    const evidence = fixture();
    evidence.artifacts.liveVerifications = {};

    const report = evaluateProductReadiness(evidence);

    expect(report.dimensions.monetizationReadiness.status).toBe('NEEDS_HUMAN');
    expect(report.dimensions.monetizationReadiness.requiredActions).toContain('Record a GO business preflight and on-device live-verification evidence for each native package hash bound to the frozen coreHash.');
    expect(report.overall.status).not.toBe('READY');
  });

  it('returns READY only when all five dimensions have matching candidate-bound evidence', () => {
    const report = evaluateProductReadiness(fixture());

    expect(report.dimensions).toMatchObject({
      codeCorrectness: { status: 'PASS' },
      gameplayFidelity: { status: 'PASS' },
      experienceQuality: { status: 'PASS' },
      monetizationReadiness: { status: 'PASS' },
      platformReleaseReadiness: { status: 'PASS' },
    });
    expect(report.overall.status).toBe('READY');
  });

  it('loads canonical run artifacts and hashes the current build without promoting a missing candidate', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'product-readiness-'));
    await mkdir(path.join(runRoot, 'workspace/game/dist'), { recursive: true });
    await mkdir(path.join(runRoot, 'artifacts'), { recursive: true });
    await writeFile(path.join(runRoot, 'workspace/game/dist/index.html'), '<main>play</main>');
    await writeFile(path.join(runRoot, 'state.json'), JSON.stringify({
      schemaVersion: 1,
      runId: 'run-loader',
      stage: 'FULL_BUILD',
      status: 'completed',
      createdAt: now,
      updatedAt: now,
      fixAttempts: 0,
      providerMode: 'codex-account',
      stages: {},
    }));
    await writeFile(path.join(runRoot, 'artifacts/build-report.json'), JSON.stringify({
      schemaVersion: 1,
      success: true,
      runtime: 'web-lite',
      template: 'idle-shop-v1',
      workspace: 'workspace/game',
      webBuild: 'workspace/game/dist',
      files: ['index.html'],
      verification: ['test:passed', 'typecheck:passed'],
      builtAt: now,
    }));

    try {
      const report = await buildProductReadinessReport({ runRoot, runId: 'run-loader' });
      expect(report.providerMode).toBe('codex-account');
      expect(report.candidate).toMatchObject({ runId: 'run-loader', status: 'UNFROZEN', coreHash: null });
      expect(report.dimensions.codeCorrectness.status).toBe('NOT_ASSESSED');
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });
});
