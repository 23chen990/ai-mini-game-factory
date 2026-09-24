import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { runVisualEvidenceGate } from '../qa/experience-gates.js';
import { NaturalFlowEvidenceSchema, type NaturalFlowEvidence } from '../schemas/natural-flow.js';
import { EvidenceFileBindingSchema, PerceptualQaReportSchema, ProductExperienceContractSchema } from '../schemas/product-experience.js';
import { ProfileIndependentEvidenceSchema, type ProfileIndependentEvidence } from '../schemas/profile-stage.js';
import { verifyPerceptualQaReview } from './product-experience-qa.js';
import { sha256File, sha256Text } from './files.js';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu, 'expected a SHA-256 hex digest');

/** The identity that every action-feel artifact must name explicitly. */
export type ActionFeelCandidateIdentity = {
  slot: 'A' | 'B' | 'C';
  workspace: string;
  targetRunId: string;
  targetGame: string;
  experimentId: string;
};

const NaturalReportWrapperSchema = z.object({
  schemaVersion: z.literal(1),
  targetRunId: Text,
  targetGame: Text,
  targetWorkspace: Text.refine((value) => path.isAbsolute(value), 'targetWorkspace must be absolute'),
  experimentId: Text,
  slot: z.enum(['A', 'B', 'C']),
  buildHash: Sha256,
  trace: EvidenceFileBindingSchema,
  screenshots: z.array(EvidenceFileBindingSchema).min(2),
  traceHash: Sha256.optional(),
}).strict();

type EvidenceContext = {
  runRoot: string;
  runId: string;
  candidate: ActionFeelCandidateIdentity;
  summaryCandidate: ActionFeelCandidateIdentity;
  blockers: string[];
  buildHash?: string;
};

type BoundFile = { path: string; sha256: string };
type BoundFileErrorCode = 'path' | 'symlink' | 'missing' | 'hash' | 'regular-file';

class BoundFileError extends Error {
  constructor(readonly code: BoundFileErrorCode, message: string) {
    super(message);
    this.name = 'BoundFileError';
  }
}

function unique(items: string[]) {
  return [...new Set(items.filter((item) => item.length > 0))];
}

function strictChildPath(parent: string, candidate: string) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative.length > 0 && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function candidateField(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function summaryCandidate(runRoot: string, candidate: ActionFeelCandidateIdentity): ActionFeelCandidateIdentity {
  const safeRunRoot = path.resolve(runRoot);
  const candidateWorkspace = candidateField(candidate?.workspace, path.join(safeRunRoot, 'workspace/unknown-candidate'));
  return {
    slot: candidate?.slot === 'B' || candidate?.slot === 'C' ? candidate.slot : 'A',
    workspace: path.isAbsolute(candidateWorkspace) ? path.resolve(candidateWorkspace) : path.resolve(safeRunRoot, candidateWorkspace),
    targetRunId: candidateField(candidate?.targetRunId, `unknown-run-${path.basename(safeRunRoot)}`),
    targetGame: candidateField(candidate?.targetGame, 'unknown-game'),
    experimentId: candidateField(candidate?.experimentId, 'unknown-experiment'),
  };
}

function profileEvidence(input: {
  candidate: ActionFeelCandidateIdentity;
  passed: boolean;
  evidence: string[];
  blockers: string[];
  buildHash?: string;
  freshContext?: boolean;
  naturalInput?: boolean;
  replayObserved?: boolean;
  completion?: ProfileIndependentEvidence['completion'];
  fixtureOnly?: boolean;
  playerVisible?: boolean;
  authorIndependent?: boolean;
}) {
  const evidence = unique(input.evidence);
  if (evidence.length === 0 && input.blockers.length > 0) evidence.push(...unique(input.blockers));
  return ProfileIndependentEvidenceSchema.parse({
    passed: input.passed,
    evidence,
    blockers: unique(input.blockers),
    targetRunId: input.candidate.targetRunId,
    targetGame: input.candidate.targetGame,
    targetWorkspace: input.candidate.workspace,
    experimentId: input.candidate.experimentId,
    ...(input.buildHash ? { buildHash: input.buildHash } : {}),
    ...(input.freshContext !== undefined ? { freshContext: input.freshContext } : {}),
    ...(input.naturalInput !== undefined ? { naturalInput: input.naturalInput } : {}),
    ...(input.replayObserved !== undefined ? { replayObserved: input.replayObserved } : {}),
    ...(input.completion !== undefined ? { completion: input.completion } : {}),
    ...(input.fixtureOnly !== undefined ? { fixtureOnly: input.fixtureOnly } : {}),
    ...(input.playerVisible !== undefined ? { playerVisible: input.playerVisible } : {}),
    ...(input.authorIndependent !== undefined ? { authorIndependent: input.authorIndependent } : {}),
  });
}

function normalizeRelativeEvidencePath(value: string) {
  const normalized = value.replaceAll('\\', '/').trim();
  if (!normalized || normalized.startsWith('/') || /^[a-z]:\//iu.test(normalized)) return undefined;
  const parts = normalized.split('/');
  if (parts.includes('..')) return undefined;
  const canonical = path.posix.normalize(normalized);
  if (!canonical || canonical === '.' || canonical.startsWith('../') || canonical.includes('/../')) return undefined;
  return canonical;
}

async function requireRealDirectory(directory: string) {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`directory is not a real directory: ${directory}`);
}

async function requireNoSymlinkComponents(root: string, target: string) {
  if (!strictChildPath(root, target)) throw new Error('target is outside the anchored directory');
  let current = path.resolve(root);
  for (const component of path.relative(path.resolve(root), path.resolve(target)).split(path.sep)) {
    current = path.join(current, component);
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) throw new Error('target path contains a symlink');
    if (current !== path.resolve(target) && !stat.isDirectory()) throw new Error('target path parent is not a directory');
  }
}

async function listRegularFiles(directory: string, base = directory): Promise<string[]> {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`build path is not a real directory: ${directory}`);
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`build path contains a symlink: ${path.relative(base, file)}`);
    if (entry.isDirectory()) files.push(...await listRegularFiles(file, base));
    else if (entry.isFile()) files.push(path.relative(base, file));
    else throw new Error(`build path contains a non-regular entry: ${path.relative(base, file)}`);
  }
  return files.sort();
}

/** Hash the candidate dist directory with the factory's file:sha256 scheme. */
export async function hashActionFeelCandidateBuild(workspace: string): Promise<string> {
  if (!path.isAbsolute(workspace)) throw new Error('candidate workspace must be absolute');
  const resolvedWorkspace = path.resolve(workspace);
  await requireRealDirectory(resolvedWorkspace);
  const dist = path.join(resolvedWorkspace, 'dist');
  await requireRealDirectory(dist);
  const files = await listRegularFiles(dist);
  const entries = await Promise.all(files.map(async (file) => `${file}:${await sha256File(path.join(dist, file))}`));
  return sha256Text(entries.join('\n'));
}

async function readRunBoundFile(runRoot: string, reference: BoundFile) {
  const root = path.resolve(runRoot);
  const normalized = normalizeRelativeEvidencePath(reference.path);
  if (!normalized) throw new BoundFileError('path', 'evidence path escapes run root');
  try {
    const rootStat = await lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new BoundFileError('symlink', 'run root is not a real directory');
    const realRoot = await realpath(root);
    const file = path.resolve(root, normalized);
    if (!strictChildPath(root, file)) throw new BoundFileError('path', 'evidence path escapes run root');
    let current = root;
    for (const component of normalized.split('/')) {
      current = path.join(current, component);
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new BoundFileError('symlink', 'evidence path is a symlink');
      if (current !== file && !stat.isDirectory()) throw new BoundFileError('regular-file', 'evidence parent is not a directory');
    }
    const fileStat = await lstat(file);
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) throw new BoundFileError('regular-file', 'evidence is not a regular file');
    const realFile = await realpath(file);
    if (!strictChildPath(realRoot, realFile)) throw new BoundFileError('path', 'evidence resolves outside run root');
    const bytes = await readFile(realFile);
    if (await sha256File(realFile) !== reference.sha256) throw new BoundFileError('hash', 'evidence hash mismatch');
    return { bytes, path: normalized };
  } catch (error) {
    if (error instanceof BoundFileError) throw error;
    throw new BoundFileError('missing', error instanceof Error ? error.message : 'evidence file is missing');
  }
}

async function validateCandidateContext(runRoot: string, candidate: ActionFeelCandidateIdentity): Promise<EvidenceContext> {
  const resolvedRunRoot = path.resolve(runRoot);
  const safeCandidate = summaryCandidate(resolvedRunRoot, candidate);
  const blockers: string[] = [];
  const runId = path.basename(resolvedRunRoot);
  if (candidate?.targetRunId !== runId) blockers.push('candidate:run-mismatch');
  if (!['A', 'B', 'C'].includes(candidate?.slot)) blockers.push('candidate:slot-invalid');
  if (!candidateField(candidate?.targetGame, '').length) blockers.push('candidate:game-missing');
  if (!candidateField(candidate?.experimentId, '').length) blockers.push('candidate:experiment-missing');
  if (!path.isAbsolute(candidate?.workspace ?? '')) blockers.push('candidate:workspace-not-absolute');
  try {
    const rootStat = await lstat(resolvedRunRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) blockers.push('candidate:run-root-invalid');
    const workspaceRoot = path.join(resolvedRunRoot, 'workspace');
    await requireRealDirectory(workspaceRoot);
    const resolvedWorkspace = path.resolve(candidate?.workspace ?? '');
    if (!strictChildPath(workspaceRoot, resolvedWorkspace)) blockers.push('candidate:workspace-outside-run');
    else {
      await requireNoSymlinkComponents(resolvedRunRoot, resolvedWorkspace);
      await requireRealDirectory(resolvedWorkspace);
      const [realWorkspaceRoot, realWorkspace] = await Promise.all([realpath(workspaceRoot), realpath(resolvedWorkspace)]);
      if (!strictChildPath(realWorkspaceRoot, realWorkspace)) blockers.push('candidate:workspace-resolves-outside-run');
    }
  } catch (error) {
    if (error instanceof Error && /symlink/u.test(error.message)) blockers.push('candidate:workspace-symlink');
    else blockers.push('candidate:workspace-missing');
  }
  let buildHash: string | undefined;
  if (blockers.length === 0) {
    try { buildHash = await hashActionFeelCandidateBuild(candidate.workspace); }
    catch { blockers.push('candidate:dist-invalid'); }
  }
  return { runRoot: resolvedRunRoot, runId, candidate: safeCandidate, summaryCandidate: safeCandidate, blockers, ...(buildHash ? { buildHash } : {}) };
}

function naturalBoundFileBlocker(kind: string, file: string, error: unknown) {
  const code = error instanceof BoundFileError ? error.code : 'missing';
  if (code === 'hash') return `natural:${kind}-hash-mismatch`;
  if (code === 'path' || code === 'symlink' || code === 'regular-file') return `natural:${kind}-path-invalid`;
  return `natural:${kind}-missing`;
}

function perceptualBoundFileBlocker(kind: string, error: unknown) {
  const code = error instanceof BoundFileError ? error.code : 'missing';
  if (code === 'hash') return `perceptual:${kind}-hash-mismatch`;
  if (code === 'path' || code === 'symlink' || code === 'regular-file') return `perceptual:${kind}-path-invalid`;
  return `perceptual:${kind}-missing`;
}

async function verifyNaturalEvidence(context: EvidenceContext, reportValue: unknown): Promise<ProfileIndependentEvidence> {
  const blockers = [...context.blockers];
  const evidence: string[] = [];
  const report = NaturalReportWrapperSchema.safeParse(reportValue);
  let trace: NaturalFlowEvidence | undefined;
  let freshContext = false;
  let replayObserved = false;
  let completion: ProfileIndependentEvidence['completion'] = 'none';
  let fixtureOnly = true;

  if (reportValue === undefined) blockers.push('natural:report-missing');
  else if (!report.success) blockers.push('natural:wrapper-invalid');
  if (report.success) {
    const value = report.data;
    evidence.push(`natural:trace:${value.trace.path}`, ...value.screenshots.map((item) => `natural:screenshot:${item.path}`));
    if (value.targetRunId !== context.candidate.targetRunId || value.targetRunId !== context.runId) blockers.push('natural:run-mismatch');
    if (value.targetGame !== context.candidate.targetGame) blockers.push('natural:game-mismatch');
    if (path.resolve(value.targetWorkspace) !== path.resolve(context.candidate.workspace)) blockers.push('natural:workspace-mismatch');
    if (value.experimentId !== context.candidate.experimentId) blockers.push('natural:experiment-mismatch');
    if (value.slot !== context.candidate.slot) blockers.push('natural:slot-mismatch');
    if (context.buildHash === undefined) blockers.push('natural:selected-candidate-dist-missing');
    else if (value.buildHash !== context.buildHash) blockers.push('natural:build-hash-mismatch');
    if (new Set(value.screenshots.map((item) => normalizeRelativeEvidencePath(item.path))).size < 2) blockers.push('natural:screenshot-coverage-insufficient');

    try {
      const boundTrace = await readRunBoundFile(context.runRoot, value.trace);
      const traceValue: unknown = JSON.parse(boundTrace.bytes.toString('utf8'));
      const parsedTrace = NaturalFlowEvidenceSchema.safeParse(traceValue);
      if (!parsedTrace.success) blockers.push('natural:trace-schema-invalid');
      else {
        trace = parsedTrace.data;
        freshContext = trace.startedFromReset;
        replayObserved = trace.replayObserved;
        completion = trace.completion;
        fixtureOnly = /fixture|deterministic|scenario|actiontournament/iu.test(trace.runner);
        if (value.traceHash !== undefined && value.traceHash !== sha256Text(boundTrace.bytes.toString('utf8'))) blockers.push('natural:trace-hash-mismatch');
        if (trace.buildHash !== context.buildHash) blockers.push('natural:build-hash-mismatch');
        if (trace.runtime !== 'web-lite') blockers.push('natural:runtime-mismatch');
        if (!trace.device) blockers.push('natural:viewport-missing');
        if (!trace.startedFromReset) blockers.push('natural:reset-missing');
        if (trace.actions.length < 2) blockers.push('natural:input-trace-too-short');
        if (trace.actions.some((action) => /fixture|debug|state[_ -]?inject|setstate|evaluate|test[_ -]?api/iu.test(action))) blockers.push('natural:non-normal-action');
        if (!['terminal', 'settlement'].includes(trace.completion)) blockers.push('natural:terminal-or-settlement-missing');
        if (!trace.replayObserved) blockers.push('natural:replay-missing');
        if (trace.forbiddenOperations.length > 0) blockers.push('natural:forbidden-operation');
        if (!trace.passed) blockers.push(...(trace.blockers.length > 0 ? trace.blockers.map((item) => `natural:${item}`) : ['natural:report-failed']));
        if (fixtureOnly) blockers.push('natural:fixture-runner');
        if (trace.screenshots.length === 0) blockers.push('natural:screenshot-coverage-missing');
        const wrapperScreenshots = new Map(value.screenshots.map((item) => [normalizeRelativeEvidencePath(item.path), item]));
        for (const screenshotPath of trace.screenshots) {
          const normalized = normalizeRelativeEvidencePath(screenshotPath);
          if (!normalized || !wrapperScreenshots.has(normalized)) {
            blockers.push(`natural:trace-screenshot-unbound:${screenshotPath}`);
            continue;
          }
        }
      }
    } catch (error) {
      blockers.push(naturalBoundFileBlocker('trace', value.trace.path, error));
    }

    const safeScreenshotPaths: string[] = [];
    for (const screenshot of value.screenshots) {
      try {
        const bound = await readRunBoundFile(context.runRoot, screenshot);
        safeScreenshotPaths.push(bound.path);
        evidence.push(`${bound.path}#sha256:${screenshot.sha256}`);
      } catch (error) {
        blockers.push(naturalBoundFileBlocker('screenshot', screenshot.path, error));
      }
    }
    const visual = await runVisualEvidenceGate(context.runRoot, unique(safeScreenshotPaths));
    evidence.push(...visual.evidence.map((item) => `visual:${item}`));
    if (!visual.passed) blockers.push('natural:visual-evidence-gate');
  }
  const passed = blockers.length === 0 && report.success && trace !== undefined;
  return profileEvidence({
    candidate: context.summaryCandidate,
    passed,
    evidence,
    blockers,
    buildHash: context.buildHash,
    freshContext,
    naturalInput: passed,
    replayObserved,
    completion,
    fixtureOnly,
    playerVisible: passed,
  });
}

async function verifyPerceptualEvidence(context: EvidenceContext, reportValue: unknown, contractValue: unknown): Promise<ProfileIndependentEvidence> {
  const blockers = [...context.blockers];
  const evidence: string[] = [];
  const contract = ProductExperienceContractSchema.safeParse(contractValue);
  const report = PerceptualQaReportSchema.safeParse(reportValue);
  let authorIndependent = false;

  if (contractValue === undefined) blockers.push('perceptual:contract-missing');
  else if (!contract.success) blockers.push('perceptual:contract-invalid');
  if (reportValue === undefined) blockers.push('perceptual:report-missing');
  else if (!report.success) blockers.push('perceptual:report-invalid');

  if (contract.success) {
    const value = contract.data;
    if (value.targetRunId !== context.candidate.targetRunId || value.targetRunId !== context.runId) blockers.push('perceptual:contract-run-mismatch');
    if (value.targetGame !== context.candidate.targetGame) blockers.push('perceptual:contract-game-mismatch');
    if (path.resolve(value.targetWorkspace) !== path.resolve(context.candidate.workspace)) blockers.push('perceptual:contract-workspace-mismatch');
    if (value.runtime !== 'web-lite') blockers.push('perceptual:runtime-mismatch');
  }
  if (report.success) {
    const value = report.data;
    authorIndependent = value.authorIndependent && value.reviewer !== 'DeterministicCapture';
    if (value.targetRunId !== context.candidate.targetRunId || value.targetRunId !== context.runId) blockers.push('perceptual:run-mismatch');
    if (value.targetGame !== context.candidate.targetGame) blockers.push('perceptual:game-mismatch');
    if (path.resolve(value.targetWorkspace) !== path.resolve(context.candidate.workspace)) blockers.push('perceptual:workspace-mismatch');
    if (value.runtime !== 'web-lite') blockers.push('perceptual:runtime-mismatch');
    if (context.buildHash === undefined) blockers.push('perceptual:selected-candidate-dist-missing');
    else if (value.buildHash !== context.buildHash) blockers.push('perceptual:build-hash-mismatch');
    if (!authorIndependent) blockers.push('perceptual:independent-review-required');
    const screenshotBindings = value.cases.flatMap((item) => item.screenshots);
    const safeScreenshotPaths: string[] = [];
    for (const screenshot of screenshotBindings) {
      try {
        const bound = await readRunBoundFile(context.runRoot, screenshot);
        safeScreenshotPaths.push(bound.path);
        evidence.push(`${bound.path}#sha256:${screenshot.sha256}`);
      } catch (error) {
        blockers.push(perceptualBoundFileBlocker('screenshot', error));
      }
    }
    const visual = await runVisualEvidenceGate(context.runRoot, unique(safeScreenshotPaths));
    evidence.push(...visual.evidence.map((item) => `visual:${item}`));
    if (!visual.passed) blockers.push('perceptual:visual-evidence-gate');
    for (const item of value.cases) {
      if (item.trace) evidence.push(`perceptual:trace:${item.trace.path}`);
    }
  }

  if (contract.success && report.success && context.buildHash !== undefined) {
    try {
      const verified = await verifyPerceptualQaReview({
        runRoot: context.runRoot,
        workspace: context.candidate.workspace,
        contract: contract.data,
        buildHash: context.buildHash,
        report: report.data,
      });
      blockers.push(...verified.blockers);
      evidence.push(`perceptual:coverage:${verified.checkedCaseIds.length}/${verified.requiredCaseIds.length}`);
    } catch {
      blockers.push('perceptual:verification-error');
    }
  }
  const passed = blockers.length === 0 && contract.success && report.success && authorIndependent;
  return profileEvidence({
    candidate: context.summaryCandidate,
    passed,
    evidence,
    blockers,
    buildHash: context.buildHash,
    playerVisible: passed,
    authorIndependent,
  });
}

/** Verify natural and perceptual action-feel evidence without invoking a provider. */
export async function verifyActionFeelPlayerEvidence(input: {
  runRoot: string;
  candidate: ActionFeelCandidateIdentity;
  naturalReport?: unknown;
  perceptualReport?: unknown;
  contract?: unknown;
}): Promise<{ naturalPlay: ProfileIndependentEvidence; perceptual: ProfileIndependentEvidence }> {
  const candidate = summaryCandidate(input.runRoot, input.candidate);
  let context: EvidenceContext;
  try {
    context = await validateCandidateContext(input.runRoot, input.candidate);
  } catch {
    context = {
      runRoot: path.resolve(input.runRoot),
      runId: path.basename(path.resolve(input.runRoot)),
      candidate,
      summaryCandidate: candidate,
      blockers: ['candidate:context-invalid'],
    };
  }
  const [naturalPlay, perceptual] = await Promise.all([
    verifyNaturalEvidence(context, input.naturalReport),
    verifyPerceptualEvidence(context, input.perceptualReport, input.contract),
  ]);
  return { naturalPlay, perceptual };
}
