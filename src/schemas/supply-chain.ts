import { z } from 'zod';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);
const DateTime = z.string().datetime({ offset: true });

export const SupplyChainDependencySchema = z.object({
  name: Text,
  version: Text,
  source: Text,
  license: Text,
  licenseEvidence: Text.optional(),
  sha256: Sha256,
  installScript: z.string().trim().optional(),
}).strict();
export type SupplyChainDependency = z.infer<typeof SupplyChainDependencySchema>;

export const SupplyChainBuildSchema = z.object({
  sourceCommit: Sha256,
  builder: Text,
  command: Text,
  outputHash: Sha256,
}).strict();
export type SupplyChainBuild = z.infer<typeof SupplyChainBuildSchema>;

export const SupplyChainManifestSchema = z.object({
  schemaVersion: z.literal(1),
  gameId: Text,
  lockfileHash: Sha256,
  dependencies: z.array(SupplyChainDependencySchema),
  build: SupplyChainBuildSchema,
  sbomHash: Sha256.optional(),
  /** Separate, reviewable evidence files. Optional keeps v1 aggregate files
   * readable; production-created manifests populate all three links. */
  dependencyManifestHash: Sha256.optional(),
  provenanceHash: Sha256.optional(),
  dependencyManifestPath: Text.optional(),
  sbomPath: Text.optional(),
  provenancePath: Text.optional(),
  generatedAt: DateTime,
}).strict();
export type SupplyChainManifest = z.infer<typeof SupplyChainManifestSchema>;

/** Canonical dependency inventory emitted before the aggregate supply-chain
 * report. It is intentionally independent of package-manager lockfile syntax
 * so a reviewer can inspect exactly what the Builder consumed. */
export const DependencyManifestSchema = z.object({
  schemaVersion: z.literal(1),
  format: z.literal('factory-dependency-manifest-v1'),
  gameId: Text,
  lockfileHash: Sha256,
  dependencies: z.array(SupplyChainDependencySchema),
  generatedAt: DateTime,
}).strict();
export type DependencyManifest = z.infer<typeof DependencyManifestSchema>;

/** SPDX-like component inventory. This deliberately stays small and local;
 * it is not a claim that a third-party scanner was run. */
export const SbomSchema = z.object({
  schemaVersion: z.literal(1),
  format: z.literal('factory-sbom-v1'),
  gameId: Text,
  lockfileHash: Sha256,
  components: z.array(SupplyChainDependencySchema),
  generatedAt: DateTime,
}).strict();
export type Sbom = z.infer<typeof SbomSchema>;

/** Build provenance binds the source digest, lockfile, output and SBOM. */
export const BuildProvenanceSchema = z.object({
  schemaVersion: z.literal(1),
  format: z.literal('factory-build-provenance-v1'),
  gameId: Text,
  sourceCommit: Sha256,
  builder: Text,
  command: Text,
  lockfileHash: Sha256,
  outputHash: Sha256,
  sbomHash: Sha256,
  dependencyManifestHash: Sha256,
  generatedAt: DateTime,
}).strict();
export type BuildProvenance = z.infer<typeof BuildProvenanceSchema>;
