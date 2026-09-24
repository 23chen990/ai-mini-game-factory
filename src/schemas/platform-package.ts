import { z } from 'zod';
import { DistributionPlatformSchema } from './factory-operating.js';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);

export const PlatformPackageStatusSchema = z.enum(['PLANNED', 'BLOCKED', 'READY', 'RELEASED']);
export type PlatformPackageStatus = z.infer<typeof PlatformPackageStatusSchema>;

export const PlatformPackageSchema = z.object({
  platform: DistributionPlatformSchema,
  /** Defaults to true for legacy package sets that had no optional-target
   * concept. */
  required: z.boolean().default(true),
  status: PlatformPackageStatusSchema,
  adapterPath: Text,
  configPath: Text,
  packagePath: Text,
  /** Each child is isolated under its own immutable root. */
  childRoot: Text.optional(),
  buildTool: Text,
  artifactHash: Sha256.nullable(),
  coreHash: Sha256,
  device: z.object({ name: Text, width: z.number().int().positive(), height: z.number().int().positive(), os: Text }).strict().optional(),
  evidence: z.array(Text),
  normalFlowEvidence: z.array(Text).default([]),
  visualEvidence: z.array(Text).default([]),
  runtimeEvidence: z.array(Text).default([]),
  blockers: z.array(Text),
  generatedAt: z.string().datetime(),
}).strict().superRefine((pkg, context) => {
  if (pkg.childRoot) {
    const normalized = pkg.childRoot.replaceAll('\\', '/');
    if (normalized.startsWith('/') || normalized.split('/').some((part) => part === '..')) {
      context.addIssue({ code: 'custom', path: ['childRoot'], message: 'childRoot must be a relative non-traversal path' });
    }
  }
  if (['READY', 'RELEASED'].includes(pkg.status)) {
    if (!pkg.artifactHash) context.addIssue({ code: 'custom', path: ['artifactHash'], message: 'ready package requires an artifact hash' });
    if (!pkg.device) context.addIssue({ code: 'custom', path: ['device'], message: 'ready package requires target device evidence' });
    if (pkg.evidence.length === 0) context.addIssue({ code: 'custom', path: ['evidence'], message: 'ready package requires evidence' });
    if (pkg.blockers.length > 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'ready package cannot retain blockers' });
  }
  if (pkg.status === 'BLOCKED' && pkg.blockers.length === 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'blocked package requires a blocker' });
});
export type PlatformPackage = z.infer<typeof PlatformPackageSchema>;

export const PlatformPackageSetSchema = z.object({
  schemaVersion: z.literal(1),
  gameId: Text,
  coreHash: Sha256,
  requiredPlatforms: z.array(DistributionPlatformSchema).min(1),
  optionalPlatforms: z.array(DistributionPlatformSchema).default([]),
  packages: z.array(PlatformPackageSchema).min(1),
  generatedAt: z.string().datetime(),
}).strict().superRefine((set, context) => {
  const required = new Set(set.requiredPlatforms);
  const actual = new Set(set.packages.map((pkg) => pkg.platform));
  if (required.size !== set.requiredPlatforms.length) context.addIssue({ code: 'custom', path: ['requiredPlatforms'], message: 'required platforms must be unique' });
  for (const platform of required) if (!actual.has(platform)) context.addIssue({ code: 'custom', path: ['packages'], message: `missing package for ${platform}` });
  if (set.optionalPlatforms.some((platform) => required.has(platform))) context.addIssue({ code: 'custom', path: ['optionalPlatforms'], message: 'optional platforms must not duplicate required platforms' });
  if (actual.size !== set.packages.length) context.addIssue({ code: 'custom', path: ['packages'], message: 'packages must be unique by platform' });
});
export type PlatformPackageSet = z.infer<typeof PlatformPackageSetSchema>;
