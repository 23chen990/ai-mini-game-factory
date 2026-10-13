import { chromium, webkit, type Browser, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RuntimeAdapter } from '../adapters/runtime.js';
import { evaluateNaturalFlow } from '../core/qa-evidence.js';
import { QaReportSchema, type QaReport } from '../schemas/index.js';

type RuntimeEvent = { seq?: unknown; tick?: unknown; type?: unknown; objectId?: unknown };
type RuntimeState = {
  phase?: unknown;
  cuts?: unknown;
  attempt?: unknown;
  failureCause?: unknown;
  tick?: unknown;
  events?: unknown;
};

export type CutStackVisualStatus = 'CONFORMING' | 'MISMATCH' | 'INSUFFICIENT';
type NormalizedBox = { x: number; y: number; width: number; height: number };

export function classifyCutStackGeometryObservation(input: {
  observed?: NormalizedBox;
  renderColor?: string;
  components?: NormalizedBox[];
  observationFailure?: string;
}): { status: CutStackVisualStatus; reason?: string; rendered?: NormalizedBox } {
  if (input.observationFailure) return { status: 'INSUFFICIENT', reason: input.observationFailure };
  if (!input.observed) return { status: 'INSUFFICIENT', reason: 'runtime snapshot bounds unavailable' };
  if (!input.renderColor) return { status: 'INSUFFICIENT', reason: 'falling object renderColor evidence unavailable' };
  const overlap = (left: NormalizedBox, right: NormalizedBox) => {
    const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
    const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
    return width * height;
  };
  const candidates = (input.components ?? []).filter((component) => overlap(component, input.observed!) > 0);
  if (candidates.length === 0) return { status: 'INSUFFICIENT', reason: 'falling object fill was not isolated in canvas pixels', rendered: undefined };
  let rendered: NormalizedBox | undefined;
  if (candidates.length === 1) {
    rendered = candidates[0];
  } else {
    const observedArea = input.observed.width * input.observed.height;
    const ranked = candidates.map((component) => ({ component, ratio: observedArea > 0 ? overlap(component, input.observed!) / observedArea : 0 }))
      .sort((left, right) => right.ratio - left.ratio);
    const best = ranked[0];
    const next = ranked[1];
    // The runtime bounds are the identity anchor. A component that covers
    // almost all of that anchor and clearly dominates the next same-color
    // component can be isolated locally; close coverage remains ambiguous.
    if (best && next && best.ratio >= 0.75 && best.ratio >= next.ratio * 2) rendered = best.component;
    else return { status: 'INSUFFICIENT', reason: `same-color pixel components cannot uniquely isolate target (${candidates.length} overlapping components)` };
  }
  const isolated = rendered!;
  const passed = Math.abs(input.observed.x - isolated.x) < 0.06 && Math.abs(input.observed.y - isolated.y) < 0.06
    && Math.abs(input.observed.width - isolated.width) < 0.08 && Math.abs(input.observed.height - isolated.height) < 0.08;
  return passed ? { status: 'CONFORMING', rendered: isolated } : { status: 'MISMATCH', rendered: isolated, reason: 'isolated rendered bounds exceed frozen geometry tolerance' };
}

class VisualObservationInsufficientError extends Error {
  readonly visualEvidence = 'INSUFFICIENT' as const;
  constructor(message: string) {
    super(message);
    this.name = 'VisualObservationInsufficientError';
  }
}

const MUTATING_TEST_METHODS = ['resetGame', 'setRandomSeed', 'advanceTicks', 'tap', 'replay'];

async function state(page: Page): Promise<RuntimeState> {
  return page.evaluate(() => {
    const api = (window as unknown as { __GAME_TEST__?: { getState?: () => unknown } }).__GAME_TEST__;
    return typeof api?.getState === 'function' ? api.getState() as RuntimeState : {};
  });
}

async function events(page: Page): Promise<RuntimeEvent[]> {
  const current = await state(page);
  return Array.isArray(current.events) ? current.events as RuntimeEvent[] : [];
}

function hasEvent(values: RuntimeEvent[], type: string): boolean {
  return values.some((event) => event.type === type);
}

async function installMutationAudit(page: Page): Promise<void> {
  await page.evaluate(`(names) => {
    const target = window;
    const original = target.__GAME_TEST__;
    if (!original || typeof original !== 'object') return;
    const calls = [];
    const blocked = new Set(names);
    target.__GAME_TEST__ = new Proxy(original, {
      get(object, property, receiver) {
        const value = Reflect.get(object, property, receiver);
        if (typeof property === 'string' && blocked.has(property) && typeof value === 'function') {
          return (...args) => {
            calls.push(property);
            return value.apply(object, args);
          };
        }
        return value;
      },
    });
    target.__FACTORY_CUT_NATURAL_AUDIT__ = { calls };
  }`, MUTATING_TEST_METHODS);
}

async function mutationCalls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const value = (window as unknown as { __FACTORY_CUT_NATURAL_AUDIT__?: { calls?: unknown } }).__FACTORY_CUT_NATURAL_AUDIT__?.calls;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  });
}

async function waitForPhase(page: Page, expected: string, timeout = 6_000): Promise<RuntimeState> {
  await page.waitForFunction((phase) => {
    const api = (window as unknown as { __GAME_TEST__?: { getState?: () => { phase?: unknown } } }).__GAME_TEST__;
    return api?.getState?.().phase === phase;
  }, expected, { timeout });
  return state(page);
}

async function naturalTap(page: Page, actions: string[]): Promise<void> {
  const control = page.locator('#primary-action');
  await control.waitFor({ state: 'visible', timeout: 10_000 });
  const box = await control.boundingBox();
  if (!box) throw new VisualObservationInsufficientError('visible primary cut/flip control boundingBox unavailable');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  actions.push('pointer:tap-primary-action');
}

async function capture(page: Page, runRoot: string, name: string, screenshots: string[]): Promise<void> {
  const relative = `screenshots/cut-stack/${name}.png`;
  await page.screenshot({ path: path.join(runRoot, relative), fullPage: true });
  screenshots.push(relative);
}

function check(name: string, passed: boolean, evidence: unknown): QaReport['checks'][number] {
  return { name, passed, evidence: typeof evidence === 'string' ? evidence : JSON.stringify(evidence) };
}

/**
 * Dedicated cut-stack-dodge browser journey. Every gameplay transition in the
 * natural track comes from DOM pointer input; the test API is read-only until
 * the separate deterministic coverage track begins.
 */
export async function runCutStackDodgePlaywrightQa(runtime: RuntimeAdapter, workspace: string, runRoot: string, viewport = { width: 390, height: 844 }): Promise<QaReport> {
  await Promise.all([
    mkdir(path.join(runRoot, 'screenshots/cut-stack'), { recursive: true }),
    mkdir(path.join(runRoot, 'logs'), { recursive: true }),
  ]);
  const preview = await runtime.startPreview(workspace);
  const checks: QaReport['checks'] = [];
  const issues: QaReport['issues'] = [];
  const screenshots: string[] = [];
  const consoleLines: string[] = [];
  const actions: string[] = ['page.goto'];
  const transitions: Array<{ name: string; changed: boolean; evidence: string }> = [];
  let naturalFlow: QaReport['naturalFlow'];
  let visualStatus: CutStackVisualStatus | undefined;
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    page.on('console', (message) => {
      consoleLines.push(`[chromium:${message.type()}] ${message.text()}`);
      if (message.type() === 'error') issues.push({ id: `console-${issues.length + 1}`, severity: 'error', message: message.text(), evidence: 'logs/console.log' });
    });
    page.on('pageerror', (error) => issues.push({ id: `page-${issues.length + 1}`, severity: 'error', message: error.message, evidence: 'logs/console.log' }));
    await page.goto(preview.url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => {
      const api = (window as unknown as { __GAME_TEST__?: { templateId?: unknown; getState?: unknown } }).__GAME_TEST__;
      return api?.templateId === 'cut-stack-dodge-v1' && typeof api.getState === 'function';
    }, undefined, { timeout: 8_000 });
    await installMutationAudit(page);

    const initial = await state(page);
    const canvasVisible = await page.locator('#game-canvas').isVisible();
    const hudVisible = await page.locator('#hud').isVisible();
    const controlBox = await page.locator('#primary-action:visible').boundingBox();
    checks.push(check('cut-stack-mobile-affordance', canvasVisible && hudVisible && Boolean(controlBox && controlBox.width >= 44 && controlBox.height >= 44), { canvasVisible, hudVisible, controlBox }));
    await capture(page, runRoot, 'natural-start', screenshots);

    await naturalTap(page, actions);
    await page.waitForFunction(() => {
      const current = (window as unknown as { __GAME_TEST__?: { getState?: () => { objects?: Array<{ lifecycle?: string; fallOffset?: number }> } } }).__GAME_TEST__?.getState?.();
      return Boolean(current?.objects?.some((object) => object.lifecycle === 'falling' && Number(object.fallOffset) > 40));
    }, undefined, { timeout: 8_000 });
    const rawFallingGeometry = await page.evaluate(() => {
      try {
        const game = (window as unknown as { __GAME_TEST__?: { getState?: () => { objects?: Array<{ id: string; lifecycle: string }> } } }).__GAME_TEST__?.getState?.();
        const falling = game?.objects?.find((object) => object.lifecycle === 'falling');
        const snapshot = (window as unknown as { __REFERENCE_LEVEL_TEST__?: { getSnapshot?: () => { objectStates?: Array<{ semanticId: string; boundsNormalized?: { x: number; y: number; width: number; height: number }; renderColor?: string }> } } }).__REFERENCE_LEVEL_TEST__?.getSnapshot?.();
        const observedObject = falling && snapshot?.objectStates?.find((object) => object.semanticId === falling.id);
        const observed = observedObject?.boundsNormalized;
        const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
        const context = canvas?.getContext('2d');
        if (!falling) return { observationFailure: 'falling object lifecycle was not observed' };
        if (!observed) return { objectId: falling.id, lifecycle: falling.lifecycle, observationFailure: 'falling object runtime bounds were not observed' };
        if (!canvas || !context || canvas.width <= 0 || canvas.height <= 0) return { objectId: falling.id, lifecycle: falling.lifecycle, observed, observationFailure: 'canvas or 2D context was inaccessible' };
        const renderColor = observedObject?.renderColor;
        if (typeof renderColor !== 'string') return { objectId: falling.id, lifecycle: falling.lifecycle, observed, observationFailure: 'falling object renderColor evidence unavailable' };
        const match = /^#([0-9a-f]{6})$/iu.exec(renderColor.trim());
        if (!match) return { objectId: falling.id, lifecycle: falling.lifecycle, observed, renderColor, observationFailure: 'falling object renderColor is not a six-digit hex color' };
        const expected = [Number.parseInt(match[1]!.slice(0, 2), 16), Number.parseInt(match[1]!.slice(2, 4), 16), Number.parseInt(match[1]!.slice(4, 6), 16)];
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0 || innerWidth <= 0 || innerHeight <= 0) return { objectId: falling.id, lifecycle: falling.lifecycle, observed, renderColor, observationFailure: 'canvas viewport bounds were not measurable' };
        const mask = new Uint8Array(canvas.width * canvas.height);
        for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
          const normalizedX = (rect.left + x / canvas.width * rect.width) / innerWidth;
          const withinObservedColumn = normalizedX >= observed.x - 0.12 && normalizedX <= observed.x + observed.width + 0.12;
          const offset = (y * canvas.width + x) * 4;
          const matchesRenderedFill = withinObservedColumn
            && Math.hypot(pixels[offset]! - expected[0]!, pixels[offset + 1]! - expected[1]!, pixels[offset + 2]! - expected[2]!) < 24;
          if (matchesRenderedFill) mask[y * canvas.width + x] = 1;
        }
        const components: NormalizedBox[] = [];
        const queue: number[] = [];
        for (let index = 0; index < mask.length; index += 1) {
          if (mask[index] !== 1) continue;
          mask[index] = 2;
          queue.push(index);
          let minX = index % canvas.width; let maxX = minX; let minY = Math.floor(index / canvas.width); let maxY = minY;
          while (queue.length > 0) {
            const current = queue.pop()!;
            const x = current % canvas.width;
            const y = Math.floor(current / canvas.width);
            minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx; const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= canvas.width || ny >= canvas.height) continue;
              const neighbor = ny * canvas.width + nx;
              if (mask[neighbor] === 1) { mask[neighbor] = 2; queue.push(neighbor); }
            }
          }
          components.push({
            x: (rect.left + minX / canvas.width * rect.width) / innerWidth,
            y: (rect.top + minY / canvas.height * rect.height) / innerHeight,
            width: ((maxX - minX + 1) / canvas.width * rect.width) / innerWidth,
            height: ((maxY - minY + 1) / canvas.height * rect.height) / innerHeight,
          });
        }
        return { objectId: falling.id, lifecycle: falling.lifecycle, observed, renderColor, components };
      } catch (error) {
        return { observationFailure: `canvas pixel observation threw: ${error instanceof Error ? error.message : String(error)}` };
      }
    });
    const fallingGeometry = classifyCutStackGeometryObservation(rawFallingGeometry);
    visualStatus = fallingGeometry.status;
    checks.push(check('cut-stack-rendered-falling-bounds', fallingGeometry.status === 'CONFORMING', { ...fallingGeometry, observation: rawFallingGeometry }));
    const failed = await waitForPhase(page, 'failed');
    const failureEvents = await events(page);
    const cutObserved = hasEvent(failureEvents, 'cut');
    const dropObserved = hasEvent(failureEvents, 'drop');
    const hazardObserved = hasEvent(failureEvents, 'hazard') && typeof failed.failureCause === 'string';
    const failureStatus = (await page.locator('#status').textContent())?.trim() ?? '';
    const internalFailureIdVisible = typeof failed.failureCause === 'string' && failureStatus.includes(failed.failureCause);
    transitions.push({ name: 'cut', changed: cutObserved, evidence: cutObserved ? 'natural tap produced a cut event' : 'cut event missing' });
    transitions.push({ name: 'drop', changed: dropObserved, evidence: dropObserved ? 'cut target entered a drop trajectory' : 'drop event missing' });
    transitions.push({ name: 'obstacle-failure', changed: hazardObserved, evidence: hazardObserved ? `visible hazard attributed failure to ${String(failed.failureCause)}` : 'attributable hazard failure missing' });
    actions.push('observe:cut', 'observe:drop', 'observe:obstacle-failure');
    checks.push(check('cut-stack-natural-failure', cutObserved && dropObserved && hazardObserved && failed.phase === 'failed', { initial, failed, eventTypes: failureEvents.map((event) => event.type) }));
    checks.push(check('cut-stack-player-facing-failure-cause', hazardObserved && failureStatus.includes('尖刺') && !internalFailureIdVisible, { failureStatus, internalFailureIdVisible, failureCause: failed.failureCause }));
    await capture(page, runRoot, 'natural-failure', screenshots);

    const retry = page.locator('#replay-button:visible');
    if (await retry.count() === 0) throw new Error('visible retry control is missing after failure');
    await retry.click();
    actions.push('pointer:retry');
    const retried = await waitForPhase(page, 'ready');
    const retryObserved = Number(retried.attempt) > Number(initial.attempt ?? 0);
    transitions.push({ name: 'retry', changed: retryObserved, evidence: retryObserved ? 'visible retry returned to a ready attempt' : 'retry did not return to ready' });
    checks.push(check('cut-stack-natural-retry', retryObserved, retried));

    await naturalTap(page, actions);
    const successDeadline = Date.now() + 7_000;
    let success = await state(page);
    while (success.phase === 'playing' && Date.now() < successDeadline) {
      await page.waitForTimeout(760);
      success = await state(page);
      if (success.phase === 'playing') await naturalTap(page, actions);
    }
    if (success.phase !== 'won') success = await waitForPhase(page, 'won', 2_000);
    const successEvents = await events(page);
    const finishObserved = success.phase === 'won' && hasEvent(successEvents, 'finish');
    transitions.push({ name: 'finish', changed: finishObserved, evidence: finishObserved ? 'natural tap cadence reached visible settlement' : 'finish settlement missing' });
    checks.push(check('cut-stack-natural-finish', finishObserved, { success, eventTypes: successEvents.map((event) => event.type) }));
    await capture(page, runRoot, 'natural-finish', screenshots);

    const finishReplay = page.locator('#replay-button:visible');
    if (await finishReplay.count() === 0) throw new Error('visible replay control is missing after finish');
    await finishReplay.click();
    actions.push('pointer:replay-after-finish');
    const replayed = await waitForPhase(page, 'ready');
    const replayObserved = Number(replayed.attempt) > Number(retried.attempt ?? 0);
    await page.waitForTimeout(34);
    const replayImpact = page.locator('#impact-label');
    const replayImpactText = (await replayImpact.textContent())?.trim() ?? '';
    const replayImpactVisible = await replayImpact.evaluate((element) => element.classList.contains('visible'));
    transitions.push({ name: 'terminal-replay', changed: replayObserved, evidence: replayObserved ? 'terminal replay returned to the ready checkpoint' : 'terminal replay failed' });
    checks.push(check('cut-stack-terminal-replay', replayObserved, replayed));
    checks.push(check('cut-stack-replay-clears-terminal-feedback', replayObserved && !replayImpactVisible && replayImpactText.length === 0, { replayImpactVisible, replayImpactText, replayed }));
    await capture(page, runRoot, 'natural-replay', screenshots);

    const forbiddenOperations = await mutationCalls(page);
    naturalFlow = evaluateNaturalFlow({
      line: 'cut-stack-dodge',
      startedFromReset: initial.phase === 'ready' && Number(initial.attempt) === 1 && Number(initial.cuts) === 0 && (Array.isArray(initial.events) ? initial.events.length === 0 : true),
      actions,
      transitions,
      completion: finishObserved ? 'terminal' : 'none',
      replayObserved: retryObserved && replayObserved,
      forbiddenOperations,
      screenshots: screenshots.filter((item) => item.includes('/natural-')),
    });
    checks.push(check('natural-flow-complete', naturalFlow.passed, { blockers: naturalFlow.blockers, actions: naturalFlow.actions, transitions: naturalFlow.transitions }));

    // Engineering truth is intentionally separate from the pointer journey.
    const deterministic = await page.evaluate(() => {
      const api = (window as unknown as { __GAME_TEST__: {
        resetGame(): unknown;
        setRandomSeed(seed: number): unknown;
        tap(): unknown;
        advanceTicks(count: number): { phase?: unknown; failureCause?: unknown; events?: RuntimeEvent[] };
      } }).__GAME_TEST__;
      api.resetGame();
      api.setRandomSeed(42);
      api.tap();
      return api.advanceTicks(90);
    });
    const deterministicEvents = Array.isArray(deterministic.events) ? deterministic.events : [];
    const deterministicHazard = deterministicEvents.find((event) => event.type === 'hazard');
    checks.push(check('cut-stack-deterministic-state-coverage', deterministic.phase === 'failed'
      && typeof deterministic.failureCause === 'string'
      && deterministic.failureCause === deterministicHazard?.objectId
      && hasEvent(deterministicEvents, 'cut')
      && hasEvent(deterministicEvents, 'drop'), deterministic));
    await context.close();
  } catch (error) {
    if (error instanceof VisualObservationInsufficientError) {
      visualStatus = visualStatus === 'MISMATCH' ? visualStatus : 'INSUFFICIENT';
      if (!checks.some((item) => item.name === 'cut-stack-rendered-falling-bounds')) checks.push(check('cut-stack-rendered-falling-bounds', false, { status: 'INSUFFICIENT', reason: error.message }));
    }
    issues.push({ id: 'cut-stack-preview-runtime', severity: 'error', message: error instanceof Error ? error.stack ?? error.message : String(error), evidence: 'Chromium cut-stack journey' });
  } finally {
    await browser?.close();
    await preview.stop();
    await runtime.stopPreview();
  }

  let packagedBrowser: Browser | undefined;
  try {
    packagedBrowser = await webkit.launch({ headless: true });
    const page = await packagedBrowser.newPage({ viewport: { width: 390, height: 844 } });
    page.on('console', (message) => {
      consoleLines.push(`[webkit-file:${message.type()}] ${message.text()}`);
      if (message.type() === 'error') issues.push({ id: `package-console-${issues.length + 1}`, severity: 'error', message: message.text(), evidence: 'logs/console.log' });
    });
    page.on('pageerror', (error) => issues.push({ id: `package-page-${issues.length + 1}`, severity: 'error', message: error.message, evidence: 'logs/console.log' }));
    await page.goto(pathToFileURL(path.join(workspace, 'dist/index.html')).href, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean((window as unknown as { __GAME_TEST__?: unknown }).__GAME_TEST__), undefined, { timeout: 5_000 });
    const packagedCanvas = await page.locator('#game-canvas').isVisible();
    const packagedHud = await page.locator('#hud').isVisible();
    checks.push(check('packaged-webkit-load', packagedCanvas && packagedHud, { packagedCanvas, packagedHud, entrypoint: 'dist/index.html' }));
    await capture(page, runRoot, 'packaged-webkit', screenshots);
  } catch (error) {
    checks.push(check('packaged-webkit-load', false, error instanceof Error ? error.message : String(error)));
    issues.push({ id: 'cut-stack-package-runtime', severity: 'error', message: error instanceof Error ? error.stack ?? error.message : String(error), evidence: 'WebKit file:// execution' });
  } finally {
    await packagedBrowser?.close();
  }

  for (const item of checks) {
    if (!item.passed && !issues.some((issue) => issue.message.includes(item.name))) {
      const insufficientVisual = visualStatus === 'INSUFFICIENT' && item.name === 'cut-stack-rendered-falling-bounds';
      issues.push({ id: `check-${issues.length + 1}`, severity: insufficientVisual ? 'warning' : 'error', message: `${item.name} failed`, evidence: item.evidence });
    }
  }
  await writeFile(path.join(runRoot, 'logs/console.log'), `${consoleLines.join('\n')}\n`);
  const naturalArtifacts = naturalFlow?.screenshots ?? [];
  return QaReportSchema.parse({
    schemaVersion: 1,
    passed: Boolean(naturalFlow?.passed) && checks.length >= 7 && checks.every((item) => item.passed) && issues.every((issue) => issue.severity !== 'error'),
    checks,
    issues,
    screenshots,
    consoleLog: 'logs/console.log',
    testedAt: new Date().toISOString(),
    visualStatus: visualStatus ?? 'INSUFFICIENT',
    ...(naturalFlow ? { naturalFlow } : {}),
    evidence: [
      {
        schemaVersion: 1,
        mode: 'STATE_COVERAGE',
        actions: ['__GAME_TEST__.resetGame', '__GAME_TEST__.setRandomSeed', '__GAME_TEST__.tap', '__GAME_TEST__.advanceTicks'],
        artifacts: ['artifacts/qa-report.json', 'logs/console.log'],
        forbiddenOperations: ['resetGame', 'setRandomSeed', 'tap', 'advanceTicks'],
      },
      {
        schemaVersion: 1,
        mode: 'NATURAL_E2E',
        actions: naturalFlow?.actions ?? ['natural-flow:missing'],
        artifacts: naturalArtifacts.length > 0 ? naturalArtifacts : ['screenshots/cut-stack:natural-evidence-missing'],
        forbiddenOperations: naturalFlow?.forbiddenOperations ?? [],
      },
    ],
  });
}
