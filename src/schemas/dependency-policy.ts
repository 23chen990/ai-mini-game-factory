import { z } from 'zod';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);

/** One exact dependency identity that the Builder is allowed to consume. */
export const DependencyAllowlistEntrySchema = z.object({
  name: Text,
  version: Text,
  license: Text,
  source: Text,
  licenseEvidence: Text,
  /** Optional package/archive digest.  When present it is checked exactly. */
  sha256: Sha256.optional(),
  notes: z.array(Text).default([]),
}).strict();
export type DependencyAllowlistEntry = z.infer<typeof DependencyAllowlistEntrySchema>;

/**
 * A factory-level dependency policy is deliberately separate from the
 * generated run SBOM.  The policy is human-reviewable and can be shared by
 * many runs; the manifest records what a particular build actually consumed.
 */
export const DependencyPolicySchema = z.object({
  schemaVersion: z.literal(1),
  policyId: Text,
  mode: z.enum(['allowlist', 'advisory']),
  entries: z.array(DependencyAllowlistEntrySchema),
  /** Optional exact source strings accepted for an otherwise matching entry. */
  allowedSources: z.array(Text).default([]),
  generatedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((policy, context) => {
  const keys = policy.entries.map((entry) => `${entry.name}@${entry.version}`.toLowerCase());
  if (new Set(keys).size !== keys.length) context.addIssue({ code: 'custom', path: ['entries'], message: 'dependency allowlist identities must be unique' });
  if (new Set(policy.allowedSources.map((source) => source.toLowerCase())).size !== policy.allowedSources.length) {
    context.addIssue({ code: 'custom', path: ['allowedSources'], message: 'allowed dependency sources must be unique' });
  }
});
export type DependencyPolicy = z.infer<typeof DependencyPolicySchema>;
