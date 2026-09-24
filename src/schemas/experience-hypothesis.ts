import { z } from 'zod';

const Text = z.string().trim().min(1);
const Profile = z.enum(['ACTION_FEEL', 'NARRATIVE_AGENCY', 'STRATEGIC_SYSTEM', 'PUZZLE_CLARITY']);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);

export const ExperienceHypothesisSchema = z.object({
  schemaVersion: z.literal(1),
  gameId: Text,
  profile: Profile,
  question: Text,
  hypotheses: z.array(z.object({ id: Text, statement: Text, metric: Text, target: Text, failureCondition: Text }).strict()).min(1),
  status: z.enum(['DRAFT', 'READY', 'REJECTED']),
  sourceBlueprintHash: Sha256.optional(),
  createdAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  if (value.status === 'READY' && !value.sourceBlueprintHash) context.addIssue({ code: 'custom', path: ['sourceBlueprintHash'], message: 'ready hypothesis requires blueprint hash' });
});
export type ExperienceHypothesis = z.infer<typeof ExperienceHypothesisSchema>;

export const CoreSpecLockSchema = z.object({
  schemaVersion: z.literal(1),
  gameId: Text,
  profile: Profile,
  hypothesisHash: Sha256,
  acceptanceDimensions: z.array(Text).min(3),
  frozenBy: z.literal('human'),
  version: z.number().int().positive(),
  frozenAt: z.string().datetime(),
}).strict();
export type CoreSpecLock = z.infer<typeof CoreSpecLockSchema>;
