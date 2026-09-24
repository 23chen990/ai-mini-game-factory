import { z } from 'zod';

const OriginalExpressionOnlySchema = z.object({
  originalCode: z.literal(true),
  originalAssets: z.literal(true),
  originalNamesAndText: z.literal(true),
  originalUiLayout: z.literal(true),
  originalAudio: z.literal(true),
  originalTuningValues: z.literal(true),
});

const maximumCoreMechanicFidelity = {
  level: 'maximum_core_mechanics' as const,
  preserveInputStateTransitions: true as const,
  preserveCoreLoopOrder: true as const,
  preserveProgressionTopology: true as const,
  preserveUnlockDependencies: true as const,
  preserveFailureAndRecoveryRules: true as const,
  preserveFeedbackTimingBands: true as const,
};

const MaximumCoreMechanicFidelitySchema = z.object({
  level: z.literal('maximum_core_mechanics'),
  preserveInputStateTransitions: z.literal(true),
  preserveCoreLoopOrder: z.literal(true),
  preserveProgressionTopology: z.literal(true),
  preserveUnlockDependencies: z.literal(true),
  preserveFailureAndRecoveryRules: z.literal(true),
  preserveFeedbackTimingBands: z.literal(true),
}).default(maximumCoreMechanicFidelity);

/**
 * A human-authored lock on generic gameplay relationships from one designated
 * benchmark. This artifact is intentionally not produced by an ideation agent.
 */
export const ReferenceMechanicSpecSchema = z.object({
  schemaVersion: z.literal(1),
  lockedBy: z.literal('human'),
  source: z.object({
    name: z.string().trim().min(1),
    url: z.url(),
    researchFiles: z.array(z.string().trim().min(1)),
  }),
  coreLoop: z.array(z.string().trim().min(1)).min(4),
  playerActions: z.array(z.string().trim().min(1)).min(1),
  progressionSystems: z.array(z.string().trim().min(1)).min(1),
  unlockRules: z.array(z.string().trim().min(1)).min(1),
  feedbackCadence: z.object({
    immediateSeconds: z.number().positive().max(10),
    microGoalMinSeconds: z.number().positive().max(600),
    microGoalMaxSeconds: z.number().positive().max(600),
  }).refine((value) => value.microGoalMinSeconds <= value.microGoalMaxSeconds, {
    message: 'microGoalMinSeconds must not exceed microGoalMaxSeconds',
  }),
  mustPreserveMechanics: z.array(z.string().trim().min(1)).min(1),
  adaptableMechanics: z.array(z.string().trim().min(1)).min(1),
  fidelityPolicy: MaximumCoreMechanicFidelitySchema,
  expressionIsolation: OriginalExpressionOnlySchema,
});
export type ReferenceMechanicSpec = z.infer<typeof ReferenceMechanicSpecSchema>;

export const HumanReferenceDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  notes: z.array(z.string().trim().min(1)).default([]),
});
export type HumanReferenceDecision = z.infer<typeof HumanReferenceDecisionSchema>;
