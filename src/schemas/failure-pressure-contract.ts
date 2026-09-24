import { z } from 'zod';

const Text = z.string().trim().min(1);

/**
 * Cross-competitor behavioral evidence.  This deliberately records what is
 * observed, inferred, useful, or rejected without copying a competitor's
 * expression, assets, names, UI, or tuning values.
 */
export const FailurePressureEvidenceSchema = z.object({
  id: Text,
  competitor: Text,
  sourceRefs: z.array(Text).min(1),
  observed: z.array(Text).min(1),
  inferred: z.array(Text).default([]),
  applicability: z.enum(['adopt', 'adapt', 'reject']),
  applicabilityRationale: Text,
  rejectExpression: z.array(Text).default([]),
  confidence: z.enum(['high', 'medium', 'low']),
}).strict();

export const FailurePressureRuleSchema = z.object({
  id: Text,
  pressureType: z.enum(['timing', 'hazard', 'resource_loss', 'wrong_choice', 'pursuit', 'collapse', 'stamina', 'other']),
  trigger: Text,
  playerSignal: Text,
  escalation: Text,
  failureOutcome: Text,
  attribution: Text,
  recovery: Text,
  sourceEvidenceRefs: z.array(Text).min(1),
  implementationImplications: z.array(Text).min(1),
}).strict();

export const FailurePressureContractSchema = z.object({
  schemaVersion: z.literal(1),
  purpose: Text,
  evidence: z.array(FailurePressureEvidenceSchema).min(1),
  rules: z.array(FailurePressureRuleSchema).min(1),
  noCopyBoundary: z.array(Text).min(1),
}).strict().superRefine((contract, context) => {
  const ids = contract.evidence.map((item) => item.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['evidence'], message: 'failure-pressure evidence ids must be unique' });
  const ruleIds = contract.rules.map((item) => item.id);
  if (new Set(ruleIds).size !== ruleIds.length) context.addIssue({ code: 'custom', path: ['rules'], message: 'failure-pressure rule ids must be unique' });
  const evidenceIds = new Set(ids);
  for (const rule of contract.rules) {
    for (const ref of rule.sourceEvidenceRefs) {
      if (!evidenceIds.has(ref)) context.addIssue({ code: 'custom', path: ['rules'], message: `rule ${rule.id} references unknown evidence ${ref}` });
    }
  }
});

export type FailurePressureEvidence = z.infer<typeof FailurePressureEvidenceSchema>;
export type FailurePressureRule = z.infer<typeof FailurePressureRuleSchema>;
export type FailurePressureContract = z.infer<typeof FailurePressureContractSchema>;
