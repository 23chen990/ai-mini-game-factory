import { sha256Text } from './files.js';
import { DistributionPlatformSchema } from '../schemas/factory-operating.js';
import { PlatformPolicyEvaluationSchema, PlatformPolicySnapshotSchema, type PlatformPolicyEntry, type PlatformPolicySnapshot } from '../schemas/platform-policy.js';

const DEFAULT_SOURCE = 'human:verify-current-official-platform-rules';

/** Build a truthful, blocking template.  It never invents platform limits or
 * certification claims; the operator must replace the placeholders with
 * current official evidence before a production release. */
export function buildPlatformPolicyTemplate(input: {
  targets: readonly string[];
  optionalTargets?: readonly string[];
  policyId?: string;
}): PlatformPolicySnapshot {
  const targets = [...new Set(input.targets.map((target) => DistributionPlatformSchema.parse(target)))];
  const optionalTargets = [...new Set((input.optionalTargets ?? []).map((target) => DistributionPlatformSchema.parse(target)))].filter((target) => !targets.includes(target));
  const selected = [...targets, ...optionalTargets];
  const now = new Date().toISOString();
  const entries: PlatformPolicyEntry[] = selected.map((platform) => ({
    platform,
    status: 'UNVERIFIED',
    policyVersion: null,
    sourceRefs: [DEFAULT_SOURCE],
    verifiedAt: null,
    verifiedBy: null,
    accountRequirements: ['human:confirm-account-eligibility'],
    submissionRequirements: ['human:confirm-current-review-and-package-rules'],
    advertisingRequirements: ['human:confirm-current-IAA-and-privacy-rules'],
    assumptions: ['No platform rule is inferred from model knowledge.'],
    requiredActions: ['Replace this entry with current official evidence before release.'],
    notes: [],
  }));
  return PlatformPolicySnapshotSchema.parse({
    schemaVersion: 1,
    policyId: input.policyId?.trim() || 'platform-policy-v1',
    sourceKind: 'template',
    targets,
    optionalTargets,
    entries,
    generatedAt: now,
    updatedAt: now,
  });
}

export function platformPolicyHash(value: PlatformPolicySnapshot | unknown): string {
  return sha256Text(JSON.stringify(PlatformPolicySnapshotSchema.parse(value)));
}

export type PlatformPolicyCheckResult = {
  passed: boolean;
  blockers: string[];
  warnings: string[];
  snapshot?: PlatformPolicySnapshot;
};

/**
 * Evaluate a snapshot against the targets selected for this run.  Required
 * targets fail closed; optional overseas channels are reported as warnings so
 * an unprepared optional channel cannot block a domestic release.
 */
export function evaluatePlatformPolicy(value: unknown, options: {
  requiredPlatforms?: readonly string[];
  optionalPlatforms?: readonly string[];
  requireVerified?: boolean;
  requireOptionalVerified?: boolean;
} = {}): PlatformPolicyCheckResult {
  const parsed = PlatformPolicySnapshotSchema.safeParse(value);
  if (!parsed.success) return { passed: false, blockers: ['platform-policy:schema-invalid'], warnings: [] };
  const snapshot = parsed.data;
  const required = [...new Set((options.requiredPlatforms ?? snapshot.targets).map((target) => DistributionPlatformSchema.parse(target)))];
  const optional = [...new Set((options.optionalPlatforms ?? snapshot.optionalTargets).map((target) => DistributionPlatformSchema.parse(target)))].filter((target) => !required.includes(target));
  const byPlatform = new Map(snapshot.entries.map((entry) => [entry.platform, entry]));
  const blockers: string[] = [];
  const warnings: string[] = [];
  const check = (platform: string, strict: boolean) => {
    const entry = byPlatform.get(platform as PlatformPolicyEntry['platform']);
    const prefix = `${platform}:`;
    if (!entry) {
      (strict ? blockers : warnings).push(`${prefix}policy-entry-missing`);
      return;
    }
    if (entry.status === 'BLOCKED') (strict ? blockers : warnings).push(`${prefix}policy-blocked`);
    else if (entry.status === 'VERIFIED' && entry.sourceRefs.some((ref) => /^(?:human:verify|pending|replace-with)/iu.test(ref))) (strict ? blockers : warnings).push(`${prefix}direct-source-required`);
    else if (entry.status !== 'VERIFIED' && (options.requireVerified ?? false)) (strict ? blockers : warnings).push(`${prefix}policy-unverified`);
  };
  for (const platform of required) check(platform, true);
  for (const platform of optional) check(platform, options.requireOptionalVerified === true);
  return { passed: blockers.length === 0, blockers: [...new Set(blockers)], warnings: [...new Set(warnings)], snapshot };
}

/** Persistable evaluation projection with a hash of the exact snapshot. */
export function buildPlatformPolicyEvaluation(value: unknown, options: {
  requiredPlatforms?: readonly string[];
  optionalPlatforms?: readonly string[];
  requireVerified?: boolean;
  requireOptionalVerified?: boolean;
} = {}) {
  const result = evaluatePlatformPolicy(value, options);
  // Keep the evaluation artifact schema-valid even when the snapshot itself
  // is malformed.  The fallback target is only a diagnostic placeholder; the
  // schema-invalid blocker remains and strict release will stop on it.  This
  // avoids a secondary parser exception hiding the real operator action.
  const configuredRequired = options.requiredPlatforms && options.requiredPlatforms.length > 0 ? options.requiredPlatforms : undefined;
  const requiredPlatforms = [...new Set((configuredRequired ?? result.snapshot?.targets ?? ['wechat-minigame']).map((target) => DistributionPlatformSchema.parse(target)))];
  const configuredOptional = options.optionalPlatforms ?? result.snapshot?.optionalTargets ?? [];
  const optionalPlatforms = [...new Set(configuredOptional.map((target) => DistributionPlatformSchema.parse(target)))].filter((target) => !requiredPlatforms.includes(target));
  const snapshotHash = result.snapshot ? platformPolicyHash(result.snapshot) : sha256Text('platform-policy:invalid');
  return PlatformPolicyEvaluationSchema.parse({
    schemaVersion: 1,
    snapshotHash,
    requiredPlatforms,
    optionalPlatforms,
    requireVerified: options.requireVerified === true,
    passed: result.passed,
    blockers: result.blockers,
    warnings: result.warnings,
    checkedAt: new Date().toISOString(),
  });
}
