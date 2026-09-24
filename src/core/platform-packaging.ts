import { lstat, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { DistributionPlatformSchema } from '../schemas/factory-operating.js';
import { PlatformPackageSetSchema, type PlatformPackageSet } from '../schemas/platform-package.js';
import { sha256File, sha256Text } from './files.js';

const adapterPath: Record<string, string> = {
  'wechat-minigame': 'src/platform/wechat',
  'douyin-minigame': 'src/platform/douyin',
  'taptap-minigame': 'src/platform/taptap',
  'poki-web': 'src/platform/poki',
  'crazygames-web': 'src/platform/crazygames',
};

/**
 * Validate the lexical namespace for a platform child.  A child may contain
 * nested version directories, but it can never escape
 * `platform-builds/<platform>/` or use an absolute/traversal path.
 */
export function validatePlatformChildPath(platformValue: string, childRootValue: string): string {
  const platform = DistributionPlatformSchema.parse(platformValue);
  const raw = String(childRootValue ?? '').trim().replaceAll('\\', '/');
  const normalized = raw.replace(/\/+$/u, '');
  const expected = `platform-builds/${platform}`;
  if (!normalized || normalized === '.' || normalized.startsWith('/') || path.posix.isAbsolute(normalized) || normalized.split('/').some((part) => part === '..') || (normalized !== expected && !normalized.startsWith(`${expected}/`))) {
    throw new Error(`unsafe child root for ${platform}: ${childRootValue}`);
  }
  return normalized;
}

/** Create the per-platform child records without claiming that they shipped. */
export function buildPlatformPackageSet(input: { gameId: string; coreHash: string; targets?: string[]; requiredTargets?: string[]; optionalTargets?: string[] }): PlatformPackageSet {
  // `targets` is the legacy all-required form. New callers should provide
  // explicit required/optional arrays so an unselected overseas child cannot
  // block a domestic release.
  const requiredTargets = input.requiredTargets ?? input.targets ?? [];
  const optionalTargets = input.optionalTargets ?? [];
  const required = [...new Set(requiredTargets.map((target) => DistributionPlatformSchema.parse(target)))];
  const optional = [...new Set(optionalTargets.map((target) => DistributionPlatformSchema.parse(target)))].filter((target) => !required.includes(target));
  const targets = [...required, ...optional];
  if (targets.length === 0) throw new Error('at least one platform target is required');
  const now = new Date().toISOString();
  return PlatformPackageSetSchema.parse({
    schemaVersion: 1,
    gameId: input.gameId,
    coreHash: input.coreHash,
    requiredPlatforms: required,
    optionalPlatforms: optional,
    packages: targets.map((platform) => ({
      platform,
      required: required.includes(platform),
      status: 'PLANNED' as const,
      adapterPath: adapterPath[platform] ?? `src/platform/${platform}`,
      configPath: `platform-config/${platform}.json`,
      packagePath: `platform-builds/${platform}/`,
      childRoot: `platform-builds/${platform}/`,
      buildTool: `${platform}-official-builder`,
      artifactHash: null,
      coreHash: input.coreHash,
      evidence: [],
      normalFlowEvidence: [],
      visualEvidence: [],
      runtimeEvidence: [],
      blockers: ['platform-package-not-built'],
      generatedAt: now,
    })),
    generatedAt: now,
  });
}

export function evaluatePlatformPackageSet(value: unknown, options: { strict?: boolean } = {}) {
  const parsed = PlatformPackageSetSchema.safeParse(value);
  if (!parsed.success) return { passed: false, blockers: ['schema-invalid'], set: value };
  const set = parsed.data;
  const required = new Set(set.requiredPlatforms);
  const blockers: string[] = [];
  for (const pkg of set.packages) {
    if (!required.has(pkg.platform)) {
      // Optional children are still checked when they claim READY/RELEASED,
      // but a planned/blocked optional child is advisory and cannot stop the
      // required release set.
      if (!['READY', 'RELEASED'].includes(pkg.status)) continue;
    }
    if (pkg.coreHash !== set.coreHash) blockers.push(`${pkg.platform}:core-hash-mismatch`);
    if (required.has(pkg.platform) && !['READY', 'RELEASED'].includes(pkg.status)) blockers.push(`${pkg.platform}:not-ready`);
    if (!pkg.artifactHash) blockers.push(`${pkg.platform}:artifact-hash-missing`);
    if (!pkg.device) blockers.push(`${pkg.platform}:device-evidence-missing`);
    if (pkg.evidence.length === 0) blockers.push(`${pkg.platform}:evidence-missing`);
    if (options.strict) {
      try { validatePlatformChildPath(pkg.platform, pkg.childRoot ?? ''); } catch { blockers.push(`${pkg.platform}:child-root-missing-or-unsafe`); }
      if (pkg.normalFlowEvidence.length === 0) blockers.push(`${pkg.platform}:normal-flow-evidence-missing`);
      if (pkg.visualEvidence.length === 0) blockers.push(`${pkg.platform}:visual-evidence-missing`);
      if (pkg.runtimeEvidence.length === 0) blockers.push(`${pkg.platform}:runtime-evidence-missing`);
    }
  }
  return { passed: blockers.length === 0, blockers: [...new Set(blockers)], set };
}

export function markPlatformPackageReady(value: unknown, platformValue: string, input: { artifactHash: string; device: NonNullable<PlatformPackageSet['packages'][number]['device']>; evidence: string[]; childRoot?: string; normalFlowEvidence?: string[]; visualEvidence?: string[]; runtimeEvidence?: string[] }) {
  const set = PlatformPackageSetSchema.parse(value);
  const platform = DistributionPlatformSchema.parse(platformValue);
  let found = false;
  const packages = set.packages.map((pkg) => {
    if (pkg.platform !== platform) return pkg;
    found = true;
    const childRoot = validatePlatformChildPath(platform, input.childRoot ?? pkg.childRoot ?? pkg.packagePath);
    return { ...pkg, status: 'READY' as const, artifactHash: input.artifactHash, childRoot, device: input.device, evidence: input.evidence, normalFlowEvidence: input.normalFlowEvidence ?? pkg.normalFlowEvidence, visualEvidence: input.visualEvidence ?? pkg.visualEvidence, runtimeEvidence: input.runtimeEvidence ?? pkg.runtimeEvidence, blockers: [] };
  });
  if (!found) throw new Error(`platform package ${platform} does not exist`);
  return PlatformPackageSetSchema.parse({ ...set, packages });
}

async function hashPlatformDirectory(directory: string): Promise<string> {
  const files: string[] = [];
  async function walk(current: string, relative: string) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const child = path.join(current, entry.name);
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const stat = await lstat(child);
      if (stat.isSymbolicLink()) throw new Error(`platform package contains a symlink: ${childRelative}`);
      if (stat.isDirectory()) await walk(child, childRelative);
      else if (stat.isFile()) files.push(`${childRelative.replaceAll('\\', '/')}::${await sha256File(child)}`);
      else throw new Error(`platform package contains a non-regular entry: ${childRelative}`);
    }
  }
  await walk(directory, '');
  if (files.length === 0) throw new Error('platform package is empty');
  return sha256Text(files.sort().join('\n'));
}

/** Verify the bytes on disk for a platform child.  This is intentionally
 * separate from the metadata-only evaluator so local tests can use a planned
 * package while production submission can require a real directory hash. */
export async function verifyPlatformPackageArtifact(input: { runRoot: string; platform: string; childRoot: string; expectedHash?: string }) {
  const platform = DistributionPlatformSchema.parse(input.platform);
  const childRoot = validatePlatformChildPath(platform, input.childRoot);
  const root = path.resolve(input.runRoot);
  const directory = path.resolve(root, childRoot);
  const relative = path.relative(root, directory);
  const blockers: string[] = [];
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) blockers.push('child-root-outside-run');
  try {
    const rootStat = await lstat(root);
    const dirStat = await lstat(directory);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) blockers.push('run-root-unsafe');
    if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) blockers.push('child-root-unsafe');
    const [realRoot, realDirectory] = await Promise.all([realpath(root), realpath(directory)]);
    const realRelative = path.relative(realRoot, realDirectory);
    if (!realRelative || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) blockers.push('child-root-resolved-outside-run');
  } catch {
    blockers.push('child-root-missing');
  }
  let artifactHash: string | undefined;
  if (blockers.length === 0) {
    try { artifactHash = await hashPlatformDirectory(directory); } catch (error) { blockers.push(error instanceof Error ? error.message : 'package-hash-failed'); }
  }
  if (input.expectedHash && artifactHash !== input.expectedHash) blockers.push('artifact-hash-mismatch');
  return { passed: blockers.length === 0, blockers: [...new Set(blockers)], childRoot, ...(artifactHash ? { artifactHash } : {}) };
}

/**
 * Reconcile every READY/RELEASED package record with the bytes currently on
 * disk. Metadata-only platform evaluators are useful while a package is being
 * planned, but the strict release boundary must never trust a hand-written
 * hash or a missing child directory.
 */
export async function verifyPlatformPackageSetArtifacts(value: unknown, runRoot: string) {
  const evaluated = evaluatePlatformPackageSet(value, { strict: true });
  const blockers = [...evaluated.blockers];
  if (!evaluated.set || typeof evaluated.set !== 'object' || !('packages' in evaluated.set)) return { passed: false, blockers: [...new Set(blockers)], set: evaluated.set };
  const set = evaluated.set as PlatformPackageSet;
  for (const pkg of set.packages) {
    if (!['READY', 'RELEASED'].includes(pkg.status)) continue;
    if (!pkg.childRoot) {
      blockers.push(`${pkg.platform}:package-bytes-missing`);
      continue;
    }
    const verified = await verifyPlatformPackageArtifact({ runRoot, platform: pkg.platform, childRoot: pkg.childRoot, expectedHash: pkg.artifactHash ?? undefined });
    if (!verified.passed) blockers.push(...verified.blockers.map((item) => `${pkg.platform}:${item}`));
  }
  return { passed: blockers.length === 0, blockers: [...new Set(blockers)], set };
}
