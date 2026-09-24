import { executionPolicyForStage, modelPolicySignature, nextModelAfterFailure, type ModelTier } from './model-policy.js';
import { ModelPolicySnapshotSchema, ModelRouteDecisionSchema, type ModelFailureKind, type ModelPolicySnapshot } from '../schemas/model-policy.js';
import { StageNameSchema, type StageName } from '../schemas/index.js';

export function snapshotModelPolicy(stages: StageName[] = [...StageNameSchema.options]): ModelPolicySnapshot {
  const unique = [...new Set(stages.map((stage) => StageNameSchema.parse(stage)))];
  return ModelPolicySnapshotSchema.parse({
    schemaVersion: 1,
    policyVersion: 'model-policy-v2',
    signature: modelPolicySignature(unique),
    stages: unique.map((stage) => {
      const policy = executionPolicyForStage(stage);
      return { stage, tier: policy.tier, model: policy.model, reasoning: policy.reasoning, sandbox: policy.sandbox, role: policy.role, maxInputChars: policy.maxInputChars, handoffMaxChars: policy.handoffMaxChars };
    }),
    generatedAt: new Date().toISOString(),
  });
}

/** Check that an immutable run snapshot still matches the active factory route. */
export function evaluateModelPolicySnapshot(value: unknown) {
  const snapshot = ModelPolicySnapshotSchema.parse(value);
  const blockers: string[] = [];
  let current: ModelPolicySnapshot | undefined;
  try {
    const stages = snapshot.stages.map((item) => StageNameSchema.parse(item.stage));
    current = snapshotModelPolicy(stages);
  } catch {
    blockers.push('snapshot-stage-invalid');
  }
  if (current) {
    if (snapshot.signature !== current.signature) blockers.push('signature-mismatch');
    for (const expected of snapshot.stages) {
      const actual = current.stages.find((item) => item.stage === expected.stage);
      if (!actual) {
        blockers.push(`stage-missing:${expected.stage}`);
        continue;
      }
      if (actual.model !== expected.model) blockers.push(`stage-model-mismatch:${expected.stage}`);
      if (actual.tier !== expected.tier) blockers.push(`stage-tier-mismatch:${expected.stage}`);
      if (actual.reasoning !== expected.reasoning) blockers.push(`stage-reasoning-mismatch:${expected.stage}`);
      if (actual.sandbox !== expected.sandbox || actual.role !== expected.role) blockers.push(`stage-boundary-mismatch:${expected.stage}`);
      if (actual.maxInputChars !== expected.maxInputChars || actual.handoffMaxChars !== expected.handoffMaxChars) blockers.push(`stage-budget-mismatch:${expected.stage}`);
    }
  }
  return { passed: blockers.length === 0, blockers: [...new Set(blockers)], snapshot, current };
}

/** Escalation changes the model tier only; it never silently grants a new role. */
export function executionPolicyAfterFailure(stageValue: StageName, attempt: number, failureKind: ModelFailureKind = 'CAPABILITY_ERROR', allowedTiers?: readonly ModelTier[]) {
  const stage = StageNameSchema.parse(stageValue); const base = executionPolicyForStage(stage); const escalated = nextModelAfterFailure(stage, attempt, failureKind, allowedTiers);
  return { ...base, ...escalated, role: base.role, sandbox: base.sandbox, canModifyWorkspace: base.canModifyWorkspace, handoffMaxChars: Math.min(base.handoffMaxChars, escalated.maxInputChars) };
}

/** Build a durable, permission-preserving model routing decision. */
export function buildModelRouteDecision(stageValue: StageName, attempt: number, failureKind: ModelFailureKind = 'CAPABILITY_ERROR', allowedTiers?: readonly ModelTier[]) {
  const stage = StageNameSchema.parse(stageValue);
  const base = executionPolicyForStage(stage);
  const selected = executionPolicyAfterFailure(stage, attempt, failureKind, allowedTiers);
  return ModelRouteDecisionSchema.parse({
    schemaVersion: 1,
    stage,
    attempt: Math.max(1, Math.trunc(attempt)),
    failureKind,
    base: { tier: base.tier, model: base.model, reasoning: base.reasoning, role: base.role, sandbox: base.sandbox },
    selected: { tier: selected.tier, model: selected.model, reasoning: selected.reasoning, role: selected.role, sandbox: selected.sandbox },
    rationale: selected.tier === base.tier
      ? `Keep the declared ${base.tier} route because ${failureKind} is not safely solvable by model escalation.`
      : `Escalate to ${selected.tier} for a capability failure while preserving the ${base.role} role and ${base.sandbox} sandbox.`,
    createdAt: new Date().toISOString(),
  });
}
