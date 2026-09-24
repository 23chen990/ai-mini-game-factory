import { createServer, type Server } from 'node:http';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import type { RuntimeAdapter } from '../../src/adapters/runtime.js';
import { runPlaywrightQa } from '../../src/qa/playwright-qa.js';

const roots: string[] = [];
let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function writeGameplayRevisionMetadata(root: string) {
  const revisionId = 'progressive-qa-fixture-v1';
  const chapters = Array.from({ length: 8 }, (_, index) => {
    const order = index + 1;
    const id = order === 6 ? 'social' : order === 7 ? 'romance' : `chapter-${order}`;
    const previousActionId = order > 1 ? `action-${order - 1}-1` : undefined;
    const requirements = previousActionId ? [{ activityId: previousActionId, minimumLevel: 2 }] : [];
    return {
      id,
      order,
      name: `Chapter ${order}`,
      milestoneTransformation: `Transformation ${order}`,
      requireAll: id === 'social' || id === 'romance'
        ? [
            { activityId: `action-${order - 1}-1`, minimumLevel: 2 },
            { activityId: `action-${order - 1}-2`, minimumLevel: 2 },
          ]
        : requirements,
      actions: Array.from({ length: 3 }, (_, actionIndex) => ({
        id: `action-${order}-${actionIndex + 1}`,
        order: actionIndex + 1,
        name: `Action ${order}.${actionIndex + 1}`,
        visibleVerb: `perform action ${order}.${actionIndex + 1}`,
        kind: 'repeated_action',
        animationRequired: true,
        contributesPassiveRate: true,
        requireAll: [],
      })),
    };
  });
  const revision = {
    schemaVersion: 1,
    revisionId,
    lockedBy: 'human',
    approval: { status: 'APPROVED', evidence: 'QA fixture approval', approvedAt: '2026-08-31T00:00:00.000Z' },
    targetRunId: 'qa-fixture-run',
    title: 'QA fixture',
    supersedes: ['previous-lock'],
    researchArtifacts: ['artifacts/research-a.json', 'artifacts/research-b.json'],
    openSourceGate: { artifactPath: 'artifacts/open-source-research.json', outcome: 'NO_SUITABLE_CANDIDATE', noNewDependencies: true },
    contentRules: { actionNamesDescribeVisibleVerbs: true, everyActionHasVisibleAnimation: true, forbiddenAbstractLabels: ['Abstract placeholder'] },
    coreLoop: {
      selectedActivityControlsVisibleAnimation: true,
      allUnlockedActivitiesContributePassiveRate: true,
      tapTarget: 'character',
      tapEffect: 'accelerate_current_activity',
      directCurrencyButton: false,
      eachActivityHasIndependentLevel: true,
      unlocksUseAllRequirements: true,
    },
    progressiveDisclosure: {
      maximumSimultaneousDecisions: 3,
      showCurrentAction: true,
      showNextAction: true,
      showNextChapterPreview: true,
      hideChaptersBeyondNext: true,
      previousChaptersMoveToArchive: true,
      archivedActivitiesRemainPassive: true,
      fullRoadmapUsesSeparateOverlay: true,
      socialHiddenUntilCareer: true,
      romanceHiddenUntilSocial: true,
    },
    chapters,
    demoAcceptance: {
      firstViewportContainsCurrentActionNextActionAndNextChapter: true,
      primaryActionRequiresNoScroll: true,
      mobileTouchTargetMinimumPx: 44,
      roadmapNotOpenByDefault: true,
      lockedRequirementShowsCurrentAndRequiredLevels: true,
      allEightChaptersExistInData: true,
    },
    targetPlatforms: ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'],
    expressionIsolation: {
      originalCode: true,
      originalAssets: true,
      originalNamesAndText: true,
      originalUiLayout: true,
      originalAudio: true,
      originalTuningValues: true,
    },
  };
  await mkdir(path.join(root, 'artifacts'), { recursive: true });
  await writeFile(path.join(root, 'artifacts/game-blueprint.json'), JSON.stringify({
    gameplayRevision: {
      artifactPath: 'artifacts/gameplay-revision-lock.json',
      revisionId,
      targetRunId: revision.targetRunId,
      title: revision.title,
    },
  }));
  await writeFile(path.join(root, 'artifacts/gameplay-revision-lock.json'), JSON.stringify(revision));
}

function automaticGameHtml(progressiveMarkup: string) {
  return `<!doctype html><html><body style="margin:0">
    <canvas width="320" height="120"></canvas><section id="hud">ready</section>${progressiveMarkup}<script>
      let state = { randomSeed: 1, inventory: 0, currency: 0, level: 1, customerWaiting: true };
      const copy = () => ({ ...state });
      const resetGame = () => { state = { randomSeed: 1, inventory: 0, currency: 0, level: 1, customerWaiting: true }; return copy(); };
      const getState = () => copy();
      const spawnCustomer = () => { state.randomSeed += 1; state.customerWaiting = true; return copy(); };
      const completeOrder = () => { if (state.inventory > 0 && state.customerWaiting) { state.inventory -= 1; state.currency += 6; state.customerWaiting = false; } return copy(); };
      const grantCurrency = (amount = 10) => { state.currency += amount; return copy(); };
      const upgradeStation = () => { if (state.currency >= 1000) { state.currency -= 1000; state.level += 1; } return copy(); };
      const setRandomSeed = (seed) => { state.randomSeed = seed; return copy(); };
      window.__GAME_TEST__ = { resetGame, getState, spawnCustomer, completeOrder, grantCurrency, upgradeStation, setRandomSeed };
      setInterval(() => { if (state.inventory === 0) state.inventory = 1; }, 30);
    </script>
  </body></html>`;
}

async function setupQaFixture(html: string, prefix: string) {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  roots.push(root);
  await mkdir(path.join(root, 'screenshots'), { recursive: true });
  await mkdir(path.join(root, 'logs'), { recursive: true });
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await writeGameplayRevisionMetadata(root);
  await writeFile(path.join(root, 'dist/index.html'), html);
  server = createServer((_request, response) => { response.setHeader('content-type', 'text/html'); response.end(html); });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing test server port');
  const runtime = {
    startPreview: async () => ({ url: `http://127.0.0.1:${address.port}/`, stop: async () => {} }),
    stopPreview: async () => {},
  } as unknown as RuntimeAdapter;
  return { root, runtime };
}

it('playtests an automatic-production game without depending on a #produce button', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'qa-auto-production-'));
  roots.push(root);
  await mkdir(path.join(root, 'screenshots'), { recursive: true });
  await mkdir(path.join(root, 'logs'), { recursive: true });
  await mkdir(path.join(root, 'dist'), { recursive: true });
  const html = `<!doctype html><html><body><canvas width="320" height="180"></canvas><section id="hud">ready</section><button id="produce" hidden>legacy hook</button><script>
    let state = { randomSeed: 1, inventory: 0, currency: 0, level: 1, customerWaiting: true };
    const copy = () => ({ ...state });
    const resetGame = () => { state = { randomSeed: 1, inventory: 0, currency: 0, level: 1, customerWaiting: true }; return copy(); };
    const getState = () => copy();
    const spawnCustomer = () => { state.randomSeed += 1; state.customerWaiting = true; return copy(); };
    const completeOrder = () => { if (state.inventory > 0 && state.customerWaiting) { state.inventory -= 1; state.currency += 6; state.customerWaiting = false; } return copy(); };
    const grantCurrency = (amount = 10) => { state.currency += amount; return copy(); };
    const upgradeStation = () => { if (state.currency >= 1000) { state.currency -= 1000; state.level += 1; } return copy(); };
    const setRandomSeed = (seed) => { state.randomSeed = seed; return copy(); };
    window.__GAME_TEST__ = { resetGame, getState, spawnCustomer, completeOrder, grantCurrency, upgradeStation, setRandomSeed };
    setInterval(() => { if (state.inventory === 0) state.inventory = 1; }, 30);
  </script></body></html>`;
  await writeFile(path.join(root, 'dist/index.html'), html);
  server = createServer((_request, response) => { response.setHeader('content-type', 'text/html'); response.end(html); });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing test server port');
  const runtime = {
    startPreview: async () => ({ url: `http://127.0.0.1:${address.port}/`, stop: async () => {} }),
    stopPreview: async () => {},
  } as unknown as RuntimeAdapter;

  const report = await runPlaywrightQa(runtime, root, root);

  expect(report.passed).toBe(true);
  expect(report.checks.map((check) => check.name)).toEqual(expect.arrayContaining([
    'packaged-webkit-load',
    'packaged-canvas-visible',
    'packaged-hud-visible',
  ]));
  expect(report.screenshots).toEqual(['screenshots/gameplay.png', 'screenshots/gameplay-file-webkit.png']);
  await expect(access(path.join(root, 'screenshots/gameplay.png'))).resolves.toBeUndefined();
  await expect(access(path.join(root, 'screenshots/gameplay-file-webkit.png'))).resolves.toBeUndefined();
});

it('fails QA when preview works but the packaged file is blank', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'qa-blank-package-'));
  roots.push(root);
  await mkdir(path.join(root, 'screenshots'), { recursive: true });
  await mkdir(path.join(root, 'logs'), { recursive: true });
  await mkdir(path.join(root, 'dist'), { recursive: true });
  const previewHtml = `<!doctype html><html><body><canvas width="320" height="180"></canvas><section id="hud">ready</section><button id="produce">produce</button><script>
    let state = { randomSeed: 1, inventory: 0, currency: 0, level: 1, customerWaiting: true };
    const copy = () => ({ ...state });
    const resetGame = () => { state = { randomSeed: 1, inventory: 0, currency: 0, level: 1, customerWaiting: true }; return copy(); };
    const getState = () => copy();
    const spawnCustomer = () => { state.randomSeed += 1; state.customerWaiting = true; return copy(); };
    const completeOrder = () => { state.inventory -= 1; state.currency += 6; state.customerWaiting = false; return copy(); };
    const grantCurrency = (amount) => { state.currency += amount; return copy(); };
    const upgradeStation = () => { state.level += 1; return copy(); };
    const setRandomSeed = (seed) => { state.randomSeed = seed; return copy(); };
    const produce = () => { state.inventory += 1; return copy(); };
    window.__GAME_TEST__ = { resetGame, getState, spawnCustomer, completeOrder, grantCurrency, upgradeStation, setRandomSeed };
    document.querySelector('#produce').addEventListener('click', produce);
  </script></body></html>`;
  await writeFile(path.join(root, 'dist/index.html'), '<!doctype html><html><body><section id="hud"></section><script type="module" src="/missing.js"></script></body></html>');
  server = createServer((_request, response) => { response.setHeader('content-type', 'text/html'); response.end(previewHtml); });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing test server port');
  const runtime = {
    startPreview: async () => ({ url: `http://127.0.0.1:${address.port}/`, stop: async () => {} }),
    stopPreview: async () => {},
  } as unknown as RuntimeAdapter;

  const report = await runPlaywrightQa(runtime, root, root);

  expect(report.passed).toBe(false);
  expect(report.checks).toContainEqual(expect.objectContaining({ name: 'packaged-canvas-visible', passed: false }));
  expect(report.issues).toEqual(expect.arrayContaining([expect.objectContaining({ severity: 'error' })]));
});

it('fails QA when a reference-reskin core loop requires scrolling past the first mobile viewport', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'qa-mobile-core-loop-'));
  roots.push(root);
  await mkdir(path.join(root, 'screenshots'), { recursive: true });
  await mkdir(path.join(root, 'logs'), { recursive: true });
  await mkdir(path.join(root, 'dist'), { recursive: true });
  const html = `<!doctype html><html><body style="margin:0">
    <canvas width="320" height="180"></canvas><section id="hud">ready</section>
    <button id="action-button" style="width:200px;height:56px">tap</button>
    <section class="goal-strip" style="height:64px">next goal</section>
    <div style="height:900px"></div>
    <button id="upgrade-button" style="width:160px;height:56px">upgrade</button>
    <script>
      let state = { randomSeed: 1, inventory: 0, currency: 0, level: 1, customerWaiting: true };
      const copy = () => ({ ...state });
      const resetGame = () => { state = { randomSeed: 1, inventory: 0, currency: 0, level: 1, customerWaiting: true }; return copy(); };
      const getState = () => copy();
      const spawnCustomer = () => { state.randomSeed += 1; state.customerWaiting = true; return copy(); };
      const completeOrder = () => { if (state.inventory > 0) { state.inventory -= 1; state.currency += 6; state.customerWaiting = false; } return copy(); };
      const grantCurrency = (amount = 10) => { state.currency += amount; return copy(); };
      const upgradeStation = () => { if (state.currency >= 4) { state.currency -= 4; state.level += 1; } return copy(); };
      const setRandomSeed = (seed) => { state.randomSeed = seed; return copy(); };
      document.querySelector('#action-button').addEventListener('click', () => { state.currency += 2; });
      document.querySelector('#upgrade-button').addEventListener('click', upgradeStation);
      window.__GAME_TEST__ = { resetGame, getState, spawnCustomer, completeOrder, grantCurrency, upgradeStation, setRandomSeed };
      setInterval(() => { if (state.inventory === 0) state.inventory = 1; }, 30);
    </script>
  </body></html>`;
  await writeFile(path.join(root, 'dist/index.html'), html);
  server = createServer((_request, response) => { response.setHeader('content-type', 'text/html'); response.end(html); });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing test server port');
  const runtime = {
    startPreview: async () => ({ url: `http://127.0.0.1:${address.port}/`, stop: async () => {} }),
    stopPreview: async () => {},
  } as unknown as RuntimeAdapter;

  const report = await runPlaywrightQa(runtime, root, root);

  expect(report.passed).toBe(false);
  expect(report.checks).toContainEqual(expect.objectContaining({ name: 'mobile-core-loop-visible', passed: false }));
  expect(report.issues).toContainEqual(expect.objectContaining({ severity: 'error', message: expect.stringMatching(/mobile-core-loop-visible/i) }));
});

it('passes revision-specific progressive disclosure checks for a compact mobile first viewport', async () => {
  const html = automaticGameHtml(`
    <main data-gameplay-revision="progressive-qa-fixture-v1" style="display:grid;gap:8px;padding:8px">
      <section data-gameplay-role="current-action" data-chapter-id="chapter-1">Current action</section>
      <button data-gameplay-role="primary-action" data-gameplay-decision style="width:180px;height:56px">Act</button>
      <button data-gameplay-role="next-action" data-gameplay-decision data-chapter-id="chapter-1" style="width:180px;height:48px">Next action</button>
      <section data-gameplay-role="next-chapter" data-chapter-id="chapter-2">
        Next chapter
        <p data-gameplay-role="locked-requirement" data-current-level="0" data-required-level="2">Level 0 / 2</p>
      </section>
      <button data-gameplay-decision style="width:180px;height:48px">Third choice</button>
      <aside data-gameplay-role="roadmap" hidden>Full roadmap</aside>
      <div data-chapter-id="chapter-3" hidden>Later chapter</div>
      <div data-chapter-id="chapter-4" hidden>Later chapter</div>
      <div data-chapter-id="chapter-5" hidden>Later chapter</div>
      <div data-chapter-id="social" hidden>Later chapter</div>
      <div data-chapter-id="romance" hidden>Later chapter</div>
      <div data-chapter-id="chapter-8" hidden>Later chapter</div>
    </main>`);
  const { root, runtime } = await setupQaFixture(html, 'qa-progressive-pass-');

  const report = await runPlaywrightQa(runtime, root, root);

  expect(report.passed).toBe(true);
  expect(report.checks).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'mobile-progressive-disclosure', passed: true }),
    expect.objectContaining({ name: 'mobile-primary-action', passed: true }),
    expect.objectContaining({ name: 'roadmap-default-closed', passed: true }),
    expect.objectContaining({ name: 'locked-requirement-levels', passed: true }),
    expect.objectContaining({ name: 'downstream-chapters-hidden', passed: true }),
  ]));
});

it('fails revision-specific QA when progressive disclosure overflows or exposes hidden progression', async () => {
  const html = automaticGameHtml(`
    <main data-gameplay-revision="progressive-qa-fixture-v1">
      <section data-gameplay-role="current-action" data-chapter-id="chapter-1">Current action</section>
      <button data-gameplay-role="primary-action" data-gameplay-decision style="width:30px;height:30px">Act</button>
      <button data-gameplay-decision>Choice two</button>
      <button data-gameplay-decision>Choice three</button>
      <button data-gameplay-decision>Choice four</button>
      <aside data-gameplay-role="roadmap">Full roadmap is incorrectly open</aside>
      <div style="height:900px"></div>
      <section data-gameplay-role="next-action" data-chapter-id="chapter-1">Next action</section>
      <section data-gameplay-role="next-chapter" data-chapter-id="chapter-2">
        Next chapter
        <p data-gameplay-role="locked-requirement" data-current-level="0" data-required-level="2">Locked</p>
      </section>
      <div data-chapter-id="chapter-3">Later chapter is incorrectly visible</div>
    </main>`);
  const { root, runtime } = await setupQaFixture(html, 'qa-progressive-fail-');

  const report = await runPlaywrightQa(runtime, root, root);

  expect(report.passed).toBe(false);
  expect(report.checks).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'mobile-progressive-disclosure', passed: false }),
    expect.objectContaining({ name: 'mobile-primary-action', passed: false }),
    expect.objectContaining({ name: 'roadmap-default-closed', passed: false }),
    expect.objectContaining({ name: 'locked-requirement-levels', passed: false }),
    expect.objectContaining({ name: 'downstream-chapters-hidden', passed: false }),
  ]));
});
