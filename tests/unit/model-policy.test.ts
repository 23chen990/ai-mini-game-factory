import { describe, expect, it } from 'vitest';
import { classifyModelFailure, executionPolicyForStage, getModelPolicy, modelForStage, nextModelAfterFailure } from '../../src/core/model-policy.js';
import { StageNameSchema } from '../../src/schemas/index.js';

describe('model policy', () => {
  it('keeps high-risk design and experience decisions on a frontier model', () => {
    expect(modelForStage('COMPETITOR_RESEARCH')).toMatchObject({ tier: 'frontier', model: 'gpt-5.6-luna', reasoning: 'max' });
    expect(modelForStage('EXPERIENCE_REVIEW')).toMatchObject({ tier: 'frontier', model: 'gpt-5.6-luna', reasoning: 'max' });
    expect(modelForStage('FULL_BUILD')).toMatchObject({ tier: 'builder', model: 'gpt-5.6-luna', reasoning: 'max' });
  });

  it('routes the narrative vertical slice to the writing-capable Builder tier', () => {
    expect(modelForStage('STORY_VERTICAL_SLICE')).toMatchObject({ tier: 'builder', model: 'gpt-5.6-luna', reasoning: 'max' });
    expect(executionPolicyForStage('STORY_VERTICAL_SLICE')).toMatchObject({ role: 'builder', sandbox: 'workspace-write', canModifyWorkspace: true });
  });

  it('keeps bounded execution and evidence tasks read-only while using the requested Luna worker', () => {
    const policy = getModelPolicy();
    expect(modelForStage('UI_SKELETON')).toMatchObject({ tier: 'reviewer', model: 'gpt-5.6-luna', reasoning: 'max' });
    expect(modelForStage('QA')).toMatchObject({ tier: 'reviewer', model: 'gpt-5.6-luna', reasoning: 'max' });
    for (const stage of ['VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA', 'PERCEPTUAL_QA', 'ASSETS', 'PRESENTATION_QA', 'SUPPLY_CHAIN_QA', 'COST_GATE', 'FACTORY_EVAL', 'QUALITY_BASELINE_QA'] as const) {
      expect(modelForStage(stage)).toMatchObject({ tier: 'fast', model: 'gpt-5.6-luna', reasoning: 'max' });
      expect(executionPolicyForStage(stage)).toMatchObject({ sandbox: 'read-only', canModifyWorkspace: false, role: 'evidence-helper' });
    }
    expect(policy.FULL_BUILD?.tier).not.toBe('fast');
  });

  it('keeps research capability limited to explicit research stages', () => {
    expect(executionPolicyForStage('COMPETITOR_RESEARCH')).toMatchObject({ role: 'research', sandbox: 'read-only' });
    expect(executionPolicyForStage('LOW_COST_FILTER')).toMatchObject({ role: 'producer', sandbox: 'read-only' });
    expect(executionPolicyForStage('PRODUCTION_LINE_REVIEW')).toMatchObject({ role: 'reviewer', sandbox: 'read-only' });
    const researchStages = StageNameSchema.options.filter((stage) => executionPolicyForStage(stage).role === 'research');
    expect(researchStages).toEqual(['REFERENCE_DEEP_RESEARCH', 'COMPETITOR_RESEARCH', 'OPEN_SOURCE_RESEARCH']);
  });

  it('escalates instead of retrying a weak model on a failed high-risk task', () => {
    expect(nextModelAfterFailure('UI_SKELETON', 1)).toMatchObject({ model: 'gpt-5.6-luna', tier: 'frontier' });
    expect(nextModelAfterFailure('EXPERIENCE_REVIEW', 1)).toMatchObject({ model: 'gpt-5.6-luna', tier: 'frontier' });
  });

  it('does not escalate for transient, specification or policy failures', () => {
    expect(nextModelAfterFailure('UI_SKELETON', 1, 'TRANSIENT')).toMatchObject({ tier: 'reviewer' });
    expect(nextModelAfterFailure('UI_SKELETON', 1, 'SPEC_ERROR')).toMatchObject({ tier: 'reviewer' });
    expect(classifyModelFailure('429 rate limit')).toBe('TRANSIENT');
    expect(classifyModelFailure("You've hit your usage limit. Try again at Sep 15th, 2026 9:27 AM.")).toBe('TRANSIENT');
    expect(classifyModelFailure('Selected model is at capacity. Please try again later.')).toBe('TRANSIENT');
    expect(classifyModelFailure('license policy blocked')).toBe('POLICY_BLOCK');
  });
});
