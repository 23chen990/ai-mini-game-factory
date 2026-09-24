import { z } from 'zod';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);

export const EvidenceClaimStatusSchema = z.enum(['OBSERVED', 'INFERRED', 'UNKNOWN']);
export type EvidenceClaimStatus = z.infer<typeof EvidenceClaimStatusSchema>;

export const EvidenceClaimSchema = z.object({
  id: Text,
  statement: Text,
  status: EvidenceClaimStatusSchema,
  sourceRefs: z.array(Text),
  sourceHashes: z.array(Sha256),
  confidence: z.number().min(0).max(1),
  evidence: z.array(Text),
  createdAt: z.string().datetime(),
}).strict().superRefine((claim, context) => {
  if (claim.status === 'OBSERVED' && claim.sourceRefs.length === 0 && claim.evidence.length === 0) {
    context.addIssue({ code: 'custom', path: ['sourceRefs'], message: 'observed claims require a source or evidence' });
  }
  if (claim.status === 'UNKNOWN' && claim.confidence !== 0) {
    context.addIssue({ code: 'custom', path: ['confidence'], message: 'unknown claims must have zero confidence' });
  }
});
export type EvidenceClaim = z.infer<typeof EvidenceClaimSchema>;

export const EvidenceClaimSetSchema = z.object({
  schemaVersion: z.literal(1),
  source: Text,
  claims: z.array(EvidenceClaimSchema),
  generatedAt: z.string().datetime(),
}).strict().superRefine((set, context) => {
  const ids = set.claims.map((claim) => claim.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['claims'], message: 'claim ids must be unique' });
});
export type EvidenceClaimSet = z.infer<typeof EvidenceClaimSetSchema>;
