import { z } from 'zod';
import { chromium, webkit, type Browser, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RuntimeAdapter } from '../adapters/runtime.js';
import { evaluateNaturalFlow } from '../core/qa-evidence.js';
import { QaReportSchema, type QaReport } from '../schemas/index.js';

type RuntimeEvent = { seq?: unknown; tick?: unknown; type?: unknown; objectId?: unknown };
type RuntimeState = {
  randomSeed?: unknown;
  phase?: unknown;
  cuts?: unknown;
  attempt?: unknown;
  failureCause?: unknown;
  tick?: unknown;
  events?: unknown;
};

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
  const control = page.locator('#primary-action:visible');
  if (await control.count() === 0) throw new Error('visible primary cut/flip control is missing');
  // Mobile play uses an actual browser touch on the visible button, not a
  // Playwright auto-retrying click that can wait 30s after the run ended.
  const box = await control.boundingBox();
  if (!box) throw new Error('primary action lost its visible hit area');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
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
export async function runCutStackDodgePlaywrightQa(runtime: RuntimeAdapter, workspace: string, runRoot: string): Promise<QaReport> {
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
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
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

    // One honest human-reproducible sequence: tap to launch, then tap at
    // visible progress markers to carry the blade above the central spike.
    // The progress meter is rendered to players; test-only advanceTicks/tap
    // are NEVER used in the natural run. Different host frame rates do not
    // change the authored progress checkpoints.
    const tapAtProgress = async (minimumPercent: number): Promise<void> => {
      await page.waitForFunction((percent) => {
        const api = (window as unknown as { __GAME_TEST__?: { getState?: () => { phase?: unknown } } }).__GAME_TEST__;
        const phase = api?.getState?.()?.phase;
        const meter = document.querySelector<HTMLElement>('#progress-fill');
        return phase === 'won' || phase === 'failed' ||
          (phase === 'playing' && Number.parseFloat(meter?.style.width ?? '') >= percent);
      }, minimumPercent, { timeout: 9_000, polling: 30 });
      const before = await state(page);
      if (before.phase !== 'playing') throw new Error(
        `natural success route ended before visible ${minimumPercent}% checkpoint: ${JSON.stringify({
          phase: before.phase, failureCause: before.failureCause, tick: before.tick,
        })}`);
      await naturalTap(page, actions);
    };
    await naturalTap(page, actions);
    await tapAtProgress(18);
    await tapAtProgress(40);
    const success = await waitForPhase(page, 'won', 6_000);
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
    naturalFlow = { ...naturalFlow, device: { width: 390, height: 844, label: 'chromium-mobile-emulation' }, seed: z.number().int().parse(initial.randomSeed) };
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
    issues.push({ id: 'cut-stack-preview-runtime', severity: 'error', message: error instanceof Error ? error.message : String(error), evidence: 'Chromium cut-stack journey' });
  } finally {
    await browser?.close();
    // Keep the Vite *preview* (served from dist/) alive for independent
    // packaged WebKit verification below. file:// cannot load Vite ESM chunks.
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
    // Vite emits external ESM chunks. They are not executable under file://
    // CORS in WebKit, but packaged H5 games are shipped over HTTP(S).
    // Vite preview serves the actual dist/ directory, not source dev files.
    await page.goto(preview.url, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean((window as unknown as { __GAME_TEST__?: unknown }).__GAME_TEST__), undefined, { timeout: 5_000 });
    const packagedCanvas = await page.locator('#game-canvas').isVisible();
    const packagedHud = await page.locator('#hud').isVisible();
    checks.push(check('packaged-webkit-load', packagedCanvas && packagedHud, { packagedCanvas, packagedHud, entrypoint: 'dist/index.html' }));
    await capture(page, runRoot, 'packaged-webkit', screenshots);
  } catch (error) {
    checks.push(check('packaged-webkit-load', false, error instanceof Error ? error.message : String(error)));
    issues.push({ id: 'cut-stack-package-runtime', severity: 'error', message: error instanceof Error ? error.message : String(error), evidence: 'WebKit HTTP-served packaged dist/' });
  } finally {
    await packagedBrowser?.close();
    await preview.stop();
    await runtime.stopPreview();
  }

  for (const item of checks) {
    if (!item.passed && !issues.some((issue) => issue.message.includes(item.name))) {
      issues.push({ id: `check-${issues.length + 1}`, severity: 'error', message: `${item.name} failed`, evidence: item.evidence });
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
    ...(naturalFlow ? { naturalFlow } : {}),
    evidence: [
      {
        schemaVersion: 1,
        mode: 'STATE_COVERAGE',
        device: { width: 390, height: 844, label: 'chromium-mobile-emulation' }, seed: 42,
        actions: ['__GAME_TEST__.resetGame', '__GAME_TEST__.setRandomSeed', '__GAME_TEST__.tap', '__GAME_TEST__.advanceTicks'],
        artifacts: ['artifacts/qa-report.json', 'logs/console.log'],
        forbiddenOperations: ['resetGame', 'setRandomSeed', 'tap', 'advanceTicks'],
      },
      {
        schemaVersion: 1,
        mode: 'NATURAL_E2E',
        device: naturalFlow?.device, seed: naturalFlow?.seed,
        actions: naturalFlow?.actions ?? ['natural-flow:missing'],
        artifacts: naturalArtifacts.length > 0 ? naturalArtifacts : ['screenshots/cut-stack:natural-evidence-missing'],
        forbiddenOperations: naturalFlow?.forbiddenOperations ?? [],
      },
    ],
  });
}
