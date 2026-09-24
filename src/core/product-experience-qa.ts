import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { evaluateQaEvidence } from './qa-evidence.js';
import { sha256Text } from './files.js';
import { NaturalFlowEvidenceSchema } from '../schemas/natural-flow.js';
import { PerceptualQaGateSchema, PerceptualQaReportSchema, ProductExperienceContractSchema } from '../schemas/product-experience.js';

type BoundFile = { path: string; sha256: string };

async function readRunBoundFile(runRoot: string, reference: BoundFile): Promise<Buffer> {
  const normalized = reference.path.replaceAll('\\', '/').trim();
  const root = path.resolve(runRoot);
  const file = path.resolve(root, normalized);
  const relative = path.relative(root, file);
  if (!normalized || !relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('evidence path escapes run root');
  }
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('unsafe run root');
  const realRoot = await realpath(root);
  let current = root;
  for (const component of normalized.split('/')) {
    if (!component || component === '.') continue;
    current = path.join(current, component);
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) throw new Error('evidence path is a symlink');
    if (current !== file && !stat.isDirectory()) throw new Error('evidence parent is not a directory');
  }
  const fileStat = await lstat(file);
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) throw new Error('evidence is not a regular file');
  const realFile = await realpath(file);
  const realRelative = path.relative(realRoot, realFile);
  if (!realRelative || realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) throw new Error('evidence resolves outside run root');
  const bytes = await readFile(realFile);
  if (createHash('sha256').update(bytes).digest('hex') !== reference.sha256) throw new Error('evidence hash mismatch');
  return bytes;
}

function caseId(featureId: string, viewport: { width: number; height: number; label: string }) {
  return `${featureId}@${viewport.width}x${viewport.height}:${viewport.label}`;
}

function orderedSubsequence(expected: string[], observed: string[]) {
  let cursor = 0;
  for (const event of observed) if (event === expected[cursor]) cursor += 1;
  return cursor === expected.length;
}

/**
 * Verify identity, exact matrix coverage, evidence hashes and a natural-input
 * trace. Pixel quality remains the independent reviewer's responsibility.
 */
export async function verifyPerceptualQaReview(input: {
  runRoot: string;
  workspace: string;
  contract: unknown;
  buildHash: string;
  report?: unknown;
}) {
  const contract = ProductExperienceContractSchema.safeParse(input.contract);
  const blockers: string[] = [];
  const checkedCaseIds: string[] = [];
  const expectedCases = contract.success
    ? contract.data.features.flatMap((feature) => feature.requiredViewports.map((viewport) => ({ feature, viewport, id: caseId(feature.id, viewport) })))
    : [];
  const contractHash = contract.success ? sha256Text(JSON.stringify(contract.data)) : null;
  const finish = () => PerceptualQaGateSchema.parse({
    schemaVersion: 1,
    targetRunId: contract.success ? contract.data.targetRunId : 'unknown',
    contractHash,
    buildHash: input.buildHash,
    passed: blockers.length === 0,
    blockers: [...new Set(blockers)],
    requiredCaseIds: expectedCases.map((item) => item.id),
    checkedCaseIds,
  });

  if (!contract.success) {
    blockers.push('perceptual:contract-invalid');
    return finish();
  }
  if (path.resolve(contract.data.targetWorkspace) !== path.resolve(input.workspace)) blockers.push('perceptual:workspace-mismatch');
  try {
    await readRunBoundFile(input.runRoot, { path: contract.data.sourceArtifact.path, sha256: contract.data.sourceArtifact.sha256 });
  } catch {
    blockers.push('perceptual:source-artifact-invalid');
  }
  for (const entrypoint of contract.data.runtimeEntrypoints) {
    const absolute = path.resolve(input.workspace, entrypoint);
    const relative = path.relative(path.resolve(input.workspace), absolute);
    try {
      if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('entrypoint escapes workspace');
      const stat = await lstat(absolute);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('entrypoint invalid');
    } catch {
      blockers.push(`perceptual:entrypoint-missing:${entrypoint}`);
    }
  }
  if (input.report === undefined) {
    blockers.push('perceptual:review-missing');
    return finish();
  }
  const report = PerceptualQaReportSchema.safeParse(input.report);
  if (!report.success) {
    blockers.push('perceptual:review-invalid');
    return finish();
  }
  if (report.data.targetGame !== contract.data.targetGame) blockers.push('perceptual:game-mismatch');
  if (report.data.targetRunId !== contract.data.targetRunId) blockers.push('perceptual:run-mismatch');
  if (path.resolve(report.data.targetWorkspace) !== path.resolve(input.workspace)) blockers.push('perceptual:review-workspace-mismatch');
  if (report.data.contractHash !== contractHash) blockers.push('perceptual:contract-hash-mismatch');
  if (report.data.buildHash !== input.buildHash) blockers.push('perceptual:build-hash-mismatch');
  if (report.data.runtime !== contract.data.runtime) blockers.push('perceptual:runtime-mismatch');
  if (JSON.stringify(report.data.runtimeEntrypoints) !== JSON.stringify(contract.data.runtimeEntrypoints)) blockers.push('perceptual:entrypoint-mismatch');
  if (report.data.reviewer === 'DeterministicCapture' || !report.data.authorIndependent) blockers.push('perceptual:independent-review-required');
  if (!report.data.passed) blockers.push(...(report.data.blockers.length > 0 ? report.data.blockers : ['perceptual:review-failed']));

  const reportIds = report.data.cases.map((row) => caseId(row.featureId, row.viewport));
  if (new Set(reportIds).size !== reportIds.length) blockers.push('perceptual:duplicate-cases');
  for (const rowId of reportIds) if (!expectedCases.some((expected) => expected.id === rowId)) blockers.push(`perceptual:unknown-case:${rowId}`);

  for (const expected of expectedCases) {
    const row = report.data.cases.find((candidate) => caseId(candidate.featureId, candidate.viewport) === expected.id);
    if (!row) {
      blockers.push(`perceptual:case-missing:${expected.id}`);
      continue;
    }
    const before = blockers.length;
    if (row.objectType !== expected.feature.objectType || row.stateBranch !== expected.feature.stateBranch) blockers.push(`perceptual:branch-mismatch:${expected.id}`);
    if (JSON.stringify(row.sourceCheckIds) !== JSON.stringify(expected.feature.sourceCheckIds)) blockers.push(`perceptual:source-check-mismatch:${expected.id}`);
    if (!row.playerVisible || !row.naturalTriggerVerified || !row.eventOrderVerified || !row.negativeAssertionsPassed || !row.perceptualPassed) blockers.push(`perceptual:experience-blocked:${expected.id}`);
    if (!orderedSubsequence(expected.feature.expectedEventOrder, row.observedEventOrder)) blockers.push(`perceptual:event-order-mismatch:${expected.id}`);
    if (!row.trace || row.screenshots.length === 0) {
      blockers.push(`perceptual:evidence-missing:${expected.id}`);
    } else {
      try {
        const trace = NaturalFlowEvidenceSchema.parse(JSON.parse((await readRunBoundFile(input.runRoot, row.trace)).toString('utf8')));
        const natural = evaluateQaEvidence([], {
          requireNaturalComplete: true,
          requireProvenance: true,
          expectedBuildHash: input.buildHash,
          expectedRuntime: contract.data.runtime,
          expectedDevice: expected.viewport,
          naturalFlow: trace,
        });
        if (!trace.passed || !trace.startedFromReset || trace.actions.length < 2 || !natural.passed) blockers.push(`perceptual:natural-trace-invalid:${expected.id}`);
        if (!trace.transitions.some((transition) => transition.name === expected.feature.id && transition.changed)) blockers.push(`perceptual:natural-trigger-missing:${expected.id}`);
        for (const screenshot of row.screenshots) {
          await readRunBoundFile(input.runRoot, screenshot);
          if (!trace.screenshots.includes(screenshot.path)) blockers.push(`perceptual:screenshot-not-in-trace:${expected.id}`);
        }
      } catch {
        blockers.push(`perceptual:evidence-invalid:${expected.id}`);
      }
    }
    if (blockers.length === before) checkedCaseIds.push(expected.id);
  }
  return finish();
}
