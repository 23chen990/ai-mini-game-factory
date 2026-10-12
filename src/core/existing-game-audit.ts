import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { buildQualityGateMatrix } from './quality-gates.js';
import { QUALITY_DIMENSIONS, type QualityDimensionId } from '../schemas/quality-gates.js';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/u);
const BoundFile = z.object({
  path: Text,
  sha256: Sha256,
  kind: z.enum(['screenshot', 'video', 'trace', 'log', 'report']),
}).strict();
const Case = z.object({
  id: Text,
  dimension: z.enum(QUALITY_DIMENSIONS),
  objectType: Text,
  stateBranch: Text,
  rendererPath: Text,
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict(),
  expected: Text,
  observed: Text,
  status: z.enum(['PASS', 'FAIL', 'BLOCKED']),
  reviewer: z.enum(['automated', 'independent-qa', 'human']),
  evidence: z.array(BoundFile).min(1),
}).strict();
export const ExistingGameAuditManifestSchema = z.object({
  schemaVersion: z.literal(1),
  repository: Text,
  commit: z.string().regex(/^[0-9a-f]{40}$/u),
  workspace: Text,
  build: BoundFile,
  profile: z.enum(['action-runner', 'general']),
  requiredCaseIds: z.array(Text).min(1),
  cases: z.array(Case).min(1),
  humanPlaytest: z.object({
    passed: z.boolean(),
    buildHash: Sha256,
    reviewer: Text,
    observation: Text,
    evidence: z.array(BoundFile).min(1),
  }).strict().optional(),
}).strict();
export type ExistingGameAuditManifest = z.infer<typeof ExistingGameAuditManifestSchema>;

const ACTION_RUNNER_REQUIRED = ['core-action', 'pursuit-caught', 'pursuit-escape',
  'pickup-contact', 'pickup-missed', 'camera-motion', 'seam-motion',
  'failure-revive', 'settlement-replay'] as const;

async function hashedFile(root: string, entry: z.infer<typeof BoundFile>): Promise<boolean> {
  const base = path.resolve(root);
  const wanted = path.resolve(base, entry.path);
  const relative = path.relative(base, wanted);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false;
  try {
    const baseReal = await realpath(base);
    let current = base;
    for (const component of relative.split(path.sep)) {
      current = path.join(current, component);
      if ((await lstat(current)).isSymbolicLink()) return false;
    }
    const real = await realpath(wanted);
    const inner = path.relative(baseReal, real);
    if (!inner || inner.startsWith('..') || path.isAbsolute(inner) || !(await lstat(real)).isFile()) return false;
    return createHash('sha256').update(await readFile(real)).digest('hex') === entry.sha256;
  } catch { return false; }
}

export async function auditExistingGame(value: unknown) {
  const manifest = ExistingGameAuditManifestSchema.parse(value);
  const buildValid = await hashedFile(manifest.workspace, manifest.build);
  let commitValid = false;
  try {
    const sha = execFileSync('git', ['-C', manifest.workspace, 'rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 5000 }).trim();
    commitValid = sha === manifest.commit;
  } catch { /* exported sources cannot pretend to be verified Git worktrees */ }
  const duplicateIds = manifest.cases.map(row => row.id).filter((id, idx, all) => all.indexOf(id) !== idx);
  const requiredIds = [...new Set([...manifest.requiredCaseIds, ...(manifest.profile === 'action-runner' ? ACTION_RUNNER_REQUIRED : [])])];
  const caseEvidence = await Promise.all(manifest.cases.map(async row => ({
    id: row.id,
    passed: (await Promise.all(row.evidence.map(item => hashedFile(manifest.workspace, item)))).every(Boolean),
  })));
  const bindings = new Map(caseEvidence.map(x => [x.id, x.passed]));
  const allCaseIds = new Set(manifest.cases.map(row => row.id));
  const missingRequired = requiredIds.filter(id => !allCaseIds.has(id));
  const problems: string[] = [];
  if (!commitValid) problems.push('source-commit-mismatch-or-unverified');
  if (!buildValid) problems.push('build-file-hash-or-path-invalid');
  if (duplicateIds.length) problems.push('duplicate-case-ids');
  for (const id of missingRequired) problems.push(`required-case-missing:${id}`);
  for (const row of manifest.cases) {
    if (!bindings.get(row.id)) problems.push(`unverified-case-evidence:${row.id}`);
    if (['seam-motion', 'camera-motion'].includes(row.id) && !row.evidence.some(e => e.kind === 'video')) problems.push(`continuous-video-missing:${row.id}`);
    if (['pursuit-caught', 'pursuit-escape', 'pickup-contact', 'pickup-missed'].includes(row.id)
      && !row.evidence.some(e => e.kind === 'trace')) problems.push(`causal-trace-missing:${row.id}`);
    if (['visualUx', 'coreExperience'].includes(row.dimension) && row.reviewer === 'automated') problems.push(`independent-perceptual-review-missing:${row.id}`);
  }
  const signals = Object.fromEntries(QUALITY_DIMENSIONS.map(dimension => {
    const rows = manifest.cases.filter(row => row.dimension === dimension);
    const dimensionMissing = requiredIds.some(id => !manifest.cases.some(row => row.id === id));
    const blockers = [
      ...(rows.length ? [] : [`no-evidence:${dimension}`]),
      ...(dimensionMissing ? missingRequired.map(id => `missing:${id}`) : []),
      ...rows.filter(row => row.status !== 'PASS' || !bindings.get(row.id)).map(row => `failed-or-unverified:${row.id}`),
    ];
    if (dimension === 'releaseEngineering' && (!buildValid || !commitValid)) blockers.push('source-build-identity-invalid');
    if (['visualUx', 'coreExperience'].includes(dimension)) {
      blockers.push(...rows.filter(row => row.reviewer === 'automated').map(row => `independent-review-required:${row.id}`));
    }
    return [dimension, { passed: blockers.length === 0, evidence: rows.flatMap(row => row.evidence.map(x => x.path)), blockers }];
  })) as Record<QualityDimensionId, { passed: boolean; evidence: string[]; blockers: string[] }>;
  const human = manifest.humanPlaytest;
  const humanEvidenceOk = !!human && (await Promise.all(human.evidence.map(e => hashedFile(manifest.workspace, e)))).every(Boolean);
  const humanPassed = !!human?.passed && !!humanEvidenceOk && buildValid && human.buildHash === manifest.build.sha256;
  if (!humanPassed) problems.push('human-exact-build-playtest-not-approved');
  const matrix = buildQualityGateMatrix(signals, { candidateHash: buildValid ? manifest.build.sha256 : undefined,
    requireCandidateHash: true });
  return {
    schemaVersion: 1 as const, repository: manifest.repository, commit: manifest.commit,
    buildHash: manifest.build.sha256, buildValid, commitValid, requiredIds, missingRequired,
    matrix, humanPassed, problems: [...new Set(problems)],
    passed: matrix.passed && humanPassed && problems.length === 0,
    method: 'read-only evidence verification; never a substitute for conducting browser play',
  };
}
