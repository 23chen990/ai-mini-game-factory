import { execFile as execFileCallback } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { clearDir, exists, sha256File, writeJsonAtomic } from './files.js';
import { EvidenceProvenanceManifestSchema } from '../schemas/evidence-provenance.js';
import { ReferenceFrameManifestSchema, type ReferenceFrameManifest } from '../schemas/reference-recording.js';

const execFile = promisify(execFileCallback);

export type NativeFrameExtraction = {
  durationMs: number;
  width: number;
  height: number;
  frames: Array<{ index: number; requestedMs: number; actualMs: number; fileName: string }>;
  contactSheets: Array<{ index: number; firstFrameIndex: number; lastFrameIndex: number; fileName: string }>;
  failures?: Array<{ requestedMs: number; message: string }>;
};

export type ReferenceFrameExtractor = (input: { sourcePath: string; outputDir: string; fps: number; maxFrames: number }) => Promise<NativeFrameExtraction>;

/**
 * Keep the full frame manifest as the source of truth while bounding the
 * visual files copied into one model context. Contact sheets preserve full
 * temporal coverage; three detail candidates per sheet provide readable
 * start/middle/end frames and are evenly reduced when a recording is long.
 */
export function selectReferenceResearchMedia(manifest: ReferenceFrameManifest, maxDetailFrames = 64) {
  if (!Number.isInteger(maxDetailFrames) || maxDetailFrames < 2 || maxDetailFrames > 256) throw new Error('reference research detail-frame limit must be an integer from 2 to 256');
  const byIndex = new Map(manifest.frames.map((frame) => [frame.index, frame]));
  const candidateIndices = new Set<number>();
  if (manifest.contactSheets.length > 0) {
    for (const sheet of manifest.contactSheets) {
      candidateIndices.add(sheet.firstFrameIndex);
      candidateIndices.add(Math.floor((sheet.firstFrameIndex + sheet.lastFrameIndex) / 2));
      candidateIndices.add(sheet.lastFrameIndex);
    }
  } else {
    for (const frame of manifest.frames) candidateIndices.add(frame.index);
  }
  const first = manifest.frames[0];
  const last = manifest.frames.at(-1);
  if (first) candidateIndices.add(first.index);
  if (last) candidateIndices.add(last.index);
  const candidates = [...candidateIndices]
    .sort((left, right) => left - right)
    .map((index) => byIndex.get(index))
    .filter((frame): frame is ReferenceFrameManifest['frames'][number] => frame !== undefined);
  const detailFrames = candidates.length <= maxDetailFrames
    ? candidates
    : Array.from({ length: maxDetailFrames }, (_, index) => candidates[Math.round(index * (candidates.length - 1) / (maxDetailFrames - 1))]!);
  return { contactSheets: manifest.contactSheets, detailFrames, media: [...manifest.contactSheets, ...detailFrames] };
}

function isWithin(parent: string, candidate: string) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative.length > 0 && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function safeSegment(value: string) {
  const safe = value.replace(/[^a-z0-9._-]+/giu, '-').replace(/^-+|-+$/gu, '');
  if (!safe || safe === '.' || safe === '..') throw new Error(`unsafe evidence id: ${value}`);
  return safe;
}

async function verifyRunLocalFile(runRoot: string, relativePath: string) {
  const resolved = path.resolve(runRoot, relativePath);
  if (!isWithin(runRoot, resolved)) throw new Error(`recording path escapes run root: ${relativePath}`);
  const stat = await lstat(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`recording must be a regular run-local file: ${relativePath}`);
  const [realRoot, realFile] = await Promise.all([realpath(runRoot), realpath(resolved)]);
  if (!isWithin(realRoot, realFile)) throw new Error(`recording resolves outside run root: ${relativePath}`);
  return realFile;
}

async function manifestFilesMatch(runRoot: string, manifest: ReferenceFrameManifest) {
  for (const file of [...manifest.frames, ...manifest.contactSheets]) {
    try {
      const resolved = await verifyRunLocalFile(runRoot, file.path);
      if (await sha256File(resolved) !== file.sha256) return false;
    } catch { return false; }
  }
  return true;
}

export async function runAvFoundationFrameExtractor(input: { sourcePath: string; outputDir: string; fps: number; maxFrames: number }): Promise<NativeFrameExtraction> {
  if (process.platform !== 'darwin') throw new Error(`AVFoundation reference frame extraction is unavailable on ${process.platform}`);
  const script = fileURLToPath(new URL('../../tools/extract-video-frames.swift', import.meta.url));
  const result = await execFile('/usr/bin/swift', [script, '--input', input.sourcePath, '--output', input.outputDir, '--fps', String(input.fps), '--max-frames', String(input.maxFrames)], { maxBuffer: 16 * 1024 * 1024 });
  const parsed = JSON.parse(result.stdout) as NativeFrameExtraction;
  if (!parsed || !Array.isArray(parsed.frames) || !Array.isArray(parsed.contactSheets)) throw new Error('AVFoundation extractor returned malformed JSON');
  return parsed;
}

export async function extractReferenceRecordingFrames(input: {
  runRoot: string;
  targetRunId: string;
  expected: { targetGame: string; workspace: string };
  evidenceId?: string;
  fps?: number;
  maxFrames?: number;
  extractor?: ReferenceFrameExtractor;
}) {
  const runRoot = path.resolve(input.runRoot);
  const manifestPath = path.join(runRoot, 'reference-evidence/manifest.json');
  const provenance = EvidenceProvenanceManifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
  if (provenance.targetGame !== input.expected.targetGame) throw new Error('reference recording target game mismatch');
  if (path.resolve(provenance.workspace) !== path.resolve(input.expected.workspace)) throw new Error('reference recording workspace mismatch');
  const candidates = provenance.entries.filter((entry) => entry.usableAsEvidence && entry.purpose === 'gameplay-reference');
  if (!input.evidenceId && candidates.length > 1) throw new Error('multiple verified gameplay recordings require an explicit evidence id');
  const selected = input.evidenceId ? candidates.find((entry) => entry.id === input.evidenceId) : candidates[0];
  if (!selected) throw new Error(input.evidenceId ? `verified gameplay recording not found: ${input.evidenceId}` : 'no verified gameplay recording is available');
  if (selected.identityStatus !== 'VERIFIED_TARGET' || selected.reviewStatus !== 'VERIFIED' || !selected.usableAsEvidence || !selected.sha256) throw new Error(`recording evidence is not verified: ${selected.id}`);
  if (selected.targetGame !== input.expected.targetGame || path.resolve(selected.workspace) !== path.resolve(input.expected.workspace)) throw new Error(`recording evidence target mismatch: ${selected.id}`);
  if (!selected.storedPath) throw new Error(`recording evidence has no run-local stored path: ${selected.id}`);
  if (!/\.(?:mp4|mov)$/iu.test(selected.storedPath)) throw new Error(`gameplay evidence is not a supported recording: ${selected.id}`);
  const sourcePath = await verifyRunLocalFile(runRoot, selected.storedPath);
  if (await sha256File(sourcePath) !== selected.sha256) throw new Error(`reference recording hash mismatch: ${selected.id}`);

  const fps = input.fps ?? 8;
  const maxFrames = input.maxFrames ?? 900;
  if (!Number.isFinite(fps) || fps <= 0 || fps > 60) throw new Error('reference recording fps must be in (0, 60]');
  if (!Number.isInteger(maxFrames) || maxFrames < 2 || maxFrames > 3_600) throw new Error('reference recording maxFrames must be an integer from 2 to 3600');
  const artifactPath = path.join(runRoot, 'artifacts/reference-frame-manifest.json');
  if (await exists(artifactPath)) {
    const existing = ReferenceFrameManifestSchema.safeParse(JSON.parse(await readFile(artifactPath, 'utf8')));
    if (existing.success
      && existing.data.targetRunId === input.targetRunId
      && existing.data.targetGame === input.expected.targetGame
      && path.resolve(existing.data.workspace) === path.resolve(input.expected.workspace)
      && existing.data.source.evidenceId === selected.id
      && existing.data.source.sha256 === selected.sha256
      && existing.data.extraction.samplingFps === fps
      && existing.data.extraction.maxFrames === maxFrames
      && existing.data.status === 'READY'
      && await manifestFilesMatch(runRoot, existing.data)) return { manifest: existing.data, artifactPath, reused: true };
  }

  const outputRelative = `reference-evidence/derived/${safeSegment(selected.id)}/${selected.sha256.slice(0, 12)}-${String(fps).replace('.', '_')}fps-v2`;
  const outputDir = path.join(runRoot, outputRelative);
  if (!isWithin(path.join(runRoot, 'reference-evidence/derived'), outputDir)) throw new Error('derived frame output escaped its run directory');
  await clearDir(outputDir);
  const extractor = input.extractor ?? runAvFoundationFrameExtractor;
  const extracted = await extractor({ sourcePath, outputDir, fps, maxFrames });
  const failures = extracted.failures ?? [];
  const blockers = failures.map((failure) => `frame-extraction-failed:${failure.requestedMs}:${failure.message}`);
  if (!Number.isInteger(extracted.durationMs) || extracted.durationMs <= 0 || !Number.isInteger(extracted.width) || !Number.isInteger(extracted.height) || extracted.width <= 0 || extracted.height <= 0) throw new Error('frame extractor returned invalid source metadata');
  if (extracted.frames.length < 2) blockers.push('frame-extraction-produced-fewer-than-two-frames');

  const toRelative = (fileName: string) => {
    if (path.basename(fileName) !== fileName) throw new Error(`frame extractor returned unsafe filename: ${fileName}`);
    return `${outputRelative}/${fileName}`;
  };
  const frames = await Promise.all(extracted.frames.map(async (frame, index) => {
    const relative = toRelative(frame.fileName);
    const file = await verifyRunLocalFile(runRoot, relative);
    return {
      id: `frame-${String(index).padStart(5, '0')}`,
      index,
      requestedMs: Math.max(0, Math.round(frame.requestedMs)),
      actualMs: Math.max(0, Math.round(frame.actualMs)),
      path: relative,
      sha256: await sha256File(file),
      width: extracted.width,
      height: extracted.height,
    };
  }));
  const contactSheets = await Promise.all(extracted.contactSheets.map(async (sheet, index) => {
    const relative = toRelative(sheet.fileName);
    const file = await verifyRunLocalFile(runRoot, relative);
    return { id: `contact-${String(index).padStart(3, '0')}`, index, firstFrameIndex: sheet.firstFrameIndex, lastFrameIndex: sheet.lastFrameIndex, path: relative, sha256: await sha256File(file) };
  }));
  const ready = blockers.length === 0;
  const manifest = ReferenceFrameManifestSchema.parse({
    schemaVersion: 1,
    artifactType: 'reference-frame-manifest',
    targetRunId: input.targetRunId,
    targetGame: input.expected.targetGame,
    workspace: path.resolve(input.expected.workspace),
    source: {
      evidenceId: selected.id,
      path: selected.storedPath,
      sha256: selected.sha256,
      mediaType: path.extname(selected.storedPath).toLowerCase() === '.mov' ? 'video/quicktime' : 'video/mp4',
      durationMs: extracted.durationMs,
      width: extracted.width,
      height: extracted.height,
    },
    extraction: { version: 2, engine: input.extractor ? 'injected-test-extractor' : 'AVFoundation', samplingFps: fps, maxFrames, requestedFrameCount: extracted.frames.length + failures.length, extractedFrameCount: frames.length },
    frames,
    contactSheets,
    status: ready ? 'READY' : 'BLOCKED',
    blockers,
    extractedAt: new Date().toISOString(),
  });
  await writeJsonAtomic(artifactPath, manifest);
  return { manifest, artifactPath, reused: false };
}
