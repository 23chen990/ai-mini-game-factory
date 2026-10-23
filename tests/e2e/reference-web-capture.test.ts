import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { captureReferenceUrl, discardReferenceCapture, promoteReferenceCapture } from '../../src/core/reference-web-capture.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

const pageHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>html,body{margin:0;width:390px;height:844px;overflow:hidden}canvas{display:block}</style>
</head>
<body>
<canvas id="c" width="390" height="844"></canvas>
<script>
  const canvas = document.getElementById('c');
  const context = canvas.getContext('2d');
  context.fillStyle = 'blue';
  context.fillRect(0, 0, 390, 844);
  canvas.addEventListener('click', () => { context.fillStyle = 'red'; context.fillRect(0, 0, 390, 844); });
  window.addEventListener('keydown', () => { context.fillStyle = 'white'; context.fillRect(10, 10, 40, 40); });
</script>
</body>
</html>
`;

async function fixture() {
  const runRoot = await mkdtemp(path.join(tmpdir(), 'reference-web-capture-'));
  roots.push(runRoot);
  const workspace = path.join(runRoot, 'workspace/game');
  await mkdir(workspace, { recursive: true });
  const pageFile = path.join(workspace, 'game.html');
  await writeFile(pageFile, pageHtml);
  return { runRoot, workspace, url: pathToFileURL(pageFile).href };
}

describe('reference web capture', () => {
  it('binds the explicit CDN policy into capture identity instead of reusing a differently authorized capture', async () => {
    const input = { ...await fixture(), targetGame: 'g', captureId: 'cdn-policy', durationSeconds: 1, fps: 2 };
    const result = await captureReferenceUrl(input);
    expect(result.capture.allowedHosts).toEqual([]);
    await expect(captureReferenceUrl({ ...input, allowedHosts: ['a.poki-cdn.com'] })).rejects.toThrow(/different capture input/);
  });

  it('holds a key down long enough for movement, then releases it', async () => {
    const { runRoot, workspace } = await fixture();
    const pageFile = path.join(workspace, 'hold.html');
    await writeFile(pageFile, `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<script>
  let downAt = 0;
  window.addEventListener('keydown', (event) => { if (!event.repeat) downAt = performance.now(); });
  window.addEventListener('keyup', () => { document.title = performance.now() - downAt >= 300 ? 'held-long' : 'held-short'; });
</script></body></html>`);
    const result = await captureReferenceUrl({
      runRoot, targetGame: 'g', workspace, url: pathToFileURL(pageFile).href, captureId: 'hold-key', durationSeconds: 1, fps: 4,
      actions: [{ type: 'hold', atMs: 200, key: 'ArrowDown', durationMs: 500 }],
    });
    expect(result.capture.status).toBe('READY');
    expect(result.capture.pageTitle).toBe('held-long');
    expect(result.capture.interactions[0]).toMatchObject({ performed: true, action: { type: 'hold', key: 'ArrowDown', durationMs: 500 } });
  });

  it('releases a short hold before the next frame instead of stretching it', async () => {
    const { runRoot, workspace } = await fixture();
    const pageFile = path.join(workspace, 'hold-short.html');
    await writeFile(pageFile, `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<script>
  let downAt = 0;
  window.addEventListener('keydown', (event) => { if (!event.repeat) downAt = performance.now(); });
  window.addEventListener('keyup', () => { document.title = String(Math.round(performance.now() - downAt)); });
</script></body></html>`);
    const result = await captureReferenceUrl({
      runRoot, targetGame: 'g', workspace, url: pathToFileURL(pageFile).href, captureId: 'hold-short', durationSeconds: 1, fps: 2,
      actions: [{ type: 'hold', atMs: 0, key: 'ArrowLeft', durationMs: 120 }],
    });
    expect(result.capture.status).toBe('READY');
    const heldMs = Number(result.capture.pageTitle);
    expect(heldMs).toBeGreaterThan(60);
    expect(heldMs).toBeLessThan(250);
  });

  it('captures a local canvas page as a draft without touching the evidence manifest', async () => {
    const { runRoot, workspace, url } = await fixture();
    const result = await captureReferenceUrl({
      runRoot, targetGame: 'g', workspace, url, captureId: 'c1', durationSeconds: 1, fps: 4,
      actions: [{ type: 'tap', atMs: 250, x: 0.5, y: 0.5 }],
    });
    expect(result.capture.status).toBe('READY');
    expect(result.capture.frames).toHaveLength(5);
    for (const frame of result.capture.frames) {
      const file = path.join(runRoot, frame.path);
      const bytes = await readFile(file);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(frame.sha256);
      expect(bytes.readUInt32BE(16)).toBe(390);
      expect(bytes.readUInt32BE(20)).toBe(844);
    }
    expect(result.capture.interactions[0]?.performed).toBe(true);
    expect(result).not.toHaveProperty('ingest');
    expect((await readdir(runRoot)).sort()).toEqual(['reference-evidence', 'workspace']);
  });

  it('promotes a chosen READY draft into one pending evidence entry', async () => {
    const { runRoot, workspace, url } = await fixture();
    const draft = await captureReferenceUrl({ runRoot, targetGame: 'g', workspace, url, captureId: 'c1', durationSeconds: 1, fps: 4 });
    const promoted = await promoteReferenceCapture({ runRoot, targetGame: 'g', workspace, captureId: 'c1' });
    const indexBytes = await readFile(draft.indexPath);
    expect(promoted.sha256).toBe(createHash('sha256').update(indexBytes).digest('hex'));
    const manifest = JSON.parse(await readFile(path.join(runRoot, 'reference-evidence/manifest.json'), 'utf8'));
    expect(manifest.entries).toEqual([expect.objectContaining({
      id: 'web-capture-c1', purpose: 'gameplay-reference', reviewStatus: 'PENDING', usableAsEvidence: false,
    })]);
    expect(manifest.entries[0].analysisTextPath).toBeUndefined();
    expect(manifest.entries[0].storedPath).toMatch(/^reference-evidence\/incoming\//u);
  });

  it('refuses to promote a draft whose frames changed after capture', async () => {
    const { runRoot, workspace, url } = await fixture();
    const draft = await captureReferenceUrl({ runRoot, targetGame: 'g', workspace, url, captureId: 'c1', durationSeconds: 1, fps: 4 });
    await writeFile(path.join(runRoot, draft.capture.frames[1]!.path), 'not the captured frame');
    await expect(promoteReferenceCapture({ runRoot, targetGame: 'g', workspace, captureId: 'c1' })).rejects.toThrow(/modified/i);
    await expect(stat(path.join(runRoot, 'reference-evidence/manifest.json'))).rejects.toThrow();
  });

  it('refuses to promote a blocked draft', async () => {
    const { runRoot, workspace } = await fixture();
    const missing = pathToFileURL(path.join(workspace, 'missing-game.html')).href;
    await captureReferenceUrl({ runRoot, targetGame: 'g', workspace, url: missing, captureId: 'c1', durationSeconds: 1, fps: 4 });
    await expect(promoteReferenceCapture({ runRoot, targetGame: 'g', workspace, captureId: 'c1' })).rejects.toThrow(/not READY/i);
  });

  it('discards an unpromoted draft and keeps promoted captures', async () => {
    const { runRoot, workspace, url } = await fixture();
    await captureReferenceUrl({ runRoot, targetGame: 'g', workspace, url, captureId: 'scratch', durationSeconds: 1, fps: 4 });
    await captureReferenceUrl({ runRoot, targetGame: 'g', workspace, url, captureId: 'keep', durationSeconds: 1, fps: 4 });
    await promoteReferenceCapture({ runRoot, targetGame: 'g', workspace, captureId: 'keep' });
    expect(await discardReferenceCapture({ runRoot, captureId: 'scratch' })).toMatchObject({ captureId: 'scratch', removed: true });
    await expect(stat(path.join(runRoot, 'reference-evidence/incoming/web-capture-scratch'))).rejects.toThrow();
    await expect(discardReferenceCapture({ runRoot, captureId: 'keep' })).rejects.toThrow(/promoted/i);
    expect((await stat(path.join(runRoot, 'reference-evidence/incoming/web-capture-keep/reference-web-capture.json'))).isFile()).toBe(true);
  });

  it('clips screenshots to the game area', async () => {
    const { runRoot, workspace, url } = await fixture();
    const result = await captureReferenceUrl({
      runRoot, targetGame: 'g', workspace, url, captureId: 'clip', durationSeconds: 0.5, fps: 4,
      clip: { x: 10, y: 20, width: 200, height: 100 },
    });
    expect(result.capture.status).toBe('READY');
    expect(result.capture.clip).toEqual({ x: 10, y: 20, width: 200, height: 100 });
    const bytes = await readFile(path.join(runRoot, result.capture.frames[0]!.path));
    expect(bytes.readUInt32BE(16)).toBe(200);
    expect(bytes.readUInt32BE(20)).toBe(100);
  });

  it('rejects a clip that leaves the viewport', async () => {
    const { runRoot, workspace, url } = await fixture();
    await expect(captureReferenceUrl({
      runRoot, targetGame: 'g', workspace, url, captureId: 'clip', durationSeconds: 0.5, fps: 4,
      clip: { x: 300, y: 0, width: 200, height: 100 },
    })).rejects.toThrow(/clip/i);
  });

  it('reuses an existing capture without rewriting screenshots', async () => {
    const { runRoot, workspace, url } = await fixture();
    const input = { runRoot, targetGame: 'g', workspace, url, captureId: 'c1', durationSeconds: 1, fps: 4, actions: [{ type: 'tap' as const, atMs: 250, x: 0.5, y: 0.5 }] };
    const first = await captureReferenceUrl(input);
    const before = await stat(path.join(runRoot, first.capture.frames[0]!.path));
    const second = await captureReferenceUrl(input);
    const after = await stat(path.join(runRoot, first.capture.frames[0]!.path));
    expect(second.reused).toBe(true);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  it('rejects reuse when capture actions or target identity changed', async () => {
    const { runRoot, workspace, url } = await fixture();
    const input = { runRoot, targetGame: 'g', workspace, url, captureId: 'c1', durationSeconds: 0.5, fps: 4, actions: [{ type: 'tap' as const, atMs: 0, x: 0.5, y: 0.5 }] };
    await captureReferenceUrl(input);
    await expect(captureReferenceUrl({ ...input, actions: [{ type: 'key', atMs: 0, key: 'ArrowUp' }] })).rejects.toThrow(/different capture input/i);
    await expect(captureReferenceUrl({ ...input, targetGame: 'other-game' })).rejects.toThrow(/different capture input/i);
  });

  it('rejects a second capture id pointed at a different url', async () => {
    const { runRoot, workspace, url } = await fixture();
    await captureReferenceUrl({ runRoot, targetGame: 'g', workspace, url, captureId: 'c1', durationSeconds: 1, fps: 4 });
    await expect(captureReferenceUrl({
      runRoot, targetGame: 'g', workspace, url: 'file:///tmp/other-game.html', captureId: 'c1', durationSeconds: 1, fps: 4,
    })).rejects.toThrow(/different (url|capture input)/i);
  });

  it('retries a blocked capture of the same url instead of keeping the failure', async () => {
    const { runRoot, workspace } = await fixture();
    const pageFile = path.join(workspace, 'missing-game.html');
    const url = pathToFileURL(pageFile).href;
    const input = { runRoot, targetGame: 'g', workspace, url, captureId: 'c1', durationSeconds: 1, fps: 4 };
    const blocked = await captureReferenceUrl(input);
    expect(blocked.capture.status).toBe('BLOCKED');
    expect(blocked.reused).toBe(false);
    await writeFile(pageFile, pageHtml);
    const retried = await captureReferenceUrl(input);
    expect(retried.reused).toBe(false);
    expect(retried.capture.status).toBe('READY');
    await expect(stat(path.join(runRoot, 'reference-evidence/manifest.json'))).rejects.toThrow();
  });

  it('records a blocked capture when the page cannot be opened and does not ingest it', async () => {
    const { runRoot, workspace } = await fixture();
    const missing = pathToFileURL(path.join(workspace, 'missing-game.html')).href;
    const result = await captureReferenceUrl({
      runRoot, targetGame: 'g', workspace, url: missing, captureId: 'c1', durationSeconds: 1, fps: 4,
    });
    expect(result.capture.status).toBe('BLOCKED');
    expect(result.capture.blockers.some((blocker) => blocker.startsWith('page-load-failed:'))).toBe(true);
    const manifestPath = path.join(runRoot, 'reference-evidence/manifest.json');
    await expect(stat(manifestPath)).rejects.toThrow();
  });

  it('rejects an invalid capture id', async () => {
    const { runRoot, workspace, url } = await fixture();
    await expect(captureReferenceUrl({ runRoot, targetGame: 'g', workspace, url, captureId: 'Bad ID' })).rejects.toThrow();
  });

  it('rejects a duration that would produce fewer than two frames', async () => {
    const { runRoot, workspace, url } = await fixture();
    await expect(captureReferenceUrl({
      runRoot, targetGame: 'g', workspace, url, captureId: 'c1', durationSeconds: 0.1, fps: 4,
    })).rejects.toThrow();
  });

  it('rejects local files outside the bound workspace and non-public web URLs', async () => {
    const { runRoot, workspace } = await fixture();
    const other = pathToFileURL(path.join(runRoot, 'outside.html')).href;
    await expect(captureReferenceUrl({ runRoot, targetGame: 'g', workspace, url: other, captureId: 'outside-file' })).rejects.toThrow(/workspace|unsafe|local file/i);
    for (const unsafeUrl of ['http://127.0.0.1/game', 'https://localhost/game', 'https://user:secret@example.com/game']) {
      await expect(captureReferenceUrl({ runRoot, targetGame: 'g', workspace, url: unsafeUrl, captureId: 'unsafe-url' })).rejects.toThrow(/safe|public|https/i);
    }
  });

  it('blocks page requests and redirects to loopback before they reach the local service', async () => {
    const { runRoot, workspace } = await fixture();
    let requests = 0;
    let upgrades = 0;
    const server = createServer((_request, response) => { requests += 1; response.end('must not be reached'); });
    server.on('upgrade', (_request, socket) => { upgrades += 1; socket.destroy(); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    const pageFile = path.join(workspace, 'network.html');
    await writeFile(pageFile, `<!doctype html><script>fetch('http://127.0.0.1:${port}/private').catch(() => {});new WebSocket('ws://127.0.0.1:${port}/socket').onerror=()=>{};setTimeout(() => { location.href = 'http://127.0.0.1:${port}/redirect'; }, 100);</script>`);
    const capture = await captureReferenceUrl({ runRoot, targetGame: 'g', workspace, url: pathToFileURL(pageFile).href, captureId: 'network', durationSeconds: 0.5, fps: 4 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    expect(capture.capture.status).toBe('BLOCKED');
    expect(capture.capture.blockers.some((blocker) => blocker.startsWith('blocked-network-request:'))).toBe(true);
    expect(requests).toBe(0);
    expect(upgrades).toBe(0);
  });
});
