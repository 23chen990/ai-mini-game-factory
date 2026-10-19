import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { lookup } from 'node:dns/promises';
import { copyFile, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import { ZodError } from 'zod';
import { EvidenceProvenanceManifestSchema } from '../schemas/evidence-provenance.js';
import {
  REFERENCE_CAPTURE_MAX_FRAMES,
  REFERENCE_WEB_CAPTURE_INDEX_NAME,
  ReferenceCaptureAllowedHostsSchema,
  ReferenceCaptureSessionFileSchema,
  ReferenceCaptureStepRequestSchema,
  ReferenceWebCaptureSchema,
  type ReferenceCaptureAction,
  type ReferenceCaptureClip,
  type ReferenceCaptureStepRequest,
  type ReferenceWebCapture,
} from '../schemas/reference-web-capture.js';
import { isPrivateResearchHost, isSafeExternalResearchUrl } from './research-evidence.js';
import { exists, writeJsonAtomic } from './files.js';

const CAPTURE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const SESSION_FILE_NAME = 'session.json';
const DEFAULT_VIEWPORT = { width: 390, height: 844 };

function sha256(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}

function isWithinPath(root: string, candidate: string) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function assertWorkspaceInRun(runRoot: string, workspace: string) {
  if (!isWithinPath(runRoot, workspace)) throw new Error('capture workspace must be inside the target run root');
}

async function isWorkspaceFileUrl(value: string, workspace: string) {
  const url = new URL(value);
  if (url.protocol !== 'file:') return false;
  const source = path.resolve(fileURLToPath(url));
  if (!isWithinPath(workspace, source)) return false;
  try {
    const [workspaceRealPath, sourceRealPath] = await Promise.all([realpath(workspace), realpath(source)]);
    return isWithinPath(workspaceRealPath, sourceRealPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw error;
  }
}

/** The page may load only the bound source and explicit public CDN hosts (or local files
 * below its declared workspace). This gate runs for redirects and subresources. */
export async function isAllowedReferenceCaptureRequestUrl(value: string, sourceUrl: string, workspace: string, allowedHosts: string[] = []) {
  const requestUrl = new URL(value);
  if (['about:', 'blob:', 'data:'].includes(requestUrl.protocol)) return true;
  const source = new URL(sourceUrl);
  if (source.protocol === 'file:') return isWorkspaceFileUrl(value, workspace);
  const safeProtocol = requestUrl.protocol === 'https:' && isSafeExternalResearchUrl(value)
    || requestUrl.protocol === 'wss:' && isSafeExternalResearchUrl(value.replace(/^wss:/u, 'https:'));
  return safeProtocol
    && (requestUrl.hostname.toLowerCase() === source.hostname.toLowerCase() && requestUrl.port === source.port
      || allowedHosts.includes(requestUrl.hostname.toLowerCase()) && requestUrl.port === '');
}

async function assertSafeCaptureTarget(value: string, workspace: string) {
  if (await isWorkspaceFileUrl(value, workspace)) return;
  if (!isSafeExternalResearchUrl(value)) throw new Error('reference URL must be public HTTPS or a file inside the target workspace');
  const hostname = new URL(value).hostname.replace(/^\[|\]$/gu, '');
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.some((address) => isPrivateResearchHost(address.address))) throw new Error('reference URL host resolves to a non-public address');
}

function buildCaptureInputHash(input: {
  captureId: string;
  targetGame: string;
  workspace: string;
  url: string;
  mode: 'scripted' | 'interactive';
  allowedHosts: string[];
  fps: number;
  viewport: { width: number; height: number };
  clip: ReferenceCaptureClip | undefined;
  durationSeconds?: number;
  actions?: ReferenceCaptureAction[];
  idleTimeoutMs?: number;
  maxFrames?: number;
}) {
  return createHash('sha256').update(JSON.stringify({
    captureId: input.captureId,
    targetGame: input.targetGame,
    workspace: path.resolve(input.workspace),
    url: input.url,
    ...(input.allowedHosts.length > 0 ? { allowedHosts: input.allowedHosts } : {}),
    mode: input.mode,
    fps: input.fps,
    viewport: input.viewport,
    clip: input.clip ?? null,
    ...(input.mode === 'scripted'
      ? { durationSeconds: input.durationSeconds, actions: input.actions ?? [] }
      : { idleTimeoutMs: input.idleTimeoutMs, maxFrames: input.maxFrames }),
  })).digest('hex');
}

function pngSize(buffer: Buffer) {
  if (buffer.length < 24 || buffer.readUInt32BE(12) !== 0x49484452) throw new Error('screenshot is not a PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function capturePaths(runRoot: string, captureId: string) {
  if (!CAPTURE_ID.test(captureId)) throw new Error(`invalid capture id: ${captureId}`);
  const captureRel = `reference-evidence/incoming/web-capture-${captureId}`;
  const captureDir = path.join(runRoot, captureRel);
  return { captureRel, captureDir, indexPath: path.join(captureDir, REFERENCE_WEB_CAPTURE_INDEX_NAME), sessionPath: path.join(captureDir, SESSION_FILE_NAME) };
}

function assertCaptureSettings(fps: number, viewport: { width: number; height: number }, clip: ReferenceCaptureClip | undefined) {
  if (!(fps > 0) || fps > 30) throw new Error('capture fps must be in (0, 30]');
  if (clip && (clip.x + clip.width > viewport.width || clip.y + clip.height > viewport.height)) throw new Error('capture clip must stay inside the viewport');
}

async function sessionIsLive(sessionPath: string) {
  if (!await exists(sessionPath)) return false;
  const parsed = ReferenceCaptureSessionFileSchema.safeParse(JSON.parse(await readFile(sessionPath, 'utf8')));
  if (!parsed.success) return false;
  try { process.kill(parsed.data.pid, 0); return true; } catch { return false; }
}

async function verifyCaptureFrames(runRoot: string, capture: ReferenceWebCapture) {
  for (const frame of capture.frames) {
    let actual: string;
    try { actual = sha256(await readFile(path.join(runRoot, frame.path))); }
    catch { throw new Error('existing capture was modified; use a new capture id'); }
    if (actual !== frame.sha256) throw new Error('existing capture was modified; use a new capture id');
  }
}

async function registerCaptureEvidence(input: { runRoot: string; targetGame: string; workspace: string; captureId: string; sourcePath: string }) {
  const { runRoot, targetGame, workspace, captureId, sourcePath } = input;
  const bytes = await readFile(sourcePath);
  const digest = sha256(bytes);
  const id = `web-capture-${captureId}`;
  const manifestPath = path.join(runRoot, 'reference-evidence/manifest.json');
  const destination = path.join(runRoot, 'reference-evidence/incoming', `reference-web-capture-${digest.slice(0, 12)}.json`);
  const storedPath = path.relative(runRoot, destination).replaceAll(path.sep, '/');
  const manifest = await exists(manifestPath)
    ? EvidenceProvenanceManifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')))
    : EvidenceProvenanceManifestSchema.parse({
      schemaVersion: 1,
      targetGame,
      workspace,
      directories: { incoming: 'reference-evidence/incoming', verified: 'reference-evidence/verified', excluded: 'reference-evidence/excluded' },
      entries: [],
    });
  if (manifest.targetGame !== targetGame || manifest.workspace !== workspace) throw new Error('reference manifest target game or workspace mismatch');
  const existing = manifest.entries.find((entry) => entry.id === id);
  if (existing) {
    if (existing.sha256 !== digest || existing.targetGame !== targetGame || existing.workspace !== workspace) throw new Error(`capture evidence changed after registration: ${captureId}`);
    const existingPath = existing.storedPath && path.resolve(runRoot, existing.storedPath);
    if (!existingPath || sha256(await readFile(existingPath)) !== digest) throw new Error(`existing capture evidence was modified: ${captureId}`);
    return { destination: existingPath, storedPath: existing.storedPath, manifestPath, sha256: digest, id, alreadyRegistered: true };
  }
  if (manifest.entries.some((entry) => entry.sha256 === digest)) throw new Error(`capture evidence hash is already registered under a different identity: ${captureId}`);
  await copyFile(sourcePath, destination);
  manifest.entries.push({ id, sourcePath, storedPath, purpose: 'gameplay-reference', sha256: digest, targetGame, workspace, identityStatus: 'UNKNOWN', reviewStatus: 'PENDING', usableAsEvidence: false, notes: 'Ingested automatically; identity review required before use.' });
  const validated = EvidenceProvenanceManifestSchema.parse(manifest);
  await writeJsonAtomic(manifestPath, validated);
  return { destination, storedPath, manifestPath, sha256: digest, id, alreadyRegistered: false };
}

/** One browser page plus the frames, interactions and blockers recorded from
 * it. Scripted captures record one segment; interactive sessions record one
 * segment per step on the same page. */
class CaptureRecorder {
  readonly frames: ReferenceWebCapture['frames'] = [];
  readonly interactions: ReferenceWebCapture['interactions'] = [];
  readonly resources: ReferenceWebCapture['resources'] = [];
  readonly consoleErrors: string[] = [];
  readonly blockers: string[] = [];
  readonly steps: NonNullable<ReferenceWebCapture['steps']> = [];
  readonly intervalMs: number;
  private order = 1;
  private startedAt = Date.now();
  private browser: Browser | undefined;
  private page: Page | undefined;
  private browserVersion = 'unknown';
  private finalUrl: string;
  private pageTitle = '';
  private closed = false;

  constructor(private readonly options: {
    runRoot: string;
    captureId: string;
    captureRel: string;
    captureDir: string;
    indexPath: string;
    captureInputHash: string;
    targetGame: string;
    workspace: string;
    url: string;
    fps: number;
    viewport: { width: number; height: number };
    clip: ReferenceCaptureClip | undefined;
    mode: 'scripted' | 'interactive';
    allowedHosts: string[];
  }) {
    this.intervalMs = Math.round(1000 / options.fps);
    this.finalUrl = options.url;
  }

  async open() {
    const browser = await chromium.launch();
    this.browser = browser;
    this.browserVersion = browser.version();
    const context = await browser.newContext({ viewport: this.options.viewport, deviceScaleFactor: 1 });
    await context.route('**/*', async (route) => {
      const requestUrl = route.request().url();
      if (await isAllowedReferenceCaptureRequestUrl(requestUrl, this.options.url, this.options.workspace, this.options.allowedHosts)) {
        await route.continue();
        return;
      }
      this.blockers.push(`blocked-network-request:${new URL(requestUrl).hostname || new URL(requestUrl).protocol}`);
      await route.abort('blockedbyclient');
    });
    await context.routeWebSocket(() => true, async (webSocket) => {
      if (await isAllowedReferenceCaptureRequestUrl(webSocket.url(), this.options.url, this.options.workspace, this.options.allowedHosts)) {
        webSocket.connectToServer();
        return;
      }
      this.blockers.push(`blocked-network-request:${new URL(webSocket.url()).hostname}`);
      await webSocket.close({ code: 1008, reason: 'capture network policy' });
    });
    const page = await context.newPage();
    this.page = page;
    page.on('response', (response) => {
      if (this.resources.length >= 2_000) return;
      const lengthHeader = response.headers()['content-length'];
      const sizeBytes = lengthHeader !== undefined && /^\d+$/u.test(lengthHeader) ? Number(lengthHeader) : null;
      this.resources.push({
        url: response.url(),
        resourceType: response.request().resourceType(),
        status: response.status(),
        mimeType: response.headers()['content-type'] ?? '',
        sizeBytes,
      });
    });
    page.on('console', (message) => {
      if (message.type() === 'error' && this.consoleErrors.length < 200) this.consoleErrors.push(message.text().slice(0, 500));
    });
    page.on('pageerror', (error) => {
      if (this.consoleErrors.length < 200) this.consoleErrors.push(error.message.slice(0, 500));
    });
    try {
      await page.goto(this.options.url, { waitUntil: 'load', timeout: 30_000 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.blockers.push(`page-load-failed:${message.slice(0, 200)}`);
    }
    if (this.blockers.length === 0) await mkdir(path.join(this.options.captureDir, 'frames'), { recursive: true });
    this.startedAt = Date.now();
    return this.blockers.length === 0;
  }

  elapsedMs() {
    return Date.now() - this.startedAt;
  }

  /** Actions are relative to the segment start; they are logged on the
   * capture timeline so one index reads as a single ordered recording. */
  async record(input: { actions: ReferenceCaptureAction[]; frameCount: number; offsetMs: number; unreachedError: string }) {
    const page = this.page;
    if (!page) throw new Error('capture page is not open');
    const { viewport, clip } = this.options;
    const expected = clip ?? viewport;
    const actions = [...input.actions].sort((left, right) => left.atMs - right.atMs);
    const done = new Set<number>();
    const pendingReleases: Promise<void>[] = [];
    try {
      for (let step = 0; step < input.frameCount; step += 1) {
        const segmentMs = step * this.intervalMs;
        const requestedMs = input.offsetMs + segmentMs;
        const remaining = this.startedAt + requestedMs - Date.now();
        if (remaining > 0) await page.waitForTimeout(remaining);
        for (const [actionIndex, action] of actions.entries()) {
          if (done.has(actionIndex) || action.atMs > segmentMs) continue;
          const logged = { ...action, atMs: input.offsetMs + action.atMs };
          const actualMs = this.elapsedMs();
          try {
            if (action.type === 'tap') await page.mouse.click(action.x * viewport.width, action.y * viewport.height);
            else if (action.type === 'drag') {
              await page.mouse.move(action.fromX * viewport.width, action.fromY * viewport.height);
              await page.mouse.down();
              await page.mouse.move(action.toX * viewport.width, action.toY * viewport.height, { steps: Math.max(2, Math.round(action.durationMs / 16)) });
              await page.mouse.up();
            } else if (action.type === 'hold') {
              await page.keyboard.down(action.key);
              const key = action.key;
              pendingReleases.push(page.waitForTimeout(action.durationMs).then(() => page.keyboard.up(key)).then(() => undefined, () => undefined));
            } else await page.keyboard.press(action.key);
            this.interactions.push({ order: this.order, action: logged, actualMs: this.elapsedMs(), performed: true, error: null });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.interactions.push({ order: this.order, action: logged, actualMs, performed: false, error: message });
          }
          this.order += 1;
          done.add(actionIndex);
        }
        const index = this.frames.length;
        const buffer = await page.screenshot({ type: 'png', ...(clip ? { clip } : {}) });
        const size = pngSize(buffer);
        if (size.width !== expected.width || size.height !== expected.height) {
          this.blockers.push(`frame-size-mismatch:${index}`);
          break;
        }
        const fileName = `frame-${String(index).padStart(5, '0')}.png`;
        await writeFile(path.join(this.options.captureDir, 'frames', fileName), buffer);
        this.frames.push({
          index,
          requestedMs,
          actualMs: this.elapsedMs(),
          path: `${this.options.captureRel}/frames/${fileName}`,
          sha256: sha256(buffer),
          width: size.width,
          height: size.height,
        });
      }
    } finally {
      for (const [actionIndex, action] of actions.entries()) {
        if (done.has(actionIndex)) continue;
        this.interactions.push({ order: this.order, action: { ...action, atMs: input.offsetMs + action.atMs }, actualMs: this.elapsedMs(), performed: false, error: input.unreachedError });
        this.order += 1;
      }
      await Promise.all(pendingReleases);
    }
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    if (this.page) {
      this.finalUrl = this.page.url();
      try { this.pageTitle = await this.page.title(); } catch { this.pageTitle = ''; }
    }
    await this.browser?.close();
  }

  async writeIndex() {
    if (this.blockers.length === 0 && this.frames.length < 2) this.blockers.push('too-few-frames');
    const { viewport, clip, mode } = this.options;
    const capture = ReferenceWebCaptureSchema.parse({
      schemaVersion: 1,
      artifactType: 'reference-web-capture',
      captureId: this.options.captureId,
      captureInputHash: this.options.captureInputHash,
      targetGame: this.options.targetGame,
      workspace: this.options.workspace,
      requestedUrl: this.options.url,
      allowedHosts: this.options.allowedHosts,
      finalUrl: this.finalUrl,
      pageTitle: this.pageTitle,
      browser: { name: 'chromium', version: this.browserVersion },
      viewport: { width: viewport.width, height: viewport.height, deviceScaleFactor: 1 },
      ...(clip ? { clip } : {}),
      mode,
      samplingFps: this.options.fps,
      durationMs: Math.max(1, this.frames.at(-1)?.actualMs ?? 1),
      frames: this.frames,
      ...(mode === 'interactive' ? { steps: this.steps } : {}),
      interactions: this.interactions,
      resources: this.resources,
      consoleErrors: this.consoleErrors,
      status: this.blockers.length === 0 && this.frames.length >= 2 ? 'READY' : 'BLOCKED',
      blockers: [...new Set(this.blockers)],
      capturedAt: new Date().toISOString(),
    });
    await mkdir(this.options.captureDir, { recursive: true });
    await writeJsonAtomic(this.options.indexPath, capture);
    return capture;
  }
}

/** Record a scripted capture as a draft. Drafts never enter the evidence
 * manifest; `promoteReferenceCapture` is the only path into evidence. */
export async function captureReferenceUrl(input: {
  runRoot: string;
  targetGame: string;
  workspace: string;
  url: string;
  captureId: string;
  allowedHosts?: string[];
  durationSeconds?: number;
  fps?: number;
  viewport?: { width: number; height: number };
  clip?: ReferenceCaptureClip;
  actions?: ReferenceCaptureAction[];
}): Promise<{ capture: ReferenceWebCapture; indexPath: string; reused: boolean }> {
  const runRoot = path.resolve(input.runRoot);
  const workspace = path.resolve(input.workspace);
  assertWorkspaceInRun(runRoot, workspace);
  const paths = capturePaths(runRoot, input.captureId);
  const allowedHosts = [...new Set(ReferenceCaptureAllowedHostsSchema.parse(input.allowedHosts))].sort();
  const fps = input.fps ?? 4;
  const seconds = input.durationSeconds ?? 20;
  const viewport = input.viewport ?? DEFAULT_VIEWPORT;
  const captureInputHash = buildCaptureInputHash({ captureId: input.captureId, targetGame: input.targetGame, workspace, url: input.url, mode: 'scripted', allowedHosts, fps, viewport, clip: input.clip, durationSeconds: seconds, actions: input.actions });
  assertCaptureSettings(fps, viewport, input.clip);
  const frameCount = Math.floor(seconds * fps) + 1;
  if (!Number.isInteger(frameCount) || frameCount < 2 || frameCount > 900) throw new Error(`capture frame count must be from 2 to 900, got ${frameCount}`);

  if (await sessionIsLive(paths.sessionPath)) throw new Error(`capture session is running for ${input.captureId}; finish it first`);
  let retryBlockedCapture = false;
  if (await exists(paths.indexPath)) {
    const capture = ReferenceWebCaptureSchema.parse(JSON.parse(await readFile(paths.indexPath, 'utf8')));
    if (capture.captureInputHash !== captureInputHash) throw new Error('capture id already used for different capture input');
    if (capture.status === 'READY') {
      await verifyCaptureFrames(runRoot, capture);
      return { capture, indexPath: paths.indexPath, reused: true };
    }
    retryBlockedCapture = true;
  }

  await assertSafeCaptureTarget(input.url, workspace);
  await Promise.all(allowedHosts.map((host) => assertSafeCaptureTarget(`https://${host}/`, workspace)));
  if (retryBlockedCapture) await rm(paths.captureDir, { recursive: true, force: true });
  const recorder = new CaptureRecorder({ ...paths, runRoot, captureId: input.captureId, captureInputHash, targetGame: input.targetGame, workspace, url: input.url, fps, viewport, clip: input.clip, mode: 'scripted', allowedHosts });
  try {
    if (await recorder.open()) await recorder.record({ actions: input.actions ?? [], frameCount, offsetMs: 0, unreachedError: 'not reached before capture ended' });
  } finally {
    await recorder.close();
  }
  const capture = await recorder.writeIndex();
  return { capture, indexPath: paths.indexPath, reused: false };
}

/** Register one chosen READY draft as PENDING gameplay evidence. */
export async function promoteReferenceCapture(input: { runRoot: string; targetGame: string; workspace: string; captureId: string }) {
  const runRoot = path.resolve(input.runRoot);
  const workspace = path.resolve(input.workspace);
  assertWorkspaceInRun(runRoot, workspace);
  const paths = capturePaths(runRoot, input.captureId);
  if (await sessionIsLive(paths.sessionPath)) throw new Error(`capture session is running for ${input.captureId}; finish it before promoting`);
  if (!await exists(paths.indexPath)) throw new Error(`capture draft not found: ${input.captureId}`);
  const capture = ReferenceWebCaptureSchema.parse(JSON.parse(await readFile(paths.indexPath, 'utf8')));
  if (capture.status !== 'READY') throw new Error(`capture draft is not READY: ${input.captureId}`);
  if (capture.targetGame !== input.targetGame || path.resolve(capture.workspace) !== workspace) throw new Error(`capture draft target mismatch: ${input.captureId}`);
  await verifyCaptureFrames(runRoot, capture);
  return registerCaptureEvidence({ runRoot, targetGame: input.targetGame, workspace, captureId: input.captureId, sourcePath: paths.indexPath });
}

/** Delete a draft that was never promoted. Promoted captures stay because the
 * evidence manifest hash-locks their frames. */
export async function discardReferenceCapture(input: { runRoot: string; captureId: string }) {
  const runRoot = path.resolve(input.runRoot);
  const paths = capturePaths(runRoot, input.captureId);
  if (await sessionIsLive(paths.sessionPath)) throw new Error(`capture session is running for ${input.captureId}; finish it before discarding`);
  const manifestPath = path.join(runRoot, 'reference-evidence/manifest.json');
  if (await exists(manifestPath)) {
    const manifest = EvidenceProvenanceManifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
    if (manifest.entries.some((entry) => entry.id === `web-capture-${input.captureId}`)) throw new Error(`capture ${input.captureId} was promoted to evidence and cannot be discarded`);
  }
  if (!await exists(paths.captureDir)) throw new Error(`capture draft not found: ${input.captureId}`);
  await rm(paths.captureDir, { recursive: true, force: true });
  return { captureId: input.captureId, removed: true };
}

export type ReferenceCaptureStepResult = {
  stepIndex: number;
  label: string | null;
  startMs: number;
  firstFrameIndex: number;
  lastFrameIndex: number;
  frames: Array<{ index: number; requestedMs: number; actualMs: number; path: string }>;
  lastFramePath: string;
  interactions: ReferenceWebCapture['interactions'];
};
export type ReferenceCaptureSessionStatus = { captureId: string; frameCount: number; stepCount: number; elapsedMs: number; blockers: string[]; lastFramePath: string | null };
export type ReferenceCaptureSessionFinish = { status: ReferenceWebCapture['status']; indexPath: string; frameCount: number; stepCount: number; blockers: string[] };

class SessionRequestError extends Error {}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buffer.length;
    if (size > 1_000_000) throw new SessionRequestError('request body is too large');
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  try { return JSON.parse(text) as unknown; } catch { throw new SessionRequestError('request body is not JSON'); }
}

/** Open the page once and serve step/status/finish on loopback so an operator
 * can look at each result before choosing the next input. The session writes
 * an interactive draft index when finished or idle. */
export async function startReferenceCaptureSession(input: {
  runRoot: string;
  targetGame: string;
  workspace: string;
  url: string;
  captureId: string;
  allowedHosts?: string[];
  fps?: number;
  viewport?: { width: number; height: number };
  clip?: ReferenceCaptureClip;
  idleTimeoutMs?: number;
  maxFrames?: number;
}): Promise<{ port: number; sessionPath: string; indexPath: string; finished: Promise<{ capture: ReferenceWebCapture; indexPath: string }> }> {
  const runRoot = path.resolve(input.runRoot);
  const workspace = path.resolve(input.workspace);
  assertWorkspaceInRun(runRoot, workspace);
  const paths = capturePaths(runRoot, input.captureId);
  const allowedHosts = [...new Set(ReferenceCaptureAllowedHostsSchema.parse(input.allowedHosts))].sort();
  const fps = input.fps ?? 4;
  const viewport = input.viewport ?? DEFAULT_VIEWPORT;
  assertCaptureSettings(fps, viewport, input.clip);
  const maxFrames = input.maxFrames ?? REFERENCE_CAPTURE_MAX_FRAMES;
  if (!Number.isInteger(maxFrames) || maxFrames < 1 || maxFrames > REFERENCE_CAPTURE_MAX_FRAMES) throw new Error(`session frame limit must be from 1 to ${REFERENCE_CAPTURE_MAX_FRAMES}`);
  const idleTimeoutMs = input.idleTimeoutMs ?? 20 * 60_000;
  if (!Number.isInteger(idleTimeoutMs) || idleTimeoutMs < 1) throw new Error('session idle timeout must be a positive integer of milliseconds');
  const captureInputHash = buildCaptureInputHash({ captureId: input.captureId, targetGame: input.targetGame, workspace, url: input.url, mode: 'interactive', allowedHosts, fps, viewport, clip: input.clip, idleTimeoutMs, maxFrames });
  if (await sessionIsLive(paths.sessionPath)) throw new Error(`capture session is already running for ${input.captureId}`);
  if (await exists(paths.indexPath)) {
    const existing = ReferenceWebCaptureSchema.parse(JSON.parse(await readFile(paths.indexPath, 'utf8')));
    if (existing.captureInputHash !== captureInputHash) throw new Error('capture id already used for different capture input');
    if (existing.status === 'READY') throw new Error(`capture id already used: ${input.captureId}; use a new capture id`);
  }

  await assertSafeCaptureTarget(input.url, workspace);
  await Promise.all(allowedHosts.map((host) => assertSafeCaptureTarget(`https://${host}/`, workspace)));
  await rm(paths.captureDir, { recursive: true, force: true });
  const recorder = new CaptureRecorder({ ...paths, runRoot, captureId: input.captureId, captureInputHash, targetGame: input.targetGame, workspace, url: input.url, fps, viewport, clip: input.clip, mode: 'interactive', allowedHosts });
  let opened: boolean;
  try { opened = await recorder.open(); }
  catch (error) { await recorder.close(); throw error; }
  if (!opened) {
    await recorder.close();
    await recorder.writeIndex();
    throw new Error(`capture session could not open the page: ${recorder.blockers.join('; ')}`);
  }

  const token = randomBytes(24).toString('hex');
  let busy = false;
  let finishing: Promise<{ capture: ReferenceWebCapture; indexPath: string }> | undefined;
  let idleTimer: NodeJS.Timeout | undefined;
  let settle!: (value: Promise<{ capture: ReferenceWebCapture; indexPath: string }>) => void;
  const finished = new Promise<{ capture: ReferenceWebCapture; indexPath: string }>((resolve) => { settle = resolve; });
  finished.catch(() => undefined);

  const server = createServer((request, response) => { void handle(request, response); });
  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { void finish().catch(() => undefined); }, idleTimeoutMs);
    idleTimer.unref();
  };
  const finish = () => {
    if (!finishing) {
      if (idleTimer) clearTimeout(idleTimer);
      finishing = (async () => {
        try {
          await recorder.close();
          const capture = await recorder.writeIndex();
          return { capture, indexPath: paths.indexPath };
        } finally {
          await rm(paths.sessionPath, { force: true });
          server.close();
        }
      })();
      settle(finishing);
    }
    return finishing;
  };
  const status = (): ReferenceCaptureSessionStatus => ({
    captureId: input.captureId,
    frameCount: recorder.frames.length,
    stepCount: recorder.steps.length,
    elapsedMs: recorder.elapsedMs(),
    blockers: [...recorder.blockers],
    lastFramePath: recorder.frames.at(-1) ? path.join(runRoot, recorder.frames.at(-1)!.path) : null,
  });
  const step = async (body: unknown): Promise<ReferenceCaptureStepResult> => {
    const request = ReferenceCaptureStepRequestSchema.parse(body);
    if (recorder.blockers.length > 0) throw new SessionRequestError(`capture session is blocked: ${recorder.blockers.join('; ')}`);
    const frameCount = Math.floor(request.recordMs * fps / 1000) + 1;
    if (recorder.frames.length + frameCount > maxFrames) throw new SessionRequestError(`step would exceed the session frame limit of ${maxFrames}`);
    const offsetMs = Math.max(recorder.elapsedMs(), (recorder.frames.at(-1)?.requestedMs ?? -1) + 1);
    const firstFrameIndex = recorder.frames.length;
    const firstInteraction = recorder.interactions.length;
    let failure: unknown;
    try {
      await recorder.record({ actions: request.actions, frameCount, offsetMs, unreachedError: 'not reached before step ended' });
    } catch (error) {
      failure = error;
      recorder.blockers.push(`step-failed:${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`);
    }
    const lastFrameIndex = recorder.frames.length - 1;
    const stepIndex = recorder.steps.length;
    if (lastFrameIndex >= firstFrameIndex) recorder.steps.push({ index: stepIndex, label: request.label ?? null, startMs: offsetMs, firstFrameIndex, lastFrameIndex });
    if (failure) throw failure;
    if (lastFrameIndex < firstFrameIndex) throw new Error(`step captured no frames: ${recorder.blockers.join('; ')}`);
    const frames = recorder.frames.slice(firstFrameIndex, lastFrameIndex + 1).map((frame) => ({ index: frame.index, requestedMs: frame.requestedMs, actualMs: frame.actualMs, path: path.join(runRoot, frame.path) }));
    return { stepIndex, label: request.label ?? null, startMs: offsetMs, firstFrameIndex, lastFrameIndex, frames, lastFramePath: frames.at(-1)!.path, interactions: recorder.interactions.slice(firstInteraction) };
  };
  async function handle(request: IncomingMessage, response: ServerResponse) {
    if (request.headers['x-capture-token'] !== token) return sendJson(response, 401, { error: 'invalid session token' });
    if (finishing) return sendJson(response, 410, { error: 'capture session has finished' });
    if (busy) return sendJson(response, 409, { error: 'capture session is busy' });
    busy = true;
    if (idleTimer) clearTimeout(idleTimer);
    try {
      const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      if (request.method === 'GET' && pathname === '/status') return sendJson(response, 200, status());
      if (request.method === 'POST' && pathname === '/step') return sendJson(response, 200, await step(await readJsonBody(request)));
      if (request.method === 'POST' && pathname === '/finish') {
        const { capture, indexPath } = await finish();
        const result: ReferenceCaptureSessionFinish = { status: capture.status, indexPath, frameCount: capture.frames.length, stepCount: capture.steps?.length ?? 0, blockers: capture.blockers };
        return sendJson(response, 200, result);
      }
      return sendJson(response, 404, { error: `unknown session command: ${request.method} ${pathname}` });
    } catch (error) {
      const message = error instanceof ZodError ? `invalid step request: ${error.issues.map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`).join('; ')}` : error instanceof Error ? error.message : String(error);
      return sendJson(response, error instanceof SessionRequestError || error instanceof ZodError ? 400 : 500, { error: message });
    } finally {
      busy = false;
      if (!finishing) armIdle();
    }
  }

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    const session = ReferenceCaptureSessionFileSchema.parse({ schemaVersion: 1, captureId: input.captureId, captureInputHash, requestedUrl: input.url, host: '127.0.0.1', port, token, pid: process.pid, startedAt: new Date().toISOString() });
    await writeFile(paths.sessionPath, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
    armIdle();
    return { port, sessionPath: paths.sessionPath, indexPath: paths.indexPath, finished };
  } catch (error) {
    await finish().catch(() => undefined);
    throw error;
  }
}

type SessionCommandInput = { runRoot: string; captureId: string };
export function sendReferenceCaptureSessionCommand(input: SessionCommandInput & { command: 'step'; body: ReferenceCaptureStepRequest }): Promise<ReferenceCaptureStepResult>;
export function sendReferenceCaptureSessionCommand(input: SessionCommandInput & { command: 'status' }): Promise<ReferenceCaptureSessionStatus>;
export function sendReferenceCaptureSessionCommand(input: SessionCommandInput & { command: 'finish' }): Promise<ReferenceCaptureSessionFinish>;
export async function sendReferenceCaptureSessionCommand(input: SessionCommandInput & { command: 'step' | 'status' | 'finish'; body?: ReferenceCaptureStepRequest }): Promise<unknown> {
  const paths = capturePaths(path.resolve(input.runRoot), input.captureId);
  if (!await exists(paths.sessionPath)) throw new Error(`no running capture session for ${input.captureId}`);
  const session = ReferenceCaptureSessionFileSchema.parse(JSON.parse(await readFile(paths.sessionPath, 'utf8')));
  const response = await fetch(`http://${session.host}:${session.port}/${input.command}`, {
    method: input.command === 'status' ? 'GET' : 'POST',
    headers: { 'x-capture-token': session.token, 'content-type': 'application/json' },
    ...(input.command === 'status' ? {} : { body: JSON.stringify(input.body ?? {}) }),
  });
  const payload = await response.json() as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `capture session ${input.command} failed with HTTP ${response.status}`);
  return payload;
}
