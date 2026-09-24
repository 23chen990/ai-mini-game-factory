import { z } from 'zod';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);

export const ArtifactLedgerEntrySchema = z.object({
  path: Text,
  sha256: Sha256,
  producerStage: Text,
  inputHashes: z.record(Text, Sha256),
  status: z.enum(['VALID', 'INVALIDATED']),
  invalidatedBy: z.array(Text),
  recordedAt: z.string().datetime(),
}).strict();
export type ArtifactLedgerEntry = z.infer<typeof ArtifactLedgerEntrySchema>;

export const ArtifactLedgerSchema = z.object({ schemaVersion: z.literal(1), entries: z.array(ArtifactLedgerEntrySchema), updatedAt: z.string().datetime() }).strict().superRefine((ledger, context) => {
  const paths = ledger.entries.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) context.addIssue({ code: 'custom', path: ['entries'], message: 'artifact paths must be unique' });
});
export type ArtifactLedger = z.infer<typeof ArtifactLedgerSchema>;
