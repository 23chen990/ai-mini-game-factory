import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import type { RuntimeAdapter } from '../adapters/runtime.js';
import {
  ActionMechanicExperimentSpecSchema,
  ActionPlaytestReportSchema,
  ActionPrototypeBuildReportSchema,
  type ActionMechanicExperimentSpec,
  type ActionPlaytestReport,
  type ActionPrototypeBuildReport,
} from '../schemas/action-mechanic-experiment.js';
import {
  ACTION_TEST_CONTRACT_VERSION,
  ActionSnapshotSchema,
  ActionTestManifestSchema,
  validateActionTrace,
  type ActionEvent,
  type ActionSnapshot,
  type ActionTrace as ContractTrace,
} from './action-test-contract.js';
import {
  countMissedFinishDetections,
  evaluateHookAttachments,
  hashActionTrace,
  measureMaxEventGap,
  measureReleaseKinematics,
  measureRetryFriction,
  type ActionTrace as MetricTrace,
  type ActionTraceFrame,
} from './action-metrics.js';

type Slot = 'A' | 'B' | 'C';
type MetricName = keyof ActionMechanicExperimentSpec['automaticQaThresholds'];
type Result = ActionPlaytestReport['results'][number];
type MeasuredMetric = Result[MetricName];
type ScenarioId =
  | 'input-response'
  | 'release-kinematics'
  | 'hook-selection'
  | 'event-gap'
  | 'retry-friction'
  | 'finish-crossing';

const SCENARIOS: readonly ScenarioId[] = [
  'input-response',
  'release-kinematics',
  'hook-selection',
  'event-gap',
  'retry-friction',
  'finish-crossing',
];

type ScenarioEvidence = Record<ScenarioId, ContractTrace>;

function workspacePath(runRoot: string, workspace: string) {
  const root = path.resolve(runRoot);
  const resolved = path.resolve(root, workspace);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Prototype workspace escapes run root: ${workspace}`);
  }
  return resolved;
}

function terminal(status: string): ActionTraceFrame['terminal'] {
  if (/^(?:won|complete|completed|finished)$/i.test(status)) return 'won';
  if (/^(?:failed|lost|dead)$/i.test(status)) return 'failed';
  return undefined;
}

function baseFrame(snapshot: ActionSnapshot, tick = snapshot.tick): ActionTraceFrame {
  const outcome = terminal(snapshot.status);
  return {
    tick,
    position: { x: snapshot.player.x, y: snapshot.player.y },
    velocity: { x: snapshot.player.vx, y: snapshot.player.vy },
    riskBand: snapshot.status,
    terminal: outcome,
    finishDetected: outcome === 'won',
  };
}

function metricTrace(fixedStepMs: number, frames: ActionTraceFrame[]): MetricTrace {
  return { fixedStepMs, frames };
}

function failureValues(spec: ActionMechanicExperimentSpec, evidence: string): Record<MetricName, MeasuredMetric> {
  const thresholds = spec.automaticQaThresholds;
  return {
    inputResponseMs: { value: thresholds.inputResponseMs.max + 1, passed: false, evidence },
    releaseVelocityRetentionRatio: { value: 0, passed: false, evidence },
    wrongHookAttachments: { value: thresholds.wrongHookAttachments.max + 1, passed: false, evidence },
    maxEventGapMs: { value: thresholds.maxEventGapMs.max + 1, passed: false, evidence },
    retryFrictionMs: { value: thresholds.retryFrictionMs.max + 1, passed: false, evidence },
    missedFinishDetections: { value: thresholds.missedFinishDetections.max + 1, passed: false, evidence },
  };
}

async function state(page: Page) {
  const value = await page.evaluate(() => window.__ACTION_TEST__?.getState());
  return ActionSnapshotSchema.parse(value);
}

async function events(page: Page, sinceSeq = 0) {
  const value = await page.evaluate((since) => window.__ACTION_TEST__?.getEvents(since), sinceSeq);
  return validateActionTrace({ snapshots: [], events: value }).events;
}

async function loadScenario(page: Page, scenario: ScenarioId) {
  await page.evaluate((id) => window.__ACTION_TEST__?.loadScenario(id), scenario);
  const initial = await state(page);
  const trace = validateActionTrace({ snapshots: [initial], events: await events(page) });
  return trace;
}

async function advance(page: Page, count = 1) {
  await page.evaluate((ticks) => window.__ACTION_TEST__?.advanceTicks(ticks), count);
  return state(page);
}

async function releaseKeyboard(page: Page) {
  await page.keyboard.up('Space').catch(() => undefined);
}

function contractError(message: string) {
  return new Error(`Required __ACTION_TEST__ v${ACTION_TEST_CONTRACT_VERSION} contract failed: ${message}`);
}

async function requireContract(page: Page, slot: Slot, expectedFixtureHash: string) {
  try {
    await page.waitForFunction(
      (version) => window.__ACTION_TEST__?.contractVersion === version,
      ACTION_TEST_CONTRACT_VERSION,
      { timeout: 750 },
    );
  } catch {
    throw contractError('API is missing or has an unsupported contractVersion');
  }

  const descriptor = await page.evaluate(() => {
    const api = window.__ACTION_TEST__;
    const required = ['getManifest', 'resetGame', 'getState', 'act', 'advanceTicks', 'loadScenario', 'getEvents'] as const;
    return {
      contractVersion: api?.contractVersion,
      missingMethods: required.filter((name) => typeof api?.[name] !== 'function'),
      manifest: api?.getManifest(),
    };
  });
  if (descriptor.contractVersion !== ACTION_TEST_CONTRACT_VERSION) {
    throw contractError(`expected contractVersion ${ACTION_TEST_CONTRACT_VERSION}`);
  }
  if (descriptor.missingMethods.length > 0) {
    throw contractError(`missing methods: ${descriptor.missingMethods.join(', ')}`);
  }
  const manifest = ActionTestManifestSchema.parse(descriptor.manifest);
  if (manifest.slot !== slot) throw contractError(`manifest slot ${manifest.slot} does not match ${slot}`);
  if (manifest.courseFixtureHash !== expectedFixtureHash) {
    throw contractError(`course fixture hash does not match BuilderAgent report for slot ${slot}`);
  }
  return manifest;
}

async function collectInputResponse(page: Page, fixedStepMs: number, maximumMs: number) {
  const trace = await loadScenario(page, 'input-response');
  const initial = trace.snapshots[0]!;
  const snapshots = [...trace.snapshots];
  await page.keyboard.down('Space');
  const maximumTicks = Math.max(2, Math.ceil(maximumMs / fixedStepMs) + 2);
  let response: ActionSnapshot | undefined;
  for (let tick = 0; tick <= maximumTicks; tick += 1) {
    const current = await state(page);
    if (snapshots.at(-1)?.tick !== current.tick || snapshots.at(-1)?.eventSeq !== current.eventSeq) snapshots.push(current);
    if (current.inputHeld && current.attachedAnchorId !== null && current.ropeLength !== null) {
      response = current;
      break;
    }
    snapshots.push(await advance(page));
  }
  await releaseKeyboard(page);
  trace.snapshots = snapshots;
  trace.events = await events(page);
  validateActionTrace(trace);
  const keyboardObserved = trace.events.some(({ source }) => source === 'keyboard');
  return {
    trace,
    value: response && keyboardObserved ? Math.max(0, response.tick - initial.tick) * fixedStepMs : maximumMs + fixedStepMs,
  };
}

async function collectRelease(page: Page, fixedStepMs: number) {
  const trace = await loadScenario(page, 'release-kinematics');
  await page.keyboard.down('Space');
  await advance(page);
  const before = await state(page);
  await page.keyboard.up('Space');
  const after = await state(page);
  trace.snapshots = [trace.snapshots[0]!, before, after];
  trace.events = await events(page);
  validateActionTrace(trace);
  const measurement = measureReleaseKinematics(metricTrace(fixedStepMs, [
    baseFrame(before, 0),
    { ...baseFrame(after, 1), input: 'release' },
  ]));
  const keyboardRelease = trace.events.some(({ type, source }) => source === 'keyboard' && /release/i.test(type));
  return { trace, value: keyboardRelease ? measurement.minimumRetentionRatio : 0 };
}

function hookObservation(initial: ActionSnapshot, attached: ActionSnapshot) {
  if (attached.attachedAnchorId === null) return undefined;
  const direction = initial.player.vx < 0 ? -1 : 1;
  const candidates = initial.anchors.map((anchor) => ({
    hookId: anchor.id,
    behind: direction * (anchor.x - initial.player.x) < 0,
  }));
  const eligible = initial.anchors.filter((anchor) => direction * (anchor.x - initial.player.x) >= 0);
  const intended = [...eligible].sort((left, right) => {
    const leftDistance = Math.hypot(left.x - initial.player.x, left.y - initial.player.y);
    const rightDistance = Math.hypot(right.x - initial.player.x, right.y - initial.player.y);
    return leftDistance - rightDistance;
  })[0];
  return {
    selectedHookId: attached.attachedAnchorId,
    declaredPolicy: { eligibleHookIds: eligible.map(({ id }) => id), intendedHookId: intended?.id ?? null },
    candidates,
  };
}

async function collectHookSelection(page: Page, fixedStepMs: number) {
  const trace = await loadScenario(page, 'hook-selection');
  const initial = trace.snapshots[0]!;
  await page.keyboard.down('Space');
  const attached = await advance(page);
  await releaseKeyboard(page);
  trace.snapshots = [initial, attached];
  trace.events = await events(page);
  validateActionTrace(trace);
  const attachment = hookObservation(initial, attached);
  const measurement = evaluateHookAttachments(metricTrace(fixedStepMs, [
    { ...baseFrame(attached), hookAttachment: attachment },
  ]));
  const keyboardObserved = trace.events.some(({ source }) => source === 'keyboard');
  return {
    trace,
    value: keyboardObserved && measurement.attachmentCount > 0 ? measurement.wrongAttachments : 1,
  };
}

function inputAtTick(eventsAtTick: ActionEvent[]) {
  if (eventsAtTick.some(({ type }) => /retry/i.test(type))) return 'retry' as const;
  if (eventsAtTick.some(({ type }) => /release/i.test(type))) return 'release' as const;
  if (eventsAtTick.some(({ type }) => /held|press|attach/i.test(type))) return 'press' as const;
  return undefined;
}

function framesFromTrace(trace: ContractTrace) {
  let previousAttachment: string | null = null;
  return trace.snapshots.map((snapshot) => {
    const eventsAtTick = trace.events.filter(({ tick }) => tick === snapshot.tick);
    const attachment = snapshot.attachedAnchorId !== previousAttachment
      ? hookObservation(trace.snapshots[0]!, snapshot)
      : undefined;
    previousAttachment = snapshot.attachedAnchorId;
    return { ...baseFrame(snapshot), input: inputAtTick(eventsAtTick), hookAttachment: attachment };
  });
}

async function collectEventGap(page: Page, fixedStepMs: number, maximumMs: number) {
  const trace = await loadScenario(page, 'event-gap');
  const tickCount = Math.max(2, Math.ceil(maximumMs / fixedStepMs) + 2);
  for (let index = 0; index < tickCount; index += 1) trace.snapshots.push(await advance(page));
  trace.events = await events(page);
  validateActionTrace(trace);
  const measurement = measureMaxEventGap(metricTrace(fixedStepMs, framesFromTrace(trace)));
  return { trace, value: measurement.milliseconds };
}

async function collectRetry(page: Page, fixedStepMs: number, maximumMs: number) {
  const trace = await loadScenario(page, 'retry-friction');
  const failed = trace.snapshots[0]!;
  const beginsFailed = terminal(failed.status) === 'failed';
  const frames: ActionTraceFrame[] = [baseFrame(failed, 0)];
  await page.keyboard.down('Space');
  const maximumTicks = Math.max(2, Math.ceil(maximumMs / fixedStepMs) + 2);
  let retried: ActionSnapshot | undefined;
  for (let tick = 0; tick <= maximumTicks; tick += 1) {
    const current = await state(page);
    trace.snapshots.push(current);
    if (beginsFailed && terminal(current.status) !== 'failed') {
      retried = current;
      frames.push({ ...baseFrame(current, tick), input: 'retry' });
      break;
    }
    await advance(page);
  }
  await releaseKeyboard(page);
  trace.events = await events(page);
  validateActionTrace(trace);
  const measurement = measureRetryFriction(metricTrace(fixedStepMs, frames));
  const keyboardObserved = trace.events.some(({ source }) => source === 'keyboard');
  return {
    trace,
    value: beginsFailed && retried && keyboardObserved && measurement.maximumMilliseconds !== null
      ? measurement.maximumMilliseconds
      : maximumMs + fixedStepMs,
  };
}

async function collectFinish(page: Page, fixedStepMs: number) {
  const trace = await loadScenario(page, 'finish-crossing');
  const initial = trace.snapshots[0]!;
  for (let index = 0; index < 120; index += 1) {
    const next = await advance(page);
    trace.snapshots.push(next);
    const crossed = initial.player.x < initial.finishX && next.player.x >= initial.finishX;
    if (crossed || terminal(next.status) !== undefined) break;
  }
  trace.events = await events(page);
  validateActionTrace(trace);
  const measurement = countMissedFinishDetections(metricTrace(fixedStepMs, framesFromTrace(trace)), {
    axis: 'x',
    coordinate: initial.finishX,
    direction: 'positive',
    minimumSpeed: Math.max(1, initial.maxSpeed * 0.8),
  });
  return {
    trace,
    value: measurement.highSpeedCrossings > 0 ? measurement.missedDetections : 1,
  };
}

function measured(value: number, passed: boolean, evidence: string): MeasuredMetric {
  return { value: Number.isFinite(value) ? Math.max(0, value) : 0, passed, evidence };
}

function resultFromMeasurements(
  slot: Slot,
  workspace: string,
  spec: ActionMechanicExperimentSpec,
  values: Record<MetricName, number>,
  evidence: string,
  forcedFailure?: string,
): Result {
  const thresholds = spec.automaticQaThresholds;
  const suffix = forcedFailure ? `; forced failure: ${forcedFailure}` : '';
  return {
    slot,
    workspace,
    inputResponseMs: measured(values.inputResponseMs, !forcedFailure && values.inputResponseMs <= thresholds.inputResponseMs.max, `${evidence}#input-response${suffix}`),
    releaseVelocityRetentionRatio: measured(values.releaseVelocityRetentionRatio, !forcedFailure && values.releaseVelocityRetentionRatio >= thresholds.releaseVelocityRetentionRatio.min, `${evidence}#release-kinematics${suffix}`),
    wrongHookAttachments: measured(values.wrongHookAttachments, !forcedFailure && values.wrongHookAttachments <= thresholds.wrongHookAttachments.max, `${evidence}#hook-selection${suffix}`),
    maxEventGapMs: measured(values.maxEventGapMs, !forcedFailure && values.maxEventGapMs <= thresholds.maxEventGapMs.max, `${evidence}#event-gap${suffix}`),
    retryFrictionMs: measured(values.retryFrictionMs, !forcedFailure && values.retryFrictionMs <= thresholds.retryFrictionMs.max, `${evidence}#retry-friction${suffix}`),
    missedFinishDetections: measured(values.missedFinishDetections, !forcedFailure && values.missedFinishDetections <= thresholds.missedFinishDetections.max, `${evidence}#finish-crossing${suffix}`),
  };
}

function everyMetricPassed(result: Result) {
  return SCENARIOS.every((_, index) => {
    const names: readonly MetricName[] = [
      'inputResponseMs',
      'releaseVelocityRetentionRatio',
      'wrongHookAttachments',
      'maxEventGapMs',
      'retryFrictionMs',
      'missedFinishDetections',
    ];
    return result[names[index]!].passed;
  });
}

function chooseRecommendation(results: Result[]): Slot | 'NONE' {
  const passing = results.filter(everyMetricPassed);
  if (passing.length === 0) return 'NONE';
  return [...passing].sort((left, right) => {
    const leftScore = left.releaseVelocityRetentionRatio.value - left.inputResponseMs.value / 1_000
      - left.maxEventGapMs.value / 10_000 - left.retryFrictionMs.value / 10_000;
    const rightScore = right.releaseVelocityRetentionRatio.value - right.inputResponseMs.value / 1_000
      - right.maxEventGapMs.value / 10_000 - right.retryFrictionMs.value / 10_000;
    return rightScore - leftScore || left.slot.localeCompare(right.slot);
  })[0]!.slot;
}

async function failedBrowserResults(
  spec: ActionMechanicExperimentSpec,
  buildReport: ActionPrototypeBuildReport,
  runRoot: string,
  error: unknown,
) {
  const reason = error instanceof Error ? error.message : String(error);
  const results: Result[] = [];
  for (const prototype of buildReport.prototypes) {
    const log = `logs/action-${prototype.slot}.log`;
    const trace = `traces/action-${prototype.slot}.json`;
    await writeFile(path.join(runRoot, log), `[infrastructure:error] ${reason}\n`);
    await writeFile(path.join(runRoot, trace), `${JSON.stringify({ slot: prototype.slot, error: reason }, null, 2)}\n`);
    results.push({ slot: prototype.slot, workspace: prototype.workspace, ...failureValues(spec, `${log}: browser infrastructure failure: ${reason}`) });
  }
  return results;
}

export async function runActionPlaywrightQa(
  runtime: RuntimeAdapter,
  inputSpec: ActionMechanicExperimentSpec,
  inputBuildReport: ActionPrototypeBuildReport,
  runRoot: string,
): Promise<ActionPlaytestReport> {
  const spec = ActionMechanicExperimentSpecSchema.parse(inputSpec);
  const buildReport = ActionPrototypeBuildReportSchema.parse(inputBuildReport);
  if (spec.experimentId !== buildReport.experimentId) throw new Error('Action experiment and build report IDs do not match');
  await Promise.all(['screenshots', 'logs', 'traces'].map((directory) => mkdir(path.join(runRoot, directory), { recursive: true })));

  let browser: Browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    const results = await failedBrowserResults(spec, buildReport, runRoot, error);
    return ActionPlaytestReportSchema.parse({
      schemaVersion: 1,
      experimentId: spec.experimentId,
      reviewer: 'QAAgent',
      prototypeAuthor: 'BuilderAgent',
      results,
      recommendation: 'NONE',
      rationale: 'No prototype can be recommended because Chromium failed to launch; see per-slot infrastructure logs.',
    });
  }

  const results: Result[] = [];
  try {
    for (const prototype of buildReport.prototypes) {
      const slot = prototype.slot;
      const consoleLines: string[] = [];
      const scenarioEvidence = {} as ScenarioEvidence;
      const logPath = `logs/action-${slot}.log`;
      const screenshotPath = `screenshots/action-${slot}.png`;
      const tracePath = `traces/action-${slot}.json`;
      const playwrightTracePath = `traces/action-${slot}.zip`;
      let preview: Awaited<ReturnType<RuntimeAdapter['startPreview']>> | undefined;
      let context: Awaited<ReturnType<Browser['newContext']>> | undefined;
      let page: Page | undefined;
      let failure: string | undefined;
      let values: Record<MetricName, number> | undefined;

      try {
        const expected = spec.prototypes.find((candidate) => candidate.slot === slot);
        if (!expected) throw new Error(`No experiment specification exists for slot ${slot}`);
        if (expected.workspace !== prototype.workspace
          || expected.geometryFixtureHash !== prototype.geometryFixtureHash
          || expected.treatmentHash !== prototype.treatmentHash) {
          throw new Error(`BuilderAgent artifacts do not match the experiment specification for slot ${slot}`);
        }
        preview = await runtime.startPreview(workspacePath(runRoot, prototype.workspace));
        context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
        page = await context.newPage();
        page.on('console', (message) => {
          consoleLines.push(`[${message.type()}] ${message.text()}`);
          if (message.type() === 'error') failure ??= `browser console error: ${message.text()}`;
        });
        page.on('pageerror', (error) => {
          consoleLines.push(`[pageerror] ${error.message}`);
          failure ??= `page error: ${error.message}`;
        });
        await page.goto(preview.url, { waitUntil: 'networkidle' });
        const manifest = await requireContract(page, slot, prototype.geometryFixtureHash);
        if (!await page.locator('canvas').isVisible().catch(() => false)) throw new Error('Visible gameplay canvas is missing');
        const fixedStepMs = manifest.fixedStepSeconds * 1_000;

        const input = await collectInputResponse(page, fixedStepMs, spec.automaticQaThresholds.inputResponseMs.max);
        scenarioEvidence['input-response'] = input.trace;
        const release = await collectRelease(page, fixedStepMs);
        scenarioEvidence['release-kinematics'] = release.trace;
        const hooks = await collectHookSelection(page, fixedStepMs);
        scenarioEvidence['hook-selection'] = hooks.trace;
        const gap = await collectEventGap(page, fixedStepMs, spec.automaticQaThresholds.maxEventGapMs.max);
        scenarioEvidence['event-gap'] = gap.trace;
        const retry = await collectRetry(page, fixedStepMs, spec.automaticQaThresholds.retryFrictionMs.max);
        scenarioEvidence['retry-friction'] = retry.trace;
        const finish = await collectFinish(page, fixedStepMs);
        scenarioEvidence['finish-crossing'] = finish.trace;

        values = {
          inputResponseMs: input.value,
          releaseVelocityRetentionRatio: release.value,
          wrongHookAttachments: hooks.value,
          maxEventGapMs: gap.value,
          retryFrictionMs: retry.value,
          missedFinishDetections: finish.value,
        };
        for (const scenario of SCENARIOS) {
          const contractTrace = scenarioEvidence[scenario];
          const digest = hashActionTrace(metricTrace(fixedStepMs, framesFromTrace(contractTrace)));
          consoleLines.push(`[scenario:${scenario}] snapshots=${contractTrace.snapshots.length} events=${contractTrace.events.length} hash=${digest}`);
        }
      } catch (error) {
        failure ??= error instanceof Error ? error.message : String(error);
        consoleLines.push(`[qa:error] ${failure}`);
      } finally {
        await releaseKeyboard(page as Page).catch(() => undefined);
        if (page) {
          await page.screenshot({ path: path.join(runRoot, screenshotPath), fullPage: true }).catch((error: unknown) => {
            failure ??= `screenshot failed: ${error instanceof Error ? error.message : String(error)}`;
          });
        }
        if (context) {
          await context.tracing.stop({ path: path.join(runRoot, playwrightTracePath) }).catch((error: unknown) => {
            failure ??= `Playwright trace failed: ${error instanceof Error ? error.message : String(error)}`;
          });
          await context.close();
        }
        if (preview) await preview.stop().catch((error: unknown) => consoleLines.push(`[preview-stop:error] ${String(error)}`));
        await runtime.stopPreview().catch((error: unknown) => consoleLines.push(`[runtime-stop:error] ${String(error)}`));
      }

      await writeFile(path.join(runRoot, tracePath), `${JSON.stringify({
        schemaVersion: 1,
        slot,
        scenarios: scenarioEvidence,
        error: failure,
      }, null, 2)}\n`);
      await writeFile(path.join(runRoot, logPath), `${consoleLines.join('\n')}\n`);
      if (!values) {
        results.push({ slot, workspace: prototype.workspace, ...failureValues(spec, `${logPath}: ${failure ?? 'unknown QA failure'}`) });
      } else {
        results.push(resultFromMeasurements(slot, prototype.workspace, spec, values, tracePath, failure));
      }
    }
  } finally {
    await browser.close();
  }

  const recommendation = chooseRecommendation(results);
  const passingSlots = results.filter(everyMetricPassed).map(({ slot }) => slot);
  return ActionPlaytestReportSchema.parse({
    schemaVersion: 1,
    experimentId: spec.experimentId,
    reviewer: 'QAAgent',
    prototypeAuthor: 'BuilderAgent',
    results,
    recommendation,
    rationale: recommendation === 'NONE'
      ? 'No prototype passed all six independently measured action thresholds; inspect the per-slot logs and traces.'
      : `Prototype ${recommendation} is the strongest of the independently passing slots (${passingSlots.join(', ')}); all six measurements came from browser input and deterministic scenario traces.`,
  });
}
