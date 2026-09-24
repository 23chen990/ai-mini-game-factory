import { z } from 'zod';

const Text = z.string().trim().min(1);

export const ContentVariantSchema = z.object({
  id: Text,
  structuralChange: Text,
  playerDecision: Text,
  difficultyBand: z.enum(['intro', 'standard', 'pressure', 'mastery']),
  acceptanceEvidence: z.array(Text).min(1),
}).strict();
export type ContentVariant = z.infer<typeof ContentVariantSchema>;

export const ContentExpansionPlanSchema = z.object({
  schemaVersion: z.literal(1),
  gameId: Text,
  productionLine: Text,
  experienceProfile: Text,
  representativeFlow: z.array(Text).min(3),
  variants: z.array(ContentVariantSchema).min(2),
  difficultyRules: z.array(Text).min(2),
  replayHook: Text,
  createdAt: z.string().datetime(),
}).strict().superRefine((plan, context) => {
  if (new Set(plan.variants.map((variant) => variant.id)).size !== plan.variants.length) context.addIssue({ code: 'custom', path: ['variants'], message: 'content variant ids must be unique' });
  if (plan.variants.every((variant) => /(?:text|color|cosmetic|palette|文案|颜色|换皮)/iu.test(variant.structuralChange))) context.addIssue({ code: 'custom', path: ['variants'], message: 'variants must contain a structural or decision change' });
});
export type ContentExpansionPlan = z.infer<typeof ContentExpansionPlanSchema>;
