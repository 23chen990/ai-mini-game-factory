/* global console */
// Produce a review packet for the Pelican V3 H5 candidate. Missing or stale
// browser evidence remains BLOCKED; this script never upgrades old matrices.
import { lstat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { tsImport } from 'tsx/esm/api';
import { z } from 'zod';
import { BASE, RUN, RUN_ID, WORKSPACE, json, sha } from './prepare.mjs';

const GAME = '鹈鹕海岸冒险';
const SHA256 = z.string().regex(/^[a-f0-9]{64}$/u);
const Text = z.string().trim().min(1);
const BrowserCheckSchema = z.object({ name: Text, passed: z.boolean() }).passthrough();
const ScreenshotBindingSchema = z.object({ path: Text, sha256: SHA256 }).passthrough();
const FEEL_STATE_CHECKS = ['normal-barrier-terminal', 'normal-replay', 'six-state-correlated-running-frames'];
const FEEL_STATE_TRANSITIONS = ['lane-inertia', 'inertial-turn', 'camera-follow', ...FEEL_STATE_CHECKS];
const FEEL_STATE_FRAME_MS = [900, 1300, 1500, 1750, 2480, 3200];
const FeelStateCameraSchema = z.object({
  position: z.array(z.number().finite()).length(3),
  quaternion: z.array(z.number().finite()).length(4),
  fov: z.number().finite(),
}).passthrough();
const FeelStatePoseSchema = z.object({
  requested: z.object({ lean: z.number().finite(), steer: z.number().finite(), yaw: z.number().finite() }).passthrough(),
  riderRotation: z.array(z.number().finite()).length(3),
  frontSteeringMatrix: z.array(z.number().finite()).length(16),
  headRotation: z.array(z.number().finite()).length(3),
  bodyRotation: z.array(z.number().finite()).length(3),
}).passthrough();
const FeelStateMotionStateSchema = z.object({ phase: Text, level: z.number().int(), distance: z.number().finite() }).passthrough();
const FeelStateFrameSchema = z.object({
  plannedMs: z.number().finite(), completedMs: z.number().finite(),
  before: z.object({ state: FeelStateMotionStateSchema, render: z.object({ camera: FeelStateCameraSchema, pose: FeelStatePoseSchema }).passthrough() }).passthrough(),
  after: z.object({ state: FeelStateMotionStateSchema, render: z.object({ camera: FeelStateCameraSchema, pose: FeelStatePoseSchema }).passthrough() }).passthrough(),
  image: ScreenshotBindingSchema,
}).passthrough();
const FeelStateReportSchema = z.object({
  schemaVersion: z.literal(1), targetGame: z.literal(GAME), workspace: z.literal(WORKSPACE), buildHash: SHA256,
  engine: z.enum(['webkit', 'chromium']), driverSha256: SHA256, normalInputOnly: z.literal(true), stateInjection: z.literal(false),
  actions: z.array(z.object({ type: z.enum(['tap', 'trusted-touch-press']), selector: Text, action: z.string().optional(), heldMs: z.number().finite().optional() }).passthrough()),
  frames: z.array(FeelStateFrameSchema), screenshots: z.array(ScreenshotBindingSchema),
  checks: z.array(BrowserCheckSchema), errors: z.array(z.string()), passed: z.boolean(),
  terminal: z.object({ state: z.object({ phase: Text, level: z.number().int(), reason: z.string(), events: z.array(z.object({ type: Text }).passthrough()) }).passthrough() }).passthrough(),
  replay: z.object({ state: z.object({ phase: Text, level: z.number().int(), distance: z.number().finite() }).passthrough() }).passthrough(),
  video: ScreenshotBindingSchema,
}).passthrough();
const RiskEpisodeSchema = z.object({
  barrierId: Text, goldFishId: Text, hudSeen: z.boolean(),
  jump: z.object({ countdown: z.number(), actionIndex: z.number().int().nonnegative() }).passthrough().optional(),
  holdComplete: z.boolean(), holdDurationMs: z.number().nullable().optional(),
  barrierClearSnapshotId: Text.nullable(), bonusFishCatchSnapshotId: Text.nullable(), screenshots: z.array(Text),
}).passthrough();
const RiskReportSchema = z.object({
  schemaVersion: z.literal(1), targetGame: z.literal(GAME), workspace: z.literal(WORKSPACE),
  buildHash: SHA256, attempt: z.number().int().positive(), engine: z.enum(['webkit', 'chromium']),
  normalInputOnly: z.literal(true), stateInjection: z.literal(false), passed: z.boolean(),
  checks: z.array(BrowserCheckSchema),
  actions: z.array(z.object({ type: z.literal('touch-tap'), selector: Text, levelId: z.number().int().positive(), targetBarrierId: Text.nullable(), trustedTouch: z.boolean() }).passthrough()),
  screenshots: z.array(ScreenshotBindingSchema).min(1),
  snapshots: z.array(z.object({ id: Text, levelId: z.number().int().positive(), targetBarrierId: Text.nullable(), label: Text, value: z.object({ events: z.array(z.record(z.string(), z.unknown())).optional() }).passthrough() }).passthrough()),
  levels: z.array(z.object({
    id: z.number().int().positive(), targetEpisodes: z.array(RiskEpisodeSchema),
    terminal: z.object({ phase: z.string(), reason: z.string(), level: z.number(), jumpedBarriers: z.number(), save: z.object({ completed: z.array(z.boolean()), best: z.array(z.record(z.string(), z.unknown())) }).passthrough() }).passthrough(),
  }).passthrough()),
  videos: z.array(z.object({ levelId: z.number().int().positive(), path: Text, sha256: SHA256 }).passthrough()),
  errors: z.array(z.unknown()),
}).passthrough();
const CommonBrowserReportSchema = z.object({
  targetGame: z.literal(GAME),
  workspace: z.literal(WORKSPACE),
  buildHash: SHA256,
  passed: z.boolean(),
  checks: z.array(BrowserCheckSchema).optional(),
  errors: z.array(z.string()).optional(),
  normalInputOnly: z.boolean().optional(),
  stateInjection: z.boolean().optional(),
  attempt: z.number().int().positive().optional(),
  mode: z.string().optional(),
  engine: z.enum(['webkit', 'chromium']).optional(),
  screenshots: z.array(ScreenshotBindingSchema).optional(),
}).passthrough();
const BuildReceiptSchema = z.object({
  attempt: z.number().int().positive(),
  route: z.literal('formal-fixer'),
  buildHash: SHA256,
  baselineCommit: z.literal(BASE),
  workspace: z.literal(WORKSPACE),
  buildExit: z.literal(0),
  threadId: Text,
  at: z.string().datetime(),
}).passthrough();
const EvidenceManifestSchema = z.object({
  schemaVersion: z.literal(1),
  targetGame: z.literal(GAME),
  targetRunId: z.literal(RUN_ID),
  workspace: z.literal(WORKSPACE),
  attempt: z.number().int().positive(),
  buildHash: SHA256,
  createdAt: z.string().datetime(),
  reports: z.array(z.object({ kind: Text, engine: z.string().nullable(), path: Text, sha256: SHA256, status: z.enum(['PASS', 'BLOCKED', 'FAIL']) }).strict()),
  naturalTraces: z.array(z.object({ kind: Text, path: Text, sha256: SHA256, status: z.enum(['PASS', 'BLOCKED', 'FAIL']) }).strict()),
  screenshots: z.array(z.object({ path: Text, sha256: SHA256, sourceReport: Text }).strict()),
  copyFiles: z.array(z.object({ kind: Text, path: Text, sha256: SHA256 }).strict()),
}).strict();

const normalizeRelative = (value) => {
  const normalized = String(value ?? '').replaceAll('\\', '/').trim();
  if (!normalized || path.posix.isAbsolute(normalized) || path.win32.isAbsolute(normalized) || normalized.split('/').some((part) => part === '..') || /^(?:[a-z]+:)?\/\//iu.test(normalized)) {
    throw new Error(`Unsafe run-relative path: ${value}`);
  }
  return normalized;
};

async function readRunBytes(relative) {
  const normalized = normalizeRelative(relative);
  const root = path.resolve(RUN);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Run root is not a regular directory');
  let current = root;
  for (const component of normalized.split('/')) {
    current = path.join(current, component);
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) throw new Error(`Symlink evidence is forbidden: ${normalized}`);
  }
  const stat = await lstat(current);
  if (!stat.isFile()) throw new Error(`Evidence is not a regular file: ${normalized}`);
  return readFile(current);
}

async function readRunJson(relative) {
  return JSON.parse((await readRunBytes(relative)).toString('utf8'));
}

async function tryRunJson(relative) {
  try {
    const bytes = await readRunBytes(relative);
    return { value: JSON.parse(bytes.toString('utf8')), sha256: sha(bytes), error: null };
  } catch (error) {
    return { value: null, sha256: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function unique(values) { return [...new Set(values)]; }
function checkStatus(report, name) { return report?.checks?.find((item) => item.name === name)?.passed === true; }
function viewportKey(viewport) { return `${viewport?.width}x${viewport?.height}`; }
function reportBaseBlockers(report, attempt, buildHash, {
  requireNormalInput = true,
  allowUnspecifiedStateInjection = false,
  requireReportedPass = true,
  requireChecksPass = true,
} = {}) {
  const parsed = CommonBrowserReportSchema.safeParse(report);
  if (!parsed.success) return ['report-schema-invalid'];
  const value = parsed.data;
  const blockers = [];
  if (value.buildHash !== buildHash) blockers.push('build-hash-mismatch');
  if (value.attempt !== undefined && value.attempt !== attempt) blockers.push('attempt-mismatch');
  if (requireNormalInput && value.normalInputOnly !== true) blockers.push('normal-input-provenance-missing');
  if (value.stateInjection !== false && !(allowUnspecifiedStateInjection && value.stateInjection === undefined)) blockers.push('state-injection-not-explicitly-false');
  if (value.errors?.length) blockers.push('browser-errors-present');
  if (requireReportedPass && value.passed !== true) blockers.push('raw-report-not-passed');
  if (requireChecksPass && value.checks && (value.checks.length === 0 || value.checks.some((check) => check.passed !== true))) blockers.push('raw-check-failed');
  return blockers;
}

const screenshotRefs = (report) => {
  const bindings = [];
  if (Array.isArray(report?.screenshots)) bindings.push(...report.screenshots);
  for (const row of report?.reports ?? []) if (Array.isArray(row.screenshots)) bindings.push(...row.screenshots);
  return bindings;
};

async function verifyBindings(bindings, attempt, sourceReport) {
  const failures = [];
  const verified = [];
  for (const raw of bindings) {
    const parsed = ScreenshotBindingSchema.safeParse(raw);
    if (!parsed.success) { failures.push(`${sourceReport}:invalid-evidence-binding`); continue; }
    const item = parsed.data;
    const expectedPrefix = `attempts/attempt-${attempt}/`;
    if (!item.path.startsWith(expectedPrefix)) { failures.push(`${sourceReport}:evidence-outside-current-attempt:${item.path}`); continue; }
    try {
      const bytes = await readRunBytes(item.path);
      if (sha(bytes) !== item.sha256) failures.push(`${sourceReport}:evidence-hash-mismatch:${item.path}`);
      else verified.push({ path: item.path, sha256: item.sha256, sourceReport });
    } catch {
      failures.push(`${sourceReport}:evidence-missing:${item.path}`);
    }
  }
  if (bindings.length === 0) failures.push(`${sourceReport}:screenshots-missing`);
  return { failures, verified };
}

function feelStateSemanticBlockers(report, expected) {
  const blockers = [];
  const prefix = 'attempts/attempt-' + expected.attempt + '/feel-state-' + expected.engine + '/';
  const exactChecks = expected.requiredChecks;
  if (report.targetGame !== expected.game || report.workspace !== expected.workspace || report.engine !== expected.engine) blockers.push('feel-state-target-or-engine-mismatch');
  if (report.buildHash !== expected.buildHash) blockers.push('feel-state-build-hash-mismatch');
  if (report.normalInputOnly !== true || report.stateInjection !== false) blockers.push('feel-state-normal-input-provenance-invalid');
  if (report.passed !== true || !Array.isArray(report.errors) || report.errors.length !== 0) blockers.push('feel-state-report-failed-or-has-errors');
  const checks = Array.isArray(report.checks) ? report.checks : [];
  const checkNames = checks.map((item) => item?.name);
  if (checks.length !== exactChecks.length || new Set(checkNames).size !== exactChecks.length || exactChecks.some((name) => !checks.some((item) => item?.name === name && item.passed === true))) blockers.push('feel-state-required-check-set-incomplete-or-failed');

  const expectedActions = [
    { type: 'tap', selector: '#co-start' },
    { type: 'trusted-touch-press', selector: '[data-action="right"]', action: 'right' },
    { type: 'trusted-touch-press', selector: '[data-action="left"]', action: 'left' },
    { type: 'trusted-touch-press', selector: '[data-action="right"]', action: 'right' },
    { type: 'trusted-touch-press', selector: '[data-action="left"]', action: 'left' },
    { type: 'trusted-touch-press', selector: '[data-action="jump"]', action: 'jump' },
    { type: 'trusted-touch-press', selector: '[data-action="right"]', action: 'right' },
    { type: 'trusted-touch-press', selector: '[data-action="left"]', action: 'left' },
    { type: 'tap', selector: '#co-replay' },
  ];
  const actions = Array.isArray(report.actions) ? report.actions : [];
  if (actions.length !== expectedActions.length || expectedActions.some((expectedAction, index) => {
    const action = actions[index];
    return !action || action.type !== expectedAction.type || action.selector !== expectedAction.selector
      || (expectedAction.action !== undefined && (action.action !== expectedAction.action || action.heldMs !== 90));
  })) blockers.push('feel-state-actions-are-not-the-recorded-normal-touch-sequence');

  const expectedMs = expected.plannedMs;
  const frames = Array.isArray(report.frames) ? report.frames : [];
  if (frames.length !== expectedMs.length || frames.some((frame, index) => frame?.plannedMs !== expectedMs[index] || !Number.isFinite(frame?.completedMs) || frame.completedMs < frame.plannedMs)) blockers.push('feel-state-six-frame-schedule-incomplete');
  const validCamera = (camera) => Array.isArray(camera?.position) && camera.position.length === 3
    && Array.isArray(camera?.quaternion) && camera.quaternion.length === 4
    && [...camera.position, ...camera.quaternion, camera.fov].every(Number.isFinite);
  if (frames.length !== expectedMs.length || frames.some((frame) => frame?.before?.state?.phase !== 'running' || frame?.after?.state?.phase !== 'running'
      || frame.before.state.level !== 1 || frame.after.state.level !== 1
      || !Number.isFinite(frame.before.state.distance) || !Number.isFinite(frame.after.state.distance) || frame.after.state.distance <= frame.before.state.distance
      || !validCamera(frame.before.render?.camera) || !validCamera(frame.after.render?.camera))) blockers.push('feel-state-running-brackets-or-actual-camera-invalid');
  blockers.push(...feelStatePoseBlockers(report));

  const expectedNames = [...expectedMs.map((value) => 'state-' + value + '.png'), 'terminal.png', 'replay.png'];
  const bindings = Array.isArray(report.screenshots) ? report.screenshots : [];
  const bindingNames = bindings.map((item) => item?.path?.startsWith(prefix) ? item.path.slice(prefix.length) : null);
  if (bindings.length !== expectedNames.length || new Set(bindingNames).size !== expectedNames.length
      || expectedNames.some((name, index) => bindingNames[index] !== name)
      || bindings.some((item) => !/^[a-f0-9]{64}$/u.test(item?.sha256 ?? ''))) blockers.push('feel-state-screenshot-set-or-path-invalid');
  if (frames.length === expectedMs.length && bindings.length === expectedNames.length && frames.some((frame, index) => frame.image?.path !== bindings[index]?.path || frame.image?.sha256 !== bindings[index]?.sha256)) blockers.push('feel-state-frame-screenshot-binding-mismatch');
  if (!/^[a-f0-9]{64}$/u.test(report.driverSha256 ?? '')) blockers.push('feel-state-driver-hash-invalid');
  if (report.video?.path !== undefined && (!report.video.path.startsWith(prefix) || !/^page@[a-f0-9]{32}\.webm$/u.test(report.video.path.slice(prefix.length)) || !/^[a-f0-9]{64}$/u.test(report.video.sha256 ?? ''))) blockers.push('feel-state-video-binding-invalid');
  if (!report.video?.path) blockers.push('feel-state-video-binding-missing');
  if (report.terminal?.state?.phase !== 'finished' || report.terminal.state.level !== 1 || report.terminal.state.reason !== 'barrier'
      || !report.terminal.state.events?.some((event) => event.type === 'failed' && event.reason === 'barrier' && event.kind === 'barrier' && typeof event.objectId === 'string')) blockers.push('feel-state-real-barrier-terminal-missing');
  if (report.replay?.state?.phase !== 'running' || report.replay.state.level !== 1 || !Number.isFinite(report.replay.state.distance)
      || !actions.some((action) => action.type === 'tap' && action.selector === '#co-replay')) blockers.push('feel-state-real-level-one-replay-missing');
  return [...new Set(blockers)];
}

function feelStatePoseBlockers(report) {
  const blockers = [];
  const frames = Array.isArray(report?.frames) ? report.frames : [];
  const poses = frames.flatMap((frame) => [frame?.before?.render?.pose, frame?.after?.render?.pose]);
  const isFiniteArray = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite);
  const validPose = (pose) => pose && pose.requested
    && ['lean', 'steer', 'yaw'].every((key) => Number.isFinite(pose.requested[key]))
    && isFiniteArray(pose.riderRotation, 3)
    && isFiniteArray(pose.frontSteeringMatrix, 16)
    && isFiniteArray(pose.headRotation, 3)
    && isFiniteArray(pose.bodyRotation, 3);
  if (frames.length !== 6 || poses.length !== 12 || poses.some((pose) => !validPose(pose))) blockers.push('feel-state-native-pose-shape-or-finite-channels-invalid');

  const validPoses = poses.filter(validPose);
  if (validPoses.length === 12 && validPoses.some((pose) => Math.abs(pose.riderRotation[0] - pose.requested.lean) > 1e-6
      || Math.abs(pose.riderRotation[1] - pose.requested.yaw) > 1e-6)) blockers.push('feel-state-native-rider-bank-heading-disconnected');
  const steeringAngle = (pose) => Math.acos(Math.max(-1, Math.min(1,
    (pose.frontSteeringMatrix[0] + pose.frontSteeringMatrix[5] + pose.frontSteeringMatrix[10] - 1) / 2)));
  if (validPoses.length === 12 && validPoses.some((pose) => Math.abs(steeringAngle(pose) - Math.abs(pose.requested.steer)) > 1e-6)) blockers.push('feel-state-native-steering-matrix-disconnected');
  const peakNativeSteer = Math.max(0, ...validPoses.map(steeringAngle));
  const peakNativeBank = Math.max(0, ...validPoses.map((pose) => Math.abs(pose.riderRotation[0])));
  if (peakNativeSteer <= 0.05 || peakNativeBank <= 0.02) blockers.push('feel-state-native-steering-or-bank-motion-below-threshold');
  return blockers;
}

const feelStateEvidenceFiles = [];
const requireFeelState = async (rawReport, engine, attempt, buildHash) => {
  const parsed = FeelStateReportSchema.safeParse(rawReport);
  if (!parsed.success) return { blockers: ['feel-state-report-schema-invalid'] };
  const report = parsed.data;
  const blockers = feelStateSemanticBlockers(report, {
    game: GAME, workspace: WORKSPACE, engine, buildHash, attempt,
    requiredChecks: FEEL_STATE_CHECKS, plannedMs: FEEL_STATE_FRAME_MS,
  });
  const prefix = `attempts/attempt-${attempt}/feel-state-${engine}/`;
  const driverPath = `${prefix}driver-source.mjs`;
  let driverBytes = null;
  try { driverBytes = await readRunBytes(driverPath); }
  catch { blockers.push('feel-state-driver-source-missing'); }
  if (driverBytes && sha(driverBytes) !== report.driverSha256) blockers.push('feel-state-driver-source-hash-mismatch');
  if (driverBytes) {
    const source = driverBytes.toString('utf8');
    if (!source.includes('window.__coast.snapshot()') || !source.includes('window.__coast.renderInfo()') || !source.includes('Input.dispatchTouchEvent')) blockers.push('feel-state-driver-does-not-capture-read-only-runtime-and-trusted-touch');
  }
  for (const binding of report.screenshots) {
    try { if (sha(await readRunBytes(binding.path)) !== binding.sha256) blockers.push(`feel-state-screenshot-hash-mismatch:${binding.path}`); }
    catch { blockers.push(`feel-state-screenshot-missing:${binding.path}`); }
  }
  try { if (sha(await readRunBytes(report.video.path)) !== report.video.sha256) blockers.push('feel-state-video-hash-mismatch'); }
  catch { blockers.push('feel-state-video-missing'); }
  if (blockers.length === 0) {
    feelStateEvidenceFiles.push({ kind: `feel-state-driver:${engine}`, path: driverPath, sha256: report.driverSha256 });
    feelStateEvidenceFiles.push(...report.screenshots.map((item) => ({ kind: `feel-state-screenshot:${engine}`, path: item.path, sha256: item.sha256 })));
    feelStateEvidenceFiles.push({ kind: `feel-state-video:${engine}`, path: report.video.path, sha256: report.video.sha256 });
  }
  return { blockers: [...new Set(blockers)] };
};

const matrixPaths = [
  { triage: 'triage.json', matrix: 'reproduction-matrix.json' },
  { triage: 'triage-v3.json', matrix: 'reproduction-matrix-v3.json' },
  { triage: 'head-triage-v3.json', matrix: 'head-reproduction-matrix-v3.json' },
  { triage: 'reward-trail-and-ci-triage-v3.json', matrix: 'reward-trail-and-ci-reproduction-matrix-v3.json' },
  { triage: 'clipped-route-touch-triage-v3.json', matrix: 'clipped-route-touch-reproduction-matrix-v3.json' },
];

const { ProductExperienceContractSchema, PerceptualQaReportSchema, PerceptualQaGateSchema } = await tsImport('../../../src/schemas/product-experience.ts', import.meta.url);
const { verifyPerceptualQaReview } = await tsImport('../../../src/core/product-experience-qa.ts', import.meta.url);
const { NaturalFlowEvidenceSchema } = await tsImport('../../../src/schemas/natural-flow.ts', import.meta.url);
const { RuntimeProductGateSchema, deriveRuntimeProductGate, verifyRuntimeWiredFiles } = await tsImport('../../../src/core/runtime-product-gates.ts', import.meta.url);
const { ExperienceComplaintTriageSchema, ExperienceReproductionMatrixSchema } = await tsImport('../../../src/schemas/experience-complaint.ts', import.meta.url);
const { QaReportSchema, BuildReportSchema } = await tsImport('../../../src/schemas/index.ts', import.meta.url);

const receiptRaw = await readRunJson('build-receipt.json');
const receipt = BuildReceiptSchema.parse(receiptRaw);
if (receipt.workspace !== WORKSPACE) throw new Error('Build receipt does not target the exact Pelican workspace');
const attempt = receipt.attempt;
const attemptRoot = `attempts/attempt-${attempt}`;
const htmlPath = path.join(WORKSPACE, 'game/index.html');
let htmlBytes;
try { htmlBytes = await readFile(htmlPath); } catch { htmlBytes = null; }
const htmlHash = htmlBytes ? createHash('sha256').update(htmlBytes).digest('hex') : null;
const preflightBlockers = [];
if (!htmlBytes) preflightBlockers.push('workspace/game/index.html is missing');
else if (htmlHash !== receipt.buildHash) preflightBlockers.push('workspace/game/index.html does not match build-receipt.json');

const reports = [];
const screenshots = [];
const addFixedReport = async ({ kind, engine = null, relative, validate = () => [], basePolicy = {} }) => {
  const loaded = await tryRunJson(relative);
  let blockers = [];
  let classification = null;
  let classifiedStatus = null;
  if (!loaded.value) blockers = [`report-missing-or-invalid:${loaded.error}`];
  else {
    const baseBlockers = reportBaseBlockers(loaded.value, attempt, receipt.buildHash, basePolicy);
    const validation = await validate(loaded.value);
    const validationBlockers = Array.isArray(validation) ? validation : (validation?.blockers ?? []);
    blockers = [...baseBlockers, ...validationBlockers];
    if (!Array.isArray(validation)) {
      classification = validation?.classification ?? null;
      classifiedStatus = validation?.status ?? null;
    }
    const bindings = await verifyBindings(screenshotRefs(loaded.value), attempt, relative);
    blockers.push(...bindings.failures);
    screenshots.push(...bindings.verified);
  }
  const status = !loaded.value ? 'BLOCKED'
    : blockers.length === 0 ? 'PASS'
      : classifiedStatus === 'BLOCKED' && !blockers.some((item) => !String(item).startsWith('environment-background-check-unavailable:')) ? 'BLOCKED'
        : 'FAIL';
  reports.push({ kind, engine, path: relative, sha256: loaded.sha256 ?? '0'.repeat(64), status, blockers: unique(blockers), classification, value: loaded.value });
};

const requireCampaign = (report) => {
  const blockers = [];
  if (report.mode !== 'campaign') blockers.push('campaign-mode-mismatch');
  const completed = report.levels?.filter((level) => level?.phase === 'finished' && level?.reason === 'complete') ?? [];
  if (completed.length !== 5 || new Set(completed.map((level) => level.level)).size !== 5) blockers.push('five-natural-level-settlements-missing');
  for (let level = 1; level <= 5; level++) if (!checkStatus(report, `natural-level-${level}`)) blockers.push(`level-${level}-natural-completion-not-passed`);
  for (const name of ['locked-new-save', 'first-seconds-objective-and-fish', 'refresh-keeps-five-unlocked', 'in-memory-replay']) if (!checkStatus(report, name)) blockers.push(`required-check-failed:${name}`);
  return blockers;
};
const requireCollision = (report) => {
  const blockers = [];
  if (report.mode !== 'collisions') blockers.push('collision-mode-mismatch');
  for (const name of [
    'accident-visible-before-settlement', 'car-ends-round', 'crash-freezes-score',
    'failure-replay-without-navigation', 'pedestrian-stops-but-countdown-runs',
    'pedestrian-recovers-once', 'visible-barrier-jump-clears', 'one-touch-one-lane',
  ]) if (!checkStatus(report, name)) blockers.push(`required-check-failed:${name}`);
  return blockers;
};
const experienceChecks = [
  'first-catch-under-three-seconds', 'mastery-target-visible-before-first-obstacle',
  'trusted-right-swipe-one-lane', 'trusted-left-swipe-one-lane',
  'cancelled-touch-does-not-turn', 'trusted-up-swipe-jumps',
  'early-jump-buffer-visible', 'buffered-jump-clears-exact-target',
  'safe-lane-change-cancels-buffer-without-fake-mastery',
  'small-phone-start-visible-and-menu-not-overflow', 'small-phone-touch-buttons-and-mastery-readable',
  'jump-gold-route-signalled-with-safe-detour', 'left-pedestrian-warns-right-at-least-two-seconds',
  'right-pedestrian-warns-left-at-least-two-seconds', 'natural-jump-gold-advances-mastery',
  'natural-three-star-settlement', 'both-crossing-directions-observed',
  'safe-detour-does-not-require-jump', 'mastery-saved-and-visible-on-route',
  'earned-jump-prize-has-visible-route-cue',
];
const requireExperience = (report) => experienceChecks.filter((name) => !checkStatus(report, name)).map((name) => `required-check-failed:${name}`);
const requireHead = (report) => {
  const blockers = [];
  const rows = report.reports ?? [];
  const required = new Map([['390x844', 'mobile-portrait'], ['360x740', 'small-mobile'], ['320x568', 'compact-mobile'], ['844x390', 'mobile-landscape']]);
  const found = new Set(rows.map((row) => viewportKey(row.viewport)));
  for (const viewport of required.keys()) if (!found.has(viewport)) blockers.push(`head-viewport-missing:${viewport}`);
  if (rows.length !== 4 || found.size !== 4) blockers.push('head-viewport-set-incomplete-or-duplicated');
  const requiredChecks = [
    'native-head-visible-after-catch', 'explicit-pause-freezes-clock', 'default-natural-terminal',
    'unintegrated-ad-never-grants-fake-reward', 'exact-head-object-observed-during-natural-pedestrian-stop',
    'natural-pedestrian-recovery',
  ];
  for (const row of rows) {
    const key = viewportKey(row.viewport);
    if (row.errors?.length) blockers.push(`head-browser-errors:${key}`);
    const byName = new Map((row.checks ?? []).map((check) => [check.name, check]));
    if (byName.size !== (row.checks ?? []).length) blockers.push(`head-check-duplicated:${key}`);
    for (const name of requiredChecks) {
      if (byName.get(name)?.passed !== true) blockers.push(`head-check-failed:${key}:${name}`);
    }
    const pixelEvidence = byName.get('native-head-visible-after-catch')?.evidence;
    if (!pixelEvidence || pixelEvidence.white < 200 || pixelEvidence.helmet < 16 || JSON.stringify(pixelEvidence.region) !== JSON.stringify([0.46, 0.6, 0.54, 0.675])) blockers.push(`native-head-pixels-below-contract:${key}`);
    const terminal = byName.get('default-natural-terminal')?.evidence;
    if (terminal?.reason !== 'barrier') blockers.push(`head-natural-barrier-terminal-missing:${key}`);
    const adEvidence = byName.get('unintegrated-ad-never-grants-fake-reward')?.evidence;
    if (!adEvidence?.adBefore || JSON.stringify(adEvidence.adBefore) !== JSON.stringify(adEvidence.adAfter)) blockers.push(`head-ad-no-fake-reward-evidence-invalid:${key}`);
    const stopEvidence = byName.get('exact-head-object-observed-during-natural-pedestrian-stop')?.evidence;
    if (!stopEvidence?.hit || !stopEvidence?.held || !(stopEvidence.held.stun > 0) || stopEvidence.held.distance !== stopEvidence.hit.distance || !(stopEvidence.held.elapsed > stopEvidence.hit.elapsed + 0.9)) blockers.push(`head-natural-pedestrian-stop-evidence-invalid:${key}`);
    const recoveryEvidence = byName.get('natural-pedestrian-recovery')?.evidence;
    if (recoveryEvidence?.phase !== 'running' || !recoveryEvidence.events?.some((event) => event.type === 'recovered')) blockers.push(`head-natural-pedestrian-recovery-evidence-invalid:${key}`);
  }
  return blockers;
};
let visualEvidenceClassification = null;
const requireVisual = (report) => {
  const blockers = [];
  if (report.comparisonFixtureOnly !== true || !/webkit/iu.test(report.runtime ?? '')) blockers.push('visual-runtime-provenance-invalid');
  const rows = report.reports ?? [];
  const required = new Set(['390x844', '360x740', '320x568', '844x390']);
  const found = new Set(rows.map((row) => viewportKey(row.viewport)));
  for (const viewport of required) if (!found.has(viewport)) blockers.push(`visual-viewport-missing:${viewport}`);
  if (rows.length !== 4 || found.size !== 4) blockers.push('visual-viewport-set-incomplete-or-duplicated');
  visualEvidenceClassification = [];
  for (const row of rows) {
    const key = viewportKey(row.viewport);
    if (row.errors?.length) blockers.push(`visual-browser-errors:${key}`);
    for (const [name, passed] of Object.entries(row.checks ?? {})) if (passed !== true) blockers.push(`visual-check-failed:${key}:${name}`);
    const names = ['menu', 'same-pose', 'first-fish', 'running', 'paused', 'resumed', 'terminal', 'replay'];
    const bindings = row.screenshots ?? [];
    const screenshotFor = (name) => bindings.find((item) => path.posix.basename(item.path ?? '').replace(/\.png$/u, '') === `${row.viewport?.width}-${name}`);
    const bindScreenshot = (name) => {
      const item = screenshotFor(name);
      return item ? { path: item.path, sha256: item.sha256 } : null;
    };
    for (const name of names) if (!screenshotFor(name)) blockers.push(`visual-screenshot-missing:${key}:${name}`);
    if (row.terminal?.reason !== 'barrier' || row.checks?.naturalBarrierFailure !== true) blockers.push(`visual-natural-terminal-unbound:${key}`);
    if (row.checks?.replayKeepsCamera !== true) blockers.push(`visual-natural-replay-unbound:${key}`);
    visualEvidenceClassification.push({
      viewport: row.viewport,
      fixtureComparisonOnly: [bindScreenshot('same-pose')].filter(Boolean),
      naturalJourney: ['menu', 'first-fish', 'running', 'paused', 'resumed', 'terminal', 'replay'].map(bindScreenshot).filter(Boolean),
      naturalTerminal: { reason: row.terminal?.reason ?? null, screenshot: bindScreenshot('terminal') },
      naturalReplay: { keepsCamera: row.checks?.replayKeepsCamera === true, screenshot: bindScreenshot('replay') },
    });
  }
  return blockers;
};
const requireLifecycle = (report) => {
  const blockers = [];
  const required = [
    'portrait-to-landscape-live-resize', 'all-quality-presets-keep-composer-size',
    'offline-single-html-normal-touch-catch', 'engineering-context-loss-pauses',
    'engineering-context-restored-manual-resume',
  ];
  for (const name of required) if (!checkStatus(report, name)) blockers.push(`required-check-failed:${name}`);
  if (report.physicalIPhone !== 'NOT_RUN') blockers.push('physical-device-status-is-not-honest');
  const diagnosticNames = new Set((report.diagnostics ?? []).map((item) => item.name));
  for (const name of ['headless-webkit-tab-capability', 'headed-chromium-tab', 'actual-window-minimize']) if (!diagnosticNames.has(name)) blockers.push(`lifecycle-diagnostic-missing:${name}`);
  const background = ['actual-window-background-pauses', 'background-countdown-stays-paused', 'background-requires-manual-resume'];
  const allBackgroundPassed = background.every((name) => checkStatus(report, name));
  const diag = report.diagnostics?.find((item) => item.name === 'actual-window-minimize');
  const away = diag?.observation?.away;
  const hasSignal = Array.isArray(away?.events) && away.events.some((event) => event.type === 'blur' || event.type === 'pagehide' || event.hidden === true);
  const backgroundBlocked = !allBackgroundPassed && !hasSignal && background.every((name) => report.checks?.some((check) => check.name === name));
  if (!allBackgroundPassed && !backgroundBlocked) blockers.push('actual-background-check-failed-without-environmental-block-evidence');
  if (report.errors?.length) blockers.push('lifecycle-browser-errors-present');
  return { blockers, backgroundBlocked, allBackgroundPassed };
};

const safetyChecks = [
  'van-target-distance-reached', 'van-ends-round', 'car-not-jumpable',
  'distance-and-fish-jointly-required', 'tab-blur-pauses', 'background-manual-resume',
  'replay-resources-plateau',
];
const safetyBackgroundChecks = new Set(['tab-blur-pauses', 'background-manual-resume']);
const RISK_TARGETS = [
  { level: 1, barrierIds: ['l1-o1', 'l1-o3'] },
  { level: 2, barrierIds: ['l2-o3', 'l2-o5'] },
  { level: 3, barrierIds: ['l3-o3', 'l3-o5'] },
  { level: 4, barrierIds: ['l4-o3', 'l4-o5', 'l4-o10'] },
  { level: 5, barrierIds: ['l5-o3', 'l5-o5', 'l5-o10'] },
];
const RISK_TARGET_COUNT = RISK_TARGETS.reduce((count, level) => count + level.barrierIds.length, 0);
const noSignalDiagnostic = (lifecycle, engine) => {
  const diagnosticName = engine === 'webkit' ? 'headless-webkit-tab-capability' : 'headless-chromium-tab-capability';
  const diagnostic = lifecycle?.diagnostics?.find((item) => item.name === diagnosticName);
  const away = diagnostic?.observation?.away;
  const events = away?.events;
  const signals = Array.isArray(events) && events.some((event) => event.type === 'blur' || event.type === 'pagehide' || event.hidden === true);
  const noPause = away?.state?.phase !== 'paused' && away?.state?.pausedBySystem !== true;
  const visible = away?.visibility !== 'hidden' && (!Array.isArray(events) || events.every((event) => event.hidden !== true));
  const classified = diagnostic?.classification === 'NO_BACKGROUND_SIGNAL_FROM_HEADLESS_TABS';
  return {
    diagnosticName,
    path: `${attemptRoot}/lifecycle/report.json`,
    passed: Boolean(diagnostic && Array.isArray(events) && events.length === 0 && !signals && noPause && visible && classified),
    classification: diagnostic?.classification ?? null,
  };
};
const requireSafety = (report, engine, lifecycle) => {
  const blockers = [];
  if (report.mode !== 'safety') blockers.push('safety-mode-mismatch');
  if (report.engine && report.engine !== engine) blockers.push('safety-engine-mismatch');
  const byName = new Map((report.checks ?? []).map((check) => [check.name, check]));
  if (byName.size !== (report.checks ?? []).length) blockers.push('safety-check-duplicated');
  for (const name of safetyChecks) if (!byName.has(name)) blockers.push(`safety-check-missing:${name}`);
  const failed = [...byName.values()].filter((check) => check.passed !== true);
  const failedBackground = failed.filter((check) => safetyBackgroundChecks.has(check.name));
  const unsupported = noSignalDiagnostic(lifecycle, engine);
  const failedOutsideAllowed = failed.filter((check) => !safetyBackgroundChecks.has(check.name));
  for (const check of failedOutsideAllowed) blockers.push(`required-check-failed:${check.name}`);
  const environmentBlockers = [];
  if (failedBackground.length && unsupported.passed) {
    for (const check of failedBackground) environmentBlockers.push(`environment-background-check-unavailable:${check.name}`);
  } else {
    for (const check of failedBackground) blockers.push(`background-check-failed-without-environment-capability-evidence:${check.name}`);
  }
  const status = blockers.length ? 'FAIL' : environmentBlockers.length ? 'BLOCKED' : 'PASS';
  return {
    blockers: [...blockers, ...environmentBlockers],
    status,
    classification: {
      supportedChecksPassed: blockers.length === 0,
      environmentBlockedChecks: failedBackground.map((check) => check.name),
      environmentalEvidence: failedBackground.length && unsupported.passed ? unsupported : null,
      checkResults: safetyChecks.map((name) => ({ name, status: byName.get(name)?.passed === true ? 'PASS' : environmentBlockers.includes(`environment-background-check-unavailable:${name}`) ? 'BLOCKED' : 'FAIL' })),
    },
  };
};
const riskCheckNames = (level, barrierId) => {
  const prefix = `level-${level}-${barrierId}`;
  return [
    `${prefix}-visible-jump-reward-route`, `${prefix}-one-jump-at-decimal-window`,
    `${prefix}-no-repeat-jump`, `${prefix}-exact-barrier-cleared-jumped`,
    `${prefix}-exact-golden-bonus-fish-maps-to-barrier`, `${prefix}-gold-feedback-visible-in-hud`,
    `${prefix}-held-route-through-bonus-fish`,
  ];
};
const riskCheck = (byName, blockers, name) => {
  const item = byName.get(name);
  if (!item || item.passed !== true) blockers.push(`required-risk-check-failed:${name}`);
  return item;
};
const requireRisk = async (rawReport, engine) => {
  const blockers = [];
  const parsed = RiskReportSchema.safeParse(rawReport);
  if (!parsed.success) return { blockers: ['risk-report-schema-invalid'] };
  const report = parsed.data;
  if (report.engine !== engine) blockers.push('risk-engine-mismatch');
  if (report.passed !== true || report.errors.length > 0) blockers.push('risk-report-not-passed-or-has-errors');
  if (report.checks.some((check) => check.passed !== true)) blockers.push('risk-raw-check-failed');
  const byName = new Map(report.checks.map((check) => [check.name, check]));
  if (byName.size !== report.checks.length) blockers.push('risk-check-duplicated');
  const snapshots = new Map(report.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const levelById = new Map(report.levels.map((level) => [level.id, level]));
  if (report.levels.length !== 5 || levelById.size !== 5 || [1, 2, 3, 4, 5].some((level) => !levelById.has(level))) blockers.push('risk-five-level-report-set-incomplete');
  const barrierEvidence = [];
  for (const spec of RISK_TARGETS) {
    const level = levelById.get(spec.level);
    if (!level || level.targetEpisodes.length !== spec.barrierIds.length) {
      blockers.push(`risk-target-episode-count-mismatch:level-${spec.level}`);
      continue;
    }
    const episodeById = new Map(level.targetEpisodes.map((episode) => [episode.barrierId, episode]));
    if (episodeById.size !== spec.barrierIds.length || spec.barrierIds.some((id) => !episodeById.has(id))) blockers.push(`risk-target-barrier-set-mismatch:level-${spec.level}`);
    for (const barrierId of spec.barrierIds) {
      const fishId = `l${spec.level}-jump-${barrierId}`;
      const episode = episodeById.get(barrierId);
      if (!episode) continue;
      const names = riskCheckNames(spec.level, barrierId);
      const checks = names.map((name) => riskCheck(byName, blockers, name));
      const authoredName = `authored-level-${spec.level}-${barrierId}-exact-golden-fish`;
      const authored = riskCheck(byName, blockers, authoredName);
      const authoredEvidence = authored?.evidence;
      if (episode.goldFishId !== fishId || authoredEvidence?.barrierId !== barrierId || authoredEvidence?.expectedFishId !== fishId || authoredEvidence?.authoredFishId !== fishId || !String(authoredEvidence?.source ?? '').includes('sourceObstacleId -> fish.id')) {
        blockers.push(`risk-authored-golden-fish-association-invalid:${barrierId}`);
      }
      const barrierEvidenceValue = checks[3]?.evidence;
      const goldEvidenceValue = checks[4]?.evidence;
      const barrierEvent = barrierEvidenceValue?.event;
      const goldEvent = goldEvidenceValue?.event;
      if (barrierEvidenceValue?.barrierId !== barrierId || barrierEvent?.type !== 'barrier-cleared' || barrierEvent.objectId !== barrierId || barrierEvent.jumped !== true) blockers.push(`risk-real-barrier-event-invalid:${barrierId}`);
      if (goldEvidenceValue?.expectedBarrierId !== barrierId || goldEvidenceValue?.expectedObjectId !== fishId || goldEvidenceValue?.authoredFishId !== fishId || goldEvent?.type !== 'fish-caught' || goldEvent.objectId !== fishId || goldEvent.golden !== true || goldEvent.bonus !== true || !String(goldEvidenceValue?.associationSource ?? '').includes('sourceObstacleId -> fish.id')) {
        blockers.push(`risk-earned-golden-fish-event-invalid:${barrierId}`);
      }
      const barrierSnapshot = snapshots.get(episode.barrierClearSnapshotId);
      const fishSnapshot = snapshots.get(episode.bonusFishCatchSnapshotId);
      const barrierSnapshotEvent = barrierSnapshot?.value.events?.find((event) => event.type === 'barrier-cleared' && event.objectId === barrierId && event.jumped === true);
      const fishSnapshotEvent = fishSnapshot?.value.events?.find((event) => event.type === 'fish-caught' && event.objectId === fishId && event.golden === true && event.bonus === true);
      if (!barrierSnapshot || barrierSnapshot.levelId !== spec.level || barrierSnapshot.targetBarrierId !== barrierId || barrierSnapshot.label !== 'exact-barrier-cleared-event' || !barrierSnapshotEvent) blockers.push(`risk-barrier-snapshot-invalid:${barrierId}`);
      if (!fishSnapshot || fishSnapshot.levelId !== spec.level || fishSnapshot.targetBarrierId !== barrierId || fishSnapshot.label !== 'exact-golden-bonus-fish-caught' || !fishSnapshotEvent) blockers.push(`risk-golden-fish-snapshot-invalid:${barrierId}`);
      if (Number.isFinite(barrierEvent?.at) && Number.isFinite(goldEvent?.at) && goldEvent.at < barrierEvent.at) blockers.push(`risk-golden-fish-event-precedes-barrier:${barrierId}`);
      const jumpActionCount = report.actions.filter((action) => action.levelId === spec.level && action.targetBarrierId === barrierId && action.selector === '[data-action="jump"]').length;
      const indexedJump = Number.isInteger(episode.jump?.actionIndex) ? report.actions[episode.jump.actionIndex] : null;
      if (!episode.hudSeen || !episode.jump || !Number.isFinite(episode.jump.countdown) || episode.jump.countdown < 0 || episode.jump.countdown > 1.15 || jumpActionCount !== 1 || indexedJump?.selector !== '[data-action="jump"]' || indexedJump?.trustedTouch !== true || episode.holdComplete !== true || !(episode.holdDurationMs >= 2600)) blockers.push(`risk-natural-jump-input-or-2600ms-capture-invalid:${barrierId}`);
      const episodeShotPaths = new Set(Array.isArray(episode.screenshots) ? episode.screenshots : []);
      const reportShotPaths = new Set(report.screenshots.map((item) => item.path));
      for (const suffix of ['barrier-cleared.png', 'golden-bonus-fish-caught.png']) {
        const expectedSuffix = `-${barrierId}-${suffix}`;
        const found = [...episodeShotPaths].some((item) => item.endsWith(expectedSuffix) && reportShotPaths.has(item));
        if (!found) blockers.push(`risk-target-screenshot-missing:${barrierId}:${suffix}`);
      }
      barrierEvidence.push({
        level: spec.level, barrierId, goldFishId: fishId,
        checks: names, barrierSnapshotId: episode.barrierClearSnapshotId ?? null,
        goldFishSnapshotId: episode.bonusFishCatchSnapshotId ?? null,
        barrierEventObjectId: barrierEvent?.objectId ?? null, goldFishEventObjectId: goldEvent?.objectId ?? null,
        goldFishGolden: goldEvent?.golden === true, goldFishBonus: goldEvent?.bonus === true,
        naturalJumpPassed: checks.every((check) => check?.passed === true)
          && barrierEvidenceValue?.barrierId === barrierId && barrierEvent?.type === 'barrier-cleared' && barrierEvent.objectId === barrierId && barrierEvent.jumped === true
          && goldEvidenceValue?.expectedBarrierId === barrierId && goldEvidenceValue?.expectedObjectId === fishId && goldEvent?.type === 'fish-caught' && goldEvent.objectId === fishId && goldEvent.golden === true && goldEvent.bonus === true
          && Boolean(barrierSnapshotEvent && fishSnapshotEvent && episode.hudSeen && episode.jump && jumpActionCount === 1 && episode.holdComplete === true && episode.holdDurationMs >= 2600),
      });
    }
  }
  const settlements = [];
  for (const spec of RISK_TARGETS) {
    const level = levelById.get(spec.level);
    if (!level) continue;
    const terminal = level.terminal;
    const naturalName = `level-${spec.level}-natural-terminal-settlement`;
    const saveName = `level-${spec.level}-save-earned-through-play`;
    const jumpCountName = `level-${spec.level}-exact-target-jump-count`;
    riskCheck(byName, blockers, naturalName);
    riskCheck(byName, blockers, saveName);
    const jumpCountCheck = riskCheck(byName, blockers, jumpCountName);
    const earned = terminal.save.completed[spec.level - 1] === true && terminal.save.best[spec.level - 1]?.fish > 0;
    const completionEvent = terminal.events?.find((event) => event.type === 'complete' && event.reason === 'complete');
    if (terminal.phase !== 'finished' || terminal.reason !== 'complete' || terminal.level !== spec.level || !completionEvent || !earned || terminal.jumpedBarriers !== spec.barrierIds.length || jumpCountCheck?.evidence?.expected !== spec.barrierIds.length || jumpCountCheck?.evidence?.jumpedBarriers !== spec.barrierIds.length) blockers.push(`risk-real-earned-settlement-invalid:level-${spec.level}`);
    if (spec.level === 1 && !checkStatus(report, 'new-browser-starts-with-new-save')) blockers.push('risk-first-level-fresh-save-check-failed');
    if (spec.level > 1 && !checkStatus(report, `level-${spec.level}-prior-levels-earned`)) blockers.push(`risk-prior-save-progression-check-failed:level-${spec.level}`);
    settlements.push({ level: spec.level, status: terminal.phase === 'finished' && terminal.reason === 'complete' && Boolean(completionEvent) && earned ? 'PASS' : 'FAIL', completionEvent: Boolean(completionEvent), earnedSave: earned });
  }
  if (!checkStatus(report, 'five-level-natural-campaign-completed')) blockers.push('risk-five-level-natural-campaign-check-failed');
  const replayCheck = byName.get('final-settlement-and-reopen');
  const replaySnapshot = report.snapshots.find((snapshot) => snapshot.label === 'visible-final-replay');
  if (replayCheck?.passed !== true || replaySnapshot?.value.phase !== 'running' || replaySnapshot?.value.level !== 5 || replaySnapshot?.value.save?.completed?.[4] !== true) blockers.push('risk-earned-final-replay-not-observed');
  if (report.videos.length !== 5 || new Set(report.videos.map((video) => video.levelId)).size !== 5) blockers.push('risk-five-level-video-set-incomplete');
  for (const video of report.videos) {
    if (video.path !== `${attemptRoot}/risk-${engine}/level-${video.levelId}.webm`) blockers.push(`risk-video-path-not-current-attempt:${video.levelId}`);
    try {
      if (sha(await readRunBytes(video.path)) !== video.sha256) blockers.push(`risk-video-hash-mismatch:${video.levelId}`);
    } catch { blockers.push(`risk-video-missing:${video.levelId}`); }
  }
  return {
    blockers: unique(blockers),
    classification: {
      targetCount: RISK_TARGET_COUNT, targetsByLevel: RISK_TARGETS.map((item) => ({ level: item.level, count: item.barrierIds.length, barrierIds: item.barrierIds })),
      barrierEvidence, settlements, replayObserved: replayCheck?.passed === true && replaySnapshot?.value.phase === 'running',
    },
  };
};

for (const engine of ['webkit', 'chromium']) {
  await addFixedReport({ kind: 'campaign', engine, relative: `${attemptRoot}/qa-campaign-${engine}/report.json`, validate: requireCampaign });
  await addFixedReport({ kind: 'collision', engine, relative: `${attemptRoot}/qa-collisions-${engine}/report.json`, validate: requireCollision });
  await addFixedReport({ kind: 'experience', engine, relative: `${attemptRoot}/experience-${engine}/report.json`, validate: requireExperience });
  await addFixedReport({ kind: 'head', engine, relative: `${attemptRoot}/head-${engine}/report.json`, validate: requireHead });
  await addFixedReport({ kind: 'risk', engine, relative: `${attemptRoot}/risk-${engine}/report.json`, validate: (report) => requireRisk(report, engine) });
  await addFixedReport({ kind: 'feel-state', engine, relative: `${attemptRoot}/feel-state-${engine}/report.json`, validate: (report) => requireFeelState(report, engine, attempt, receipt.buildHash) });
}
await addFixedReport({
  kind: 'visual', engine: 'webkit', relative: `${attemptRoot}/visual/report.json`,
  basePolicy: { requireNormalInput: false, allowUnspecifiedStateInjection: true },
  validate: (report) => {
    const blockers = requireVisual(report);
    return { blockers, status: 'PASS', classification: { screenshotEvidence: visualEvidenceClassification } };
  },
});
const lifecycleLoaded = await tryRunJson(`${attemptRoot}/lifecycle/report.json`);
let lifecycleDetail = { blockers: ['report-missing'], backgroundBlocked: false, allBackgroundPassed: false };
if (lifecycleLoaded.value) {
  const baseBlockers = reportBaseBlockers(lifecycleLoaded.value, attempt, receipt.buildHash, { requireNormalInput: true, allowUnspecifiedStateInjection: true }).filter((item) => item !== 'raw-report-not-passed' && item !== 'raw-check-failed');
  const detail = requireLifecycle(lifecycleLoaded.value);
  const bindingResult = await verifyBindings(screenshotRefs(lifecycleLoaded.value), attempt, `${attemptRoot}/lifecycle/report.json`);
  screenshots.push(...bindingResult.verified);
  lifecycleDetail = { ...detail, blockers: unique([...baseBlockers, ...detail.blockers, ...bindingResult.failures]) };
}
reports.push({
  kind: 'lifecycle', engine: 'webkit+chromium', path: `${attemptRoot}/lifecycle/report.json`,
  sha256: lifecycleLoaded.sha256 ?? '0'.repeat(64),
  status: !lifecycleLoaded.value ? 'BLOCKED' : lifecycleDetail.backgroundBlocked ? 'BLOCKED' : lifecycleDetail.blockers.length ? 'FAIL' : 'PASS',
  blockers: lifecycleDetail.blockers, value: lifecycleLoaded.value,
});
for (const engine of ['webkit', 'chromium']) {
  await addFixedReport({
    kind: 'safety', engine, relative: `${attemptRoot}/qa-safety-${engine}/report.json`,
    basePolicy: { requireReportedPass: false, requireChecksPass: false },
    validate: (report) => requireSafety(report, engine, lifecycleLoaded.value),
  });
}

const contractLoaded = await tryRunJson('product-experience-contract.json');
const perceptualLoaded = await tryRunJson('perceptual-qa-report.json');
const contractParsed = ProductExperienceContractSchema.safeParse(contractLoaded.value);
const perceptualParsed = PerceptualQaReportSchema.safeParse(perceptualLoaded.value);
const perceptualReport = perceptualParsed.success ? perceptualParsed.data : undefined;
if (!contractParsed.success) preflightBlockers.push('product-experience-contract-invalid-or-missing');
else {
  const caseCount = contractParsed.data.features.reduce((count, feature) => count + feature.requiredViewports.length, 0);
  const headFeature = contractParsed.data.features.find((feature) => feature.id === 'native-head-visible');
  const replayFeature = contractParsed.data.features.find((feature) => feature.id === 'replay-mastery-records');
  if (contractParsed.data.targetGame !== GAME || contractParsed.data.targetRunId !== RUN_ID || contractParsed.data.targetWorkspace !== WORKSPACE) preflightBlockers.push('v3-product-contract-target-identity-mismatch');
  if (contractParsed.data.features.length !== 15 || caseCount !== 30) preflightBlockers.push('v3-product-contract-does-not-match-15-features-and-30-required-cases');
  if (!headFeature || headFeature.requiredViewports.length !== 4 || JSON.stringify(headFeature.expectedEventOrder) !== JSON.stringify([
    'native-head-visible', 'fish-catch', 'reverse-jump', 'barrier-terminal', 'replay', 'pedestrian-stun', 'recovered',
  ])) preflightBlockers.push('native-head-contract-case-sequence-invalid');
  if (!replayFeature || replayFeature.requiredViewports.length !== 1 || JSON.stringify(replayFeature.expectedEventOrder) !== JSON.stringify(['earned-settlement', 'visible-best-and-total-stars', 'replay'])) preflightBlockers.push('replay-mastery-records-contract-case-invalid');
  if (!contractParsed.data.runtimeEntrypoints.includes('source/pelican-bike/src/pelican.js') || !contractParsed.data.runtimeEntrypoints.includes('source/pelican-bike/src/engagement.mjs')) preflightBlockers.push('runtime-entrypoint-pelican-or-engagement-source-missing');
}
let perceptualGate;
try {
  perceptualGate = await verifyPerceptualQaReview({
    runRoot: RUN, workspace: WORKSPACE, contract: contractParsed.success ? contractParsed.data : contractLoaded.value,
    buildHash: receipt.buildHash, report: perceptualReport,
  });
  perceptualGate = PerceptualQaGateSchema.parse(perceptualGate);
} catch (error) {
  perceptualGate = PerceptualQaGateSchema.parse({
    schemaVersion: 1, targetRunId: RUN_ID, contractHash: null, buildHash: receipt.buildHash,
    passed: false, blockers: [`perceptual-verifier-error:${error instanceof Error ? error.message : String(error)}`],
    requiredCaseIds: [], checkedCaseIds: [],
  });
}
if (!contractLoaded.value) perceptualGate = PerceptualQaGateSchema.parse({ ...perceptualGate, passed: false, blockers: unique([...perceptualGate.blockers, 'perceptual-contract-missing']) });
if (!perceptualLoaded.value || !perceptualParsed.success) perceptualGate = PerceptualQaGateSchema.parse({ ...perceptualGate, passed: false, blockers: unique([...perceptualGate.blockers, 'perceptual-review-missing-or-invalid']) });
await json(path.join(RUN, 'artifacts/perceptual-qa-gate-v3.json'), perceptualGate);

const naturalPaths = [
  { kind: 'campaign-natural-flow', path: 'artifacts/natural/campaign.json', features: ['five-configured-levels', 'unlock-save'] },
  { kind: 'collision-natural-flow', path: 'artifacts/natural/collisions.json', features: ['vehicle-impact', 'pedestrian-stun', 'jump-clearance'] },
  { kind: 'v3-experience-natural-flow-webkit', path: 'artifacts/natural/v3-experience-webkit.json', features: ['lane-inertia', 'jump-choice', 'pedestrian-forecast', 'first-minute-mastery'] },
  { kind: 'v3-experience-natural-flow-chromium', path: 'artifacts/natural/v3-experience-chromium.json', features: ['lane-inertia', 'jump-choice', 'pedestrian-forecast', 'first-minute-mastery'] },
  { kind: 'v3-risk-natural-flow-webkit', path: 'artifacts/natural/v3-risk-webkit.json', features: ['jump-clearance', 'jump-choice', 'five-configured-levels', 'replay-mastery-records'], engine: 'webkit', riskReportPath: `${attemptRoot}/risk-webkit/report.json` },
  { kind: 'v3-risk-natural-flow-chromium', path: 'artifacts/natural/v3-risk-chromium.json', features: ['jump-clearance', 'jump-choice', 'five-configured-levels', 'replay-mastery-records'], engine: 'chromium', riskReportPath: `${attemptRoot}/risk-chromium/report.json` },
  { kind: 'v3-feel-state-natural-flow-webkit', path: 'artifacts/natural/v3-feel-state-webkit.json', features: FEEL_STATE_TRANSITIONS, engine: 'webkit', feelStateReportPath: `${attemptRoot}/feel-state-webkit/report.json` },
  { kind: 'v3-feel-state-natural-flow-chromium', path: 'artifacts/natural/v3-feel-state-chromium.json', features: FEEL_STATE_TRANSITIONS, engine: 'chromium', feelStateReportPath: `${attemptRoot}/feel-state-chromium/report.json` },
];
const headViewports = [
  { width: 390, height: 844, label: 'mobile-portrait' },
  { width: 360, height: 740, label: 'small-mobile' },
  { width: 320, height: 568, label: 'compact-mobile' },
  { width: 844, height: 390, label: 'mobile-landscape' },
];
const headContract = contractParsed.success ? contractParsed.data.features.find((feature) => feature.id === 'native-head-visible') : null;
for (const engine of ['webkit', 'chromium']) for (const viewport of headViewports) {
  const width = viewport.width;
  naturalPaths.push({
    kind: `v3-head-natural-flow-${engine}-${width}`,
    path: `artifacts/natural/v3-head-${engine}-${width}.json`,
    features: headContract?.expectedEventOrder ?? ['native-head-visible', 'fish-catch', 'reverse-jump', 'barrier-terminal', 'replay', 'pedestrian-stun', 'recovered'],
    engine,
    viewport,
  });
}
const naturalTraces = [];
for (const spec of naturalPaths) {
  const loaded = await tryRunJson(spec.path);
  const parsed = NaturalFlowEvidenceSchema.safeParse(loaded.value);
  const blockers = [];
  if (!parsed.success) blockers.push(`natural-flow-missing-or-invalid:${loaded.error ?? spec.path}`);
  else {
    const flow = parsed.data;
    if (!flow.passed || !flow.startedFromReset || flow.actions.length < 2 || flow.completion === 'none' || flow.completion === 'automatic-progress' || !flow.replayObserved || flow.forbiddenOperations.length) blockers.push('natural-flow-does-not-prove-reset-core-terminal-replay');
    if (flow.buildHash !== receipt.buildHash || flow.runtime !== 'web-lite') blockers.push('natural-flow-build-or-runtime-mismatch');
    if (spec.viewport && (flow.completion !== 'terminal' || flow.device?.width !== spec.viewport.width || flow.device?.height !== spec.viewport.height || flow.device?.label !== spec.viewport.label)) blockers.push('head-natural-flow-viewport-or-terminal-mismatch');
    for (const feature of spec.features) if (!flow.transitions.some((transition) => transition.name === feature && transition.changed)) blockers.push(`natural-transition-missing:${feature}`);
    const kind = spec.kind.startsWith('campaign') ? 'campaign' : spec.kind.startsWith('collision') ? 'collision' : spec.kind.startsWith('v3-head') ? 'head' : spec.kind.startsWith('v3-risk') ? 'risk' : spec.kind.startsWith('v3-feel-state') ? 'feel-state' : 'experience';
    const engine = spec.engine ?? (spec.kind.endsWith('chromium') ? 'chromium' : 'webkit');
    const correspondingEntry = reports.find((entry) => entry.kind === kind && entry.engine === engine);
    const corresponding = correspondingEntry?.value;
    const allowedShots = new Set(screenshotRefs(corresponding).map((binding) => binding.path));
    if (flow.screenshots.length === 0) blockers.push('natural-flow-screenshots-missing');
    for (const screenshot of flow.screenshots) {
      if (!allowedShots.has(screenshot)) blockers.push(`natural-screenshot-not-bound-by-raw-report:${screenshot}`);
    }
    if (spec.viewport) {
      const row = corresponding?.reports?.find((item) => viewportKey(item.viewport) === `${spec.viewport.width}x${spec.viewport.height}`);
      if (!row) blockers.push('head-natural-flow-source-viewport-missing');
      else {
        const selectors = (row.actions ?? []).map((action) => action.type === 'tap' && typeof action.selector === 'string' ? `tap ${action.selector}` : null);
        if (selectors.some((action) => action === null) || JSON.stringify(flow.actions) !== JSON.stringify(selectors)) blockers.push('head-natural-flow-actions-do-not-match-raw-tap-selectors');
        const reportScreens = new Set((row.screenshots ?? []).map((item) => item.path));
        const requiredShots = ['fish-catch', 'terminal', 'replay', 'pedestrian-stun', 'recovery'];
        for (const name of requiredShots) {
          const expectedPath = [...reportScreens].find((item) => path.posix.basename(item).replace(/\.png$/u, '') === `${spec.viewport.width}-${name}`);
          if (!expectedPath || !flow.screenshots.includes(expectedPath)) blockers.push(`head-natural-flow-required-screenshot-missing:${name}`);
        }
        const expectedTransitions = spec.features;
        const observedTransitions = flow.transitions.map((transition) => transition.name);
        if (JSON.stringify(observedTransitions) !== JSON.stringify(expectedTransitions) || flow.transitions.some((transition) => !transition.changed)) blockers.push('head-natural-flow-transition-order-mismatch');
      }
    }
    if (spec.riskReportPath) {
      if (correspondingEntry?.path !== spec.riskReportPath || correspondingEntry.status !== 'PASS') blockers.push('risk-natural-flow-source-report-not-passing-current-attempt');
      const expectedViewport = { width: 390, height: 844, label: 'mobile-portrait' };
      if (flow.device?.width !== expectedViewport.width || flow.device?.height !== expectedViewport.height || flow.device?.label !== expectedViewport.label) blockers.push('risk-natural-flow-viewport-mismatch');
      for (const feature of spec.features) {
        const transition = flow.transitions.find((item) => item.name === feature && item.changed);
        if (!transition || !transition.evidence.includes(spec.riskReportPath)) blockers.push(`risk-natural-flow-transition-not-bound:${feature}`);
      }
      if (!flow.screenshots.length || flow.screenshots.some((screenshot) => !allowedShots.has(screenshot))) blockers.push('risk-natural-flow-screenshots-not-bound-to-current-risk-report');
    }
    if (spec.feelStateReportPath) {
      if (correspondingEntry?.path !== spec.feelStateReportPath || correspondingEntry.status !== 'PASS') blockers.push('feel-state-natural-flow-source-report-not-passing-current-attempt');
      const expectedViewport = { width: 390, height: 844, label: 'mobile-portrait' };
      if (flow.completion !== 'terminal' || !flow.replayObserved || flow.device?.width !== expectedViewport.width || flow.device?.height !== expectedViewport.height || flow.device?.label !== expectedViewport.label) blockers.push('feel-state-natural-flow-terminal-replay-or-viewport-mismatch');
      const rawActions = (corresponding?.actions ?? []).map((action) => `${action.type} ${action.selector}`);
      if (JSON.stringify(flow.actions) !== JSON.stringify(rawActions)) blockers.push('feel-state-natural-flow-actions-do-not-match-raw-normal-input');
      const rawScreenshots = (corresponding?.screenshots ?? []).map((item) => item.path);
      if (JSON.stringify(flow.screenshots) !== JSON.stringify(rawScreenshots)) blockers.push('feel-state-natural-flow-screenshots-do-not-match-raw-report');
      const observedTransitions = flow.transitions.map((transition) => transition.name);
      if (JSON.stringify(observedTransitions) !== JSON.stringify(FEEL_STATE_TRANSITIONS) || flow.transitions.some((transition) => !transition.changed || !transition.evidence.includes(spec.feelStateReportPath))) blockers.push('feel-state-natural-flow-transition-order-or-source-binding-invalid');
    }
  }
  naturalTraces.push({ kind: spec.kind, path: spec.path, sha256: loaded.sha256 ?? '0'.repeat(64), status: blockers.length ? loaded.value ? 'FAIL' : 'BLOCKED' : 'PASS', blockers, value: parsed.success ? parsed.data : null });
}

const wiredFiles = [
  'workspace/game/index.html',
  ...(contractParsed.success ? contractParsed.data.runtimeEntrypoints.map((entry) => `workspace/${entry}`) : []),
];
const wired = await verifyRuntimeWiredFiles({ runRoot: RUN, files: wiredFiles });
const campaignFlow = naturalTraces.find((trace) => trace.kind === 'campaign-natural-flow')?.value;
let runtimeGate = deriveRuntimeProductGate({
  naturalFlow: campaignFlow,
  runtimeWiredFiles: wiredFiles,
  browserEvidence: reports.filter((entry) => ['campaign', 'collision', 'experience'].includes(entry.kind)).map((entry) => entry.path),
  entrypoint: 'workspace/game/index.html',
  defaultMode: 'five-level coast adventure',
  legacyBehavior: { status: 'COMPATIBILITY_ONLY', evidence: ['Source adaptation installs the coast UI and adventure hooks on the default H5 path; legacy compatibility code remains outside the declared default journey.'] },
});
runtimeGate = RuntimeProductGateSchema.parse({ ...runtimeGate, passed: runtimeGate.passed && wired.passed && naturalTraces.filter((trace) => trace.kind !== 'campaign-natural-flow').every((trace) => trace.status === 'PASS') });
await json(path.join(RUN, 'artifacts/runtime-product-gates-v3.json'), runtimeGate);
await json(path.join(RUN, 'artifacts/runtime-wiring-verification-v3.json'), wired);

const repairStateLoaded = await tryRunJson('repair-state.json');
const RepairStateSchema = z.object({ attempt: z.number().int().positive(), history: z.array(z.object({ attempt: z.number().int().positive(), buildHash: SHA256, qa: Text }).passthrough()) }).passthrough();
const repairStateParsed = RepairStateSchema.safeParse(repairStateLoaded.value);
const matrixDetails = [];
for (const pair of matrixPaths) {
  const triageLoaded = await tryRunJson(pair.triage);
  const matrixLoaded = await tryRunJson(pair.matrix);
  const triage = ExperienceComplaintTriageSchema.safeParse(triageLoaded.value);
  const matrix = ExperienceReproductionMatrixSchema.safeParse(matrixLoaded.value);
  if (triage.success && matrix.success) {
    const counts = {};
    for (const cell of matrix.data.cells) counts[cell.status] = (counts[cell.status] ?? 0) + 1;
    matrixDetails.push({ triagePath: pair.triage, matrixPath: pair.matrix, triageStatus: triage.data.status, cells: matrix.data.cells.length, statusCounts: counts, remainingGaps: matrix.data.remainingGaps, sha256: matrixLoaded.sha256 });
  } else {
    matrixDetails.push({ triagePath: pair.triage, matrixPath: pair.matrix, triageStatus: triage.success ? triage.data.status : 'INVALID_OR_MISSING', cells: 0, statusCounts: {}, remainingGaps: ['Triage or reproduction matrix could not be validated and was preserved untouched.'], sha256: matrixLoaded.sha256 });
  }
}
const latestRepair = repairStateParsed.success ? repairStateParsed.data.history.at(-1) : undefined;
const repairHistory = {
  path: 'repair-state.json', sha256: repairStateLoaded.sha256,
  entryCount: repairStateParsed.success ? repairStateParsed.data.history.length : 0,
  latestAttempt: latestRepair?.attempt ?? null, latestBuildHash: latestRepair?.buildHash ?? null,
  preservedByFinalize: true,
};
if (!repairStateParsed.success || repairStateParsed.data.attempt !== attempt || latestRepair?.attempt !== attempt || latestRepair.buildHash !== receipt.buildHash) preflightBlockers.push('repair-history-and-build-receipt-do-not-align');
if (matrixDetails.some((item) => item.triageStatus === 'INVALID_OR_MISSING')) preflightBlockers.push('triage-or-reproduction-matrix-invalid-or-missing; original files were not modified');

const results = reports.map((report) => {
  const result = { ...report };
  delete result.value;
  return result;
});
const reportPass = (kind, engine) => reports.find((item) => item.kind === kind && item.engine === engine)?.status === 'PASS';
const safetyReports = reports.filter((item) => item.kind === 'safety');
const safetyEvidence = safetyReports.map((item) => ({
  engine: item.engine,
  status: item.status,
  path: item.path,
  checks: item.classification?.checkResults ?? [],
  environmentBlockedChecks: item.classification?.environmentBlockedChecks ?? [],
  environmentalEvidence: item.classification?.environmentalEvidence ?? null,
}));
const safetyEvidenceAcceptable = safetyReports.length === 2
  && ['webkit', 'chromium'].every((engine) => {
    const item = safetyReports.find((entry) => entry.engine === engine);
    return item && (item.status === 'PASS' || (item.status === 'BLOCKED'
      && item.classification?.supportedChecksPassed === true
      && item.classification?.environmentBlockedChecks?.every((name) => safetyBackgroundChecks.has(name))
      && item.classification?.environmentalEvidence?.passed === true));
  });
const desktopEvidencePassed = [
  reportPass('campaign', 'webkit'), reportPass('campaign', 'chromium'),
  reportPass('collision', 'webkit'), reportPass('collision', 'chromium'),
  reportPass('experience', 'webkit'), reportPass('experience', 'chromium'),
  reportPass('head', 'webkit'), reportPass('head', 'chromium'),
  reportPass('risk', 'webkit'), reportPass('risk', 'chromium'),
  reportPass('feel-state', 'webkit'), reportPass('feel-state', 'chromium'), reportPass('visual', 'webkit'), safetyEvidenceAcceptable,
  naturalTraces.every((trace) => trace.status === 'PASS'), perceptualGate.passed,
  runtimeGate.passed, preflightBlockers.length === 0,
].every(Boolean);
const lifecycleSupportedChecksPassed = lifecycleLoaded.value && lifecycleDetail.blockers.length === 0;
const scriptedCoreJourneyPassed = desktopEvidencePassed && lifecycleSupportedChecksPassed;

const blockedGaps = [
  { id: 'PHYSICAL-DEVICE', message: 'Physical iPhone and Android playtest, low-end performance, thermal behavior, and long-session stability are BLOCKED / NOT RUN.' },
  { id: 'MOBILE-BACKGROUND', message: 'Real mobile app background, lock-screen, call interruption, and return behavior remain BLOCKED; desktop browser or injected lifecycle events do not close this gap.' },
  { id: 'LIVE-ADS', message: 'Live TapTap advertising is BLOCKED / NOT INTEGRATED; no ad reward is simulated.' },
  { id: 'NATIVE-PACKAGES', message: 'WeChat and Douyin native mini-game packages are BLOCKED / NOT PACKAGED.' },
  { id: 'HUMAN-PLAYTEST', message: 'Independent human enjoyment, usability, and retention playtesting are BLOCKED / NOT RUN.' },
  { id: 'PRODUCTION', message: 'Production release is BLOCKED. This artifact is an H5 device-playtest candidate only.' },
];
const qaChecks = [];
for (const item of reports) {
  qaChecks.push({ name: `${item.kind}:${item.engine ?? 'unspecified'}`, passed: item.status === 'PASS', evidence: item.path });
  for (const raw of item.value?.checks ?? []) qaChecks.push({ name: `${item.kind}:${item.engine ?? 'unspecified'}:${raw.name}`, passed: raw.passed === true, evidence: item.path });
  for (const classified of item.classification?.checkResults ?? []) {
    if (classified.status === 'BLOCKED') qaChecks.push({ name: `${item.kind}:${item.engine}:${classified.name}:environment-blocked`, passed: false, evidence: `${item.path} + ${item.classification.environmentalEvidence?.path ?? 'missing-lifecycle-diagnostic'}` });
  }
}
for (const trace of naturalTraces) qaChecks.push({ name: trace.kind, passed: trace.status === 'PASS', evidence: trace.path });
qaChecks.push(
  { name: 'independent-perceptual-qa-gate', passed: perceptualGate.passed, evidence: 'artifacts/perceptual-qa-gate-v3.json' },
  { name: 'default-runtime-product-journey', passed: runtimeGate.passed, evidence: 'artifacts/runtime-product-gates-v3.json' },
  { name: 'runtime-wired-files', passed: wired.passed, evidence: 'artifacts/runtime-wiring-verification-v3.json' },
  { name: 'physical-device-acceptance', passed: false, evidence: 'BLOCKED: physical iPhone and Android not run' },
  { name: 'real-mobile-background-lifecycle', passed: false, evidence: 'BLOCKED: no physical app lifecycle signal' },
  { name: 'live-ad-integration', passed: false, evidence: 'BLOCKED: workspace/game/platform.json reports NOT_INTEGRATED' },
  { name: 'native-platform-packages', passed: false, evidence: 'BLOCKED: workspace/game/platform.json reports NOT_PACKAGED' },
);
for (const blocker of preflightBlockers) qaChecks.push({ name: `preflight:${blocker}`, passed: false, evidence: 'build-receipt.json or repair-state.json' });
const issues = [
  ...reports.filter((item) => item.status !== 'PASS').map((item) => ({ id: `CURRENT-BUILD-${item.kind.toUpperCase()}-${(item.engine ?? 'ALL').toUpperCase()}`, severity: 'error', message: item.blockers.join('; ') || 'Current-build report is missing or blocked.', evidence: item.path })),
  ...naturalTraces.filter((item) => item.status !== 'PASS').map((item) => ({ id: `NATURAL-FLOW-${item.kind.toUpperCase()}`, severity: 'error', message: item.blockers.join('; ') || 'Current-build natural flow is missing or invalid.', evidence: item.path })),
  ...preflightBlockers.map((message, index) => ({ id: `PREFLIGHT-${index + 1}`, severity: 'error', message, evidence: 'build-receipt.json' })),
  ...blockedGaps.map((item) => ({ id: item.id, severity: 'error', message: item.message, evidence: 'qa-summary-v3.json' })),
  ...(perceptualGate.passed ? [] : [{ id: 'INDEPENDENT-PERCEPTUAL-QA', severity: 'error', message: perceptualGate.blockers.join('; ') || 'Independent perceptual gate is blocked.', evidence: 'artifacts/perceptual-qa-gate-v3.json' }]),
  ...(runtimeGate.passed ? [] : [{ id: 'RUNTIME-PRODUCT-GATE', severity: 'error', message: 'Runtime product journey or declared wired entrypoints did not pass.', evidence: 'artifacts/runtime-product-gates-v3.json' }]),
];

const reportBindings = [];
for (const item of reports) if (item.sha256 !== '0'.repeat(64)) reportBindings.push({ kind: `${item.kind}:${item.engine ?? 'unspecified'}`, path: item.path, sha256: item.sha256, status: item.status });
for (const trace of naturalTraces) if (trace.sha256 !== '0'.repeat(64)) reportBindings.push({ kind: trace.kind, path: trace.path, sha256: trace.sha256, status: trace.status });
for (const [kind, loaded] of [['experience-contract', contractLoaded], ['perceptual-report', perceptualLoaded]]) if (loaded.sha256) reportBindings.push({ kind, path: kind === 'experience-contract' ? 'product-experience-contract.json' : 'perceptual-qa-report.json', sha256: loaded.sha256, status: 'PASS' });
reportBindings.push({ kind: 'perceptual-gate-v3', path: 'artifacts/perceptual-qa-gate-v3.json', sha256: sha(JSON.stringify(perceptualGate, null, 2) + '\n'), status: perceptualGate.passed ? 'PASS' : 'BLOCKED' });
reportBindings.push({ kind: 'runtime-product-gate-v3', path: 'artifacts/runtime-product-gates-v3.json', sha256: sha(JSON.stringify(runtimeGate, null, 2) + '\n'), status: runtimeGate.passed ? 'PASS' : 'BLOCKED' });
reportBindings.push({ kind: 'runtime-wiring-v3', path: 'artifacts/runtime-wiring-verification-v3.json', sha256: sha(JSON.stringify(wired, null, 2) + '\n'), status: wired.passed ? 'PASS' : 'BLOCKED' });
const copyKinds = new Set(['campaign', 'collision', 'safety', 'experience', 'head', 'risk', 'feel-state', 'visual', 'lifecycle', 'campaign-natural-flow', 'collision-natural-flow', 'v3-experience-natural-flow-webkit', 'v3-experience-natural-flow-chromium', 'v3-risk-natural-flow-webkit', 'v3-risk-natural-flow-chromium', 'v3-feel-state-natural-flow-webkit', 'v3-feel-state-natural-flow-chromium', 'experience-contract', 'perceptual-report', 'perceptual-gate-v3', 'runtime-product-gate-v3', 'runtime-wiring-v3']);
const copyFiles = [
  ...reportBindings.filter((entry) => copyKinds.has(entry.kind.split(':')[0]) || entry.kind.startsWith('v3-head-natural-flow-')),
  ...feelStateEvidenceFiles,
].filter((item, index, all) => all.findIndex((candidate) => candidate.path === item.path) === index);
const manifest = EvidenceManifestSchema.parse({
  schemaVersion: 1, targetGame: GAME, targetRunId: RUN_ID, workspace: WORKSPACE, attempt, buildHash: receipt.buildHash,
  createdAt: new Date().toISOString(),
  reports: reports.map(({ kind, engine, path: reportPath, sha256: hash, status }) => ({ kind, engine, path: reportPath, sha256: hash, status })),
  naturalTraces: naturalTraces.map(({ kind, path: tracePath, sha256: hash, status }) => ({ kind, path: tracePath, sha256: hash, status })),
  screenshots: unique(screenshots.map((item) => `${item.path}:${item.sha256}:${item.sourceReport}`)).map((key) => { const [screenshotPath, screenshotHash, sourceReport] = key.split(':'); return { path: screenshotPath, sha256: screenshotHash, sourceReport }; }),
  copyFiles: copyFiles.map(({ kind, path: filePath, sha256: hash }) => ({ kind, path: filePath, sha256: hash })),
});
await json(path.join(RUN, 'qa-evidence-manifest-v3.json'), manifest);

const flowSummary = naturalTraces.map(({ kind, path: flowPath, sha256: hash, status, blockers }) => ({ kind, path: flowPath, sha256: hash, status, blockers }));
const productContractSummary = {
  path: 'product-experience-contract.json', sha256: contractLoaded.sha256 ?? '0'.repeat(64),
  featureCount: contractParsed.success ? contractParsed.data.features.length : 0,
  requiredCaseCount: contractParsed.success ? contractParsed.data.features.reduce((count, feature) => count + feature.requiredViewports.length, 0) : 0,
  runtimeEntrypoints: contractParsed.success ? contractParsed.data.runtimeEntrypoints : [],
};
const riskEvidence = ['webkit', 'chromium'].map((engine) => {
  const item = reports.find((report) => report.kind === 'risk' && report.engine === engine);
  const classified = item?.classification;
  return {
    engine, path: item?.path ?? `${attemptRoot}/risk-${engine}/report.json`, sha256: item?.sha256 ?? '0'.repeat(64),
    status: item?.status ?? 'BLOCKED', targetCount: classified?.targetCount ?? 0,
    targetsByLevel: classified?.targetsByLevel ?? [], barrierEvidence: classified?.barrierEvidence ?? [],
    settlements: classified?.settlements ?? [], replayObserved: classified?.replayObserved === true,
    blockers: item?.blockers ?? ['risk-report-missing'],
  };
});
const summary = {
  schemaVersion: 1,
  targetGame: GAME,
  runId: RUN_ID,
  workspace: WORKSPACE,
  baselineCommit: BASE,
  sourceRevision: '54adc1fb64155f9dd7c1c90ecae7b8185ac540b8',
  attempt,
  buildHash: receipt.buildHash,
  route: 'formal-fixer',
  status: scriptedCoreJourneyPassed ? 'BLOCKED_RELEASE' : 'BLOCKED_EVIDENCE',
  scriptedCoreJourneyPassed,
  desktopBrowserEvidencePassed: desktopEvidencePassed,
  lifecycleSupportedChecksPassed: lifecycleSupportedChecksPassed === true,
  desktopBackgroundEvidence: lifecycleDetail.allBackgroundPassed ? 'PASS_DESKTOP_ONLY' : lifecycleDetail.backgroundBlocked ? 'BLOCKED_ENVIRONMENT_SIGNAL_UNAVAILABLE' : 'BLOCKED_OR_FAILED',
  independentPerceptualPassed: perceptualGate.passed,
  runtimeProductJourneyPassed: runtimeGate.passed,
  releaseReady: false,
  productionReady: false,
  readiness: { h5DevicePlaytestCandidate: scriptedCoreJourneyPassed, physicalDevice: false, liveAds: false, nativePackages: false, production: false },
  levels: (reports.find((item) => item.kind === 'campaign' && item.engine === 'webkit')?.value?.levels ?? []).map((level) => ({ level: level.level, distance: level.distance, fish: level.count, gold: level.gold, elapsedSeconds: level.elapsed, result: level.reason, unlocked: typeof level.save === 'number' ? level.save : level.save?.unlocked })),
  productContract: productContractSummary,
  reports: results,
  safetyEvidence,
  riskEvidence,
  naturalFlows: flowSummary,
  matricesPreserved: matrixDetails,
  repairHistoryPreserved: repairHistory,
  blockers: [...blockedGaps.map((item) => item.message), ...preflightBlockers, ...reports.filter((item) => item.status !== 'PASS').flatMap((item) => item.blockers.map((blocker) => `${item.kind}/${item.engine ?? 'unspecified'}: ${blocker}`)), ...naturalTraces.filter((item) => item.status !== 'PASS').flatMap((item) => item.blockers.map((blocker) => `${item.kind}: ${blocker}`)), ...perceptualGate.blockers, ...(!runtimeGate.passed ? ['Runtime product gate did not pass.'] : [])],
  reportPaths: ['qa-report-v3.json', 'build-report-v3.json', 'qa-summary-v3.json', 'qa-summary-v3.md', 'qa-evidence-manifest-v3.json', 'artifacts/perceptual-qa-gate-v3.json', 'artifacts/runtime-product-gates-v3.json', 'artifacts/runtime-wiring-verification-v3.json'],
  evidenceManifestPath: 'qa-evidence-manifest-v3.json',
  createdAt: new Date().toISOString(),
};
await json(path.join(RUN, 'qa-summary-v3.json'), summary);

const qaReport = QaReportSchema.parse({
  schemaVersion: 1,
  passed: false,
  checks: qaChecks,
  issues,
  screenshots: unique(screenshots.map((item) => item.path)),
  consoleLog: 'Structured browser reports are bound in qa-evidence-manifest-v3.json; the QA drivers did not emit one merged console log.',
  testedAt: new Date().toISOString(),
});
await json(path.join(RUN, 'qa-report-v3.json'), qaReport);

const buildReport = BuildReportSchema.parse({
  schemaVersion: 1,
  success: Boolean(htmlBytes && receipt.buildExit === 0),
  runtime: 'web-lite',
  template: 'PR10 authorized Pelican Three.js source adaptation, V3',
  codexThreadId: receipt.threadId,
  workspace: WORKSPACE,
  webBuild: htmlPath,
  files: [htmlPath, ...wiredFiles.slice(1).map((file) => path.join(RUN, file))],
  verification: [
    `Current delivered HTML SHA-256 ${htmlHash ?? 'MISSING'}; build receipt ${receipt.buildHash}`,
    `Current-attempt browser reports: ${reports.filter((item) => item.status === 'PASS').length}/${reports.length} categories passed; required WebKit and Chromium evidence is listed in qa-evidence-manifest-v3.json.`,
    `Independent perceptual gate ${perceptualGate.passed ? 'passed' : 'blocked'}; runtime product journey ${runtimeGate.passed ? 'passed' : 'blocked'}.`,
    'Physical device, real app background lifecycle, live ads, native packages, and production release remain blocked.',
  ],
  builtAt: receipt.at,
  completion: {
    status: 'RELEASE_BLOCKED',
    blockers: unique([
      'humanPlaytest',
      ...(!desktopEvidencePassed ? ['normalFlow'] : []),
      ...(!perceptualGate.passed ? ['visualEvidence'] : []),
      ...(!runtimeGate.passed ? ['runtimeProductJourney'] : []),
    ]),
  },
});
await json(path.join(RUN, 'build-report-v3.json'), buildReport);

const markdown = [
  `# ${GAME} V3 · 浏览器 QA 收尾`,
  '',
  `- 当前 attempt：${attempt}`,
  `- 构建 SHA-256：\`${receipt.buildHash}\``,
  `- 默认旅程（启动→五关→结算→重玩）：${scriptedCoreJourneyPassed ? '桌面浏览器证据通过' : 'BLOCKED'}`,
  `- 独立感知 gate：${perceptualGate.passed ? '通过' : 'BLOCKED'}`,
  `- Runtime 产品 gate：${runtimeGate.passed ? '通过' : 'BLOCKED'}`,
  '- 发布状态：BLOCKED；本结果不是 release-ready。',
  '',
  '## 当前构建报告',
  '',
  '| 类别 | 浏览器 | 状态 | 报告路径 |',
  '|---|---|---|---|',
  ...reports.map((item) => `| ${item.kind} | ${item.engine ?? '—'} | ${item.status} | \`${item.path}\` |`),
  '',
  '## 必须保持的未完成项',
  '',
  ...blockedGaps.map((item) => `- ${item.message}`),
  '',
  '修复历史与原始 reproduction matrix 仅读取并保留；finalize-v3 不会把任何 `BLOCKED` cell 改为 `PASS`。机器结果见 `qa-report-v3.json`、`build-report-v3.json` 和 `qa-evidence-manifest-v3.json`。',
  '',
].join('\n');
await (await import('node:fs/promises')).writeFile(path.join(RUN, 'qa-summary-v3.md'), markdown);

console.log(JSON.stringify({
  targetGame: GAME, workspace: WORKSPACE, attempt, buildHash: receipt.buildHash,
  scriptedCoreJourneyPassed, independentPerceptualPassed: perceptualGate.passed,
  runtimeProductJourneyPassed: runtimeGate.passed, releaseReady: false,
  blockedReports: reports.filter((item) => item.status !== 'PASS').map((item) => ({ kind: item.kind, engine: item.engine, blockers: item.blockers })),
  reportPaths: summary.reportPaths,
}, null, 2));
