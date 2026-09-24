import { z } from 'zod';
import { DistributionPlatformSchema } from './factory-operating.js';

const Text = z.string().trim().min(1);
const DateTime = z.string().datetime({ offset: true });
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);

/**
 * A platform policy is an operator-maintained snapshot, not a claim that the
 * factory knows the current rules.  Keeping it separate from the build and
 * account artifacts makes stale platform assumptions visible and reviewable.
 */
export const PlatformPolicyStatusSchema = z.enum(['UNVERIFIED', 'VERIFIED', 'BLOCKED']);
export type PlatformPolicyStatus = z.infer<typeof PlatformPolicyStatusSchema>;

export const PlatformPolicyEntrySchema = z.object({
  platform: DistributionPlatformSchema,
  status: PlatformPolicyStatusSchema,
  /** Human-readable policy/terms version or date, when the platform supplies one. */
  policyVersion: Text.nullable().default(null),
  /** Direct official URL or a run-relative evidence pointer. */
  sourceRefs: z.array(Text).min(1).max(16),
  verifiedAt: DateTime.nullable().default(null),
  verifiedBy: Text.nullable().default(null),
  accountRequirements: z.array(Text).default([]),
  submissionRequirements: z.array(Text).default([]),
  advertisingRequirements: z.array(Text).default([]),
  assumptions: z.array(Text).default([]),
  requiredActions: z.array(Text).default([]),
  notes: z.array(Text).default([]),
}).strict().superRefine((entry, context) => {
  if (entry.status === 'VERIFIED') {
    if (!entry.verifiedAt) context.addIssue({ code: 'custom', path: ['verifiedAt'], message: 'verified platform policy requires verifiedAt' });
    if (!entry.verifiedBy) context.addIssue({ code: 'custom', path: ['verifiedBy'], message: 'verified platform policy requires verifiedBy' });
    if (!entry.policyVersion) context.addIssue({ code: 'custom', path: ['policyVersion'], message: 'verified platform policy requires policyVersion' });
  }
  if (entry.status === 'BLOCKED' && entry.requiredActions.length === 0 && entry.notes.length === 0) {
    context.addIssue({ code: 'custom', path: ['notes'], message: 'blocked platform policy requires a reason or action' });
  }
});
export type PlatformPolicyEntry = z.infer<typeof PlatformPolicyEntrySchema>;

export const PlatformPolicySnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  policyId: Text,
  sourceKind: z.enum(['template', 'operator', 'official-documents']),
  targets: z.array(DistributionPlatformSchema).min(1),
  optionalTargets: z.array(DistributionPlatformSchema).default([]),
  entries: z.array(PlatformPolicyEntrySchema).min(1),
  generatedAt: DateTime,
  updatedAt: DateTime,
}).strict().superRefine((snapshot, context) => {
  if (new Set(snapshot.targets).size !== snapshot.targets.length) context.addIssue({ code: 'custom', path: ['targets'], message: 'platform policy targets must be unique' });
  if (new Set(snapshot.optionalTargets).size !== snapshot.optionalTargets.length) context.addIssue({ code: 'custom', path: ['optionalTargets'], message: 'platform policy optional targets must be unique' });
  if (snapshot.optionalTargets.some((target) => snapshot.targets.includes(target))) context.addIssue({ code: 'custom', path: ['optionalTargets'], message: 'optional targets must not duplicate required targets' });
  const selected = new Set([...snapshot.targets, ...snapshot.optionalTargets]);
  const seen = new Set<string>();
  for (const entry of snapshot.entries) {
    if (seen.has(entry.platform)) context.addIssue({ code: 'custom', path: ['entries'], message: `duplicate policy entry for ${entry.platform}` });
    seen.add(entry.platform);
    if (!selected.has(entry.platform)) context.addIssue({ code: 'custom', path: ['entries'], message: `policy entry ${entry.platform} is not a selected target` });
  }
  for (const target of snapshot.targets) if (!seen.has(target)) context.addIssue({ code: 'custom', path: ['entries'], message: `missing policy entry for ${target}` });
  for (const target of snapshot.optionalTargets) if (!seen.has(target)) context.addIssue({ code: 'custom', path: ['entries'], message: `missing optional policy entry for ${target}` });
  if (Date.parse(snapshot.updatedAt) < Date.parse(snapshot.generatedAt)) context.addIssue({ code: 'custom', path: ['updatedAt'], message: 'updatedAt cannot precede generatedAt' });
});
export type PlatformPolicySnapshot = z.infer<typeof PlatformPolicySnapshotSchema>;

export const PlatformPolicyEvaluationSchema = z.object({
  schemaVersion: z.literal(1),
  snapshotHash: Sha256,
  requiredPlatforms: z.array(DistributionPlatformSchema).min(1),
  optionalPlatforms: z.array(DistributionPlatformSchema).default([]),
  requireVerified: z.boolean(),
  passed: z.boolean(),
  blockers: z.array(Text),
  warnings: z.array(Text),
  checkedAt: DateTime,
}).strict().superRefine((evaluation, context) => {
  if (evaluation.passed && evaluation.blockers.length > 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'passed platform policy evaluation cannot contain blockers' });
});
export type PlatformPolicyEvaluation = z.infer<typeof PlatformPolicyEvaluationSchema>;
