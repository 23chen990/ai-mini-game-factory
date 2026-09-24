import {
  BuildProvenanceSchema,
  DependencyManifestSchema,
  SbomSchema,
  SupplyChainManifestSchema,
  type BuildProvenance,
  type DependencyManifest,
  type Sbom,
  type SupplyChainDependency,
  type SupplyChainManifest,
} from '../schemas/supply-chain.js';
import { sha256Text } from './files.js';

function canonicalDependencies(value: SupplyChainDependency[]): SupplyChainDependency[] {
  return [...value].sort((left, right) => `${left.name}@${left.version}:${left.source}`.localeCompare(`${right.name}@${right.version}:${right.source}`));
}

function hashJson(value: unknown): string {
  return sha256Text(JSON.stringify(value));
}

export function buildDependencyManifest(input: {
  gameId: string;
  lockfileHash: string;
  dependencies: SupplyChainDependency[];
}): DependencyManifest {
  return DependencyManifestSchema.parse({
    schemaVersion: 1,
    format: 'factory-dependency-manifest-v1',
    gameId: input.gameId,
    lockfileHash: input.lockfileHash,
    dependencies: canonicalDependencies(input.dependencies),
    generatedAt: new Date().toISOString(),
  });
}

export function buildSbom(input: {
  gameId: string;
  lockfileHash: string;
  dependencies: SupplyChainDependency[];
}): Sbom {
  return SbomSchema.parse({
    schemaVersion: 1,
    format: 'factory-sbom-v1',
    gameId: input.gameId,
    lockfileHash: input.lockfileHash,
    components: canonicalDependencies(input.dependencies),
    generatedAt: new Date().toISOString(),
  });
}

export function buildBuildProvenance(input: {
  gameId: string;
  sourceCommit: string;
  builder: string;
  command: string;
  lockfileHash: string;
  outputHash: string;
  sbom: Sbom;
  dependencyManifest: DependencyManifest;
}): BuildProvenance {
  const sbom = SbomSchema.parse(input.sbom);
  const dependencyManifest = DependencyManifestSchema.parse(input.dependencyManifest);
  if (sbom.gameId !== input.gameId || dependencyManifest.gameId !== input.gameId) throw new Error('supply-chain evidence gameId mismatch');
  if (sbom.lockfileHash !== input.lockfileHash || dependencyManifest.lockfileHash !== input.lockfileHash) throw new Error('supply-chain evidence lockfile mismatch');
  return BuildProvenanceSchema.parse({
    schemaVersion: 1,
    format: 'factory-build-provenance-v1',
    gameId: input.gameId,
    sourceCommit: input.sourceCommit,
    builder: input.builder,
    command: input.command,
    lockfileHash: input.lockfileHash,
    outputHash: input.outputHash,
    sbomHash: hashJson(sbom),
    dependencyManifestHash: hashJson(dependencyManifest),
    generatedAt: new Date().toISOString(),
  });
}

export function buildSupplyChainManifest(input: {
  gameId: string;
  lockfileHash: string;
  dependencies: SupplyChainDependency[];
  build: SupplyChainManifest['build'];
  sbomHash?: string;
  dependencyManifestHash?: string;
  provenanceHash?: string;
  dependencyManifestPath?: string;
  sbomPath?: string;
  provenancePath?: string;
}): SupplyChainManifest {
  return SupplyChainManifestSchema.parse({
    schemaVersion: 1,
    gameId: input.gameId,
    lockfileHash: input.lockfileHash,
    dependencies: canonicalDependencies(input.dependencies),
    build: input.build,
    ...(input.sbomHash === undefined ? {} : { sbomHash: input.sbomHash }),
    ...(input.dependencyManifestHash === undefined ? {} : { dependencyManifestHash: input.dependencyManifestHash }),
    ...(input.provenanceHash === undefined ? {} : { provenanceHash: input.provenanceHash }),
    ...(input.dependencyManifestPath === undefined ? {} : { dependencyManifestPath: input.dependencyManifestPath }),
    ...(input.sbomPath === undefined ? {} : { sbomPath: input.sbomPath }),
    ...(input.provenancePath === undefined ? {} : { provenancePath: input.provenancePath }),
    generatedAt: new Date().toISOString(),
  });
}

export type SupplyChainEvidence = {
  dependencyManifest?: unknown;
  sbom?: unknown;
  provenance?: unknown;
  /** Require the three separately reviewable evidence files and all bindings. */
  requireEvidence?: boolean;
};

export type SupplyChainEvaluation = {
  passed: boolean;
  blockers: string[];
  manifest: SupplyChainManifest | unknown;
  dependencyManifest?: DependencyManifest;
  sbom?: Sbom;
  provenance?: BuildProvenance;
};

function sameDependencies(left: SupplyChainDependency[], right: SupplyChainDependency[]): boolean {
  return JSON.stringify(canonicalDependencies(left)) === JSON.stringify(canonicalDependencies(right));
}

function evidencePathIsSafe(value: string | undefined): boolean {
  if (!value) return true;
  return !value.startsWith('/') && !value.includes('..') && !value.includes('\\');
}

/** Evaluate supply-chain evidence without ever executing dependency scripts. */
export function evaluateSupplyChainManifest(value: unknown, options: SupplyChainEvidence = {}): SupplyChainEvaluation {
  const parsed = SupplyChainManifestSchema.safeParse(value);
  if (!parsed.success) return { passed: false, blockers: ['schema-invalid'], manifest: value };
  const manifest = parsed.data;
  const blockers: string[] = [];
  if (!manifest.sbomHash) blockers.push('sbom-missing');
  for (const dependency of manifest.dependencies) {
    if (!dependency.licenseEvidence) blockers.push(`${dependency.name}:license-evidence-missing`);
    if (dependency.installScript) blockers.push(`${dependency.name}:install-script-not-allowlisted`);
    if (dependency.source.startsWith('http://')) blockers.push(`${dependency.name}:insecure-source`);
  }
  for (const [label, path] of [['dependency-manifest', manifest.dependencyManifestPath], ['sbom', manifest.sbomPath], ['build-provenance', manifest.provenancePath]] as const) {
    if (!evidencePathIsSafe(path)) blockers.push(`${label}:unsafe-evidence-path`);
  }

  const linked = Boolean(
    options.requireEvidence
      || manifest.dependencyManifestHash
      || manifest.provenanceHash
      || manifest.dependencyManifestPath
      || manifest.sbomPath
      || manifest.provenancePath,
  );
  if (linked) {
    const dependencyParsed = DependencyManifestSchema.safeParse(options.dependencyManifest);
    const sbomParsed = SbomSchema.safeParse(options.sbom);
    const provenanceParsed = BuildProvenanceSchema.safeParse(options.provenance);
    if (!dependencyParsed.success) blockers.push('dependency-manifest-evidence-missing-or-invalid');
    if (!sbomParsed.success) blockers.push('sbom-evidence-missing-or-invalid');
    if (!provenanceParsed.success) blockers.push('build-provenance-evidence-missing-or-invalid');
    if (!manifest.dependencyManifestHash) blockers.push('dependency-manifest-hash-missing');
    if (!manifest.provenanceHash) blockers.push('provenance-hash-missing');
    if (!manifest.dependencyManifestPath) blockers.push('dependency-manifest-path-missing');
    if (!manifest.sbomPath) blockers.push('sbom-path-missing');
    if (!manifest.provenancePath) blockers.push('provenance-path-missing');
    if (dependencyParsed.success) {
      const dependencyManifest = dependencyParsed.data;
      if (dependencyManifest.gameId !== manifest.gameId) blockers.push('dependency-manifest-game-mismatch');
      if (dependencyManifest.lockfileHash !== manifest.lockfileHash) blockers.push('dependency-manifest-lockfile-mismatch');
      if (!sameDependencies(dependencyManifest.dependencies, manifest.dependencies)) blockers.push('dependency-manifest-content-mismatch');
      if (manifest.dependencyManifestHash && hashJson(dependencyManifest) !== manifest.dependencyManifestHash) blockers.push('dependency-manifest-hash-mismatch');
    }
    if (sbomParsed.success) {
      const sbom = sbomParsed.data;
      if (sbom.gameId !== manifest.gameId) blockers.push('sbom-game-mismatch');
      if (sbom.lockfileHash !== manifest.lockfileHash) blockers.push('sbom-lockfile-mismatch');
      if (!sameDependencies(sbom.components, manifest.dependencies)) blockers.push('sbom-content-mismatch');
      if (manifest.sbomHash && hashJson(sbom) !== manifest.sbomHash) blockers.push('sbom-hash-mismatch');
    }
    if (provenanceParsed.success) {
      const provenance = provenanceParsed.data;
      if (provenance.gameId !== manifest.gameId) blockers.push('build-provenance-game-mismatch');
      if (provenance.lockfileHash !== manifest.lockfileHash) blockers.push('build-provenance-lockfile-mismatch');
      if (provenance.sourceCommit !== manifest.build.sourceCommit) blockers.push('build-provenance-source-mismatch');
      if (provenance.builder !== manifest.build.builder) blockers.push('build-provenance-builder-mismatch');
      if (provenance.command !== manifest.build.command) blockers.push('build-provenance-command-mismatch');
      if (provenance.outputHash !== manifest.build.outputHash) blockers.push('build-provenance-output-mismatch');
      if (manifest.sbomHash && provenance.sbomHash !== manifest.sbomHash) blockers.push('build-provenance-sbom-binding-mismatch');
      if (manifest.dependencyManifestHash && provenance.dependencyManifestHash !== manifest.dependencyManifestHash) blockers.push('build-provenance-dependency-binding-mismatch');
      if (manifest.provenanceHash && hashJson(provenance) !== manifest.provenanceHash) blockers.push('provenance-hash-mismatch');
    }
    return {
      passed: blockers.length === 0,
      blockers: [...new Set(blockers)],
      manifest,
      ...(dependencyParsed.success ? { dependencyManifest: dependencyParsed.data } : {}),
      ...(sbomParsed.success ? { sbom: sbomParsed.data } : {}),
      ...(provenanceParsed.success ? { provenance: provenanceParsed.data } : {}),
    };
  }
  return { passed: blockers.length === 0, blockers: [...new Set(blockers)], manifest };
}

/** Public hash helper used by release tooling and audit tests. */
export function hashSupplyChainArtifact(value: unknown): string {
  return hashJson(value);
}
