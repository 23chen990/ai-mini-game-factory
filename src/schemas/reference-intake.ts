import { z } from 'zod';
import { isSafeExternalResearchUrl } from '../core/research-evidence.js';
import { HumanReferenceDecisionSchema, ReferenceMechanicSpecSchema } from './reference-mechanic.js';
import { ReferenceBehaviorAnalysisSchema } from './reference-evidence.js';

const Text = z.string().trim().min(1);

/** Discovery is not a human mechanic lock and cannot authorize a Builder. */
export const ReferenceIntakeBriefSchema = z.object({
  schemaVersion: z.literal(1),
  title: Text,
  theme: Text,
  source: z.object({ name: Text, url: z.url().refine(isSafeExternalResearchUrl, 'reference URL must be public HTTPS').optional() }).strict(),
}).strict();
export type ReferenceIntakeBrief = z.infer<typeof ReferenceIntakeBriefSchema>;

const Sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
export const ReferenceIntakeEvidenceSchema = z.object({
  schemaVersion: z.literal(1), targetRunId: Text, inputHash: Sha256,
  brief: ReferenceIntakeBriefSchema,
  sources: z.array(z.object({ path: Text, sha256: Sha256, excerpt: z.string() }).strict()).min(1),
}).strict();
export type ReferenceIntakeEvidence = z.infer<typeof ReferenceIntakeEvidenceSchema>;

export const ReferenceIntakeDraftSchema = z.object({
  schemaVersion: z.literal(1), targetRunId: Text, inputHash: Sha256,
  /** Null means this factory needs a new production line, never a forced idle game. */
  suggestedTemplate: z.enum(['idle-shop-v1', 'cut-stack-dodge-v1']).nullable(),
  mechanics: ReferenceMechanicSpecSchema.omit({ lockedBy: true, source: true }).nullable(),
  analysis: ReferenceBehaviorAnalysisSchema,
}).strict();
export type ReferenceIntakeDraft = z.infer<typeof ReferenceIntakeDraftSchema>;

export const ReferenceIntakeApprovalSchema = HumanReferenceDecisionSchema.extend({
  intakeInputHash: Sha256,
  intakeDraftSha256: Sha256,
});
