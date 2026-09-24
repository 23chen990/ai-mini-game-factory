import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { exists, listFiles, sha256File, sha256Text } from './files.js';
import { verifyEvidenceFileBindings } from './evidence-provenance.js';
import { evaluatePermissionManifestBundle } from './permission-manifest.js';
import { verifyPerceptualQaReview } from './product-experience-qa.js';
import { validatePipelinePlan } from './pipeline-plan.js';
import { verifyReferenceFidelityReview } from './reference-evidence.js';
import { EvidenceProvenanceManifestSchema, type EvidenceProvenanceManifest } from '../schemas/evidence-provenance.js';
import { HumanPlaytestAcceptanceSchema } from '../schemas/factory-operating.js';
import { PerceptualQaGateSchema, ProductExperienceContractSchema, type ProductExperienceContract } from '../schemas/product-experience.js';
import { PermissionManifestBundleSchema } from '../schemas/permission-manifest.js';
import { ReferenceBehaviorAnalysisSchema } from '../schemas/reference-evidence.js';
import { REFERENCE_BEHAVIOR_DIMENSIONS, ReferenceFidelityContractSchema, ReferenceFidelityGateSchema, type ReferenceFidelityContract } from '../schemas/reference-fidelity.js';
import { ReferenceQualityAuditSchema, type ReferenceQualityArtifactCheck, type ReferenceQualityAudit } from '../schemas/reference-quality-audit.js';
import { BuildReportSchema, RunStateSchema, SeedSchema, StageNameSchema, type RunState, type Seed } from '../schemas/index.js';

const EVIDENCE_PURPOSES = ['gameplay-reference', 'design-document'] as const;
const REQUIRED_REFERENCE_STAGES = [
  'REFERENCE_DEEP_RESEARCH',
  'REFERENCE_MECHANIC_LOCK',
  'WAITING_FOR_REFERENCE_APPROVAL',
  'PRODUCT_EXPERIENCE_CONTRACT',
  'FULL_BUILD',
  'QA',
  'WAITING_FOR_HUMAN_PLAYTEST',
] as const;

type BootstrapFile = ReferenceQualityAudit['bootstrap']['files'][number];

function gameIdFromTitle(title: string) {
  return title.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/giu, '-').replace(/^-|-$/gu, '') || 'game';
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8')) as unknown;
}

async function hashBuildDirectory(directory: string) {
  const files = await listFiles(directory);
  const entries = await Promise.all(files.map(async (file) => `${file}:${await sha256File(path.join(directory, file))}`));
  return { hash: sha256Text(entries.join('\n')), files };
}

async function inspectBootstrap(input: { runRoot: string; targetRunId: string }) {
  let state: RunState | undefined;
  let seed: Seed | undefined;
  const files: BootstrapFile[] = [];

  const statePath = 'state.json';
  const stateFile = path.join(input.runRoot, statePath);
  if (!await exists(stateFile)) {
    files.push({ path: statePath, status: 'MISSING', blockers: [`bootstrap:missing:${statePath}`] });
  } else {
    try {
      state = RunStateSchema.parse(await readJson(stateFile));
      const blockers = state.runId === input.targetRunId ? [] : [`bootstrap:state-run-mismatch:${state.runId}`];
      files.push({ path: statePath, status: blockers.length === 0 ? 'VALID' : 'STALE', blockers });
    } catch {
      files.push({ path: statePath, status: 'INVALID', blockers: [`bootstrap:schema-invalid:${statePath}`] });
    }
  }

  const seedPath = 'input/seed.yaml';
  const seedFile = path.join(input.runRoot, seedPath);
  if (!await exists(seedFile)) {
    files.push({ path: seedPath, status: 'MISSING', blockers: [`bootstrap:missing:${seedPath}`] });
  } else {
    try {
      seed = SeedSchema.parse(parseYaml(await readFile(seedFile, 'utf8')));
      const blockers = seed.designMode === 'reference_reskin' ? [] : ['bootstrap:seed-not-reference-reskin'];
      files.push({ path: seedPath, status: blockers.length === 0 ? 'VALID' : 'STALE', blockers });
    } catch {
      files.push({ path: seedPath, status: 'INVALID', blockers: [`bootstrap:schema-invalid:${seedPath}`] });
    }
  }

  const planPath = 'artifacts/pipeline-plan.json';
  const planFile = path.join(input.runRoot, planPath);
  if (!await exists(planFile)) {
    files.push({ path: planPath, status: 'MISSING', blockers: [`bootstrap:missing:${planPath}`] });
  } else {
    try {
      const plan = validatePipelinePlan(await readJson(planFile));
      const missingStages = REQUIRED_REFERENCE_STAGES.filter((stage) => !plan.mandatoryStages.includes(stage));
      const blockers = [
        ...(plan.designMode === 'reference_reskin' ? [] : ['bootstrap:pipeline-not-reference-reskin']),
        ...missingStages.map((stage) => `bootstrap:pipeline-stage-missing:${stage}`),
      ];
      files.push({ path: planPath, status: blockers.length === 0 ? 'VALID' : 'STALE', blockers });
    } catch {
      files.push({ path: planPath, status: 'INVALID', blockers: [`bootstrap:schema-invalid:${planPath}`] });
    }
  }

  const blockers = files.flatMap((file) => file.blockers);
  const status = files.some((file) => file.status === 'MISSING')
    ? 'INCOMPLETE' as const
    : files.some((file) => file.status === 'INVALID')
      ? 'INVALID' as const
      : files.some((file) => file.status === 'STALE')
        ? 'STALE' as const
        : 'CANONICAL' as const;
  return { state, seed, bootstrap: { status, files, blockers } };
}

async function inspectPermissionManifest(runRoot: string): Promise<ReferenceQualityAudit['permissionManifest']> {
  const relative = 'artifacts/permission-manifest.json';
  const file = path.join(runRoot, relative);
  if (!await exists(file)) return { path: relative, status: 'MISSING', blockers: ['permission-manifest:missing'] };
  let value: unknown;
  try { value = await readJson(file); } catch { return { path: relative, status: 'INVALID', blockers: ['permission-manifest:schema-invalid'] }; }
  const parsed = PermissionManifestBundleSchema.safeParse(value);
  if (!parsed.success) return { path: relative, status: 'INVALID', blockers: ['permission-manifest:schema-invalid'] };
  const evaluation = evaluatePermissionManifestBundle(parsed.data, { requiredStages: StageNameSchema.options });
  if (!evaluation.passed) {
    const blockers = evaluation.blockers.map((blocker) => `permission-manifest:${blocker}`);
    const status = evaluation.blockers.every((blocker) => blocker.startsWith('missing-stage:')) ? 'STALE' as const : 'INVALID' as const;
    return { path: relative, status, blockers };
  }
  const research = parsed.data.manifests.find((manifest) => manifest.stage === 'REFERENCE_DEEP_RESEARCH');
  if (!research?.readScope.includes('reference-evidence/')) {
    return { path: relative, status: 'STALE', blockers: ['permission-manifest:reference-evidence-read-scope-missing'] };
  }
  return { path: relative, status: 'CURRENT', blockers: [] };
}

function isBoundEvidenceSource(entries: EvidenceProvenanceManifest['entries'], source: { path: string; sha256: string }) {
  return entries.some((entry) => entry.usableAsEvidence
    && EVIDENCE_PURPOSES.includes(entry.purpose as typeof EVIDENCE_PURPOSES[number])
    && entry.sha256 === source.sha256
    && (entry.sourcePath === source.path || entry.storedPath === source.path));
}

async function inspectArtifact(input: {
  runRoot: string;
  id: ReferenceQualityArtifactCheck['id'];
  relative: string;
  requiredNow: boolean;
  validate: (value: unknown) => Promise<{ status: 'READY' | 'PASSED' | 'BLOCKED' | 'ACCEPTED' | 'STALE'; blockers: string[] }> | { status: 'READY' | 'PASSED' | 'BLOCKED' | 'ACCEPTED' | 'STALE'; blockers: string[] };
}): Promise<ReferenceQualityArtifactCheck> {
  const file = path.join(input.runRoot, input.relative);
  if (!await exists(file)) {
    return ReferenceQualityAuditSchema.shape.contracts.element.parse({
      id: input.id,
      path: input.relative,
      requiredNow: input.requiredNow,
      status: input.requiredNow ? 'MISSING' : 'PENDING',
      blockers: input.requiredNow ? [`reference-quality:artifact-missing:${input.relative}`] : [],
    });
  }
  let value: unknown;
  try { value = await readJson(file); }
  catch {
    return ReferenceQualityAuditSchema.shape.contracts.element.parse({ id: input.id, path: input.relative, requiredNow: input.requiredNow, status: 'INVALID', blockers: [`reference-quality:artifact-invalid:${input.relative}`] });
  }
  try {
    const result = await input.validate(value);
    return ReferenceQualityAuditSchema.shape.contracts.element.parse({ id: input.id, path: input.relative, requiredNow: input.requiredNow, ...result });
  } catch {
    return ReferenceQualityAuditSchema.shape.contracts.element.parse({ id: input.id, path: input.relative, requiredNow: input.requiredNow, status: 'INVALID', blockers: [`reference-quality:artifact-invalid:${input.relative}`] });
  }
}

export async function auditReferenceQuality(input: {
  runRoot: string;
  targetRunId: string;
  targetGame?: string;
  targetWorkspace?: string;
  checkedAt?: string;
}): Promise<ReferenceQualityAudit> {
  const runRoot = path.resolve(input.runRoot);
  if (!await exists(runRoot)) throw new Error(`reference quality audit run does not exist: ${runRoot}`);
  const { state, seed, bootstrap } = await inspectBootstrap({ runRoot, targetRunId: input.targetRunId });
  const manifestRelative = 'reference-evidence/manifest.json';
  const manifestFile = path.join(runRoot, manifestRelative);
  const manifestPresent = await exists(manifestFile);
  let manifestValue: unknown;
  let parsedManifest: ReturnType<typeof EvidenceProvenanceManifestSchema.safeParse> | undefined;
  if (manifestPresent) {
    try {
      manifestValue = await readJson(manifestFile);
      parsedManifest = EvidenceProvenanceManifestSchema.safeParse(manifestValue);
    } catch { /* reported below */ }
  }
  const canonicalGame = seed ? gameIdFromTitle(seed.title) : undefined;
  const targetGame = input.targetGame ?? canonicalGame ?? (parsedManifest?.success ? parsedManifest.data.targetGame : input.targetRunId);
  const targetWorkspace = path.resolve(input.targetWorkspace ?? (parsedManifest?.success ? parsedManifest.data.workspace : path.join(runRoot, 'workspace/game')));

  const emptyPurposeCounts = { gameplayReference: 0, designDocument: 0, platformQa: 0, packageIdentity: 0, other: 0 };
  let verifiedEntries: EvidenceProvenanceManifest['entries'] = [];
  let evidence: ReferenceQualityAudit['evidence'];
  if (!manifestPresent) {
    evidence = { manifestPath: manifestRelative, status: 'MISSING', relevantEntryCount: 0, verifiedRelevantEntryCount: 0, quarantinedEntryCount: 0, purposeCounts: emptyPurposeCounts, blockers: ['evidence-provenance:manifest-missing'] };
  } else if (!parsedManifest?.success) {
    evidence = { manifestPath: manifestRelative, status: 'INVALID', relevantEntryCount: 0, verifiedRelevantEntryCount: 0, quarantinedEntryCount: 0, purposeCounts: emptyPurposeCounts, blockers: ['evidence-provenance:schema-invalid'] };
  } else {
    const entries = parsedManifest.data.entries;
    const purposeCounts = {
      gameplayReference: entries.filter((entry) => entry.purpose === 'gameplay-reference').length,
      designDocument: entries.filter((entry) => entry.purpose === 'design-document').length,
      platformQa: entries.filter((entry) => entry.purpose === 'platform-qa').length,
      packageIdentity: entries.filter((entry) => entry.purpose === 'package-identity').length,
      other: entries.filter((entry) => entry.purpose === 'other').length,
    };
    const relevant = entries.filter((entry) => EVIDENCE_PURPOSES.includes(entry.purpose as typeof EVIDENCE_PURPOSES[number]));
    verifiedEntries = relevant.filter((entry) => entry.usableAsEvidence);
    const verification = await verifyEvidenceFileBindings(parsedManifest.data, { targetGame, workspace: targetWorkspace }, { runRoot, requireRunLocal: true, purposes: EVIDENCE_PURPOSES });
    evidence = {
      manifestPath: manifestRelative,
      status: verification.passed ? 'VERIFIED' : 'BLOCKED',
      relevantEntryCount: relevant.length,
      verifiedRelevantEntryCount: verifiedEntries.length,
      quarantinedEntryCount: entries.filter((entry) => !entry.usableAsEvidence).length,
      purposeCounts,
      blockers: verification.blockers,
    };
  }

  const permissionManifest = await inspectPermissionManifest(runRoot);
  const stageReached = (stage: keyof RunState['stages']) => state?.stages[stage]?.status === 'completed' || state?.stages[stage]?.status === 'waiting';
  const buildRelative = 'artifacts/build-report.json';
  const buildFile = path.join(runRoot, buildRelative);
  const buildRequired = stageReached('FULL_BUILD') || state?.stage === 'QA' || state?.stage === 'PERCEPTUAL_QA' || state?.stage === 'WAITING_FOR_HUMAN_PLAYTEST' || state?.stage === 'COMPLETED';
  let build: ReferenceQualityAudit['build'];
  if (!await exists(buildFile)) {
    build = {
      path: buildRelative,
      requiredNow: buildRequired,
      status: buildRequired ? 'MISSING' : 'PENDING',
      blockers: buildRequired ? [`reference-quality:artifact-missing:${buildRelative}`] : [],
    };
  } else {
    try {
      const report = BuildReportSchema.parse(await readJson(buildFile));
      const reportWorkspace = path.resolve(path.isAbsolute(report.workspace) ? report.workspace : path.join(runRoot, report.workspace));
      const outputPath = path.resolve(path.isAbsolute(report.webBuild) ? report.webBuild : path.join(runRoot, report.webBuild));
      const outputRelative = path.relative(targetWorkspace, outputPath);
      const blockers = [
        ...(report.success ? [] : ['build-report:not-successful']),
        ...(reportWorkspace === targetWorkspace ? [] : ['build-report:workspace-mismatch']),
        ...(!outputRelative || outputRelative === '..' || outputRelative.startsWith(`..${path.sep}`) || path.isAbsolute(outputRelative) ? ['build-report:output-outside-target-workspace'] : []),
      ];
      let buildHash: string | undefined;
      if (blockers.length === 0) {
        try {
          const hashed = await hashBuildDirectory(outputPath);
          if (hashed.files.length === 0) blockers.push('build-report:output-empty');
          else buildHash = hashed.hash;
        } catch { blockers.push('build-report:output-unavailable'); }
      }
      build = { path: buildRelative, requiredNow: buildRequired, status: blockers.length === 0 ? 'READY' : 'BLOCKED', ...(buildHash ? { buildHash } : {}), blockers };
    } catch {
      build = { path: buildRelative, requiredNow: buildRequired, status: 'INVALID', blockers: [`reference-quality:artifact-invalid:${buildRelative}`] };
    }
  }
  const buildExists = build.status === 'READY';
  const researchRequired = stageReached('REFERENCE_DEEP_RESEARCH') || buildExists || await exists(path.join(runRoot, 'artifacts/reference-fidelity-contract.json'));
  const productRequired = stageReached('PRODUCT_EXPERIENCE_CONTRACT') || buildExists;
  const referenceGateRequired = stageReached('QA') || state?.stage === 'WAITING_FOR_HUMAN_PLAYTEST' || state?.stage === 'COMPLETED';
  const perceptualGateRequired = stageReached('PERCEPTUAL_QA');
  const acceptanceRequired = state?.stage === 'WAITING_FOR_HUMAN_PLAYTEST' || state?.stage === 'COMPLETED';

  let behaviorAnalysis: ReturnType<typeof ReferenceBehaviorAnalysisSchema.parse> | undefined;
  const behaviorCheck = await inspectArtifact({
    runRoot,
    id: 'reference-behavior-analysis',
    relative: 'artifacts/reference-behavior-analysis.json',
    requiredNow: researchRequired,
    validate: (value) => {
      behaviorAnalysis = ReferenceBehaviorAnalysisSchema.parse(value);
      const blockers = [
        ...(behaviorAnalysis.targetRunId === input.targetRunId ? [] : ['reference-behavior-analysis:run-mismatch']),
        ...(behaviorAnalysis.status === 'READY' ? [] : ['reference-behavior-analysis:not-ready']),
        ...behaviorAnalysis.behaviorChecks.flatMap((check) => check.sourceRefs.filter((source) => !isBoundEvidenceSource(verifiedEntries, source)).map(() => `reference-behavior-analysis:source-unbound:${check.id}`)),
      ];
      return { status: blockers.length === 0 ? 'READY' : 'BLOCKED', blockers };
    },
  });

  let fidelityContract: ReferenceFidelityContract | undefined;
  const fidelityCheck = await inspectArtifact({
    runRoot,
    id: 'reference-fidelity-contract',
    relative: 'artifacts/reference-fidelity-contract.json',
    requiredNow: researchRequired,
    validate: (value) => {
      fidelityContract = ReferenceFidelityContractSchema.parse(value);
      const dimensions = new Set(fidelityContract.behaviorChecks.map((check) => check.dimension));
      const behaviorIds = behaviorAnalysis?.behaviorChecks.map((check) => check.id) ?? [];
      const fidelityIds = fidelityContract.behaviorChecks.map((check) => check.id);
      const blockers = [
        ...(fidelityContract.targetRunId === input.targetRunId ? [] : ['reference-fidelity-contract:run-mismatch']),
        ...(fidelityContract.status === 'READY' ? [] : fidelityContract.blockers.length > 0 ? fidelityContract.blockers : ['reference-fidelity-contract:not-ready']),
        ...REFERENCE_BEHAVIOR_DIMENSIONS.filter((dimension) => !dimensions.has(dimension)).map((dimension) => `reference-fidelity-contract:dimension-missing:${dimension}`),
        ...fidelityContract.provenance.filter((source) => !isBoundEvidenceSource(verifiedEntries, source)).map((source) => `reference-fidelity-contract:source-unbound:${source.path}`),
        ...(behaviorAnalysis && (behaviorIds.length !== fidelityIds.length || behaviorIds.some((id) => !fidelityIds.includes(id))) ? ['reference-fidelity-contract:behavior-analysis-mismatch'] : []),
      ];
      return { status: blockers.length === 0 ? 'READY' : 'BLOCKED', blockers };
    },
  });

  let productContract: ProductExperienceContract | undefined;
  const productCheck = await inspectArtifact({
    runRoot,
    id: 'product-experience-contract',
    relative: 'artifacts/product-experience-contract.json',
    requiredNow: productRequired,
    validate: async (value) => {
      productContract = ProductExperienceContractSchema.parse(value);
      const sourcePathMatches = productContract.sourceArtifact.path === 'artifacts/reference-fidelity-contract.json';
      const sourceFile = path.join(runRoot, 'artifacts/reference-fidelity-contract.json');
      const sourceHash = sourcePathMatches && await exists(sourceFile) ? await sha256File(sourceFile) : undefined;
      const blockers = [
        ...(productContract.targetRunId === input.targetRunId ? [] : ['product-experience-contract:run-mismatch']),
        ...(productContract.targetGame === targetGame ? [] : ['product-experience-contract:game-mismatch']),
        ...(path.resolve(productContract.targetWorkspace) === targetWorkspace ? [] : ['product-experience-contract:workspace-mismatch']),
        ...(productContract.sourceArtifact.kind === 'reference-fidelity' ? [] : ['product-experience-contract:not-reference-derived']),
        ...(sourcePathMatches ? [] : ['product-experience-contract:source-path-mismatch']),
        ...(sourceHash === productContract.sourceArtifact.sha256 ? [] : ['product-experience-contract:source-hash-mismatch']),
      ];
      if (buildExists) {
        for (const entrypoint of productContract.runtimeEntrypoints) {
          const absolute = path.resolve(targetWorkspace, entrypoint);
          const relative = path.relative(targetWorkspace, absolute);
          if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !await exists(absolute)) blockers.push(`product-experience-contract:runtime-entrypoint-missing:${entrypoint}`);
        }
      }
      return { status: blockers.length === 0 ? 'READY' : 'BLOCKED', blockers };
    },
  });

  let referenceGateBuildHash: string | undefined;
  const referenceGateCheck = await inspectArtifact({
    runRoot,
    id: 'reference-fidelity-gate',
    relative: 'artifacts/reference-fidelity-gate.json',
    requiredNow: referenceGateRequired,
    validate: async (value) => {
      const gate = ReferenceFidelityGateSchema.parse(value);
      referenceGateBuildHash = gate.buildHash;
      const review = await exists(path.join(runRoot, 'artifacts/reference-fidelity-review.json')) ? await readJson(path.join(runRoot, 'artifacts/reference-fidelity-review.json')) : undefined;
      const verified = fidelityContract
        ? await verifyReferenceFidelityReview({ runRoot, targetRunId: input.targetRunId, workspace: targetWorkspace, buildHash: gate.buildHash, contract: fidelityContract, review })
        : undefined;
      const blockers = [
        ...(gate.targetRunId === input.targetRunId ? [] : ['reference-fidelity-gate:run-mismatch']),
        ...(build.buildHash === gate.buildHash ? [] : ['reference-fidelity-gate:build-hash-mismatch']),
        ...(fidelityContract && gate.contractHash === sha256Text(JSON.stringify(fidelityContract)) ? [] : ['reference-fidelity-gate:contract-hash-mismatch']),
        ...(gate.passed ? [] : gate.blockers.length > 0 ? gate.blockers : ['reference-fidelity-gate:not-passed']),
        ...(verified?.passed ? [] : verified?.blockers ?? ['reference-fidelity-gate:contract-unavailable']),
        ...(verified && JSON.stringify(gate.requiredCheckIds) === JSON.stringify(verified.requiredCheckIds) && JSON.stringify(gate.checkedIds) === JSON.stringify(verified.checkedIds) ? [] : ['reference-fidelity-gate:review-projection-mismatch']),
      ];
      return { status: blockers.length === 0 ? 'PASSED' : 'BLOCKED', blockers: [...new Set(blockers)] };
    },
  });

  let perceptualGateBuildHash: string | undefined;
  const perceptualGateCheck = await inspectArtifact({
    runRoot,
    id: 'perceptual-qa-gate',
    relative: 'artifacts/perceptual-qa-gate.json',
    requiredNow: perceptualGateRequired,
    validate: async (value) => {
      const gate = PerceptualQaGateSchema.parse(value);
      perceptualGateBuildHash = gate.buildHash;
      const report = await exists(path.join(runRoot, 'artifacts/perceptual-qa-report.json')) ? await readJson(path.join(runRoot, 'artifacts/perceptual-qa-report.json')) : undefined;
      const verified = productContract
        ? await verifyPerceptualQaReview({ runRoot, workspace: targetWorkspace, contract: productContract, buildHash: gate.buildHash, report })
        : undefined;
      const blockers = [
        ...(gate.targetRunId === input.targetRunId ? [] : ['perceptual-qa-gate:run-mismatch']),
        ...(build.buildHash === gate.buildHash ? [] : ['perceptual-qa-gate:build-hash-mismatch']),
        ...(gate.passed ? [] : gate.blockers.length > 0 ? gate.blockers : ['perceptual-qa-gate:not-passed']),
        ...(verified?.passed ? [] : verified?.blockers ?? ['perceptual-qa-gate:contract-unavailable']),
        ...(verified && JSON.stringify(gate.requiredCaseIds) === JSON.stringify(verified.requiredCaseIds) && JSON.stringify(gate.checkedCaseIds) === JSON.stringify(verified.checkedCaseIds) ? [] : ['perceptual-qa-gate:review-projection-mismatch']),
      ];
      return { status: blockers.length === 0 ? 'PASSED' : 'BLOCKED', blockers: [...new Set(blockers)] };
    },
  });

  const acceptanceCheck = await inspectArtifact({
    runRoot,
    id: 'core-demo-acceptance',
    relative: 'human/playtest-acceptance.json',
    requiredNow: acceptanceRequired,
    validate: (value) => {
      const acceptance = HumanPlaytestAcceptanceSchema.parse(value);
      const expectedBuildHash = perceptualGateBuildHash ?? referenceGateBuildHash;
      const blockers = [
        ...(acceptance.sessionId === 'CORE_DEMO' ? [] : ['core-demo-acceptance:session-mismatch']),
        ...(acceptance.passed ? [] : ['core-demo-acceptance:rejected']),
        ...(expectedBuildHash && acceptance.buildHash === expectedBuildHash ? [] : ['core-demo-acceptance:build-hash-mismatch']),
      ];
      return { status: blockers.length === 0 ? 'ACCEPTED' : 'BLOCKED', blockers };
    },
  });

  const contracts = [behaviorCheck, fidelityCheck, productCheck, referenceGateCheck, perceptualGateCheck, acceptanceCheck];
  const qualityBlockers = contracts
    .filter((check) => check.requiredNow || !['PENDING', 'READY', 'PASSED', 'ACCEPTED'].includes(check.status))
    .flatMap((check) => check.blockers);
  const buildBlockers = build.requiredNow || !['PENDING', 'READY'].includes(build.status) ? build.blockers : [];
  const blockers = [...new Set([...evidence.blockers, ...bootstrap.blockers, ...permissionManifest.blockers, ...buildBlockers, ...qualityBlockers])];
  const completionClaimAllowed = build.status === 'READY'
    && acceptanceCheck.status === 'ACCEPTED'
    && referenceGateCheck.status === 'PASSED'
    && (!perceptualGateRequired || perceptualGateCheck.status === 'PASSED');

  let disposition: ReferenceQualityAudit['disposition'];
  if (evidence.status !== 'VERIFIED') disposition = 'BLOCKED_EVIDENCE';
  else if (bootstrap.status === 'INCOMPLETE') disposition = 'REQUIRES_NEW_RUN_MIGRATION';
  else if (bootstrap.status !== 'CANONICAL' || permissionManifest.status !== 'CURRENT') disposition = 'BLOCKED_CONTROL_PLANE';
  else if (buildBlockers.length > 0 || qualityBlockers.length > 0) disposition = 'REQUIRES_QUALITY_RETEST';
  else if (completionClaimAllowed) disposition = 'CORE_DEMO_ACCEPTED';
  else disposition = 'READY_FOR_STANDARD_RESUME';

  const dispositionBlockers = disposition === 'READY_FOR_STANDARD_RESUME' || disposition === 'CORE_DEMO_ACCEPTED' ? [] : blockers;
  const nextActions: Record<ReferenceQualityAudit['disposition'], string[]> = {
    READY_FOR_STANDARD_RESUME: [`Resume the canonical run with: pnpm factory resume ${input.targetRunId}`],
    REQUIRES_NEW_RUN_MIGRATION: ['Create a new canonical reference_reskin run from a validated seed; do not synthesize missing state, seed, or pipeline files in the historical run.', 'Re-ingest only verified reference/design sources into the new run and bind them to its workspace/game path.'],
    BLOCKED_EVIDENCE: ['Resolve the listed provenance, target, run-local-copy, or SHA-256 blockers before research or build execution.'],
    BLOCKED_CONTROL_PLANE: ['Create or intentionally migrate to a run with the current frozen pipeline plan and permission-manifest bundle; do not silently widen an existing run.'],
    REQUIRES_QUALITY_RETEST: ['Regenerate or retest only the listed required contracts and independent QA gates before any completion claim.'],
    CORE_DEMO_ACCEPTED: ['The hash-bound core demo may proceed to an explicitly authorized full-validation/content-expansion run.'],
  };
  return ReferenceQualityAuditSchema.parse({
    schemaVersion: 1,
    artifactType: 'reference-quality-audit',
    targetRunId: input.targetRunId,
    targetGame,
    targetWorkspace,
    runRoot,
    checkedAt: input.checkedAt ?? new Date().toISOString(),
    evidence,
    bootstrap,
    permissionManifest,
    build,
    contracts,
    disposition,
    summary: {
      standardResumeSafe: disposition === 'READY_FOR_STANDARD_RESUME' || disposition === 'CORE_DEMO_ACCEPTED',
      migrationRequired: disposition === 'REQUIRES_NEW_RUN_MIGRATION',
      completionClaimAllowed: disposition === 'CORE_DEMO_ACCEPTED',
    },
    blockers: dispositionBlockers,
    nextActions: nextActions[disposition],
    generatedWorkspaceModified: false,
  });
}
