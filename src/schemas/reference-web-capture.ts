import { z } from 'zod';
import { isSafeExternalResearchUrl } from '../core/research-evidence.js';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);
const RunRelativePath = Text.refine((value) => !value.startsWith('/') && !value.split(/[\\/]/u).includes('..'), 'path must stay relative to the owning run');
const AbsolutePath = Text.refine((value) => value.startsWith('/'), 'path must be absolute');
const Unit = z.number().min(0).max(1);
const Ms = z.number().int().nonnegative();
export const ReferenceCaptureAllowedHostsSchema = z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9.-]*$/u).refine((host) => isSafeExternalResearchUrl(`https://${host}/`), 'capture CDN hosts must be public hostnames without ports, paths or credentials')).max(16).default([]);

const ParsableUrl = Text.refine((value) => { try { new URL(value); return true; } catch { return false; } }, 'must be a parsable URL');

export const ReferenceCaptureActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tap'), atMs: Ms, x: Unit, y: Unit }).strict(),
  z.object({ type: z.literal('drag'), atMs: Ms, fromX: Unit, fromY: Unit, toX: Unit, toY: Unit, durationMs: z.number().int().positive().max(5_000) }).strict(),
  z.object({ type: z.literal('key'), atMs: Ms, key: Text }).strict(),
  z.object({ type: z.literal('hold'), atMs: Ms, key: Text, durationMs: z.number().int().positive().max(5_000) }).strict(),
]);
export type ReferenceCaptureAction = z.infer<typeof ReferenceCaptureActionSchema>;
export const ReferenceCaptureActionListSchema = z.array(ReferenceCaptureActionSchema).max(200);

export const ReferenceCaptureClipSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
}).strict();
export type ReferenceCaptureClip = z.infer<typeof ReferenceCaptureClipSchema>;

export const REFERENCE_CAPTURE_MAX_FRAMES = 3_600;

export const ReferenceCaptureStepRequestSchema = z.object({
  actions: z.array(ReferenceCaptureActionSchema).max(50).default([]),
  recordMs: z.number().int().nonnegative().max(60_000),
  label: Text.max(80).optional(),
}).strict();
export type ReferenceCaptureStepRequest = z.input<typeof ReferenceCaptureStepRequestSchema>;

export const ReferenceCaptureSessionFileSchema = z.object({
  schemaVersion: z.literal(1),
  captureId: Text,
  captureInputHash: Sha256,
  requestedUrl: ParsableUrl,
  host: z.literal('127.0.0.1'),
  port: z.number().int().min(1).max(65_535),
  token: z.string().regex(/^[a-f0-9]{48}$/u),
  pid: z.number().int().positive(),
  startedAt: z.string().datetime(),
}).strict();
export type ReferenceCaptureSessionFile = z.infer<typeof ReferenceCaptureSessionFileSchema>;

export const ReferenceWebCaptureSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('reference-web-capture'),
  captureId: Text,
  captureInputHash: Sha256,
  targetGame: Text,
  workspace: AbsolutePath,
  requestedUrl: ParsableUrl,
  allowedHosts: ReferenceCaptureAllowedHostsSchema,
  finalUrl: Text,
  pageTitle: z.string(),
  browser: z.object({ name: z.literal('chromium'), version: Text }).strict(),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive(), deviceScaleFactor: z.literal(1) }).strict(),
  clip: ReferenceCaptureClipSchema.optional(),
  mode: z.enum(['scripted', 'interactive']).optional(),
  samplingFps: z.number().positive().max(30),
  durationMs: z.number().int().positive(),
  frames: z.array(z.object({
    index: Ms,
    requestedMs: Ms,
    actualMs: Ms,
    path: RunRelativePath,
    sha256: Sha256,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }).strict()).max(REFERENCE_CAPTURE_MAX_FRAMES),
  steps: z.array(z.object({
    index: Ms,
    label: Text.max(80).nullable(),
    startMs: Ms,
    firstFrameIndex: Ms,
    lastFrameIndex: Ms,
  }).strict()).optional(),
  interactions: z.array(z.object({
    order: z.number().int().positive(),
    action: ReferenceCaptureActionSchema,
    actualMs: Ms,
    performed: z.boolean(),
    error: z.string().nullable(),
  }).strict()),
  resources: z.array(z.object({
    url: Text,
    resourceType: Text,
    status: z.number().int(),
    mimeType: z.string(),
    sizeBytes: z.number().int().nonnegative().nullable(),
  }).strict()).max(2_000),
  consoleErrors: z.array(z.string()).max(200),
  status: z.enum(['READY', 'BLOCKED']),
  blockers: z.array(Text),
  capturedAt: z.string().datetime(),
}).strict().superRefine((capture, context) => {
  const clip = capture.clip;
  if (clip && (clip.x + clip.width > capture.viewport.width || clip.y + clip.height > capture.viewport.height)) context.addIssue({ code: 'custom', path: ['clip'], message: 'clip must stay inside the viewport' });
  const expected = clip ?? capture.viewport;
  for (const [index, frame] of capture.frames.entries()) {
    if (frame.index !== index) context.addIssue({ code: 'custom', path: ['frames', index, 'index'], message: 'frame indexes must be contiguous' });
    if (index > 0 && frame.requestedMs <= capture.frames[index - 1]!.requestedMs) context.addIssue({ code: 'custom', path: ['frames', index, 'requestedMs'], message: 'requested timestamps must increase' });
    if (frame.width !== expected.width || frame.height !== expected.height) context.addIssue({ code: 'custom', path: ['frames', index], message: clip ? 'frame dimensions must match the clip' : 'frame dimensions must match the viewport' });
  }
  let nextFrameIndex = 0;
  for (const [index, step] of (capture.steps ?? []).entries()) {
    if (step.index !== index) context.addIssue({ code: 'custom', path: ['steps', index, 'index'], message: 'step indexes must be contiguous' });
    if (step.firstFrameIndex !== nextFrameIndex || step.lastFrameIndex < step.firstFrameIndex || step.lastFrameIndex >= capture.frames.length) context.addIssue({ code: 'custom', path: ['steps', index], message: 'steps must cover consecutive frame ranges inside the capture' });
    nextFrameIndex = step.lastFrameIndex + 1;
  }
  if (capture.steps && capture.steps.length > 0 && nextFrameIndex !== capture.frames.length) context.addIssue({ code: 'custom', path: ['steps'], message: 'steps must cover every captured frame' });
  if (capture.status === 'READY' && (capture.frames.length < 2 || capture.blockers.length > 0)) context.addIssue({ code: 'custom', path: ['status'], message: 'READY captures require at least two frames and no blockers' });
  if (capture.status === 'BLOCKED' && capture.blockers.length === 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'BLOCKED captures require blockers' });
});
export type ReferenceWebCapture = z.infer<typeof ReferenceWebCaptureSchema>;

export const REFERENCE_WEB_CAPTURE_INDEX_NAME = 'reference-web-capture.json';
const STORED_CAPTURE_INDEX = /(?:^|\/)reference-web-capture-[a-f0-9]{12}\.json$/iu;
export function isReferenceWebCapturePath(storedPath: string) {
  return STORED_CAPTURE_INDEX.test(storedPath);
}
