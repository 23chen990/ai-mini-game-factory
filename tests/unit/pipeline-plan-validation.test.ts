import { describe, expect, it } from 'vitest';
import { buildPipelinePlan, validatePipelinePlan } from '../../src/core/pipeline-plan.js';

describe('pipeline plan validation', () => {
  it('rejects a plan that omits a release-critical stage or duplicates a stage', () => {
    const plan = buildPipelinePlan({ designMode: 'reference_reskin', productionLine: 'cut-stack-dodge' });
    expect(() => validatePipelinePlan({ ...plan, mandatoryStages: [...plan.mandatoryStages, plan.mandatoryStages[0]!] })).toThrow(/duplicate/i);
    expect(() => validatePipelinePlan({ ...plan, releaseCriticalStages: [...plan.releaseCriticalStages, 'NOT_IN_PLAN'] })).toThrow(/mandatory|unknown/i);
  });

  it('marks specialist profile checks as mandatory in full validation and optional in the fast lane', () => {
    const fast = buildPipelinePlan({ mode: 'fast-reskin', designMode: 'reference_reskin', productionLine: 'choice-life', primaryProfile: 'NARRATIVE_AGENCY' });
    const full = buildPipelinePlan({ mode: 'full-validation', designMode: 'reference_reskin', productionLine: 'choice-life', primaryProfile: 'NARRATIVE_AGENCY' });
    expect(fast.optionalStages).toEqual(expect.arrayContaining(['NARRATIVE_CONTRACT', 'NARRATIVE_REVIEW']));
    expect(full.mandatoryStages).toEqual(expect.arrayContaining(['NARRATIVE_CONTRACT', 'NARRATIVE_REVIEW']));
  });
});
