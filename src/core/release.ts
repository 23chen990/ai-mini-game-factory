import { copyFile, lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { AssetManifestSchema, QaReportSchema, PlayerAcceptanceGateSchema, ProfileQaReportSchema, type GameBlueprint, type ReleaseManifest } from '../schemas/index.js';
import { CompletionGateReportSchema } from './completion-gates.js';
import { RuntimeProductGateSchema } from './runtime-product-gates.js';
import { evaluateQaEvidence } from './qa-evidence.js';
import { BusinessPreflightSchema, PlatformReleaseMatrixSchema, ReleaseCandidateSchema, type PlatformReleaseMatrix } from '../schemas/factory-operating.js';
import { evaluatePlatformReleaseMatrix } from './factory-operating.js';
import { clearDir, copyTree, ensureDir, listFiles, sha256File, writeJsonAtomic } from './files.js';
import { buildReleaseIntegrity } from './release-integrity.js';
import { QualityBaselineReportSchema } from '../schemas/quality-baseline.js';
import { OriginalityDeclarationSchema } from '../schemas/originality.js';
import { IaaContractSchema } from '../schemas/iaa-contract.js';
import { evaluateIaaContract } from './iaa-contract.js';
import { DifferentiationContractSchema } from '../schemas/differentiation.js';
import { evaluateDifferentiationContract } from './differentiation.js';
import { UnknownRegisterSchema } from '../schemas/unknowns.js';
import { evaluateUnknownRegister } from './unknowns.js';
import { PlatformPackageSetSchema } from '../schemas/platform-package.js';
import { evaluatePlatformPackageSet, verifyPlatformPackageSetArtifacts } from './platform-packaging.js';
import { PresentationQualityReportSchema } from '../schemas/presentation-evidence.js';
import { evaluatePresentationQuality } from './presentation-evidence.js';
import { SupplyChainManifestSchema } from '../schemas/supply-chain.js';
import { evaluateSupplyChainManifest } from './supply-chain.js';
import { evaluateDependencyPolicy } from './dependency-policy.js';
import { QualityGateMatrixSchema } from '../schemas/quality-gates.js';
import { assertQualityGateCandidateBinding, bindQualityGateMatrix } from './quality-gates.js';
import { NaturalInputPolicySchema } from '../schemas/natural-input-policy.js';
import { SideEffectJournalSchema } from '../schemas/side-effect-journal.js';
import { evaluateSideEffectJournal } from './side-effect-journal.js';
import { PortfolioStrategySchema } from '../schemas/portfolio-strategy.js';
import { evaluatePortfolioGate } from './portfolio-strategy.js';
import { PlatformPolicyEvaluationSchema, PlatformPolicySnapshotSchema } from '../schemas/platform-policy.js';
import { evaluatePlatformPolicy, platformPolicyHash } from './platform-policy.js';
import { AccountCapacityPlanSchema, AccountCapacityReportSchema } from '../schemas/account-capacity.js';
import { evaluateAccountCapacity } from './account-capacity.js';
import { InteractionContinuityContractSchema, InteractionContinuityReportSchema, InteractionContinuitySummarySchema } from '../schemas/interaction-continuity.js';

/** Apply the release-boundary UNKNOWN policy in one auditable place. Local
 * tooling may keep non-blocking items open; strict production release requires
 * every item to be resolved or explicitly waived. */
export function evaluateReleaseUnknownGate(value: unknown, strict = false, artifactHashes?: Record<string, string>) {
  const unknowns = UnknownRegisterSchema.parse(value);
  return evaluateUnknownRegister(unknowns, { requireAllResolved: strict, requireBoundWaivers: strict, artifactHashes });
}

export type ReleaseOptions = {
  enforceAcceptance?: boolean;
  enforceOperatingGates?: boolean;
  certificationRequired?: boolean;
  artQualityRequired?: boolean;
  /** Require the presentation-quality evidence family at release. */
  requirePresentation?: boolean;
  requirePlatformSpine?: boolean;
  /** Require and byte-verify the per-platform package set in strict mode. */
  requirePlatformPackages?: boolean;
  /** Require a reviewed exact dependency allowlist at the release boundary. */
  requireDependencyAllowlist?: boolean;
  /** Require every recorded external side effect to be reconciled/succeeded. */
  requireSideEffectJournal?: boolean;
  /** Require the cross-run first-game/portfolio gate to be explicitly passed. */
  requirePortfolioGate?: boolean;
  /** Require an operator-verified snapshot of current platform rules. */
  requirePlatformPolicy?: boolean;
  /** Reuse the immutable package created before human playtest. */
  reuseCandidate?: boolean;
};

async function readJsonFile(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8')) as unknown;
}

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

/**
 * Validate a build tree as a real, run-local directory before hashing or
 * copying it.  Lexical path checks alone are insufficient because a symlink
 * such as `workspace/game/dist-link` can point outside the run after the
 * build report has been written.  We reject symlinks at every level so a
 * candidate package can only contain bytes owned by this run.
 */
async function assertSafeBuildTree(runRoot: string, directory: string): Promise<void> {
  const root = path.resolve(runRoot);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('run root must be a real directory');
  const [realRoot, realDirectory] = await Promise.all([realpath(root), realpath(directory)]);
  if (!isWithin(realRoot, realDirectory)) throw new Error('build output resolves outside the run root');
  const directoryStat = await lstat(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new Error('build output must be a real directory, not a symlink');
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const child = path.join(current, entry.name);
      const childStat = await lstat(child);
      if (childStat.isSymbolicLink()) throw new Error(`build output contains a symlink: ${path.relative(root, child)}`);
      const childReal = await realpath(child);
      if (!isWithin(realRoot, childReal)) throw new Error(`build output entry resolves outside the run root: ${path.relative(root, child)}`);
      if (childStat.isDirectory()) await walk(child);
      else if (!childStat.isFile()) throw new Error(`build output contains a non-regular entry: ${path.relative(root, child)}`);
    }
  };
  await walk(directory);
}

async function resolveBuildOutput(runRoot: string): Promise<{ directory: string; runtime: 'web-lite' | 'cocos-3d' }> {
  const fallback = path.join(runRoot, 'workspace/game/dist');
  let raw: { webBuild?: unknown; runtime?: unknown } = {};
  try { raw = await readJsonFile(path.join(runRoot, 'artifacts/build-report.json')) as { webBuild?: unknown; runtime?: unknown }; } catch { /* use the safe legacy fallback */ }
  const candidate = typeof raw.webBuild === 'string' && raw.webBuild.trim() ? path.resolve(runRoot, raw.webBuild) : fallback;
  if (!isWithin(runRoot, candidate)) throw new Error('build report webBuild escapes the run root');
  await assertSafeBuildTree(runRoot, candidate);
  return { directory: candidate, runtime: raw.runtime === 'cocos-3d' ? 'cocos-3d' : 'web-lite' };
}

async function resolveMarketingAsset(runRoot: string, relativeAsset: string, runtime: 'web-lite' | 'cocos-3d'): Promise<string> {
  const roots = runtime === 'cocos-3d'
    ? [path.join(runRoot, 'workspace/generated-assets'), path.join(runRoot, 'workspace/game/assets/resources/generated/cutouts'), path.join(runRoot, 'workspace/game/assets/resources/generated'), path.join(runRoot, 'workspace/game/public')]
    : [path.join(runRoot, 'workspace/game/public'), path.join(runRoot, 'workspace/generated-assets')];
  const normalized = relativeAsset.replaceAll('\\', '/').replace(/^\/+/, '');
  const candidates = roots.flatMap((root) => [path.resolve(root, normalized), path.resolve(root, path.basename(normalized))]);
  for (const candidate of candidates) {
    if (!isWithin(runRoot, candidate)) continue;
    try {
      const stat = await lstat(candidate);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('marketing asset must be a regular file, not a symlink');
      const [realRoot, realCandidate] = await Promise.all([realpath(runRoot), realpath(candidate)]);
      if (!isWithin(realRoot, realCandidate)) throw new Error('marketing asset resolves outside the run root');
      await readFile(candidate);
      return candidate;
    } catch (error) {
      if (error instanceof Error && /symlink|outside the run root|regular file/u.test(error.message)) throw error;
      /* try the next approved asset root */
    }
  }
  throw new Error(`marketing asset is missing from approved run roots: ${relativeAsset}`);
}

async function assertRegularRunFile(runRoot: string, file: string, label: string): Promise<void> {
  const root = path.resolve(runRoot);
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular file, not a symlink`);
  const [realRoot, realFile] = await Promise.all([realpath(root), realpath(file)]);
  if (!isWithin(realRoot, realFile)) throw new Error(`${label} resolves outside the run root`);
}

async function hashDirectory(directory: string, runRoot: string): Promise<string> {
  // The caller has already validated the run root; this extra tree walk also
  // closes a symlink-swap race between path resolution and hashing.
  await assertSafeBuildTree(runRoot, directory);
  const files = await listFiles(directory);
  const entries = await Promise.all(files.map(async (file) => `${file}:${await sha256File(path.join(directory, file))}`));
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(entries.join('\n')).digest('hex');
}

function assertSha256(value: string, label: string) {
  if (!/^[a-f0-9]{64}$/u.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest`);
}

async function validateOperatingGates(runRoot: string, options: ReleaseOptions = {}, blueprint?: GameBlueprint) {
  const artifacts = path.join(runRoot, 'artifacts');
  let preflight: ReturnType<typeof BusinessPreflightSchema.parse>;
  let matrix: PlatformReleaseMatrix;
  try { preflight = BusinessPreflightSchema.parse(await readJsonFile(path.join(artifacts, 'business-preflight.json'))); }
  catch (error) { throw new Error(`business-preflight gate is missing or invalid: ${error instanceof Error ? error.message : String(error)}`); }
  if (preflight.decision !== 'GO' || preflight.blockers.length > 0 || preflight.unknowns.length > 0) throw new Error('business-preflight gate is not GO (blockers or unknowns remain)');
  if (options.requirePlatformPolicy === true) {
    const policyRaw = await readJsonFile(path.join(artifacts, 'platform-policy.json')).catch(() => undefined);
    const policy = PlatformPolicySnapshotSchema.safeParse(policyRaw);
    if (!policy.success) throw new Error('platform-policy gate is missing or invalid');
    const policyResult = evaluatePlatformPolicy(policy.data, {
      requiredPlatforms: preflight.targets,
      optionalPlatforms: preflight.optionalTargets,
      requireVerified: true,
    });
    if (!policyResult.passed) throw new Error(`platform-policy gate is not ready: ${policyResult.blockers.join(', ')}`);
    const evaluationRaw = await readJsonFile(path.join(artifacts, 'platform-policy-evaluation.json')).catch(() => undefined);
    if (evaluationRaw === undefined) throw new Error('platform-policy evaluation artifact is missing');
    const evaluation = PlatformPolicyEvaluationSchema.safeParse(evaluationRaw);
    if (!evaluation.success) throw new Error('platform-policy evaluation artifact is invalid');
    const expectedPolicyHash = platformPolicyHash(policy.data);
    if (evaluation.data.snapshotHash !== expectedPolicyHash) throw new Error('platform-policy evaluation hash does not match the snapshot');
    if (JSON.stringify([...evaluation.data.requiredPlatforms].sort()) !== JSON.stringify([...preflight.targets].sort())) throw new Error('platform-policy evaluation required targets do not match business preflight');
    if (JSON.stringify([...evaluation.data.optionalPlatforms].sort()) !== JSON.stringify([...preflight.optionalTargets].sort())) throw new Error('platform-policy evaluation optional targets do not match business preflight');
    if (!evaluation.data.requireVerified) throw new Error('platform-policy evaluation did not require verified evidence');
    if (!evaluation.data.passed) throw new Error(`platform-policy evaluation is not ready: ${evaluation.data.blockers.join(', ')}`);
  }
  try { matrix = PlatformReleaseMatrixSchema.parse(await readJsonFile(path.join(artifacts, 'platform-release-matrix.json'))); }
  catch (error) { throw new Error(`platform-release-matrix gate is missing or invalid: ${error instanceof Error ? error.message : String(error)}`); }
  const platformResult = evaluatePlatformReleaseMatrix(matrix, { strict: true });
  if (!platformResult.passed) throw new Error(`platform-release-matrix gate is not ready: ${platformResult.blockers.join(', ')}`);
  let completion: ReturnType<typeof CompletionGateReportSchema.parse>;
  try { completion = CompletionGateReportSchema.parse(await readJsonFile(path.join(artifacts, 'completion-gates.json'))); }
  catch (error) { throw new Error(`completion-gates artifact is missing or invalid: ${error instanceof Error ? error.message : String(error)}`); }
  if (!completion.releaseReady) throw new Error('completion-gates artifact is not release-ready');
  let expectedBuildHash: string | undefined;
  if (options.enforceOperatingGates) {
    let qualityMatrix: ReturnType<typeof QualityGateMatrixSchema.parse>;
    try { qualityMatrix = QualityGateMatrixSchema.parse(await readJsonFile(path.join(artifacts, 'quality-gate-matrix.json'))); }
    catch (error) { throw new Error(`quality-gate-matrix gate is missing or invalid: ${error instanceof Error ? error.message : String(error)}`); }
    if (!qualityMatrix.passed) throw new Error(`quality-gate-matrix gate is not ready: ${qualityMatrix.blockers.join(', ')}`);
    if (!qualityMatrix.candidateHash) throw new Error('quality-gate-matrix is not bound to an immutable release candidate');
    const currentBuild = await resolveBuildOutput(runRoot);
    const currentCoreHash = await hashDirectory(currentBuild.directory, runRoot);
    expectedBuildHash = currentCoreHash;
    if (qualityMatrix.candidateHash !== currentCoreHash) throw new Error('quality-gate-matrix candidate hash does not match the currently tested build');
    if (completion.candidateHash !== currentCoreHash || completion.candidateBinding?.passed !== true) throw new Error('completion-gates are not bound to the immutable release candidate');
    const candidateRaw = await readJsonFile(path.join(artifacts, 'release-candidate.json')).catch(() => undefined);
    if (candidateRaw !== undefined) {
      const candidate = ReleaseCandidateSchema.parse(candidateRaw);
      if (candidate.coreHash !== qualityMatrix.candidateHash) throw new Error('quality-gate-matrix candidate hash does not match release candidate');
    }
  }
  if (options.enforceOperatingGates) {
    try {
      const runtimeProduct = RuntimeProductGateSchema.parse(await readJsonFile(path.join(artifacts, 'runtime-product-gates.json')));
      if (!runtimeProduct.passed) throw new Error('runtime-product gate is not ready');
    } catch (error) {
      throw new Error(`runtime-product gate is missing or invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const qaReport = QaReportSchema.parse(await readJsonFile(path.join(artifacts, 'qa-report.json')));
  const naturalPolicyRaw = await readJsonFile(path.join(artifacts, 'natural-input-policy.json')).catch(() => undefined);
  const naturalPolicy = naturalPolicyRaw === undefined ? undefined : NaturalInputPolicySchema.parse(naturalPolicyRaw);
  const evidenceGate = evaluateQaEvidence(qaReport.evidence, {
    requireNatural: true,
    requireStateCoverage: true,
    ...(options.enforceOperatingGates ? { requireNaturalComplete: true, naturalFlow: qaReport.naturalFlow } : {}),
    ...(options.enforceOperatingGates ? { requireProvenance: true, expectedBuildHash } : {}),
    ...(naturalPolicy ? { naturalPolicy } : {}),
  });
  if (!evidenceGate.passed) throw new Error(`qa evidence gate is not release-ready: ${evidenceGate.blockers.join(', ')}`);
  let baseline: ReturnType<typeof QualityBaselineReportSchema.parse>;
  try { baseline = QualityBaselineReportSchema.parse(await readJsonFile(path.join(artifacts, 'quality-baseline.json'))); }
  catch (error) { throw new Error(`quality-baseline gate is missing or invalid: ${error instanceof Error ? error.message : String(error)}`); }
  if (!baseline.passed) throw new Error(`quality-baseline gate is not ready: ${baseline.blockers.join(', ')}`);
  let originality: ReturnType<typeof OriginalityDeclarationSchema.parse>;
  try { originality = OriginalityDeclarationSchema.parse(await readJsonFile(path.join(artifacts, 'originality-declaration.json'))); }
  catch (error) { throw new Error(`originality-declaration gate is missing or invalid: ${error instanceof Error ? error.message : String(error)}`); }
  if (originality.status !== 'PASS' || originality.unknowns.length > 0) throw new Error('originality-declaration gate is not PASS');
  if (options.certificationRequired) {
    const checklist = await readJsonFile(path.join(artifacts, 'certification-checklist.json')).catch(() => undefined);
    if (!checklist || (checklist as { ready?: unknown }).ready !== true) throw new Error('certification-checklist gate is not ready');
  }
  if (options.artQualityRequired) {
    const artQuality = await readJsonFile(path.join(artifacts, 'art-quality.json')).catch(() => undefined);
    if (!artQuality || (artQuality as { passed?: unknown }).passed !== true) throw new Error('art-quality gate is not ready');
  }
  if (options.requirePlatformSpine) {
    const spine = await readJsonFile(path.join(artifacts, 'platform-spine.json')).catch(() => undefined);
    if (!spine || !(spine as { adapters?: Array<{ status?: string }> }).adapters?.every((adapter) => adapter.status === 'verified')) throw new Error('platform-spine gate is not ready');
  }
  const iaa = IaaContractSchema.parse(await readJsonFile(path.join(artifacts, 'iaa-contract.json')).catch(() => {
    throw new Error('iaa-contract gate is missing or invalid');
  }));
  const iaaResult = evaluateIaaContract(iaa);
  if (!iaaResult.passed) throw new Error(`iaa-contract gate is not ready: ${iaaResult.blockers.join(', ')}`);
  if (process.env.FACTORY_ENFORCE_DIFFERENTIATION === '1') {
    const differentiation = DifferentiationContractSchema.parse(await readJsonFile(path.join(artifacts, 'differentiation-contract.json')));
    const differentiationResult = evaluateDifferentiationContract(differentiation);
    if (!differentiationResult.passed) throw new Error(`differentiation-contract gate is not ready: ${differentiationResult.blockers.join(', ')}`);
  }
  const unknownFile = path.join(artifacts, 'unknown-register.json');
  const unknownRaw = await readJsonFile(unknownFile).catch(() => undefined);
  if (unknownRaw !== undefined) {
    const ledgerRaw = await readJsonFile(path.join(artifacts, 'artifact-ledger.json')).catch(() => undefined);
    const artifactHashes = ledgerRaw && typeof ledgerRaw === 'object' && !Array.isArray(ledgerRaw)
      ? Object.fromEntries(Array.isArray((ledgerRaw as { entries?: unknown }).entries)
        ? ((ledgerRaw as { entries: Array<{ path?: unknown; sha256?: unknown }> }).entries)
          .filter((entry) => typeof entry.path === 'string' && typeof entry.sha256 === 'string')
          .map((entry) => [entry.path as string, entry.sha256 as string])
        : [])
      : undefined;
    const unknownResult = evaluateReleaseUnknownGate(unknownRaw, options.enforceOperatingGates === true, artifactHashes);
    if (!unknownResult.passed) throw new Error(`unknown register gate is not ready: ${unknownResult.blocking.join(', ')}`);
  } else if (process.env.FACTORY_REQUIRE_UNKNOWN_REGISTER === '1') throw new Error('unknown-register gate is missing');
  const packageFile = path.join(artifacts, 'platform-package-set.json');
  const packageRaw = await readJsonFile(packageFile).catch(() => undefined);
  if (options.requirePlatformPackages && packageRaw === undefined) throw new Error('platform package gate is missing');
  if (packageRaw !== undefined) {
    const packageResult = evaluatePlatformPackageSet(PlatformPackageSetSchema.parse(packageRaw), { strict: true });
    if (!packageResult.passed) throw new Error(`platform package gate is not ready: ${packageResult.blockers.join(', ')}`);
    if (options.requirePlatformPackages) {
      const byteResult = await verifyPlatformPackageSetArtifacts(packageResult.set, runRoot);
      if (!byteResult.passed) throw new Error(`platform package bytes are not verified: ${byteResult.blockers.join(', ')}`);
    }
  }
  const presentationFile = path.join(artifacts, 'presentation-quality.json');
  const presentationRaw = await readJsonFile(presentationFile).catch(() => undefined);
  if (options.requirePresentation === true || process.env.FACTORY_ENFORCE_PRESENTATION_QA === '1') {
    if (presentationRaw === undefined) throw new Error('presentation gate is missing');
    const presentationResult = evaluatePresentationQuality(PresentationQualityReportSchema.parse(presentationRaw));
    if (!presentationResult.passed) throw new Error(`presentation gate is not ready: ${presentationResult.blockers.join(', ')}`);
  }
  const supplyFile = path.join(artifacts, 'supply-chain.json');
  const supplyRaw = await readJsonFile(supplyFile).catch(() => undefined);
  if (process.env.FACTORY_ENFORCE_SUPPLY_CHAIN === '1' || options.requireDependencyAllowlist === true) {
    if (supplyRaw === undefined) throw new Error('supply-chain gate is missing');
    const supplyManifest = SupplyChainManifestSchema.parse(supplyRaw);
    const dependencyManifestRaw = await readJsonFile(path.join(artifacts, 'dependency-manifest.json')).catch(() => undefined);
    const sbomRaw = await readJsonFile(path.join(artifacts, 'sbom.json')).catch(() => undefined);
    const provenanceRaw = await readJsonFile(path.join(artifacts, 'build-provenance.json')).catch(() => undefined);
    const supplyResult = evaluateSupplyChainManifest(supplyManifest, {
      dependencyManifest: dependencyManifestRaw,
      sbom: sbomRaw,
      provenance: provenanceRaw,
      requireEvidence: true,
    });
    if (!supplyResult.passed) throw new Error(`supply-chain gate is not ready: ${supplyResult.blockers.join(', ')}`);
    const policyRaw = await readJsonFile(path.join(artifacts, 'dependency-policy.json')).catch(() => undefined);
    const dependencyResult = evaluateDependencyPolicy(supplyManifest, policyRaw, { required: options.requireDependencyAllowlist === true || process.env.FACTORY_ENFORCE_DEPENDENCY_ALLOWLIST === '1' });
    if (!dependencyResult.passed) throw new Error(`dependency allowlist gate is not ready: ${dependencyResult.blockers.join(', ')}`);
  }
  if (options.requireSideEffectJournal === true) {
    const journalRaw = await readJsonFile(path.join(artifacts, 'side-effect-journal.json')).catch(() => undefined);
    const journal = SideEffectJournalSchema.safeParse(journalRaw);
    const effectResult = journal.success ? evaluateSideEffectJournal(journal.data, { requireAllSucceeded: true }) : undefined;
    if (!journal.success || !effectResult?.passed) {
      throw new Error(`side-effect journal gate is not ready: ${effectResult?.blockers.join(', ') ?? 'missing-or-invalid'}`);
    }
  }
  if (options.requirePortfolioGate === true) {
    const strategyRaw = await readJsonFile(path.join(artifacts, 'portfolio-strategy.json')).catch(() => undefined);
    const strategy = PortfolioStrategySchema.safeParse(strategyRaw);
    if (!strategy.success) throw new Error('portfolio strategy gate is missing or invalid');
    if (!blueprint) throw new Error('portfolio gate validation requires the game blueprint');
    const requestedGameId = blueprintGameIdForRelease(blueprint);
    const portfolioResult = evaluatePortfolioGate(strategy.data, { requestedGameId });
    if (!portfolioResult.passed) throw new Error(`portfolio gate is not ready: ${portfolioResult.blockers.join(', ')}`);
  }
  const profileRaw = await readJsonFile(path.join(artifacts, 'profile-qa-evidence.json')).catch(() => undefined);
  if (profileRaw !== undefined) {
    const profile = ProfileQaReportSchema.parse(profileRaw);
    if (!profile.passed) throw new Error(`profile QA gate is not ready: ${profile.blockers.join(', ')}`);
  } else if (options.enforceOperatingGates) throw new Error('profile-qa-evidence gate is missing');
  const variationRaw = await readJsonFile(path.join(artifacts, 'variation-coverage-evaluation.json')).catch(() => undefined) as { passed?: unknown; blockers?: string[] } | undefined;
  if (options.enforceOperatingGates && (!variationRaw || variationRaw.passed !== true)) throw new Error(`variation coverage gate is not ready: ${variationRaw?.blockers?.join(', ') ?? 'missing'}`);
  if (options.enforceOperatingGates) {
    const planRaw = await readJsonFile(path.join(artifacts, 'account-capacity.json')).catch(() => undefined);
    const plan = AccountCapacityPlanSchema.safeParse(planRaw);
    if (!plan.success) throw new Error('account capacity plan is missing or invalid');
    const reportRaw = await readJsonFile(path.join(artifacts, 'account-capacity-evaluation.json')).catch(() => undefined);
    const report = AccountCapacityReportSchema.safeParse(reportRaw);
    if (!report.success) throw new Error('account capacity evaluation is missing or invalid');
    const expected = evaluateAccountCapacity(plan.data);
    if (report.data.passed !== expected.passed || JSON.stringify(report.data.blockers) !== JSON.stringify(expected.blockers)) throw new Error('account capacity evaluation does not match the plan');
    if (!report.data.passed) throw new Error(`account capacity gate is not ready: ${report.data.blockers.join(', ')}`);
    if (plan.data.source === 'portfolio' && (!plan.data.portfolioSnapshotHash || !plan.data.portfolioUpdatedAt)) throw new Error('portfolio-sourced account capacity plan is not hash-bound');
    if (plan.data.portfolioSnapshotHash !== report.data.portfolioSnapshotHash || plan.data.portfolioUpdatedAt !== report.data.portfolioUpdatedAt) throw new Error('account capacity evaluation portfolio binding does not match the plan');
  }
  return { preflight, matrix, completion, baseline, originality, iaa };
}

function blueprintGameIdForRelease(blueprint: GameBlueprint): string {
  const value = blueprint.gameId.trim();
  if (!value) throw new Error('blueprint gameId must not be empty');
  return value;
}

type CandidatePackage = {
  candidate: ReturnType<typeof ReleaseCandidateSchema.parse>;
  manifest: ReleaseManifest;
  packagedPromo: string;
};

async function copyRequiredReport(runRoot: string, name: string, destination: string): Promise<boolean> {
  try {
    const source = path.join(runRoot, 'artifacts', name);
    await assertRegularRunFile(runRoot, source, `release report ${name}`);
    await copyFile(source, destination);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/**
 * Create the immutable release-candidate package that a human will play.
 * This function deliberately does not require human acceptance: it is the
 * boundary between implementation QA and the final approval session.
 */
export async function packageReleaseCandidate(runRoot: string, blueprint: GameBlueprint, options: ReleaseOptions = {}): Promise<CandidatePackage> {
  const buildOutput = await resolveBuildOutput(runRoot);
  const workspaceDist = buildOutput.directory;
  const testedCoreHash = await hashDirectory(workspaceDist, runRoot);
  const matrix = await readJsonFile(path.join(runRoot, 'artifacts/platform-release-matrix.json')).catch(() => undefined) as PlatformReleaseMatrix | undefined;
  if (matrix) {
    const parsedMatrix = PlatformReleaseMatrixSchema.parse(matrix);
    if (parsedMatrix.coreHash !== testedCoreHash) throw new Error('platform-release-matrix coreHash does not match the currently tested dist');
  }
  const release = path.join(runRoot, 'release-candidate');
  try {
    const releaseStat = await lstat(release);
    if (releaseStat.isSymbolicLink() || !releaseStat.isDirectory()) throw new Error('release candidate root must be a real directory, not a symlink');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await clearDir(release);
  await copyTree(workspaceDist, path.join(release, 'web'));
  await ensureDir(path.join(release, 'reports'));
  const copiedBuild = await copyRequiredReport(runRoot, 'build-report.json', path.join(release, 'reports/build-report.json'));
  const copiedQa = await copyRequiredReport(runRoot, 'qa-report.json', path.join(release, 'reports/qa-report.json'));
  if (!copiedBuild || !copiedQa) throw new Error('release candidate requires build-report.json and qa-report.json');
  const operating = options.enforceOperatingGates ? {
    matrix: matrix ? PlatformReleaseMatrixSchema.parse(matrix) : undefined,
    baseline: await readJsonFile(path.join(runRoot, 'artifacts/quality-baseline.json')).catch(() => undefined),
    originality: await readJsonFile(path.join(runRoot, 'artifacts/originality-declaration.json')).catch(() => undefined),
    qualityMatrix: await readJsonFile(path.join(runRoot, 'artifacts/quality-gate-matrix.json')).catch(() => undefined),
  } : undefined;
  if (options.enforceOperatingGates && operating?.qualityMatrix === undefined) throw new Error('release candidate requires quality-gate-matrix.json');
  const boundQualityMatrix = operating?.qualityMatrix === undefined
    ? undefined
    : bindQualityGateMatrix(QualityGateMatrixSchema.parse(operating.qualityMatrix), testedCoreHash);
  if (options.enforceOperatingGates && boundQualityMatrix && !boundQualityMatrix.passed) {
    throw new Error(`release candidate requires a passing quality matrix: ${boundQualityMatrix.blockers.join(', ')}`);
  }
  const continuityContract = await readJsonFile(path.join(runRoot, 'artifacts/interaction-continuity-contract.json')).catch(() => undefined);
  let continuityReportForRelease: ReturnType<typeof InteractionContinuityReportSchema.parse> | undefined;
  if (continuityContract !== undefined) {
    InteractionContinuityContractSchema.parse(continuityContract);
    const continuityReport = await readJsonFile(path.join(runRoot, 'artifacts/interaction-continuity-report.json')).catch(() => undefined);
    if (continuityReport === undefined) throw new Error('declared interaction continuity contract requires interaction-continuity-report.json');
    continuityReportForRelease = InteractionContinuityReportSchema.parse(continuityReport);
    if (!continuityReportForRelease.passed) throw new Error(`interaction continuity gate failed: ${continuityReportForRelease.blockers.join(', ')}`);
  }
  if (operating?.baseline) await writeJsonAtomic(path.join(release, 'reports/quality-baseline.json'), operating.baseline);
  if (operating?.originality) await writeJsonAtomic(path.join(release, 'reports/originality-declaration.json'), operating.originality);
  if (operating?.matrix) await writeJsonAtomic(path.join(release, 'reports/platform-release-matrix.json'), operating.matrix);
  if (boundQualityMatrix) {
    await writeJsonAtomic(path.join(release, 'reports/quality-gate-matrix.json'), boundQualityMatrix);
    // Keep the run-level evidence bound too.  Final acceptance may add a
    // separate report, but it must never silently unbind the frozen candidate.
    await writeJsonAtomic(path.join(runRoot, 'artifacts/quality-gate-matrix.json'), boundQualityMatrix);
  }
  for (const reportName of ['iaa-contract.json', 'differentiation-contract.json', 'profile-qa-evidence.json', 'interaction-continuity-contract.json', 'interaction-continuity-report.json', 'interaction-continuity-summary.json', 'variation-coverage-plan.json', 'variation-coverage-evaluation.json', 'account-capacity.json', 'account-capacity-evaluation.json', 'unknown-register.json', 'unknown-evaluation.json', 'presentation-quality.json', 'presentation-evaluation.json', 'supply-chain.json', 'dependency-manifest.json', 'sbom.json', 'build-provenance.json', 'supply-chain-evaluation.json', 'dependency-policy.json', 'dependency-policy-evaluation.json', 'side-effect-journal.json', 'side-effect-evaluation.json', 'portfolio-strategy.json', 'portfolio-gate-evaluation.json', 'platform-policy.json', 'platform-policy-evaluation.json', 'platform-package-set.json', 'platform-package-evaluation.json']) {
    await copyRequiredReport(runRoot, reportName, path.join(release, 'reports', reportName));
  }
  if (continuityContract !== undefined && continuityReportForRelease) {
    const parsedContract = InteractionContinuityContractSchema.parse(continuityContract);
    const nodeIds = new Set(continuityReportForRelease.blockers.filter((item) => item.startsWith('node:')).map((item) => item.split(':')[1]).filter(Boolean));
    const summary = InteractionContinuitySummarySchema.parse({
      schemaVersion: 1,
      contractId: parsedContract.contractId,
      continuityPass: continuityReportForRelease.passed,
      checkedActionCount: parsedContract.actions.length,
      checkedNodeCount: continuityReportForRelease.checkedNodes,
      checkedScenarioCount: continuityReportForRelease.checkedScenarios,
      failedNodeCount: nodeIds.size,
      missingEvidenceCount: continuityReportForRelease.blockers.filter((item) => /missing|unverified/i.test(item)).length,
    });
    await writeJsonAtomic(path.join(release, 'summary.json'), summary);
    await writeJsonAtomic(path.join(release, 'reports/interaction-continuity-summary.json'), summary);
  }

  const assets = AssetManifestSchema.parse(await readJsonFile(path.join(runRoot, 'artifacts/asset-manifest.json')));
  const promoAsset = assets.assets.find((asset) => asset.kind === 'marketing');
  if (!promoAsset) throw new Error('Asset manifest does not contain a marketing asset');
  const promo = await resolveMarketingAsset(runRoot, promoAsset.path, buildOutput.runtime);
  const promoName = path.basename(promo);
  const packagedPromo = `marketing/${promoName}`;
  await ensureDir(path.join(release, 'marketing'));
  await copyFile(promo, path.join(release, packagedPromo));

  const beforeCandidate = await listFiles(release);
  const candidateFiles = await Promise.all(beforeCandidate.map(async (file) => ({ path: file, sha256: await sha256File(path.join(release, file)) })));
  const existingAcceptance = await readJsonFile(path.join(runRoot, 'artifacts/qa-report.json')).then((value) => {
    const parsed = QaReportSchema.safeParse(value);
    return parsed.success ? parsed.data.acceptance : undefined;
  }).catch(() => undefined);
  const integrity = buildReleaseIntegrity({ coreHash: testedCoreHash, platformChildren: operating?.matrix?.children ?? [], acceptance: existingAcceptance });
  assertSha256(integrity.coreHash, 'release candidate coreHash');
  const candidate = ReleaseCandidateSchema.parse({
    schemaVersion: 1,
    gameId: blueprint.gameId,
    coreHash: integrity.coreHash,
    platformHash: integrity.platformHash,
    acceptanceArtifact: 'reports/qa-report.json',
    platformMatrix: operating?.matrix ? 'reports/platform-release-matrix.json' : undefined,
    qualityMatrix: boundQualityMatrix ? 'reports/quality-gate-matrix.json' : undefined,
    testedAt: new Date().toISOString(),
    status: 'READY',
    files: candidateFiles,
    ...(existingAcceptance ? { acceptanceHash: integrity.acceptanceHash } : {}),
    qualityBaseline: operating?.baseline ? 'reports/quality-baseline.json' : undefined,
    originalityDeclaration: operating?.originality ? 'reports/originality-declaration.json' : undefined,
  });
  await writeJsonAtomic(path.join(release, 'reports/release-candidate.json'), candidate);
  await writeJsonAtomic(path.join(runRoot, 'artifacts/release-candidate.json'), candidate);
  const beforeManifest = await listFiles(release);
  const files = await Promise.all(beforeManifest.map(async (file) => ({ path: file, sha256: await sha256File(path.join(release, file)) })));
  const reports = ['reports/build-report.json', 'reports/qa-report.json', 'reports/release-candidate.json'];
  if (operating?.matrix) reports.push('reports/platform-release-matrix.json');
  if (operating?.baseline) reports.push('reports/quality-baseline.json');
  if (operating?.originality) reports.push('reports/originality-declaration.json');
  if (boundQualityMatrix) reports.push('reports/quality-gate-matrix.json');
  for (const reportName of ['iaa-contract.json', 'differentiation-contract.json', 'profile-qa-evidence.json', 'interaction-continuity-contract.json', 'interaction-continuity-report.json', 'variation-coverage-plan.json', 'variation-coverage-evaluation.json', 'account-capacity.json', 'account-capacity-evaluation.json', 'unknown-register.json', 'unknown-evaluation.json', 'presentation-quality.json', 'presentation-evaluation.json', 'supply-chain.json', 'dependency-manifest.json', 'sbom.json', 'build-provenance.json', 'supply-chain-evaluation.json', 'dependency-policy.json', 'dependency-policy-evaluation.json', 'side-effect-journal.json', 'side-effect-evaluation.json', 'portfolio-strategy.json', 'portfolio-gate-evaluation.json', 'platform-policy.json', 'platform-policy-evaluation.json', 'platform-package-set.json', 'platform-package-evaluation.json']) {
    try { await readFile(path.join(release, 'reports', reportName)); reports.push(`reports/${reportName}`); } catch { /* optional report */ }
  }
  const manifest: ReleaseManifest = {
    schemaVersion: 1,
    name: blueprint.title,
    description: `${blueprint.theme}主题的原创轻量经营小游戏。`,
    entrypoint: 'web/index.html',
    iconAndPromoAssets: [packagedPromo],
    reports,
    files,
    createdAt: new Date().toISOString(),
    coreHash: candidate.coreHash,
    platformMatrix: operating?.matrix ? 'reports/platform-release-matrix.json' : undefined,
    releaseCandidate: 'reports/release-candidate.json',
    platformHash: candidate.platformHash,
    acceptanceHash: candidate.acceptanceHash,
    qualityMatrix: boundQualityMatrix ? 'reports/quality-gate-matrix.json' : undefined,
    qualityBaseline: operating?.baseline ? 'reports/quality-baseline.json' : undefined,
    originalityDeclaration: operating?.originality ? 'reports/originality-declaration.json' : undefined,
  };
  await writeJsonAtomic(path.join(release, 'release-manifest.json'), manifest);
  return { candidate, manifest, packagedPromo };
}

/**
 * Bind the final player-facing acceptance record to the already-frozen
 * candidate.  Candidate web files are never rebuilt or replaced; only the
 * auditable metadata report receives the acceptance digest.
 */
export async function bindReleaseCandidateAcceptance(runRoot: string, acceptanceValue: unknown) {
  const acceptance = PlayerAcceptanceGateSchema.parse(acceptanceValue);
  const candidate = await readCandidatePackage(runRoot);
  await verifyFrozenCandidate(runRoot, candidate, candidate.coreHash);
  if (acceptance.candidateHash !== undefined && acceptance.candidateHash !== candidate.coreHash) {
    throw new Error('final acceptance candidate hash does not match the frozen release candidate');
  }
  const matrixRaw = await readJsonFile(path.join(runRoot, 'artifacts/platform-release-matrix.json')).catch(() => undefined);
  const platformChildren = matrixRaw && typeof matrixRaw === 'object' && Array.isArray((matrixRaw as { children?: unknown }).children)
    ? (matrixRaw as { children: Array<{ platform: string; status: string; artifactHash: string | null }> }).children
    : [];
  const acceptanceHash = buildReleaseIntegrity({ coreHash: candidate.coreHash, platformChildren: platformChildren as never, acceptance }).acceptanceHash;
  const next = { ...candidate, acceptanceHash };
  const parsed = ReleaseCandidateSchema.parse(next);
  await writeJsonAtomic(path.join(runRoot, 'artifacts/release-candidate.json'), parsed);
  await ensureDir(path.join(runRoot, 'release-candidate/reports'));
  await writeJsonAtomic(path.join(runRoot, 'release-candidate/reports/release-candidate.json'), parsed);
  return parsed;
}

async function readCandidatePackage(runRoot: string): Promise<ReturnType<typeof ReleaseCandidateSchema.parse>> {
  const candidates = [
    path.join(runRoot, 'artifacts/release-candidate.json'),
    path.join(runRoot, 'release-candidate/reports/release-candidate.json'),
  ];
  for (const file of candidates) {
    try { return ReleaseCandidateSchema.parse(await readJsonFile(file)); } catch { /* try the other canonical location */ }
  }
  throw new Error('immutable release candidate is missing; freeze a candidate before final release');
}

export async function verifyFrozenCandidate(runRoot: string, candidate: ReturnType<typeof ReleaseCandidateSchema.parse>, testedCoreHash: string) {
  if (candidate.coreHash !== testedCoreHash) throw new Error('release candidate hash does not match the currently tested build; rebuild and freeze a new candidate');
  const release = path.join(runRoot, 'release-candidate');
  const releaseStat = await lstat(release);
  if (!releaseStat.isDirectory() || releaseStat.isSymbolicLink()) throw new Error('release candidate root must be a real directory');
  const realRelease = await realpath(release);
  for (const file of candidate.files) {
    const target = path.resolve(release, file.path);
    if (!isWithin(release, target)) throw new Error(`release candidate file escapes package root: ${file.path}`);
    let actual: string;
    try {
      await assertRegularRunFile(runRoot, target, `release candidate file ${file.path}`);
      const realTarget = await realpath(target);
      if (!isWithin(realRelease, realTarget)) throw new Error(`release candidate file resolves outside package root: ${file.path}`);
      actual = await sha256File(target);
    } catch (error) {
      if (error instanceof Error && /outside|symlink|regular file/u.test(error.message)) throw error;
      throw new Error(`release candidate file is missing: ${file.path}`);
    }
    if (actual !== file.sha256) throw new Error(`release candidate file hash changed: ${file.path}`);
  }
}

export async function packageRelease(runRoot: string, blueprint: GameBlueprint, options: ReleaseOptions = {}): Promise<ReleaseManifest> {
  const qaReportRaw = await readJsonFile(path.join(runRoot, 'artifacts/qa-report.json')) as { acceptance?: unknown };
  const qaAcceptance = qaReportRaw.acceptance === undefined ? undefined : PlayerAcceptanceGateSchema.parse(qaReportRaw.acceptance);
  if (options.enforceAcceptance && qaReportRaw.acceptance === undefined) throw new Error('release requires artifacts/qa-report.json acceptance with all five player gates');
  if (qaReportRaw.acceptance !== undefined) {
    const qaReport = QaReportSchema.parse(qaReportRaw);
    if (!qaReport.acceptance?.releaseReady) throw new Error('player acceptance gate is not release-ready');
  }
  const buildOutput = await resolveBuildOutput(runRoot);
  const operating = options.enforceOperatingGates ? await validateOperatingGates(runRoot, options, blueprint) : undefined;
  const testedCoreHash = await hashDirectory(buildOutput.directory, runRoot);
  if (operating && operating.matrix.coreHash !== testedCoreHash) throw new Error('platform-release-matrix coreHash does not match the currently tested dist');

  let candidate: ReturnType<typeof ReleaseCandidateSchema.parse>;
  let packagedPromo: string;
  if (options.reuseCandidate) {
    candidate = await readCandidatePackage(runRoot);
    await verifyFrozenCandidate(runRoot, candidate, testedCoreHash);
    if (qaAcceptance) {
      if (qaAcceptance.candidateHash !== undefined && qaAcceptance.candidateHash !== candidate.coreHash) throw new Error('player acceptance candidate hash does not match the frozen release candidate');
      const expectedAcceptanceHash = buildReleaseIntegrity({ coreHash: candidate.coreHash, platformChildren: operating?.matrix?.children ?? [], acceptance: qaAcceptance }).acceptanceHash;
      if (candidate.acceptanceHash === undefined) {
        if (options.enforceAcceptance || options.enforceOperatingGates) throw new Error('release candidate is missing the final acceptance hash');
      } else if (candidate.acceptanceHash !== expectedAcceptanceHash) {
        throw new Error('release candidate acceptance hash does not match the final acceptance record');
      }
    } else if (options.enforceAcceptance || options.enforceOperatingGates) {
      throw new Error('release requires a final acceptance record bound to the frozen candidate');
    }
    if (options.enforceOperatingGates) {
      const qualityMatrix = QualityGateMatrixSchema.parse(await readJsonFile(path.join(runRoot, 'artifacts/quality-gate-matrix.json')));
      assertQualityGateCandidateBinding(qualityMatrix, candidate.coreHash);
    }
    packagedPromo = (candidate.files.find((file) => file.path.startsWith('marketing/'))?.path ?? 'marketing/promo.png');
    // Human acceptance belongs to the final evidence set, but never replaces
    // files that were hashed and played in the frozen candidate.
    await ensureDir(path.join(runRoot, 'release-candidate/reports'));
    await copyRequiredReport(runRoot, 'qa-report.json', path.join(runRoot, 'release-candidate/reports/final-qa-report.json'));
    if (operating) {
      await copyFile(path.join(runRoot, 'artifacts/quality-baseline.json'), path.join(runRoot, 'release-candidate/reports/final-quality-baseline.json'));
      await copyFile(path.join(runRoot, 'artifacts/originality-declaration.json'), path.join(runRoot, 'release-candidate/reports/final-originality-declaration.json'));
      await copyFile(path.join(runRoot, 'artifacts/quality-gate-matrix.json'), path.join(runRoot, 'release-candidate/reports/final-quality-gate-matrix.json'));
    }
    for (const reportName of ['side-effect-journal.json', 'side-effect-evaluation.json', 'portfolio-strategy.json', 'portfolio-gate-evaluation.json', 'platform-policy.json', 'platform-policy-evaluation.json', 'dependency-policy.json', 'dependency-policy-evaluation.json']) {
      await copyRequiredReport(runRoot, reportName, path.join(runRoot, 'release-candidate/reports', `final-${reportName}`));
    }
  } else {
    const frozen = await packageReleaseCandidate(runRoot, blueprint, options);
    candidate = frozen.candidate;
    packagedPromo = frozen.packagedPromo;
  }

  const release = path.join(runRoot, 'release-candidate');
  const beforeManifest = await listFiles(release);
  const files = await Promise.all(beforeManifest.map(async (file) => ({ path: file, sha256: await sha256File(path.join(release, file)) })));
  const reports = ['reports/build-report.json', 'reports/qa-report.json', 'reports/release-candidate.json'];
  if (options.reuseCandidate) {
    reports.push('reports/final-qa-report.json');
    for (const reportName of ['side-effect-journal.json', 'side-effect-evaluation.json', 'portfolio-strategy.json', 'portfolio-gate-evaluation.json', 'platform-policy.json', 'platform-policy-evaluation.json', 'dependency-policy.json', 'dependency-policy-evaluation.json']) {
      try { await readFile(path.join(release, 'reports', `final-${reportName}`)); reports.push(`reports/final-${reportName}`); } catch { /* optional in legacy candidates */ }
    }
  }
  if (operating) reports.push('reports/platform-release-matrix.json', 'reports/quality-baseline.json', 'reports/originality-declaration.json', 'reports/final-quality-gate-matrix.json');
  if (candidate.qualityMatrix && !reports.includes(candidate.qualityMatrix)) reports.push(candidate.qualityMatrix);
  for (const reportName of ['iaa-contract.json', 'differentiation-contract.json', 'profile-qa-evidence.json', 'variation-coverage-plan.json', 'variation-coverage-evaluation.json', 'account-capacity.json', 'account-capacity-evaluation.json', 'unknown-register.json', 'unknown-evaluation.json', 'presentation-quality.json', 'presentation-evaluation.json', 'supply-chain.json', 'dependency-manifest.json', 'sbom.json', 'build-provenance.json', 'supply-chain-evaluation.json', 'dependency-policy.json', 'dependency-policy-evaluation.json', 'side-effect-journal.json', 'side-effect-evaluation.json', 'portfolio-strategy.json', 'portfolio-gate-evaluation.json', 'platform-policy.json', 'platform-policy-evaluation.json', 'platform-package-set.json', 'platform-package-evaluation.json']) {
    try { await readFile(path.join(release, 'reports', reportName)); if (!reports.includes(`reports/${reportName}`)) reports.push(`reports/${reportName}`); } catch { /* optional report */ }
  }
  const manifest: ReleaseManifest = {
    schemaVersion: 1,
    name: blueprint.title,
    description: `${blueprint.theme}主题的原创轻量经营小游戏。`,
    entrypoint: 'web/index.html',
    iconAndPromoAssets: [packagedPromo],
    reports,
    files,
    createdAt: new Date().toISOString(),
    coreHash: candidate.coreHash,
    platformMatrix: operating ? 'reports/platform-release-matrix.json' : candidate.platformMatrix,
    releaseCandidate: 'reports/release-candidate.json',
    platformHash: candidate.platformHash,
    acceptanceHash: candidate.acceptanceHash,
    qualityMatrix: options.reuseCandidate ? 'reports/final-quality-gate-matrix.json' : candidate.qualityMatrix,
    qualityBaseline: operating ? 'reports/quality-baseline.json' : candidate.qualityBaseline,
    originalityDeclaration: operating ? 'reports/originality-declaration.json' : candidate.originalityDeclaration,
  };
  await writeJsonAtomic(path.join(release, 'release-manifest.json'), manifest);
  return manifest;
}
