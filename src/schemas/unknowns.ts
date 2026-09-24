import { z } from 'zod';

const Text = z.string().trim().min(1);
const DateTime = z.string().datetime();
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);

/** Risk classes that are deliberately evaluated before generic QA. */
export const UnknownClassSchema = z.enum([
  'security',
  'legal',
  'license',
  'platform',
  'core_experience',
  'performance',
  'save',
  'input',
  'monetization',
  'content',
  'operational',
  'other',
]);
export type UnknownClass = z.infer<typeof UnknownClassSchema>;

export const UnknownStatusSchema = z.enum(['OPEN', 'RESOLVED', 'WAIVED']);
export type UnknownStatus = z.infer<typeof UnknownStatusSchema>;

export const UnknownOwnerSchema = z.enum([
  'ResearchAgent',
  'ProducerAgent',
  'BuilderAgent',
  'FixerAgent',
  'QAAgent',
  'ReleaseAgent',
  'HumanReviewer',
  'FactoryControlPlane',
]);
export type UnknownOwner = z.infer<typeof UnknownOwnerSchema>;

export const UnknownWaiverSchema = z.object({
  approvedBy: z.literal('human'),
  reason: Text,
  approvedAt: DateTime,
  expiresAt: DateTime.optional(),
  /** Strict release waivers bind the exception to the exact artifact and
   * scope that was reviewed. Optional keeps old local records readable. */
  artifactHash: Sha256.optional(),
  scope: Text.optional(),
  signer: Text.optional(),
}).strict();
export type UnknownWaiver = z.infer<typeof UnknownWaiverSchema>;

export const UnknownItemSchema = z.object({
  id: Text,
  class: UnknownClassSchema,
  description: Text,
  blocking: z.boolean().default(true),
  owner: UnknownOwnerSchema,
  dueStage: Text,
  deadline: DateTime.optional(),
  status: UnknownStatusSchema.default('OPEN'),
  evidence: z.array(Text).default([]),
  waiver: UnknownWaiverSchema.optional(),
  createdAt: DateTime,
  updatedAt: DateTime,
}).strict().superRefine((item, context) => {
  if (item.status === 'RESOLVED' && item.evidence.length === 0) {
    context.addIssue({ code: 'custom', path: ['evidence'], message: 'resolved unknowns require evidence' });
  }
  if (item.status === 'WAIVED' && !item.waiver) {
    context.addIssue({ code: 'custom', path: ['waiver'], message: 'waived unknowns require a human waiver' });
  }
  if (item.status !== 'WAIVED' && item.waiver) {
    context.addIssue({ code: 'custom', path: ['waiver'], message: 'only waived unknowns may carry a waiver' });
  }
  if (!item.blocking && !item.deadline) {
    context.addIssue({ code: 'custom', path: ['deadline'], message: 'non-blocking unknowns require a deadline' });
  }
});
export type UnknownItem = z.infer<typeof UnknownItemSchema>;

export const UnknownRegisterSchema = z.object({
  schemaVersion: z.literal(1),
  runId: Text,
  items: z.array(UnknownItemSchema),
  blockingClasses: z.array(UnknownClassSchema).min(1),
  generatedAt: DateTime,
  updatedAt: DateTime,
}).strict().superRefine((register, context) => {
  const ids = register.items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['items'], message: 'unknown ids must be unique' });
});
export type UnknownRegister = z.infer<typeof UnknownRegisterSchema>;

export const UnknownEvaluationSchema = z.object({
  passed: z.boolean(),
  blocking: z.array(Text),
  unresolved: z.array(Text),
  nonBlocking: z.array(Text),
  expiredWaivers: z.array(Text),
}).strict();
export type UnknownEvaluation = z.infer<typeof UnknownEvaluationSchema>;
