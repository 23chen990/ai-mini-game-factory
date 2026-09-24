import { z } from 'zod';
import { DependencyAllowlistEntrySchema, DependencyPolicySchema, type DependencyPolicy } from '../schemas/dependency-policy.js';
import { SupplyChainManifestSchema, type SupplyChainManifest } from '../schemas/supply-chain.js';
import { sha256Text } from './files.js';

function key(name: string, version: string): string {
  return `${name}@${version}`.trim().toLowerCase();
}

function same(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/** Build a shareable, schema-validated dependency policy. */
export function buildDependencyPolicy(input: {
  policyId: string;
  mode?: DependencyPolicy['mode'];
  entries: Array<z.input<typeof DependencyAllowlistEntrySchema>>;
  allowedSources?: string[];
}): DependencyPolicy {
  return DependencyPolicySchema.parse({
    schemaVersion: 1,
    policyId: input.policyId,
    mode: input.mode ?? 'allowlist',
    entries: input.entries,
    allowedSources: input.allowedSources ?? [],
    generatedAt: new Date().toISOString(),
  });
}

export type DependencyPolicyEvaluation = {
  passed: boolean;
  blockers: string[];
  warnings: string[];
  manifest: SupplyChainManifest | unknown;
  policy?: DependencyPolicy;
  policyHash?: string;
};

/**
 * Compare the exact dependency identities recorded by a build with a
 * human-reviewed allowlist.  This function only parses and compares data; it
 * never installs packages, follows URLs or executes lifecycle scripts.
 */
export function evaluateDependencyPolicy(
  manifestValue: unknown,
  policyValue: unknown,
  options: { required?: boolean } = {},
): DependencyPolicyEvaluation {
  const manifestParsed = SupplyChainManifestSchema.safeParse(manifestValue);
  if (!manifestParsed.success) return { passed: false, blockers: ['dependency-manifest-invalid'], warnings: [], manifest: manifestValue };
  const manifest = manifestParsed.data;
  if (policyValue === undefined || policyValue === null) {
    return options.required === true
      ? { passed: false, blockers: ['dependency-policy-missing'], warnings: [], manifest }
      : { passed: true, blockers: [], warnings: ['dependency-policy-not-configured'], manifest };
  }
  const policyParsed = DependencyPolicySchema.safeParse(policyValue);
  if (!policyParsed.success) return { passed: false, blockers: ['dependency-policy-invalid'], warnings: [], manifest };
  const policy = policyParsed.data;
  const entries = new Map(policy.entries.map((entry) => [key(entry.name, entry.version), entry]));
  const blockers: string[] = [];
  const warnings: string[] = [];
  for (const dependency of manifest.dependencies) {
    const identity = key(dependency.name, dependency.version);
    const entry = entries.get(identity);
    if (!entry) {
      const issue = `dependency-not-allowlisted:${identity}`;
      if (policy.mode === 'allowlist' || options.required === true) blockers.push(issue);
      else warnings.push(issue);
      continue;
    }
    if (!dependency.license || /^unknown$/iu.test(dependency.license) || !entry.license || /^unknown$/iu.test(entry.license)) blockers.push(`dependency-license-unverified:${identity}`);
    if (!same(entry.license, dependency.license)) blockers.push(`dependency-license-mismatch:${identity}`);
    const sourceAllowed = same(entry.source, dependency.source) || policy.allowedSources.some((source) => same(source, dependency.source));
    if (!sourceAllowed) blockers.push(`dependency-source-mismatch:${identity}`);
    if (!dependency.licenseEvidence) blockers.push(`dependency-license-evidence-missing:${identity}`);
    if (entry.sha256 !== undefined && entry.sha256 !== dependency.sha256) blockers.push(`dependency-hash-mismatch:${identity}`);
    if (dependency.installScript) blockers.push(`dependency-install-script:${identity}`);
  }
  // A manifest may contain no dependencies in a malformed or unexpectedly
  // stripped build.  The SBOM schema allows an empty list for compatibility,
  // but an allowlist policy should make that fact visible to the operator.
  if (manifest.dependencies.length === 0) warnings.push('dependency-manifest-empty');
  return {
    passed: blockers.length === 0,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    manifest,
    policy,
    policyHash: sha256Text(JSON.stringify(policy)),
  };
}
