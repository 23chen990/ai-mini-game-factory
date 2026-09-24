import { describe, expect, it } from 'vitest';
import { executionPolicyForStage, modelForStage, modelPolicySignature } from '../../src/core/model-policy.js';

describe('model routing boundary', () => {
  it('keeps fast evidence work read-only and reserves workspace mutation for Builder/Fixer scopes', () => {
    expect(executionPolicyForStage('UI_SKELETON')).toMatchObject({ tier: 'reviewer', sandbox: 'read-only', canModifyWorkspace: false, role: 'reviewer' });
    expect(executionPolicyForStage('FULL_BUILD')).toMatchObject({ tier: 'builder', sandbox: 'workspace-write', canModifyWorkspace: true, role: 'builder' });
    expect(executionPolicyForStage('FIX')).toMatchObject({ sandbox: 'workspace-write', canModifyWorkspace: true, role: 'fixer' });
    expect(executionPolicyForStage('ART_DIRECTIONS')).toMatchObject({ sandbox: 'read-only', canModifyWorkspace: false, role: 'reviewer' });
    expect(executionPolicyForStage('BLUEPRINT')).toMatchObject({ sandbox: 'read-only', canModifyWorkspace: false, role: 'producer' });
    expect(executionPolicyForStage('RELEASE')).toMatchObject({ sandbox: 'read-only', canModifyWorkspace: false, role: 'release' });
    expect(executionPolicyForStage('FEEL_REPAIR')).toMatchObject({ sandbox: 'workspace-write', canModifyWorkspace: true, role: 'fixer' });
  });

  it('uses a configured model without silently accepting an empty override', () => {
    const previous = process.env.FACTORY_FRONTIER_MODEL;
    process.env.FACTORY_FRONTIER_MODEL = '  frontier-test  ';
    try {
      expect(modelForStage('COMPETITOR_RESEARCH').model).toBe('frontier-test');
    } finally {
      if (previous === undefined) delete process.env.FACTORY_FRONTIER_MODEL;
      else process.env.FACTORY_FRONTIER_MODEL = previous;
    }
  });

  it('supports explicit per-stage routing and bounded reasoning overrides', () => {
    const previousModel = process.env.FACTORY_STAGE_UI_SKELETON_MODEL;
    const previousReasoning = process.env.FACTORY_REVIEWER_REASONING;
    process.env.FACTORY_STAGE_UI_SKELETON_MODEL = 'spark-custom';
    process.env.FACTORY_REVIEWER_REASONING = 'medium';
    try {
      expect(modelForStage('UI_SKELETON')).toMatchObject({ model: 'spark-custom', reasoning: 'medium' });
      expect(modelPolicySignature(['UI_SKELETON'])).toContain('UI_SKELETON:reviewer:spark-custom:medium');
    } finally {
      if (previousModel === undefined) delete process.env.FACTORY_STAGE_UI_SKELETON_MODEL; else process.env.FACTORY_STAGE_UI_SKELETON_MODEL = previousModel;
      if (previousReasoning === undefined) delete process.env.FACTORY_REVIEWER_REASONING; else process.env.FACTORY_REVIEWER_REASONING = previousReasoning;
    }
  });
});
