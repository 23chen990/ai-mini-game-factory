import { describe, expect, it } from 'vitest';
import {
  BusinessPreflightSchema,
  CostBudgetSchema,
  CostUsageSchema,
  FailureReportSchema,
  FixCapBlockerSchema,
  PlatformReleaseMatrixSchema,
  QaEvidenceSchema,
  ReleaseCandidateSchema,
} from '../../src/schemas/factory-operating.js';
import {
  buildPlatformReleaseMatrix,
  evaluateBusinessPreflight,
  evaluateCostGate,
  evaluatePlatformReleaseMatrix,
  makeFailureReport,
} from '../../src/core/factory-operating.js';

const hash = 'a'.repeat(64);

describe('factory operating contracts', () => {
  it('keeps domestic and overseas releases as independent children of one core build', () => {
    const matrix = buildPlatformReleaseMatrix({
      gameId: 'game-1',
      coreHash: hash,
      primaryPlatform: 'douyin-minigame',
      targets: ['douyin-minigame', 'wechat-minigame', 'poki-web'],
    });
    expect(matrix.children.map((child) => child.platform)).toEqual(['douyin-minigame', 'wechat-minigame', 'poki-web']);
    expect(PlatformReleaseMatrixSchema.parse(matrix).children).toHaveLength(3);
    expect(evaluatePlatformReleaseMatrix(matrix)).toMatchObject({ passed: false, blockers: expect.arrayContaining(['douyin-minigame', 'wechat-minigame', 'poki-web']) });
  });

  it('does not allow a release child to claim ready without an evidence hash', () => {
    expect(() => PlatformReleaseMatrixSchema.parse({
      schemaVersion: 1,
      gameId: 'game-1',
      coreHash: hash,
      primaryPlatform: 'douyin-minigame',
      generatedAt: new Date().toISOString(),
      children: [{
        platform: 'douyin-minigame', status: 'ready', adapterPath: 'adapters/douyin', buildPath: 'build/douyin', configPath: 'config/douyin.json',
        evidence: [], blockers: [], artifactHash: null,
      }],
    })).toThrow();
  });

  it('blocks business greenlight when account, rights, or payout remains unknown', () => {
    const result = evaluateBusinessPreflight({
      entity: 'personal',
      monetization: 'IAA',
      targets: ['douyin-minigame', 'poki-web'],
      accountChecks: [
        { platform: 'douyin-minigame', status: 'pass', evidence: ['console-check'], checkedAt: new Date().toISOString() },
        { platform: 'poki-web', status: 'unknown', evidence: ['needs-terms-review'], checkedAt: new Date().toISOString() },
      ],
      rightsStatus: 'pass',
      payoutStatus: 'unknown',
      budget: { currency: 'CNY', maxTotalCents: 100_00, maxPaidTrafficCents: 40_00, maxAgentTokens: 100_000, maxHumanMinutes: 180, maxFixAttempts: 2, paybackWindowDays: 14 },
    });
    expect(result.decision).toBe('PAUSE');
    expect(result.blockers).toEqual(expect.arrayContaining(['poki-web', 'payout']));
    expect(BusinessPreflightSchema.parse(result).unknowns).toEqual(expect.arrayContaining(['poki-web', 'payout']));
  });

  it('stops a run when actual cost exceeds the fixed ceiling', () => {
    const budget = CostBudgetSchema.parse({ currency: 'CNY', maxTotalCents: 100_00, maxPaidTrafficCents: 40_00, maxAgentTokens: 100_000, maxHumanMinutes: 180, maxFixAttempts: 2, paybackWindowDays: 14 });
    const usage = CostUsageSchema.parse({ totalCents: 101_00, paidTrafficCents: 10_00, agentTokens: 20_000, humanMinutes: 20, fixAttempts: 1 });
    expect(evaluateCostGate(budget, usage)).toMatchObject({ passed: false, blockers: ['total-cost'] });
  });

  it('does not create a fix-attempt blocker when the budget omits an explicit repair ceiling', () => {
    const budget = CostBudgetSchema.parse({ currency: 'CNY', maxTotalCents: 100_00, maxPaidTrafficCents: 40_00, maxAgentTokens: 100_000, maxHumanMinutes: 180, paybackWindowDays: 14 });
    const usage = CostUsageSchema.parse({ totalCents: 0, paidTrafficCents: 0, agentTokens: 1, humanMinutes: 0, fixAttempts: 1_000 });
    expect(evaluateCostGate(budget, usage)).toMatchObject({ passed: true, blockers: [] });
  });

  it('requires natural play evidence to be free of state-forcing operations', () => {
    expect(() => QaEvidenceSchema.parse({
      schemaVersion: 1,
      mode: 'NATURAL_E2E',
      actions: ['pointerdown', 'pointerup'],
      artifacts: ['screenshots/normal-flow.png'],
      forbiddenOperations: ['grantCurrency'],
    })).toThrow();
    expect(QaEvidenceSchema.parse({
      schemaVersion: 1,
      mode: 'STATE_COVERAGE',
      actions: ['loadScenario:late-game'],
      artifacts: ['logs/state-coverage.json'],
      forbiddenOperations: ['loadScenario'],
    }).mode).toBe('STATE_COVERAGE');
  });

  it('routes failures to the owning stage with multiple hypotheses instead of generic fixer retries', () => {
    const failure = makeFailureReport({
      stage: 'QA',
      failureClass: 'platform',
      routeTo: 'TARGET_PLATFORM_QA',
      message: 'WeChat package cannot load remote asset',
      hypotheses: [
        { cause: 'remote root is duplicated', confidence: 0.8, evidence: ['logs/network.json'] },
        { cause: 'platform config omits domain', confidence: 0.4, evidence: ['config/wechat.json'] },
      ],
    });
    expect(FailureReportSchema.parse(failure).routeTo).toBe('TARGET_PLATFORM_QA');
    expect(failure.hypotheses).toHaveLength(2);
  });

  it('records a schema-valid blocker when automatic FIX reaches its cap', () => {
    const blocker = FixCapBlockerSchema.parse({
      schemaVersion: 1,
      stage: 'FIX',
      status: 'BLOCKED',
      attempts: 5,
      maxAutomaticAttempts: 5,
      reason: 'qa-failed-after-automatic-fix-cap',
      nextAction: 'human-review-required',
      message: 'QA failed after 5 automatic fixes; automatic retries are stopped.',
    });
    expect(blocker).toMatchObject({ stage: 'FIX', status: 'BLOCKED', attempts: 5, nextAction: 'human-review-required' });
    expect(() => FixCapBlockerSchema.parse({ ...blocker, status: 'FAILED' })).toThrow();
  });

  it('accepts monetization as a first-class failure class', () => {
    const failure = FailureReportSchema.parse({
      schemaVersion: 1,
      stage: 'IAA_REVIEW',
      failureClass: 'monetization',
      routeTo: 'IAA_REVIEW',
      message: 'ad placement blocks the core loop',
      hypotheses: [{ cause: 'ad timing', confidence: 0.9, evidence: ['qa-report.json'] }],
      attempts: 0,
      createdAt: new Date().toISOString(),
    });
    expect(failure.failureClass).toBe('monetization');
  });

  it('requires an immutable release candidate to name the exact tested core and platform hashes', () => {
    const candidate = ReleaseCandidateSchema.parse({
      schemaVersion: 1,
      gameId: 'game-1',
      coreHash: hash,
      acceptanceArtifact: 'artifacts/completion-gates.json',
      platformMatrix: 'artifacts/platform-release-matrix.json',
      testedAt: new Date().toISOString(),
      status: 'READY',
      files: [{ path: 'web/index.html', sha256: hash }],
    });
    expect(candidate.status).toBe('READY');
  });
});
