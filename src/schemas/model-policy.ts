import { z } from 'zod';

const Text = z.string().trim().min(1);
export const ModelFailureKindSchema = z.enum(['TRANSIENT', 'SPEC_ERROR', 'TOOL_ERROR', 'CAPABILITY_ERROR', 'POLICY_BLOCK']);
export type ModelFailureKind = z.infer<typeof ModelFailureKindSchema>;
export const ModelPolicySnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  policyVersion: Text,
  signature: Text,
  stages: z.array(z.object({
    stage: z.string().trim().min(1),
    tier: z.enum(['frontier', 'builder', 'reviewer', 'fast']),
    model: Text,
    reasoning: z.enum(['low', 'medium', 'high', 'max']),
    sandbox: z.enum(['read-only', 'workspace-write']),
    role: z.enum(['research', 'producer', 'builder', 'fixer', 'reviewer', 'evidence-helper', 'release']),
    maxInputChars: z.number().int().positive(),
    handoffMaxChars: z.number().int().positive(),
  }).strict()).min(1),
  generatedAt: z.string().datetime(),
}).strict().superRefine((snapshot, context) => {
  const stages = snapshot.stages.map((item) => item.stage);
  if (new Set(stages).size !== stages.length) context.addIssue({ code: 'custom', path: ['stages'], message: 'model policy stages must be unique' });
});
export type ModelPolicySnapshot = z.infer<typeof ModelPolicySnapshotSchema>;

export const ModelRouteDecisionSchema = z.object({
  schemaVersion: z.literal(1),
  stage: Text,
  attempt: z.number().int().positive(),
  failureKind: ModelFailureKindSchema,
  base: z.object({ tier: z.enum(['frontier', 'builder', 'reviewer', 'fast']), model: Text, reasoning: z.enum(['low', 'medium', 'high', 'max']), role: z.enum(['research', 'producer', 'builder', 'fixer', 'reviewer', 'evidence-helper', 'release']), sandbox: z.enum(['read-only', 'workspace-write']) }).strict(),
  selected: z.object({ tier: z.enum(['frontier', 'builder', 'reviewer', 'fast']), model: Text, reasoning: z.enum(['low', 'medium', 'high', 'max']), role: z.enum(['research', 'producer', 'builder', 'fixer', 'reviewer', 'evidence-helper', 'release']), sandbox: z.enum(['read-only', 'workspace-write']) }).strict(),
  rationale: Text,
  createdAt: z.string().datetime(),
}).strict();
export type ModelRouteDecision = z.infer<typeof ModelRouteDecisionSchema>;
