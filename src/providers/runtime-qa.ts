import type { RuntimeAdapter } from '../adapters/runtime.js';
import { WebLiteRuntimeAdapter } from '../adapters/web-lite.js';
import { Cocos3dRuntimeAdapter } from '../adapters/cocos-3d.js';
import { runPlaywrightQa } from '../qa/playwright-qa.js';
import { runActionPlaywrightQa } from '../qa/action-playwright-qa.js';
import type { QAProvider, RuntimeProvider } from './interfaces.js';
import { chromium, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PrototypeBuildReport } from '../schemas/gameplay-experiment.js';
import type { ActionMechanicExperimentSpec, ActionPrototypeBuildReport } from '../schemas/action-mechanic-experiment.js';
import { PerceptualQaReportSchema, ProductExperienceContractSchema, type PerceptualQaReport, type ProductExperienceContract } from '../schemas/product-experience.js';
import { sha256File, sha256Text } from '../core/files.js';

export type PrototypeControl = { kind: 'choice' | 'action' | 'lantern'; value: string; label: string };
const META_ACTIONS = new Set(['reset', 'restart', 'next', 'new', 'new-night']);

export function choosePrototypeControl(controls: PrototypeControl[], turn: number) {
  const playable = controls.filter(({ kind, value }) => kind !== 'action' || !META_ACTIONS.has(value.toLowerCase()));
  if (playable.length === 0) throw new Error('prototype exposes no playable control');
  return playable[turn % playable.length]!;
}

export function isPrototypeTerminalState(state: unknown) {
  if (!state || typeof state !== 'object') return false;
  const value = state as Record<string, unknown>;
  return value.failed === true || value.won === true || (typeof value.phase === 'string' && value.phase !== 'playing');
}

export function repeatedPrototypeActions<T>(input: T) { return Array.from({ length: 5 }, () => input); }

function perceptualCaseId(featureId: string, viewport: { width: number; height: number; label: string }) {
  return `${featureId}@${viewport.width}x${viewport.height}:${viewport.label}`;
}

/** Build a matrix-complete report. File identity is checked separately by the gate. */
export function buildPerceptualQaReport(
  rawContract: ProductExperienceContract,
  observations: PerceptualQaReport['cases'],
  options: { buildHash: string; runtime: 'web-lite' | 'cocos-3d'; reviewer: PerceptualQaReport['reviewer']; authorIndependent: boolean },
): PerceptualQaReport {
  const contract = ProductExperienceContractSchema.parse(rawContract);
  const blockers: string[] = [];
  const observationIds = observations.map((item) => perceptualCaseId(item.featureId, item.viewport));
  if (new Set(observationIds).size !== observationIds.length) blockers.push('perceptual:duplicate-cases');
  const byId = new Map(observations.map((item) => [perceptualCaseId(item.featureId, item.viewport), item]));
  const cases = contract.features.flatMap((feature) => feature.requiredViewports.map((viewport) => {
    const id = perceptualCaseId(feature.id, viewport);
    const observation = byId.get(id);
    if (observation) return observation;
    blockers.push(`perceptual:case-missing:${feature.id}@${viewport.label}`);
    return {
      featureId: feature.id,
      sourceCheckIds: feature.sourceCheckIds,
      objectType: feature.objectType,
      stateBranch: feature.stateBranch,
      viewport,
      playerVisible: false,
      naturalTriggerVerified: false,
      eventOrderVerified: false,
      negativeAssertionsPassed: false,
      perceptualPassed: false,
      observedSignal: 'not observed',
      observedEventOrder: [],
      screenshots: [],
      evidence: ['no exact runtime observation was recorded for this feature and viewport'],
      notes: ['capture and independently review this exact object/state branch'],
    };
  }));
  for (const item of cases) {
    const id = perceptualCaseId(item.featureId, item.viewport);
    if (!item.playerVisible || !item.naturalTriggerVerified || !item.eventOrderVerified || !item.negativeAssertionsPassed || !item.perceptualPassed) blockers.push(`perceptual:experience-blocked:${id}`);
    if (item.screenshots.length === 0 || !item.trace) blockers.push(`perceptual:evidence-missing:${id}`);
  }
  if (options.reviewer === 'DeterministicCapture' || !options.authorIndependent) blockers.push('perceptual:independent-review-required');
  return PerceptualQaReportSchema.parse({
    schemaVersion: 2,
    artifactType: 'perceptual-qa-report',
    targetGame: contract.targetGame,
    targetRunId: contract.targetRunId,
    targetWorkspace: contract.targetWorkspace,
    runtimeEntrypoints: contract.runtimeEntrypoints,
    contractHash: sha256Text(JSON.stringify(contract)),
    buildHash: options.buildHash,
    runtime: options.runtime,
    reviewer: options.reviewer,
    authorIndependent: options.authorIndependent,
    passed: blockers.length === 0,
    blockers: [...new Set(blockers)],
    cases,
    checkedAt: new Date().toISOString(),
  });
}

/**
 * Contract-driven browser runner. It deliberately uses natural DOM input only;
 * when a feature cannot be located it emits a blocking observation instead of
 * claiming success from hidden state or test APIs.
 */
export async function runPerceptualQa(runtime: RuntimeAdapter, workspace: string, runRoot: string, rawContract: ProductExperienceContract, buildHash: string): Promise<PerceptualQaReport> {
  const contract = ProductExperienceContractSchema.parse(rawContract);
  const preview = await runtime.startPreview(workspace);
  const observations: PerceptualQaReport['cases'] = [];
  const evidenceDir = path.join(runRoot, 'screenshots/product-experience');
  const traceDir = path.join(runRoot, 'logs/product-experience');
  await mkdir(evidenceDir, { recursive: true });
  await mkdir(traceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const feature of contract.features) {
      for (const viewport of feature.requiredViewports) {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
        const page = await context.newPage();
        const slug = `${feature.id}-${viewport.width}x${viewport.height}`.replaceAll(/[^a-z0-9_-]+/giu, '-');
        try {
          await page.goto(preview.url, { waitUntil: 'networkidle' });
          const beforeText = await page.locator('body').innerText().catch(() => '');
          const beforePath = `screenshots/product-experience/${slug}-before.png`;
          await page.screenshot({ path: path.join(runRoot, beforePath), fullPage: true });
          let action = 'no playable control found';
          try {
            const control = await clickPrototypeControl(page, 0);
            action = `${control.kind}:${control.value} (${control.label})`;
          } catch { /* capture remains useful but blocked */ }
          await page.waitForTimeout(150);
          const afterText = await page.locator('body').innerText().catch(() => '');
          const afterPath = `screenshots/product-experience/${slug}-after.png`;
          await page.screenshot({ path: path.join(runRoot, afterPath), fullPage: true });
          const tracePath = `logs/product-experience/${slug}.json`;
          const traceBody = `${JSON.stringify({
            schemaVersion: 1,
            startedFromReset: true,
            actions: action === 'no playable control found' ? [] : [action],
            transitions: [{ name: feature.id, changed: afterText !== beforeText, evidence: afterText !== beforeText ? 'body text changed after one generic input' : 'no body-text change observed' }],
            completion: 'none',
            replayObserved: false,
            forbiddenOperations: [],
            screenshots: [beforePath, afterPath],
            passed: false,
            blockers: ['independent perceptual review and feature-specific natural journey required'],
            buildHash,
            runtime: contract.runtime,
            device: viewport,
            seed: 1,
            runner: 'deterministic-capture-only',
            observedAt: new Date().toISOString(),
          }, null, 2)}\n`;
          await writeFile(path.join(runRoot, tracePath), traceBody);
          observations.push({
            featureId: feature.id,
            sourceCheckIds: feature.sourceCheckIds,
            objectType: feature.objectType,
            stateBranch: feature.stateBranch,
            viewport,
            playerVisible: false,
            naturalTriggerVerified: false,
            eventOrderVerified: false,
            negativeAssertionsPassed: false,
            perceptualPassed: false,
            observedSignal: afterText !== beforeText ? 'generic body-text delta captured; pixel meaning unreviewed' : 'no visible text delta captured',
            observedEventOrder: [],
            screenshots: [
              { path: beforePath, sha256: await sha256File(path.join(runRoot, beforePath)) },
              { path: afterPath, sha256: await sha256File(path.join(runRoot, afterPath)) },
            ],
            trace: { path: tracePath, sha256: sha256Text(traceBody) },
            evidence: [`capture-only input: ${action}`, 'automatic capture does not judge visibility, causality, event order or layout quality'],
            notes: ['QAAgent or HumanReviewer must inspect this exact branch and replace this capture report'],
          });
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
    await preview.stop();
  }
  return buildPerceptualQaReport(contract, observations, { buildHash, runtime: contract.runtime, reviewer: 'DeterministicCapture', authorIndependent: false });
}

export async function clickPrototypeControl(page: Page, turn: number): Promise<PrototypeControl> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.waitForFunction(() => {
      const metaActions = new Set(['reset', 'restart', 'next', 'new', 'new-night']);
      return Array.from(document.querySelectorAll<HTMLElement>('[data-choice], [data-action], [data-lantern]')).some((element) => {
        const kind = element.dataset.choice !== undefined ? 'choice' : element.dataset.action !== undefined ? 'action' : 'lantern';
        const value = element.dataset[kind] ?? '';
        return (!('disabled' in element) || !(element as HTMLButtonElement).disabled) && (kind !== 'action' || !metaActions.has(value.toLowerCase()));
      });
    }, undefined, { timeout: 10_000 });
    try {
      return await page.evaluate((turnIndex) => {
        const metaActions = new Set(['reset', 'restart', 'next', 'new', 'new-night']);
        const candidates = Array.from(document.querySelectorAll<HTMLElement>('[data-choice], [data-action], [data-lantern]')).map((element) => {
          const kind = element.dataset.choice !== undefined ? 'choice' : element.dataset.action !== undefined ? 'action' : 'lantern';
          const value = element.dataset[kind] ?? '';
          return { element, kind, value, label: (element.getAttribute('aria-label') || element.textContent || `${kind}:${value}`).trim() };
        }).filter(({ element, kind, value }) => (!('disabled' in element) || !(element as HTMLButtonElement).disabled) && (kind !== 'action' || !metaActions.has(value.toLowerCase())));

        while (candidates.length > 0) {
          const index = turnIndex % candidates.length;
          const candidate = candidates[index]!;
          if ('disabled' in candidate.element && (candidate.element as HTMLButtonElement).disabled) {
            candidates.splice(index, 1);
            continue;
          }
          candidate.element.click();
          return { kind: candidate.kind, value: candidate.value, label: candidate.label } as PrototypeControl;
        }
        throw new Error('prototype exposes no enabled playable control');
      }, turn);
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  throw new Error('prototype exposes no enabled playable control');
}

function observedPressure(state: unknown) {
  const encoded = JSON.stringify(state);
  return /"(?:failed|lost)":true|"phase":"(?:failed|lost)"|"(?:pressure|violations|spread|alert|danger|chaserDistance)":(?:[1-9]|true)/i.test(encoded);
}

export class LocalRuntimeProvider implements RuntimeProvider {
  constructor(private readonly repositoryRoot: string) {}
  runtime(name: 'web-lite' | 'cocos-3d'): RuntimeAdapter {
    return name === 'cocos-3d' ? new Cocos3dRuntimeAdapter(this.repositoryRoot) : new WebLiteRuntimeAdapter(this.repositoryRoot);
  }
}
export class PlaywrightQAProvider implements QAProvider {
  perceptualQa({ runtime, workspace, runRoot, contract, buildHash }: { runtime: RuntimeAdapter; workspace: string; runRoot: string; contract: ProductExperienceContract; buildHash: string }) {
    return runPerceptualQa(runtime, workspace, runRoot, contract, buildHash);
  }
  playtest({ runtime, workspace, runRoot }: { runtime: RuntimeAdapter; workspace: string; runRoot: string }) { return runPlaywrightQa(runtime, workspace, runRoot); }
  async playtestTournament({ runtime, report, runRoot }: { runtime: RuntimeAdapter; report: PrototypeBuildReport; runRoot: string }) {
    const browser = await chromium.launch({ headless: true }); const comparisons = [];
    await mkdir(path.join(runRoot, 'screenshots'), { recursive: true }); await mkdir(path.join(runRoot, 'logs'), { recursive: true });
    try {
      for (const prototype of report.prototypes) {
        const workspace = path.join(runRoot, prototype.workspace.replace(/^workspace\//, 'workspace/'));
        const preview = await runtime.startPreview(workspace); const page = await browser.newPage(); const consoleMessages: string[] = [];
        page.on('console', (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));
        try {
          await page.goto(preview.url, { waitUntil: 'networkidle' });
          await page.waitForFunction(() => Boolean((window as unknown as { __PROTOTYPE_TEST__?: unknown }).__PROTOTYPE_TEST__));
          const initial = await page.evaluate(() => (window as unknown as { __PROTOTYPE_TEST__: { getState(): unknown } }).__PROTOTYPE_TEST__.getState());
          const actions: string[] = ['start']; const states: unknown[] = [initial];
          const controlLabels = new Set<string>(); let repeatedInput: string | undefined;
          for (let turn = 0; turn < 6; turn += 1) {
            const beforeAction = await page.evaluate(() => (window as unknown as { __PROTOTYPE_TEST__: { getState(): unknown } }).__PROTOTYPE_TEST__.getState());
            if (isPrototypeTerminalState(beforeAction)) {
              await page.evaluate((seed) => (window as unknown as { __PROTOTYPE_TEST__: { resetGame(seed: number): unknown } }).__PROTOTYPE_TEST__.resetGame(seed), turn + 2);
              actions.push(`reset:${turn + 2}`);
            }
            let control: PrototypeControl;
            try {
              control = await clickPrototypeControl(page, turn);
            } catch {
              await page.evaluate((seed) => (window as unknown as { __PROTOTYPE_TEST__: { resetGame(seed: number): unknown } }).__PROTOTYPE_TEST__.resetGame(seed), turn + 2);
              actions.push(`reset:${turn + 2}`);
              control = await clickPrototypeControl(page, turn);
            }
            controlLabels.add(control.label || `${control.kind}:${control.value}`);
            repeatedInput ??= control.value;
            actions.push(`${control.kind}:${control.value}`);
            states.push(await page.evaluate(() => (window as unknown as { __PROTOTYPE_TEST__: { getState(): unknown } }).__PROTOTYPE_TEST__.getState()));
          }
          const changedTransitions = states.slice(1).filter((state, index) => JSON.stringify(state) !== JSON.stringify(states[index])).length;
          const repeatedActions = repeatedPrototypeActions(repeatedInput ?? '0');
          const repeatedStates = await page.evaluate((inputs) => {
            const api = (window as unknown as { __PROTOTYPE_TEST__: { resetGame(seed: number): unknown; getState(): unknown; act(action: string): unknown } }).__PROTOTYPE_TEST__;
            const observations = [api.resetGame(101)];
            for (const input of inputs) observations.push(api.act(input));
            return observations;
          }, repeatedActions);
          actions.push(...repeatedActions.map((input) => `repeat:${input}`));
          const repeatedUniqueStates = new Set(repeatedStates.map((state) => JSON.stringify(state))).size;
          const pressureSeen = [...states, ...repeatedStates].some(observedPressure);
          const secondRun = await page.evaluate(() => {
            const api = (window as unknown as { __PROTOTYPE_TEST__: { getState(): Record<string, unknown>; resetGame(seed: number): Record<string, unknown> } }).__PROTOTYPE_TEST__;
            const current = api.getState();
            return api.resetGame(Number(current.seed ?? 1) + 1);
          });
          const runVariation = JSON.stringify(initial) !== JSON.stringify(secondRun);
          const screenshot = `screenshots/prototype-${prototype.slot}.png`; const consoleLog = `logs/prototype-${prototype.slot}.log`;
          await page.screenshot({ path: path.join(runRoot, screenshot), fullPage: true }); await writeFile(path.join(runRoot, consoleLog), `${consoleMessages.join('\n')}\n`);
          comparisons.push({ slot: prototype.slot, ideaId: prototype.ideaId, testedUrl: preview.url, playtestActions: actions,
            tenSecondUnderstanding: { score: controlLabels.size >= 2 ? 9 : 6, evidence: `${controlLabels.size} 个可操作控件在首屏可见：${[...controlLabels].join('、')}。` },
            funWithinThirtySeconds: { score: changedTransitions >= 5 ? 8 : 6, evidence: `前六次输入中 ${changedTransitions} 次立即改变游戏状态。` },
            realDecision: { score: Math.min(10, 6 + controlLabels.size), evidence: `实际使用了 ${controlLabels.size} 种不同操作，并观察各自后果。` },
            mechanicalRepetition: { score: Math.min(10, 4 + repeatedUniqueStates), evidence: `同一核心输入连续 5 次后得到 ${repeatedUniqueStates} 个不同状态。` },
            pressureOrFailure: { score: pressureSeen ? 9 : 5, evidence: pressureSeen ? '状态轨迹中观察到压力、危险或失败字段发生作用。' : '本轮六次操作未触发可观察的压力状态。' },
            retryUrge: { score: runVariation ? 8 : 6, evidence: runVariation ? '换种子重开后初始局面改变，可立即再试。' : '可以即时重开，但初始状态未显示变化。' },
            variationAfterFiveRepeats: { score: Math.min(10, 4 + repeatedUniqueStates), evidence: `同一核心输入连续 5 次，共记录 ${repeatedUniqueStates} 个不同观察值。` },
            extensibility: { score: prototype.majorSystems.length <= 2 ? 8 : 5, evidence: `核心循环保持 ${prototype.majorSystems.length} 个主要系统，仍可围绕现有动词扩展变化。` }, screenshot, consoleLog,
          });
        } finally { await page.close(); await preview.stop(); }
      }
    } finally { await browser.close(); }
    return { schemaVersion: 1, batch: report.batch, reviewer: 'QAAgent', prototypeAuthor: 'BuilderAgent', comparisons };
  }
  playtestActionMechanics({ runtime, spec, report, runRoot }: { runtime: RuntimeAdapter; spec: ActionMechanicExperimentSpec; report: ActionPrototypeBuildReport; runRoot: string }) {
    return runActionPlaywrightQa(runtime, spec, report, runRoot);
  }
}
export class MockQAProvider implements QAProvider {
  async perceptualQa({ contract, runRoot, buildHash }: { runtime: RuntimeAdapter; workspace: string; runRoot: string; contract: ProductExperienceContract; buildHash: string }) {
    const observations: PerceptualQaReport['cases'] = [];
    await mkdir(path.join(runRoot, 'screenshots/product-experience'), { recursive: true });
    await mkdir(path.join(runRoot, 'logs/product-experience'), { recursive: true });
    for (const feature of contract.features) {
      for (const viewport of feature.requiredViewports) {
        const slug = `${feature.id}-${viewport.width}x${viewport.height}`.replaceAll(/[^a-z0-9_-]+/giu, '-');
        const screenshotPath = `screenshots/product-experience/${slug}.png`;
        const screenshotBody = `mock perceptual fixture ${feature.id} ${viewport.width}x${viewport.height}`;
        await writeFile(path.join(runRoot, screenshotPath), screenshotBody);
        const tracePath = `logs/product-experience/${slug}.json`;
        const traceBody = JSON.stringify({
          schemaVersion: 1,
          startedFromReset: true,
          actions: [`natural input: ${feature.playerAction}`, 'natural input: replay'],
          transitions: [{ name: feature.id, changed: true, evidence: feature.visibleSignal }],
          completion: 'settlement',
          replayObserved: true,
          forbiddenOperations: [],
          screenshots: [screenshotPath],
          passed: true,
          blockers: [],
          buildHash,
          runtime: contract.runtime,
          device: viewport,
          seed: 1,
          runner: 'mock-qa-fixture',
          observedAt: new Date().toISOString(),
        });
        await writeFile(path.join(runRoot, tracePath), traceBody);
        observations.push({
          featureId: feature.id,
          sourceCheckIds: feature.sourceCheckIds,
          objectType: feature.objectType,
          stateBranch: feature.stateBranch,
          viewport,
          playerVisible: true,
          naturalTriggerVerified: true,
          eventOrderVerified: true,
          negativeAssertionsPassed: true,
          perceptualPassed: true,
          observedSignal: feature.visibleSignal,
          observedEventOrder: feature.expectedEventOrder,
          screenshots: [{ path: screenshotPath, sha256: sha256Text(screenshotBody) }],
          trace: { path: tracePath, sha256: sha256Text(traceBody) },
          evidence: ['synthetic mock QA fixture bound to a real file and natural-flow artifact'],
          notes: [],
        });
      }
    }
    return buildPerceptualQaReport(contract, observations, { buildHash, runtime: contract.runtime, reviewer: 'QAAgent', authorIndependent: true });
  }
  async playtest() { return { schemaVersion: 1, passed: true, checks: [{ name: 'stub-contract', passed: true, evidence: 'QA stub selected by integration test' }], issues: [], screenshots: [], consoleLog: 'logs/console.log', testedAt: new Date().toISOString() }; }
  async playtestTournament({ report }: { report: PrototypeBuildReport }) {
    const criterion = (score: number, evidence: string) => ({ score, evidence });
    return { schemaVersion: 1, batch: report.batch, reviewer: 'QAAgent', prototypeAuthor: 'BuilderAgent', comparisons: report.prototypes.map((prototype, index) => ({ slot: prototype.slot, ideaId: prototype.ideaId, testedUrl: `file://${prototype.entrypoint}`, playtestActions: ['start', 'choice:0', 'choice:1', 'choice:0', 'choice:1', 'choice:0'], tenSecondUnderstanding: criterion(8 - index, 'The core action is visible without formal UI.'), funWithinThirtySeconds: criterion(8 - index, 'The first state change occurs on the first input.'), realDecision: criterion(9 - index, 'Safe and risky actions have different consequences.'), mechanicalRepetition: criterion(8 - index, 'Seeded targets change after repeated input.'), pressureOrFailure: criterion(8, 'Pressure reaches a clear failure threshold.'), retryUrge: criterion(8 - index, 'Reset immediately starts a new seeded attempt.'), variationAfterFiveRepeats: criterion(9 - index, 'The target signal changes across five actions.'), extensibility: criterion(9 - index, 'New target traits can extend the same verb.'), screenshot: `screenshots/prototype-${prototype.slot}.png`, consoleLog: `logs/prototype-${prototype.slot}.log` })) };
  }
  async playtestActionMechanics({ spec, report }: { spec: ActionMechanicExperimentSpec; report: ActionPrototypeBuildReport }) {
    const metric = (value: number, passed: boolean, evidence: string) => ({ value, passed, evidence });
    return {
      schemaVersion: 1,
      experimentId: spec.experimentId,
      reviewer: 'QAAgent',
      prototypeAuthor: 'BuilderAgent',
      results: report.prototypes.map((prototype) => ({
        slot: prototype.slot,
        workspace: prototype.workspace,
        inputResponseMs: metric(Math.min(16, spec.automaticQaThresholds.inputResponseMs.max), true, 'Mock fixed-step input response evidence.'),
        releaseVelocityRetentionRatio: metric(1, true, 'Mock release preserves the pre-release velocity.'),
        wrongHookAttachments: metric(0, true, 'Mock trace contains no ineligible hook attachment.'),
        maxEventGapMs: metric(Math.min(spec.decisionIntervalMs, spec.automaticQaThresholds.maxEventGapMs.max), true, 'Mock trace emits a meaningful event within the allowed gap.'),
        retryFrictionMs: metric(0, true, 'Mock retry starts on the first input.'),
        missedFinishDetections: metric(0, true, 'Mock finish crossing is detected in the same fixed tick.'),
      })),
      recommendation: 'B',
      rationale: 'All variants pass the six automatic gates; B is the deterministic mock recommendation.',
    };
  }
}
