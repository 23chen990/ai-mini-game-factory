import { z } from 'zod';
import { PrimaryExperienceProfileSchema } from './experience-profile.js';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);
const DimensionStatusSchema = z.enum(['PASS', 'PARTIAL', 'FAIL', 'UNKNOWN']);
const DimensionSchema = z.object({ status: DimensionStatusSchema, evidence: z.array(Text) }).strict();

export const PresentationQualityReportSchema = z.object({
  schemaVersion: z.literal(1),
  gameId: Text,
  buildHash: Sha256,
  profile: PrimaryExperienceProfileSchema,
  audio: DimensionSchema,
  haptics: DimensionSchema,
  animation: DimensionSchema,
  readability: DimensionSchema,
  performance: DimensionSchema.extend({ p95FrameMs: z.number().nonnegative().optional(), memoryMb: z.number().nonnegative().optional() }),
  consoleErrors: z.array(Text),
  pageErrors: z.array(Text),
  checkedAt: z.string().datetime(),
}).strict();
export type PresentationQualityReport = z.infer<typeof PresentationQualityReportSchema>;

export const PresentationQualityEvaluationSchema = z.object({
  passed: z.boolean(),
  blockers: z.array(Text),
  report: PresentationQualityReportSchema,
}).strict();
export type PresentationQualityEvaluation = z.infer<typeof PresentationQualityEvaluationSchema>;
