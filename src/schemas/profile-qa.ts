import { z } from 'zod';
import { PrimaryExperienceProfileSchema } from './experience-profile.js';
import { ProductionLineDecisionLineSchema } from './production-line.js';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);
export const ProfileQaCheckSchema = z.object({ id: Text, passed: z.boolean(), evidence: Text, dimensionId: Text.optional(), evidenceRefs: z.array(Text).min(1).optional() }).strict();
export type ProfileQaCheck = z.infer<typeof ProfileQaCheckSchema>;
export const ProfileQaReportSchema = z.object({
  schemaVersion: z.literal(1),
  gameId: Text,
  buildHash: Sha256,
  profile: PrimaryExperienceProfileSchema,
  /** Locked production line used to select the specialist evidence bundle. */
  productionLine: ProductionLineDecisionLineSchema.optional(),
  linePlanPath: Text.optional(),
  lineEvaluationPath: Text.optional(),
  requiredDimensions: z.array(Text).min(2),
  checks: z.array(ProfileQaCheckSchema),
  passed: z.boolean(),
  blockers: z.array(Text),
  testedAt: z.string().datetime(),
}).strict().superRefine((report, context) => {
  if (report.passed && report.blockers.length > 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'passed profile QA cannot retain blockers' });
  if (report.passed && report.checks.some((check) => !check.passed)) context.addIssue({ code: 'custom', path: ['checks'], message: 'passed profile QA cannot contain failed checks' });
});
export type ProfileQaReport = z.infer<typeof ProfileQaReportSchema>;
