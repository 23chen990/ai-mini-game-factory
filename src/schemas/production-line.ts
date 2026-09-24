import { z } from 'zod';

const Text = z.string().trim().min(1);
export const ProductionLineDecisionLineSchema = z.enum(['single-finger-action', 'cut-stack-dodge', 'idle-management', 'choice-life', 'rule-puzzle']);
export const ProductionLineSupportDecisionSchema = z.enum(['SUPPORTED', 'HYBRID_REVIEW_REQUIRED', 'NEW_LINE_REQUIRED', 'UNSUPPORTED']);
export const ProductionLineDecisionSchema = z.object({
  schemaVersion: z.literal(1),
  supportDecision: ProductionLineSupportDecisionSchema,
  profile: z.enum(['ACTION_FEEL', 'NARRATIVE_AGENCY', 'STRATEGIC_SYSTEM', 'PUZZLE_CLARITY', 'SOCIAL_EMOTION', 'EXPLORATION_DISCOVERY']),
  line: ProductionLineDecisionLineSchema.nullable(),
  detectedSignals: z.array(Text),
  reason: Text,
}).strict().superRefine((decision, context) => {
  if (decision.supportDecision === 'NEW_LINE_REQUIRED' && decision.line !== null) context.addIssue({ code: 'custom', path: ['line'], message: 'new-line requests cannot claim an existing line' });
  if (decision.supportDecision === 'SUPPORTED' && decision.line === null) context.addIssue({ code: 'custom', path: ['line'], message: 'supported requests require a production line' });
});
export type ProductionLineDecision = z.infer<typeof ProductionLineDecisionSchema>;

/** Runtime/template compatibility evidence emitted before a Builder call. */
export const ProductionLineCapabilityReportSchema = z.object({
  schemaVersion: z.literal(1),
  line: ProductionLineDecisionLineSchema,
  template: Text,
  runtime: z.enum(['web-lite', 'cocos-3d']),
  passed: z.boolean(),
  blockers: z.array(Text),
  expectedTemplates: z.array(Text).min(1),
  implementedTemplates: z.array(Text),
  checkedAt: z.string().datetime(),
}).strict();
export type ProductionLineCapabilityReport = z.infer<typeof ProductionLineCapabilityReportSchema>;
