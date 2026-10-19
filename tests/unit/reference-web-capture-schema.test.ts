import { describe, expect, it } from 'vitest';
import { isAllowedReferenceCaptureRequestUrl } from '../../src/core/reference-web-capture.js';
import { ReferenceCaptureActionListSchema, ReferenceCaptureSessionFileSchema, ReferenceCaptureStepRequestSchema, ReferenceWebCaptureSchema, isReferenceWebCapturePath } from '../../src/schemas/reference-web-capture.js';

function readyCapture() {
  return {
    schemaVersion: 1,
    artifactType: 'reference-web-capture',
    captureId: 'c1',
    captureInputHash: 'c'.repeat(64),
    targetGame: 'g',
    workspace: '/tmp/workspace/game',
    requestedUrl: 'https://example.com/game',
    finalUrl: 'https://example.com/game',
    pageTitle: 'Game',
    browser: { name: 'chromium', version: '1.2.3' },
    viewport: { width: 390, height: 844, deviceScaleFactor: 1 },
    samplingFps: 4,
    durationMs: 250,
    frames: [
      { index: 0, requestedMs: 0, actualMs: 0, path: 'reference-capture/c1/frames/frame-00000.png', sha256: 'a'.repeat(64), width: 390, height: 844 },
      { index: 1, requestedMs: 250, actualMs: 250, path: 'reference-capture/c1/frames/frame-00001.png', sha256: 'b'.repeat(64), width: 390, height: 844 },
    ],
    interactions: [],
    resources: [],
    consoleErrors: [],
    status: 'READY',
    blockers: [],
    capturedAt: '2026-09-29T00:00:00.000Z',
  };
}

describe('reference web capture schema', () => {
  it('accepts a READY capture with two viewport-sized frames', () => {
    expect(ReferenceWebCaptureSchema.parse(readyCapture())).toMatchObject({ status: 'READY', frames: [{ index: 0 }, { index: 1 }] });
  });

  it('rejects READY captures with fewer than two frames', () => {
    const capture = readyCapture();
    capture.frames = [capture.frames[0]!];
    expect(ReferenceWebCaptureSchema.safeParse(capture).success).toBe(false);
  });

  it('requires a request hash that binds capture artifacts to their settings', () => {
    const capture = readyCapture();
    capture.captureInputHash = 'not-a-sha256';
    expect(ReferenceWebCaptureSchema.safeParse(capture).success).toBe(false);
  });

  it('rejects BLOCKED captures without blockers', () => {
    const capture = readyCapture();
    capture.status = 'BLOCKED';
    capture.blockers = [];
    expect(ReferenceWebCaptureSchema.safeParse(capture).success).toBe(false);
  });

  it('rejects non-contiguous frame indexes', () => {
    const capture = readyCapture();
    capture.frames[1]!.index = 2;
    expect(ReferenceWebCaptureSchema.safeParse(capture).success).toBe(false);
  });

  it('rejects frames whose dimensions differ from the viewport', () => {
    const capture = readyCapture();
    capture.frames[0]!.width = 100;
    expect(ReferenceWebCaptureSchema.safeParse(capture).success).toBe(false);
  });

  it('rejects absolute paths and paths that escape the run', () => {
    const absolute = readyCapture();
    absolute.frames[0]!.path = '/tmp/frame.png';
    const escaped = readyCapture();
    escaped.frames[0]!.path = '../outside.png';
    expect(ReferenceWebCaptureSchema.safeParse(absolute).success).toBe(false);
    expect(ReferenceWebCaptureSchema.safeParse(escaped).success).toBe(false);
  });

  it('accepts tap, drag, key, and hold actions and rejects coordinates outside the unit range', () => {
    expect(ReferenceCaptureActionListSchema.parse([
      { type: 'tap', atMs: 0, x: 0.5, y: 0.5 },
      { type: 'drag', atMs: 10, fromX: 0, fromY: 0, toX: 1, toY: 1, durationMs: 100 },
      { type: 'key', atMs: 20, key: 'ArrowLeft' },
      { type: 'hold', atMs: 30, key: 'ArrowDown', durationMs: 400 },
    ])).toHaveLength(4);
    expect(ReferenceCaptureActionListSchema.safeParse([{ type: 'tap', atMs: 0, x: 1.5, y: 0.5 }]).success).toBe(false);
  });

  it('accepts file URLs and rejects unparsable requested URLs', () => {
    const fileUrl = readyCapture();
    fileUrl.requestedUrl = 'file:///tmp/game.html';
    expect(ReferenceWebCaptureSchema.parse(fileUrl).requestedUrl).toBe('file:///tmp/game.html');
    const invalid = readyCapture();
    invalid.requestedUrl = 'not a url';
    expect(ReferenceWebCaptureSchema.safeParse(invalid).success).toBe(false);
  });

  it('allows only explicitly named public CDN hosts while preserving the private-network boundary', async () => {
    const source = 'https://poki.com/zh/g/slice-master';
    const workspace = '/tmp/run/workspace/game';
    expect(await isAllowedReferenceCaptureRequestUrl('https://a.poki-cdn.com/runtime.js', source, workspace, ['a.poki-cdn.com'])).toBe(true);
    expect(await isAllowedReferenceCaptureRequestUrl('https://other.example/runtime.js', source, workspace, ['a.poki-cdn.com'])).toBe(false);
    for (const host of ['127.0.0.1', '192.168.1.1', 'localhost']) {
      expect(await isAllowedReferenceCaptureRequestUrl(`https://${host}/secret`, source, workspace, [host])).toBe(false);
    }
    expect(await isAllowedReferenceCaptureRequestUrl('https://a.poki-cdn.com:8443/runtime.js', source, workspace, ['a.poki-cdn.com'])).toBe(false);
  });

  it('restricts remote requests to public HTTPS on the bound source host', async () => {
    expect(await isAllowedReferenceCaptureRequestUrl('https://source.example/game.js', 'https://source.example/game', '/tmp/run/workspace/game')).toBe(true);
    expect(await isAllowedReferenceCaptureRequestUrl('https://cdn.example/game.js', 'https://source.example/game', '/tmp/run/workspace/game')).toBe(false);
    expect(await isAllowedReferenceCaptureRequestUrl('http://127.0.0.1/private', 'https://source.example/game', '/tmp/run/workspace/game')).toBe(false);
  });

  it('accepts clipped frames sized to the clip and rejects clips outside the viewport', () => {
    const clipped = readyCapture() as ReturnType<typeof readyCapture> & { clip?: unknown };
    clipped.clip = { x: 10, y: 20, width: 200, height: 100 };
    for (const frame of clipped.frames) { frame.width = 200; frame.height = 100; }
    expect(ReferenceWebCaptureSchema.parse(clipped).clip).toEqual({ x: 10, y: 20, width: 200, height: 100 });
    const viewportSized = readyCapture() as ReturnType<typeof readyCapture> & { clip?: unknown };
    viewportSized.clip = { x: 10, y: 20, width: 200, height: 100 };
    expect(ReferenceWebCaptureSchema.safeParse(viewportSized).success).toBe(false);
    const outside = readyCapture() as ReturnType<typeof readyCapture> & { clip?: unknown };
    outside.clip = { x: 300, y: 0, width: 200, height: 100 };
    for (const frame of outside.frames) { frame.width = 200; frame.height = 100; }
    expect(ReferenceWebCaptureSchema.safeParse(outside).success).toBe(false);
  });

  it('accepts interactive steps that cover ordered frame ranges and rejects ranges outside the frames', () => {
    const interactive = readyCapture() as ReturnType<typeof readyCapture> & { mode?: unknown; steps?: unknown };
    interactive.mode = 'interactive';
    interactive.steps = [
      { index: 0, label: 'look', startMs: 0, firstFrameIndex: 0, lastFrameIndex: 0 },
      { index: 1, label: null, startMs: 250, firstFrameIndex: 1, lastFrameIndex: 1 },
    ];
    expect(ReferenceWebCaptureSchema.parse(interactive)).toMatchObject({ mode: 'interactive', steps: [{ label: 'look' }, { label: null }] });
    const overlapping = readyCapture() as ReturnType<typeof readyCapture> & { steps?: unknown };
    overlapping.steps = [
      { index: 0, label: null, startMs: 0, firstFrameIndex: 0, lastFrameIndex: 1 },
      { index: 1, label: null, startMs: 250, firstFrameIndex: 1, lastFrameIndex: 1 },
    ];
    expect(ReferenceWebCaptureSchema.safeParse(overlapping).success).toBe(false);
    const missing = readyCapture() as ReturnType<typeof readyCapture> & { steps?: unknown };
    missing.steps = [{ index: 0, label: null, startMs: 0, firstFrameIndex: 0, lastFrameIndex: 5 }];
    expect(ReferenceWebCaptureSchema.safeParse(missing).success).toBe(false);
  });

  it('bounds one interactive step and rejects unknown fields', () => {
    expect(ReferenceCaptureStepRequestSchema.parse({ actions: [{ type: 'hold', atMs: 0, key: 'ArrowUp', durationMs: 40 }], recordMs: 500, label: 'enter' })).toMatchObject({ recordMs: 500, label: 'enter' });
    expect(ReferenceCaptureStepRequestSchema.parse({ recordMs: 0 })).toMatchObject({ actions: [], recordMs: 0 });
    expect(ReferenceCaptureStepRequestSchema.safeParse({ recordMs: 60_001 }).success).toBe(false);
    expect(ReferenceCaptureStepRequestSchema.safeParse({ recordMs: 100, extra: true }).success).toBe(false);
  });

  it('describes a loopback session file with a token', () => {
    const session = { schemaVersion: 1, captureId: 'c1', captureInputHash: 'c'.repeat(64), requestedUrl: 'https://example.com/game', host: '127.0.0.1', port: 51234, token: 'f'.repeat(48), pid: 42, startedAt: '2026-09-30T00:00:00.000Z' };
    expect(ReferenceCaptureSessionFileSchema.parse(session).port).toBe(51234);
    expect(ReferenceCaptureSessionFileSchema.safeParse({ ...session, host: '0.0.0.0' }).success).toBe(false);
    expect(ReferenceCaptureSessionFileSchema.safeParse({ ...session, token: 'short' }).success).toBe(false);
  });

  it('recognizes stored capture indexes and rejects other evidence paths', () => {
    expect(isReferenceWebCapturePath('reference-evidence/verified/reference-web-capture-0123456789ab.json')).toBe(true);
    expect(isReferenceWebCapturePath('reference-evidence/incoming/level.mp4')).toBe(false);
  });
});
