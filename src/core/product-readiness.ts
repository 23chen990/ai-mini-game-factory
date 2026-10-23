import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { evaluateIaaContract } from './iaa-contract.js';
import { evaluateLiveVerification } from './live-verification.js';
import { evaluatePlatformReleaseMatrix } from './factory-operating.js';
import { evaluatePlatformPackageSet, verifyPlatformPackageSetArtifacts } from './platform-packaging.js';
import { buildReleaseIntegrity } from './release-integrity.js';
import { RuntimeProductGateSchema, isRuntimeProductPlaceholder } from './runtime-product-gates.js';
import { evaluateQaEvidence } from './qa-evidence.js';
import { verifyFrozenCandidate } from './release.js';
import { readJson, listFiles, sha256File, sha256Text } from './files.js';
import {
  BusinessPreflightSchema,
  GameBlueprintSchema,
  BuildReportSchema,
  QaReportSchema,
  RunStateSchema,
  TARGET_MINIGAME_PLATFORMS,
  type TargetMiniGamePlatform,
} from '../schemas/index.js';
import { ReleaseCandidateSchema, HumanPlaytestAcceptanceSchema, PlatformReleaseMatrixSchema } from '../schemas/factory-operating.js';
import { PlatformPackageSetSchema } from '../schemas/platform-package.js';
import { IaaContractSchema } from '../schemas/iaa-contract.js';
import { ReleaseLifecycleSchema } from '../schemas/release-lifecycle.js';
import { LiveVerificationSchema } from '../schemas/live-verification.js';
import { ReferenceFidelityGateSchema } from '../schemas/reference-fidelity.js';
import { PerceptualQaGateSchema } from '../schemas/product-experience.js';
import {
  ProductReadinessDimensionSchema,
  ProductReadinessReportSchema,
  PRODUCT_READINESS_DIMENSIONS,
  type ProductReadinessDimension,
  type ProductReadinessReport,
  type ProductReadinessStatus,
} from '../schemas/product-readiness.js';

const RUN_ARTIFACTS = {
  state: 'state.json',
  gameBlueprint: 'artifacts/game-blueprint.json',
  buildReport: 'artifacts/build-report.json',
  candidate: 'artifacts/release-candidate.json',
  qaReport: 'artifacts/qa-report.json',
  runtimeProductGate: 'artifacts/runtime-product-gates.json',
  referenceFidelityGate: 'artifacts/reference-fidelity-gate.json',
  perceptualQaGate: 'artifacts/perceptual-qa-gate.json',
  humanAcceptance: 'human/playtest-acceptance.json',
  iaaContract: 'artifacts/iaa-contract.json',
  businessPreflight: 'artifacts/business-preflight.json',
  platformReleaseMatrix: 'artifacts/platform-release-matrix.json',
  platformPackageSet: 'artifacts/platform-package-set.json',
  releaseLifecycle: 'artifacts/release-lifecycle.json',
} as const;

export type ProductReadinessArtifacts = {
  state?: unknown;
  gameBlueprint?: unknown;
  buildReport?: unknown;
  candidate?: unknown;
  candidateFilesVerified?: boolean;
  candidateVerificationError?: string;
  qaReport?: unknown;
  runtimeProductGate?: unknown;
  referenceFidelityGate?: unknown;
  perceptualQaGate?: unknown;
  humanAcceptance?: unknown;
  iaaContract?: unknown;
  businessPreflight?: unknown;
  platformReleaseMatrix?: unknown;
  platformPackageSet?: unknown;
  platformPackageBytesVerified?: boolean;
  platformPackageVerificationBlockers?: string[];
  releaseLifecycle?: unknown;
  liveVerifications?: Partial<Record<TargetMiniGamePlatform, unknown>>;
  invalidArtifacts?: string[];
};

export type ProductReadinessEvidence = {
  runId: string;
  currentBuildHash?: string;
  buildHashError?: string;
  artifacts: ProductReadinessArtifacts;
};

type ParsedArtifact<T> =
  | { status: 'valid'; value: T }
  | { status: 'missing' }
  | { status: 'invalid' };

function parseArtifact<T>(name: string, raw: unknown, schema: z.ZodType<T>, invalidArtifacts: Set<string>): ParsedArtifact<T> {
  if (invalidArtifacts.has(name)) return { status: 'invalid' };
  if (raw === undefined) return { status: 'missing' };
  const parsed = schema.safeParse(raw);
  return parsed.success ? { status: 'valid', value: parsed.data } : { status: 'invalid' };
}

function dimension(status: ProductReadinessStatus, evidencePaths: string[], blockers: string[], requiredActions: string[]): ProductReadinessDimension {
  return ProductReadinessDimensionSchema.parse({
    status,
    evidencePaths: [...new Set(evidencePaths)],
    blockers: [...new Set(blockers)],
    requiredActions: [...new Set(requiredActions)],
  });
}

function pending(status: 'NOT_ASSESSED' | 'NEEDS_HUMAN', blocker: string, action: string, evidencePaths: string[] = []) {
  return dimension(status, evidencePaths, [blocker], [action]);
}

function rejected(blockers: string[], action: string, evidencePaths: string[]) {
  return dimension('BLOCKED', evidencePaths, blockers, [action]);
}

function isInRun(root: string, target: string) {
  const relative = path.relative(root, target);
  return relative.length > 0 && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function baseCandidateStatus(input: {
  currentBuildHash?: string;
  runStateMatches: boolean;
  blueprintGameId?: string;
  candidateRaw: unknown;
  candidateFilesVerified?: boolean;
  invalidArtifacts: Set<string>;
}) {
  const parsed = parseArtifact(RUN_ARTIFACTS.candidate, input.candidateRaw, ReleaseCandidateSchema, input.invalidArtifacts);
  if (parsed.status === 'missing') return { status: 'UNFROZEN' as const, gameId: input.blueprintGameId ?? null, coreHash: null, candidate: undefined };
  if (parsed.status === 'invalid') return { status: 'INVALID' as const, gameId: input.blueprintGameId ?? null, coreHash: null, candidate: undefined };
  const candidate = parsed.value;
  if (candidate.status === 'BLOCKED') return { status: 'BLOCKED' as const, gameId: candidate.gameId, coreHash: candidate.coreHash, candidate };
  if (!input.runStateMatches || (input.blueprintGameId !== undefined && candidate.gameId !== input.blueprintGameId)) {
    return { status: 'STALE' as const, gameId: candidate.gameId, coreHash: candidate.coreHash, candidate };
  }
  if (!input.currentBuildHash || input.candidateFilesVerified === undefined) {
    return { status: 'UNVERIFIED' as const, gameId: candidate.gameId, coreHash: candidate.coreHash, candidate };
  }
  if (candidate.coreHash !== input.currentBuildHash || input.candidateFilesVerified === false) {
    return { status: 'STALE' as const, gameId: candidate.gameId, coreHash: candidate.coreHash, candidate };
  }
  return { status: 'FROZEN' as const, gameId: candidate.gameId, coreHash: candidate.coreHash, candidate };
}

function candidateFailure(candidate: ProductReadinessReport['candidate']) {
  if (candidate.status === 'STALE' || candidate.status === 'INVALID' || candidate.status === 'BLOCKED') {
    return { status: 'BLOCKED' as const, blocker: `candidate-${candidate.status.toLowerCase()}` };
  }
  if (candidate.status === 'UNFROZEN' || candidate.status === 'UNVERIFIED') {
    return { status: 'NEEDS_HUMAN' as const, blocker: `candidate-${candidate.status.toLowerCase()}` };
  }
  return undefined;
}

function evidenceForRunState(state: ParsedArtifact<z.infer<typeof RunStateSchema>>, runId: string) {
  if (state.status === 'valid') return { providerMode: state.value.runId === runId ? state.value.providerMode : 'unknown' as const, matches: state.value.runId === runId };
  return { providerMode: 'unknown' as const, matches: false };
}

function buildDimensions(input: ProductReadinessEvidence & { candidatePlatformHash?: string; runStateMatches: boolean }, candidate: ProductReadinessReport['candidate']) {
  const invalidArtifacts = new Set(input.artifacts.invalidArtifacts ?? []);
  const parsed = {
    blueprint: parseArtifact(RUN_ARTIFACTS.gameBlueprint, input.artifacts.gameBlueprint, GameBlueprintSchema, invalidArtifacts),
    build: parseArtifact(RUN_ARTIFACTS.buildReport, input.artifacts.buildReport, BuildReportSchema, invalidArtifacts),
    qa: parseArtifact(RUN_ARTIFACTS.qaReport, input.artifacts.qaReport, QaReportSchema, invalidArtifacts),
    runtimeProduct: parseArtifact(RUN_ARTIFACTS.runtimeProductGate, input.artifacts.runtimeProductGate, RuntimeProductGateSchema, invalidArtifacts),
    referenceFidelity: parseArtifact(RUN_ARTIFACTS.referenceFidelityGate, input.artifacts.referenceFidelityGate, ReferenceFidelityGateSchema, invalidArtifacts),
    perceptual: parseArtifact(RUN_ARTIFACTS.perceptualQaGate, input.artifacts.perceptualQaGate, PerceptualQaGateSchema, invalidArtifacts),
    human: parseArtifact(RUN_ARTIFACTS.humanAcceptance, input.artifacts.humanAcceptance, HumanPlaytestAcceptanceSchema, invalidArtifacts),
    iaa: parseArtifact(RUN_ARTIFACTS.iaaContract, input.artifacts.iaaContract, IaaContractSchema, invalidArtifacts),
    business: parseArtifact(RUN_ARTIFACTS.businessPreflight, input.artifacts.businessPreflight, BusinessPreflightSchema, invalidArtifacts),
    matrix: parseArtifact(RUN_ARTIFACTS.platformReleaseMatrix, input.artifacts.platformReleaseMatrix, PlatformReleaseMatrixSchema, invalidArtifacts),
    packages: parseArtifact(RUN_ARTIFACTS.platformPackageSet, input.artifacts.platformPackageSet, PlatformPackageSetSchema, invalidArtifacts),
    lifecycle: parseArtifact(RUN_ARTIFACTS.releaseLifecycle, input.artifacts.releaseLifecycle, ReleaseLifecycleSchema, invalidArtifacts),
  };

  const currentBuildHash = input.currentBuildHash === undefined ? undefined : z.string().regex(/^[a-f0-9]{64}$/iu).parse(input.currentBuildHash);
  const buildPath = RUN_ARTIFACTS.buildReport;
  const candidatePath = RUN_ARTIFACTS.candidate;
  const stateEvidence = 'state.json';

  let codeCorrectness: ProductReadinessDimension;
  if (!input.runStateMatches) {
    codeCorrectness = pending('NOT_ASSESSED', 'run-state-missing-or-mismatched', 'Load the matching state.json for this run before evaluating implementation evidence.', [stateEvidence]);
  } else if (parsed.build.status !== 'valid') {
    codeCorrectness = pending('NOT_ASSESSED', parsed.build.status === 'invalid' ? 'build-report-invalid' : 'build-report-missing', 'Run FULL_BUILD and persist a schema-valid artifacts/build-report.json.', [buildPath]);
  } else if (input.buildHashError) {
    codeCorrectness = rejected([`build-hash-unavailable:${input.buildHashError}`], 'Repair the build-output path and rerun FULL_BUILD so its exact files can be hashed.', [buildPath]);
  } else if (!currentBuildHash) {
    codeCorrectness = pending('NOT_ASSESSED', 'current-build-hash-missing', 'Build the run output and compute its SHA-256 identity before scoring correctness.', [buildPath]);
  } else if (!parsed.build.value.success) {
    codeCorrectness = rejected(['build-report-failed'], 'Repair the reported build failure, then rerun tests, typecheck, and build.', [buildPath]);
  } else if (!parsed.build.value.verification.includes('test:passed') || !parsed.build.value.verification.includes('typecheck:passed')) {
    codeCorrectness = pending('NOT_ASSESSED', 'full-tests-and-typecheck-required', 'Run the generated workspace test and typecheck commands and persist test:passed and typecheck:passed in the build report.', [buildPath]);
  } else if (parsed.qa.status !== 'valid') {
    codeCorrectness = pending('NOT_ASSESSED', parsed.qa.status === 'invalid' ? 'qa-report-invalid' : 'qa-report-missing', 'Run deterministic QA and persist a schema-valid artifacts/qa-report.json with state-coverage evidence.', [buildPath, RUN_ARTIFACTS.qaReport]);
  } else {
    const qa = parsed.qa.value;
    const qaEvidence = evaluateQaEvidence(qa.evidence, {
      requireStateCoverage: true,
      requireProvenance: true,
      expectedBuildHash: currentBuildHash,
    });
    if (!qa.passed) {
      codeCorrectness = rejected(['qa-report-failed'], 'Repair the failures in artifacts/qa-report.json and rerun deterministic QA on the current build.', [buildPath, RUN_ARTIFACTS.qaReport]);
    } else if (qaEvidence.passed) {
      codeCorrectness = dimension('PASS', [buildPath, RUN_ARTIFACTS.qaReport], [], []);
    } else {
      codeCorrectness = rejected(qaEvidence.blockers.map((blocker) => `engineering-qa:${blocker}`), 'Rerun deterministic QA on the current build and bind every state-coverage trace to its SHA-256 hash.', [buildPath, RUN_ARTIFACTS.qaReport]);
    }
  }

  let gameplayFidelity: ProductReadinessDimension;
  if (parsed.blueprint.status !== 'valid') {
    gameplayFidelity = pending('NOT_ASSESSED', parsed.blueprint.status === 'invalid' ? 'game-blueprint-invalid' : 'game-blueprint-missing', 'Persist a schema-valid game blueprint so natural play can be checked against the declared core loop.', ['artifacts/game-blueprint.json']);
  } else if (!currentBuildHash) {
    gameplayFidelity = pending('NOT_ASSESSED', 'current-build-hash-missing', 'Build the preview and rerun natural-input QA against the computed build hash.', [buildPath]);
  } else if (parsed.qa.status !== 'valid' || !parsed.qa.value.naturalFlow) {
    gameplayFidelity = pending('NOT_ASSESSED', parsed.qa.status === 'invalid' ? 'qa-report-invalid' : 'natural-flow-evidence-missing', 'Run Playwright natural-input QA from reset through terminal state and replay; persist its hash-bound trace.', [RUN_ARTIFACTS.qaReport]);
  } else if (parsed.runtimeProduct.status !== 'valid') {
    gameplayFidelity = pending('NOT_ASSESSED', parsed.runtimeProduct.status === 'invalid' ? 'runtime-product-gate-invalid' : 'runtime-product-gate-missing', 'Run the default browser journey and persist runtimeProductGates with wired entrypoint files.', [RUN_ARTIFACTS.runtimeProductGate]);
  } else if (!parsed.qa.value.passed || !parsed.runtimeProduct.value.passed || isRuntimeProductPlaceholder(parsed.runtimeProduct.value)) {
    gameplayFidelity = rejected([
      ...(!parsed.qa.value.passed ? ['natural-qa-failed'] : []),
      ...(!parsed.runtimeProduct.value.passed ? ['runtime-product-journey-failed'] : []),
      ...(isRuntimeProductPlaceholder(parsed.runtimeProduct.value) ? ['runtime-product-placeholder'] : []),
    ], 'Repair the named core-loop, terminal, replay, or default-path QA failures and rerun natural-input browser QA.', [RUN_ARTIFACTS.qaReport, RUN_ARTIFACTS.runtimeProductGate]);
  } else {
    const qaEvidence = evaluateQaEvidence(parsed.qa.value.evidence, {
      requireNatural: true,
      requireStateCoverage: true,
      requireNaturalComplete: true,
      requireProvenance: true,
      expectedBuildHash: currentBuildHash,
      naturalFlow: parsed.qa.value.naturalFlow,
    });
    const referenceRequired = parsed.blueprint.value.designMode === 'reference_reskin';
    const referencePass = !referenceRequired || (parsed.referenceFidelity.status === 'valid'
      && parsed.referenceFidelity.value.targetRunId === input.runId
      && parsed.referenceFidelity.value.buildHash === currentBuildHash
      && parsed.referenceFidelity.value.passed);
    const blockers = [
      ...qaEvidence.blockers.map((blocker) => `natural-qa:${blocker}`),
      ...(parsed.referenceFidelity.status === 'valid' && parsed.referenceFidelity.value.buildHash !== currentBuildHash ? ['reference-fidelity-build-hash-mismatch'] : []),
      ...(parsed.referenceFidelity.status === 'valid' && parsed.referenceFidelity.value.targetRunId !== input.runId ? ['reference-fidelity-run-id-mismatch'] : []),
      ...(parsed.referenceFidelity.status === 'valid' && !parsed.referenceFidelity.value.passed ? ['reference-fidelity-gate-failed'] : []),
    ];
    const missingReference = referenceRequired && parsed.referenceFidelity.status !== 'valid';
    if (blockers.length > 0) {
      gameplayFidelity = rejected(blockers, 'Repair failing or stale natural-input evidence and rerun QA on the current build.', [RUN_ARTIFACTS.qaReport, RUN_ARTIFACTS.runtimeProductGate, ...(referenceRequired ? [RUN_ARTIFACTS.referenceFidelityGate] : [])]);
    } else if (missingReference || !referencePass) {
      gameplayFidelity = pending('NOT_ASSESSED', 'reference-fidelity-evidence-missing', 'Run the build-bound reference-fidelity gate for this reference-reskin preview.', [RUN_ARTIFACTS.qaReport, RUN_ARTIFACTS.runtimeProductGate, RUN_ARTIFACTS.referenceFidelityGate]);
    } else {
      gameplayFidelity = dimension('PASS', [buildPath, RUN_ARTIFACTS.gameBlueprint, RUN_ARTIFACTS.qaReport, RUN_ARTIFACTS.runtimeProductGate, ...(referenceRequired ? [RUN_ARTIFACTS.referenceFidelityGate] : [])], [], []);
    }
  }

  const candidateIssue = candidateFailure(candidate);
  let experienceQuality: ProductReadinessDimension;
  if (!currentBuildHash) {
    experienceQuality = pending('NOT_ASSESSED', 'current-build-hash-missing', 'Build the preview before requesting human acceptance and perceptual QA.', [buildPath]);
  } else if (parsed.human.status === 'missing') {
    experienceQuality = pending('NEEDS_HUMAN', 'human-playtest-required', 'Have a human play the current build from a clean reset and record human/playtest-acceptance.json with its exact build hash.', [RUN_ARTIFACTS.humanAcceptance]);
  } else if (parsed.human.status === 'invalid') {
    experienceQuality = rejected(['human-playtest-artifact-invalid'], 'Replace the malformed human acceptance with a schema-valid natural-input playtest bound to the current build.', [RUN_ARTIFACTS.humanAcceptance]);
  } else if (/human-session-required|attach a recording or screenshots/iu.test([parsed.human.value.sessionId, ...parsed.human.value.notes, ...parsed.human.value.evidence].join('\n'))) {
    experienceQuality = rejected(['human-playtest-placeholder-evidence'], 'Replace the example acceptance with a real human session, recording, and exact build hash.', [RUN_ARTIFACTS.humanAcceptance]);
  } else if (!parsed.human.value.passed) {
    experienceQuality = rejected(['human-playtest-rejected'], 'Resolve the human reviewer notes and repeat the natural-input playtest.', [RUN_ARTIFACTS.humanAcceptance]);
  } else if (parsed.human.value.buildHash !== currentBuildHash) {
    experienceQuality = rejected(['human-playtest-build-hash-mismatch'], 'Repeat the human playtest on the exact current build and update human/playtest-acceptance.json with its SHA-256.', [buildPath, RUN_ARTIFACTS.humanAcceptance]);
  } else if (parsed.perceptual.status !== 'valid') {
    experienceQuality = pending('NOT_ASSESSED', parsed.perceptual.status === 'invalid' ? 'perceptual-qa-gate-invalid' : 'perceptual-qa-gate-missing', 'Run the perceptual QA gate on the current build and persist its run ID, build hash, and player-visible evidence.', [RUN_ARTIFACTS.perceptualQaGate]);
  } else if (parsed.perceptual.value.targetRunId !== input.runId || parsed.perceptual.value.buildHash !== currentBuildHash) {
    experienceQuality = rejected(['perceptual-qa-build-binding-mismatch'], 'Rerun perceptual QA for this run against the current build and persist the matching buildHash.', [buildPath, RUN_ARTIFACTS.perceptualQaGate]);
  } else if (!parsed.perceptual.value.passed) {
    experienceQuality = rejected(parsed.perceptual.value.blockers.map((blocker) => `perceptual-qa:${blocker}`), 'Repair every perceptual QA blocker and rerun the gate against the same current build.', [RUN_ARTIFACTS.perceptualQaGate]);
  } else {
    experienceQuality = dimension('PASS', [buildPath, RUN_ARTIFACTS.humanAcceptance, RUN_ARTIFACTS.perceptualQaGate], [], []);
  }

  let monetizationReadiness: ProductReadinessDimension;
  if (candidateIssue?.status === 'BLOCKED') {
    monetizationReadiness = rejected([candidateIssue.blocker, ...(input.artifacts.candidateVerificationError ? [`candidate-files:${input.artifacts.candidateVerificationError}`] : [])], 'Freeze a fresh candidate, then repeat platform ad verification against its exact coreHash.', [candidatePath]);
  } else if (candidateIssue) {
    monetizationReadiness = pending('NEEDS_HUMAN', candidateIssue.blocker, 'Freeze the exact tested build before recording platform ad verification.', [buildPath, candidatePath]);
  } else if (parsed.iaa.status !== 'valid') {
    monetizationReadiness = pending('NOT_ASSESSED', parsed.iaa.status === 'invalid' ? 'iaa-contract-invalid' : 'iaa-contract-missing', 'Complete IAA review and persist a schema-valid artifacts/iaa-contract.json.', [RUN_ARTIFACTS.iaaContract]);
  } else {
    const iaaResult = evaluateIaaContract(parsed.iaa.value);
    const business = parsed.business;
    const businessMissingPlatforms = business.status === 'valid'
      ? TARGET_MINIGAME_PLATFORMS.filter((platform) => !business.value.targets.includes(platform))
      : TARGET_MINIGAME_PLATFORMS;
    const businessReady = business.status === 'valid'
      && business.value.decision === 'GO'
      && business.value.blockers.length === 0
      && business.value.unknowns.length === 0
      && businessMissingPlatforms.length === 0
      && TARGET_MINIGAME_PLATFORMS.every((platform) => business.value.accountChecks.find((check) => check.platform === platform)?.status === 'pass');
    const businessPending = business.status === 'missing'
      || (business.status === 'valid' && business.value.decision === 'PAUSE')
      || businessMissingPlatforms.length > 0;
    const liveFailures: string[] = [];
    const liveMissing: string[] = [];
    const packages = parsed.packages.status === 'valid' ? parsed.packages.value.packages : [];
    if (input.artifacts.platformPackageBytesVerified === false && input.artifacts.platformPackageVerificationBlockers?.length) {
      liveFailures.push(...input.artifacts.platformPackageVerificationBlockers.map((blocker) => `platform-package-bytes:${blocker}`));
    } else if (input.artifacts.platformPackageBytesVerified !== true) {
      liveMissing.push('native-platform-package-bytes-unverified');
    }
    for (const platform of TARGET_MINIGAME_PLATFORMS) {
      const verificationPath = `artifacts/live-verification/${platform}.json`;
      const packageHash = packages.find((item) => item.platform === platform)?.artifactHash;
      if (!packageHash) liveMissing.push(`${platform}:native-package-hash-missing`);
      const verification = parseArtifact(verificationPath, input.artifacts.liveVerifications?.[platform], LiveVerificationSchema, invalidArtifacts);
      if (verification.status === 'missing') {
        liveMissing.push(`${platform}:live-verification-missing`);
        continue;
      }
      if (verification.status === 'invalid') {
        liveFailures.push(`${platform}:live-verification-invalid`);
        continue;
      }
      const evaluated = evaluateLiveVerification(verification.value);
      if (!evaluated.passed
        || verification.value.gameId !== candidate.gameId
        || verification.value.platform !== platform
        || verification.value.releaseHash !== candidate.coreHash
        || (packageHash !== undefined && verification.value.packageHash !== packageHash)) {
        liveFailures.push(`${platform}:live-verification-failed-or-stale`);
      }
      if (/mock|simulat|fixture|stub/iu.test(verification.value.verifier) || verification.value.evidence.some((item) => /mock|simulat|fixture|stub/iu.test(item))) {
        liveFailures.push(`${platform}:simulated-ad-evidence`);
      }
    }
    const iaaBlockers = iaaResult.blockers.map((blocker) => `iaa:${blocker}`);
    const businessBlockers = business.status === 'valid' && business.value.decision === 'KILL'
      ? business.value.blockers.map((blocker) => `business-preflight:${blocker}`)
      : business.status === 'invalid' ? ['business-preflight-invalid'] : [];
    const knownFailures = [...iaaBlockers, ...businessBlockers, ...liveFailures];
    if (knownFailures.length > 0) {
      monetizationReadiness = rejected(knownFailures, 'Resolve the named IAA, account, rights, payout, or on-device ad blockers before retrying monetization readiness.', [RUN_ARTIFACTS.iaaContract, ...(business.status === 'valid' ? [RUN_ARTIFACTS.businessPreflight] : []), ...TARGET_MINIGAME_PLATFORMS.map((platform) => `artifacts/live-verification/${platform}.json`)]);
    } else if (!businessReady || liveMissing.length > 0) {
      const blocker = businessMissingPlatforms.length > 0
        ? `business-preflight-platforms-missing:${businessMissingPlatforms.join(',')}`
        : businessPending ? 'business-preflight-needs-human-review' : !businessReady ? 'business-preflight-not-go' : liveMissing.join(',');
      monetizationReadiness = pending('NEEDS_HUMAN', blocker, 'Record a GO business preflight and on-device live-verification evidence for each native package hash bound to the frozen coreHash.', [RUN_ARTIFACTS.iaaContract, ...(business.status === 'valid' ? [RUN_ARTIFACTS.businessPreflight] : []), RUN_ARTIFACTS.platformPackageSet, ...TARGET_MINIGAME_PLATFORMS.map((platform) => `artifacts/live-verification/${platform}.json`)]);
    } else {
      monetizationReadiness = dimension('PASS', [candidatePath, RUN_ARTIFACTS.iaaContract, RUN_ARTIFACTS.businessPreflight, RUN_ARTIFACTS.platformPackageSet, ...TARGET_MINIGAME_PLATFORMS.map((platform) => `artifacts/live-verification/${platform}.json`)], [], []);
    }
  }

  let platformReleaseReadiness: ProductReadinessDimension;
  if (candidateIssue?.status === 'BLOCKED') {
    platformReleaseReadiness = rejected([candidateIssue.blocker, ...(input.artifacts.candidateVerificationError ? [`candidate-files:${input.artifacts.candidateVerificationError}`] : [])], 'Freeze a fresh candidate and rebuild/retest every platform child against its new coreHash.', [candidatePath]);
  } else if (candidateIssue) {
    platformReleaseReadiness = pending('NEEDS_HUMAN', candidateIssue.blocker, 'Freeze the exact tested build before packaging and verifying platform children.', [buildPath, candidatePath]);
  } else if (parsed.matrix.status !== 'valid') {
    platformReleaseReadiness = parsed.matrix.status === 'invalid'
      ? rejected(['platform-release-matrix-invalid'], 'Replace the malformed platform matrix with hash-bound device QA for every required platform.', [RUN_ARTIFACTS.platformReleaseMatrix])
      : pending('NEEDS_HUMAN', 'platform-release-matrix-missing', 'Package, device-test, and record every required platform in artifacts/platform-release-matrix.json.', [RUN_ARTIFACTS.platformReleaseMatrix]);
  } else if (parsed.packages.status !== 'valid') {
    platformReleaseReadiness = parsed.packages.status === 'invalid'
      ? rejected(['platform-package-set-invalid'], 'Replace the malformed package set with schema-valid, device-tested native packages for all required platforms.', [RUN_ARTIFACTS.platformPackageSet])
      : pending('NEEDS_HUMAN', 'platform-package-set-missing', 'Create device-tested native packages for WeChat, Douyin, and TapTap in artifacts/platform-package-set.json.', [RUN_ARTIFACTS.platformPackageSet]);
  } else {
    const matrix = parsed.matrix.value;
    const packages = parsed.packages.value;
    const matrixResult = evaluatePlatformReleaseMatrix(matrix, { strict: true });
    const packageResult = evaluatePlatformPackageSet(packages, { strict: true });
    const lifecycle = parsed.lifecycle;
    const matrixPlatforms = new Set(matrix.requiredPlatforms ?? matrix.children.filter((child) => child.required).map((child) => child.platform));
    const packagePlatforms = new Set(packages.requiredPlatforms);
    const requiredPlatforms = TARGET_MINIGAME_PLATFORMS;
    const platformBlockers = [
      ...requiredPlatforms.filter((platform) => !matrixPlatforms.has(platform)).map((platform) => `release-matrix-required-platform-missing:${platform}`),
      ...requiredPlatforms.filter((platform) => !packagePlatforms.has(platform)).map((platform) => `package-set-required-platform-missing:${platform}`),
      ...matrixResult.blockers.map((blocker) => `release-matrix:${blocker}`),
      ...packageResult.blockers.map((blocker) => `platform-package:${blocker}`),
      ...(matrix.coreHash !== candidate.coreHash ? ['platform-release-matrix-core-hash-mismatch'] : []),
      ...(input.candidatePlatformHash !== buildReleaseIntegrity({ coreHash: matrix.coreHash, platformChildren: matrix.children, acceptance: null }).platformHash ? ['release-candidate-platform-hash-mismatch'] : []),
      ...(matrix.gameId !== candidate.gameId || packages.gameId !== candidate.gameId ? ['platform-game-id-mismatch'] : []),
      ...(packages.coreHash !== candidate.coreHash ? ['platform-package-set-core-hash-mismatch'] : []),
      ...(input.artifacts.platformPackageBytesVerified !== true ? (input.artifacts.platformPackageVerificationBlockers?.length ? input.artifacts.platformPackageVerificationBlockers.map((item) => `platform-package-bytes:${item}`) : ['platform-package-bytes-unverified']) : []),
      ...(lifecycle.status === 'valid' && (lifecycle.value.gameId !== candidate.gameId || lifecycle.value.releaseHash !== candidate.coreHash) ? ['release-lifecycle-candidate-mismatch'] : []),
      ...(lifecycle.status === 'valid' && ['PAUSED', 'KILLED'].includes(lifecycle.value.status) ? [`release-lifecycle-${lifecycle.value.status.toLowerCase()}`] : []),
    ];
    for (const platform of requiredPlatforms) {
      const child = matrix.children.find((item) => item.platform === platform);
      const pkg = packages.packages.find((item) => item.platform === platform);
      if (child && pkg && child.artifactHash !== pkg.artifactHash) platformBlockers.push(`${platform}:package-hash-mismatch`);
    }
    if (platformBlockers.length > 0) {
      platformReleaseReadiness = rejected(platformBlockers, 'Resolve every named platform/package/hash/device-QA blocker; browser web-lite evidence cannot substitute for a native child package.', [RUN_ARTIFACTS.platformReleaseMatrix, RUN_ARTIFACTS.platformPackageSet, RUN_ARTIFACTS.releaseLifecycle]);
    } else if (lifecycle.status !== 'valid' || !['RELEASE_READY', 'SUBMITTED', 'LIVE_VERIFIED'].includes(lifecycle.value.status)) {
      platformReleaseReadiness = pending('NEEDS_HUMAN', 'release-lifecycle-not-release-ready', 'Complete the release stage and record a RELEASE_READY lifecycle transition for this exact gameId and coreHash.', [RUN_ARTIFACTS.releaseLifecycle, RUN_ARTIFACTS.platformReleaseMatrix, RUN_ARTIFACTS.platformPackageSet]);
    } else {
      platformReleaseReadiness = dimension('PASS', [candidatePath, RUN_ARTIFACTS.platformReleaseMatrix, RUN_ARTIFACTS.platformPackageSet, RUN_ARTIFACTS.releaseLifecycle], [], []);
    }
  }

  return { codeCorrectness, gameplayFidelity, experienceQuality, monetizationReadiness, platformReleaseReadiness };
}

function overallStatus(dimensions: ProductReadinessReport['dimensions']) {
  const values = PRODUCT_READINESS_DIMENSIONS.map((name) => dimensions[name]);
  const blockedDimensions = PRODUCT_READINESS_DIMENSIONS.filter((name) => dimensions[name].status === 'BLOCKED');
  const status = blockedDimensions.length > 0 ? 'BLOCKED'
    : values.every((dimension) => dimension.status === 'PASS') ? 'READY'
      : values.some((dimension) => dimension.status === 'NEEDS_HUMAN') ? 'NEEDS_HUMAN'
        : 'NOT_ASSESSED';
  return { status, blockedDimensions, requiredActions: [...new Set(values.flatMap((dimension) => dimension.requiredActions))] };
}

/** Pure readiness projection used by status and CLI callers after collecting this run's artifacts. */
export function evaluateProductReadiness(input: ProductReadinessEvidence): ProductReadinessReport {
  const invalidArtifacts = new Set(input.artifacts.invalidArtifacts ?? []);
  const state = parseArtifact(RUN_ARTIFACTS.state, input.artifacts.state, RunStateSchema, invalidArtifacts);
  const blueprint = parseArtifact(RUN_ARTIFACTS.gameBlueprint, input.artifacts.gameBlueprint, GameBlueprintSchema, invalidArtifacts);
  const runState = evidenceForRunState(state, input.runId);
  const candidate = baseCandidateStatus({
    currentBuildHash: input.currentBuildHash,
    runStateMatches: runState.matches,
    ...(blueprint.status === 'valid' ? { blueprintGameId: blueprint.value.gameId } : {}),
    candidateRaw: input.artifacts.candidate,
    candidateFilesVerified: input.artifacts.candidateFilesVerified,
    invalidArtifacts,
  });
  const dimensions = buildDimensions({ ...input, candidatePlatformHash: candidate.candidate?.platformHash, runStateMatches: runState.matches }, {
    runId: input.runId,
    gameId: candidate.gameId,
    coreHash: candidate.coreHash,
    status: candidate.status,
  });
  return ProductReadinessReportSchema.parse({
    schemaVersion: 1,
    candidate: {
      runId: input.runId,
      gameId: candidate.gameId,
      coreHash: candidate.coreHash,
      status: candidate.status,
    },
    providerMode: runState.providerMode,
    dimensions,
    overall: overallStatus(dimensions),
  });
}

type ArtifactRead = { value?: unknown; invalid?: true };

async function readOptionalArtifact(runRoot: string, relativePath: string): Promise<ArtifactRead> {
  try {
    return { value: await readJson(path.join(runRoot, relativePath)) };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return {};
    if (error instanceof SyntaxError) return { invalid: true };
    throw error;
  }
}

async function hashBuildOutput(runRoot: string, buildPath: string): Promise<{ hash?: string; error?: string }> {
  const normalized = buildPath.replaceAll('\\', '/');
  if (path.isAbsolute(normalized) || path.win32.isAbsolute(normalized) || normalized.split('/').some((part) => part === '..')) {
    return { error: 'build-path-outside-run' };
  }
  const root = path.resolve(runRoot);
  const directory = path.resolve(root, normalized);
  if (!isInRun(root, directory)) return { error: 'build-path-outside-run' };
  let stat;
  try {
    stat = await lstat(directory);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return { error: 'build-output-missing' };
    throw error;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) return { error: 'build-output-not-a-real-directory' };
  const [realRoot, realDirectory] = await Promise.all([realpath(root), realpath(directory)]);
  if (!isInRun(realRoot, realDirectory)) return { error: 'build-output-resolves-outside-run' };
  const files = await listFiles(directory);
  if (files.length === 0) return { error: 'build-output-empty' };
  for (const file of files) {
    const filePath = path.join(directory, file);
    const fileStat = await lstat(filePath);
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) return { error: `build-output-unsafe-file:${file}` };
  }
  const entries = await Promise.all(files.map(async (file) => `${file}:${await sha256File(path.join(directory, file))}`));
  return { hash: sha256Text(entries.join('\n')) };
}

/** Load the run's canonical artifacts, verify their current hashes, and produce a conservative readiness report. */
export async function buildProductReadinessReport(input: { runRoot: string; runId: string }): Promise<ProductReadinessReport> {
  const names = Object.entries(RUN_ARTIFACTS);
  const reads = await Promise.all(names.map(async ([key, relativePath]) => [key, await readOptionalArtifact(input.runRoot, relativePath)] as const));
  const artifacts = Object.fromEntries(reads.map(([key, item]) => [key, item.value])) as Record<string, unknown>;
  const invalidArtifacts: string[] = reads.filter(([, item]) => item.invalid).map(([key]) => RUN_ARTIFACTS[key as keyof typeof RUN_ARTIFACTS]);
  const liveReads = await Promise.all(TARGET_MINIGAME_PLATFORMS.map(async (platform) => {
    const relativePath = `artifacts/live-verification/${platform}.json`;
    return [platform, await readOptionalArtifact(input.runRoot, relativePath), relativePath] as const;
  }));
  const liveVerifications = Object.fromEntries(liveReads.map(([platform, item]) => [platform, item.value])) as Partial<Record<TargetMiniGamePlatform, unknown>>;
  invalidArtifacts.push(...liveReads.filter(([, item]) => item.invalid).map(([, , relativePath]) => relativePath));

  const build = BuildReportSchema.safeParse(artifacts.buildReport);
  let currentBuildHash: string | undefined;
  let buildHashError: string | undefined;
  if (build.success) {
    const output = await hashBuildOutput(input.runRoot, build.data.webBuild);
    currentBuildHash = output.hash;
    buildHashError = output.error;
  }
  const candidate = ReleaseCandidateSchema.safeParse(artifacts.candidate);
  let candidateFilesVerified: boolean | undefined;
  let candidateVerificationError: string | undefined;
  if (candidate.success && currentBuildHash) {
    try {
      await verifyFrozenCandidate(input.runRoot, candidate.data, currentBuildHash);
      candidateFilesVerified = true;
    } catch (error) {
      candidateFilesVerified = false;
      candidateVerificationError = error instanceof Error ? error.message : String(error);
    }
  }
  const packageSet = PlatformPackageSetSchema.safeParse(artifacts.platformPackageSet);
  let platformPackageBytesVerified: boolean | undefined;
  let platformPackageVerificationBlockers: string[] = [];
  if (packageSet.success) {
    const byteResult = await verifyPlatformPackageSetArtifacts(packageSet.data, input.runRoot);
    platformPackageBytesVerified = byteResult.passed;
    platformPackageVerificationBlockers = byteResult.blockers;
  }
  return evaluateProductReadiness({
    runId: input.runId,
    ...(currentBuildHash ? { currentBuildHash } : {}),
    ...(buildHashError ? { buildHashError } : {}),
    artifacts: {
      ...artifacts,
      liveVerifications,
      candidateFilesVerified,
      ...(candidateVerificationError ? { candidateVerificationError } : {}),
      ...(platformPackageBytesVerified !== undefined ? { platformPackageBytesVerified } : {}),
      platformPackageVerificationBlockers,
      invalidArtifacts,
    },
  });
}
