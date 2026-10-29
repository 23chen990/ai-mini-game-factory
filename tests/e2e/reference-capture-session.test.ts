import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { captureReferenceUrl, sendReferenceCaptureSessionCommand, startReferenceCaptureSession } from '../../src/core/reference-web-capture.js';
import { ReferenceCaptureSessionFileSchema } from '../../src/schemas/reference-web-capture.js';

const roots: string[] = [];
const sessions: Array<{ runRoot: string; captureId: string }> = [];
afterEach(async () => {
  for (const session of sessions.splice(0)) {
    await sendReferenceCaptureSessionCommand({ runRoot: session.runRoot, captureId: session.captureId, command: 'finish' }).catch(() => undefined);
  }
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const counterPage = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>html,body{margin:0;width:390px;height:844px;overflow:hidden}canvas{display:block}</style></head>
<body><canvas id="c" width="390" height="844"></canvas>
<script>
  let count = 0;
  const context = document.getElementById('c').getContext('2d');
  const draw = () => { context.fillStyle = count === 0 ? 'blue' : 'rgb(' + Math.min(255, count * 100) + ',0,0)'; context.fillRect(0, 0, 390, 844); document.title = 'count-' + count; };
  draw();
  window.addEventListener('keydown', (event) => { if (event.key === 'ArrowUp' && !event.repeat) { count += 1; draw(); } });
</script></body></html>`;

async function fixture() {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'reference-capture-session-'));
  roots.push(runRoot);
  const workspace = path.join(runRoot, 'workspace/game');
  await mkdir(workspace, { recursive: true });
  const pageFile = path.join(workspace, 'counter.html');
  await writeFile(pageFile, counterPage);
  return { runRoot, workspace, url: pathToFileURL(pageFile).href };
}

async function start(input: Parameters<typeof startReferenceCaptureSession>[0]) {
  const handle = await startReferenceCaptureSession(input);
  sessions.push({ runRoot: input.runRoot, captureId: input.captureId });
  return handle;
}

describe('reference capture session', () => {
  it('keeps one page open across steps and writes an interactive draft on finish', async () => {
    const { runRoot, workspace, url } = await fixture();
    const handle = await start({ runRoot, targetGame: 'g', workspace, url, captureId: 's1', fps: 4 });
    const session = ReferenceCaptureSessionFileSchema.parse(JSON.parse(await readFile(handle.sessionPath, 'utf8')));
    expect(session.host).toBe('127.0.0.1');
    expect((await stat(handle.sessionPath)).mode & 0o077).toBe(0);

    const look = await sendReferenceCaptureSessionCommand({ runRoot, captureId: 's1', command: 'step', body: { recordMs: 250, label: 'look' } });
    expect(look).toMatchObject({ stepIndex: 0, label: 'look', firstFrameIndex: 0, lastFrameIndex: 1 });
    expect(path.isAbsolute(look.lastFramePath)).toBe(true);
    expect((await stat(look.lastFramePath)).isFile()).toBe(true);

    const first = await sendReferenceCaptureSessionCommand({ runRoot, captureId: 's1', command: 'step', body: { actions: [{ type: 'key', atMs: 0, key: 'ArrowUp' }], recordMs: 250, label: 'press-1' } });
    expect(first).toMatchObject({ stepIndex: 1, firstFrameIndex: 2, lastFrameIndex: 3, interactions: [expect.objectContaining({ performed: true })] });
    await sendReferenceCaptureSessionCommand({ runRoot, captureId: 's1', command: 'step', body: { actions: [{ type: 'key', atMs: 0, key: 'ArrowUp' }], recordMs: 0 } });

    const status = await sendReferenceCaptureSessionCommand({ runRoot, captureId: 's1', command: 'status' });
    expect(status).toMatchObject({ captureId: 's1', frameCount: 5, stepCount: 3 });

    const finished = await sendReferenceCaptureSessionCommand({ runRoot, captureId: 's1', command: 'finish' });
    expect(finished).toMatchObject({ status: 'READY', frameCount: 5 });
    const { capture } = await handle.finished;
    expect(capture).toMatchObject({ status: 'READY', mode: 'interactive', pageTitle: 'count-2' });
    expect(capture.steps?.map((step) => step.label)).toEqual(['look', 'press-1', null]);
    expect(capture.steps?.map((step) => [step.firstFrameIndex, step.lastFrameIndex])).toEqual([[0, 1], [2, 3], [4, 4]]);
    const secondStepStart = capture.steps![1]!.startMs;
    expect(capture.interactions[0]!.action.atMs).toBe(secondStepStart);
    for (let index = 1; index < capture.frames.length; index += 1) expect(capture.frames[index]!.requestedMs).toBeGreaterThan(capture.frames[index - 1]!.requestedMs);
    await expect(stat(handle.sessionPath)).rejects.toThrow();
    await expect(stat(path.join(runRoot, 'reference-evidence/manifest.json'))).rejects.toThrow();
  });

  it('rejects commands that do not carry the session token', async () => {
    const { runRoot, workspace, url } = await fixture();
    const handle = await start({ runRoot, targetGame: 'g', workspace, url, captureId: 's1', fps: 4 });
    const response = await fetch(`http://127.0.0.1:${handle.port}/status`, { headers: { 'x-capture-token': 'wrong' } });
    expect(response.status).toBe(401);
  });

  it('refuses a step that would exceed the session frame limit', async () => {
    const { runRoot, workspace, url } = await fixture();
    await start({ runRoot, targetGame: 'g', workspace, url, captureId: 's1', fps: 4, maxFrames: 3 });
    await expect(sendReferenceCaptureSessionCommand({ runRoot, captureId: 's1', command: 'step', body: { recordMs: 1000 } })).rejects.toThrow(/frame limit/i);
  });

  it('finishes by itself after the idle timeout', async () => {
    const { runRoot, workspace, url } = await fixture();
    const handle = await start({ runRoot, targetGame: 'g', workspace, url, captureId: 's1', fps: 4, idleTimeoutMs: 400 });
    await sendReferenceCaptureSessionCommand({ runRoot, captureId: 's1', command: 'step', body: { recordMs: 250 } });
    const { capture } = await handle.finished;
    expect(capture.status).toBe('READY');
    expect(capture.frames).toHaveLength(2);
  });

  it('refuses to reuse a capture id that already has an index', async () => {
    const { runRoot, workspace, url } = await fixture();
    await captureReferenceUrl({ runRoot, targetGame: 'g', workspace, url, captureId: 's1', durationSeconds: 0.5, fps: 4 });
    await expect(startReferenceCaptureSession({ runRoot, targetGame: 'g', workspace, url, captureId: 's1', fps: 4 })).rejects.toThrow(/already used/i);
  });

  it('writes a blocked draft when the page cannot be opened', async () => {
    const { runRoot, workspace } = await fixture();
    const missing = pathToFileURL(path.join(workspace, 'missing-game.html')).href;
    await expect(startReferenceCaptureSession({ runRoot, targetGame: 'g', workspace, url: missing, captureId: 's1', fps: 4 })).rejects.toThrow(/page-load-failed/);
    const index = JSON.parse(await readFile(path.join(runRoot, 'reference-evidence/incoming/web-capture-s1/reference-web-capture.json'), 'utf8'));
    expect(index).toMatchObject({ status: 'BLOCKED', mode: 'interactive' });
    await expect(stat(path.join(runRoot, 'reference-evidence/incoming/web-capture-s1/session.json'))).rejects.toThrow();
  });

  it('restarts a blocked session id against the same url', async () => {
    const { runRoot, workspace } = await fixture();
    const pageFile = path.join(workspace, 'late-game.html');
    const url = pathToFileURL(pageFile).href;
    await expect(startReferenceCaptureSession({ runRoot, targetGame: 'g', workspace, url, captureId: 's1', fps: 4 })).rejects.toThrow(/page-load-failed/);
    await writeFile(pageFile, counterPage);
    const handle = await start({ runRoot, targetGame: 'g', workspace, url, captureId: 's1', fps: 4 });
    expect(handle.port).toBeGreaterThan(0);
  });

  it('rejects restarting a blocked session id with changed capture settings', async () => {
    const { runRoot, workspace } = await fixture();
    const pageFile = path.join(workspace, 'late-game.html');
    const url = pathToFileURL(pageFile).href;
    await expect(startReferenceCaptureSession({ runRoot, targetGame: 'g', workspace, url, captureId: 's1', fps: 4 })).rejects.toThrow(/page-load-failed/);
    await writeFile(pageFile, counterPage);
    await expect(startReferenceCaptureSession({ runRoot, targetGame: 'g', workspace, url, captureId: 's1', fps: 8 })).rejects.toThrow(/different capture input/i);
  });
});
