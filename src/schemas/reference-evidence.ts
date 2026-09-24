import { z } from 'zod';
import { FailurePressureContractSchema } from './failure-pressure-contract.js';
import { ReferenceBehaviorCheckSchema } from './reference-fidelity.js';
import { ReferenceLevelReconstructionSchema } from './reference-recording.js';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);
const EvidenceClaimRefSchema = z.object({
  id: Text,
  statement: Text,
  status: z.enum(['OBSERVED', 'INFERRED', 'UNKNOWN']),
  sourceRefs: z.array(Text),
  sourceHashes: z.array(Sha256),
  confidence: z.number().min(0).max(1),
  evidence: z.array(Text),
  createdAt: z.string().datetime(),
}).strict();

export const ReferenceEvidencePackSchema = z.object({
  schemaVersion: z.literal(1),
  targetRunId: Text,
  benchmark: z.object({ name: Text, url: z.url() }).strict(),
  sourceFiles: z.array(z.object({ path: Text, sha256: Sha256, observations: z.array(Text) }).strict()),
  observations: z.array(Text),
  inferences: z.array(Text),
  unknowns: z.array(Text),
  mechanicMap: z.object({ coreLoop: z.array(Text).min(4), playerActions: z.array(Text).min(1), progressionSystems: z.array(Text).min(1), unlockRules: z.array(Text).min(1), mustPreserveMechanics: z.array(Text).default([]), feedbackCadence: z.object({ immediateSeconds: z.number().positive(), microGoalMinSeconds: z.number().positive(), microGoalMaxSeconds: z.number().positive() }).strict() }).strict(),
  behaviorChecks: z.array(ReferenceBehaviorCheckSchema).default([]),
  /** Source-bound competitor pressure analysis. Legacy packs parse with null,
   * while new preview runs require a concrete contract before Builder handoff. */
  failurePressureContract: FailurePressureContractSchema.nullable().default(null),
  expressionBoundary: z.object({ allowed: z.array(Text).min(1), forbidden: z.array(Text).min(6) }).strict(),
  similarityRedFlags: z.array(Text),
  evidenceQuality: z.enum(['supplemented', 'human-lock-only']),
  status: z.enum(['READY', 'BLOCKED']),
  /** Claim-level provenance is optional for legacy packs and required by new research runs. */
  claims: z.array(EvidenceClaimRefSchema).default([]),
  researchedAt: z.string().datetime(),
}).strict().superRefine((pack, context) => {
  const all = [...pack.observations, ...pack.inferences, ...pack.unknowns];
  if (new Set(all).size !== all.length) context.addIssue({ code: 'custom', message: 'observation, inference and unknown entries must be unique' });
  if (pack.status === 'READY' && pack.unknowns.length > 0) context.addIssue({ code: 'custom', path: ['status'], message: 'READY evidence cannot retain unknowns' });
  if (pack.status === 'BLOCKED' && pack.unknowns.length === 0 && pack.similarityRedFlags.length === 0) context.addIssue({ code: 'custom', path: ['status'], message: 'BLOCKED evidence requires an unknown or similarity red flag' });
});
export type ReferenceEvidencePack = z.infer<typeof ReferenceEvidencePackSchema>;

/** ResearchAgent output for turning bound source material into QA cases. */
export const ReferenceBehaviorAnalysisSchema = z.object({
  schemaVersion: z.literal(1),
  targetRunId: Text,
  behaviorChecks: z.array(ReferenceBehaviorCheckSchema),
  observations: z.array(Text),
  inferences: z.array(Text),
  unknowns: z.array(Text),
  failurePressureContract: FailurePressureContractSchema.nullable().default(null),
  /** Present when verified gameplay recording frames were available. Legacy
   * text-only analyses parse as null and remain supported. */
  levelReconstruction: ReferenceLevelReconstructionSchema.nullable().default(null),
  status: z.enum(['READY', 'BLOCKED']),
}).strict().superRefine((analysis, context) => {
  const dimensions = new Set(analysis.behaviorChecks.map((check) => check.dimension));
  if (analysis.status === 'READY') {
    for (const dimension of ['input_state', 'spatial_relation', 'failure_recovery', 'feedback_sequence', 'terminal_replay'] as const) {
      if (!dimensions.has(dimension)) context.addIssue({ code: 'custom', path: ['behaviorChecks'], message: `READY behavior analysis is missing dimension ${dimension}` });
    }
    if (analysis.unknowns.length > 0) context.addIssue({ code: 'custom', path: ['unknowns'], message: 'READY behavior analysis cannot retain unknowns' });
  }
  if (analysis.status === 'BLOCKED' && analysis.unknowns.length === 0) context.addIssue({ code: 'custom', path: ['unknowns'], message: 'BLOCKED behavior analysis requires an explicit unknown' });
  const ids = analysis.behaviorChecks.map((check) => check.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['behaviorChecks'], message: 'behavior check ids must be unique' });
  if (analysis.levelReconstruction && analysis.levelReconstruction.targetRunId !== analysis.targetRunId) context.addIssue({ code: 'custom', path: ['levelReconstruction', 'targetRunId'], message: 'level reconstruction target run must match behavior analysis' });
});
export type ReferenceBehaviorAnalysis = z.infer<typeof ReferenceBehaviorAnalysisSchema>;
