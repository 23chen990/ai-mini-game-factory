import { describe, expect, it } from 'vitest';
import { classifyModelFailure, executionPolicyForAttempt, executionPolicyForStage, getModelPolicy, modelForStage, nextModelAfterFailure } from '../../src/core/model-policy.js';
import { StageNameSchema } from '../../src/schemas/index.js';

describe('model policy', () => {
  it('keeps high-risk design and experience decisions on a frontier model', () => {
    expect(modelForStage('COMPETITOR_RESEARCH')).toMatchObject({ tier: 'frontier', model: 'account-default', reasoning: 'max' });
    expect(modelForStage('EXPERIENCE_REVIEW')).toMatchObject({ tier: 'frontier', model: 'account-default', reasoning: 'max' });
    expect(modelForStage('FULL_BUILD')).toMatchObject({ tier: 'builder', model: 'account-default', reasoning: 'max' });
  });

  it('routes the narrative vertical slice to the writing-capable Builder tier', () => {
    expect(modelForStage('STORY_VERTICAL_SLICE')).toMatchObject({ tier: 'builder', model: 'account-default', reasoning: 'max' });
    expect(executionPolicyForStage('STORY_VERTICAL_SLICE')).toMatchObject({ role: 'builder', sandbox: 'workspace-write', canModifyWorkspace: true });
  });

  it('keeps bounded execution and evidence tasks read-only while using the requested Luna worker', () => {
    const policy = getModelPolicy();
    expect(modelForStage('UI_SKELETON')).toMatchObject({ tier: 'reviewer', model: 'account-default', reasoning: 'max' });
    expect(modelForStage('QA')).toMatchObject({ tier: 'reviewer', model: 'account-default', reasoning: 'max' });
    for (const stage of ['VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA', 'PERCEPTUAL_QA', 'ASSETS', 'PRESENTATION_QA', 'SUPPLY_CHAIN_QA', 'COST_GATE', 'FACTORY_EVAL', 'QUALITY_BASELINE_QA'] as const) {
      expect(modelForStage(stage)).toMatchObject({ tier: 'fast', model: 'account-default', reasoning: 'max' });
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
    expect(nextModelAfterFailure('UI_SKELETON', 1)).toMatchObject({ model: 'account-default', tier: 'frontier' });
    expect(nextModelAfterFailure('EXPERIENCE_REVIEW', 1)).toMatchObject({ model: 'account-default', tier: 'frontier' });
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

describe('QA observation infrastructure failures', () => {
  it.each(['QA_BROWSER_UNAVAILABLE: browser smoke failed', 'QA_OBSERVATIONS_REQUIRED: no captured pixels', 'QA observation build/trace hash mismatch'])('does not model-escalate %s', (message) => {
    const kind = classifyModelFailure(message);
    expect(kind).toBe('TOOL_ERROR');
    expect(executionPolicyForAttempt('BLIND_PLAYTEST_QA', 2, kind)).toEqual(executionPolicyForStage('BLIND_PLAYTEST_QA'));
  });
});

it.each([
 ['{"type":"invalid_request_error","code":"model_not_found","message":"Configured model is not supported when using Codex with a ChatGPT account."}', 'SPEC_ERROR'],
 ['Failed to parse request body: invalid_request_error network', 'SPEC_ERROR'],
 ['The model `unavailable-model` does not exist or you do not have access to it.', 'SPEC_ERROR'],
 ['You do not have access to model `restricted-model`.', 'POLICY_BLOCK'],
 ['research permission preflight rejected: research-network-allow-list-missing', 'POLICY_BLOCK'],
] as const)('does not capability-escalate an explicit request/configuration rejection: %s', (message, expected) => {
 const kind=classifyModelFailure(message);expect(kind).toBe(expected);
 expect(executionPolicyForAttempt('UI_SKELETON',2,kind)).toEqual(executionPolicyForStage('UI_SKELETON'));
});

it('rejects malformed explicit stage model configuration before provider dispatch', () => {
 const key = 'FACTORY_STAGE_QA_MODEL';
 const previous = process.env[key];
 process.env[key] = '--model fake';
 try { expect(() => modelForStage('QA')).toThrow(/model configuration/); }
 finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
});
it.each([
 ['Invalid model configuration: --model bad','SPEC_ERROR'],
 ['error: unexpected argument --unsupported found','SPEC_ERROR'],
 ['Codex CLI is not logged in with ChatGPT','POLICY_BLOCK'],
 ['QA_ISOLATION_UNAVAILABLE: host cannot enforce reads','TOOL_ERROR'],
] as const)('never escalates configuration/authentication/isolation failure %s', (message, expected) => {
 expect(classifyModelFailure(message)).toBe(expected);
});
