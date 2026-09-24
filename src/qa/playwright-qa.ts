import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, webkit, type Browser, type Page } from '@playwright/test';
import type { RuntimeAdapter } from '../adapters/runtime.js';
import {
  GameplayRevisionLockSchema,
  GameplayRevisionReferenceSchema,
  NaturalFlowEvidenceSchema,
  type GameplayRevisionLock,
  type NaturalFlowEvidence,
  type QaReport,
} from '../schemas/index.js';
import { evaluateNaturalFlow } from '../core/qa-evidence.js';
import { qaModeForProductionLine } from './production-line-qa.js';
import { runCutStackDodgePlaywrightQa } from './cut-stack-playwright-qa.js';

async function loadGameplayRevision(runRoot: string): Promise<GameplayRevisionLock | undefined> {
  let blueprintSource: string;
  try {
    blueprintSource = await readFile(path.join(runRoot, 'artifacts/game-blueprint.json'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  const blueprint = JSON.parse(blueprintSource) as { gameplayRevision?: unknown };
  if (!blueprint.gameplayRevision) return undefined;
  const reference = GameplayRevisionReferenceSchema.parse(blueprint.gameplayRevision);
  const revision = GameplayRevisionLockSchema.parse(JSON.parse(await readFile(path.join(runRoot, reference.artifactPath), 'utf8')));
  if (revision.revisionId !== reference.revisionId || revision.targetRunId !== reference.targetRunId || revision.title !== reference.title) {
    throw new Error('gameplay revision does not match the blueprint reference');
  }
  return revision;
}

type BrowserBox = { x: number; y: number; width: number; height: number } | null;

type BrowserState = Record<string, unknown>;

const NATURAL_FORBIDDEN_API = [
  'resetGame', 'setRandomSeed', 'spawnCustomer', 'completeOrder', 'grantCurrency',
  'upgradeStation', 'setState', 'loadScenario', 'teleport', 'setPlayerPosition',
  'advanceTime', 'advanceTicks', 'act',
] as const;

function stateSignature(value: BrowserState | undefined): string {
  try { return JSON.stringify(value ?? null); } catch { return String(value); }
}

function numericState(value: BrowserState | undefined, key: string): number | undefined {
  const raw = value?.[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

function stateDeltaEvidence(before: BrowserState | undefined, after: BrowserState | undefined, action: string): string {
  if (!before || !after) return `${action}: observable state API unavailable`;
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => stateSignature(before[key] as BrowserState) !== stateSignature(after[key] as BrowserState))
    .slice(0, 8);
  return keys.length > 0 ? `${action}: changed ${keys.join(', ')}` : `${action}: no observable state change`;
}

function settlementObserved(before: BrowserState | undefined, after: BrowserState | undefined): boolean {
  if (!before || !after) return false;
  const beforeCurrency = numericState(before, 'currency');
  const afterCurrency = numericState(after, 'currency');
  if (beforeCurrency !== undefined && afterCurrency !== undefined && afterCurrency > beforeCurrency) return true;
  if (before.customerWaiting === true && after.customerWaiting === false) return true;
  const beforeCompleted = numericState(before, 'completedOrders') ?? numericState(before, 'ordersCompleted');
  const afterCompleted = numericState(after, 'completedOrders') ?? numericState(after, 'ordersCompleted');
  return beforeCompleted !== undefined && afterCompleted !== undefined && afterCompleted > beforeCompleted;
}

function terminalObserved(state: BrowserState | undefined): boolean {
  if (!state) return false;
  if (state.failed === true || state.lost === true || state.won === true || state.completed === true) return true;
  const phase = typeof state.phase === 'string' ? state.phase : typeof state.status === 'string' ? state.status : '';
  return /(?:failed|lost|won|complete|finished|death|settled|结算|失败|完成)/iu.test(phase);
}

async function readBrowserState(page: Page): Promise<BrowserState | undefined> {
  const value = await page.evaluate(() => {
    const api = (window as unknown as { __GAME_TEST__?: { getState?: () => unknown } }).__GAME_TEST__;
    if (typeof api?.getState !== 'function') return undefined;
    const state = api.getState();
    return state && typeof state === 'object' && !Array.isArray(state) ? state as Record<string, unknown> : undefined;
  }).catch(() => undefined);
  return value;
}

async function waitForBrowserStateChange(page: Page, before: BrowserState | undefined, timeoutMs = 3_000): Promise<BrowserState | undefined> {
  const started = Date.now();
  let current = await readBrowserState(page);
  while (Date.now() - started < timeoutMs) {
    if (stateSignature(current) !== stateSignature(before)) return current;
    await page.waitForTimeout(50);
    current = await readBrowserState(page);
  }
  return current;
}

/** Wrap state-mutating test helpers so a natural trace can prove they were not
 * called. The wrapper is installed only for the browser observation window;
 * state-coverage calls later in the run remain available and are intentionally
 * excluded from this audit. */
async function installNaturalApiAudit(page: Page): Promise<void> {
  // Keep this page hook as a plain JavaScript expression.  When the factory
  // CLI is launched through tsx, transpiled callbacks can contain helper
  // references (for example `__name`) that do not exist in the browser
  // isolate.  A string expression is self-contained and still receives the
  // forbidden names as a JSON-serialized argument, so no page data becomes
  // executable code.
  await page.evaluate(`(forbidden) => {
    const target = window;
    const api = target.__GAME_TEST__;
    if (!api || typeof api !== 'object') return;
    const calls = [];
    const forbiddenSet = new Set(forbidden);
    const wrapped = new Proxy(api, {
      get(object, property, receiver) {
        const value = Reflect.get(object, property, receiver);
        if (typeof property === 'string' && forbiddenSet.has(property) && typeof value === 'function') {
          return (...args) => {
            calls.push(property);
            return value.apply(object, args);
          };
        }
        return value;
      },
    });
    target.__GAME_TEST__ = wrapped;
    target.__FACTORY_NATURAL_AUDIT__ = { calls, reset: () => { calls.length = 0; } };
  }`, [...NATURAL_FORBIDDEN_API]);
}

async function naturalApiCalls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const audit = (window as unknown as { __FACTORY_NATURAL_AUDIT__?: { calls?: unknown } }).__FACTORY_NATURAL_AUDIT__;
    return Array.isArray(audit?.calls) ? audit.calls.filter((item): item is string => typeof item === 'string') : [];
  }).catch(() => []);
}

async function resetNaturalApiAudit(page: Page): Promise<void> {
  await page.evaluate(() => {
    const audit = (window as unknown as { __FACTORY_NATURAL_AUDIT__?: { reset?: () => void } }).__FACTORY_NATURAL_AUDIT__;
    audit?.reset?.();
  }).catch(() => undefined);
}

async function clickNaturalControl(page: Page, selector: string, label: string, actions: string[], transitions: Array<{ name: string; changed: boolean; evidence: string }>): Promise<{ before?: BrowserState; after?: BrowserState; clicked: boolean }> {
  const control = page.locator(`${selector}:visible`).first();
  if (await control.count() === 0 || !await control.isEnabled().catch(() => false)) return { clicked: false };
  const before = await readBrowserState(page);
  await control.click();
  actions.push(`locator:${selector}.click`);
  const after = await waitForBrowserStateChange(page, before);
  transitions.push({ name: label, changed: stateSignature(before) !== stateSignature(after), evidence: stateDeltaEvidence(before, after, label) });
  return { before, after, clicked: true };
}

async function collectNaturalIdleFlow(page: Page, runRoot: string): Promise<NaturalFlowEvidence> {
  const actions: string[] = ['page.goto'];
  const transitions: Array<{ name: string; changed: boolean; evidence: string }> = [];
  await installNaturalApiAudit(page);
  await resetNaturalApiAudit(page);
  const initial = await readBrowserState(page);
  const startedFromReset = true;
  let current = initial;
  let settled = false;
  let terminal = terminalObserved(current);

  await page.screenshot({ path: path.join(runRoot, 'screenshots/natural-start.png'), fullPage: true });
  const produce = await clickNaturalControl(page, '#produce', 'produce', actions, transitions);
  if (produce.clicked) current = produce.after;
  else {
    const automatic = await waitForBrowserStateChange(page, current, 2_000);
    const changed = stateSignature(current) !== stateSignature(automatic);
    // Some legitimate auto-running games can advance before the first
    // snapshot (for example while the bundle is loading). Treat an already
    // populated observable progress field as evidence of that path, while
    // keeping the strict release gate responsible for requiring settlement.
    const alreadyProgressing = Boolean(automatic && (
      (numericState(automatic, 'inventory') ?? 0) > 0
      || (numericState(automatic, 'currency') ?? 0) > 0
      || terminalObserved(automatic)
    ));
    transitions.push({ name: 'automatic-progress', changed: changed || alreadyProgressing, evidence: changed ? stateDeltaEvidence(current, automatic, 'automatic-progress') : alreadyProgressing ? 'automatic-progress: observable state already advanced before first snapshot' : stateDeltaEvidence(current, automatic, 'automatic-progress') });
    current = automatic;
    actions.push(alreadyProgressing ? 'observe:automatic-state' : 'observe:automatic-progress');
  }

  // Complete as many naturally enabled orders as needed to expose one real
  // upgrade decision. No test API mutator is called in this loop.
  for (let cycle = 0; cycle < 12; cycle += 1) {
    const delivery = await clickNaturalControl(page, '#deliver', 'deliver', actions, transitions);
    if (delivery.clicked) {
      settled ||= settlementObserved(delivery.before, delivery.after);
      current = delivery.after;
      terminal ||= terminalObserved(current);
    }
    const upgrade = await clickNaturalControl(page, '#upgrade', 'upgrade', actions, transitions);
    if (upgrade.clicked) {
      current = upgrade.after;
      terminal ||= terminalObserved(current);
      break;
    }
    const nextProduce = await clickNaturalControl(page, '#produce', 'produce', actions, transitions);
    if (nextProduce.clicked) current = nextProduce.after;
    else {
      const progressed = await waitForBrowserStateChange(page, current, 500);
      if (stateSignature(progressed) !== stateSignature(current)) {
        transitions.push({ name: 'automatic-progress', changed: true, evidence: stateDeltaEvidence(current, progressed, 'automatic-progress') });
        current = progressed;
      }
    }
  }
  await page.screenshot({ path: path.join(runRoot, 'screenshots/natural-flow.png'), fullPage: true });
  const forbiddenBeforeReplay = await naturalApiCalls(page);
  const replayBefore = current;
  const refreshBefore = await readBrowserState(page);
  await page.reload({ waitUntil: 'networkidle' });
  actions.push('page.reload');
  await page.waitForFunction(() => Boolean((window as any).__GAME_TEST__), undefined, { timeout: 5_000 }).catch(() => undefined);
  await installNaturalApiAudit(page);
  await resetNaturalApiAudit(page);
  const replayInitial = await readBrowserState(page);
  // Keep the reload itself in the trace.  It is a real recovery/re-entry
  // action for a player, and recording it prevents the line policy from
  // depending on a runner-specific action-label alias.
  transitions.push({
    name: 'refresh',
    changed: stateSignature(refreshBefore) !== stateSignature(replayInitial),
    evidence: stateDeltaEvidence(refreshBefore, replayInitial, 'refresh'),
  });
  const replayAction = await clickNaturalControl(page, '#produce', 'replay-primary-action', actions, transitions);
  const replayAfter = replayAction.after ?? await waitForBrowserStateChange(page, replayInitial, 1_500);
  const replayAutomaticState = Boolean(replayAfter && ((numericState(replayAfter, 'inventory') ?? 0) > 0 || (numericState(replayAfter, 'currency') ?? 0) > 0 || terminalObserved(replayAfter)));
  const replayObserved = replayAction.clicked || stateSignature(replayInitial) !== stateSignature(replayAfter) || stateSignature(replayBefore) !== stateSignature(replayAfter) || replayAutomaticState;
  if (replayObserved) actions.push('replay:observed-state-change');
  const forbiddenOperations = [...forbiddenBeforeReplay, ...(await naturalApiCalls(page))];
  const completion = settled ? 'settlement' : terminal ? 'terminal' : transitions.some((item) => item.changed) ? 'automatic-progress' : 'none';
  const result = evaluateNaturalFlow({ line: 'idle-management', startedFromReset, actions, transitions, completion, replayObserved, forbiddenOperations, screenshots: ['screenshots/natural-start.png', 'screenshots/natural-flow.png'] });
  return NaturalFlowEvidenceSchema.parse(result);
}

function isInsideViewport(box: BrowserBox, viewport: { width: number; height: number }, minimumSize = 0) {
  return Boolean(
    box
    && box.x >= 0
    && box.y >= 0
    && box.x + box.width <= viewport.width
    && box.y + box.height <= viewport.height
    && box.width >= minimumSize
    && box.height >= minimumSize,
  );
}

export async function runPlaywrightQa(runtime: RuntimeAdapter, workspace: string, runRoot: string): Promise<QaReport> {
  // Do not run the idle-shop oracle against a different production line.  A
  // line contract is optional for legacy runs; when present it is authoritative
  // and must select a dedicated natural-play adapter before evidence can pass.
  let declaredLine: unknown;
  try {
    const contract = JSON.parse(await readFile(path.join(runRoot, 'artifacts/production-line-contract.json'), 'utf8')) as { line?: unknown };
    declaredLine = contract.line;
  } catch { /* legacy roots without a line contract use the idle compatibility runner */ }
  const lineQaMode = declaredLine === undefined ? undefined : qaModeForProductionLine(declaredLine);
  if (lineQaMode === 'cut-stack-dodge') return runCutStackDodgePlaywrightQa(runtime, workspace, runRoot);
  if (declaredLine !== undefined && lineQaMode === 'line-specific-required') {
    const line = String(declaredLine);
    const evidence = [{ schemaVersion: 1 as const, mode: 'NATURAL_E2E' as const, actions: ['line-specific-runner:missing'], artifacts: ['artifacts/production-line-play-plan.json'], forbiddenOperations: [] }];
    return {
      schemaVersion: 1,
      passed: false,
      checks: [{ name: 'line-specific-runtime-qa', passed: false, evidence: `production line ${line} requires its dedicated runtime QA adapter` }],
      issues: [{ id: 'line-specific-runtime-qa', severity: 'error', message: `No dedicated runtime QA adapter is registered for production line ${line}; idle evidence is invalid.`, evidence: 'artifacts/production-line-contract.json' }],
      screenshots: [],
      evidence,
      consoleLog: 'logs/console.log',
      testedAt: new Date().toISOString(),
    };
  }
  const preview = await runtime.startPreview(workspace);
  const consoleLines: string[] = [];
  const checks: QaReport['checks'] = [];
  const issues: QaReport['issues'] = [];
  const screenshots: string[] = [];
  const naturalEvidence: string[] = [];
  let naturalFlow: NaturalFlowEvidence | undefined;
  let previewBrowser: Browser | undefined;
  let gameplayRevision: GameplayRevisionLock | undefined;

  try {
    gameplayRevision = await loadGameplayRevision(runRoot);
  } catch (error) {
    issues.push({
      id: 'gameplay-revision-artifact',
      severity: 'error',
      message: error instanceof Error ? error.message : String(error),
      evidence: 'artifacts/game-blueprint.json gameplayRevision',
    });
  }

  try {
    previewBrowser = await chromium.launch({ headless: true });
    const page = await previewBrowser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('console', (message) => {
      consoleLines.push(`[chromium:${message.type()}] ${message.text()}`);
      if (message.type() === 'error') issues.push({ id: `console-${issues.length + 1}`, severity: 'error', message: message.text(), evidence: 'logs/console.log' });
    });
    page.on('pageerror', (error) => issues.push({ id: `page-${issues.length + 1}`, severity: 'error', message: error.message, evidence: 'logs/console.log' }));
    await page.goto(preview.url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean((window as any).__GAME_TEST__));
    // Capture a complete natural trace separately from state-coverage setup.
    // The latter may use reset/seed/grant helpers and must never be presented
    // as proof of normal player input.
    naturalFlow = await collectNaturalIdleFlow(page, runRoot);
    naturalEvidence.push(...naturalFlow.screenshots);
    checks.push({ name: 'natural-flow-complete', passed: naturalFlow.passed, evidence: JSON.stringify({ completion: naturalFlow.completion, replayObserved: naturalFlow.replayObserved, actions: naturalFlow.actions, blockers: naturalFlow.blockers }) });
    if (!naturalFlow.passed) issues.push({ id: 'natural-flow-complete', severity: 'error', message: `natural-flow-complete failed: ${naturalFlow.blockers.join(', ')}`, evidence: naturalFlow.screenshots.join(', ') });
    const setup = await page.evaluate(() => {
      const api = (window as any).__GAME_TEST__;
      api.resetGame();
      api.setRandomSeed(42);
      const seeded = api.getState();
      api.spawnCustomer();
      return { seeded, before: api.getState() };
    });
    const manualProduction = await page.locator('#produce:visible').count() > 0;
    if (manualProduction) await page.locator('#produce:visible').click();
    else await page.waitForFunction(() => (window as any).__GAME_TEST__.getState().inventory > 0, undefined, { timeout: 15_000 });
    const result = await page.evaluate((initial) => {
      const api = (window as any).__GAME_TEST__;
      const delivered = api.completeOrder();
      api.grantCurrency(1_000_000_000);
      const upgraded = api.upgradeStation();
      return { before: initial, delivered, upgraded };
    }, setup.before);
    checks.push({ name: 'deterministic-test-api', passed: setup.seeded.randomSeed === 42, evidence: 'setRandomSeed(42) established deterministic state before customer RNG advanced' });
    checks.push({ name: 'idle-shop-loop', passed: result.delivered.currency > result.before.currency && !result.delivered.customerWaiting, evidence: JSON.stringify(result.delivered) });
    checks.push({ name: 'upgrade-loop', passed: result.upgraded.level === 2, evidence: JSON.stringify(result.upgraded) });
    checks.push({ name: 'canvas-visible', passed: await page.locator('canvas').isVisible(), evidence: 'Phaser canvas visible at 1280x900 through Vite preview' });
    await page.screenshot({ path: path.join(runRoot, 'screenshots/gameplay.png'), fullPage: true });
    screenshots.push('screenshots/gameplay.png');

    if (await page.locator('#action-button').count() > 0) {
      const mobileViewport = { width: 390, height: 844 };
      await page.setViewportSize(mobileViewport);
      await page.evaluate(() => {
        (window as any).__GAME_TEST__.resetGame();
        window.scrollTo(0, 0);
      });
      const action = page.locator('#action-button');
      const upgrade = page.locator('#upgrade-button');
      const goal = page.locator('.goal-strip');
      const initialRects = {
        action: await action.boundingBox(),
        goal: await goal.boundingBox(),
        upgrade: await upgrade.boundingBox(),
      };
      const insideFirstViewport = (box: { y: number; height: number; width: number } | null) =>
        Boolean(box && box.y >= 0 && box.y + box.height <= mobileViewport.height - 16 && box.width >= 44 && box.height >= 44);

      for (let attempt = 0; attempt < 12 && !await upgrade.isEnabled(); attempt += 1) await action.click();
      const beforeUpgrade = await page.evaluate(() => (window as any).__GAME_TEST__.getState());
      const upgradeEnabled = await upgrade.isEnabled();
      if (upgradeEnabled) await upgrade.click();
      const afterUpgrade = await page.evaluate(() => (window as any).__GAME_TEST__.getState());
      const loopAdvanced = upgradeEnabled && afterUpgrade.level === beforeUpgrade.level + 1;
      const passed = insideFirstViewport(initialRects.action) && insideFirstViewport(initialRects.goal) && insideFirstViewport(initialRects.upgrade) && loopAdvanced;
      const evidence = JSON.stringify({ viewport: mobileViewport, initialRects, loopAdvanced, beforeLevel: beforeUpgrade.level, afterLevel: afterUpgrade.level });
      checks.push({ name: 'mobile-core-loop-visible', passed, evidence });
      if (!passed) issues.push({ id: 'mobile-core-loop-visible', severity: 'error', message: 'mobile-core-loop-visible failed: tap, next goal, and upgrade must complete a real loop inside the first 390x844 viewport', evidence });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(runRoot, 'screenshots/gameplay-mobile.png') });
      screenshots.push('screenshots/gameplay-mobile.png');
    }

    if (gameplayRevision) {
      const mobileViewport = { width: 390, height: 844 };
      await page.setViewportSize(mobileViewport);
      await page.evaluate(() => {
        (window as any).__GAME_TEST__.resetGame();
        window.scrollTo(0, 0);
      });

      const currentAction = page.locator('[data-gameplay-role="current-action"]:visible').first();
      const nextAction = page.locator('[data-gameplay-role="next-action"]:visible').first();
      const nextChapter = page.locator('[data-gameplay-role="next-chapter"]:visible').first();
      const primaryAction = page.locator('[data-gameplay-role="primary-action"]:visible').first();
      const [currentActionBox, nextActionBox, nextChapterBox, primaryActionBox] = await Promise.all([
        currentAction.count().then((count) => count > 0 ? currentAction.boundingBox() : null),
        nextAction.count().then((count) => count > 0 ? nextAction.boundingBox() : null),
        nextChapter.count().then((count) => count > 0 ? nextChapter.boundingBox() : null),
        primaryAction.count().then((count) => count > 0 ? primaryAction.boundingBox() : null),
      ]);
      const visibleDecisionCount = await page.locator('[data-gameplay-decision]:visible').count();
      const revisionRoot = page.locator('[data-gameplay-revision]').first();
      const renderedRevisionId = await revisionRoot.count() > 0 ? await revisionRoot.getAttribute('data-gameplay-revision') : null;
      const progressivePassed = renderedRevisionId === gameplayRevision.revisionId
        && isInsideViewport(currentActionBox, mobileViewport)
        && isInsideViewport(nextActionBox, mobileViewport)
        && isInsideViewport(nextChapterBox, mobileViewport)
        && visibleDecisionCount > 0
        && visibleDecisionCount <= gameplayRevision.progressiveDisclosure.maximumSimultaneousDecisions;
      checks.push({
        name: 'mobile-progressive-disclosure',
        passed: progressivePassed,
        evidence: JSON.stringify({
          viewport: mobileViewport,
          expectedRevisionId: gameplayRevision.revisionId,
          renderedRevisionId,
          currentActionBox,
          nextActionBox,
          nextChapterBox,
          visibleDecisionCount,
          maximumSimultaneousDecisions: gameplayRevision.progressiveDisclosure.maximumSimultaneousDecisions,
        }),
      });

      const scrollPosition = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
      const minimumTouchTarget = gameplayRevision.demoAcceptance.mobileTouchTargetMinimumPx;
      checks.push({
        name: 'mobile-primary-action',
        passed: scrollPosition.x === 0
          && scrollPosition.y === 0
          && isInsideViewport(primaryActionBox, mobileViewport, minimumTouchTarget),
        evidence: JSON.stringify({ viewport: mobileViewport, primaryActionBox, minimumTouchTarget, scrollPosition }),
      });

      const roadmapCount = await page.locator('[data-gameplay-role="roadmap"]').count();
      const visibleRoadmapCount = await page.locator('[data-gameplay-role="roadmap"]:visible').count();
      checks.push({
        name: 'roadmap-default-closed',
        passed: roadmapCount > 0 && visibleRoadmapCount === 0,
        evidence: JSON.stringify({ roadmapCount, visibleRoadmapCount }),
      });

      const lockedRequirements = await page.locator('[data-gameplay-role="locked-requirement"]:visible').evaluateAll((elements) => elements.map((element) => ({
        current: Number((element as HTMLElement).dataset.currentLevel),
        required: Number((element as HTMLElement).dataset.requiredLevel),
        text: (element.textContent ?? '').trim(),
      })));
      const lockedRequirementsPassed = lockedRequirements.length > 0 && lockedRequirements.every(({ current, required, text }) => (
        Number.isFinite(current)
        && Number.isFinite(required)
        && current < required
        && text.includes(String(current))
        && text.includes(String(required))
      ));
      checks.push({
        name: 'locked-requirement-levels',
        passed: lockedRequirementsPassed,
        evidence: JSON.stringify({ lockedRequirements }),
      });

      const chapterOrder = new Map(gameplayRevision.chapters.map((chapter) => [chapter.id, chapter.order]));
      const disclosureChapterIds = await Promise.all([currentAction, nextAction, nextChapter].map(async (locator) => (
        await locator.count() > 0 ? locator.getAttribute('data-chapter-id') : null
      )));
      const disclosureOrders = disclosureChapterIds.map((id) => id ? chapterOrder.get(id) : undefined);
      const furthestDisclosedOrder = Math.max(...disclosureOrders.filter((order): order is number => order !== undefined));
      const visibleChapterIds = await page.locator('[data-chapter-id]:visible').evaluateAll((elements) => (
        [...new Set(elements.map((element) => (element as HTMLElement).dataset.chapterId).filter(Boolean))]
      ));
      const visibleBeyondNext = visibleChapterIds.filter((id) => {
        const order = id ? chapterOrder.get(id) : undefined;
        return order === undefined || order > furthestDisclosedOrder;
      });
      const downstreamPassed = disclosureChapterIds.every((id) => Boolean(id && chapterOrder.has(id)))
        && Number.isFinite(furthestDisclosedOrder)
        && visibleBeyondNext.length === 0;
      checks.push({
        name: 'downstream-chapters-hidden',
        passed: downstreamPassed,
        evidence: JSON.stringify({ disclosureChapterIds, furthestDisclosedOrder, visibleChapterIds, visibleBeyondNext }),
      });

      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(runRoot, 'screenshots/gameplay-mobile-progressive.png') });
      screenshots.push('screenshots/gameplay-mobile-progressive.png');
    }
  } catch (error) {
    issues.push({ id: 'qa-preview-runtime', severity: 'error', message: error instanceof Error ? error.message : String(error), evidence: 'Chromium preview execution' });
  } finally {
    await previewBrowser?.close();
    await preview.stop();
    await runtime.stopPreview();
  }

  let packagedBrowser: Browser | undefined;
  let packagedLoaded = false;
  let packagedCanvasVisible = false;
  let packagedHudVisible = false;
  try {
    packagedBrowser = await webkit.launch({ headless: true });
    const page = await packagedBrowser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('console', (message) => {
      consoleLines.push(`[webkit-file:${message.type()}] ${message.text()}`);
      if (message.type() === 'error') issues.push({ id: `package-console-${issues.length + 1}`, severity: 'error', message: message.text(), evidence: 'logs/console.log' });
    });
    page.on('pageerror', (error) => issues.push({ id: `package-page-${issues.length + 1}`, severity: 'error', message: error.message, evidence: 'logs/console.log' }));
    const entrypoint = path.join(workspace, 'dist/index.html');
    await page.goto(pathToFileURL(entrypoint).href, { waitUntil: 'load' });
    try {
      await page.waitForFunction(() => Boolean((window as any).__GAME_TEST__), undefined, { timeout: 5_000 });
      packagedLoaded = true;
    } catch {
      consoleLines.push('[webkit-file:error] Timed out waiting for __GAME_TEST__ in packaged entrypoint');
    }
    packagedCanvasVisible = await page.locator('canvas').isVisible().catch(() => false);
    packagedHudVisible = await page.locator('#hud').isVisible().catch(() => false);
    await page.screenshot({ path: path.join(runRoot, 'screenshots/gameplay-file-webkit.png'), fullPage: true });
    screenshots.push('screenshots/gameplay-file-webkit.png');
  } catch (error) {
    issues.push({ id: 'qa-package-runtime', severity: 'error', message: error instanceof Error ? error.message : String(error), evidence: 'WebKit file:// execution' });
  } finally {
    await packagedBrowser?.close();
  }

  checks.push({ name: 'packaged-webkit-load', passed: packagedLoaded, evidence: 'dist/index.html executed __GAME_TEST__ through WebKit file://' });
  checks.push({ name: 'packaged-canvas-visible', passed: packagedCanvasVisible, evidence: 'Packaged Phaser canvas visible through WebKit file://' });
  checks.push({ name: 'packaged-hud-visible', passed: packagedHudVisible, evidence: 'Packaged HUD visible through WebKit file://' });
  for (const check of checks) {
    if (!check.passed) issues.push({ id: `check-${issues.length + 1}`, severity: 'error', message: `${check.name} failed`, evidence: check.evidence });
  }
  await writeFile(path.join(runRoot, 'logs/console.log'), `${consoleLines.join('\n')}\n`);
  return {
    schemaVersion: 1,
    passed: issues.every((issue) => issue.severity !== 'error') && checks.length >= 7 && checks.every((check) => check.passed),
    checks,
    issues,
    screenshots,
    ...(naturalFlow ? { naturalFlow } : {}),
    evidence: [
      {
        schemaVersion: 1 as const,
        mode: 'STATE_COVERAGE' as const,
        actions: ['__GAME_TEST__.resetGame', '__GAME_TEST__.setRandomSeed', '__GAME_TEST__.spawnCustomer', '__GAME_TEST__.completeOrder', '__GAME_TEST__.upgradeStation'],
        artifacts: ['artifacts/qa-report.json', ...screenshots],
        forbiddenOperations: ['resetGame', 'setRandomSeed', 'spawnCustomer', 'completeOrder', 'grantCurrency', 'upgradeStation'],
      },
      {
        schemaVersion: 1 as const,
        mode: 'NATURAL_E2E' as const,
        actions: naturalFlow?.actions.length ? naturalFlow.actions : ['page.goto', 'natural-flow:missing'],
        artifacts: naturalEvidence,
        forbiddenOperations: naturalFlow?.forbiddenOperations ?? [],
      },
    ],
    consoleLog: 'logs/console.log',
    testedAt: new Date().toISOString(),
  };
}
