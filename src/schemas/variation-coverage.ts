import { z } from 'zod';

const Text = z.string().trim().min(1);
const LineSchema = z.enum(['single-finger-action', 'cut-stack-dodge', 'idle-management', 'choice-life', 'rule-puzzle']);
const SeedModeSchema = z.enum(['golden', 'fuzz', 'production']);

export const VariationCoveragePlanSchema = z.object({
  schemaVersion: z.literal(1),
  line: LineSchema,
  minimumRuns: z.number().int().min(2),
  requiredDimensions: z.array(Text).min(2),
  seedModes: z.array(SeedModeSchema).length(3),
  representativeFlows: z.array(Text).min(2),
  generatedAt: z.string().datetime(),
}).strict().superRefine((plan, context) => {
  if (new Set(plan.seedModes).size !== plan.seedModes.length) context.addIssue({ code: 'custom', path: ['seedModes'], message: 'variation seed modes must be unique' });
  if (!plan.seedModes.includes('golden') || !plan.seedModes.includes('fuzz') || !plan.seedModes.includes('production')) context.addIssue({ code: 'custom', path: ['seedModes'], message: 'golden, fuzz and production modes are required' });
  if (new Set(plan.requiredDimensions).size !== plan.requiredDimensions.length) context.addIssue({ code: 'custom', path: ['requiredDimensions'], message: 'variation dimensions must be unique' });
});
export type VariationCoveragePlan = z.infer<typeof VariationCoveragePlanSchema>;

export const VariationCoverageObservationSchema = z.object({
  runs: z.number().int().nonnegative(),
  dimensions: z.array(Text),
}).strict();
export type VariationCoverageObservation = z.infer<typeof VariationCoverageObservationSchema>;
