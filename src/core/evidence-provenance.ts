import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile as execFileCallback } from 'node:child_process';
import { EvidenceIdentityReviewSchema, EvidenceProvenanceManifestSchema, EvidencePurposeSchema, type EvidenceProvenanceManifest, type EvidencePurpose } from '../schemas/evidence-provenance.js';
import { writeJsonAtomic } from './files.js';

const execFile = promisify(execFileCallback);

export function evaluateEvidenceProvenance(value: unknown, expected: { targetGame: string; workspace: string }, options: { requireVerified?: boolean } = {}) {
  const parsed = EvidenceProvenanceManifestSchema.safeParse(value);
  if (!parsed.success) return { passed: false, blockers: ['evidence-provenance:schema-invalid'] as string[], manifest: value };
  const manifest = parsed.data;
  const blockers: string[] = [];
  if (manifest.targetGame !== expected.targetGame) blockers.push('evidence-provenance:target-game-mismatch');
  if (manifest.workspace !== expected.workspace) blockers.push('evidence-provenance:workspace-mismatch');
  for (const entry of manifest.entries) {
    if (entry.targetGame !== expected.targetGame) blockers.push(`evidence-provenance:entry-game-mismatch:${entry.id}`);
    if (entry.workspace !== expected.workspace) blockers.push(`evidence-provenance:entry-workspace-mismatch:${entry.id}`);
    if (entry.usableAsEvidence && (entry.identityStatus !== 'VERIFIED_TARGET' || entry.reviewStatus !== 'VERIFIED' || entry.sha256 === null)) {
      blockers.push(`evidence-provenance:unverified-entry:${entry.id}`);
    }
  }
  if (options.requireVerified && !manifest.entries.some((entry) => entry.usableAsEvidence)) blockers.push('evidence-provenance:no-verified-target-evidence');
  return { passed: blockers.length === 0, blockers: [...new Set(blockers)], manifest };
}

function purposeMatches(entry: EvidenceProvenanceManifest['entries'][number], purposes?: readonly EvidencePurpose[]) {
  return purposes === undefined || purposes.includes(entry.purpose);
}

export function usableEvidenceEntries(value: unknown, expected: { targetGame: string; workspace: string }, options: { purposes?: readonly EvidencePurpose[] } = {}): EvidenceProvenanceManifest['entries'] {
  const result = evaluateEvidenceProvenance(value, expected);
  if (!result.passed) return [];
  const parsed = EvidenceProvenanceManifestSchema.safeParse(value);
  if (!parsed.success) return [];
  return parsed.data.entries.filter((entry) => entry.usableAsEvidence && purposeMatches(entry, options.purposes));
}

export async function verifyEvidenceFileBindings(value: unknown, expected: { targetGame: string; workspace: string }, options: { runRoot?: string; requireRunLocal?: boolean; purposes?: readonly EvidencePurpose[] } = {}) {
  const base = evaluateEvidenceProvenance(value, expected);
  if (!base.passed) return base;
  const parsed = EvidenceProvenanceManifestSchema.parse(value);
  const blockers = [...base.blockers];
  const candidates = parsed.entries.filter((entry) => entry.usableAsEvidence && purposeMatches(entry, options.purposes));
  if (candidates.length === 0) blockers.push('evidence-provenance:no-verified-target-evidence');
  for (const entry of candidates) {
    try {
      if (options.requireRunLocal && !entry.storedPath) {
        blockers.push(`evidence-provenance:stored-copy-missing:${entry.id}`);
        continue;
      }
      const file = entry.storedPath && options.runRoot ? path.resolve(options.runRoot, entry.storedPath) : entry.sourcePath;
      if (entry.storedPath && options.runRoot) {
        const relative = path.relative(path.resolve(options.runRoot), file);
        if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
          blockers.push(`evidence-provenance:stored-path-unsafe:${entry.id}`);
          continue;
        }
      }
      const actual = createHash('sha256').update(await readFile(file)).digest('hex');
      if (actual !== entry.sha256) blockers.push(`evidence-provenance:hash-mismatch:${entry.id}`);
    } catch {
      blockers.push(`evidence-provenance:source-unavailable:${entry.id}`);
    }
  }
  return { passed: blockers.length === 0, blockers: [...new Set(blockers)], manifest: parsed };
}

function decodeXmlText(xml: string) {
  return xml
    .replace(/<w:tab\s*\/>/gu, '\t')
    .replace(/<w:br\s*\/>/gu, '\n')
    .replace(/<\/w:p>/gu, '\n')
    .replace(/<[^>]+>/gu, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .split(/\r?\n/gu)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

async function writeAnalysisSidecar(source: string, destination: string) {
  const extension = path.extname(source).toLowerCase();
  let text: string | undefined;
  if (extension === '.docx') {
    try {
      const result = await execFile('unzip', ['-p', source, 'word/document.xml'], { maxBuffer: 16 * 1024 * 1024 });
      text = decodeXmlText(result.stdout);
    } catch { /* unreadable documents remain available as binary evidence */ }
  } else if (['.txt', '.md', '.json', '.csv', '.tsv'].includes(extension)) {
    text = await readFile(source, 'utf8');
  }
  if (!text?.trim()) return undefined;
  const sidecar = `${destination}.analysis.txt`;
  await writeFile(sidecar, `${text.trim()}\n`, 'utf8');
  return sidecar;
}

export async function ingestReferenceMedia(input: {
  sourcePath: string;
  runRoot: string;
  targetGame: string;
  workspace?: string;
  id?: string;
  purpose?: EvidencePurpose;
}) {
  const source = path.resolve(input.sourcePath);
  const runRoot = path.resolve(input.runRoot);
  const workspace = path.resolve(input.workspace ?? path.join(runRoot, 'workspace', 'game'));
  const sourceBytes = await readFile(source);
  const sha256 = createHash('sha256').update(sourceBytes).digest('hex');
  const referenceRoot = path.join(runRoot, 'reference-evidence');
  const incomingRoot = path.join(referenceRoot, 'incoming');
  const manifestPath = path.join(referenceRoot, 'manifest.json');
  await mkdir(incomingRoot, { recursive: true });
  const extension = path.extname(source) || '.bin';
  const stem = path.basename(source, extension).replace(/[^a-z0-9._-]+/giu, '-').replace(/^-+|-+$/gu, '') || 'recording';
  const destination = path.join(incomingRoot, `${stem}-${sha256.slice(0, 12)}${extension}`);
  await copyFile(source, destination, 0);
  const analysisSidecar = await writeAnalysisSidecar(source, destination);
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    manifest = { schemaVersion: 1, targetGame: input.targetGame, workspace, directories: { incoming: 'reference-evidence/incoming', verified: 'reference-evidence/verified', excluded: 'reference-evidence/excluded' }, entries: [] };
  }
  if (manifest.targetGame !== input.targetGame || manifest.workspace !== workspace) throw new Error('reference manifest target game or workspace mismatch');
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  const id = input.id ?? `${stem}-${sha256.slice(0, 12)}`;
  const purpose = EvidencePurposeSchema.parse(input.purpose ?? 'other');
  const existing = entries.find((entry) => entry && typeof entry === 'object' && (entry as Record<string, unknown>).sha256 === sha256);
  const storedPath = path.relative(runRoot, destination).replaceAll(path.sep, '/');
  const analysisTextPath = analysisSidecar ? path.relative(runRoot, analysisSidecar).replaceAll(path.sep, '/') : undefined;
  if (!existing) entries.push({ id, sourcePath: source, storedPath, ...(analysisTextPath ? { analysisTextPath } : {}), purpose, sha256, targetGame: input.targetGame, workspace, identityStatus: 'UNKNOWN', reviewStatus: 'PENDING', usableAsEvidence: false, notes: 'Ingested automatically; identity review required before use.' });
  else {
    (existing as Record<string, unknown>).storedPath = storedPath;
    if (analysisTextPath) (existing as Record<string, unknown>).analysisTextPath = analysisTextPath;
    if (input.purpose !== undefined) (existing as Record<string, unknown>).purpose = purpose;
  }
  manifest.entries = entries;
  const validated = EvidenceProvenanceManifestSchema.parse(manifest);
  await writeFile(manifestPath, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
  return { destination, storedPath, analysisTextPath, manifestPath, sha256, id, alreadyRegistered: Boolean(existing) };
}

function resolveRunLocalFile(runRoot: string, relativePath: string) {
  const absolute = path.resolve(runRoot, relativePath);
  const relative = path.relative(runRoot, absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`evidence path escapes run root: ${relativePath}`);
  return absolute;
}

/** Complete the explicit identity-review gate for one already-ingested item.
 * Verification requires the operator's expected hash, the manifest hash and
 * the current run-local bytes to agree before the item moves to verified/. */
export async function reviewReferenceMediaIdentity(input: {
  runRoot: string;
  targetGame: string;
  workspace: string;
  id: string;
  expectedSha256: string;
  reviewer: string;
  basis: string;
}) {
  const runRoot = path.resolve(input.runRoot);
  const workspace = path.resolve(input.workspace);
  const expectedSha256 = input.expectedSha256.toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(expectedSha256)) throw new Error('expected sha-256 must be a 64-character hexadecimal digest');
  if (!input.reviewer.trim() || !input.basis.trim()) throw new Error('identity review requires reviewer and basis');
  const manifestPath = path.join(runRoot, 'reference-evidence/manifest.json');
  const manifest = EvidenceProvenanceManifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
  if (manifest.targetGame !== input.targetGame || path.resolve(manifest.workspace) !== workspace) throw new Error('reference manifest target game or workspace mismatch');
  const entry = manifest.entries.find((candidate) => candidate.id === input.id);
  if (!entry) throw new Error(`reference evidence entry is missing: ${input.id}`);
  if (entry.targetGame !== input.targetGame || path.resolve(entry.workspace) !== workspace) throw new Error(`reference evidence entry target mismatch: ${input.id}`);
  if (!entry.storedPath || !entry.sha256) throw new Error(`reference evidence entry has no run-local hashed file: ${input.id}`);
  if (entry.sha256.toLowerCase() !== expectedSha256) throw new Error(`expected sha-256 does not match manifest entry ${input.id}`);

  const priorStoredPath = entry.storedPath;
  const priorFile = resolveRunLocalFile(runRoot, priorStoredPath);
  const verifiedStoredPath = `reference-evidence/verified/${path.basename(priorStoredPath)}`;
  const verifiedFile = resolveRunLocalFile(runRoot, verifiedStoredPath);
  const sourceFile = entry.reviewStatus === 'VERIFIED' && entry.identityStatus === 'VERIFIED_TARGET' ? verifiedFile : priorFile;
  const sourceStat = await lstat(sourceFile);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new Error(`reference evidence must be a regular non-symlink file: ${input.id}`);
  const actualSha256 = createHash('sha256').update(await readFile(sourceFile)).digest('hex');
  if (actualSha256 !== expectedSha256) throw new Error(`expected sha-256 does not match current file bytes for ${input.id}`);

  await mkdir(path.dirname(verifiedFile), { recursive: true });
  if (sourceFile !== verifiedFile) await copyFile(sourceFile, verifiedFile);
  const copiedSha256 = createHash('sha256').update(await readFile(verifiedFile)).digest('hex');
  if (copiedSha256 !== expectedSha256) throw new Error(`verified copy hash mismatch for ${input.id}`);

  let verifiedAnalysisTextPath = entry.analysisTextPath;
  let priorAnalysisFile: string | undefined;
  if (entry.analysisTextPath) {
    priorAnalysisFile = resolveRunLocalFile(runRoot, entry.analysisTextPath);
    const sidecarStat = await lstat(priorAnalysisFile);
    if (!sidecarStat.isFile() || sidecarStat.isSymbolicLink()) throw new Error(`analysis sidecar must be a regular non-symlink file: ${input.id}`);
    verifiedAnalysisTextPath = `reference-evidence/verified/${path.basename(entry.analysisTextPath)}`;
    const verifiedAnalysisFile = resolveRunLocalFile(runRoot, verifiedAnalysisTextPath);
    if (priorAnalysisFile !== verifiedAnalysisFile) await copyFile(priorAnalysisFile, verifiedAnalysisFile);
  }

  entry.storedPath = verifiedStoredPath;
  if (verifiedAnalysisTextPath) entry.analysisTextPath = verifiedAnalysisTextPath;
  entry.identityStatus = 'VERIFIED_TARGET';
  entry.reviewStatus = 'VERIFIED';
  entry.usableAsEvidence = true;
  entry.notes = `Identity reviewed by ${input.reviewer.trim()}: ${input.basis.trim()}`;
  const reviewedAt = new Date().toISOString();
  const review = EvidenceIdentityReviewSchema.parse({
    schemaVersion: 1,
    artifactType: 'evidence-identity-review',
    reviewId: `identity-${input.id}`,
    entryId: input.id,
    targetGame: input.targetGame,
    workspace,
    decision: 'VERIFIED_TARGET',
    expectedSha256,
    actualSha256: copiedSha256,
    priorStoredPath,
    verifiedStoredPath,
    reviewer: input.reviewer.trim(),
    basis: input.basis.trim(),
    reviewedAt,
  });
  const validatedManifest = EvidenceProvenanceManifestSchema.parse(manifest);
  const safeReviewName = input.id.replace(/[^a-z0-9._-]+/giu, '-').replace(/^-+|-+$/gu, '') || 'evidence';
  const reviewPath = path.join(runRoot, 'reference-evidence/reviews', `${safeReviewName}.json`);
  await writeJsonAtomic(reviewPath, review);
  await writeJsonAtomic(manifestPath, validatedManifest);
  if (sourceFile !== verifiedFile) await unlink(sourceFile).catch(() => undefined);
  if (priorAnalysisFile && verifiedAnalysisTextPath) {
    const verifiedAnalysisFile = resolveRunLocalFile(runRoot, verifiedAnalysisTextPath);
    if (priorAnalysisFile !== verifiedAnalysisFile) await unlink(priorAnalysisFile).catch(() => undefined);
  }
  return { entry: structuredClone(entry), review, reviewPath, manifestPath };
}
