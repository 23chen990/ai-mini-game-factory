import { z } from 'zod';
import { ProductionLineDecisionLineSchema } from './production-line.js';
import { PrimaryExperienceProfileSchema } from './experience-profile.js';

const Text = z.string().trim().min(1);

/**
 * A production-line-specific contract for what a natural player trace must
 * actually exercise.  Generic screenshots and a single state transition are
 * not enough: each line declares the verbs/decisions that make its experience
 * meaningful.  The policy is data, so QA runners can be swapped without
 * changing the release rule.
 */
export const NaturalInputPolicySchema = z.object({
  schemaVersion: z.literal(1),
  line: ProductionLineDecisionLineSchema,
  profile: PrimaryExperienceProfileSchema,
  minimumActions: z.number().int().min(2),
  requiredTransitions: z.array(Text).min(1),
  acceptedCompletions: z.array(z.enum(['settlement', 'terminal', 'automatic-progress'])).min(1),
  requireReplay: z.boolean(),
  minimumScreenshots: z.number().int().positive(),
  forbiddenOperations: z.array(Text).min(1),
}).strict().superRefine((policy, context) => {
  if (new Set(policy.requiredTransitions).size !== policy.requiredTransitions.length) {
    context.addIssue({ code: 'custom', path: ['requiredTransitions'], message: 'required transitions must be unique' });
  }
  if (new Set(policy.forbiddenOperations).size !== policy.forbiddenOperations.length) {
    context.addIssue({ code: 'custom', path: ['forbiddenOperations'], message: 'forbidden operations must be unique' });
  }
});
export type NaturalInputPolicy = z.infer<typeof NaturalInputPolicySchema>;

