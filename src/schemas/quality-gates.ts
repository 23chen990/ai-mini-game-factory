import { z } from 'zod';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);

/** Cross-game quality dimensions.  A production line may add specialist
 * checks, but it cannot remove one of these shared release dimensions. */
export const QUALITY_DIMENSIONS = [
  'functionality',
  'coreExperience',
  'contentDifficulty',
  'visualUx',
  'performanceCompatibility',
  'productIntegrity',
  'releaseEngineering',
] as const;
export const QualityDimensionIdSchema = z.enum(QUALITY_DIMENSIONS);
export type QualityDimensionId = z.infer<typeof QualityDimensionIdSchema>;

export const QualityGateStatusSchema = z.enum(['PASS', 'FAIL', 'UNKNOWN', 'WAIVED']);
export type QualityGateStatus = z.infer<typeof QualityGateStatusSchema>;

export const QualityGateWaiverSchema = z.object({
  reviewer: Text,
  reason: Text,
  approvedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }).optional(),
}).strict();
export type QualityGateWaiver = z.infer<typeof QualityGateWaiverSchema>;

export const QualityGateRecordSchema = z.object({
  id: QualityDimensionIdSchema,
  status: QualityGateStatusSchema,
  evidence: z.array(Text).default([]),
  blockers: z.array(Text).default([]),
  waiver: QualityGateWaiverSchema.optional(),
}).strict().superRefine((gate, context) => {
  if (gate.status === 'PASS' && gate.waiver) context.addIssue({ code: 'custom', path: ['waiver'], message: 'a passing gate cannot carry a waiver' });
  if (gate.status === 'PASS' && gate.blockers.length > 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'a passing gate cannot retain unresolved blockers' });
  if (gate.status === 'UNKNOWN' && gate.waiver) context.addIssue({ code: 'custom', path: ['waiver'], message: 'UNKNOWN must be resolved, not waived' });
  if (gate.status !== 'PASS' && gate.evidence.length === 0 && gate.blockers.length === 0) context.addIssue({ code: 'custom', message: `${gate.id} needs evidence or a blocker` });
  if (gate.status === 'WAIVED' && !gate.waiver) context.addIssue({ code: 'custom', path: ['waiver'], message: 'WAIVED requires a human-signed waiver' });
});
export type QualityGateRecord = z.infer<typeof QualityGateRecordSchema>;

export const QualityGateMatrixSchema = z.object({
  schemaVersion: z.literal(1),
  candidateHash: Sha256.optional(),
  dimensions: z.array(QualityGateRecordSchema).length(QUALITY_DIMENSIONS.length),
  passed: z.boolean(),
  blockers: z.array(QualityDimensionIdSchema),
  evaluatedAt: z.string().datetime({ offset: true }),
  evaluator: Text.default('FactoryControlPlane'),
}).strict().superRefine((matrix, context) => {
  const ids = matrix.dimensions.map((item) => item.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['dimensions'], message: 'quality dimensions must be unique' });
  for (const id of QUALITY_DIMENSIONS) if (!ids.includes(id)) context.addIssue({ code: 'custom', path: ['dimensions'], message: `missing quality dimension ${id}` });
  const expectedBlockers = matrix.dimensions.filter((item) => item.status !== 'PASS' && item.status !== 'WAIVED').map((item) => item.id);
  if (JSON.stringify(matrix.blockers) !== JSON.stringify(expectedBlockers)) context.addIssue({ code: 'custom', path: ['blockers'], message: 'blockers must list unresolved dimensions in canonical order' });
  const expectedPassed = expectedBlockers.length === 0;
  if (matrix.passed !== expectedPassed) context.addIssue({ code: 'custom', path: ['passed'], message: 'passed must be derived from dimension statuses' });
});
export type QualityGateMatrix = z.infer<typeof QualityGateMatrixSchema>;
