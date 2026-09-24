import { z } from 'zod';

const Text = z.string().trim().min(1);
const Profile = z.enum(['ACTION_FEEL', 'NARRATIVE_AGENCY', 'STRATEGIC_SYSTEM', 'PUZZLE_CLARITY']);
const Line = z.enum(['single-finger-action', 'cut-stack-dodge', 'idle-management', 'choice-life', 'rule-puzzle']);

export const ProfileVariationSchema = z.object({
  schemaVersion: z.literal(1),
  profile: Profile,
  line: Line,
  variants: z.array(z.object({ id: Text, structuralSignature: Text, behaviorSignature: Text, pacingSignature: Text, evidence: z.array(Text).min(1) }).strict()).min(2),
  passed: z.boolean(),
  rationale: Text,
}).strict().superRefine((report, context) => {
  if (new Set(report.variants.map((variant) => variant.id)).size !== report.variants.length) context.addIssue({ code: 'custom', path: ['variants'], message: 'variant ids must be unique' });
  const structural = new Set(report.variants.map((variant) => variant.structuralSignature));
  const behavior = new Set(report.variants.map((variant) => variant.behaviorSignature));
  const pacing = new Set(report.variants.map((variant) => variant.pacingSignature));
  if (report.passed && structural.size === 1 && behavior.size === 1 && pacing.size === 1) context.addIssue({ code: 'custom', message: 'passed profile variation must differ structurally, behaviorally or in pacing' });
});
export type ProfileVariation = z.infer<typeof ProfileVariationSchema>;
