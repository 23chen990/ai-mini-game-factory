import { z } from 'zod';

const Text = z.string().trim().min(1);
export const StructuredFeedbackSchema = z.object({
  project: Text,
  artifact_version: Text,
  rejected_dimension: z.enum(['core', 'feel', 'narrative', 'strategy', 'puzzle', 'ui', 'visual', 'variation', 'platform', 'monetization', 'other']),
  reason: Text,
  before: Text,
  after: Text,
  accepted_result: Text,
  new_regression_case: Text,
  regression_eval: z.object({
    input: Text,
    expectedProfile: z.enum(['ACTION_FEEL', 'NARRATIVE_AGENCY', 'STRATEGIC_SYSTEM', 'PUZZLE_CLARITY', 'SOCIAL_EMOTION', 'EXPLORATION_DISCOVERY']),
    acceptableProfiles: z.array(z.enum(['ACTION_FEEL', 'NARRATIVE_AGENCY', 'STRATEGIC_SYSTEM', 'PUZZLE_CLARITY', 'SOCIAL_EMOTION', 'EXPLORATION_DISCOVERY'])).default([]),
    expectedSupportDecision: z.enum(['SUPPORTED', 'HYBRID_REVIEW_REQUIRED', 'NEW_LINE_REQUIRED', 'UNSUPPORTED']).optional(),
    requiredStages: z.array(Text).min(1),
    forbiddenOutcomes: z.array(Text).default([]),
    dataset: z.enum(['holdout', 'adversarial']).default('holdout'),
  }).strict().optional(),
}).strict();
export type StructuredFeedback = z.infer<typeof StructuredFeedbackSchema>;

/** A feedback case is an immutable, machine-runnable seed for future factory evals. */
export const FeedbackRegressionCaseSchema = z.object({
  schemaVersion: z.literal(1),
  regressionId: Text,
  sourceRunId: Text,
  project: Text,
  artifact_version: Text,
  rejected_dimension: StructuredFeedbackSchema.shape.rejected_dimension,
  reason: Text,
  before: Text,
  after: Text,
  accepted_result: Text,
  new_regression_case: Text,
  /** Optional machine-runnable route assertion. Human feedback may remain
   * descriptive until a reviewer supplies an expected outcome. */
  evalCase: z.object({
    input: Text,
    expectedProfile: z.enum(['ACTION_FEEL', 'NARRATIVE_AGENCY', 'STRATEGIC_SYSTEM', 'PUZZLE_CLARITY', 'SOCIAL_EMOTION', 'EXPLORATION_DISCOVERY']),
    acceptableProfiles: z.array(z.enum(['ACTION_FEEL', 'NARRATIVE_AGENCY', 'STRATEGIC_SYSTEM', 'PUZZLE_CLARITY', 'SOCIAL_EMOTION', 'EXPLORATION_DISCOVERY'])).default([]),
    expectedSupportDecision: z.enum(['SUPPORTED', 'HYBRID_REVIEW_REQUIRED', 'NEW_LINE_REQUIRED', 'UNSUPPORTED']).optional(),
    requiredStages: z.array(Text).min(1),
    forbiddenOutcomes: z.array(Text).default([]),
    dataset: z.enum(['holdout', 'adversarial']).default('holdout'),
  }).strict().optional(),
  createdAt: z.string().datetime(),
}).strict();
export type FeedbackRegressionCase = z.infer<typeof FeedbackRegressionCaseSchema>;

export const FeedbackRegressionCasesSchema = z.object({
  schemaVersion: z.literal(1),
  cases: z.array(FeedbackRegressionCaseSchema),
  updatedAt: z.string().datetime(),
}).strict();
export type FeedbackRegressionCases = z.infer<typeof FeedbackRegressionCasesSchema>;
