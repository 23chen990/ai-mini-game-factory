import { z } from 'zod';

export const QualityBaselineCheckIdSchema = z.enum([
  'cold-start',
  'no-console-errors',
  'save-restore',
  'responsive-360',
  'responsive-390',
  'responsive-430',
  'ad-contract',
  'anti-addiction',
  'package-budget',
  'natural-play',
]);
export type QualityBaselineCheckId = z.infer<typeof QualityBaselineCheckIdSchema>;

export const QualityBaselineCheckSchema = z.object({
  id: QualityBaselineCheckIdSchema,
  passed: z.boolean(),
  evidence: z.array(z.string().trim().min(1)).min(1),
  owner: z.enum(['deterministic', 'QAAgent', 'HumanReviewer']),
  notes: z.string().trim().min(1).optional(),
}).strict();
export type QualityBaselineCheck = z.infer<typeof QualityBaselineCheckSchema>;

export const QualityBaselineReportSchema = z.object({
  schemaVersion: z.literal(1),
  checks: z.array(QualityBaselineCheckSchema).length(10),
  passed: z.boolean(),
  blockers: z.array(QualityBaselineCheckIdSchema),
  artifactHashes: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/u)).default({}),
  checkedAt: z.string().datetime(),
}).strict().superRefine((report, context) => {
  const ids = report.checks.map((check) => check.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['checks'], message: 'quality baseline checks must be unique' });
  const expected = QualityBaselineCheckIdSchema.options;
  if (expected.some((id) => !ids.includes(id))) context.addIssue({ code: 'custom', path: ['checks'], message: 'all cross-game baseline checks are required' });
  const blockers = expected.filter((id) => report.checks.find((check) => check.id === id)?.passed !== true);
  if (JSON.stringify(report.blockers) !== JSON.stringify(blockers)) context.addIssue({ code: 'custom', path: ['blockers'], message: 'blockers must list every failed baseline check in canonical order' });
  if (report.passed !== (blockers.length === 0)) context.addIssue({ code: 'custom', path: ['passed'], message: 'baseline passes only when all checks pass' });
});
export type QualityBaselineReport = z.infer<typeof QualityBaselineReportSchema>;
