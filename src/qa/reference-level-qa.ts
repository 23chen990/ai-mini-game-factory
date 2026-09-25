import { chromium, type Page } from '@playwright/test';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RuntimeAdapter } from '../adapters/runtime.js';
import { evaluateReferenceLevelRuntimeTrace } from '../core/reference-level.js';
import { sha256File, sha256Text } from '../core/files.js';
import { QaReportSchema, type QaReport } from '../schemas/index.js';
import { ReferenceLevelComparisonGateSchema, ReferenceLevelImplementationContractSchema, ReferenceLevelRuntimeTraceSchema, type ReferenceLevelComparisonGate, type ReferenceLevelImplementationContract, type ReferenceLevelRuntimeTrace } from '../schemas/reference-recording.js';
import { ReferenceLevelRuntimeDataSchema, type ReferenceLevelRuntimeData } from '../schemas/reference-level-runtime.js';
import { verifyReferenceLevelRuntimeDataFile, verifyReferenceLevelLayoutFile } from '../core/reference-level-binding.js';

type RuntimeSnapshot = {
  checkpointId: string;
  capturedAtMs: number;
  runtimeBinding?: ReferenceLevelRuntimeTrace['checkpoints'][number]['runtimeBinding'];
  phase: ReferenceLevelRuntimeTrace['checkpoints'][number]['phase'];
  objectStates: ReferenceLevelRuntimeTrace['checkpoints'][number]['objectStates'];
  observedRelationIds: string[];
  cameraMode: ReferenceLevelRuntimeTrace['checkpoints'][number]['cameraMode'];
  visibleFeedbackIds: string[];
  terminal?: { reached?: boolean; result?: string; causeVisible?: boolean; settlementVisible?: boolean };
};

export type ReferenceLevelQaInput = {
  runtime: RuntimeAdapter;
  workspace: string;
  runRoot: string;
  contract: ReferenceLevelImplementationContract;
  runtimeData: ReferenceLevelRuntimeData;
  buildHash: string;
  viewport: { width: number; height: number; label: string };
};

export type ReferenceLevelQaRunner = (input: ReferenceLevelQaInput) => Promise<{
  trace: ReferenceLevelRuntimeTrace;
  gate: ReferenceLevelComparisonGate;
}>;

function parseSnapshot(value: unknown): RuntimeSnapshot {
  if (!value || typeof value !== 'object') throw new Error('reference level snapshot is not an object');
  const raw = value as Record<string, unknown>;
  const objectStates = Array.isArray(raw.objectStates) ? raw.objectStates : Array.isArray(raw.objects) ? raw.objects : [];
  const candidate = {
    sourceCheckpointId: String(raw.checkpointId ?? ''),
    ...(raw.runtimeBinding === undefined ? {} : { runtimeBinding: raw.runtimeBinding }),
    capturedAtMs: typeof raw.capturedAtMs === 'number' && Number.isFinite(raw.capturedAtMs) ? raw.capturedAtMs : undefined,
    phase: raw.phase,
    objectStates,
    observedRelationIds: Array.isArray(raw.observedRelationIds) ? raw.observedRelationIds : Array.isArray(raw.relationIds) ? raw.relationIds : [],
    cameraMode: raw.cameraMode,
    visibleFeedbackIds: Array.isArray(raw.visibleFeedbackIds) ? raw.visibleFeedbackIds : [],
  };
  const parsed = ReferenceLevelRuntimeTraceSchema.shape.checkpoints.element.parse(candidate);
  return { checkpointId: parsed.sourceCheckpointId, capturedAtMs: parsed.capturedAtMs ?? Number.NaN, runtimeBinding: parsed.runtimeBinding, phase: parsed.phase, objectStates: parsed.objectStates, observedRelationIds: parsed.observedRelationIds, cameraMode: parsed.cameraMode, visibleFeedbackIds: parsed.visibleFeedbackIds, ...(raw.terminal && typeof raw.terminal === 'object' ? { terminal: raw.terminal as RuntimeSnapshot['terminal'] } : {}) };
}

async function snapshot(page: Page) {
  return parseSnapshot(await page.evaluate(() => {
    const api = (window as unknown as { __REFERENCE_LEVEL_TEST__?: { getSnapshot(): unknown } }).__REFERENCE_LEVEL_TEST__;
    if (!api || typeof api.getSnapshot !== 'function') throw new Error('window.__REFERENCE_LEVEL_TEST__.getSnapshot is unavailable');
    const value = api.getSnapshot();
    return value && typeof value === 'object' ? { ...(value as Record<string, unknown>), capturedAtMs: performance.now() } : value;
  }));
}

async function performNaturalInput(page: Page, action: ReferenceLevelImplementationContract['interactionSequence'][number], viewport: { width: number; height: number }) {
  const target = await page.evaluate((actionId) => {
    const api = (window as unknown as { __REFERENCE_LEVEL_TEST__?: { getNaturalInputTarget(id: string): unknown } }).__REFERENCE_LEVEL_TEST__;
    if (!api || typeof api.getNaturalInputTarget !== 'function') throw new Error('window.__REFERENCE_LEVEL_TEST__.getNaturalInputTarget is unavailable');
    return api.getNaturalInputTarget(actionId);
  }, action.actionId) as { x?: unknown; y?: unknown; endX?: unknown; endY?: unknown };
  const normalized = (value: unknown, name: string) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${action.actionId} returned invalid normalized ${name}`);
    return value;
  };
  const x = normalized(target.x, 'x') * viewport.width;
  const y = normalized(target.y, 'y') * viewport.height;
  const endX = target.endX === undefined ? x : normalized(target.endX, 'endX') * viewport.width;
  const endY = target.endY === undefined ? y : normalized(target.endY, 'endY') * viewport.height;
  if (action.kind === 'tap') await page.mouse.click(x, y);
  else if (action.kind === 'press') { await page.mouse.move(x, y); await page.mouse.down(); }
  else if (action.kind === 'release') { await page.mouse.move(x, y); await page.mouse.up(); }
  else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 8 });
    await page.mouse.up();
  }
}

function addSnapshot(target: ReferenceLevelRuntimeTrace['checkpoints'], value: RuntimeSnapshot) {
  const checkpoint = { sourceCheckpointId: value.checkpointId, ...(Number.isFinite(value.capturedAtMs) ? { capturedAtMs: value.capturedAtMs } : {}), runtimeBinding: value.runtimeBinding, phase: value.phase, objectStates: value.objectStates, observedRelationIds: value.observedRelationIds, cameraMode: value.cameraMode, visibleFeedbackIds: value.visibleFeedbackIds };
  const encoded = JSON.stringify({ ...checkpoint, capturedAtMs: undefined });
  if (target.some((item) => JSON.stringify(item) === encoded)) return;
  target.push(checkpoint);
}

async function pollSnapshots(page: Page, checkpoints: ReferenceLevelRuntimeTrace['checkpoints'], durationMs: number, expectedCheckpointId?: string, onSnapshot?: (snapshot: RuntimeSnapshot) => Promise<void>) {
  const deadline = Date.now() + durationMs;
  let latest = await snapshot(page);
  addSnapshot(checkpoints, latest);
  await onSnapshot?.(latest);
  if (expectedCheckpointId && latest.checkpointId === expectedCheckpointId) return latest;
  while (Date.now() < deadline) {
    await page.waitForTimeout(50);
    latest = await snapshot(page);
    addSnapshot(checkpoints, latest);
    await onSnapshot?.(latest);
    if (expectedCheckpointId && latest.checkpointId === expectedCheckpointId) return latest;
  }
  return latest;
}

type RuntimeMeasurement = NonNullable<ReferenceLevelRuntimeTrace['observedMeasurements']>[number];

function runtimeMeasurementEvidence(evidence: Array<{ path: string; sha256: string }>) {
  return evidence.length > 0 ? evidence : [{ path: 'logs/reference-level/measurement-unavailable.txt', sha256: sha256Text('measurement-unavailable') }];
}

function measureRuntimeBehaviors(contract: ReferenceLevelImplementationContract, checkpoints: ReferenceLevelRuntimeTrace['checkpoints'], evidence: Array<{ path: string; sha256: string }>, viewport: { width: number; height: number }): RuntimeMeasurement[] | undefined {
  if (!contract.behaviorMeasurements || contract.behaviorMeasurements.length === 0) return undefined;
  return contract.behaviorMeasurements.map((target): RuntimeMeasurement => {
    const from = checkpoints.find((checkpoint) => checkpoint.sourceCheckpointId === target.fromCheckpointId && checkpoint.capturedAtMs !== undefined);
    const to = checkpoints.find((checkpoint) => checkpoint.sourceCheckpointId === target.toCheckpointId && checkpoint.capturedAtMs !== undefined);
    const sourceCheckpointIds = [...new Set([target.fromCheckpointId, target.toCheckpointId].filter(Boolean))];
    const base = { measurementId: target.measurementId, unit: target.unit, sourceCheckpointIds, subjectObjectId: target.subjectObjectId, relatedObjectId: target.relatedObjectId, evidence: runtimeMeasurementEvidence(evidence) };
    if (!from || !to || from.capturedAtMs === undefined || to.capturedAtMs === undefined || !Number.isFinite(from.capturedAtMs) || !Number.isFinite(to.capturedAtMs)) {
      return { ...base, status: 'INSUFFICIENT', basis: '候选浏览器轨迹没有为测量所需的两个自然输入状态提供实际采样时间。' };
    }
    if (target.kind === 'checkpoint-interval') {
      const delta = to.capturedAtMs - from.capturedAtMs;
      if (delta <= 0 || target.unit !== 'ms') return { ...base, status: 'INSUFFICIENT', basis: '候选状态时间戳不递增，或量测单位与 checkpoint interval 不一致。' };
      const uncertainty = 50;
      return { ...base, status: 'MEASURED', actualRange: { min: Math.max(0, delta - uncertainty), max: delta + uncertainty }, basis: `浏览器 performance.now() 的自然输入状态差，轮询分辨率约 ${uncertainty}ms。` };
    }
    if (target.unit !== 'normalized-distance' || target.coordinateSpace !== 'screen-normalized') return { ...base, status: 'INSUFFICIENT', basis: '候选运行缺少可比的 screen-normalized 相对空间量测。' };
    const fromSubject = target.subjectObjectId ? from.objectStates.find((object) => object.semanticId === target.subjectObjectId) : undefined;
    const fromRelated = target.relatedObjectId ? from.objectStates.find((object) => object.semanticId === target.relatedObjectId) : undefined;
    const toSubject = target.subjectObjectId ? to.objectStates.find((object) => object.semanticId === target.subjectObjectId) : undefined;
    const toRelated = target.relatedObjectId ? to.objectStates.find((object) => object.semanticId === target.relatedObjectId) : undefined;
    const bounds = (object: typeof fromSubject) => object?.boundsNormalized;
    if (!bounds(fromSubject) || !bounds(fromRelated) || !bounds(toSubject) || !bounds(toRelated)) return { ...base, status: 'INSUFFICIENT', basis: '候选 probe 没有为两个语义对象提供可比的 normalized bounds。' };
    const distance = (left: NonNullable<typeof fromSubject>, right: NonNullable<typeof fromRelated>) => {
      const a = bounds(left)!; const b = bounds(right)!;
      return Math.hypot((a.x + a.width / 2) - (b.x + b.width / 2), ((a.y + a.height / 2) - (b.y + b.height / 2)) * (viewport.height / viewport.width));
    };
    const delta = Math.abs(distance(toSubject!, toRelated!) - distance(fromSubject!, fromRelated!));
    const uncertainty = 0.02;
    return { ...base, status: 'MEASURED', actualRange: { min: Math.max(0, delta - uncertainty), max: delta + uncertainty }, basis: '候选 probe 在同一自然输入轨迹中提供的 screen-normalized 对象中心距离变化。' };
  });
}

export function mergeReferenceLevelQaReport(reportValue: QaReport, gateValue: ReferenceLevelComparisonGate, screenshots: string[]) {
  const report = QaReportSchema.parse(reportValue);
  const gate = ReferenceLevelComparisonGateSchema.parse(gateValue);
  const priorChecks = report.checks.filter((check) => check.name !== 'recording-level-comparison');
  const priorIssues = report.issues.filter((issue) => issue.id !== 'recording-level-comparison');
  return QaReportSchema.parse({
    ...report,
    passed: report.passed && gate.passed,
    checks: [...priorChecks, { name: 'recording-level-comparison', passed: gate.passed, evidence: JSON.stringify({ gate: 'artifacts/reference-level-comparison-gate.json', blockers: gate.blockers }) }],
    issues: gate.passed ? priorIssues : [...priorIssues, { id: 'recording-level-comparison', severity: 'error' as const, message: `recording-level comparison failed: ${gate.blockers.join(', ')}`, evidence: 'artifacts/reference-level-comparison-gate.json' }],
    screenshots: [...new Set([...report.screenshots, ...screenshots])],
  });
}

/**
 * Run the recording-level semantic contract through visible pointer input.
 * The probe is read-only: it may reveal input targets and observations, but it
 * never resets, advances, injects, or mutates the game.
 */
export async function runReferenceLevelQa(input: ReferenceLevelQaInput) {
  const contract = ReferenceLevelImplementationContractSchema.parse(input.contract);
  const runtimeData = ReferenceLevelRuntimeDataSchema.parse(input.runtimeData);
  if (path.resolve(contract.workspace) !== path.resolve(input.workspace)) throw new Error('reference level QA workspace does not match its contract');
  let preview: Awaited<ReturnType<RuntimeAdapter['startPreview']>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let context: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newContext']>> | undefined;
  let page: Page | undefined;
  const slug = `${input.viewport.label}-${input.viewport.width}x${input.viewport.height}`.replaceAll(/[^a-z0-9_-]+/giu, '-');
  const screenshotDir = path.join(input.runRoot, 'screenshots/reference-level');
  const traceDir = path.join(input.runRoot, 'logs/reference-level');
  await mkdir(screenshotDir, { recursive: true });
  await mkdir(traceDir, { recursive: true });
  const screenshots: Array<{ path: string; sha256: string }> = [];
  const checkpointScreenshots = new Set<string>();
  const checkpoints: ReferenceLevelRuntimeTrace['checkpoints'] = [];
  const actions: ReferenceLevelRuntimeTrace['actions'] = [];
  let failure: string | undefined;
  let latest: RuntimeSnapshot | undefined;
  let terminalObservation: RuntimeSnapshot['terminal'] | undefined;
  let replayReturned = '';
  let startedFromReset = false;
  const captureCheckpoint = async (value: RuntimeSnapshot) => {
    if (!page || checkpointScreenshots.has(value.checkpointId)) return;
    checkpointScreenshots.add(value.checkpointId);
    const checkpointSlug = value.checkpointId.replaceAll(/[^a-z0-9_-]+/giu, '-');
    const checkpointPath = `screenshots/reference-level/${slug}-${checkpointSlug}.png`;
    await page.screenshot({ path: path.join(input.runRoot, checkpointPath), fullPage: true });
    screenshots.push({ path: checkpointPath, sha256: await sha256File(path.join(input.runRoot, checkpointPath)) });
  };
  try {
    await verifyReferenceLevelRuntimeDataFile(input.workspace, runtimeData);
    await verifyReferenceLevelLayoutFile(input.workspace, runtimeData);
    preview = await input.runtime.startPreview(input.workspace);
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: input.viewport.width, height: input.viewport.height }, hasTouch: true, isMobile: true });
    page = await context.newPage();
    await page.goto(preview.url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const api = (window as unknown as { __REFERENCE_LEVEL_TEST__?: Record<string, unknown> }).__REFERENCE_LEVEL_TEST__;
      return Boolean(api && typeof api.getSnapshot === 'function' && typeof api.getNaturalInputTarget === 'function' && Object.keys(api).every((key) => key === 'getSnapshot' || key === 'getNaturalInputTarget'));
    }, undefined, { timeout: 10_000 });
    latest = await snapshot(page);
    addSnapshot(checkpoints, latest);
    await captureCheckpoint(latest);
    const orderedActions = [...contract.interactionSequence].sort((left, right) => left.order - right.order);
    startedFromReset = latest.phase === 'ready' && (orderedActions[0] === undefined || latest.checkpointId === orderedActions[0].fromCheckpointId);
    terminalObservation = latest.terminal?.reached ? latest.terminal : terminalObservation;
    for (const action of orderedActions) {
      const before = JSON.stringify(latest);
      await performNaturalInput(page, action, input.viewport);
      latest = await pollSnapshots(page, checkpoints, action.responseClass === 'immediate' ? 1_000 : action.responseClass === 'short' ? 3_000 : 8_000, action.toCheckpointId, captureCheckpoint);
      terminalObservation = latest.terminal?.reached ? latest.terminal : terminalObservation;
      actions.push({ order: action.order, actionId: action.actionId, kind: action.kind, targetObjectId: action.targetObjectId, naturalInput: true, stateChanged: JSON.stringify(latest) !== before, observedCheckpointId: latest.checkpointId });
    }
    // A recording contract defines action classes and checkpoint transitions,
    // not a fixed tap count. Continue the last declared natural action while
    // forward play remains non-terminal so timing-based courses can prove both
    // their interaction checkpoint and their eventual settlement.
    const continuation = orderedActions.at(-1);
    const terminalDeadline = Date.now() + 6_000;
    while (continuation && latest.phase !== 'terminal' && Date.now() < terminalDeadline) {
      const before = JSON.stringify(latest);
      await performNaturalInput(page, continuation, input.viewport);
      latest = await pollSnapshots(page, checkpoints, 900, contract.terminal?.checkpointId, captureCheckpoint);
      terminalObservation = latest.terminal?.reached ? latest.terminal : terminalObservation;
      actions.push({ order: actions.length + 1, actionId: continuation.actionId, kind: continuation.kind, targetObjectId: continuation.targetObjectId, naturalInput: true, stateChanged: JSON.stringify(latest) !== before, observedCheckpointId: latest.checkpointId });
    }
    latest = await pollSnapshots(page, checkpoints, 1_000, contract.terminal?.checkpointId, captureCheckpoint);
    terminalObservation = latest.terminal?.reached ? latest.terminal : terminalObservation;
    const terminalPath = `screenshots/reference-level/${slug}-terminal.png`;
    await page.screenshot({ path: path.join(input.runRoot, terminalPath), fullPage: true });
    screenshots.push({ path: terminalPath, sha256: await sha256File(path.join(input.runRoot, terminalPath)) });
    if (!contract.replay) throw new Error('reference level contract has no replay action');
    await performNaturalInput(page, { order: 1, actionId: contract.replay.actionId, kind: 'tap', targetObjectId: contract.replay.targetObjectId, fromCheckpointId: contract.replay.checkpointId, toCheckpointId: contract.replay.returnsToCheckpointId, responseClass: 'short', expectedStateChange: 'replay returns to ready' }, input.viewport);
    latest = await pollSnapshots(page, checkpoints, 120, contract.replay.checkpointId, captureCheckpoint);
    latest = await pollSnapshots(page, checkpoints, 1_000, contract.replay.returnsToCheckpointId, captureCheckpoint);
    replayReturned = latest.checkpointId;
    const replayPath = `screenshots/reference-level/${slug}-replay.png`;
    await page.screenshot({ path: path.join(input.runRoot, replayPath), fullPage: true });
    screenshots.push({ path: replayPath, sha256: await sha256File(path.join(input.runRoot, replayPath)) });
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    const failurePath = `screenshots/reference-level/${slug}-blocked.png`;
    await page?.screenshot({ path: path.join(input.runRoot, failurePath), fullPage: true }).catch(() => undefined);
    if (await stat(path.join(input.runRoot, failurePath)).then(() => true).catch(() => false)) screenshots.push({ path: failurePath, sha256: await sha256File(path.join(input.runRoot, failurePath)) });
  } finally {
    const closing: Promise<void>[] = [];
    if (preview) closing.push(preview.stop());
    if (context) closing.push(context.close());
    if (browser) closing.push(browser.close());
    await Promise.allSettled(closing);
  }
  if (screenshots.length === 0) {
    const placeholderPath = `logs/reference-level/${slug}-no-screenshot.txt`;
    await writeFile(path.join(input.runRoot, placeholderPath), failure ?? 'reference level evidence unavailable');
    screenshots.push({ path: placeholderPath, sha256: await sha256File(path.join(input.runRoot, placeholderPath)) });
  }
  const eventPath = `logs/reference-level/${slug}-events.json`;
  const eventBody = `${JSON.stringify({ schemaVersion: 1, failure: failure ?? null, actions, checkpoints, observedAt: new Date().toISOString() }, null, 2)}\n`;
  await writeFile(path.join(input.runRoot, eventPath), eventBody);
  const observedMeasurements = measureRuntimeBehaviors(contract, checkpoints, [...screenshots, { path: eventPath, sha256: sha256Text(eventBody) }], input.viewport);
  const terminal = terminalObservation ?? latest?.terminal;
  const trace = ReferenceLevelRuntimeTraceSchema.parse({
    schemaVersion: 1,
    artifactType: 'reference-level-runtime-trace',
    targetRunId: contract.targetRunId,
    targetGame: contract.targetGame,
    workspace: contract.workspace,
    contractHash: sha256Text(JSON.stringify(contract)),
    buildHash: input.buildHash,
    viewport: input.viewport,
    startedFromReset,
    naturalInputOnly: true,
    actions,
    checkpoints,
    ...(observedMeasurements ? { observedMeasurements } : {}),
    terminal: { reached: terminal?.reached === true, result: String(terminal?.result ?? 'not-observed'), causeVisible: terminal?.causeVisible === true, settlementVisible: terminal?.settlementVisible === true },
    replay: { actionId: contract.replay?.actionId ?? 'replay-unavailable', returnedToCheckpointId: replayReturned || 'not-observed', naturalInput: failure === undefined },
    screenshots,
    trace: { path: eventPath, sha256: sha256Text(eventBody) },
    reviewer: 'QAAgent',
    authorIndependent: true,
    observedAt: new Date().toISOString(),
  });
  const gate = evaluateReferenceLevelRuntimeTrace(contract, trace, runtimeData);
  return {
    trace,
    gate: failure
      ? ReferenceLevelComparisonGateSchema.parse({ ...gate, passed: false, blockers: [...new Set([...gate.blockers, `reference-level:runner:${failure}`])] })
      : gate,
  };
}
