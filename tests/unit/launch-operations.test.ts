import { describe, expect, it } from 'vitest';
import {
  CertificationChecklistSchema,
  LaunchMetricSnapshotSchema,
  LaunchThresholdsSchema,
} from '../../src/schemas/launch-operations.js';
import {
  buildCertificationChecklist,
  decideLaunchDisposition,
  evaluateCertificationChecklist,
  evaluateAbandonment,
  DEFAULT_LAUNCH_THRESHOLDS,
} from '../../src/core/launch-operations.js';
import { defaultOperatingProfile } from '../../src/core/operating-profile.js';

const targets = ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'] as const;

describe('launch operations', () => {
  it('creates a reusable per-game certification checklist instead of hiding platform work in release', () => {
    const checklist = buildCertificationChecklist({
      gameId: 'demo-game',
      title: '雾灯小铺',
      entity: 'personal',
      targets: [...targets],
    });
    expect(checklist.items.map((item) => item.kind)).toEqual(expect.arrayContaining([
      'SOFTWARE_COPYRIGHT', 'SELF_REVIEW_REPORT', 'MINIGAME_FILING', 'ICP_FILING',
      'PLATFORM_REVIEW', 'PRIVACY_POLICY', 'ANTI_ADDICTION',
    ]));
    expect(checklist.items.filter((item) => item.kind === 'MINIGAME_FILING')).toHaveLength(3);
    expect(CertificationChecklistSchema.parse(checklist).ready).toBe(false);
  });

  it('cannot become ready while required evidence or naming checks are unresolved', () => {
    const checklist = buildCertificationChecklist({ gameId: 'demo-game', title: '雾灯小铺', entity: 'personal', targets: [...targets] });
    const result = evaluateCertificationChecklist(checklist);
    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining(['certification:SOFTWARE_COPYRIGHT:pending', 'certification:ICP_FILING:pending']));
  });

  it('recomputes stale human-edited blockers instead of treating old derived fields as truth', () => {
    const template = buildCertificationChecklist({ gameId: 'demo-game', title: '雾灯小铺', entity: 'personal', targets: [...targets] });
    const edited = {
      ...template,
      items: template.items.map((item) => ({ ...item, status: 'ready' as const, evidence: ['human://receipt'] })),
      blockers: template.blockers,
      unknowns: template.unknowns,
      ready: false,
    };
    const result = evaluateCertificationChecklist(edited);
    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.unknowns).toEqual([]);
  });

  it('uses configurable cohort gates to distinguish collecting, iterate, scale and kill', () => {
    const thresholds = LaunchThresholdsSchema.parse({ minimumUsers: 100, minimumObservedDays: 3, maxCrashRate: 0.05, minSessionCompletionRate: 0.3, minAdShowRate: 0.2, minEcpmCents: 80 });
    const base = {
      schemaVersion: 1 as const,
      gameId: 'demo-game', platform: 'douyin-minigame' as const, releaseHash: 'a'.repeat(64),
      starts: 200, users: 100, observedDays: 3, d1Retention: 0.2, sessionCompletionRate: 0.5,
      crashRate: 0.01, adShowRate: 0.5, adCompletionRate: 0.8, eCPMCents: 120,
      netRevenueCents: 2_000, spendCents: 1_000, organicShare: 0.4,
      dataQuality: 'observed' as const, notes: [], observedAt: new Date().toISOString(),
    };
    expect(decideLaunchDisposition(LaunchMetricSnapshotSchema.parse({ ...base, users: 20 }), thresholds).decision).toBe('COLLECTING');
    expect(decideLaunchDisposition(LaunchMetricSnapshotSchema.parse({ ...base, sessionCompletionRate: 0.1 }), thresholds).decision).toBe('ITERATE_ONCE');
    expect(decideLaunchDisposition(LaunchMetricSnapshotSchema.parse(base), thresholds).decision).toBe('SCALE');
    expect(decideLaunchDisposition(LaunchMetricSnapshotSchema.parse({ ...base, crashRate: 0.2 }), thresholds).decision).toBe('KILL');
  });

  it('turns an explicit repair-cap decision into a terminal abandonment', () => {
    const profile = defaultOperatingProfile();
    const decision = evaluateAbandonment({ runId: 'run-1', stage: 'QA', budget: profile.budget, usage: { totalCents: 0, paidTrafficCents: 0, agentTokens: 1, humanMinutes: 0, fixAttempts: 2 }, reason: 'fix-cap' });
    expect(decision).toMatchObject({ decision: 'ABANDON', reason: 'fix-cap' });
  });

  it('keeps market-threshold kills distinguishable from platform or cost failures', () => {
    const base = {
      schemaVersion: 1 as const,
      gameId: 'market-test', platform: 'douyin-minigame' as const, releaseHash: 'a'.repeat(64),
      starts: 500, users: 500, observedDays: 7, d1Retention: 0.01, sessionCompletionRate: 0.4,
      crashRate: 0.01, adShowRate: 0.5, adCompletionRate: 0.8, eCPMCents: 10,
      netRevenueCents: 100, spendCents: 100, organicShare: 0.8,
      dataQuality: 'observed' as const, notes: [], observedAt: new Date().toISOString(),
    };
    const decision = decideLaunchDisposition(base, {
      ...DEFAULT_LAUNCH_THRESHOLDS,
      marketKill: { enabled: true, minimumUsers: 100, minimumObservedDays: 3, maxCrashRate: 0.2, minD1Retention: 0.1, minEcpmCents: null },
    });
    expect(decision.decision).toBe('KILL');
    expect(decision.blockers).toContain('d1-retention');
    const abandonment = evaluateAbandonment({
      runId: 'market-test',
      stage: 'LAUNCH_METRICS',
      budget: defaultOperatingProfile().budget,
      usage: { totalCents: 0, paidTrafficCents: 0, agentTokens: 0, humanMinutes: 0, fixAttempts: 0 },
      reason: 'market-kill',
    });
    expect(abandonment.reason).toBe('market-kill');
    expect(abandonment.decision).toBe('ABANDON');
  });
});
