import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BuilderAgent } from '../../src/agents/index.js';
import type { RuntimeAdapter } from '../../src/adapters/runtime.js';
import type { CodexProvider } from '../../src/providers/interfaces.js';
import { GameBlueprintSchema, type AssetManifest, type GameBlueprint, type GameplayRevisionLock, type StyleLock } from '../../src/schemas/index.js';
import * as factoryModule from '../../src/factory.js';

type RevisionLoader = (runRoot: string, blueprint: GameBlueprint) => Promise<GameplayRevisionLock | undefined>;

function revisionLock(targetRunId: string) {
  const actionIds = [
    ['a1', 'a2', 'a3'], ['b1', 'b2', 'b3'], ['c1', 'c2', 'c3'], ['d1', 'd2', 'd3'],
    ['e1', 'e2', 'e3'], ['f1', 'f2', 'f3'], ['g1', 'g2', 'g3'], ['h1', 'h2', 'h3'],
  ];
  const chapterIds = ['foundation', 'care', 'style', 'study', 'career', 'social', 'romance', 'home'];
  const chapters = chapterIds.map((id, chapterIndex) => {
    const ids = actionIds[chapterIndex]!;
    const previous = chapterIndex === 0 ? undefined : actionIds[chapterIndex - 1]![2];
    const chapterRequirements = previous ? [{ activityId: previous, minimumLevel: 2 }] : [];
    if (id === 'social') chapterRequirements.push({ activityId: 'd3', minimumLevel: 3 });
    if (id === 'romance') chapterRequirements.push({ activityId: 'e3', minimumLevel: 3 });
    const purchase = id === 'home';
    return {
      id,
      order: chapterIndex + 1,
      name: `Chapter ${chapterIndex + 1}`,
      milestoneTransformation: `Visible transformation ${chapterIndex + 1}`,
      requireAll: chapterRequirements,
      actions: ids.map((activityId, actionIndex) => ({
        id: activityId,
        order: actionIndex + 1,
        name: `Action ${chapterIndex + 1}-${actionIndex + 1}`,
        visibleVerb: `Perform action ${chapterIndex + 1}-${actionIndex + 1}`,
        kind: purchase ? 'purchase' : 'repeated_action',
        animationRequired: true,
        contributesPassiveRate: !purchase,
        requireAll: actionIndex === 0
          ? []
          : ids.slice(0, actionIndex).map((requiredId) => ({ activityId: requiredId, minimumLevel: 2 })),
      })),
    };
  });

  return {
    schemaVersion: 1,
    revisionId: 'approved-revision-v2',
    lockedBy: 'human',
    approval: { status: 'APPROVED', evidence: 'User approved the revised progression.', approvedAt: '2026-08-31T02:00:00.000Z' },
    targetRunId,
    title: '逆袭公主',
    supersedes: ['artifacts/old-mechanics.json'],
    researchArtifacts: ['artifacts/reference-research.json', 'artifacts/open-source-research.json'],
    openSourceGate: { artifactPath: 'artifacts/open-source-research.json', outcome: 'NO_SUITABLE_CANDIDATE', noNewDependencies: true },
    contentRules: { actionNamesDescribeVisibleVerbs: true, everyActionHasVisibleAnimation: true, forbiddenAbstractLabels: ['Abstract Placeholder'] },
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
}

function blueprint(targetRunId?: string): GameBlueprint {
  return GameBlueprintSchema.parse({
    schemaVersion: 1,
    gameId: 'princess-reversal',
    title: '逆袭公主',
    theme: 'original princess growth',
    runtime: 'web-lite',
    template: 'idle-shop-v1',
    designMode: 'reference_reskin',
    referenceMechanics: {
      schemaVersion: 1,
      lockedBy: 'human',
      source: { name: 'Reference', url: 'https://example.com/reference', researchFiles: [] },
      coreLoop: ['act', 'earn', 'upgrade', 'unlock'],
      playerActions: ['tap character'],
      progressionSystems: ['activity graph'],
      unlockRules: ['combined requirements'],
      feedbackCadence: { immediateSeconds: 1, microGoalMinSeconds: 10, microGoalMaxSeconds: 300 },
      mustPreserveMechanics: ['active and passive progress coexist'],
      adaptableMechanics: ['original story and expression'],
      expressionIsolation: { originalCode: true, originalAssets: true, originalNamesAndText: true, originalUiLayout: true, originalAudio: true, originalTuningValues: true },
    },
    gameplayRevision: targetRunId ? {
      artifactPath: 'artifacts/gameplay-revision-lock-v2.json',
      revisionId: 'approved-revision-v2',
      targetRunId,
      title: '逆袭公主',
    } : undefined,
    targetPlatforms: ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'],
    concept: 'original princess growth through visible actions and choices',
    coreLoop: ['act', 'earn', 'upgrade', 'unlock'],
    content: { productName: 'action', customerName: 'heroine', currencyName: 'growth' },
    balance: { startingCurrency: 0, orderReward: 1, baseUpgradeCost: 2 },
    preferences: {},
  });
}

function loader(): RevisionLoader | undefined {
  return (factoryModule as Record<string, unknown>).loadGameplayRevisionForBuild as RevisionLoader | undefined;
}

describe('gameplay revision BUILD artifact loading', () => {
  it('returns no revision for a backward-compatible blueprint without a reference', async () => {
    expect(loader()).toBeTypeOf('function');
    if (!loader()) return;
    await expect(loader()!('/does/not/need/to/exist', blueprint())).resolves.toBeUndefined();
  });

  it('loads and validates the lock inside the referenced target run', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'revision-build-run-'));
    const runId = path.basename(runRoot);
    await mkdir(path.join(runRoot, 'artifacts'));
    await writeFile(path.join(runRoot, 'artifacts/gameplay-revision-lock-v2.json'), JSON.stringify(revisionLock(runId)));

    expect(loader()).toBeTypeOf('function');
    if (!loader()) return;
    await expect(loader()!(runRoot, blueprint(runId))).resolves.toMatchObject({ revisionId: 'approved-revision-v2', targetRunId: runId, title: '逆袭公主' });
  });

  it.each([
    ['revisionId', 'different-revision'],
    ['targetRunId', 'different-run'],
    ['title', 'different-title'],
  ] as const)('rejects a lock whose %s differs from its blueprint reference', async (field, value) => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'revision-build-run-'));
    const runId = path.basename(runRoot);
    await mkdir(path.join(runRoot, 'artifacts'));
    await writeFile(path.join(runRoot, 'artifacts/gameplay-revision-lock-v2.json'), JSON.stringify({ ...revisionLock(runId), [field]: value }));

    expect(loader()).toBeTypeOf('function');
    if (!loader()) return;
    await expect(loader()!(runRoot, blueprint(runId))).rejects.toThrow(new RegExp(field, 'i'));
  });

  it('rejects a revision artifact symlink that escapes the run artifacts directory', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'revision-build-run-'));
    const runId = path.basename(runRoot);
    const outside = path.join(await mkdtemp(path.join(tmpdir(), 'revision-outside-')), 'lock.json');
    await mkdir(path.join(runRoot, 'artifacts'));
    await writeFile(outside, JSON.stringify(revisionLock(runId)));
    await symlink(outside, path.join(runRoot, 'artifacts/gameplay-revision-lock-v2.json'));

    expect(loader()).toBeTypeOf('function');
    if (!loader()) return;
    await expect(loader()!(runRoot, blueprint(runId))).rejects.toThrow(/symlink|inside.*artifacts|safe/i);
  });
});

describe('BuilderAgent gameplay revision forwarding', () => {
  it('passes the validated revision lock to CodexProvider.build', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'revision-builder-'));
    await mkdir(path.join(workspace, 'dist'));
    await writeFile(path.join(workspace, 'dist/index.html'), '<!doctype html>');
    let receivedRevision: GameplayRevisionLock | undefined;
    const provider = {
      async build(input: Parameters<CodexProvider['build']>[0]) {
        receivedRevision = input.gameplayRevision;
        return { threadId: 'builder-thread', verificationMode: 'contract' as const, metrics: { provider: 'test', model: 'test', calls: 1 } };
      },
      async fix() { throw new Error('not used'); },
    } satisfies CodexProvider;
    const runtime = {
      async createProject() {},
      async applyBlueprint() {},
      async importAssets() {},
      async verifyProject() { return ['typecheck:passed', 'tests:passed']; },
      async buildWeb() { return path.join(workspace, 'dist'); },
    } as unknown as RuntimeAdapter;
    const lock = revisionLock('target-run') as GameplayRevisionLock;
    const styleLock = {} as StyleLock;
    const assets = { schemaVersion: 1, provider: 'test', assets: [] } as AssetManifest;
    const build = new BuilderAgent(provider, runtime).run as unknown as (
      workspace: string,
      blueprint: GameBlueprint,
      styleLock: StyleLock,
      assets: AssetManifest,
      template: string,
      assetSource: string,
      approved3dAssets: undefined,
      gameplayRevision: GameplayRevisionLock,
    ) => Promise<unknown>;

    await build.call(new BuilderAgent(provider, runtime), workspace, blueprint('target-run'), styleLock, assets, 'idle-shop-v1', workspace, undefined, lock);

    expect(receivedRevision).toEqual(lock);
  });
});

describe('FULL_BUILD retry budget', () => {
  it('retains automatic fix attempts when retrying the build without a new human review flow', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'factory-build-retry-'));
    const factory = factoryModule.createFactory({ root, repositoryRoot: process.cwd(), mode: 'mock', qaMode: 'stub' });
    const runId = await factory.demo(path.join(process.cwd(), 'examples/seeds/ghost-night-market.yaml'));
    const stateFile = path.join(root, 'runs', runId, 'state.json');
    const state = JSON.parse(await readFile(stateFile, 'utf8')) as { fixAttempts: number };
    state.fixAttempts = 2;
    await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`);

    const retried = await factory.retry(runId, 'FULL_BUILD');

    expect(retried.fixAttempts).toBe(2);
  }, 30_000);
});
