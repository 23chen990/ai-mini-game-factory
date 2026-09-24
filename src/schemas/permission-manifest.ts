import { z } from 'zod';
import { StageNameSchema } from './stage-name.js';

const Text = z.string().trim().min(1);
const DependencyPolicySchema = z.object({
  lockfileRequired: z.boolean().default(true),
  installAllowed: z.boolean().default(false),
  lifecycleScripts: z.enum(['deny', 'approved-only']).default('deny'),
  registries: z.array(Text).default([]),
}).strict();
export type DependencyPolicy = z.infer<typeof DependencyPolicySchema>;

export const PermissionManifestSchema = z.object({
  schemaVersion: z.literal(1),
  stage: StageNameSchema,
  role: z.enum(['research', 'producer', 'builder', 'fixer', 'reviewer', 'evidence-helper', 'release']),
  sandbox: z.enum(['read-only', 'workspace-write']),
  network: z.enum(['none', 'browser-read-only']),
  canReadSecrets: z.literal(false),
  canWriteGame: z.boolean(),
  canPublish: z.literal(false),
  allowedWriteScope: z.enum(['none', 'research-artifacts', 'design-artifacts', 'qa-artifacts', 'run-metadata', 'release-artifacts', 'game-workspace']),
  /** Lexical read scopes are checked before an agent receives file content. */
  readScope: z.array(Text).min(1).default(['artifacts/']),
  /** Commands are explicit capabilities, never an arbitrary shell escape. */
  allowedCommands: z.array(Text).default([]),
  networkAllowlist: z.array(Text).default([]),
  dependencyPolicy: DependencyPolicySchema.default({ lockfileRequired: true, installAllowed: false, lifecycleScripts: 'deny', registries: [] }),
  deniedCapabilities: z.array(z.enum(['shell-arbitrary', 'secrets', 'production-publish', 'external-upload', 'cross-run-write'])).min(1),
  generatedAt: z.string().datetime(),
}).strict();
export type PermissionManifest = z.infer<typeof PermissionManifestSchema>;

/**
 * A run-level permission manifest is a closed-world inventory of stage
 * capabilities.  The bundle deliberately does not grant any capability by
 * itself; callers still evaluate the selected stage before every provider
 * operation.  Keeping the inventory in one schema makes missing or duplicated
 * stage entries detectable before an agent receives input.
 */
export const PermissionManifestBundleSchema = z.object({
  schemaVersion: z.literal(1),
  manifests: z.array(PermissionManifestSchema).min(1),
}).strict().superRefine((bundle, context) => {
  const stages = bundle.manifests.map((manifest) => manifest.stage);
  if (new Set(stages).size !== stages.length) {
    context.addIssue({ code: 'custom', path: ['manifests'], message: 'permission manifests must contain each stage at most once' });
  }
});
export type PermissionManifestBundle = z.infer<typeof PermissionManifestBundleSchema>;
