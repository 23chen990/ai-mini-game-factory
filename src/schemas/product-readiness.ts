import { z } from 'zod';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);

export const PRODUCT_READINESS_DIMENSIONS = [
  'codeCorrectness',
  'gameplayFidelity',
  'experienceQuality',
  'monetizationReadiness',
  'platformReleaseReadiness',
] as const;

export const ProductReadinessStatusSchema = z.enum(['PASS', 'BLOCKED', 'NOT_ASSESSED', 'NEEDS_HUMAN']);
export type ProductReadinessStatus = z.infer<typeof ProductReadinessStatusSchema>;

export const ProductReadinessDimensionSchema = z.object({
  status: ProductReadinessStatusSchema,
  evidencePaths: z.array(Text),
  blockers: z.array(Text),
  requiredActions: z.array(Text),
}).strict().superRefine((dimension, context) => {
  if (dimension.status === 'PASS' && (dimension.blockers.length > 0 || dimension.requiredActions.length > 0 || dimension.evidencePaths.length === 0)) {
    context.addIssue({ code: 'custom', path: ['status'], message: 'PASS requires evidence paths and no blockers or required actions' });
  }
  if (dimension.status !== 'PASS' && dimension.blockers.length === 0) {
    context.addIssue({ code: 'custom', path: ['blockers'], message: 'non-PASS dimensions require an explicit blocker' });
  }
}).describe('One evidence-backed readiness dimension; absent evidence never becomes PASS.');
export type ProductReadinessDimension = z.infer<typeof ProductReadinessDimensionSchema>;

export const ProductCandidateStatusSchema = z.enum(['UNFROZEN', 'UNVERIFIED', 'FROZEN', 'STALE', 'INVALID', 'BLOCKED']);
export const ProductCandidateIdentitySchema = z.object({
  runId: Text,
  gameId: Text.nullable(),
  coreHash: Sha256.nullable(),
  status: ProductCandidateStatusSchema,
}).strict().superRefine((candidate, context) => {
  if (candidate.status === 'FROZEN' && (candidate.gameId === null || candidate.coreHash === null)) {
    context.addIssue({ code: 'custom', path: ['status'], message: 'FROZEN candidates require game and build identity' });
  }
});
export type ProductCandidateIdentity = z.infer<typeof ProductCandidateIdentitySchema>;

export const ProductReadinessDimensionsSchema = z.object({
  codeCorrectness: ProductReadinessDimensionSchema,
  gameplayFidelity: ProductReadinessDimensionSchema,
  experienceQuality: ProductReadinessDimensionSchema,
  monetizationReadiness: ProductReadinessDimensionSchema,
  platformReleaseReadiness: ProductReadinessDimensionSchema,
}).strict();

const OverallStatusSchema = z.enum(['READY', 'BLOCKED', 'NOT_ASSESSED', 'NEEDS_HUMAN']);
export const ProductReadinessReportSchema = z.object({
  schemaVersion: z.literal(1),
  candidate: ProductCandidateIdentitySchema,
  providerMode: z.enum(['mock', 'live-art', 'codex-account', 'unknown']),
  dimensions: ProductReadinessDimensionsSchema,
  overall: z.object({
    status: OverallStatusSchema,
    blockedDimensions: z.array(z.enum(PRODUCT_READINESS_DIMENSIONS)),
    requiredActions: z.array(Text),
  }).strict(),
}).strict().superRefine((report, context) => {
  const dimensions = PRODUCT_READINESS_DIMENSIONS.map((name) => report.dimensions[name]);
  const blockers = PRODUCT_READINESS_DIMENSIONS.filter((name) => report.dimensions[name].status === 'BLOCKED');
  const status = blockers.length > 0 ? 'BLOCKED'
    : dimensions.every((dimension) => dimension.status === 'PASS') ? 'READY'
      : dimensions.some((dimension) => dimension.status === 'NEEDS_HUMAN') ? 'NEEDS_HUMAN'
        : 'NOT_ASSESSED';
  if (report.overall.status !== status) context.addIssue({ code: 'custom', path: ['overall', 'status'], message: 'overall status must be derived from the five dimensions' });
  if (JSON.stringify(report.overall.blockedDimensions) !== JSON.stringify(blockers)) {
    context.addIssue({ code: 'custom', path: ['overall', 'blockedDimensions'], message: 'blockedDimensions must list every BLOCKED dimension in canonical order' });
  }
  const actions = [...new Set(dimensions.flatMap((dimension) => dimension.requiredActions))];
  if (JSON.stringify(report.overall.requiredActions) !== JSON.stringify(actions)) {
    context.addIssue({ code: 'custom', path: ['overall', 'requiredActions'], message: 'overall actions must be the deduplicated union of dimension actions' });
  }
});
export type ProductReadinessReport = z.infer<typeof ProductReadinessReportSchema>;
