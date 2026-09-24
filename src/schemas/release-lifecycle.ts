import { z } from 'zod';

const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);
export const ReleaseLifecycleStatusSchema = z.enum(['IMPLEMENTATION_READY', 'CANDIDATE_READY', 'RELEASE_READY', 'SUBMITTED', 'LIVE_VERIFIED', 'PAUSED', 'KILLED']);
export type ReleaseLifecycleStatus = z.infer<typeof ReleaseLifecycleStatusSchema>;
export const ReleaseLifecycleSchema = z.object({
  schemaVersion: z.literal(1),
  gameId: z.string().trim().min(1),
  releaseHash: Sha256,
  status: ReleaseLifecycleStatusSchema,
  history: z.array(z.object({ from: ReleaseLifecycleStatusSchema.nullable(), to: ReleaseLifecycleStatusSchema, releaseHash: Sha256, at: z.string().datetime() }).strict()).min(1),
  updatedAt: z.string().datetime(),
}).strict();
export type ReleaseLifecycle = z.infer<typeof ReleaseLifecycleSchema>;
