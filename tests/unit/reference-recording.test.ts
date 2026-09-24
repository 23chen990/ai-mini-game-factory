import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { extractReferenceRecordingFrames, selectReferenceResearchMedia } from '../../src/core/reference-recording.js';
import { ReferenceFrameManifestSchema } from '../../src/schemas/reference-recording.js';
import { createFactory } from '../../src/factory.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const runRoot = await import('node:fs/promises').then(({ mkdtemp }) => mkdtemp(path.join(tmpdir(), 'reference-recording-')));
  roots.push(runRoot);
  const workspace = path.join(runRoot, 'workspace/game');
  const storedPath = 'reference-evidence/incoming/level-1.mp4';
  const source = path.join(runRoot, storedPath);
  await mkdir(path.dirname(source), { recursive: true });
  await writeFile(source, 'verified video bytes');
  const sha256 = createHash('sha256').update('verified video bytes').digest('hex');
  await writeFile(path.join(runRoot, 'reference-evidence/manifest.json'), JSON.stringify({
    schemaVersion: 1,
    targetGame: 'slice-game',
    workspace,
    entries: [{
      id: 'level-1-recording', sourcePath: '/source/level-1.mp4', storedPath, purpose: 'gameplay-reference', sha256,
      targetGame: 'slice-game', workspace, identityStatus: 'VERIFIED_TARGET', reviewStatus: 'VERIFIED', usableAsEvidence: true,
    }],
  }));
  return { runRoot, workspace, sha256 };
}

describe('reference recording frame extraction', () => {
  it('gives research every contact sheet plus a bounded deterministic detail sample', () => {
    const frames = Array.from({ length: 100 }, (_, index) => ({
      id: `frame-${String(index).padStart(5, '0')}`,
      index,
      requestedMs: index * 125,
      actualMs: index * 125,
      path: `reference-evidence/derived/frame-${index}.jpg`,
      sha256: String(index % 10).repeat(64),
      width: 1100,
      height: 720,
    }));
    const contactSheets = Array.from({ length: 5 }, (_, index) => ({
      id: `contact-${index}`,
      index,
      firstFrameIndex: index * 20,
      lastFrameIndex: index * 20 + 19,
      path: `reference-evidence/derived/contact-${index}.jpg`,
      sha256: String((index + 5) % 10).repeat(64),
    }));

    const selected = selectReferenceResearchMedia({ frames, contactSheets } as never, 9);
    expect(selected.contactSheets).toEqual(contactSheets);
    expect(selected.detailFrames).toHaveLength(9);
    expect(selected.detailFrames[0]?.index).toBe(0);
    expect(selected.detailFrames.at(-1)?.index).toBe(99);
    expect(new Set(selected.detailFrames.map((frame) => frame.index)).size).toBe(9);
    expect(selected.media).toEqual([...contactSheets, ...selected.detailFrames]);
  });

  it('creates a run-bound, hash-addressed frame manifest and reuses it idempotently', async () => {
    const { runRoot, workspace, sha256 } = await fixture();
    let calls = 0;
    const extractor = async ({ outputDir }: { outputDir: string }) => {
      calls += 1;
      await mkdir(outputDir, { recursive: true });
      await writeFile(path.join(outputDir, 'frame-00000.png'), 'frame zero');
      await writeFile(path.join(outputDir, 'frame-00001.png'), 'frame one');
      await writeFile(path.join(outputDir, 'contact-000.png'), 'contact sheet');
      return {
        durationMs: 1_000, width: 1100, height: 720,
        frames: [
          { index: 0, requestedMs: 0, actualMs: 0, fileName: 'frame-00000.png' },
          { index: 1, requestedMs: 125, actualMs: 117, fileName: 'frame-00001.png' },
        ],
        contactSheets: [{ index: 0, firstFrameIndex: 0, lastFrameIndex: 1, fileName: 'contact-000.png' }],
      };
    };

    const first = await extractReferenceRecordingFrames({
      runRoot, targetRunId: 'run-1', expected: { targetGame: 'slice-game', workspace }, evidenceId: 'level-1-recording', fps: 8, extractor,
    });
    expect(first.reused).toBe(false);
    expect(first.manifest).toMatchObject({
      artifactType: 'reference-frame-manifest', targetRunId: 'run-1', targetGame: 'slice-game', workspace,
      source: { evidenceId: 'level-1-recording', sha256, durationMs: 1_000, width: 1100, height: 720 },
      extraction: { version: 2, engine: 'injected-test-extractor', samplingFps: 8, extractedFrameCount: 2 }, status: 'READY', blockers: [],
    });
    expect(first.manifest.frames.every((frame) => frame.path.startsWith('reference-evidence/derived/level-1-recording/'))).toBe(true);
    expect(first.manifest.frames.every((frame) => frame.path.includes('-v2/'))).toBe(true);
    expect(ReferenceFrameManifestSchema.parse(JSON.parse(await readFile(first.artifactPath, 'utf8')))).toEqual(first.manifest);

    const second = await extractReferenceRecordingFrames({
      runRoot, targetRunId: 'run-1', expected: { targetGame: 'slice-game', workspace }, evidenceId: 'level-1-recording', fps: 8,
      extractor: async () => { throw new Error('idempotent extraction must not run again'); },
    });
    expect(second.reused).toBe(true);
    expect(calls).toBe(1);
  });

  it('rejects unverified, mismatched, or tampered recording evidence before extraction', async () => {
    const { runRoot, workspace } = await fixture();
    const manifestFile = path.join(runRoot, 'reference-evidence/manifest.json');
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
    manifest.entries[0].sha256 = '0'.repeat(64);
    await writeFile(manifestFile, JSON.stringify(manifest));
    await expect(extractReferenceRecordingFrames({
      runRoot, targetRunId: 'run-1', expected: { targetGame: 'slice-game', workspace }, evidenceId: 'level-1-recording',
      extractor: async () => { throw new Error('must not reach extractor'); },
    })).rejects.toThrow(/hash mismatch/i);
  });

  it('fails closed when more than one verified gameplay recording exists without an explicit evidence id', async () => {
    const { runRoot, workspace, sha256 } = await fixture();
    const manifestFile = path.join(runRoot, 'reference-evidence/manifest.json');
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
    manifest.entries.push({ ...manifest.entries[0], id: 'level-2-recording', sha256 });
    await writeFile(manifestFile, JSON.stringify(manifest));
    await expect(extractReferenceRecordingFrames({
      runRoot, targetRunId: 'run-1', expected: { targetGame: 'slice-game', workspace },
      extractor: async () => { throw new Error('must not reach extractor'); },
    })).rejects.toThrow(/multiple.*gameplay recordings/i);
  });

  it('exposes historical-run extraction through the factory without touching the game workspace', async () => {
    const root = await import('node:fs/promises').then(({ mkdtemp }) => mkdtemp(path.join(tmpdir(), 'reference-recording-factory-')));
    roots.push(root);
    const runId = 'historical-level';
    const runRoot = path.join(root, 'runs', runId);
    const workspace = path.join(runRoot, 'workspace/prototype-a');
    const video = path.join(runRoot, 'reference-evidence/incoming/level.mp4');
    await mkdir(path.dirname(video), { recursive: true });
    await mkdir(workspace, { recursive: true });
    await writeFile(path.join(workspace, 'sentinel.txt'), 'preserve me');
    await writeFile(video, 'historical recording');
    const sha256 = createHash('sha256').update('historical recording').digest('hex');
    await writeFile(path.join(runRoot, 'reference-evidence/manifest.json'), JSON.stringify({
      schemaVersion: 1, targetGame: 'historical-level', workspace,
      entries: [{ id: 'recording', sourcePath: video, storedPath: 'reference-evidence/incoming/level.mp4', purpose: 'gameplay-reference', sha256, targetGame: 'historical-level', workspace, identityStatus: 'VERIFIED_TARGET', reviewStatus: 'VERIFIED', usableAsEvidence: true }],
    }));
    const factory = createFactory({
      root, mode: 'mock', qaMode: 'stub',
      referenceFrameExtractor: async ({ outputDir }) => {
        await mkdir(outputDir, { recursive: true });
        await writeFile(path.join(outputDir, 'zero.png'), 'zero');
        await writeFile(path.join(outputDir, 'one.png'), 'one');
        return { durationMs: 1_000, width: 1100, height: 720, frames: [{ index: 0, requestedMs: 0, actualMs: 0, fileName: 'zero.png' }, { index: 1, requestedMs: 500, actualMs: 500, fileName: 'one.png' }], contactSheets: [] };
      },
    });

    const result = await factory.extractReferenceFrames(runId, { evidenceId: 'recording', fps: 2 });
    expect(result.manifest).toMatchObject({ targetRunId: runId, targetGame: 'historical-level', workspace, status: 'READY' });
    expect(await readFile(path.join(workspace, 'sentinel.txt'), 'utf8')).toBe('preserve me');
  });
});
