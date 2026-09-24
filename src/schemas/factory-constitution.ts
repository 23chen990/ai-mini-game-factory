import { z } from 'zod';

const Text = z.string().trim().min(1);

/**
 * The constitution is deliberately data, not a prompt.  It is persisted and
 * evaluated by the control plane so a downstream model cannot lower the bar
 * by changing its instructions.
 */
export const ConstitutionRuleIdSchema = z.enum([
  'REQUIRED_STAGE_CONTRACT',
  'UNKNOWN_ZERO_AT_RELEASE',
  'NO_SELF_ACCEPTANCE',
  'REGRESSION_TEST_FOR_FIX',
  'FAIL_TO_EARLIEST_OWNER',
  'LICENSE_ALLOWLIST_ONLY',
  'BOUNDED_AUTOMATIC_REPAIR',
  'PLATFORM_CHILD_ISOLATION',
  'IMMUTABLE_CANDIDATE',
  'FINAL_HUMAN_PLAYTEST',
  'THREE_HUMAN_APPROVALS',
  'QUALITY_STATUS_MATRIX',
  'STATE_TRANSITION_AUDIT',
  'SIDE_EFFECT_JOURNAL',
]);
export type ConstitutionRuleId = z.infer<typeof ConstitutionRuleIdSchema>;

export const FactoryConstitutionSchema = z.object({
  schemaVersion: z.literal(1),
  constitutionId: z.literal('FACTORY_CONSTITUTION'),
  version: Text,
  requiredCompletionGates: z.array(z.enum(['core', 'normalFlow', 'visualEvidence', 'levelDifference', 'humanPlaytest'])).length(5),
  rules: z.array(ConstitutionRuleIdSchema).min(1),
  maxAutomaticRepairAttempts: z.number().int().nonnegative().max(5),
  frozenAfterStage: z.literal('CORE_SPEC_FROZEN'),
  generatedAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  if (new Set(value.rules).size !== value.rules.length) context.addIssue({ code: 'custom', path: ['rules'], message: 'constitution rules must be unique' });
  if (new Set(value.requiredCompletionGates).size !== 5) context.addIssue({ code: 'custom', path: ['requiredCompletionGates'], message: 'all five completion gates are required exactly once' });
});
export type FactoryConstitution = z.infer<typeof FactoryConstitutionSchema>;

export const ConstitutionEvaluationSchema = z.object({
  schemaVersion: z.literal(1),
  passed: z.boolean(),
  blockers: z.array(Text),
  unknowns: z.array(Text),
  waived: z.array(Text),
  checkedAt: z.string().datetime(),
}).strict();
export type ConstitutionEvaluation = z.infer<typeof ConstitutionEvaluationSchema>;
