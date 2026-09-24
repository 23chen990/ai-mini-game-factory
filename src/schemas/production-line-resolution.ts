import { z } from 'zod';
import { ProductionLineDecisionLineSchema, ProductionLineDecisionSchema, ProductionLineSupportDecisionSchema } from './production-line.js';

const Text = z.string().trim().min(1);
const Runtime = z.enum(['web-lite', 'cocos-3d']);
const Profile = z.enum(['ACTION_FEEL', 'NARRATIVE_AGENCY', 'STRATEGIC_SYSTEM', 'PUZZLE_CLARITY', 'SOCIAL_EMOTION', 'EXPLORATION_DISCOVERY']);

export const ProductionLineResolutionSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.enum(['RESOLVED', 'BLOCKED']),
  line: ProductionLineDecisionLineSchema.nullable(),
  template: Text,
  runtime: Runtime,
  profile: Profile,
  supportDecision: ProductionLineSupportDecisionSchema,
  decision: ProductionLineDecisionSchema,
  inferredLine: ProductionLineDecisionLineSchema.nullable(),
  templateLine: ProductionLineDecisionLineSchema.nullable(),
  sources: z.array(Text).min(1),
  blockers: z.array(Text),
  resolutionHash: z.string().regex(/^[a-f0-9]{64}$/iu),
  resolvedAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  if (value.status === 'RESOLVED' && (value.line === null || value.blockers.length > 0)) {
    context.addIssue({ code: 'custom', path: ['status'], message: 'resolved production lines require a line and no blockers' });
  }
  if (value.status === 'BLOCKED' && value.blockers.length === 0) {
    context.addIssue({ code: 'custom', path: ['blockers'], message: 'blocked production lines require at least one blocker' });
  }
});

export type ProductionLineResolution = z.infer<typeof ProductionLineResolutionSchema>;
