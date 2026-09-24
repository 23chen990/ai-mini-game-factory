import { z } from 'zod';

const Text = z.string().trim().min(1);
const AbsolutePath = Text.refine((value) => value.startsWith('/'), 'path must be absolute');
const RunRelativePath = Text.refine((value) => !value.startsWith('/') && !value.split(/[\\/]/u).includes('..'), 'path must stay inside the owning run');

export const ReferenceQualityAuditDispositionSchema = z.enum([
  'READY_FOR_STANDARD_RESUME',
  'REQUIRES_NEW_RUN_MIGRATION',
  'BLOCKED_EVIDENCE',
  'BLOCKED_CONTROL_PLANE',
  'REQUIRES_QUALITY_RETEST',
  'CORE_DEMO_ACCEPTED',
]);
export type ReferenceQualityAuditDisposition = z.infer<typeof ReferenceQualityAuditDispositionSchema>;

export const ReferenceQualityArtifactStatusSchema = z.enum([
  'PENDING',
  'MISSING',
  'INVALID',
  'STALE',
  'READY',
  'PASSED',
  'BLOCKED',
  'ACCEPTED',
]);
export type ReferenceQualityArtifactStatus = z.infer<typeof ReferenceQualityArtifactStatusSchema>;

export const ReferenceQualityArtifactCheckSchema = z.object({
  id: z.enum([
    'reference-behavior-analysis',
    'reference-fidelity-contract',
    'product-experience-contract',
    'reference-fidelity-gate',
    'perceptual-qa-gate',
    'core-demo-acceptance',
  ]),
  path: RunRelativePath,
  requiredNow: z.boolean(),
  status: ReferenceQualityArtifactStatusSchema,
  blockers: z.array(Text),
}).strict().superRefine((check, context) => {
  if (check.status === 'PENDING' && check.requiredNow) {
    context.addIssue({ code: 'custom', path: ['status'], message: 'a required artifact cannot remain pending' });
  }
  if (['MISSING', 'INVALID', 'STALE', 'BLOCKED'].includes(check.status) && check.blockers.length === 0) {
    context.addIssue({ code: 'custom', path: ['blockers'], message: 'failed artifact checks require blockers' });
  }
  if (['PENDING', 'READY', 'PASSED', 'ACCEPTED'].includes(check.status) && check.blockers.length > 0) {
    context.addIssue({ code: 'custom', path: ['blockers'], message: 'successful or pending artifact checks cannot retain blockers' });
  }
});
export type ReferenceQualityArtifactCheck = z.infer<typeof ReferenceQualityArtifactCheckSchema>;

const BootstrapFileSchema = z.object({
  path: RunRelativePath,
  status: z.enum(['MISSING', 'INVALID', 'STALE', 'VALID']),
  blockers: z.array(Text),
}).strict();

export const ReferenceQualityAuditSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('reference-quality-audit'),
  targetRunId: Text,
  targetGame: Text,
  targetWorkspace: AbsolutePath,
  runRoot: AbsolutePath,
  checkedAt: z.string().datetime(),
  evidence: z.object({
    manifestPath: RunRelativePath,
    status: z.enum(['MISSING', 'INVALID', 'BLOCKED', 'VERIFIED']),
    relevantEntryCount: z.number().int().nonnegative(),
    verifiedRelevantEntryCount: z.number().int().nonnegative(),
    quarantinedEntryCount: z.number().int().nonnegative(),
    purposeCounts: z.object({
      gameplayReference: z.number().int().nonnegative(),
      designDocument: z.number().int().nonnegative(),
      platformQa: z.number().int().nonnegative(),
      packageIdentity: z.number().int().nonnegative(),
      other: z.number().int().nonnegative(),
    }).strict(),
    blockers: z.array(Text),
  }).strict(),
  bootstrap: z.object({
    status: z.enum(['CANONICAL', 'INCOMPLETE', 'INVALID', 'STALE']),
    files: z.array(BootstrapFileSchema).length(3),
    blockers: z.array(Text),
  }).strict(),
  permissionManifest: z.object({
    path: RunRelativePath,
    status: z.enum(['MISSING', 'INVALID', 'STALE', 'CURRENT']),
    blockers: z.array(Text),
  }).strict(),
  build: z.object({
    path: RunRelativePath,
    requiredNow: z.boolean(),
    status: z.enum(['PENDING', 'MISSING', 'INVALID', 'BLOCKED', 'READY']),
    buildHash: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
    blockers: z.array(Text),
  }).strict().superRefine((build, context) => {
    if (build.status === 'READY' && !build.buildHash) context.addIssue({ code: 'custom', path: ['buildHash'], message: 'a ready build requires its computed hash' });
    if (build.status === 'PENDING' && build.requiredNow) context.addIssue({ code: 'custom', path: ['status'], message: 'a required build cannot remain pending' });
    if (['MISSING', 'INVALID', 'BLOCKED'].includes(build.status) && build.blockers.length === 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'failed build checks require blockers' });
    if (['PENDING', 'READY'].includes(build.status) && build.blockers.length > 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'pending or ready builds cannot retain blockers' });
  }),
  contracts: z.array(ReferenceQualityArtifactCheckSchema).length(6),
  disposition: ReferenceQualityAuditDispositionSchema,
  summary: z.object({
    standardResumeSafe: z.boolean(),
    migrationRequired: z.boolean(),
    completionClaimAllowed: z.boolean(),
  }).strict(),
  blockers: z.array(Text),
  nextActions: z.array(Text).min(1),
  generatedWorkspaceModified: z.literal(false),
}).strict().superRefine((report, context) => {
  const nonBlocking = report.disposition === 'READY_FOR_STANDARD_RESUME' || report.disposition === 'CORE_DEMO_ACCEPTED';
  if (nonBlocking !== (report.blockers.length === 0)) {
    context.addIssue({ code: 'custom', path: ['blockers'], message: 'audit disposition must match blocker presence' });
  }
  if (report.summary.migrationRequired !== (report.disposition === 'REQUIRES_NEW_RUN_MIGRATION')) {
    context.addIssue({ code: 'custom', path: ['summary', 'migrationRequired'], message: 'migration summary must match disposition' });
  }
  if (report.summary.completionClaimAllowed !== (report.disposition === 'CORE_DEMO_ACCEPTED')) {
    context.addIssue({ code: 'custom', path: ['summary', 'completionClaimAllowed'], message: 'completion is allowed only after the bound core demo is accepted' });
  }
  if (report.evidence.status === 'VERIFIED' && report.evidence.verifiedRelevantEntryCount === 0) {
    context.addIssue({ code: 'custom', path: ['evidence', 'verifiedRelevantEntryCount'], message: 'verified evidence requires at least one relevant entry' });
  }
});
export type ReferenceQualityAudit = z.infer<typeof ReferenceQualityAuditSchema>;
