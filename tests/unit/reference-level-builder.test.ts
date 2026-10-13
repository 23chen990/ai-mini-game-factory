import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RuntimeAdapter } from '../../src/adapters/runtime.js';
import { BuilderAgent, FixerAgent } from '../../src/agents/index.js';
import { sha256Text } from '../../src/core/files.js';
import { referenceLevelRuntimeDataPath, compileReferenceLevelRuntimeData } from '../../src/core/reference-level-runtime.js';
import { resolveProductionLine } from '../../src/core/production-line-resolution.js';
import { ReferenceLevelImplementationContractSchema } from '../../src/schemas/reference-recording.js';
import type { CodexProvider } from '../../src/providers/interfaces.js';
import { GameBlueprintSchema, type GameBlueprint, type QaReport } from '../../src/schemas/index.js';

const TARGET_GAME = 'reference-builder-fixture';

function makeContract(runRoot: string, targetGame = TARGET_GAME) {
  const workspace = path.join(runRoot, 'workspace/game');
  return ReferenceLevelImplementationContractSchema.parse({
    schemaVersion: 1,
    artifactType: 'reference-level-implementation-contract',
    targetRunId: path.basename(runRoot),
    targetGame,
    workspace,
    sourceReconstruction: { path: 'artifacts/reference-level-reconstruction.json', sha256: sha256Text('fixture-reconstruction') },
    requiredObjects: [
      { semanticId: 'hero', role: 'player', spawnOrder: 0, lifecycleOrder: ['ready', 'moving', 'settled'] },
      { semanticId: 'ground', role: 'support', spawnOrder: 1, lifecycleOrder: ['ready', 'settled'] },
      { semanticId: 'replay-control', role: 'replay-control', spawnOrder: 2, lifecycleOrder: ['hidden', 'ready', 'resolved'] },
    ],
    checkpointSequence: [
      { order: 1, id: 'ready', phase: 'ready', requiredVisibleObjectIds: ['hero', 'ground'], visibleFeedbackIds: ['feedback-ready'] },
      { order: 2, id: 'settled', phase: 'terminal', requiredVisibleObjectIds: ['hero', 'ground'], visibleFeedbackIds: ['feedback-settled'] },
      { order: 3, id: 'replay', phase: 'replay', requiredVisibleObjectIds: ['hero', 'replay-control'], visibleFeedbackIds: ['feedback-replay'] },
    ],
    placementRules: [
      { checkpointId: 'ready', semanticId: 'hero', horizontalBand: 'left', verticalBand: 'middle', widthBand: 'small', heightBand: 'small', orientationBand: 'horizontal' },
      { checkpointId: 'ready', semanticId: 'ground', horizontalBand: 'center', verticalBand: 'bottom', widthBand: 'span', heightBand: 'large', orientationBand: 'horizontal' },
    ],
    spatialRelations: [{ id: 'hero-supported', fromObjectId: 'hero', relation: 'supported-by', toObjectId: 'ground', checkpointIds: ['ready'] }],
    interactionSequence: [{ order: 1, actionId: 'finish', kind: 'tap', targetObjectId: 'hero', fromCheckpointId: 'ready', toCheckpointId: 'settled', responseClass: 'immediate', expectedStateChange: 'hero reaches the finish' }],
    cameraSequence: [{ order: 1, checkpointId: 'ready', mode: 'follow', focusObjectRole: 'player' }],
    terminal: { checkpointId: 'settled', result: 'level-complete', causeVisible: true, settlementVisible: true },
    replay: { checkpointId: 'replay', actionId: 'replay', targetObjectId: 'replay-control', returnsToCheckpointId: 'ready' },
    behaviorMeasurements: [
      {
        id: 'response-interval', measurementId: 'response-interval', kind: 'checkpoint-interval', unit: 'ms', fromCheckpointId: 'ready', toCheckpointId: 'settled', subjectObjectId: null, relatedObjectId: null,
        expectedRange: { min: 100, max: 100 }, acceptanceRange: { min: 40, max: 180 }, uncertainty: 60, coordinateSpace: 'screen-normalized', applicability: 'same natural tap', sourceFrameIds: ['frame-ready', 'frame-settled'], source: { path: 'artifacts/reference-level-reconstruction.json', sha256: sha256Text('fixture-reconstruction') },
      },
      {
        id: 'hero-ground-spacing', measurementId: 'hero-ground-spacing', kind: 'relative-distance', unit: 'normalized-distance', fromCheckpointId: 'ready', toCheckpointId: 'settled', subjectObjectId: 'hero', relatedObjectId: 'ground',
        expectedRange: { min: 0.1, max: 0.1 }, acceptanceRange: { min: 0.05, max: 0.15 }, uncertainty: 0.02, coordinateSpace: 'screen-normalized', applicability: 'same camera', sourceFrameIds: ['frame-ready', 'frame-settled'], source: { path: 'artifacts/reference-level-reconstruction.json', sha256: sha256Text('fixture-reconstruction') },
      },
    ],
    runtimeProbe: { globalName: '__REFERENCE_LEVEL_TEST__', readOnly: true, methods: ['getSnapshot', 'getNaturalInputTarget'] },
    originalityBoundary: { sourceCoordinatesExposedToBuilder: false, mustBeOriginal: ['code', 'assets', 'names-and-text', 'ui-expression', 'audio', 'raw-tuning-values'] },
    status: 'READY',
    blockers: [],
    createdAt: new Date(0).toISOString(),
  });
}

function makeBlueprint(overrides: Partial<Pick<GameBlueprint, 'gameId' | 'title'>> = {}): GameBlueprint {
  return GameBlueprintSchema.parse({
    schemaVersion: 1,
    gameId: overrides.gameId ?? TARGET_GAME,
    title: overrides.title ?? TARGET_GAME,
    theme: 'reference builder fixture',
    runtime: 'web-lite',
    template: 'cut-stack-dodge-v1',
    designMode: 'prototype_tournament',
    targetPlatforms: ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'],
    concept: 'A bounded reference-level fixture.',
    coreLoop: ['observe', 'cut', 'settle', 'replay'],
    content: { productName: 'fixture', customerName: 'customer', currencyName: 'tokens' },
    balance: { startingCurrency: 0, orderReward: 1, baseUpgradeCost: 1 },
    preferences: {},
  });
}

function makeAssets() {
  return { schemaVersion: 1, provider: 'fixture', assets: [] } as never;
}

function makeStyleLock() {
  return {} as never;
}

function makeQaReport() {
  return {
    schemaVersion: 1,
    passed: true,
    checks: [],
    issues: [],
    screenshots: [],
    consoleLog: '',
    testedAt: new Date(0).toISOString(),
  } as QaReport;
}

async function writeReferenceArtifacts(runRoot: string, options: { targetGame?: string; includeRuntimeData?: boolean } = {}) {
  const workspace = path.join(runRoot, 'workspace/game');
  await mkdir(workspace, { recursive: true });
  await mkdir(path.join(runRoot, 'artifacts'), { recursive: true });
  const contract = makeContract(runRoot, options.targetGame ?? TARGET_GAME);
  const resolution = resolveProductionLine({ title: 'Reference cutting challenge', theme: 'timing and contact', template: 'cut-stack-dodge-v1', runtime: 'web-lite' });
  await writeFile(path.join(runRoot, 'artifacts/reference-frame-manifest.json'), '{}\n');
  await writeFile(path.join(runRoot, 'artifacts/reference-level-implementation-contract.json'), `${JSON.stringify(contract)}\n`);
  await writeFile(path.join(runRoot, 'artifacts/production-line-resolution.json'), `${JSON.stringify(resolution)}\n`);
  if (options.includeRuntimeData !== false) {
    const data = compileReferenceLevelRuntimeData(contract, resolution, { targetRunId: path.basename(runRoot), targetGame: contract.targetGame, workspace });
    await writeFile(path.join(runRoot, 'artifacts/reference-level-runtime-data.json'), `${JSON.stringify(data)}\n`);
    await mkdir(path.join(workspace, 'src/generated'), { recursive: true });
    await writeFile(path.join(workspace, 'src/generated/reference-level-layout.json'), JSON.stringify({
      schemaVersion: 1, artifactType: 'reference-level-layout', template: 'cut-stack-dodge-v1', runtime: 'web-lite', sourceRuntimeDataHash: data.runtimeDataHash, playerObjectId: 'hero',
      level: { fixedStepSeconds: 1 / 60, gravity: 720, tapImpulse: -420, forwardSpeed: 240, angularImpulse: 6, failY: 720, finishX: 960, player: { x: 64, y: 300, radius: 18, angle: 0 }, objects: [{ id: 'ground', role: 'support', x: 40, y: 360, width: 160, height: 42 }] },
    }));
    return { workspace, contract, resolution, data };
  }
  return { workspace, contract, resolution, data: undefined };
}

async function writeBlueprintArtifact(runRoot: string, overrides: Partial<Pick<GameBlueprint, 'gameId' | 'title'>> = {}) {
  const blueprint = makeBlueprint(overrides);
  await writeFile(path.join(runRoot, 'artifacts/game-blueprint.json'), `${JSON.stringify(blueprint)}\n`);
  return blueprint;
}

function runtimeFor(workspace: string, calls: string[], hooks: { afterImportAssets?: () => Promise<void> } = {}): RuntimeAdapter {
  return {
    async createProject() { calls.push('createProject'); await mkdir(path.join(workspace, 'dist'), { recursive: true }); },
    async applyBlueprint() { calls.push('applyBlueprint'); },
    async importAssets() { calls.push('importAssets'); await hooks.afterImportAssets?.(); },
    async verifyProject() { calls.push('verifyProject'); return ['contract:passed', 'test:passed']; },
    async startPreview() { throw new Error('not used'); },
    async buildWeb() { calls.push('buildWeb'); return path.join(workspace, 'dist'); },
    async buildTarget() { throw new Error('not used'); },
    async stopPreview() {},
  };
}

describe('Builder reference-level runtime binding', () => {
  it.each(['missing', 'stale', 'foreign-object'] as const)('rejects a %s authored layout before building the recording game', async (mutation) => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'reference-builder-layout-'));
    const calls: string[] = [];
    const { workspace } = await writeReferenceArtifacts(runRoot);
    const provider = {
      async build() {
        calls.push('provider.build');
        const file = path.join(workspace, 'src/generated/reference-level-layout.json');
        if (mutation === 'missing') await rm(file);
        else {
          const layout = JSON.parse(await readFile(file, 'utf8'));
          if (mutation === 'stale') layout.sourceRuntimeDataHash = sha256Text('old runtime');
          else layout.level.objects[0].id = 'other-game-ground';
          await writeFile(file, JSON.stringify(layout));
        }
        return { threadId: 'builder-thread', verificationMode: 'contract' as const, metrics: { provider: 'fixture', model: 'fixture', calls: 1 } };
      },
      async fix() { throw new Error('not used'); },
    } satisfies CodexProvider;
    await expect(new BuilderAgent(provider, runtimeFor(workspace, calls)).run(workspace, makeBlueprint(), makeStyleLock(), makeAssets(), 'cut-stack-dodge-v1', workspace)).rejects.toThrow(/layout|hash|object/i);
    expect(calls).not.toContain('verifyProject');
    expect(calls).not.toContain('buildWeb');
  });

  it('stages immutable runtime data before provider.build and makes it available to the provider', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'reference-builder-run-'));
    const calls: string[] = [];
    const { workspace, data } = await writeReferenceArtifacts(runRoot);
    let providerData: unknown;
    let providerTargets: unknown;
    const provider = {
      async build(input: Parameters<CodexProvider['build']>[0]) {
        calls.push('provider.build');
        providerTargets = input.referenceLevelBehaviorTargets;
        providerData = JSON.parse(await readFile(path.join(input.workspace, referenceLevelRuntimeDataPath('web-lite')), 'utf8'));
        return { threadId: 'builder-thread', verificationMode: 'contract' as const, metrics: { provider: 'fixture', model: 'fixture', calls: 1 } };
      },
      async fix() { throw new Error('not used'); },
    } satisfies CodexProvider;
    const runtime = runtimeFor(workspace, calls);

    await new BuilderAgent(provider, runtime).run(workspace, makeBlueprint(), makeStyleLock(), makeAssets(), 'cut-stack-dodge-v1', workspace, undefined, undefined, {
      runRoot,
      outputPath: path.join(runRoot, 'logs/build.txt'),
      logDir: path.join(runRoot, 'logs'),
      inputPaths: ['artifacts/reference-frame-manifest.json', 'artifacts/reference-level-implementation-contract.json', 'artifacts/reference-level-runtime-data.json'],
    });

    expect(providerData).toEqual(data);
    expect(providerTargets).toEqual(expect.arrayContaining([expect.objectContaining({ measurementId: 'response-interval', expectedRange: { min: 100, max: 100 } })]));
    expect(calls).toEqual(['createProject', 'applyBlueprint', 'importAssets', 'provider.build', 'verifyProject', 'buildWeb']);
  });

  it.each([
    ['missing runtime data', { includeRuntimeData: false }],
    ['foreign contract', { targetGame: 'foreign-game' }],
  ] as const)('rejects %s before createProject or provider.build', async (_label, options) => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'reference-builder-reject-'));
    const calls: string[] = [];
    const { workspace } = await writeReferenceArtifacts(runRoot, options);
    await writeBlueprintArtifact(runRoot);
    const provider = {
      async build() { calls.push('provider.build'); throw new Error('provider must not run'); },
      async fix() { throw new Error('not used'); },
    } satisfies CodexProvider;

    await expect(new BuilderAgent(provider, runtimeFor(workspace, calls)).run(workspace, makeBlueprint(), makeStyleLock(), makeAssets(), 'cut-stack-dodge-v1', workspace, undefined, undefined, {
      runRoot,
      outputPath: path.join(runRoot, 'logs/build.txt'),
      logDir: path.join(runRoot, 'logs'),
      inputPaths: [],
    })).rejects.toThrow(/reference-level|runtime data|identity/i);
    expect(calls).toEqual([]);
  });

  it.each(['edit', 'remove', 'symlink'] as const)('rejects a provider %s to staged data before verifyProject/buildWeb', async (mutation) => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'reference-builder-stage-'));
    const calls: string[] = [];
    const { workspace, data } = await writeReferenceArtifacts(runRoot);
    const provider = {
      async build(input: Parameters<CodexProvider['build']>[0]) {
        calls.push('provider.build');
        const staged = path.join(input.workspace, referenceLevelRuntimeDataPath('web-lite'));
        if (mutation === 'edit') await writeFile(staged, `${JSON.stringify({ edited: true })}\n`);
        else {
          await rm(staged);
          if (mutation === 'symlink') {
            const external = path.join(await mkdtemp(path.join(tmpdir(), 'reference-builder-staged-outside-')), 'reference-level.json');
            await writeFile(external, `${JSON.stringify(data)}\n`);
            await symlink(external, staged);
          }
        }
        return { threadId: 'builder-thread', verificationMode: 'contract' as const, metrics: { provider: 'fixture', model: 'fixture', calls: 1 } };
      },
      async fix() { throw new Error('not used'); },
    } satisfies CodexProvider;

    await expect(new BuilderAgent(provider, runtimeFor(workspace, calls)).run(workspace, makeBlueprint(), makeStyleLock(), makeAssets(), 'cut-stack-dodge-v1', workspace, undefined, undefined, {
      runRoot,
      outputPath: path.join(runRoot, 'logs/build.txt'),
      logDir: path.join(runRoot, 'logs'),
      inputPaths: [],
    })).rejects.toThrow(/reference-level|runtime data|edited|missing/i);
    expect(calls).toEqual(['createProject', 'applyBlueprint', 'importAssets', 'provider.build']);
  });

  it('rejects symlinked canonical artifacts before createProject', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'reference-builder-artifact-link-'));
    const calls: string[] = [];
    const { workspace, data } = await writeReferenceArtifacts(runRoot);
    const outside = await mkdtemp(path.join(tmpdir(), 'reference-builder-artifact-outside-'));
    const external = path.join(outside, 'reference-level-runtime-data.json');
    await writeFile(external, `${JSON.stringify(data)}\n`);
    await rm(path.join(runRoot, 'artifacts/reference-level-runtime-data.json'));
    await symlink(external, path.join(runRoot, 'artifacts/reference-level-runtime-data.json'));
    const provider = {
      async build() { calls.push('provider.build'); throw new Error('provider must not run'); },
      async fix() { throw new Error('not used'); },
    } satisfies CodexProvider;

    await expect(new BuilderAgent(provider, runtimeFor(workspace, calls)).run(workspace, makeBlueprint(), makeStyleLock(), makeAssets(), 'cut-stack-dodge-v1', workspace, undefined, undefined, { runRoot, outputPath: '', logDir: '', inputPaths: [] })).rejects.toThrow(/symlink|reference-level/i);
    expect(calls).toEqual([]);
  });

  it('rejects an existing runtime staging parent symlink before createProject', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'reference-builder-staging-parent-link-'));
    const calls: string[] = [];
    const { workspace } = await writeReferenceArtifacts(runRoot);
    const foreignRun = await mkdtemp(path.join(tmpdir(), 'reference-builder-staging-foreign-'));
    const foreignGenerated = path.join(foreignRun, 'src/generated');
    await mkdir(foreignGenerated, { recursive: true });
    const sentinel = path.join(foreignGenerated, 'sentinel.txt');
    await writeFile(sentinel, 'untouched');
    await mkdir(path.join(workspace, 'src'), { recursive: true });
    await rm(path.join(workspace, 'src/generated'), { recursive: true, force: true });
    await symlink(foreignGenerated, path.join(workspace, 'src/generated'));
    const provider = {
      async build() { calls.push('provider.build'); throw new Error('provider must not run'); },
      async fix() { throw new Error('not used'); },
    } satisfies CodexProvider;

    await expect(new BuilderAgent(provider, runtimeFor(workspace, calls)).run(workspace, makeBlueprint(), makeStyleLock(), makeAssets(), 'cut-stack-dodge-v1', workspace, undefined, undefined, { runRoot, outputPath: '', logDir: '', inputPaths: [] })).rejects.toThrow(/staging|symlink|reference-level/i);
    expect(calls).toEqual([]);
    await expect(readFile(sentinel, 'utf8')).resolves.toBe('untouched');
    await expect(lstat(path.join(foreignGenerated, 'reference-level.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a workspace parent symlink when the workspace leaf is missing', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'reference-builder-workspace-parent-link-'));
    const calls: string[] = [];
    const { workspace } = await writeReferenceArtifacts(runRoot);
    const foreignWorkspaceRoot = await mkdtemp(path.join(tmpdir(), 'reference-builder-workspace-foreign-'));
    const sentinel = path.join(foreignWorkspaceRoot, 'sentinel.txt');
    await writeFile(sentinel, 'untouched');
    await rm(path.join(runRoot, 'workspace'), { recursive: true, force: true });
    await symlink(foreignWorkspaceRoot, path.join(runRoot, 'workspace'));
    const provider = {
      async build() { calls.push('provider.build'); throw new Error('provider must not run'); },
      async fix() { throw new Error('not used'); },
    } satisfies CodexProvider;

    await expect(new BuilderAgent(provider, runtimeFor(workspace, calls)).run(workspace, makeBlueprint(), makeStyleLock(), makeAssets(), 'cut-stack-dodge-v1', workspace, undefined, undefined, { runRoot, outputPath: '', logDir: '', inputPaths: [] })).rejects.toThrow(/workspace|symlink|reference-level/i);
    expect(calls).toEqual([]);
    await expect(readFile(sentinel, 'utf8')).resolves.toBe('untouched');
    await expect(lstat(path.join(foreignWorkspaceRoot, 'game'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('checks staging parents again when the runtime adapter introduces them', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'reference-builder-adapter-parent-link-'));
    const calls: string[] = [];
    const { workspace } = await writeReferenceArtifacts(runRoot);
    const foreignRun = await mkdtemp(path.join(tmpdir(), 'reference-builder-adapter-foreign-'));
    const foreignGenerated = path.join(foreignRun, 'src/generated');
    await mkdir(foreignGenerated, { recursive: true });
    const sentinel = path.join(foreignGenerated, 'sentinel.txt');
    await writeFile(sentinel, 'untouched');
    const provider = {
      async build() { calls.push('provider.build'); throw new Error('provider must not run'); },
      async fix() { throw new Error('not used'); },
    } satisfies CodexProvider;
    const runtime = runtimeFor(workspace, calls, {
      async afterImportAssets() {
        await mkdir(path.join(workspace, 'src'), { recursive: true });
        await symlink(foreignGenerated, path.join(workspace, 'src/generated'));
      },
    });

    await expect(new BuilderAgent(provider, runtime).run(workspace, makeBlueprint(), makeStyleLock(), makeAssets(), 'cut-stack-dodge-v1', workspace, undefined, undefined, { runRoot, outputPath: '', logDir: '', inputPaths: [] })).rejects.toThrow(/staging|symlink|reference-level/i);
    expect(calls).toEqual(['createProject', 'applyBlueprint', 'importAssets']);
    await expect(readFile(sentinel, 'utf8')).resolves.toBe('untouched');
    await expect(lstat(path.join(foreignGenerated, 'reference-level.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a workspace symlink before createProject without touching the foreign workspace', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'reference-builder-workspace-link-'));
    const calls: string[] = [];
    const { workspace } = await writeReferenceArtifacts(runRoot);
    const foreignRun = await mkdtemp(path.join(tmpdir(), 'reference-builder-foreign-run-'));
    const foreignWorkspace = path.join(foreignRun, 'workspace/game');
    await mkdir(foreignWorkspace, { recursive: true });
    await rm(workspace, { recursive: true, force: true });
    await symlink(foreignWorkspace, workspace);
    const provider = {
      async build() { calls.push('provider.build'); throw new Error('provider must not run'); },
      async fix() { throw new Error('not used'); },
    } satisfies CodexProvider;

    await expect(new BuilderAgent(provider, runtimeFor(workspace, calls)).run(workspace, makeBlueprint(), makeStyleLock(), makeAssets(), 'cut-stack-dodge-v1', workspace, undefined, undefined, { runRoot, outputPath: '', logDir: '', inputPaths: [] })).rejects.toThrow(/workspace|symlink|reference-level/i);
    expect(calls).toEqual([]);
  });

  it('uses the immutable game id from the run blueprint while validating a variant context identity', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'reference-builder-title-slug-'));
    const calls: string[] = [];
    const title = 'Moonlit Cut Trial';
    const gameId = 'moonlit-cut-trial';
    const { workspace, data } = await writeReferenceArtifacts(runRoot, { targetGame: gameId });
    await writeBlueprintArtifact(runRoot, { gameId, title });
    await mkdir(path.join(workspace, 'dist'), { recursive: true });
    const staged = path.join(workspace, referenceLevelRuntimeDataPath('web-lite'));
    await mkdir(path.dirname(staged), { recursive: true });
    await writeFile(staged, `${JSON.stringify(data)}\n`);
    const provider = {
      async build() { throw new Error('not used'); },
      async fix() { throw new Error('not used'); },
    } satisfies CodexProvider;

    await expect(new BuilderAgent(provider, runtimeFor(workspace, calls)).verifyExisting(workspace, 'cut-stack-dodge-v1', 'builder-thread', 'contract', { runRoot, targetGameId: gameId, outputPath: '', logDir: '', inputPaths: [] })).resolves.toMatchObject({ report: expect.anything() });
    expect(calls).toEqual(['verifyProject', 'buildWeb']);

    const fixerCalls: string[] = [];
    const fixerProvider = {
      async build() { throw new Error('not used'); },
      async fix() {
        fixerCalls.push('provider.fix');
        return { threadId: 'fix-thread', summary: 'fixed', verificationMode: 'contract' as const, metrics: { provider: 'fixture', model: 'fixture', calls: 1 } };
      },
    } satisfies CodexProvider;
    await expect(new FixerAgent(fixerProvider, runtimeFor(workspace, fixerCalls)).run(workspace, 'builder-thread', makeQaReport(), { runRoot, targetGameId: gameId, outputPath: '', logDir: '', inputPaths: [] })).resolves.toMatchObject({ summary: 'fixed' });
    expect(fixerCalls).toEqual(['provider.fix', 'verifyProject', 'buildWeb']);
  });

  it('validates verifyExisting template and runtime when no context is provided', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'reference-builder-template-check-'));
    const calls: string[] = [];
    const { workspace, data } = await writeReferenceArtifacts(runRoot);
    const staged = path.join(workspace, referenceLevelRuntimeDataPath('web-lite'));
    await mkdir(path.dirname(staged), { recursive: true });
    await writeFile(staged, `${JSON.stringify(data)}\n`);
    const provider = {
      async build() { throw new Error('not used'); },
      async fix() { throw new Error('not used'); },
    } satisfies CodexProvider;

    await expect(new BuilderAgent(provider, runtimeFor(workspace, calls)).verifyExisting(workspace, 'spatial-shop-3d-v1', 'builder-thread', 'contract')).rejects.toThrow(/template|runtime/i);
    expect(calls).toEqual([]);
  });

  it('does not let verifyExisting or FixerAgent bypass a missing staged file', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'reference-builder-existing-'));
    const calls: string[] = [];
    const { workspace, data } = await writeReferenceArtifacts(runRoot);
    await writeBlueprintArtifact(runRoot);
    const staged = path.join(workspace, referenceLevelRuntimeDataPath('web-lite'));
    await mkdir(path.dirname(staged), { recursive: true });
    await writeFile(staged, `${JSON.stringify(data)}\n`);
    await rm(staged);

    const provider = {
      async build() { throw new Error('not used'); },
      async fix() { calls.push('provider.fix'); return { threadId: 'fix-thread', summary: 'fixed', verificationMode: 'contract' as const, metrics: { provider: 'fixture', model: 'fixture', calls: 1 } }; },
    } satisfies CodexProvider;
    const runtime = runtimeFor(workspace, calls);

    await expect(new BuilderAgent(provider, runtime).verifyExisting(workspace, 'cut-stack-dodge-v1', 'builder-thread', 'contract', { runRoot, targetGameId: TARGET_GAME, outputPath: '', logDir: '', inputPaths: [] })).rejects.toThrow(/missing|runtime data|reference-level/i);
    await expect(new FixerAgent(provider, runtime).run(workspace, 'builder-thread', makeQaReport(), { runRoot, targetGameId: TARGET_GAME, outputPath: '', logDir: '', inputPaths: [] })).rejects.toThrow(/missing|runtime data|reference-level/i);
    expect(calls).toEqual([]);
  });

  it('keeps legacy no-recording builds unchanged', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'reference-builder-legacy-'));
    const workspace = path.join(runRoot, 'workspace/game');
    await mkdir(workspace, { recursive: true });
    const calls: string[] = [];
    const provider = {
      async build() { calls.push('provider.build'); return { threadId: 'builder-thread', verificationMode: 'contract' as const, metrics: { provider: 'fixture', model: 'fixture', calls: 1 } }; },
      async fix() { throw new Error('not used'); },
    } satisfies CodexProvider;

    await new BuilderAgent(provider, runtimeFor(workspace, calls)).run(workspace, makeBlueprint(), makeStyleLock(), makeAssets(), 'cut-stack-dodge-v1', workspace);
    expect(calls).toEqual(['createProject', 'applyBlueprint', 'importAssets', 'provider.build', 'verifyProject', 'buildWeb']);
  });
});
