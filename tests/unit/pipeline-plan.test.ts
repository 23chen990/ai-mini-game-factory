import { describe, expect, it } from 'vitest';
import { assertStagePlannedOrLegacy, buildPipelinePlan, missingMandatoryProfileStages, missingRequiredGovernanceStages, PipelinePlanSchema, requiredStageContractsForPlan, stageExecutionPolicy } from '../../src/core/pipeline-plan.js';
import { FactoryOperatingProfileSchema } from '../../src/schemas/operating-profile.js';

describe('pipeline plan', () => {
  it('defaults reference-reskin requests to a compact replica preview lane', () => {
    const plan = buildPipelinePlan({ designMode: 'reference_reskin', productionLine: 'idle-management' });
    expect(plan.mode).toBe('replica-preview');
    expect(plan.mandatoryStages).toEqual([
      'REFERENCE_DEEP_RESEARCH',
      'REFERENCE_MECHANIC_LOCK',
      'WAITING_FOR_REFERENCE_APPROVAL',
      'BLUEPRINT',
      'PRODUCT_EXPERIENCE_CONTRACT',
      'CORE_SPEC_FROZEN',
      'FULL_BUILD',
      'QA',
      'WAITING_FOR_HUMAN_PLAYTEST',
      'COMPLETED',
    ]);
    expect(plan.mandatoryStages.length).toBeLessThanOrEqual(10);
    expect(plan.deferredStages).toEqual(expect.arrayContaining(['OPEN_SOURCE_RESEARCH', 'IAA_REVIEW', 'TARGET_PLATFORM_QA', 'RELEASE']));
    expect(plan.deferredStages).not.toContain('WAITING_FOR_HUMAN_PLAYTEST');
    expect(plan.deferredStages).not.toContain('FIX');
    expect(plan.optionalStages).toContain('FIX');
    expect(plan.stageGuides).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'REFERENCE_DEEP_RESEARCH', purpose: expect.any(String), inputs: expect.any(Array), outputs: expect.any(Array), evidence: expect.any(Array) }),
      expect.objectContaining({ stage: 'QA', purpose: expect.any(String), inputs: expect.any(Array), outputs: expect.any(Array), evidence: expect.any(Array) }),
    ]));
    const qaGuide = plan.stageGuides.find((guide) => guide.stage === 'QA');
    expect(qaGuide?.inputs).toEqual(expect.arrayContaining([
      'artifacts/reference-level-reconstruction.json (when recording)',
      'artifacts/reference-level-implementation-contract.json (when recording)',
    ]));
    expect(qaGuide?.outputs).toEqual(expect.arrayContaining([
      'artifacts/reference-level-runtime-trace.json (when recording)',
      'artifacts/reference-level-comparison-gate.json (when recording)',
    ]));
    expect(qaGuide?.evidence).toEqual(expect.arrayContaining([
      'recording checkpoint/object/placement/relation/action/camera/terminal/replay comparison',
      'bounded formal FIX retry on comparison failure',
    ]));
  });

  it('rejects replica preview for the legacy prototype tournament design mode', () => {
    expect(() => buildPipelinePlan({ mode: 'replica-preview', designMode: 'prototype_tournament', productionLine: 'idle-management' })).toThrow(/reference_reskin|replica-preview/i);
  });

  it('classifies mandatory stages as allowed', () => {
    const plan = buildPipelinePlan({ mode: 'fast-reskin', designMode: 'reference_reskin', productionLine: 'idle-management' });
    expect(stageExecutionPolicy(plan, 'QA')).toEqual({ allowed: true, classification: 'mandatory' });
    expect(assertStagePlannedOrLegacy(plan, 'QA')).toEqual({ allowed: true, classification: 'mandatory' });
  });

  it('classifies skipped/unlisted stages as disallowed', () => {
    const plan = buildPipelinePlan({ mode: 'fast-reskin', designMode: 'reference_reskin', productionLine: 'idle-management' });
    expect(stageExecutionPolicy(plan, 'PRESENTATION_QA')).toEqual({ allowed: true, classification: 'optional' });
    expect(stageExecutionPolicy(plan, 'BUILD_3_PROTOTYPES')).toEqual({ allowed: false, classification: 'skipped' });
    expect(stageExecutionPolicy(plan, 'NARRATIVE_CONTRACT')).toEqual({ allowed: false, classification: 'unlisted' });
    expect(() => assertStagePlannedOrLegacy(plan, 'BUILD_3_PROTOTYPES')).toThrow(/skipped/);
    expect(() => assertStagePlannedOrLegacy(plan, 'NARRATIVE_CONTRACT')).toThrow(/unlisted/);
  });

  it('allows recorded repair routes even when they are absent from the happy-path plan', () => {
    const plan = buildPipelinePlan({ mode: 'full-validation', designMode: 'reference_reskin', productionLine: 'cut-stack-dodge', primaryProfile: 'ACTION_FEEL' });
    expect(stageExecutionPolicy(plan, 'FEEL_REPAIR')).toEqual({ allowed: true, classification: 'optional' });
    expect(assertStagePlannedOrLegacy(plan, 'FEEL_REPAIR')).toEqual({ allowed: true, classification: 'optional' });
  });

  it('classifies legacy plan execution as allowed with explicit legacy marker', () => {
    expect(assertStagePlannedOrLegacy(undefined, 'NARRATIVE_CONTRACT', { legacyPlan: true })).toEqual({ allowed: true, classification: 'legacy' });
    expect(() => assertStagePlannedOrLegacy(undefined, 'NARRATIVE_CONTRACT')).toThrow();
  });

  it('keeps the one-person fast lane compact but never skips release-critical gates', () => {
    const plan = buildPipelinePlan({ mode: 'fast-reskin', designMode: 'reference_reskin', productionLine: 'cut-stack-dodge' });
    expect(PipelinePlanSchema.parse(plan).mandatoryStages).toEqual(expect.arrayContaining(['BUSINESS_PREFLIGHT', 'OPEN_SOURCE_RESEARCH', 'CORE_SPEC_FROZEN', 'FULL_BUILD', 'QA', 'TARGET_PLATFORM_QA', 'RELEASE']));
    expect(plan.skippedStages).toContain('BUILD_3_PROTOTYPES');
    expect(plan.skippedStages).not.toContain('CONTENT_VARIATION_QA');
  });

  it('keeps exploratory stages in the full validation lane', () => {
    const plan = buildPipelinePlan({ mode: 'full-validation', designMode: 'prototype_tournament', productionLine: 'choice-life' });
    expect(plan.mandatoryStages).toEqual(expect.arrayContaining(['COMPETITOR_RESEARCH', 'IDEA_GENERATION', 'BUILD_3_PROTOTYPES', 'CONTENT_VARIATION_QA']));
    expect(plan.skippedStages).toHaveLength(0);
  });

  it('exposes missing mandatory profile stages so full validation cannot silently skip them', () => {
    const plan = buildPipelinePlan({ mode: 'full-validation', designMode: 'reference_reskin', productionLine: 'choice-life', primaryProfile: 'NARRATIVE_AGENCY' });
    expect(missingMandatoryProfileStages(plan, ['EXPERIENCE_CONTRACT', 'NARRATIVE_CONTRACT'])).toEqual(['STORY_VERTICAL_SLICE', 'CHOICE_CONSEQUENCE_QA', 'NARRATIVE_REVIEW', 'REPLAY_VALUE_QA']);
    expect(missingMandatoryProfileStages(plan, plan.mandatoryStages)).toEqual([]);
  });

  it('derives strict constitution audits from the selected plan and excludes disabled optional gates', () => {
    const plan = buildPipelinePlan({ mode: 'fast-reskin', designMode: 'reference_reskin', productionLine: 'idle-management', primaryProfile: 'STRATEGIC_SYSTEM' });
    const required = requiredStageContractsForPlan(plan, { includeRelease: false });
    expect(required).toContain('BUSINESS_PREFLIGHT');
    expect(required).toContain('CORE_SPEC_FROZEN');
    expect(required).not.toContain('RELEASE');
    expect(required).not.toContain('CERTIFICATION');
    expect(required).not.toContain('PRESENTATION_QA');
    expect(required).not.toContain('SUPPLY_CHAIN_QA');
    expect(required).not.toContain('BLIND_PLAYTEST_QA');
  });

  it('does not hide prototype-tournament stages from the plan in the fast lane', () => {
    const plan = buildPipelinePlan({ mode: 'fast-reskin', designMode: 'prototype_tournament', productionLine: 'idle-management', primaryProfile: 'STRATEGIC_SYSTEM' });
    expect(plan.mandatoryStages).toEqual(expect.arrayContaining(['COMPETITOR_RESEARCH', 'IDEA_GENERATION', 'WAITING_FOR_PROTOTYPE_APPROVAL']));
    expect(plan.skippedStages).not.toContain('COMPETITOR_RESEARCH');
  });

  it('promotes enabled governance stages into the frozen mandatory plan', () => {
    const plan = buildPipelinePlan({ mode: 'fast-reskin', designMode: 'reference_reskin', productionLine: 'idle-management', presentationQualityRequired: true, supplyChainRequired: true, blindPlaytestRequired: true });
    expect(plan.mandatoryStages).toEqual(expect.arrayContaining(['PRESENTATION_QA', 'SUPPLY_CHAIN_QA', 'BLIND_PLAYTEST_QA']));
    expect(plan.optionalStages).not.toEqual(expect.arrayContaining(['PRESENTATION_QA', 'SUPPLY_CHAIN_QA', 'BLIND_PLAYTEST_QA']));
    expect(requiredStageContractsForPlan(plan, { presentationQualityRequired: true, supplyChainRequired: true, blindPlaytestRequired: true })).toEqual(expect.arrayContaining(['PRESENTATION_QA', 'SUPPLY_CHAIN_QA', 'BLIND_PLAYTEST_QA']));
    expect(missingRequiredGovernanceStages(plan, { presentationQualityRequired: true, supplyChainRequired: true, blindPlaytestRequired: true })).toEqual([]);
  });

  it('freezes all automatic release gates before the candidate and human playtest', () => {
    const plan = buildPipelinePlan({
      mode: 'fast-reskin',
      designMode: 'reference_reskin',
      productionLine: 'idle-management',
      presentationQualityRequired: true,
      supplyChainRequired: true,
      blindPlaytestRequired: true,
    });
    const index = (stage: string) => plan.mandatoryStages.indexOf(stage as never);
    expect(index('QUALITY_BASELINE_QA')).toBeLessThan(index('RELEASE_CANDIDATE'));
    expect(index('ORIGINALITY_REVIEW')).toBeLessThan(index('RELEASE_CANDIDATE'));
    expect(index('CERTIFICATION')).toBeLessThan(index('RELEASE_CANDIDATE'));
    expect(index('PLATFORM_ADAPTER_QA')).toBeLessThan(index('RELEASE_CANDIDATE'));
    expect(index('TARGET_PLATFORM_QA')).toBeLessThan(index('RELEASE_CANDIDATE'));
    expect(index('RELEASE_CANDIDATE')).toBeLessThan(index('BLIND_PLAYTEST_QA'));
    expect(index('BLIND_PLAYTEST_QA')).toBeLessThan(index('WAITING_FOR_HUMAN_PLAYTEST'));
    expect(index('WAITING_FOR_HUMAN_PLAYTEST')).toBeLessThan(index('RELEASE'));
  });

  it('detects a legacy plan that was frozen before a stricter policy was enabled', () => {
    const legacy = buildPipelinePlan({ mode: 'fast-reskin', designMode: 'reference_reskin', productionLine: 'idle-management' });
    expect(missingRequiredGovernanceStages(legacy, { presentationQualityRequired: true, supplyChainRequired: true })).toEqual(['PRESENTATION_QA', 'SUPPLY_CHAIN_QA']);
  });

  it('validates the exact domestic platform set in the operating profile', () => {
    expect(() => FactoryOperatingProfileSchema.parse({
      schemaVersion: 1, entity: 'personal', monetization: 'IAA', appDistribution: false,
      requiredTargets: ['wechat-minigame', 'douyin-minigame', 'wechat-minigame'], optionalTargets: [],
      paidTraffic: { enabled: false, maxBudgetCents: 0 },
      budget: { currency: 'CNY', maxTotalCents: 100, maxPaidTrafficCents: 0, maxAgentTokens: 1000, maxHumanMinutes: 10, maxFixAttempts: 2, paybackWindowDays: 7 },
      humanApprovalSessions: ['GO_NO_GO', 'CORE_DEMO', 'FINAL_RELEASE'], deviceBaselines: [{ width: 360, height: 800, label: 'phone' }],
    })).toThrow(/wechat|domestic|unique/i);
  });
});
