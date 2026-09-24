import { z } from 'zod';
import { DistributionPlatformSchema } from './factory-operating.js';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);

export const LiveVerificationChecksSchema = z.object({
  startup: z.boolean(),
  coreLoop: z.boolean(),
  terminalState: z.boolean(),
  replay: z.boolean(),
  adFallback: z.boolean(),
  rewardIdempotency: z.boolean(),
  saveRestore: z.boolean(),
  telemetry: z.boolean(),
  noConsoleErrors: z.boolean().default(true),
  packageHashMatch: z.boolean().default(true),
}).strict();
export type LiveVerificationChecks = z.infer<typeof LiveVerificationChecksSchema>;
export type LiveVerificationChecksInput = z.input<typeof LiveVerificationChecksSchema>;

export const LiveVerificationSchema = z.object({
  schemaVersion: z.literal(1),
  gameId: Text,
  platform: DistributionPlatformSchema,
  releaseHash: Sha256,
  packageHash: Sha256.optional(),
  checks: LiveVerificationChecksSchema,
  evidence: z.array(Text),
  blockers: z.array(Text),
  status: z.enum(['LIVE_VERIFIED', 'BLOCKED']),
  verifiedAt: z.string().datetime(),
  verifier: Text,
}).strict().superRefine((report, context) => {
  if (report.status === 'LIVE_VERIFIED' && (report.blockers.length > 0 || report.evidence.length === 0)) {
    context.addIssue({ code: 'custom', message: 'LIVE_VERIFIED requires evidence and zero blockers' });
  }
  if (report.status === 'BLOCKED' && report.blockers.length === 0) {
    context.addIssue({ code: 'custom', path: ['blockers'], message: 'blocked live verification requires blockers' });
  }
  if (report.packageHash && report.packageHash !== report.releaseHash) {
    context.addIssue({ code: 'custom', path: ['packageHash'], message: 'package hash must match the tested release hash' });
  }
});
export type LiveVerification = z.infer<typeof LiveVerificationSchema>;
