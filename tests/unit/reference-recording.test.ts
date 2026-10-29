import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { extractReferenceRecordingFrames, selectReferenceResearchMedia } from '../../src/core/reference-recording.js';
import { ReferenceFrameManifestSchema, ReferenceResearchMediaPlanSchema } from '../../src/schemas/reference-recording.js';
import { ReferenceWebCaptureSchema } from '../../src/schemas/reference-web-capture.js';
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
  it('still reads older hash-bound media plans without new timeline fields', () => {
    const historical = {
      schemaVersion: 1, artifactType: 'reference-research-media-plan', purpose: 'reference-intake',
      sourceManifestSha256: null, available: { contactSheets: 0, frames: 0, directImages: 0 },
      selectedContactSheetIds: [], selectedDetailFrameIds: [], media: [],
      coverage: 'BOUNDED_SAMPLE_NOT_FULL_VISUAL_COVERAGE', omittedVisualFiles: 0,
    };
    const parsed = ReferenceResearchMediaPlanSchema.parse(historical);
    expect(parsed.sourceDurationMs).toBeUndefined();
    expect(parsed.selectedDetailFrameTimes).toBeUndefined();
    expect(parsed.selectedContactSheetRanges).toBeUndefined();
  });


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

  it('keeps first/middle/last visual coverage with a bounded selection instead of all sheets', () => {
    const frames = Array.from({ length: 292 }, (_, index) => ({
      id: 'frame-' + index, index, requestedMs: index * 125, actualMs: index * 125,
      path: 'reference-evidence/derived/frame-' + index + '.jpg', sha256: 'a'.repeat(64), width: 1100, height: 720,
    }));
    const contactSheets = Array.from({ length: 19 }, (_, index) => ({
      id: 'contact-' + index, index, firstFrameIndex: index * 16,
      lastFrameIndex: Math.min(291, index * 16 + 15),
      path: 'reference-evidence/derived/contact-' + index + '.jpg', sha256: 'b'.repeat(64),
    }));
    const chosen = selectReferenceResearchMedia({ frames, contactSheets } as never, 4, 3);
    expect(chosen.contactSheets.map((item) => item.index)).toEqual([0, 9, 18]);
    expect(chosen.detailFrames).toHaveLength(4);
    expect(chosen.detailFrames[0]?.index).toBe(0);
    expect(chosen.detailFrames.at(-1)?.index).toBe(291);
    expect(chosen.media).toHaveLength(7);
    expect(new Set(chosen.media.map((item) => item.path)).size).toBe(7);
    const firstPass = selectReferenceResearchMedia({ frames, contactSheets } as never, 3, 1);
    expect(firstPass.contactSheets.map((item) => item.index)).toEqual([0]);
    expect(firstPass.detailFrames.map((item) => item.index)).toEqual([0, 146, 291]);
    // Sampling must not mutate or shrink the source manifest.
    expect(frames).toHaveLength(292);
    expect(contactSheets).toHaveLength(19);
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

  async function captureFixture(options: { clip?: { x: number; y: number; width: number; height: number } } = {}) {
    const frameSize = options.clip ?? { width: 390, height: 844 };
    const runRoot = await import('node:fs/promises').then(({ mkdtemp }) => mkdtemp(path.join(tmpdir(), 'reference-recording-capture-')));
    roots.push(runRoot);
    const workspace = path.join(runRoot, 'workspace/game');
    const targetGame = 'slice-game';
    const frameDir = path.join(runRoot, 'reference-evidence/incoming/web-capture-c1/frames');
    await mkdir(frameDir, { recursive: true });
    const frameBytes = ['frame zero', 'frame one'] as const;
    const framePaths = [
      'reference-evidence/incoming/web-capture-c1/frames/frame-00000.png',
      'reference-evidence/incoming/web-capture-c1/frames/frame-00001.png',
    ] as const;
    await writeFile(path.join(runRoot, framePaths[0]), frameBytes[0]);
    await writeFile(path.join(runRoot, framePaths[1]), frameBytes[1]);
    const capture = ReferenceWebCaptureSchema.parse({
      schemaVersion: 1,
      artifactType: 'reference-web-capture',
      captureId: 'c1',
      captureInputHash: 'a'.repeat(64),
      targetGame,
      workspace,
      requestedUrl: 'file:///tmp/game.html',
      finalUrl: 'file:///tmp/game.html',
      pageTitle: 'Game',
      browser: { name: 'chromium', version: '1.2.3' },
      viewport: { width: 390, height: 844, deviceScaleFactor: 1 },
      ...(options.clip ? { clip: options.clip } : {}),
      samplingFps: 4,
      durationMs: 250,
      frames: framePaths.map((framePath, index) => ({
        index,
        requestedMs: index * 250,
        actualMs: index * 250,
        path: framePath,
        sha256: createHash('sha256').update(frameBytes[index]!).digest('hex'),
        width: frameSize.width,
        height: frameSize.height,
      })),
      interactions: [],
      resources: [],
      consoleErrors: [],
      status: 'READY',
      blockers: [],
      capturedAt: '2026-09-29T00:00:00.000Z',
    });
    const storedPath = 'reference-evidence/incoming/reference-web-capture-aaaaaaaaaaaa.json';
    const indexFile = path.join(runRoot, storedPath);
    await mkdir(path.dirname(indexFile), { recursive: true });
    const indexBytes = `${JSON.stringify(capture, null, 2)}\n`;
    await writeFile(indexFile, indexBytes);
    const sha256 = createHash('sha256').update(indexBytes).digest('hex');
    await writeFile(path.join(runRoot, 'reference-evidence/manifest.json'), JSON.stringify({
      schemaVersion: 1,
      targetGame,
      workspace,
      entries: [{
        id: 'web-capture-c1', sourcePath: indexFile, storedPath, purpose: 'gameplay-reference', sha256,
        targetGame, workspace, identityStatus: 'VERIFIED_TARGET', reviewStatus: 'VERIFIED', usableAsEvidence: true,
      }],
    }));
    return { runRoot, workspace, targetGame, sha256, storedPath, indexFile };
  }

  it('extracts a verified screenshot sequence without native video tooling and reuses its manifest', async () => {
    const { runRoot, workspace, targetGame } = await captureFixture();
    const first = await extractReferenceRecordingFrames({
      runRoot, targetRunId: 'run-1', expected: { targetGame, workspace }, evidenceId: 'web-capture-c1',
    });
    expect(first.manifest.status).toBe('READY');
    expect(first.manifest.source.mediaType).toBe('image/png-sequence');
    expect(first.manifest.extraction.engine).toBe('playwright-screenshot');
    expect(first.manifest.extraction.samplingFps).toBe(4);
    expect(first.manifest.frames).toHaveLength(2);
    expect(first.manifest.contactSheets).toEqual([]);
    expect(first.manifest.source.width).toBe(390);

    const second = await extractReferenceRecordingFrames({
      runRoot, targetRunId: 'run-1', expected: { targetGame, workspace }, evidenceId: 'web-capture-c1',
    });
    expect(second.reused).toBe(true);
  });

  it('reports the clip size for a clipped screenshot sequence', async () => {
    const { runRoot, workspace, targetGame } = await captureFixture({ clip: { x: 10, y: 20, width: 200, height: 100 } });
    const result = await extractReferenceRecordingFrames({
      runRoot, targetRunId: 'run-1', expected: { targetGame, workspace }, evidenceId: 'web-capture-c1',
    });
    expect(result.manifest.source).toMatchObject({ width: 200, height: 100 });
    expect(result.manifest.frames[0]).toMatchObject({ width: 200, height: 100 });
  });

  it('does not reuse cached extracted frames after a source screenshot changes', async () => {
    const { runRoot, workspace, targetGame } = await captureFixture();
    await extractReferenceRecordingFrames({
      runRoot, targetRunId: 'run-1', expected: { targetGame, workspace }, evidenceId: 'web-capture-c1',
    });
    await writeFile(path.join(runRoot, 'reference-evidence/incoming/web-capture-c1/frames/frame-00001.png'), 'tampered frame');

    const second = await extractReferenceRecordingFrames({
      runRoot, targetRunId: 'run-1', expected: { targetGame, workspace }, evidenceId: 'web-capture-c1',
    });
    expect(second.reused).toBe(false);
    expect(second.manifest.status).toBe('BLOCKED');
    expect(second.manifest.blockers.join(' ')).toMatch(/hash mismatch/i);
  });

  it('rejects an internally mismatched capture target before using cached frames', async () => {
    const { runRoot, workspace, targetGame, indexFile } = await captureFixture();
    await extractReferenceRecordingFrames({
      runRoot, targetRunId: 'run-1', expected: { targetGame, workspace }, evidenceId: 'web-capture-c1',
    });
    const capture = JSON.parse(await readFile(indexFile, 'utf8'));
    capture.targetGame = 'another-game';
    const indexBytes = `${JSON.stringify(capture, null, 2)}\n`;
    await writeFile(indexFile, indexBytes);
    const manifestFile = path.join(runRoot, 'reference-evidence/manifest.json');
    const provenance = JSON.parse(await readFile(manifestFile, 'utf8'));
    provenance.entries[0].sha256 = createHash('sha256').update(indexBytes).digest('hex');
    await writeFile(manifestFile, JSON.stringify(provenance));

    await expect(extractReferenceRecordingFrames({
      runRoot, targetRunId: 'run-1', expected: { targetGame, workspace }, evidenceId: 'web-capture-c1',
    })).rejects.toThrow(/capture target mismatch/i);
  });

  it('rejects an internally mismatched capture workspace before using cached frames', async () => {
    const { runRoot, workspace, targetGame, indexFile } = await captureFixture();
    await extractReferenceRecordingFrames({
      runRoot, targetRunId: 'run-1', expected: { targetGame, workspace }, evidenceId: 'web-capture-c1',
    });
    const capture = JSON.parse(await readFile(indexFile, 'utf8'));
    capture.workspace = path.join(runRoot, 'workspace/another-game');
    const indexBytes = `${JSON.stringify(capture, null, 2)}\n`;
    await writeFile(indexFile, indexBytes);
    const manifestFile = path.join(runRoot, 'reference-evidence/manifest.json');
    const provenance = JSON.parse(await readFile(manifestFile, 'utf8'));
    provenance.entries[0].sha256 = createHash('sha256').update(indexBytes).digest('hex');
    await writeFile(manifestFile, JSON.stringify(provenance));

    await expect(extractReferenceRecordingFrames({
      runRoot, targetRunId: 'run-1', expected: { targetGame, workspace }, evidenceId: 'web-capture-c1',
    })).rejects.toThrow(/capture target mismatch/i);
  });

  it('rejects a screenshot path that escapes the run root', async () => {
    const { runRoot, workspace, targetGame, indexFile } = await captureFixture();
    const capture = JSON.parse(await readFile(indexFile, 'utf8'));
    capture.frames[0].path = '../outside.png';
    const indexBytes = `${JSON.stringify(capture, null, 2)}\n`;
    await writeFile(indexFile, indexBytes);
    const manifestFile = path.join(runRoot, 'reference-evidence/manifest.json');
    const provenance = JSON.parse(await readFile(manifestFile, 'utf8'));
    provenance.entries[0].sha256 = createHash('sha256').update(indexBytes).digest('hex');
    await writeFile(manifestFile, JSON.stringify(provenance));

    await expect(extractReferenceRecordingFrames({
      runRoot, targetRunId: 'run-1', expected: { targetGame, workspace }, evidenceId: 'web-capture-c1',
    })).rejects.toThrow(/path must stay relative to the owning run/i);
  });

  it('rejects screenshot bytes outside the capture incoming directory even when they stay inside the run', async () => {
    const { runRoot, workspace, targetGame, indexFile } = await captureFixture();
    const capture = JSON.parse(await readFile(indexFile, 'utf8'));
    capture.frames[0].path = 'workspace/game/screenshot.png';
    const indexBytes = `${JSON.stringify(capture, null, 2)}\n`;
    await writeFile(indexFile, indexBytes);
    const manifestFile = path.join(runRoot, 'reference-evidence/manifest.json');
    const provenance = JSON.parse(await readFile(manifestFile, 'utf8'));
    provenance.entries[0].sha256 = createHash('sha256').update(indexBytes).digest('hex');
    await writeFile(manifestFile, JSON.stringify(provenance));

    await expect(extractReferenceRecordingFrames({
      runRoot, targetRunId: 'run-1', expected: { targetGame, workspace }, evidenceId: 'web-capture-c1',
    })).rejects.toThrow(/outside its run-local incoming directory/i);
  });

  it('excludes a capture until explicit identity review makes it usable', async () => {
    const { runRoot, workspace, targetGame } = await captureFixture();
    const manifestFile = path.join(runRoot, 'reference-evidence/manifest.json');
    const provenance = JSON.parse(await readFile(manifestFile, 'utf8'));
    provenance.entries[0].identityStatus = 'UNKNOWN';
    provenance.entries[0].reviewStatus = 'PENDING';
    provenance.entries[0].usableAsEvidence = false;
    await writeFile(manifestFile, JSON.stringify(provenance));

    await expect(extractReferenceRecordingFrames({
      runRoot, targetRunId: 'run-1', expected: { targetGame, workspace },
    })).rejects.toThrow(/no verified gameplay recording/i);
  });

  it('reuses only a prior explicit recording selection bound to this run', async () => {
    const { runRoot, workspace, sha256 } = await fixture();
    const manifestFile = path.join(runRoot, 'reference-evidence/manifest.json');
    const provenance = JSON.parse(await readFile(manifestFile, 'utf8'));
    provenance.entries.push({ ...provenance.entries[0], id: 'level-2-recording', sha256 });
    await writeFile(manifestFile, JSON.stringify(provenance));
    const extractor = async ({ outputDir }: { outputDir: string }) => {
      await mkdir(outputDir, { recursive: true });
      await writeFile(path.join(outputDir, 'a.png'), 'frame a');
      await writeFile(path.join(outputDir, 'b.png'), 'frame b');
      return { durationMs: 1_000, width: 1100, height: 720, frames: [{ index: 0, requestedMs: 0, actualMs: 0, fileName: 'a.png' }, { index: 1, requestedMs: 125, actualMs: 125, fileName: 'b.png' }], contactSheets: [] };
    };
    await extractReferenceRecordingFrames({
      runRoot, targetRunId: 'run-1', expected: { targetGame: 'slice-game', workspace }, evidenceId: 'level-2-recording', fps: 8, extractor,
    });

    const again = await extractReferenceRecordingFrames({
      runRoot, targetRunId: 'run-1', expected: { targetGame: 'slice-game', workspace }, useExistingSelection: true, fps: 8,
      extractor: async () => { throw new Error('the selected recording is already extracted'); },
    });
    expect(again).toMatchObject({ reused: true, manifest: { source: { evidenceId: 'level-2-recording' } } });
  });

  it('requires selection when multiple verified recordings have no selection for this run', async () => {
    const { runRoot, workspace, sha256 } = await fixture();
    const manifestFile = path.join(runRoot, 'reference-evidence/manifest.json');
    const provenance = JSON.parse(await readFile(manifestFile, 'utf8'));
    provenance.entries.push({ ...provenance.entries[0], id: 'level-2-recording', sha256 });
    await writeFile(manifestFile, JSON.stringify(provenance));
    await expect(extractReferenceRecordingFrames({
      runRoot, targetRunId: 'run-1', expected: { targetGame: 'slice-game', workspace }, useExistingSelection: true,
      extractor: async () => { throw new Error('must not reach extractor'); },
    })).rejects.toThrow(/multiple.*gameplay recordings/i);
  });

  it.each([
    ['invalid-json', '{', SyntaxError],
    ['invalid-schema', '{}', /schemaVersion/],
  ])('surfaces a corrupt saved selection instead of treating it as absent: %s', async (_name, bytes, expectedError) => {
    const { runRoot, workspace } = await fixture();
    const manifestFile = path.join(runRoot, 'reference-evidence/manifest.json');
    const provenance = JSON.parse(await readFile(manifestFile, 'utf8'));
    provenance.entries.push({ ...provenance.entries[0], id: 'level-2-recording' });
    await writeFile(manifestFile, JSON.stringify(provenance));
    await mkdir(path.join(runRoot, 'artifacts'));
    await writeFile(path.join(runRoot, 'artifacts/reference-frame-manifest.json'), bytes);
    await expect(extractReferenceRecordingFrames({
      runRoot, targetRunId: 'run-1', expected: { targetGame: 'slice-game', workspace }, useExistingSelection: true,
      extractor: async () => { throw new Error('must not replace a corrupt saved selection'); },
    })).rejects.toThrow(expectedError);
  });

  it('does not use a previous selection from a different target run', async () => {
    const { runRoot, workspace, sha256 } = await fixture();
    const manifestFile = path.join(runRoot, 'reference-evidence/manifest.json');
    const provenance = JSON.parse(await readFile(manifestFile, 'utf8'));
    provenance.entries.push({ ...provenance.entries[0], id: 'level-2-recording', sha256 });
    await writeFile(manifestFile, JSON.stringify(provenance));
    const first = await extractReferenceRecordingFrames({
      runRoot, targetRunId: 'run-elsewhere', expected: { targetGame: 'slice-game', workspace }, evidenceId: 'level-2-recording', fps: 8,
      extractor: async ({ outputDir }) => {
        await mkdir(outputDir, { recursive: true });
        await writeFile(path.join(outputDir, 'a.png'), 'frame a');
        await writeFile(path.join(outputDir, 'b.png'), 'frame b');
        return { durationMs: 1_000, width: 1100, height: 720, frames: [{ index: 0, requestedMs: 0, actualMs: 0, fileName: 'a.png' }, { index: 1, requestedMs: 125, actualMs: 125, fileName: 'b.png' }], contactSheets: [] };
      },
    });
    expect(first.manifest.targetRunId).toBe('run-elsewhere');

    await expect(extractReferenceRecordingFrames({
      runRoot, targetRunId: 'run-1', expected: { targetGame: 'slice-game', workspace }, useExistingSelection: true, fps: 8,
      extractor: async () => { throw new Error('must not infer a selection from a different target run'); },
    })).rejects.toThrow(/multiple.*gameplay recordings/i);
  });
});
