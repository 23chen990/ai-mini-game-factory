import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { sha256File, sha256Text } from './files.js';
import { sanitizeUntrustedText } from './security-boundary.js';
import { isInstructionShapedResearchText, isResearchHostAllowed, isSafeExternalResearchUrl } from './research-evidence.js';
import { usableEvidenceEntries, verifyEvidenceFileBindings } from './evidence-provenance.js';
import { ReferenceBehaviorAnalysisSchema, ReferenceEvidencePackSchema, type ReferenceEvidencePack } from '../schemas/reference-evidence.js';
import { REFERENCE_BEHAVIOR_DIMENSIONS, ReferenceFidelityContractSchema, ReferenceFidelityGateSchema, ReferenceFidelityReviewSchema } from '../schemas/reference-fidelity.js';
import { NaturalFlowEvidenceSchema } from '../schemas/natural-flow.js';
import { evaluateQaEvidence } from './qa-evidence.js';
import { ReferenceMechanicSpecSchema, type ReferenceMechanicSpec } from '../schemas/reference-mechanic.js';
import { buildEvidenceClaimSet } from './evidence-claims.js';

/**
 * Resolve a research source without following a symlink.  Research inputs are
 * untrusted: a lexical `../` check alone is not sufficient because a file (or
 * one of its parent directories) can point outside the run after validation.
 * We walk every component, reject links/non-regular files, and verify the
 * final real path remains below the real run root before the caller reads it.
 */
async function safeRunFile(runRoot: string, relative: string): Promise<string> {
  const normalized = String(relative).replaceAll('\\', '/').trim();
  const root = path.resolve(runRoot);
  const resolved = path.resolve(root, normalized);
  const rel = path.relative(root, resolved);
  if (!normalized || !rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(`reference source path escapes run root: ${relative}`);
  }
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error(`reference run root is unsafe: ${runRoot}`);
  const realRoot = await realpath(root);
  let current = root;
  for (const component of normalized.split('/')) {
    if (!component || component === '.') continue;
    current = path.join(current, component);
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) throw new Error(`reference source path is a symlink: ${relative}`);
    if (current !== resolved && !stat.isDirectory()) throw new Error(`reference source parent is not a directory: ${relative}`);
  }
  const finalStat = await lstat(resolved);
  if (!finalStat.isFile() || finalStat.isSymbolicLink()) throw new Error(`reference source is not a regular file: ${relative}`);
  const realFile = await realpath(resolved);
  const realRelative = path.relative(realRoot, realFile);
  if (!realRelative || realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
    throw new Error(`reference source path resolves outside run root: ${relative}`);
  }
  return realFile;
}

export type ReferenceEvidenceOptions = {
  requireSupplemental?: boolean;
  requireHostAllowlist?: boolean;
  allowedHosts?: readonly string[];
  /** Optional run-bound recording/image provenance. Verified entries become
   * source evidence; pending or mismatched entries remain explicit blockers. */
  provenanceManifest?: unknown;
  provenanceExpected?: { targetGame: string; workspace: string };
};

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function referenceTokens(value: unknown): Set<string> {
  return new Set(String(value ?? '').toLowerCase().split(/[^a-z0-9]+/u).filter((token) => token.length > 2 && !['rule', 'pressure', 'evidence', 'reference'].includes(token)));
}

/**
 * Repair only provenance representation at the ResearchAgent boundary. A
 * derived frame is a locator inside the verified recording, not an
 * independent source carrying the recording hash. Pressure rules likewise
 * point to pressure-evidence ids, while those evidence rows point to bound
 * source paths and hashes. No gameplay claim or confidence is changed here.
 */
export function normalizeReferenceBehaviorAnalysis(value: unknown, packValue: unknown): unknown {
  const pack = ReferenceEvidencePackSchema.parse(packValue);
  const root = recordValue(structuredClone(value));
  if (!root) return value;
  const exactSourcePairs = new Set(pack.sourceFiles.map((source) => `${source.path}\n${source.sha256}`));
  const sourcesByHash = new Map<string, typeof pack.sourceFiles>();
  for (const source of pack.sourceFiles) sourcesByHash.set(source.sha256, [...(sourcesByHash.get(source.sha256) ?? []), source]);

  if (Array.isArray(root.behaviorChecks)) {
    for (const checkValue of root.behaviorChecks) {
      const check = recordValue(checkValue);
      if (!check || !Array.isArray(check.sourceRefs)) continue;
      check.sourceRefs = check.sourceRefs.map((refValue) => {
        const ref = recordValue(refValue);
        if (!ref || typeof ref.path !== 'string' || typeof ref.sha256 !== 'string') return refValue;
        if (exactSourcePairs.has(`${ref.path}\n${ref.sha256}`)) return ref;
        if (typeof ref.path === 'string' && ref.path.startsWith('reference-evidence/derived/') && pack.sourceFiles.length === 1) {
          return { ...ref, path: pack.sourceFiles[0]!.path, sha256: pack.sourceFiles[0]!.sha256 };
        }
        const candidates = sourcesByHash.get(ref.sha256) ?? [];
        return candidates.length === 1 ? { ...ref, path: candidates[0]!.path } : ref;
      });
    }
  }

  const level = recordValue(root.levelReconstruction);
  const replay = recordValue(level?.replay);
  if (level && replay && typeof replay.actionId === 'string' && typeof replay.checkpointId === 'string' && Array.isArray(level.interactionSequence)) {
    const checkpointPhases = new Map<string, string>();
    if (Array.isArray(level.checkpoints)) {
      for (const checkpointValue of level.checkpoints) {
        const checkpoint = recordValue(checkpointValue);
        if (typeof checkpoint?.id === 'string' && typeof checkpoint.phase === 'string') checkpointPhases.set(checkpoint.id, checkpoint.phase);
      }
    }
    level.interactionSequence = level.interactionSequence.filter((actionValue) => {
      const action = recordValue(actionValue);
      if (!action || action.actionId !== replay.actionId || action.toCheckpointId !== replay.checkpointId || typeof action.fromCheckpointId !== 'string') return true;
      return checkpointPhases.get(action.fromCheckpointId) !== 'terminal';
    });
  }

  const pressure = recordValue(root.failurePressureContract);
  if (!pressure || !Array.isArray(pressure.evidence) || !Array.isArray(pressure.rules)) return root;
  const originalRefs = new Map<string, string[]>();
  for (const evidenceValue of pressure.evidence) {
    const evidence = recordValue(evidenceValue);
    if (!evidence || typeof evidence.id !== 'string' || !Array.isArray(evidence.sourceRefs)) continue;
    const refs = evidence.sourceRefs.filter((item): item is string => typeof item === 'string');
    originalRefs.set(evidence.id, refs);
    const referencedSources = pack.sourceFiles.filter((source) => refs.includes(source.path) || refs.includes(source.sha256));
    if (referencedSources.length > 0) evidence.sourceRefs = [...new Set(referencedSources.flatMap((source) => [source.path, source.sha256]))];
  }
  const evidenceRows = pressure.evidence.map(recordValue).filter((row): row is Record<string, unknown> => row !== undefined && typeof row.id === 'string');
  const evidenceIds = new Set(evidenceRows.map((row) => String(row.id)));
  for (const ruleValue of pressure.rules) {
    const rule = recordValue(ruleValue);
    if (!rule || !Array.isArray(rule.sourceEvidenceRefs)) continue;
    const refs = rule.sourceEvidenceRefs.filter((item): item is string => typeof item === 'string');
    if (refs.length > 0 && refs.every((ref) => evidenceIds.has(ref))) continue;
    const ruleTokens = referenceTokens(rule.id);
    const ranked = evidenceRows.map((row) => {
      const id = String(row.id);
      const overlap = (originalRefs.get(id) ?? []).filter((ref) => refs.includes(ref)).length;
      const lexical = [...referenceTokens(id)].filter((token) => ruleTokens.has(token)).length;
      // Semantic identity is stronger than shared source provenance. Multiple
      // pressure rows often cite the same recording and design document, so
      // source overlap alone cannot distinguish timing, hazard, and terminal
      // rules from each other.
      return { id, score: lexical * 1_000 + overlap };
    }).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
    if ((ranked[0]?.score ?? 0) > 0) rule.sourceEvidenceRefs = [ranked[0]!.id];
  }
  return root;
}

/** Merge only ResearchAgent-owned analysis fields into the immutable base pack.
 * A recovery may name prior analysis unknowns that a Zod-validated resolution
 * has retired. Unnamed base-pack gaps remain blocking. */
export function applyReferenceBehaviorAnalysis(
  packValue: unknown,
  analysisValue: unknown,
  options: { retiredUnknowns?: readonly string[] } = {},
): ReferenceEvidencePack {
  const pack = ReferenceEvidencePackSchema.parse(packValue);
  const analysis = ReferenceBehaviorAnalysisSchema.parse(analysisValue);
  if (analysis.targetRunId !== pack.targetRunId) throw new Error(`reference behavior analysis run mismatch: ${analysis.targetRunId}`);
  for (const check of analysis.behaviorChecks) {
    for (const reference of check.sourceRefs) {
      if (!pack.sourceFiles.some((source) => source.path === reference.path && source.sha256 === reference.sha256)) {
        throw new Error(`unbound reference behavior source for ${check.id}: ${reference.path}`);
      }
    }
  }
  if (analysis.failurePressureContract) {
    const boundSources = new Set(pack.sourceFiles.flatMap((source) => [source.path, source.sha256]));
    for (const evidence of analysis.failurePressureContract.evidence) {
      for (const sourceRef of evidence.sourceRefs) {
        if (!boundSources.has(sourceRef)) throw new Error(`pressure evidence cites unbound source: ${sourceRef}`);
      }
    }
  }
  const observations = [...new Set([...pack.observations, ...analysis.observations])];
  const observationSet = new Set(observations);
  const inferences = [...new Set([...pack.inferences, ...analysis.inferences])].filter((item) => !observationSet.has(item));
  const inferenceSet = new Set(inferences);
  const retiredUnknowns = new Set(options.retiredUnknowns ?? []);
  const retainedPackUnknowns = pack.unknowns.filter((item) => !retiredUnknowns.has(item));
  const unknowns = [...new Set([...retainedPackUnknowns, ...analysis.unknowns])].filter((item) => !observationSet.has(item) && !inferenceSet.has(item));
  return ReferenceEvidencePackSchema.parse({
    ...pack,
    observations,
    inferences,
    unknowns,
    behaviorChecks: analysis.behaviorChecks,
    failurePressureContract: analysis.failurePressureContract,
    status: analysis.status === 'READY' && unknowns.length === 0 && pack.similarityRedFlags.length === 0 ? 'READY' : 'BLOCKED',
    researchedAt: new Date().toISOString(),
  });
}

export async function buildReferenceEvidencePack(input: { targetRunId: string; reference: ReferenceMechanicSpec; runRoot: string } & ReferenceEvidenceOptions): Promise<ReferenceEvidencePack> {
  const reference = ReferenceMechanicSpecSchema.parse(input.reference);
  const sourceFiles: ReferenceEvidencePack['sourceFiles'] = []; const observations: string[] = []; const unknowns: string[] = [];
  if (input.provenanceManifest !== undefined) {
    if (!input.provenanceExpected) {
      unknowns.push('evidence-provenance:expected-context-missing');
    } else {
      const purposes = ['gameplay-reference', 'design-document'] as const;
      const verified = await verifyEvidenceFileBindings(input.provenanceManifest, input.provenanceExpected, { runRoot: input.runRoot, requireRunLocal: true, purposes });
      if (!verified.passed) unknowns.push(...verified.blockers);
      else {
        for (const entry of usableEvidenceEntries(input.provenanceManifest, input.provenanceExpected, { purposes })) {
          const sha256 = entry.sha256;
          if (!sha256) continue;
          if (sourceFiles.some((source) => source.sha256 === sha256)) continue;
          const evidencePath = entry.storedPath ?? entry.sourcePath;
          sourceFiles.push({ path: evidencePath, sha256, observations: [`provenance:${entry.id}:${entry.purpose}`] });
          observations.push(`provenance:${entry.id}:${entry.purpose}`);
        }
      }
    }
  }
  if (!isSafeExternalResearchUrl(reference.source.url)) unknowns.push('benchmark-source-url-unsafe');
  if (isInstructionShapedResearchText(reference.source.name) || isInstructionShapedResearchText(reference.source.url)) unknowns.push('benchmark-source-instruction-shaped');
  if (input.requireHostAllowlist && !isResearchHostAllowed(reference.source.url, input.allowedHosts ?? [])) unknowns.push('benchmark-source-host-not-allowlisted');
  for (const relative of reference.source.researchFiles) {
    let file: string;
    try {
      file = await safeRunFile(input.runRoot, relative);
      const content = sanitizeUntrustedText(await readFile(file, 'utf8'), 4_000);
      const extracted = content.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).slice(0, 12);
      const sha256 = await sha256File(file);
      if (!sourceFiles.some((source) => source.sha256 === sha256)) sourceFiles.push({ path: relative, sha256, observations: extracted.length ? extracted : ['source-file-contained-no-readable-observation'] });
      observations.push(...extracted.map((line) => `source:${relative}:${line}`));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') unknowns.push(`source-file-missing:${relative}`);
      else if (error instanceof Error && /reference source path|reference run root|reference source parent|reference source is not/iu.test(error.message)) unknowns.push(`source-file-unsafe:${relative}`);
      else throw error;
    }
  }
  const supplemental = sourceFiles.length > 0;
  if (input.requireSupplemental && !supplemental) unknowns.push('supplemental-reference-evidence-required');
  const inferences = [
    'The locked core-loop order is the reusable mechanic relationship; all expression must be authored independently.',
    'Declared adaptable mechanics may vary only after the human mechanic lock and must keep the same causal topology.',
  ];
  const pack = {
    schemaVersion: 1 as const,
    targetRunId: input.targetRunId,
    benchmark: { name: reference.source.name, url: reference.source.url },
    sourceFiles,
    observations: [...new Set([...observations, ...reference.coreLoop.map((item) => `human-lock:${item}`)])],
    inferences,
    unknowns: [...new Set(unknowns)],
    mechanicMap: { coreLoop: reference.coreLoop, playerActions: reference.playerActions, progressionSystems: reference.progressionSystems, unlockRules: reference.unlockRules, mustPreserveMechanics: reference.mustPreserveMechanics, feedbackCadence: reference.feedbackCadence },
    failurePressureContract: null,
    expressionBoundary: { allowed: ['generic mechanic relationships', 'causal order and state transitions', 'human-approved adaptable mechanic slots'], forbidden: ['third-party code', 'third-party assets', 'names and logos', 'UI layout', 'text and dialogue', 'audio', 'raw tuning values'] },
    similarityRedFlags: [],
    evidenceQuality: supplemental ? 'supplemented' as const : 'human-lock-only' as const,
    status: unknowns.length === 0 ? 'READY' as const : 'BLOCKED' as const,
    claims: buildEvidenceClaimSet({ source: reference.source.url, observations: [...new Set(observations)], inferences, unknowns }).claims,
    researchedAt: new Date().toISOString(),
  };
  return ReferenceEvidencePackSchema.parse(pack);
}

export function referenceBlockersRequirePause(blockers: readonly string[]): boolean {
  return blockers.some((blocker) => /benchmark-source-(?:url-unsafe|host-not-allowlisted|instruction-shaped)/u.test(blocker) || /reference:benchmark-source-/u.test(blocker));
}

export function evaluateReferenceEvidence(value: unknown, options: ReferenceEvidenceOptions = {}) {
  const pack = ReferenceEvidencePackSchema.parse(value);
  const blockers = [...pack.unknowns.map((item) => `unknown:${item}`), ...pack.similarityRedFlags.map((item) => `similarity:${item}`)];
  if (!isSafeExternalResearchUrl(pack.benchmark.url)) blockers.push('reference:benchmark-source-url-unsafe');
  if (isInstructionShapedResearchText(pack.benchmark.name) || isInstructionShapedResearchText(pack.benchmark.url)) blockers.push('reference:benchmark-source-instruction-shaped');
  if (options.requireHostAllowlist && !isResearchHostAllowed(pack.benchmark.url, options.allowedHosts ?? [])) blockers.push('reference:benchmark-source-host-not-allowlisted');
  return { passed: blockers.length === 0 && pack.status === 'READY', blockers: [...new Set(blockers)], pack };
}

/**
 * Preview is intentionally stricter than the legacy fast lane: a URL and a
 * prose mechanic lock are not enough for a Builder to claim a recreation.
 * The source files must be bound to this run and hashed before the fidelity
 * contract is considered usable.
 */
export function evaluateReplicaPreviewEvidence(value: unknown) {
  const evaluated = evaluateReferenceEvidence(value);
  const pack = evaluated.pack;
  const blockers = [...evaluated.blockers];
  if (pack.sourceFiles.length === 0) blockers.push('preview:reference-evidence-provenance-missing');
  if (pack.sourceFiles.some((source) => !/^[a-f0-9]{64}$/iu.test(source.sha256))) blockers.push('preview:reference-evidence-hash-missing');
  if (pack.evidenceQuality !== 'supplemented') blockers.push('preview:reference-evidence-not-supplemented');
  if (pack.behaviorChecks.length === 0) blockers.push('preview:behavior-checks-missing');
  if (!pack.failurePressureContract) blockers.push('preview:failure-pressure-contract-missing');
  const ids = new Set<string>();
  for (const check of pack.behaviorChecks) {
    if (ids.has(check.id)) blockers.push(`preview:behavior-check-duplicate:${check.id}`);
    ids.add(check.id);
    for (const ref of check.sourceRefs) {
      if (!pack.sourceFiles.some((source) => source.path === ref.path && source.sha256 === ref.sha256)) blockers.push(`preview:behavior-source-unbound:${check.id}`);
    }
  }
  for (const dimension of REFERENCE_BEHAVIOR_DIMENSIONS) {
    if (!pack.behaviorChecks.some((check) => check.dimension === dimension)) blockers.push(`preview:behavior-dimension-missing:${dimension}`);
  }
  if (pack.mechanicMap.mustPreserveMechanics.length === 0) blockers.push('preview:preserved-mechanics-missing');
  const fidelity = ReferenceFidelityContractSchema.parse({
    schemaVersion: 1,
    targetRunId: pack.targetRunId,
    referenceName: pack.benchmark.name,
    provenance: pack.sourceFiles.map((source) => ({ path: source.path, sha256: source.sha256 })),
    coreLoopOrder: pack.mechanicMap.coreLoop,
    inputStateTransitions: pack.behaviorChecks.filter((check) => check.dimension === 'input_state').map((check) => check.expectedStateChange),
    failureRecoveryRules: pack.behaviorChecks.filter((check) => check.dimension === 'failure_recovery').map((check) => check.expectedStateChange),
    mustPreserveMechanics: pack.mechanicMap.mustPreserveMechanics,
    progressionSystems: pack.mechanicMap.progressionSystems,
    unlockRules: pack.mechanicMap.unlockRules,
    behaviorChecks: pack.behaviorChecks,
    feedbackTimingBands: pack.mechanicMap.feedbackCadence,
    status: blockers.length === 0 && pack.status === 'READY' ? 'READY' : 'BLOCKED',
    blockers: [...new Set(blockers)],
  });
  return { passed: fidelity.status === 'READY', blockers: fidelity.blockers, pack, fidelity };
}

/** Verify an independent comparison, never manufacture one from a generic QA pass.
 * File hashes establish identity; the reviewer still owns the actual perceptual judgment. */
export async function verifyReferenceFidelityReview(input: {
  runRoot: string; targetRunId: string; workspace: string; buildHash: string;
  contract: unknown; review?: unknown;
}) {
  const contract = ReferenceFidelityContractSchema.safeParse(input.contract);
  const blockers: string[] = [];
  const checkedIds: string[] = [];
  const checks = contract.success ? contract.data.behaviorChecks : [];
  const contractHash = contract.success ? sha256Text(JSON.stringify(contract.data)) : null;
  const finish = () => ReferenceFidelityGateSchema.parse({
    schemaVersion: 1, targetRunId: input.targetRunId, contractHash, buildHash: input.buildHash,
    passed: blockers.length === 0, blockers: [...new Set(blockers)], requiredCheckIds: checks.map((check) => check.id), checkedIds,
  });
  if (!contract.success) { blockers.push('fidelity:contract-invalid'); return finish(); }
  if (contract.data.targetRunId !== input.targetRunId) blockers.push('fidelity:contract-run-mismatch');
  if (contract.data.status !== 'READY') blockers.push('fidelity:contract-blocked');
  if (new Set(checks.map((check) => check.id)).size !== checks.length) blockers.push('fidelity:contract-duplicate-checks');
  for (const dimension of REFERENCE_BEHAVIOR_DIMENSIONS) {
    if (!checks.some((check) => check.dimension === dimension)) blockers.push(`fidelity:dimension-missing:${dimension}`);
  }
  for (const check of checks) {
    for (const ref of check.sourceRefs) {
      if (!contract.data.provenance.some((source) => source.path === ref.path && source.sha256 === ref.sha256)) blockers.push(`fidelity:source-unbound:${check.id}`);
    }
  }
  if (input.review === undefined) { blockers.push('fidelity:review-missing'); return finish(); }
  const review = ReferenceFidelityReviewSchema.safeParse(input.review);
  if (!review.success) { blockers.push('fidelity:review-invalid'); return finish(); }
  if (review.data.targetRunId !== input.targetRunId) blockers.push('fidelity:review-run-mismatch');
  if (review.data.workspace !== input.workspace) blockers.push('fidelity:workspace-mismatch');
  if (review.data.contractHash !== contractHash) blockers.push('fidelity:contract-hash-mismatch');
  if (review.data.buildHash !== input.buildHash) blockers.push('fidelity:build-hash-mismatch');
  if (new Set(review.data.cases.map((row) => row.checkId)).size !== review.data.cases.length) blockers.push('fidelity:duplicate-results');
  for (const row of review.data.cases) {
    if (!checks.some((check) => check.id === row.checkId)) blockers.push(`fidelity:unknown-check:${row.checkId}`);
  }
  const readBoundFile = async (ref: { path: string; sha256: string }) => {
    const file = await safeRunFile(input.runRoot, ref.path);
    const bytes = await readFile(file);
    const { createHash } = await import('node:crypto');
    if (createHash('sha256').update(bytes).digest('hex') !== ref.sha256) throw new Error('hash-mismatch');
    return bytes;
  };
  for (const check of checks) {
    const row = review.data.cases.find((candidate) => candidate.checkId === check.id);
    if (!row) { blockers.push(`fidelity:check-missing:${check.id}`); continue; }
    const countBefore = blockers.length;
    if (row.objectType !== check.objectType || row.stateBranch !== check.stateBranch) blockers.push(`fidelity:branch-mismatch:${check.id}`);
    if (row.viewport.width !== check.viewport.width || row.viewport.height !== check.viewport.height) blockers.push(`fidelity:viewport-mismatch:${check.id}`);
    if (!row.passed || !row.perceptualPassed) blockers.push(`fidelity:experience-blocked:${check.id}`);
    try {
      const trace = NaturalFlowEvidenceSchema.parse(JSON.parse((await readBoundFile(row.trace)).toString('utf8')));
      const natural = evaluateQaEvidence([], { requireNaturalComplete: true, requireProvenance: true, expectedBuildHash: input.buildHash, naturalFlow: trace });
      if (!trace.passed || !natural.passed || !trace.startedFromReset || trace.actions.length < 2) blockers.push(`fidelity:natural-trace-invalid:${check.id}`);
      if (trace.device?.width !== check.viewport.width || trace.device?.height !== check.viewport.height) blockers.push(`fidelity:trace-viewport-mismatch:${check.id}`);
      if (!trace.transitions.some((transition) => transition.name === check.id && transition.changed)) blockers.push(`fidelity:natural-trigger-missing:${check.id}`);
      for (const screenshot of row.screenshots) {
        await readBoundFile(screenshot);
        if (!trace.screenshots.includes(screenshot.path)) blockers.push(`fidelity:screenshot-not-in-trace:${check.id}`);
      }
    } catch {
      blockers.push(`fidelity:evidence-invalid:${check.id}`);
    }
    if (blockers.length === countBefore) checkedIds.push(check.id);
  }
  return finish();
}
