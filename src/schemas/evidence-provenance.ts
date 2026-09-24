import { z } from 'zod';

const Text = z.string().trim().min(1);
const AbsolutePath = Text.refine((value) => value.startsWith('/'), 'path must be absolute');
const RunRelativePath = Text.refine((value) => !value.startsWith('/') && !value.split(/[\\/]/u).includes('..'), 'path must stay relative to the owning run');
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);

export const EvidenceIdentityStatusSchema = z.enum([
  'VERIFIED_TARGET',
  'UNKNOWN',
  'UNAVAILABLE',
  'MISMATCHED_UNRELATED_GAME',
]);
export type EvidenceIdentityStatus = z.infer<typeof EvidenceIdentityStatusSchema>;

export const EvidenceReviewStatusSchema = z.enum(['PENDING', 'VERIFIED', 'BLOCKED', 'EXCLUDED']);
export type EvidenceReviewStatus = z.infer<typeof EvidenceReviewStatusSchema>;

export const EvidencePurposeSchema = z.enum(['gameplay-reference', 'design-document', 'platform-qa', 'package-identity', 'other']);
export type EvidencePurpose = z.infer<typeof EvidencePurposeSchema>;

export const EvidenceProvenanceEntrySchema = z.object({
  id: Text,
  sourcePath: AbsolutePath,
  /** Durable copy inside the owning run. New evidence must use this path. */
  storedPath: RunRelativePath.optional(),
  /** Sanitized/extracted text used for analysis of binary documents. */
  analysisTextPath: RunRelativePath.optional(),
  /** Prevents platform/package diagnostics from becoming gameplay evidence. */
  purpose: EvidencePurposeSchema.default('other'),
  sha256: Sha256.nullable(),
  targetGame: Text,
  workspace: AbsolutePath,
  identityStatus: EvidenceIdentityStatusSchema,
  reviewStatus: EvidenceReviewStatusSchema,
  usableAsEvidence: z.boolean(),
  notes: z.string().trim().min(1).optional(),
}).strict().superRefine((entry, context) => {
  const verified = entry.identityStatus === 'VERIFIED_TARGET' && entry.reviewStatus === 'VERIFIED';
  if (entry.usableAsEvidence !== verified) {
    context.addIssue({ code: 'custom', path: ['usableAsEvidence'], message: 'only verified target evidence may be used' });
  }
  if (entry.identityStatus === 'VERIFIED_TARGET' && entry.sha256 === null) {
    context.addIssue({ code: 'custom', path: ['sha256'], message: 'verified evidence requires a sha256 hash' });
  }
  if (entry.identityStatus !== 'VERIFIED_TARGET' && entry.usableAsEvidence) {
    context.addIssue({ code: 'custom', path: ['identityStatus'], message: 'unverified or mismatched media cannot be evidence' });
  }
});
export type EvidenceProvenanceEntry = z.infer<typeof EvidenceProvenanceEntrySchema>;

export const EvidenceProvenanceManifestSchema = z.object({
  schemaVersion: z.literal(1),
  targetGame: Text,
  workspace: AbsolutePath,
  directories: z.object({ incoming: Text, verified: Text, excluded: Text }).strict().optional(),
  entries: z.array(EvidenceProvenanceEntrySchema),
}).strict();
export type EvidenceProvenanceManifest = z.infer<typeof EvidenceProvenanceManifestSchema>;

export const EvidenceIdentityReviewSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('evidence-identity-review'),
  reviewId: Text,
  entryId: Text,
  targetGame: Text,
  workspace: AbsolutePath,
  decision: z.literal('VERIFIED_TARGET'),
  expectedSha256: Sha256,
  actualSha256: Sha256,
  priorStoredPath: RunRelativePath,
  verifiedStoredPath: RunRelativePath,
  reviewer: Text,
  basis: Text,
  reviewedAt: z.string().datetime(),
}).strict().superRefine((review, context) => {
  if (review.expectedSha256 !== review.actualSha256) context.addIssue({ code: 'custom', path: ['actualSha256'], message: 'identity review hashes must match' });
  if (!review.verifiedStoredPath.startsWith('reference-evidence/verified/')) context.addIssue({ code: 'custom', path: ['verifiedStoredPath'], message: 'verified evidence must be stored in the verified directory' });
});
export type EvidenceIdentityReview = z.infer<typeof EvidenceIdentityReviewSchema>;
