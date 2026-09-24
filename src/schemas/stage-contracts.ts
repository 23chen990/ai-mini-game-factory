import { z } from 'zod';

const Text = z.string().trim().min(1);
export const StageRoleSchema = z.enum(['ResearchAgent', 'ProducerAgent', 'BuilderAgent', 'FixerAgent', 'QAAgent', 'ReleaseAgent', 'HumanReviewer', 'FactoryControlPlane']);
export type StageRole = z.infer<typeof StageRoleSchema>;

export const StageArtifactSpecSchema = z.object({
  path: Text,
  schema: Text,
  /** Version of the artifact schema expected at this boundary. */
  artifactVersion: z.number().int().positive().default(1),
  required: z.boolean(),
  trust: z.enum(['trusted', 'untrusted-sanitized', 'human-attested', 'generated']),
}).strict();
export type StageArtifactSpec = z.infer<typeof StageArtifactSpecSchema>;

export const StageEvidenceSpecSchema = z.object({
  id: Text,
  description: Text,
  verifier: z.enum(['deterministic', 'independent-agent', 'human']),
  required: z.boolean(),
}).strict();
export type StageEvidenceSpec = z.infer<typeof StageEvidenceSpecSchema>;

export const StageFailureRouteSchema = z.object({
  stage: Text,
  classes: z.array(Text).min(1),
  rationale: Text,
}).strict();
export type StageFailureRoute = z.infer<typeof StageFailureRouteSchema>;

export const StageRetryPolicySchema = z.object({
  maxAttempts: z.number().int().positive().nullable().default(1),
  /** True when the stage has no fixed attempt-count ceiling. */
  unboundedUntilPass: z.boolean().default(false),
  retryableClasses: z.array(Text).default([]),
  preserveOutputs: z.boolean().default(false),
  backoffSeconds: z.number().int().nonnegative().max(300).default(0),
}).strict();
export type StageRetryPolicy = z.infer<typeof StageRetryPolicySchema>;

export const StageSideEffectsSchema = z.object({
  workspaceWrite: z.boolean().default(false),
  externalNetwork: z.boolean().default(false),
  externalUpload: z.boolean().default(false),
  publish: z.boolean().default(false),
  idempotent: z.boolean().default(true),
}).strict();
export type StageSideEffects = z.infer<typeof StageSideEffectsSchema>;

export const StageContractSchema = z.object({
  schemaVersion: z.literal(1),
  stage: Text,
  purpose: Text,
  ownerRole: StageRoleSchema,
  allowedModelTiers: z.array(z.enum(['frontier', 'builder', 'reviewer', 'fast'])).min(1),
  mutationScope: z.enum(['none', 'research-artifacts-only', 'design-artifacts-only', 'game-workspace', 'qa-artifacts-only', 'release-artifacts-only', 'run-metadata']),
  inputs: z.array(StageArtifactSpecSchema),
  outputs: z.array(StageArtifactSpecSchema),
  evidenceRequired: z.array(StageEvidenceSpecSchema).min(1),
  passCriteria: z.array(Text).min(1),
  failureRoute: StageFailureRouteSchema,
  maxAttempts: z.number().int().positive().nullable(),
  verifierRole: StageRoleSchema.default('FactoryControlPlane'),
  retryPolicy: StageRetryPolicySchema.default({ maxAttempts: 1, unboundedUntilPass: false, retryableClasses: [], preserveOutputs: false, backoffSeconds: 0 }),
  sideEffects: StageSideEffectsSchema.default({ workspaceWrite: false, externalNetwork: false, externalUpload: false, publish: false, idempotent: true }),
  contextBudgetChars: z.number().int().positive(),
  approvalRequired: z.boolean(),
  idempotencyKey: Text,
}).strict().superRefine((contract, context) => {
  if (contract.inputs.length === 0) context.addIssue({ code: 'custom', path: ['inputs'], message: 'stage contracts require at least one declared input' });
  if (contract.outputs.length === 0) context.addIssue({ code: 'custom', path: ['outputs'], message: 'stage contracts require at least one declared output' });
  if (!contract.evidenceRequired.some((item) => item.required)) context.addIssue({ code: 'custom', path: ['evidenceRequired'], message: 'stage contracts require at least one required evidence rule' });
});
export type StageContract = z.infer<typeof StageContractSchema>;

export const StageEvidenceResultSchema = z.object({
  stage: Text,
  passed: z.boolean(),
  missing: z.array(Text),
  observedArtifacts: z.array(Text),
  observedEvidence: z.array(Text),
  artifactVersions: z.record(z.string(), z.number().int().positive()).default({}),
  failureRoute: StageFailureRouteSchema.optional(),
}).strict();
export type StageEvidenceResult = z.infer<typeof StageEvidenceResultSchema>;

/** Durable audit record emitted when a stage is started/completed. */
export const StageContractAuditSchema = z.object({
  schemaVersion: z.literal(1),
  stage: Text,
  passed: z.boolean(),
  /** Declared owner and independent verifier are copied into every new audit.
   * Optional defaults preserve readability of audits written by pre-contract
   * versions; strict release evaluation rejects records that omit them. */
  ownerRole: StageRoleSchema.optional(),
  verifierRole: StageRoleSchema.optional(),
  verifiedByRole: StageRoleSchema.optional(),
  independent: z.boolean().optional(),
  checkedAt: z.string().datetime(),
  missing: z.array(Text),
  observedInputs: z.array(Text),
  observedArtifacts: z.array(Text),
  observedEvidence: z.array(Text),
  artifactVersions: z.record(z.string(), z.number().int().positive()).default({}),
  failureRoute: StageFailureRouteSchema,
}).strict();
export type StageContractAudit = z.infer<typeof StageContractAuditSchema>;

/** Coverage report for the contract registry. Fallback contracts are useful
 * for legacy state recovery, but must be visible and can be blocked for a
 * production plan. */
export const StageContractRegistryReportSchema = z.object({
  schemaVersion: z.literal(1),
  checkedStages: z.array(Text).min(1),
  explicitStages: z.array(Text),
  fallbackStages: z.array(Text),
  passed: z.boolean(),
  checkedAt: z.string().datetime(),
}).strict();
export type StageContractRegistryReport = z.infer<typeof StageContractRegistryReportSchema>;
