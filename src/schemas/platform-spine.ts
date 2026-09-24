import { z } from 'zod';
import { DistributionPlatformSchema } from './factory-operating.js';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);

export const PlatformSpineAdapterSchema = z.object({
  platform: DistributionPlatformSchema,
  required: z.boolean().default(true),
  adapterPath: Text,
  configPath: Text,
  buildPath: Text,
  packageEntrypoint: Text,
  status: z.enum(['planned', 'verified', 'blocked']),
  evidence: z.array(Text),
  artifactHash: Sha256.nullable(),
}).strict().superRefine((adapter, context) => {
  if (adapter.status === 'verified' && (adapter.evidence.length === 0 || adapter.artifactHash === null)) {
    context.addIssue({ code: 'custom', message: 'verified platform adapters require evidence and a package hash' });
  }
  if (adapter.status === 'blocked' && adapter.evidence.length === 0) {
    context.addIssue({ code: 'custom', message: 'blocked platform adapters require diagnostic evidence' });
  }
});
export type PlatformSpineAdapter = z.infer<typeof PlatformSpineAdapterSchema>;

export const PlatformSpineContractSchema = z.object({
  schemaVersion: z.literal(1),
  contractId: Text,
  gameId: Text,
  runtime: z.enum(['web-lite', 'cocos-3d']),
  targetPlatforms: z.array(DistributionPlatformSchema).min(1),
  requiredPlatforms: z.array(DistributionPlatformSchema).min(1).optional(),
  optionalPlatforms: z.array(DistributionPlatformSchema).default([]),
  sharedInterfaces: z.object({
    lifecycle: z.object({ launch: z.literal(true), hideShow: z.literal(true), errorBoundary: z.literal(true) }).strict(),
    input: z.object({ normalizedActions: z.literal(true), touchSafeArea: z.literal(true), pointerFallback: z.literal(true) }).strict(),
    ads: z.object({ rewarded: z.literal(true), rewardCloseRequiresEnded: z.literal(true), frequencyCapRequired: z.literal(true), testUnitsExcludedFromRelease: z.literal(true) }).strict(),
    save: z.object({ versioned: z.literal(true), atomic: z.literal(true), restoreOnResume: z.literal(true) }).strict(),
    audio: z.object({ gestureUnlock: z.literal(true), muteControl: z.literal(true) }).strict(),
    antiAddiction: z.object({ consentGate: z.literal(true), ageGuard: z.literal(true), pauseOnLimit: z.literal(true) }).strict(),
    telemetry: z.object({ versionedEvents: z.literal(true), noPii: z.literal(true), crashBreadcrumbs: z.literal(true) }).strict(),
  }).strict(),
  invariants: z.array(Text).min(5),
  adapters: z.array(PlatformSpineAdapterSchema).min(1),
  packageBudget: z.object({ coreMaxBytes: z.number().int().positive(), perPlatformMaxBytes: z.number().int().positive(), measured: z.boolean() }).strict(),
  generatedAt: z.string().datetime(),
}).strict().superRefine((contract, context) => {
  const targets = new Set(contract.targetPlatforms);
  if (targets.size !== contract.targetPlatforms.length) context.addIssue({ code: 'custom', path: ['targetPlatforms'], message: 'targetPlatforms must be unique' });
  const adapterPlatforms = contract.adapters.map((adapter) => adapter.platform);
  if (new Set(adapterPlatforms).size !== adapterPlatforms.length) context.addIssue({ code: 'custom', path: ['adapters'], message: 'adapter platforms must be unique' });
  for (const target of targets) if (!adapterPlatforms.includes(target)) context.addIssue({ code: 'custom', path: ['adapters'], message: `missing adapter for ${target}` });
  const required = contract.requiredPlatforms ?? contract.adapters.filter((adapter) => adapter.required).map((adapter) => adapter.platform);
  if (new Set(required).size !== required.length) context.addIssue({ code: 'custom', path: ['requiredPlatforms'], message: 'required platforms must be unique' });
  if (contract.optionalPlatforms.some((platform) => required.includes(platform))) context.addIssue({ code: 'custom', path: ['optionalPlatforms'], message: 'optional platforms must not duplicate required platforms' });
  for (const invariant of ['rewarded-ad-grant-only-when-isEnded-true', 'platform-child-hash-must-match-tested-package', 'no-production-test-ad-units']) {
    if (!contract.invariants.includes(invariant)) context.addIssue({ code: 'custom', path: ['invariants'], message: `missing hard invariant ${invariant}` });
  }
});
export type PlatformSpineContract = z.infer<typeof PlatformSpineContractSchema>;
