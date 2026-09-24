import { describe, expect, it } from 'vitest';
import { snapshotModelPolicy, executionPolicyAfterFailure, buildModelRouteDecision, evaluateModelPolicySnapshot } from '../../src/core/model-policy-artifact.js';
import { ModelPolicySnapshotSchema } from '../../src/schemas/model-policy.js';

describe('model policy snapshot and escalation', () => {
  it('persists model, reasoning and sandbox decisions as a versioned artifact', () => {
    const snapshot = snapshotModelPolicy(['FULL_BUILD', 'QA', 'UI_SKELETON']);
    expect(ModelPolicySnapshotSchema.parse(snapshot).stages).toHaveLength(3);
    expect(snapshot.stages.find((item) => item.stage === 'FULL_BUILD')).toMatchObject({ tier: 'builder', sandbox: 'workspace-write', role: 'builder' });
    expect(snapshot.signature).toMatch(/FULL_BUILD/);
  });

  it('escalates model strength without changing the owner or workspace boundary', () => {
    const escalated = executionPolicyAfterFailure('UI_SKELETON', 1);
    expect(escalated.role).toBe('reviewer');
    expect(escalated.sandbox).toBe('read-only');
    expect(escalated.tier).toBe('frontier');
  });

  it('emits an auditable route decision for each bounded retry', () => {
    const decision = buildModelRouteDecision('UI_SKELETON', 1, 'CAPABILITY_ERROR');
    expect(decision).toMatchObject({ stage: 'UI_SKELETON', attempt: 1, base: { role: 'reviewer', sandbox: 'read-only' }, selected: { role: 'reviewer', sandbox: 'read-only' } });
  });

  it('rejects a run snapshot when the configured model route drifts after creation', () => {
    const snapshot = snapshotModelPolicy(['FULL_BUILD']);
    const previous = process.env.FACTORY_BUILDER_MODEL;
    process.env.FACTORY_BUILDER_MODEL = 'gpt-5.6-terra';
    try {
      const evaluation = evaluateModelPolicySnapshot(snapshot);
      expect(evaluation.passed).toBe(false);
      expect(evaluation.blockers).toContain('stage-model-mismatch:FULL_BUILD');
    } finally {
      if (previous === undefined) delete process.env.FACTORY_BUILDER_MODEL;
      else process.env.FACTORY_BUILDER_MODEL = previous;
    }
  });
});
