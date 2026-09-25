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
  /** Delay only the QA-side observation call; never blocks the game page. */
  observationDelayMs?: number;
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

async function snapshot(page: Page, observationDelayMs = 0) {
  if (observationDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, observationDelayMs));
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
  const prior = target.at(-1);
  const sampleGapMs = prior?.capturedAtMs !== undefined && Number.isFinite(prior.capturedAtMs) && Number.isFinite(value.capturedAtMs)
    ? Math.max(0, value.capturedAtMs - prior.capturedAtMs)
    : undefined;
  const observationWindow = prior?.capturedAtMs !== undefined && Number.isFinite(prior.capturedAtMs) && Number.isFinite(value.capturedAtMs)
    ? { startMs: prior.capturedAtMs, endMs: value.capturedAtMs }
    : undefined;
  const checkpoint = { sourceCheckpointId: value.checkpointId, ...(Number.isFinite(value.capturedAtMs) ? { capturedAtMs: value.capturedAtMs } : {}), ...(sampleGapMs === undefined ? {} : { sampleGapMs }), ...(observationWindow === undefined ? {} : { observationWindow }), runtimeBinding: value.runtimeBinding, phase: value.phase, objectStates: value.objectStates, observedRelationIds: value.observedRelationIds, cameraMode: value.cameraMode, visibleFeedbackIds: value.visibleFeedbackIds };
  // Keep every sampled checkpoint. The timestamp is measurement evidence; a
  // state-only dedupe here can erase the later occurrence needed for A→C or
  // repeated-action intervals.
  target.push(checkpoint);
  return checkpoint;
}

function snapshotStateSignature(value: RuntimeSnapshot): string {
  const state = { ...value, capturedAtMs: undefined };
  return JSON.stringify(state);
}

export function runtimeSnapshotStateChanged(before: RuntimeSnapshot, after: RuntimeSnapshot): boolean {
  return snapshotStateSignature(before) !== snapshotStateSignature(after);
}

async function pollSnapshots(page: Page, checkpoints: ReferenceLevelRuntimeTrace['checkpoints'], durationMs: number, expectedCheckpointId?: string, onSnapshot?: (snapshot: RuntimeSnapshot) => Promise<void>, observationDelayMs = 0) {
  const deadline = Date.now() + durationMs;
  let latest = await snapshot(page, observationDelayMs);
  addSnapshot(checkpoints, latest);
  await onSnapshot?.(latest);
  if (expectedCheckpointId && latest.checkpointId === expectedCheckpointId) return latest;
  while (Date.now() < deadline) {
    await page.waitForTimeout(50);
    latest = await snapshot(page, observationDelayMs);
    addSnapshot(checkpoints, latest);
    await onSnapshot?.(latest);
    if (expectedCheckpointId && latest.checkpointId === expectedCheckpointId) return latest;
  }
  return latest;
}

type RuntimeMeasurement = NonNullable<ReferenceLevelRuntimeTrace['observedMeasurements']>[number];

function candidateDistanceResolution(viewport: { width: number; height: number }): number {
  // Bounds are observed through the browser's screen-normalized channel. A
  // center can move by at most half a physical pixel on each axis before the
  // reported rectangle changes. Convert that quantization to the same
  // aspect-corrected distance space used by the measurement below.
  const pixelX = 0.5 / Math.max(1, viewport.width);
  const pixelY = 0.5 / Math.max(1, viewport.height);
  const aspect = viewport.height / Math.max(1, viewport.width);
  // The signed change uses two object centers at two endpoints. Four
  // independent half-pixel bound observations therefore contribute to the
  // conservative interval: 4 × the one-bound resolution.
  return Math.hypot(pixelX, pixelY * aspect) * 4;
}

function absoluteRangeFromSignedInterval(min: number, max: number) {
  const values = [Math.abs(min), Math.abs(max), ...(min <= 0 && max >= 0 ? [0] : [])];
  return { min: Math.min(...values), max: Math.max(...values) };
}

function runtimeMeasurementEvidence(evidence: Array<{ path: string; sha256: string }>) {
  return evidence.length > 0 ? evidence : [{ path: 'logs/reference-level/measurement-unavailable.txt', sha256: sha256Text('measurement-unavailable') }];
}

export function measureRuntimeBehaviors(contract: ReferenceLevelImplementationContract, checkpoints: ReferenceLevelRuntimeTrace['checkpoints'], evidence: Array<{ path: string; sha256: string }>, viewport: { width: number; height: number }): RuntimeMeasurement[] | undefined {
  if (!contract.behaviorMeasurements || contract.behaviorMeasurements.length === 0) return undefined;
  return contract.behaviorMeasurements.map((target): RuntimeMeasurement => {
    const fromIndex = checkpoints.findIndex((checkpoint) => checkpoint.sourceCheckpointId === target.fromCheckpointId && checkpoint.observationWindow !== undefined);
    const from = fromIndex >= 0 ? checkpoints[fromIndex] : undefined;
    const to = checkpoints.find((checkpoint, index) => index > fromIndex && checkpoint.sourceCheckpointId === target.toCheckpointId && checkpoint.observationWindow !== undefined)
      ?? checkpoints.find((checkpoint) => checkpoint.sourceCheckpointId === target.toCheckpointId && checkpoint.observationWindow !== undefined);
    const sourceCheckpointIds = [...new Set([target.fromCheckpointId, target.toCheckpointId].filter(Boolean))];
    const base = { measurementId: target.measurementId, unit: target.unit, coordinateSpace: target.kind === 'relative-distance' ? target.coordinateSpace : 'screen-normalized' as const, sourceCheckpointIds, subjectObjectId: target.subjectObjectId, relatedObjectId: target.relatedObjectId, evidence: runtimeMeasurementEvidence(evidence) };
    if (!from || !to || from.capturedAtMs === undefined || to.capturedAtMs === undefined || !Number.isFinite(from.capturedAtMs) || !Number.isFinite(to.capturedAtMs)) {
      return { ...base, status: 'INSUFFICIENT', basis: '候选浏览器轨迹没有为测量所需的两个自然输入状态提供实际采样时间和端点观察窗口。' };
    }
    if (target.kind === 'checkpoint-interval') {
      if (target.unit !== 'ms') return { ...base, status: 'INSUFFICIENT', basis: '量测单位与 checkpoint interval 不一致。' };
      const fromWindow = from.observationWindow;
      const toWindow = to.observationWindow;
      if (!fromWindow || !toWindow || fromWindow.endMs < fromWindow.startMs || toWindow.endMs < toWindow.startMs) {
        return { ...base, status: 'INSUFFICIENT', basis: '候选轨迹缺少端点观察窗口，无法确定事件发生的时间边界。' };
      }
      const min = toWindow.startMs - fromWindow.endMs;
      const max = toWindow.endMs - fromWindow.startMs;
      if (max <= 0 || min < 0) return { ...base, status: 'INSUFFICIENT', basis: '端点观察窗口没有形成递增的 checkpoint interval。' };
      return { ...base, status: 'MEASURED', actualRange: { min, max }, basis: `端点观察窗口：${fromWindow.startMs}-${fromWindow.endMs}ms → ${toWindow.startMs}-${toWindow.endMs}ms；截图等待仅作诊断，不重复计入时间不确定性。` };
    }
    if (target.unit !== 'normalized-distance' || target.coordinateSpace !== 'screen-normalized') return { ...base, status: 'INSUFFICIENT', basis: '候选运行缺少可比的 screen-normalized 相对空间量测。' };
    const fromSubject = target.subjectObjectId ? from.objectStates.find((object) => object.semanticId === target.subjectObjectId) : undefined;
    const fromRelated = target.relatedObjectId ? from.objectStates.find((object) => object.semanticId === target.relatedObjectId) : undefined;
    const toSubject = target.subjectObjectId ? to.objectStates.find((object) => object.semanticId === target.subjectObjectId) : undefined;
    const toRelated = target.relatedObjectId ? to.objectStates.find((object) => object.semanticId === target.relatedObjectId) : undefined;
    const bounds = (object: typeof fromSubject) => object?.coordinateSpace === 'screen-normalized' ? object.boundsNormalized : undefined;
    if (!bounds(fromSubject) || !bounds(fromRelated) || !bounds(toSubject) || !bounds(toRelated)) return { ...base, status: 'INSUFFICIENT', basis: '候选 probe 没有为两个语义对象提供可比的 screen-normalized bounds。' };
    const distance = (left: NonNullable<typeof fromSubject>, right: NonNullable<typeof fromRelated>) => {
      const a = bounds(left)!; const b = bounds(right)!;
      return Math.hypot((a.x + a.width / 2) - (b.x + b.width / 2), ((a.y + a.height / 2) - (b.y + b.height / 2)) * (viewport.height / viewport.width));
    };
    const signedDelta = distance(toSubject!, toRelated!) - distance(fromSubject!, fromRelated!);
    const resolution = candidateDistanceResolution(viewport);
    const signedInterval = { min: signedDelta - resolution, max: signedDelta + resolution };
    const actualRange = absoluteRangeFromSignedInterval(signedInterval.min, signedInterval.max);
    const basis = `候选 screen-normalized bounds 的浏览器像素分辨率（${viewport.width}×${viewport.height}）推导 signed change resolution ±${resolution}（两端点×两个对象中心×每个边界半像素）；signed interval [${signedInterval.min}, ${signedInterval.max}]。`;
    if (target.direction === undefined) {
      return { ...base, status: 'MEASURED', actualRange, basis: `${basis} 旧目标未声明方向，保留 absolute-distance 语义。` };
    }
    const direction = signedInterval.max < 0 ? 'approaching' as const : signedInterval.min > 0 ? 'separating' as const : undefined;
    if (direction !== undefined) {
      return { ...base, status: 'MEASURED', actualRange, direction, basis };
    }
    const stableWithinSourceAcceptance = target.direction === 'stable'
      && actualRange.min >= target.acceptanceRange.min
      && actualRange.max <= target.acceptanceRange.max;
    if (stableWithinSourceAcceptance) {
      return { ...base, status: 'MEASURED', actualRange, direction: 'stable', basis: `${basis} signed interval 跨过零，但 absolute change 完整落在 source-declared stable acceptance range。` };
    }
    return { ...base, status: 'INSUFFICIENT', actualRange, basis: `${basis} signed interval 跨过零，候选分辨率不足以证明 ${target.direction}；不能把 ambiguous movement 标成 stable。` };
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
    const captureStartedAt = Date.now();
    await page.screenshot({ path: path.join(input.runRoot, checkpointPath), fullPage: true });
    const captureDelayMs = Math.max(0, Date.now() - captureStartedAt);
    const captured = [...checkpoints].reverse().find((checkpoint) => checkpoint.sourceCheckpointId === value.checkpointId && checkpoint.capturedAtMs === value.capturedAtMs);
    if (captured) captured.captureDelayMs = captureDelayMs;
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
    const observationDelayMs = input.observationDelayMs ?? 0;
    const firstObservation = await snapshot(page, observationDelayMs);
    addSnapshot(checkpoints, firstObservation);
    latest = await snapshot(page, observationDelayMs);
    addSnapshot(checkpoints, latest);
    await captureCheckpoint(latest);
    const orderedActions = [...contract.interactionSequence].sort((left, right) => left.order - right.order);
    startedFromReset = latest.phase === 'ready' && (orderedActions[0] === undefined || latest.checkpointId === orderedActions[0].fromCheckpointId);
    terminalObservation = latest.terminal?.reached ? latest.terminal : terminalObservation;
    for (const action of orderedActions) {
      const before = latest;
      const startedAtMs = await page.evaluate(() => performance.now());
      await performNaturalInput(page, action, input.viewport);
      latest = await pollSnapshots(page, checkpoints, action.responseClass === 'immediate' ? 1_000 : action.responseClass === 'short' ? 3_000 : 8_000, action.toCheckpointId, captureCheckpoint, observationDelayMs);
      terminalObservation = latest.terminal?.reached ? latest.terminal : terminalObservation;
      actions.push({ order: action.order, actionId: action.actionId, kind: action.kind, targetObjectId: action.targetObjectId, naturalInput: true, stateChanged: runtimeSnapshotStateChanged(before, latest), observedCheckpointId: latest.checkpointId, startedAtMs });
    }
    // A recording contract defines action classes and checkpoint transitions,
    // not a fixed tap count. Continue the last declared natural action while
    // forward play remains non-terminal so timing-based courses can prove both
    // their interaction checkpoint and their eventual settlement.
    const continuation = orderedActions.at(-1);
    const terminalDeadline = Date.now() + 6_000;
    while (continuation && latest.phase !== 'terminal' && Date.now() < terminalDeadline) {
      const before = latest;
      const startedAtMs = await page.evaluate(() => performance.now());
      await performNaturalInput(page, continuation, input.viewport);
      latest = await pollSnapshots(page, checkpoints, 900, contract.terminal?.checkpointId, captureCheckpoint, observationDelayMs);
      terminalObservation = latest.terminal?.reached ? latest.terminal : terminalObservation;
      actions.push({ order: actions.length + 1, actionId: continuation.actionId, kind: continuation.kind, targetObjectId: continuation.targetObjectId, naturalInput: true, stateChanged: runtimeSnapshotStateChanged(before, latest), observedCheckpointId: latest.checkpointId, startedAtMs });
    }
    latest = await pollSnapshots(page, checkpoints, 1_000, contract.terminal?.checkpointId, captureCheckpoint, observationDelayMs);
    terminalObservation = latest.terminal?.reached ? latest.terminal : terminalObservation;
    const terminalPath = `screenshots/reference-level/${slug}-terminal-final.png`;
    await page.screenshot({ path: path.join(input.runRoot, terminalPath), fullPage: true });
    screenshots.push({ path: terminalPath, sha256: await sha256File(path.join(input.runRoot, terminalPath)) });
    if (!contract.replay) throw new Error('reference level contract has no replay action');
    await performNaturalInput(page, { order: 1, actionId: contract.replay.actionId, kind: 'tap', targetObjectId: contract.replay.targetObjectId, fromCheckpointId: contract.replay.checkpointId, toCheckpointId: contract.replay.returnsToCheckpointId, responseClass: 'short', expectedStateChange: 'replay returns to ready' }, input.viewport);
    latest = await pollSnapshots(page, checkpoints, 120, contract.replay.checkpointId, captureCheckpoint, observationDelayMs);
    latest = await pollSnapshots(page, checkpoints, 1_000, contract.replay.returnsToCheckpointId, captureCheckpoint, observationDelayMs);
    replayReturned = latest.checkpointId;
    const replayPath = `screenshots/reference-level/${slug}-replay-final.png`;
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
