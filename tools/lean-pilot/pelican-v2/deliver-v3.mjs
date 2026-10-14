/* global console */
// Package only the exact current-build H5 candidate and manifest-bound JSON
// reports. This does not publish a native platform package or release the game.
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { tsImport } from 'tsx/esm/api';
import { z } from 'zod';
import { BASE, REPO, RUN, RUN_ID, WORKSPACE } from './prepare.mjs';

const GAME = '鹈鹕海岸冒险';
const SHA256 = z.string().regex(/^[a-f0-9]{64}$/u);
const Text = z.string().trim().min(1);
const Candidate = path.join(REPO, 'docs/lean-pilot/pelican-feel-v3-20261014/release-candidate');
const RISK_TARGETS = [
  { level: 1, barrierIds: ['l1-o1', 'l1-o3'] },
  { level: 2, barrierIds: ['l2-o3', 'l2-o5'] },
  { level: 3, barrierIds: ['l3-o3', 'l3-o5'] },
  { level: 4, barrierIds: ['l4-o3', 'l4-o5', 'l4-o10'] },
  { level: 5, barrierIds: ['l5-o3', 'l5-o5', 'l5-o10'] },
];
const RISK_TARGET_COUNT = RISK_TARGETS.reduce((count, level) => count + level.barrierIds.length, 0);
const FEEL_STATE_CHECKS = ['normal-barrier-terminal', 'normal-replay', 'six-state-correlated-running-frames'];
const FEEL_STATE_TRANSITIONS = ['lane-inertia', 'inertial-turn', 'camera-follow', ...FEEL_STATE_CHECKS];
const FEEL_STATE_FRAME_MS = [900, 1300, 1500, 1750, 2480, 3200];
const FeelStateCameraSchema = z.object({ position: z.array(z.number().finite()).length(3), quaternion: z.array(z.number().finite()).length(4), fov: z.number().finite() }).passthrough();
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
  image: z.object({ path: Text, sha256: SHA256 }).passthrough(),
}).passthrough();
const FeelStateReportSchema = z.object({
  schemaVersion: z.literal(1), targetGame: z.literal(GAME), workspace: z.literal(WORKSPACE), buildHash: SHA256,
  engine: z.enum(['webkit', 'chromium']), driverSha256: SHA256, normalInputOnly: z.literal(true), stateInjection: z.literal(false),
  actions: z.array(z.object({ type: z.enum(['tap', 'trusted-touch-press']), selector: Text, action: z.string().optional(), heldMs: z.number().finite().optional() }).passthrough()),
  frames: z.array(FeelStateFrameSchema), screenshots: z.array(z.object({ path: Text, sha256: SHA256 }).passthrough()),
  checks: z.array(z.object({ name: Text, passed: z.boolean() }).passthrough()), errors: z.array(z.string()), passed: z.boolean(),
  terminal: z.object({ state: z.object({ phase: Text, level: z.number().int(), reason: z.string(), events: z.array(z.object({ type: Text }).passthrough()) }).passthrough() }).passthrough(),
  replay: z.object({ state: z.object({ phase: Text, level: z.number().int(), distance: z.number().finite() }).passthrough() }).passthrough(),
  video: z.object({ path: Text, sha256: SHA256 }).passthrough(),
}).passthrough();
const BuildReceiptSchema = z.object({ attempt: z.number().int().positive(), route: z.literal('formal-fixer'), buildHash: SHA256, workspace: z.literal(WORKSPACE), buildExit: z.literal(0), threadId: z.string().min(1) }).passthrough();
const SummarySchema = z.object({
  schemaVersion: z.literal(1), targetGame: z.literal(GAME), runId: z.literal(RUN_ID), workspace: z.literal(WORKSPACE),
  attempt: z.number().int().positive(), buildHash: SHA256, route: z.literal('formal-fixer'),
  scriptedCoreJourneyPassed: z.boolean(), independentPerceptualPassed: z.boolean(), runtimeProductJourneyPassed: z.boolean(),
  releaseReady: z.literal(false), productionReady: z.literal(false),
  productContract: z.object({ path: z.literal('product-experience-contract.json'), sha256: SHA256, featureCount: z.number().int(), requiredCaseCount: z.number().int(), runtimeEntrypoints: z.array(z.string()) }).strict(),
  readiness: z.object({ h5DevicePlaytestCandidate: z.boolean(), physicalDevice: z.literal(false), liveAds: z.literal(false), nativePackages: z.literal(false), production: z.literal(false) }).passthrough(),
  reports: z.array(z.object({ kind: z.string().min(1), engine: z.string().nullable(), path: z.string().min(1), sha256: SHA256, status: z.enum(['PASS', 'BLOCKED', 'FAIL']), blockers: z.array(z.string()) }).passthrough()),
  safetyEvidence: z.array(z.object({
    engine: z.enum(['webkit', 'chromium']), status: z.enum(['PASS', 'BLOCKED', 'FAIL']), path: z.string().min(1),
    checks: z.array(z.object({ name: z.string().min(1), status: z.enum(['PASS', 'BLOCKED', 'FAIL']) }).strict()),
    environmentBlockedChecks: z.array(z.string()),
    environmentalEvidence: z.object({ diagnosticName: z.string().min(1), path: z.string().min(1), passed: z.boolean(), classification: z.string().nullable() }).strict().nullable(),
  }).strict()).length(2),
  riskEvidence: z.array(z.object({
    engine: z.enum(['webkit', 'chromium']), status: z.enum(['PASS', 'BLOCKED', 'FAIL']), path: z.string().min(1), sha256: SHA256,
    targetCount: z.number().int().nonnegative(), targetsByLevel: z.array(z.object({ level: z.number().int().positive(), count: z.number().int().positive(), barrierIds: z.array(z.string()) }).strict()),
    barrierEvidence: z.array(z.object({ level: z.number().int().positive(), barrierId: z.string(), goldFishId: z.string(), checks: z.array(z.string()), barrierSnapshotId: z.string().nullable(), goldFishSnapshotId: z.string().nullable(), barrierEventObjectId: z.string().nullable(), goldFishEventObjectId: z.string().nullable(), goldFishGolden: z.boolean(), goldFishBonus: z.boolean(), naturalJumpPassed: z.boolean() }).strict()),
    settlements: z.array(z.object({ level: z.number().int().positive(), status: z.enum(['PASS', 'FAIL']), completionEvent: z.boolean(), earnedSave: z.boolean() }).strict()),
    replayObserved: z.boolean(), blockers: z.array(z.string()),
  }).strict()).length(2),
  naturalFlows: z.array(z.object({ kind: z.string().min(1), path: z.string().min(1), sha256: SHA256, status: z.enum(['PASS', 'BLOCKED', 'FAIL']), blockers: z.array(z.string()) }).passthrough()),
  levels: z.array(z.object({ level: z.number().int().positive(), distance: z.number().optional(), fish: z.number().optional(), gold: z.number().optional(), elapsedSeconds: z.number().optional(), result: z.string().optional(), unlocked: z.number().optional() }).passthrough()),
  blockers: z.array(z.string()), evidenceManifestPath: z.string().min(1),
}).passthrough();
const EvidenceManifestSchema = z.object({
  schemaVersion: z.literal(1), targetGame: z.literal(GAME), targetRunId: z.literal(RUN_ID), workspace: z.literal(WORKSPACE),
  attempt: z.number().int().positive(), buildHash: SHA256,
  reports: z.array(z.object({ kind: z.string(), engine: z.string().nullable(), path: z.string(), sha256: SHA256, status: z.enum(['PASS', 'BLOCKED', 'FAIL']) }).strict()),
  naturalTraces: z.array(z.object({ kind: z.string(), path: z.string(), sha256: SHA256, status: z.enum(['PASS', 'BLOCKED', 'FAIL']) }).strict()),
  screenshots: z.array(z.object({ path: z.string(), sha256: SHA256, sourceReport: z.string() }).strict()),
  copyFiles: z.array(z.object({ kind: z.string(), path: z.string(), sha256: SHA256 }).strict()),
}).passthrough();
const { QaReportSchema, BuildReportSchema } = await tsImport('../../../src/schemas/index.ts', import.meta.url);
const { ProductExperienceContractSchema } = await tsImport('../../../src/schemas/product-experience.ts', import.meta.url);
const { NaturalFlowEvidenceSchema } = await tsImport('../../../src/schemas/natural-flow.ts', import.meta.url);
const RiskEpisodeSchema = z.object({
  barrierId: z.string().min(1), goldFishId: z.string().min(1), hudSeen: z.boolean(),
  jump: z.object({ countdown: z.number(), actionIndex: z.number().int().nonnegative() }).passthrough().optional(),
  holdComplete: z.boolean(), holdDurationMs: z.number().nullable().optional(),
  barrierClearSnapshotId: z.string().nullable(), bonusFishCatchSnapshotId: z.string().nullable(), screenshots: z.array(z.string()),
}).passthrough();
const RiskReportSchema = z.object({
  schemaVersion: z.literal(1), targetGame: z.literal(GAME), workspace: z.literal(WORKSPACE), buildHash: SHA256,
  attempt: z.number().int().positive(), engine: z.enum(['webkit', 'chromium']), normalInputOnly: z.literal(true),
  stateInjection: z.literal(false), passed: z.boolean(), checks: z.array(z.object({ name: z.string(), passed: z.boolean() }).passthrough()),
  actions: z.array(z.object({ type: z.literal('touch-tap'), selector: z.string(), levelId: z.number().int().positive(), targetBarrierId: z.string().nullable(), trustedTouch: z.boolean() }).passthrough()),
  screenshots: z.array(z.object({ path: z.string(), sha256: SHA256 }).passthrough()),
  snapshots: z.array(z.object({ id: z.string(), levelId: z.number().int().positive(), targetBarrierId: z.string().nullable(), label: z.string(), value: z.object({ events: z.array(z.record(z.string(), z.unknown())).optional() }).passthrough() }).passthrough()),
  levels: z.array(z.object({
    id: z.number().int().positive(), targetEpisodes: z.array(RiskEpisodeSchema),
    terminal: z.object({ phase: z.string(), reason: z.string(), level: z.number(), jumpedBarriers: z.number(), save: z.object({ completed: z.array(z.boolean()), best: z.array(z.record(z.string(), z.unknown())) }).passthrough() }).passthrough(),
  }).passthrough()),
  videos: z.array(z.object({ levelId: z.number().int().positive(), path: z.string(), sha256: SHA256 }).passthrough()), errors: z.array(z.unknown()),
}).passthrough();

const normalizeRelative = (value) => {
  const normalized = String(value ?? '').replaceAll('\\', '/').trim();
  if (!normalized || path.posix.isAbsolute(normalized) || path.win32.isAbsolute(normalized) || normalized.split('/').some((part) => part === '..') || /^(?:[a-z]+:)?\/\//iu.test(normalized)) throw new Error(`Unsafe run-relative path: ${value}`);
  return normalized;
};
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function readRunBytes(relative) {
  const normalized = normalizeRelative(relative);
  let current = path.resolve(RUN);
  const rootStat = await lstat(current);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Run root is not a regular directory');
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

function feelStateSemanticBlockers(report, expected) {
  const blockers = [];
  const prefix = 'attempts/attempt-' + expected.attempt + '/feel-state-' + expected.engine + '/';
  if (report.targetGame !== expected.game || report.workspace !== expected.workspace || report.engine !== expected.engine) blockers.push('feel-state-target-or-engine-mismatch');
  if (report.buildHash !== expected.buildHash) blockers.push('feel-state-build-hash-mismatch');
  if (report.normalInputOnly !== true || report.stateInjection !== false) blockers.push('feel-state-normal-input-provenance-invalid');
  if (report.passed !== true || !Array.isArray(report.errors) || report.errors.length !== 0) blockers.push('feel-state-report-failed-or-has-errors');
  const checks = Array.isArray(report.checks) ? report.checks : [];
  const checkNames = checks.map((item) => item?.name);
  if (checks.length !== expected.requiredChecks.length || new Set(checkNames).size !== expected.requiredChecks.length
      || expected.requiredChecks.some((name) => !checks.some((item) => item?.name === name && item.passed === true))) blockers.push('feel-state-required-check-set-incomplete-or-failed');
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
  const frames = Array.isArray(report.frames) ? report.frames : [];
  if (frames.length !== expected.plannedMs.length || frames.some((frame, index) => frame?.plannedMs !== expected.plannedMs[index]
      || !Number.isFinite(frame?.completedMs) || frame.completedMs < frame.plannedMs)) blockers.push('feel-state-six-frame-schedule-incomplete');
  const validCamera = (camera) => Array.isArray(camera?.position) && camera.position.length === 3
    && Array.isArray(camera?.quaternion) && camera.quaternion.length === 4
    && [...camera.position, ...camera.quaternion, camera.fov].every(Number.isFinite);
  if (frames.length !== expected.plannedMs.length || frames.some((frame) => frame?.before?.state?.phase !== 'running' || frame?.after?.state?.phase !== 'running'
      || frame.before.state.level !== 1 || frame.after.state.level !== 1
      || !Number.isFinite(frame.before.state.distance) || !Number.isFinite(frame.after.state.distance) || frame.after.state.distance <= frame.before.state.distance
      || !validCamera(frame.before.render?.camera) || !validCamera(frame.after.render?.camera))) blockers.push('feel-state-running-brackets-or-actual-camera-invalid');
  blockers.push(...feelStatePoseBlockers(report));
  const expectedNames = [...expected.plannedMs.map((value) => 'state-' + value + '.png'), 'terminal.png', 'replay.png'];
  const bindings = Array.isArray(report.screenshots) ? report.screenshots : [];
  const bindingNames = bindings.map((item) => item?.path?.startsWith(prefix) ? item.path.slice(prefix.length) : null);
  if (bindings.length !== expectedNames.length || new Set(bindingNames).size !== expectedNames.length
      || expectedNames.some((name, index) => bindingNames[index] !== name)
      || bindings.some((item) => !/^[a-f0-9]{64}$/u.test(item?.sha256 ?? ''))) blockers.push('feel-state-screenshot-set-or-path-invalid');
  if (frames.length === expected.plannedMs.length && bindings.length === expectedNames.length && frames.some((frame, index) => frame.image?.path !== bindings[index]?.path || frame.image?.sha256 !== bindings[index]?.sha256)) blockers.push('feel-state-frame-screenshot-binding-mismatch');
  if (!/^[a-f0-9]{64}$/u.test(report.driverSha256 ?? '')) blockers.push('feel-state-driver-hash-invalid');
  if (!report.video?.path?.startsWith(prefix) || !/^page@[a-f0-9]{32}\.webm$/u.test(report.video.path.slice(prefix.length)) || !/^[a-f0-9]{64}$/u.test(report.video.sha256 ?? '')) blockers.push('feel-state-video-binding-invalid');
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

const verifyFeelStateReport = async (rawReport, engine, attempt, buildHash) => {
  const parsed = FeelStateReportSchema.safeParse(rawReport);
  if (!parsed.success) throw new Error('Current-build feel-state/' + engine + ' report schema is invalid');
  const report = parsed.data;
  const blockers = feelStateSemanticBlockers(report, {
    game: GAME, workspace: WORKSPACE, engine, attempt, buildHash,
    requiredChecks: FEEL_STATE_CHECKS, plannedMs: FEEL_STATE_FRAME_MS,
  });
  if (blockers.length) throw new Error('Current-build feel-state/' + engine + ' rejected: ' + blockers.join('; '));
  const prefix = 'attempts/attempt-' + attempt + '/feel-state-' + engine + '/';
  const driverPath = prefix + 'driver-source.mjs';
  const driverBytes = await readRunBytes(driverPath);
  if (sha(driverBytes) !== report.driverSha256) throw new Error('Current-build feel-state/' + engine + ' driver source hash mismatch');
  const driverSource = driverBytes.toString('utf8');
  if (!driverSource.includes('window.__coast.snapshot()') || !driverSource.includes('window.__coast.renderInfo()') || !driverSource.includes('Input.dispatchTouchEvent')) throw new Error('Current-build feel-state/' + engine + ' driver does not prove read-only runtime capture and trusted touch');
  for (const screenshot of report.screenshots) if (sha(await readRunBytes(screenshot.path)) !== screenshot.sha256) throw new Error('Current-build feel-state/' + engine + ' screenshot hash mismatch: ' + screenshot.path);
  if (sha(await readRunBytes(report.video.path)) !== report.video.sha256) throw new Error('Current-build feel-state/' + engine + ' video hash mismatch');
  return {
    path: prefix + 'report.json', report,
    files: [
      { kind: 'feel-state-driver:' + engine, path: driverPath, sha256: report.driverSha256 },
      ...report.screenshots.map((item) => ({ kind: 'feel-state-screenshot:' + engine, path: item.path, sha256: item.sha256 })),
      { kind: 'feel-state-video:' + engine, path: report.video.path, sha256: report.video.sha256 },
    ],
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
const requiredRiskTransitions = ['jump-clearance', 'jump-choice', 'five-configured-levels', 'replay-mastery-records'];
const verifyRiskReport = async (raw, engine, attempt, buildHash) => {
  const report = RiskReportSchema.parse(raw);
  if (report.targetGame !== GAME || report.workspace !== WORKSPACE || report.engine !== engine || report.attempt !== attempt || report.buildHash !== buildHash || report.normalInputOnly !== true || report.stateInjection !== false) throw new Error(`Current-build risk/${engine} identity or input provenance mismatch`);
  if (report.passed !== true || report.errors.length || report.checks.length === 0 || report.checks.some((check) => check.passed !== true)) throw new Error(`Current-build risk/${engine} has failing raw checks/errors`);
  const byName = new Map(report.checks.map((check) => [check.name, check]));
  if (byName.size !== report.checks.length) throw new Error(`Current-build risk/${engine} contains duplicate checks`);
  const attemptPrefix = `attempts/attempt-${attempt}/risk-${engine}/`;
  const screenshotPaths = new Set();
  for (const screenshot of report.screenshots) {
    if (!screenshot.path.startsWith(attemptPrefix) || screenshotPaths.has(screenshot.path)) throw new Error(`Current-build risk/${engine} screenshot path is stale/duplicated: ${screenshot.path}`);
    screenshotPaths.add(screenshot.path);
    if (sha(await readRunBytes(screenshot.path)) !== screenshot.sha256) throw new Error(`Current-build risk/${engine} screenshot hash mismatch: ${screenshot.path}`);
  }
  const snapshotById = new Map(report.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const levelById = new Map(report.levels.map((level) => [level.id, level]));
  if (levelById.size !== 5 || report.levels.length !== 5 || [1, 2, 3, 4, 5].some((level) => !levelById.has(level))) throw new Error(`Current-build risk/${engine} does not contain exactly five level reports`);
  for (const spec of RISK_TARGETS) {
    const level = levelById.get(spec.level);
    if (level.targetEpisodes.length !== spec.barrierIds.length) throw new Error(`Current-build risk/${engine} level ${spec.level} has the wrong target count`);
    const episodes = new Map(level.targetEpisodes.map((episode) => [episode.barrierId, episode]));
    if (episodes.size !== spec.barrierIds.length || spec.barrierIds.some((id) => !episodes.has(id))) throw new Error(`Current-build risk/${engine} level ${spec.level} target IDs mismatch`);
    for (const barrierId of spec.barrierIds) {
      const fishId = `l${spec.level}-jump-${barrierId}`;
      const episode = episodes.get(barrierId);
      for (const name of riskCheckNames(spec.level, barrierId)) if (byName.get(name)?.passed !== true) throw new Error(`Current-build risk/${engine} check failed: ${name}`);
      const authored = byName.get(`authored-level-${spec.level}-${barrierId}-exact-golden-fish`);
      if (episode.goldFishId !== fishId || authored?.evidence?.barrierId !== barrierId || authored?.evidence?.expectedFishId !== fishId || authored?.evidence?.authoredFishId !== fishId || !String(authored?.evidence?.source ?? '').includes('sourceObstacleId -> fish.id')) throw new Error(`Current-build risk/${engine} static fish association failed for ${barrierId}`);
      const barrierCheck = byName.get(`level-${spec.level}-${barrierId}-exact-barrier-cleared-jumped`);
      const goldCheck = byName.get(`level-${spec.level}-${barrierId}-exact-golden-bonus-fish-maps-to-barrier`);
      const barrierEvent = barrierCheck?.evidence?.event;
      const goldEvent = goldCheck?.evidence?.event;
      if (barrierCheck?.evidence?.barrierId !== barrierId || barrierEvent?.type !== 'barrier-cleared' || barrierEvent.objectId !== barrierId || barrierEvent.jumped !== true) throw new Error(`Current-build risk/${engine} lacks real jumped barrier event ${barrierId}`);
      if (goldCheck?.evidence?.expectedBarrierId !== barrierId || goldCheck?.evidence?.expectedObjectId !== fishId || goldEvent?.type !== 'fish-caught' || goldEvent.objectId !== fishId || goldEvent.golden !== true || goldEvent.bonus !== true || !String(goldCheck?.evidence?.associationSource ?? '').includes('sourceObstacleId -> fish.id')) throw new Error(`Current-build risk/${engine} lacks real earned bonus fish event ${fishId}`);
      const barrierSnapshot = snapshotById.get(episode.barrierClearSnapshotId);
      const fishSnapshot = snapshotById.get(episode.bonusFishCatchSnapshotId);
      if (barrierSnapshot?.levelId !== spec.level || barrierSnapshot.targetBarrierId !== barrierId || barrierSnapshot.label !== 'exact-barrier-cleared-event' || !barrierSnapshot.value.events?.some((event) => event.type === 'barrier-cleared' && event.objectId === barrierId && event.jumped === true)) throw new Error(`Current-build risk/${engine} barrier snapshot binding failed for ${barrierId}`);
      if (fishSnapshot?.levelId !== spec.level || fishSnapshot.targetBarrierId !== barrierId || fishSnapshot.label !== 'exact-golden-bonus-fish-caught' || !fishSnapshot.value.events?.some((event) => event.type === 'fish-caught' && event.objectId === fishId && event.golden === true && event.bonus === true)) throw new Error(`Current-build risk/${engine} golden fish snapshot binding failed for ${barrierId}`);
      if (Number.isFinite(barrierEvent.at) && Number.isFinite(goldEvent.at) && goldEvent.at < barrierEvent.at) throw new Error(`Current-build risk/${engine} golden fish event predates barrier ${barrierId}`);
      const jumps = report.actions.filter((action) => action.levelId === spec.level && action.targetBarrierId === barrierId && action.selector === '[data-action="jump"]');
      const indexedJump = Number.isInteger(episode.jump?.actionIndex) ? report.actions[episode.jump.actionIndex] : null;
      if (!episode.hudSeen || !Number.isFinite(episode.jump?.countdown) || episode.jump.countdown < 0 || episode.jump.countdown > 1.15 || jumps.length !== 1 || indexedJump?.selector !== '[data-action="jump"]' || indexedJump?.trustedTouch !== true || indexedJump?.normalInputOnly !== true || indexedJump?.stateInjection !== false || episode.holdComplete !== true || !(episode.holdDurationMs >= 2600)) throw new Error(`Current-build risk/${engine} natural jump/2.6-second capture proof failed for ${barrierId}`);
      for (const suffix of [`-${barrierId}-barrier-cleared.png`, `-${barrierId}-golden-bonus-fish-caught.png`]) {
        if (!(episode.screenshots ?? []).some((item) => item.endsWith(suffix) && screenshotPaths.has(item))) throw new Error(`Current-build risk/${engine} exact target screenshot missing for ${barrierId}${suffix}`);
      }
    }
    const terminal = level.terminal;
    const completionEvent = terminal.events?.find((event) => event.type === 'complete' && event.reason === 'complete');
    const saveEarned = terminal.save.completed[spec.level - 1] === true && terminal.save.best[spec.level - 1]?.fish > 0;
    const jumpCountCheck = byName.get(`level-${spec.level}-exact-target-jump-count`);
    if (terminal.phase !== 'finished' || terminal.reason !== 'complete' || terminal.level !== spec.level || !completionEvent || !saveEarned || terminal.jumpedBarriers !== spec.barrierIds.length || jumpCountCheck?.passed !== true || jumpCountCheck.evidence?.expected !== spec.barrierIds.length || jumpCountCheck.evidence?.jumpedBarriers !== spec.barrierIds.length || byName.get(`level-${spec.level}-natural-terminal-settlement`)?.passed !== true || byName.get(`level-${spec.level}-save-earned-through-play`)?.passed !== true) throw new Error(`Current-build risk/${engine} real settlement/save failed for level ${spec.level}`);
    if (spec.level === 1 && byName.get('new-browser-starts-with-new-save')?.passed !== true) throw new Error(`Current-build risk/${engine} fresh-profile proof failed`);
    if (spec.level > 1 && byName.get(`level-${spec.level}-prior-levels-earned`)?.passed !== true) throw new Error(`Current-build risk/${engine} earned unlock proof failed for level ${spec.level}`);
  }
  if (byName.get('five-level-natural-campaign-completed')?.passed !== true) throw new Error(`Current-build risk/${engine} five-level campaign check failed`);
  const replay = report.snapshots.find((snapshot) => snapshot.label === 'visible-final-replay');
  if (byName.get('final-settlement-and-reopen')?.passed !== true || replay?.value.phase !== 'running' || replay.value.level !== 5 || replay.value.save?.completed?.[4] !== true) throw new Error(`Current-build risk/${engine} earned replay proof failed`);
  if (report.videos.length !== 5 || new Set(report.videos.map((video) => video.levelId)).size !== 5) throw new Error(`Current-build risk/${engine} must bind five level videos`);
  for (const video of report.videos) {
    if (video.path !== `${attemptPrefix}level-${video.levelId}.webm` || sha(await readRunBytes(video.path)) !== video.sha256) throw new Error(`Current-build risk/${engine} level video is stale or hash-invalid: ${video.levelId}`);
  }
  return report;
};

async function writeCandidateFile(name, bytes) {
  const safe = normalizeRelative(name);
  const destination = path.resolve(Candidate, safe);
  const relative = path.relative(Candidate, destination);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`Candidate path escapes release directory: ${name}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  return { path: safe, sha256: sha(bytes), bytes: bytes.byteLength };
}

const receipt = BuildReceiptSchema.parse(await readRunJson('build-receipt.json'));
const summary = SummarySchema.parse(await readRunJson('qa-summary-v3.json'));
const qaReport = QaReportSchema.parse(await readRunJson('qa-report-v3.json'));
const buildReport = BuildReportSchema.parse(await readRunJson('build-report-v3.json'));
const evidenceManifest = EvidenceManifestSchema.parse(await readRunJson(summary.evidenceManifestPath));

if (receipt.workspace !== WORKSPACE || summary.workspace !== WORKSPACE || evidenceManifest.workspace !== WORKSPACE) throw new Error('Run/workspace identity mismatch');
if (receipt.attempt !== summary.attempt || receipt.buildHash !== summary.buildHash || evidenceManifest.attempt !== receipt.attempt || evidenceManifest.buildHash !== receipt.buildHash) throw new Error('Build receipt, summary, and evidence manifest do not describe one build');
const contractBytes = await readRunBytes('product-experience-contract.json');
const contractHash = sha(contractBytes);
const productContract = ProductExperienceContractSchema.parse(JSON.parse(contractBytes.toString('utf8')));
const contractCaseCount = productContract.features.reduce((count, feature) => count + feature.requiredViewports.length, 0);
if (productContract.targetGame !== GAME || productContract.targetRunId !== RUN_ID || productContract.targetWorkspace !== WORKSPACE || productContract.features.length !== 15 || contractCaseCount !== 30 || !productContract.features.some((feature) => feature.id === 'replay-mastery-records') || !productContract.runtimeEntrypoints.includes('source/pelican-bike/src/engagement.mjs')) throw new Error('Current product contract is not the expected 15-feature/30-case engagement contract');
if (summary.productContract.path !== 'product-experience-contract.json' || summary.productContract.sha256 !== contractHash || summary.productContract.featureCount !== 15 || summary.productContract.requiredCaseCount !== 30 || JSON.stringify(summary.productContract.runtimeEntrypoints) !== JSON.stringify(productContract.runtimeEntrypoints)) throw new Error('Current product contract summary/hash does not match the Zod-validated source contract');
const contractBinding = evidenceManifest.copyFiles.find((item) => item.kind === 'experience-contract' && item.path === 'product-experience-contract.json');
if (!contractBinding || contractBinding.sha256 !== contractHash) throw new Error('Current product contract is not hash-bound in the current-run evidence manifest');
if (!summary.scriptedCoreJourneyPassed || !summary.independentPerceptualPassed || !summary.runtimeProductJourneyPassed || !summary.readiness.h5DevicePlaytestCandidate) throw new Error('Desktop H5 candidate gates are incomplete; no ZIP was written');
if (summary.releaseReady || summary.productionReady || qaReport.passed || buildReport.completion?.status !== 'RELEASE_BLOCKED') throw new Error('Refusing to package a report that claims production/release readiness or omits release blockers');
if (!summary.blockers.some((item) => /Physical iPhone|Android playtest/iu.test(item)) || !summary.blockers.some((item) => /background|lock-screen/iu.test(item)) || !summary.blockers.some((item) => /TapTap advertising/iu.test(item)) || !summary.blockers.some((item) => /WeChat and Douyin/iu.test(item)) || !summary.blockers.some((item) => /human|enjoyment|retention/iu.test(item))) throw new Error('Required physical-device, background, advertising, human-playtest, or native-package BLOCKED status is missing');

const requiredReports = [
  ['campaign', 'webkit'], ['campaign', 'chromium'], ['collision', 'webkit'], ['collision', 'chromium'],
  ['experience', 'webkit'], ['experience', 'chromium'], ['head', 'webkit'], ['head', 'chromium'],
  ['risk', 'webkit'], ['risk', 'chromium'], ['feel-state', 'webkit'], ['feel-state', 'chromium'], ['visual', 'webkit'],
];
for (const [kind, engine] of requiredReports) {
  if (!summary.reports.some((report) => report.kind === kind && report.engine === engine && report.status === 'PASS')) throw new Error(`Current-build ${kind}/${engine} report is not PASS`);
}
for (const engine of ['webkit', 'chromium']) {
  const expectedPath = `attempts/attempt-${receipt.attempt}/experience-${engine}/report.json`;
  const summaryReport = summary.reports.find((report) => report.kind === 'experience' && report.engine === engine);
  const manifestReport = evidenceManifest.reports.find((report) => report.kind === 'experience' && report.engine === engine);
  const copyBinding = evidenceManifest.copyFiles.find((item) => item.path === expectedPath && item.kind === `experience:${engine}`);
  if (!summaryReport || !manifestReport || !copyBinding || summaryReport.path !== expectedPath || manifestReport.path !== expectedPath || summaryReport.status !== 'PASS' || manifestReport.status !== 'PASS' || summaryReport.sha256 !== manifestReport.sha256 || copyBinding.sha256 !== manifestReport.sha256) throw new Error(`Current-build experience/${engine} raw report is not manifest-bound`);
  const experienceBytes = await readRunBytes(expectedPath);
  if (sha(experienceBytes) !== manifestReport.sha256) throw new Error(`Current-build experience/${engine} report hash mismatch`);
  const experienceReport = JSON.parse(experienceBytes.toString('utf8'));
  const prizeCueChecks = experienceReport.checks?.filter((check) => check.name === 'earned-jump-prize-has-visible-route-cue') ?? [];
  if (experienceReport.targetGame !== GAME || experienceReport.workspace !== WORKSPACE || experienceReport.buildHash !== receipt.buildHash || experienceReport.normalInputOnly !== true || experienceReport.stateInjection !== false || experienceReport.errors?.length || prizeCueChecks.length !== 1 || prizeCueChecks[0].passed !== true) throw new Error(`Current-build experience/${engine} lacks the earned jump prize visible-route-cue check`);
}
const currentRiskReports = new Map();
for (const engine of ['webkit', 'chromium']) {
  const expectedPath = `attempts/attempt-${receipt.attempt}/risk-${engine}/report.json`;
  const summaryReport = summary.reports.find((report) => report.kind === 'risk' && report.engine === engine);
  const manifestReport = evidenceManifest.reports.find((report) => report.kind === 'risk' && report.engine === engine);
  const riskSummary = summary.riskEvidence.find((item) => item.engine === engine);
  const copyBinding = evidenceManifest.copyFiles.find((item) => item.path === expectedPath && item.kind === `risk:${engine}`);
  if (!summaryReport || !manifestReport || !riskSummary || !copyBinding || summaryReport.path !== expectedPath || manifestReport.path !== expectedPath || riskSummary.path !== expectedPath || summaryReport.status !== 'PASS' || manifestReport.status !== 'PASS' || riskSummary.status !== 'PASS' || summaryReport.sha256 !== manifestReport.sha256 || riskSummary.sha256 !== manifestReport.sha256 || copyBinding.sha256 !== manifestReport.sha256) throw new Error(`Current-build risk/${engine} report binding is incomplete or stale`);
  const riskBytes = await readRunBytes(expectedPath);
  if (sha(riskBytes) !== manifestReport.sha256) throw new Error(`Current-build risk/${engine} report hash mismatch`);
  const riskReport = await verifyRiskReport(JSON.parse(riskBytes.toString('utf8')), engine, receipt.attempt, receipt.buildHash);
  if (riskSummary.targetCount !== RISK_TARGET_COUNT || riskSummary.barrierEvidence.length !== RISK_TARGET_COUNT || riskSummary.barrierEvidence.some((item) => !item.naturalJumpPassed || item.barrierEventObjectId !== item.barrierId || item.goldFishEventObjectId !== item.goldFishId || !item.goldFishGolden || !item.goldFishBonus) || riskSummary.settlements.length !== 5 || riskSummary.settlements.some((item) => item.status !== 'PASS' || !item.completionEvent || !item.earnedSave) || !riskSummary.replayObserved || riskSummary.blockers.length) throw new Error(`Current-build risk/${engine} summary does not prove all jumps, earned fish, settlements, save and replay`);
  const expectedByLevel = RISK_TARGETS.map((item) => ({ level: item.level, count: item.barrierIds.length, barrierIds: item.barrierIds }));
  if (JSON.stringify(riskSummary.targetsByLevel) !== JSON.stringify(expectedByLevel)) throw new Error(`Current-build risk/${engine} summary target ID/count set mismatch`);
  currentRiskReports.set(engine, { path: expectedPath, sha256: manifestReport.sha256, report: riskReport });
}
for (const engine of ['webkit', 'chromium']) {
  const kind = `v3-risk-natural-flow-${engine}`;
  const expectedPath = `artifacts/natural/v3-risk-${engine}.json`;
  const flowSummary = summary.naturalFlows.find((flow) => flow.kind === kind);
  const manifestTrace = evidenceManifest.naturalTraces.find((trace) => trace.kind === kind && trace.path === expectedPath);
  const copyBinding = evidenceManifest.copyFiles.find((item) => item.path === expectedPath && item.kind === kind);
  if (!flowSummary || !manifestTrace || !copyBinding || flowSummary.path !== expectedPath || flowSummary.status !== 'PASS' || manifestTrace.status !== 'PASS' || flowSummary.sha256 !== manifestTrace.sha256 || copyBinding.sha256 !== manifestTrace.sha256 || flowSummary.blockers.length) throw new Error(`Current-build risk natural flow/${engine} is missing, stale, or not PASS`);
  const traceBytes = await readRunBytes(expectedPath);
  if (sha(traceBytes) !== manifestTrace.sha256) throw new Error(`Current-build risk natural flow/${engine} hash mismatch`);
  const trace = NaturalFlowEvidenceSchema.parse(JSON.parse(traceBytes.toString('utf8')));
  const source = currentRiskReports.get(engine);
  const allowedShots = new Set(source.report.screenshots.map((item) => item.path));
  if (!trace.passed || !trace.startedFromReset || trace.actions.length < 2 || !['terminal', 'settlement'].includes(trace.completion) || !trace.replayObserved || trace.forbiddenOperations.length || trace.buildHash !== receipt.buildHash || trace.runtime !== 'web-lite' || trace.device?.width !== 390 || trace.device?.height !== 844 || trace.device?.label !== 'mobile-portrait') throw new Error(`Current-build risk natural flow/${engine} does not prove a fresh natural journey through replay`);
  const transitionNames = trace.transitions.map((transition) => transition.name);
  if (new Set(transitionNames).size !== transitionNames.length || requiredRiskTransitions.some((name) => !trace.transitions.some((transition) => transition.name === name && transition.changed && transition.evidence.includes(source.path)))) throw new Error(`Current-build risk natural flow/${engine} transitions are missing or unbound to its risk report`);
  if (!trace.screenshots.length || trace.screenshots.some((screenshot) => !allowedShots.has(screenshot))) throw new Error(`Current-build risk natural flow/${engine} screenshots are not bound to its matching raw report`);
}
const currentFeelStateReports = new Map();
for (const engine of ['webkit', 'chromium']) {
  const expectedPath = `attempts/attempt-${receipt.attempt}/feel-state-${engine}/report.json`;
  const summaryReport = summary.reports.find((report) => report.kind === 'feel-state' && report.engine === engine);
  const manifestReport = evidenceManifest.reports.find((report) => report.kind === 'feel-state' && report.engine === engine);
  const copyBinding = evidenceManifest.copyFiles.find((item) => item.path === expectedPath && item.kind === `feel-state:${engine}`);
  if (!summaryReport || !manifestReport || !copyBinding || summaryReport.path !== expectedPath || manifestReport.path !== expectedPath
      || summaryReport.status !== 'PASS' || manifestReport.status !== 'PASS' || summaryReport.sha256 !== manifestReport.sha256 || copyBinding.sha256 !== manifestReport.sha256) throw new Error(`Current-build feel-state/${engine} report binding is incomplete or stale`);
  const rawBytes = await readRunBytes(expectedPath);
  if (sha(rawBytes) !== manifestReport.sha256) throw new Error(`Current-build feel-state/${engine} report hash mismatch`);
  const verified = await verifyFeelStateReport(JSON.parse(rawBytes.toString('utf8')), engine, receipt.attempt, receipt.buildHash);
  const requiredFiles = verified.files;
  const bindings = requiredFiles.map((file) => evidenceManifest.copyFiles.find((item) => item.kind === file.kind && item.path === file.path && item.sha256 === file.sha256));
  if (bindings.some((item) => !item) || new Set(bindings.map((item) => item.path)).size !== requiredFiles.length) throw new Error(`Current-build feel-state/${engine} source/media files are not fully manifest-bound`);
  const shotBindings = evidenceManifest.screenshots.filter((item) => item.sourceReport === expectedPath);
  if (shotBindings.length !== verified.report.screenshots.length || verified.report.screenshots.some((shot) => !shotBindings.some((item) => item.path === shot.path && item.sha256 === shot.sha256))) throw new Error(`Current-build feel-state/${engine} screenshots are not report-bound in the manifest`);
  currentFeelStateReports.set(engine, verified);
}
for (const engine of ['webkit', 'chromium']) {
  const kind = `v3-feel-state-natural-flow-${engine}`;
  const expectedPath = `artifacts/natural/v3-feel-state-${engine}.json`;
  const summaryFlow = summary.naturalFlows.find((flow) => flow.kind === kind);
  const manifestTrace = evidenceManifest.naturalTraces.find((trace) => trace.kind === kind && trace.path === expectedPath);
  const copyBinding = evidenceManifest.copyFiles.find((item) => item.path === expectedPath && item.kind === kind);
  if (!summaryFlow || !manifestTrace || !copyBinding || summaryFlow.path !== expectedPath || summaryFlow.status !== 'PASS' || manifestTrace.status !== 'PASS'
      || summaryFlow.sha256 !== manifestTrace.sha256 || copyBinding.sha256 !== manifestTrace.sha256 || summaryFlow.blockers.length) throw new Error(`Current-build feel-state natural flow/${engine} is missing, stale, or not PASS`);
  const traceBytes = await readRunBytes(expectedPath);
  if (sha(traceBytes) !== manifestTrace.sha256) throw new Error(`Current-build feel-state natural flow/${engine} hash mismatch`);
  const trace = NaturalFlowEvidenceSchema.parse(JSON.parse(traceBytes.toString('utf8')));
  const source = currentFeelStateReports.get(engine);
  const expectedActions = source.report.actions.map((action) => `${action.type} ${action.selector}`);
  const expectedScreenshots = source.report.screenshots.map((item) => item.path);
  const transitionNames = trace.transitions.map((transition) => transition.name);
  if (!trace.passed || !trace.startedFromReset || trace.buildHash !== receipt.buildHash || trace.runtime !== 'web-lite'
      || trace.completion !== 'terminal' || !trace.replayObserved || trace.forbiddenOperations.length
      || trace.device?.width !== 390 || trace.device?.height !== 844 || trace.device?.label !== 'mobile-portrait'
      || JSON.stringify(trace.actions) !== JSON.stringify(expectedActions) || JSON.stringify(trace.screenshots) !== JSON.stringify(expectedScreenshots)) throw new Error(`Current-build feel-state natural flow/${engine} does not match its raw normal-input terminal/replay report`);
  if (JSON.stringify(transitionNames) !== JSON.stringify(FEEL_STATE_TRANSITIONS)
      || trace.transitions.some((transition) => !transition.changed || !transition.evidence.includes(source.path))) throw new Error(`Current-build feel-state natural flow/${engine} transition set/order is missing or unbound to its raw report`);
}
const safetyCheckNames = [
  'van-target-distance-reached', 'van-ends-round', 'car-not-jumpable',
  'distance-and-fish-jointly-required', 'tab-blur-pauses', 'background-manual-resume',
  'replay-resources-plateau',
];
const lifecycleManifestReport = evidenceManifest.reports.find((item) => item.kind === 'lifecycle');
const lifecycleEvidence = lifecycleManifestReport ? await readRunJson(lifecycleManifestReport.path) : null;
const verifiedNoSignalDiagnostic = (engine, evidence) => {
  const diagnosticName = engine === 'webkit' ? 'headless-webkit-tab-capability' : 'headless-chromium-tab-capability';
  const diagnostic = evidence?.diagnostics?.find((item) => item.name === diagnosticName);
  const away = diagnostic?.observation?.away;
  const events = away?.events;
  const hasSignal = Array.isArray(events) && events.some((event) => event.type === 'blur' || event.type === 'pagehide' || event.hidden === true);
  return Boolean(diagnostic && Array.isArray(events) && events.length === 0 && !hasSignal
    && away?.state?.phase !== 'paused' && away?.state?.pausedBySystem !== true
    && away?.visibility !== 'hidden' && events.every((event) => event.hidden !== true)
    && diagnostic.classification === 'NO_BACKGROUND_SIGNAL_FROM_HEADLESS_TABS');
};
for (const engine of ['webkit', 'chromium']) {
  const safety = summary.safetyEvidence.find((item) => item.engine === engine);
  const manifestReport = evidenceManifest.reports.find((item) => item.kind === 'safety' && item.engine === engine);
  const safetyReport = summary.reports.find((item) => item.kind === 'safety' && item.engine === engine);
  if (!safety || !manifestReport || !safetyReport || safety.path !== safetyReport.path || safety.status !== safetyReport.status || manifestReport.status !== safety.status) throw new Error(`Current-build safety/${engine} evidence binding is incomplete`);
  const checks = new Map(safety.checks.map((check) => [check.name, check.status]));
  const expected = safetyCheckNames;
  if (checks.size !== expected.length || expected.some((name) => !checks.has(name))) throw new Error(`Current-build safety/${engine} check set is incomplete`);
  for (const name of expected.filter((item) => !['tab-blur-pauses', 'background-manual-resume'].includes(item))) if (checks.get(name) !== 'PASS') throw new Error(`Current-build safety/${engine} check failed: ${name}`);
  const safetyBytes = await readRunBytes(safety.path);
  if (sha(safetyBytes) !== manifestReport.sha256 || !evidenceManifest.copyFiles.some((item) => item.path === safety.path && item.sha256 === manifestReport.sha256)) throw new Error(`Current-build safety/${engine} report is not bound by the current-run manifest`);
  const rawSafety = JSON.parse(safetyBytes.toString('utf8'));
  if (rawSafety.targetGame !== GAME || rawSafety.workspace !== WORKSPACE || rawSafety.buildHash !== receipt.buildHash || rawSafety.attempt !== receipt.attempt || rawSafety.mode !== 'safety' || rawSafety.engine !== engine || rawSafety.errors?.length) throw new Error(`Current-build safety/${engine} report identity or error state is invalid`);
  for (const name of expected) {
    const rawCheck = rawSafety.checks?.find((item) => item.name === name);
    if (!rawCheck || (rawCheck.passed === true) !== (checks.get(name) === 'PASS')) throw new Error(`Safety summary/raw-check mismatch: ${engine}/${name}`);
  }
  const blockedBackground = expected.filter((name) => ['tab-blur-pauses', 'background-manual-resume'].includes(name) && checks.get(name) === 'BLOCKED');
  if (expected.some((name) => ['tab-blur-pauses', 'background-manual-resume'].includes(name) && checks.get(name) === 'FAIL')) throw new Error(`Current-build safety/${engine} background check failed with an observed signal`);
  if (blockedBackground.length) {
    if (safety.status !== 'BLOCKED' || safety.environmentBlockedChecks.length !== blockedBackground.length || blockedBackground.some((name) => !safety.environmentBlockedChecks.includes(name))) throw new Error(`Current-build safety/${engine} BLOCKED classification is inconsistent`);
    const diagnosticName = engine === 'webkit' ? 'headless-webkit-tab-capability' : 'headless-chromium-tab-capability';
    if (!safety.environmentalEvidence?.passed || safety.environmentalEvidence.diagnosticName !== diagnosticName || safety.environmentalEvidence.path !== lifecycleManifestReport?.path || !verifiedNoSignalDiagnostic(engine, lifecycleEvidence)) throw new Error(`Current-build safety/${engine} lacks matching lifecycle environment evidence`);
    if (rawSafety.passed !== false) throw new Error(`Current-build safety/${engine} BLOCKED checks were incorrectly projected as passing`);
  } else if (safety.status !== 'PASS' || safety.environmentBlockedChecks.length) throw new Error(`Current-build safety/${engine} status is inconsistent with its checks`);
  if (safety.status === 'FAIL' || safetyReport.status === 'FAIL') throw new Error(`Current-build safety/${engine} failed; no ZIP was written`);
}
const headFlows = summary.naturalFlows.filter((flow) => flow.kind.startsWith('v3-head-natural-flow-'));
if (headFlows.length !== 8 || headFlows.some((flow) => flow.status !== 'PASS')) throw new Error('All eight current-build natural head traces must pass before packaging');
for (const flow of headFlows) {
  const manifestTrace = evidenceManifest.naturalTraces.find((entry) => entry.kind === flow.kind && entry.path === flow.path && entry.sha256 === flow.sha256 && entry.status === 'PASS');
  if (!manifestTrace) throw new Error(`Natural head trace is not manifest-bound: ${flow.kind}`);
}

const platformBytes = await readFile(path.join(WORKSPACE, 'game/platform.json'));
const platform = JSON.parse(platformBytes.toString('utf8'));
const platformStatusSchema = z.object({
  wechatMiniGame: z.object({ status: z.literal('NOT_PACKAGED') }).passthrough(),
  douyinMiniGame: z.object({ status: z.literal('NOT_PACKAGED') }).passthrough(),
  tapTapH5: z.object({ status: z.literal('NOT_INTEGRATED'), liveAds: z.literal(false) }).passthrough(),
  production: z.literal(false),
}).passthrough();
platformStatusSchema.parse(platform);

const htmlBytes = await readFile(path.join(WORKSPACE, 'game/index.html'));
if (sha(htmlBytes) !== receipt.buildHash) throw new Error('Built HTML no longer matches the current build receipt');
const licenseBytes = await readFile(path.join(WORKSPACE, 'game/LICENSE.three.txt'));
if (!licenseBytes.length) throw new Error('Three.js license file is empty');

// Re-parse the validated inputs against the shared schemas; this import also
// keeps the script's file references resolvable when merged into the main tree.
QaReportSchema.parse(qaReport);
BuildReportSchema.parse(buildReport);

await mkdir(Candidate, { recursive: true });
const reportCopies = [
  { name: 'qa-report-v3.json', source: 'qa-report-v3.json' },
  { name: 'build-report-v3.json', source: 'build-report-v3.json' },
  { name: 'qa-summary-v3.json', source: 'qa-summary-v3.json' },
  { name: 'qa-evidence-manifest-v3.json', source: summary.evidenceManifestPath },
  { name: 'build-receipt-v3.json', source: 'build-receipt.json' },
];
const written = [];
for (const copy of reportCopies) written.push(await writeCandidateFile(copy.name, await readRunBytes(copy.source)));
written.push(await writeCandidateFile('index.html', htmlBytes));
written.push(await writeCandidateFile('LICENSE.three.txt', licenseBytes));
written.push(await writeCandidateFile('platform.json', platformBytes));

// Copy only manifest-bound current-run JSON plus the verified feel-state
// driver, screenshots, and videos from this attempt.
const copiedEvidence = [];
for (const entry of evidenceManifest.copyFiles) {
  const relative = normalizeRelative(entry.path);
  if (!relative.endsWith('.json')) {
    const match = /^feel-state-(driver|screenshot|video):(webkit|chromium)$/u.exec(entry.kind);
    const source = match ? currentFeelStateReports.get(match[2]) : null;
    if (!source || !source.files.some((file) => file.kind === entry.kind && file.path === relative && file.sha256 === entry.sha256)) throw new Error(`Non-JSON evidence is not a verified current feel-state file: ${relative}`);
    const expectedExtension = match[1] === 'driver' ? '.mjs' : match[1] === 'screenshot' ? '.png' : '.webm';
    if (!relative.endsWith(expectedExtension)) throw new Error(`Feel-state evidence extension does not match its manifest kind: ${relative}`);
  }
  const bytes = await readRunBytes(relative);
  if (sha(bytes) !== entry.sha256) throw new Error(`Current-run manifest hash mismatch: ${relative}`);
  const destination = `evidence/attempt-${receipt.attempt}/${relative}`;
  copiedEvidence.push(await writeCandidateFile(destination, bytes));
}
written.push(...copiedEvidence);

const levels = summary.levels.length ? summary.levels.map((level) => `| ${level.level} | ${level.distance ?? '—'} m | ${level.fish ?? '—'} 条 / 金鱼 ${level.gold ?? '—'} | ${Number.isFinite(level.elapsedSeconds) ? `${level.elapsedSeconds.toFixed(1)} 秒` : '—'} | ${level.result ?? '—'} |`).join('\n') : '| — | 当前 attempt 报告未提供五关结果 | — | — | BLOCKED |';
const reportTable = evidenceManifest.reports.map((item) => `| ${item.kind} | ${item.engine ?? '—'} | ${item.status} | \`${item.path}\` |`).join('\n');
const naturalFlowTable = summary.naturalFlows.map((item) => `| ${item.kind} | ${item.status} | \`${item.path}\` |`).join('\n');
const readme = `# ${GAME} V3 · H5 开发试玩候选\n\n状态：**BLOCKED，未通过 release gate**。此包只用于本地/设备 H5 试玩，不是 WeChat、Douyin 或 TapTap 原生发布包，也不代表生产放行。\n\n- 目标游戏：${GAME}\n- 工作区：\`${WORKSPACE}\`\n- Run：\`${RUN_ID}\` · attempt ${receipt.attempt}\n- 已测试 HTML SHA-256：\`${receipt.buildHash}\`\n- 产品合约：15 个 feature / 30 个 viewport case，含 engagement runtime entrypoint\n- 基线提交：\`${BASE}\`\n\n解压后用静态 HTTP 服务打开 \`index.html\`。包内包含实际通过本轮 build receipt 绑定的单文件 H5、Three.js license、平台状态、机器报告副本及 manifest 指定的本轮 JSON 证据与 feel-state driver、截图和视频。feel-state 材料只证明当前构建的观测与正常触控路径，不证明独立玩家的乐趣或留存。\n\n## 当前构建的桌面浏览器证据\n\n| QA 类别 | 浏览器 | 状态 | 当前 attempt 报告 |\n|---|---|---|---|\n${reportTable}\n\n## 自然流程与风险追踪\n\n| 轨迹 | 状态 | 报告 |\n|---|---|---|\n${naturalFlowTable}\n\n风险报告逐一绑定 12 个指定障碍跳跃、实际 earned golden fish objectId、五关结算/存档与最终重玩；静态 fish-source association 仅作为工程映射证据。\n\n## 五关自然流程\n\n| 关卡 | 路程 | 捕鱼 | 用时 | 结果 |\n|---|---:|---:|---:|---|\n${levels}\n\n## 仍为 BLOCKED 的发布条件\n\n- iPhone/Android 真机操作、低端设备性能、发热和长局稳定性尚未验证。\n- 手机真实切后台、锁屏、来电中断与恢复尚未验证；桌面浏览器或注入事件不能替代真机证据。\n- TapTap 实际广告尚未接入，不存在模拟广告奖励。\n- WeChat Mini Game 与 Douyin Mini Game 原生包未打包。\n- 独立人类玩家的乐趣、可用性与留存测试和生产发布仍未完成。\n\n平台状态：WeChat=${platform.wechatMiniGame.status}，Douyin=${platform.douyinMiniGame.status}，TapTap Ads=${platform.tapTapH5.status}，production=${platform.production}。\n\n包内 \`qa-report-v3.json\`、\`build-report-v3.json\`、\`qa-summary-v3.json\` 和 \`qa-evidence-manifest-v3.json\` 可机器复核。\n`;
written.push(await writeCandidateFile('README.zh-CN.md', Buffer.from(readme, 'utf8')));

const payloadNames = [
  'index.html', 'LICENSE.three.txt', 'platform.json', 'README.zh-CN.md',
  'build-receipt-v3.json', 'build-report-v3.json', 'qa-report-v3.json',
  'qa-summary-v3.json', 'qa-evidence-manifest-v3.json',
  ...copiedEvidence.map((item) => item.path),
];
const payload = [];
for (const name of payloadNames) {
  const bytes = await readFile(path.join(Candidate, name));
  payload.push({ path: name, sha256: sha(bytes), bytes: bytes.byteLength });
}
const packageManifest = {
  schemaVersion: 1, targetGame: GAME, runId: RUN_ID, attempt: receipt.attempt,
  buildHash: receipt.buildHash, releaseReady: false, archiveKind: 'h5-device-playtest-candidate',
  includedFiles: payload, createdAt: new Date().toISOString(),
};
written.push(await writeCandidateFile('package-manifest-v3.json', Buffer.from(JSON.stringify(packageManifest, null, 2) + '\n', 'utf8')));

const zipName = 'pelican-coast-v3-h5-candidate.zip';
const zipPath = path.join(Candidate, zipName);
const pythonZip = [
  'import pathlib,sys,zipfile',
  'root=pathlib.Path(sys.argv[1])',
  'dest=pathlib.Path(sys.argv[2])',
  'names=sys.argv[3:]',
  'with zipfile.ZipFile(dest,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:',
  '  for name in names:',
  '    p=root/name',
  '    if not p.is_file(): raise SystemExit("missing archive input: "+name)',
  '    z.write(p,arcname=name)',
].join('\n');
execFileSync('python3', ['-c', pythonZip, Candidate, zipPath, ...payloadNames, 'package-manifest-v3.json'], { stdio: 'inherit' });
const zipBytes = await readFile(zipPath);
const zipHash = sha(zipBytes);

const sidecarRows = [
  { path: zipName, sha256: zipHash, bytes: zipBytes.byteLength },
  ...written.filter((item) => !item.path.startsWith('evidence/')),
].filter((item, index, rows) => rows.findIndex((row) => row.path === item.path) === index);
const shaText = sidecarRows.map((item) => `${item.sha256}  ${item.path}`).join('\n') + '\n';
const checksumFile = await writeCandidateFile('sha256-v3.txt', Buffer.from(shaText, 'utf8'));
const downloadManifest = {
  schemaVersion: 1, targetGame: GAME, runId: RUN_ID, attempt: receipt.attempt,
  workspace: WORKSPACE, buildHash: receipt.buildHash, releaseReady: false,
  archive: { path: zipName, sha256: zipHash, bytes: zipBytes.byteLength },
  packageManifest: { path: 'package-manifest-v3.json', sha256: sha(await readFile(path.join(Candidate, 'package-manifest-v3.json'))) },
  checksums: checksumFile,
  copiedEvidenceCount: copiedEvidence.length,
  copiedEvidenceRoot: `evidence/attempt-${receipt.attempt}/`,
  files: [...sidecarRows, { path: 'sha256-v3.txt', sha256: checksumFile.sha256, bytes: checksumFile.bytes }],
  createdAt: new Date().toISOString(),
};
await writeFile(path.join(Candidate, 'download-manifest-v3.json'), JSON.stringify(downloadManifest, null, 2) + '\n');

console.log(JSON.stringify({
  targetGame: GAME, workspace: WORKSPACE, attempt: receipt.attempt, buildHash: receipt.buildHash,
  archive: path.join(Candidate, zipName), sha256: zipHash, bytes: zipBytes.byteLength,
  reportCopies: reportCopies.map((item) => path.join(Candidate, item.name)),
  copiedEvidenceCount: copiedEvidence.length, releaseReady: false,
  remainingGaps: summary.blockers,
}, null, 2));
