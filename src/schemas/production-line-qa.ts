import { z } from 'zod';
import { ProductionLineDecisionLineSchema } from './production-line.js';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);
const Profile = z.enum(['ACTION_FEEL', 'NARRATIVE_AGENCY', 'STRATEGIC_SYSTEM', 'PUZZLE_CLARITY']);

export const ProductionLinePlayStepSchema = z.object({
  id: Text,
  label: Text,
  requiredEvidence: z.array(Text).min(1),
  /** Profile dimension this step is intended to prove. */
  dimensionId: Text.optional(),
  order: z.number().int().positive(),
}).strict();
export type ProductionLinePlayStep = z.infer<typeof ProductionLinePlayStepSchema>;

export const ProductionLinePlayPlanSchema = z.object({
  schemaVersion: z.literal(1),
  line: ProductionLineDecisionLineSchema,
  profile: Profile,
  steps: z.array(ProductionLinePlayStepSchema).min(3),
  requiredEvidence: z.array(Text).min(2),
  forbiddenOperations: z.array(Text).default(['loadScenario', 'setState', 'grantCurrency', 'teleport', 'direct-state-mutation']),
  generatedAt: z.string().datetime(),
}).strict().superRefine((plan, context) => {
  const ids = plan.steps.map((step) => step.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['steps'], message: 'representative play step ids must be unique' });
  if (ids.some((_, index) => plan.steps[index + 1] && plan.steps[index + 1]!.order <= plan.steps[index]!.order)) context.addIssue({ code: 'custom', path: ['steps'], message: 'representative play steps must be ordered' });
});
export type ProductionLinePlayPlan = z.infer<typeof ProductionLinePlayPlanSchema>;

export const ProductionLinePlayStepObservationSchema = z.object({
  id: Text,
  passed: z.boolean(),
  evidence: z.array(Text).min(1),
}).strict();

export const ProductionLinePlayEvidenceSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  line: ProductionLineDecisionLineSchema,
  buildHash: Sha256,
  naturalInput: z.boolean(),
  steps: z.array(ProductionLinePlayStepObservationSchema),
  forbiddenOperations: z.array(Text).default([]),
}).strict();
export type ProductionLinePlayEvidence = z.infer<typeof ProductionLinePlayEvidenceSchema>;

export const ProductionLinePlayEvaluationSchema = z.object({
  schemaVersion: z.literal(1),
  line: ProductionLineDecisionLineSchema,
  profile: Profile,
  buildHash: Sha256.optional(),
  passed: z.boolean(),
  blockers: z.array(Text),
  observedSteps: z.array(Text),
  checkedAt: z.string().datetime(),
}).strict();
export type ProductionLinePlayEvaluation = z.infer<typeof ProductionLinePlayEvaluationSchema>;
