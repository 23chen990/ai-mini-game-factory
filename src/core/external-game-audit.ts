/**
 * Evidence-bound audit of an existing game workspace, without recreating it as
 * a factory run. This verifier NEVER plays the game or invents a QA verdict.
 * Independent reviewers supply natural/perceptual/human evidence, and missing
 * evidence is always a blocker. Works only on a local, authorized workspace.
 */
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { buildQualityGateMatrix } from './quality-gates.js';
import { QUALITY_DIMENSIONS, type QualityDimensionId } from '../schemas/quality-gates.js';

const HexSha = z.string().regex(/^[a-f0-9]{64}$/u);
const Nonempty = z.string().trim().min(1);
const FileEvidence = z.object({ path: Nonempty, sha256: HexSha }).strict();
const Viewport = z.object({ width: z.number().int().positive(), height: z.number().int().positive(), label: Nonempty }).strict();
const ObjectCase = z.object({
  id: Nonempty,
  dimension: z.enum(QUALITY_DIMENSIONS),
  objectType: Nonempty,
  stateBranch: Nonempty,
  rendererPath: Nonempty,
  viewport: Viewport,
  expected: Nonempty,
  naturalTrigger: Nonempty,
  requiredEvidenceKinds: z.array(z.enum(['engineering', 'natural-input', 'perceptual', 'human-playtest', 'phone-performance', 'platform-package'])).min(1),
}).strict();
const Evidence = z.object({
  caseId: Nonempty,
  kind: z.enum(['engineering', 'natural-input', 'perceptual', 'human-playtest', 'phone-performance', 'platform-package']),
  buildHash: HexSha,
  status: z.enum(['PASS', 'FAIL', 'BLOCKED', 'UNKNOWN']),
  reviewer: Nonempty,
  independentOfBuilder: z.boolean(),
  observed: Nonempty,
  inputMethod: z.enum(['fixture', 'natural-input', 'independent-visual', 'human', 'real-device', 'platform-toolchain']),
  files: z.array(FileEvidence).min(1),
}).strict();

export const ExternalGameAuditManifestSchema = z.object({
  schemaVersion: z.literal(1),
  targetGame: Nonempty,
  repository: Nonempty,
  commit: z.string().regex(/^[a-f0-9]{40}$/u),
  workspace: Nonempty,
  scope: z.enum(['web-lite', 'commercial']),
  playable: FileEvidence,
  cases: z.array(ObjectCase).min(1),
  evidence: z.array(Evidence),
  requireHumanPlaytest: z.boolean().default(true),
}).strict().superRefine((v, ctx) => {
  const ids = v.cases.map(x => x.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['cases'], message: 'duplicate case id' });
  const known = new Set(ids);
  for (const [i, row] of v.evidence.entries()) if (!known.has(row.caseId)) {
    ctx.addIssue({ code: 'custom', path: ['evidence', i, 'caseId'], message: 'unknown case id' });
  }
});
export type ExternalGameAuditManifest = z.infer<typeof ExternalGameAuditManifestSchema>;

type EvidenceResult = { kind: ExternalGameAuditManifest['evidence'][number]['kind']; status: 'PASS' | 'FAIL' | 'BLOCKED'; blockers: string[]; verifiedFiles: string[] };
export type ExternalCaseAudit = {
  id: string;
  dimension: QualityDimensionId;
  objectType: string;
  stateBranch: string;
  rendererPath: string;
  viewport: { width: number; height: number; label: string };
  status: 'PASS' | 'FAIL' | 'UNKNOWN';
  evidence: EvidenceResult[];
  blockers: string[];
};

function sha(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }

/** Refuse symlinks, path traversal, and mismatched evidence identities. */
async function verifiedFile(workspace: string, realRoot: string, relative: string, expectedSha: string): Promise<boolean> {
  if (!relative || path.isAbsolute(relative) || relative.includes('\\')) return false;
  const parts = relative.split('/');
  if (parts.some(segment => !segment || segment === '.' || segment === '..')) return false;
  let cursor = workspace;
  try {
    for (const [index, segment] of parts.entries()) {
      cursor = path.join(cursor, segment);
      const stat = await lstat(cursor);
      if (stat.isSymbolicLink()) return false;
      if (index !== parts.length - 1 && !stat.isDirectory()) return false;
      if (index === parts.length - 1 && !stat.isFile()) return false;
    }
    const resolved = await realpath(cursor);
    const relativeToRoot = path.relative(realRoot, resolved);
    if (!relativeToRoot || relativeToRoot === '..' || relativeToRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToRoot)) return false;
    return sha(await readFile(resolved)) === expectedSha;
  } catch { return false; }
}

const methodForKind: Record<ExternalGameAuditManifest['evidence'][number]['kind'], string> = {
  engineering: 'fixture',
  'natural-input': 'natural-input',
  perceptual: 'independent-visual',
  'human-playtest': 'human',
  'phone-performance': 'real-device',
  'platform-package': 'platform-toolchain',
};

export async function auditExistingGame(manifestFilename: string) {
  const input = JSON.parse(await readFile(manifestFilename, 'utf8')) as unknown;
  const manifest = ExternalGameAuditManifestSchema.parse(input);
  const workspace = path.resolve(manifest.workspace);
  const stat = await lstat(workspace);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('workspace must be a real directory, not a symlink');
  const realRoot = await realpath(workspace);
  const correctPlayable = await verifiedFile(workspace, realRoot, manifest.playable.path, manifest.playable.sha256);
  const blockers: string[] = correctPlayable ? [] : ['candidate-html-hash-mismatch'];
  const buildHash = manifest.playable.sha256;
  const caseReports: ExternalCaseAudit[] = [];

  for (const testCase of manifest.cases) {
    const evidence: EvidenceResult[] = [];
    const caseBlockers: string[] = [];
    const supplied = manifest.evidence.filter(row => row.caseId === testCase.id);
    for (const kind of testCase.requiredEvidenceKinds) {
      const matched = supplied.filter(row => row.kind === kind);
      if (matched.length !== 1) {
        caseBlockers.push(`required-evidence-count:${kind}:${matched.length}`);
        continue;
      }
      const candidate = matched[0]!;
      const problems: string[] = [];
      if (candidate.buildHash !== buildHash) problems.push('wrong-build-hash');
      if (candidate.inputMethod !== methodForKind[kind]) problems.push('wrong-input-method');
      // A scripted screenshot or the Builder's self-review cannot sign a
      // natural experience, perceptual, device or human success.
      if (kind !== 'engineering' && !candidate.independentOfBuilder) problems.push('reviewer-not-independent');
      if (kind === 'human-playtest' && /^(?:qaagent|builderagent|fixeragent|ci|bot)$/iu.test(candidate.reviewer)) problems.push('not-a-human-player');
      if (candidate.status !== 'PASS') problems.push(`reported-${candidate.status.toLowerCase()}`);
      const verifiedFiles: string[] = [];
      for (const file of candidate.files) {
        if (await verifiedFile(workspace, realRoot, file.path, file.sha256)) verifiedFiles.push(file.path);
        else problems.push(`invalid-file:${file.path}`);
      }
      if (kind === 'perceptual' && !verifiedFiles.some(file => /\.(?:png|jpe?g|webp|mp4)$/iu.test(file))) problems.push('visual-media-missing');
      if (kind === 'natural-input' && !verifiedFiles.some(file => /\.(?:json|jsonl|webm|mp4)$/iu.test(file))) problems.push('natural-input-trace-missing');
      if (kind === 'phone-performance' && !verifiedFiles.some(file => /\.(?:json|jsonl|csv)$/iu.test(file))) problems.push('phone-frame-time-trace-missing');
      const status: EvidenceResult['status'] = problems.length ? (candidate.status === 'FAIL' ? 'FAIL' : 'BLOCKED') : 'PASS';
      evidence.push({ kind, status, blockers: problems, verifiedFiles });
      caseBlockers.push(...problems.map(problem => `${kind}:${problem}`));
    }
    const anyFail = evidence.some(row => row.status === 'FAIL');
    const status: ExternalCaseAudit['status'] = anyFail ? 'FAIL' : caseBlockers.length ? 'UNKNOWN' : 'PASS';
    caseReports.push({ id: testCase.id, dimension: testCase.dimension, objectType: testCase.objectType,
      stateBranch: testCase.stateBranch, rendererPath: testCase.rendererPath,
      viewport: testCase.viewport, status, evidence, blockers: caseBlockers });
  }

  // Coverage is explicitly per object/state/renderer/viewport, not 'one
  // successful game run'. A dimension with no cases is UNKNOWN, never PASS.
  const signals = Object.fromEntries(QUALITY_DIMENSIONS.map(dim => {
    const group = caseReports.filter(row => row.dimension === dim);
    const error = group.some(row => row.status === 'FAIL');
    const unknown = group.some(row => row.status === 'UNKNOWN');
    return [dim, { passed: group.length === 0 || unknown ? undefined : !error,
      evidence: group.filter(row => row.status === 'PASS').map(row => row.id),
      blockers: group.length === 0 ? [`missing-dimension:${dim}`]
        : group.filter(row => row.status !== 'PASS').map(row => `${row.id}:${row.status}`) }];
  })) as Parameters<typeof buildQualityGateMatrix>[0];
  const matrix = buildQualityGateMatrix(signals, { candidateHash: buildHash, requireCandidateHash: true });
  const humanAccepted = caseReports.some(row => row.status === 'PASS'
    && manifest.evidence.some(e => e.caseId === row.id && e.kind === 'human-playtest' && e.status === 'PASS'));
  if (manifest.requireHumanPlaytest && !humanAccepted) blockers.push('independent-human-playtest-missing');
  if (!matrix.passed) blockers.push(...matrix.blockers.map(x => `quality-dimension:${x}`));
  // This checks artifact provenance and review declarations. It cannot
  // replace actually launching a browser or visually inspecting a video.
  return {
    schemaVersion: 1 as const, auditKind: 'external-game-evidence-verification' as const,
    targetGame: manifest.targetGame, repository: manifest.repository, commit: manifest.commit,
    workspace, scope: manifest.scope, buildHash, passed: blockers.length === 0,
    blockers: [...new Set(blockers)], quality: matrix, cases: caseReports,
    disclosure: 'This tool verifies evidence hashes, claimed reviewer independence and matrix completeness; it does not play the game, judge pixels, invent a human score or certify commercial platforms.',
  };
}