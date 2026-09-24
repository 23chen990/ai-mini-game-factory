import { z } from 'zod';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);

export const BlindPlaytestSchema = z.object({
  schemaVersion: z.literal(1),
  candidateHash: Sha256,
  playerId: Text,
  unfamiliar: z.literal(true),
  resetVerified: z.literal(true),
  naturalInput: z.literal(true),
  outcome: z.enum(['PASSED', 'FAILED', 'BLOCKED']),
  taskCompletionRate: z.number().min(0).max(1),
  notes: z.array(Text).min(1),
  evidence: z.array(Text).min(1),
  testedAt: z.string().datetime(),
}).strict();
export type BlindPlaytest = z.infer<typeof BlindPlaytestSchema>;
