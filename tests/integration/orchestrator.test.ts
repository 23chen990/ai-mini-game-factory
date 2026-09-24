import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFactory } from '../../src/factory.js';
import { MockAgentProvider } from '../../src/providers/mock.js';
import { MockQAProvider } from '../../src/providers/runtime-qa.js';
import { deriveRuntimeProductGate } from '../../src/core/runtime-product-gates.js';
import { ReferenceFidelityContractSchema } from '../../src/schemas/reference-fidelity.js';
import { sha256Text } from '../../src/core/files.js';
import { evaluateReferenceLevelRuntimeTrace } from '../../src/core/reference-level.js';
import { ReferenceLevelRuntimeTraceSchema, type ReferenceLevelRuntimeTrace } from '../../src/schemas/reference-recording.js';
import { lockProductionLine } from '../../src/core/production-lines.js';
import { RunArchiveManifestSchema } from '../../src/core/run-preservation.js';

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'factory-test-'));
  roots.push(root);
  const seed = path.join(root, 'seed.yaml');
  await writeFile(seed, 'title: 妖怪夜市\ntheme: 夜市妖怪\ntemplate: idle-shop-v1\ndesignMode: prototype_tournament\npreferences:\n  tone: cozy\n');
  return { root, seed, factory: createFactory({ root, mode: 'mock', qaMode: 'stub' }) };
}
afterEach(async () => { vi.restoreAllMocks(); const { rm } = await import('node:fs/promises'); await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true }))); });

describe('orchestrator integration', () => {
  it.each(['completed', 'pending'] as const)('preserves legacy preview contracts and assets before regenerating the resolved production line with a %s core lock', async (coreStatus) => {
    const root = await mkdtemp(path.join(tmpdir(), 'factory-preview-preserve-'));
    roots.push(root);
    const seed = path.join(root, 'seed.yaml');
    await writeFile(seed, `title: Factory Archive Fixture
theme: original shop orders
template: idle-shop-v1
designMode: reference_reskin
referenceMechanics:
  schemaVersion: 1
  lockedBy: human
  source: { name: Reference, url: https://example.com/reference, researchFiles: [input/reference-report.txt] }
  coreLoop: [act, earn, upgrade, retry]
  playerActions: [tap]
  progressionSystems: [upgrades]
  unlockRules: [finish prior task]
  feedbackCadence: { immediateSeconds: 1, microGoalMinSeconds: 2, microGoalMaxSeconds: 20 }
  mustPreserveMechanics: [attributable outcome]
  adaptableMechanics: [original expression]
  expressionIsolation:
    originalCode: true
    originalAssets: true
    originalNamesAndText: true
    originalUiLayout: true
    originalAudio: true
    originalTuningValues: true
`);
    const factory = createFactory({ root, mode: 'mock', qaMode: 'stub' });
    const runId = await factory.newRun(seed);
    const runRoot = path.join(root, 'runs', runId);
    await writeFile(path.join(runRoot, 'input/reference-report.txt'), 'Observed act, earn, upgrade, retry.');
    await factory.run(runId);
    await factory.approveReference(runId, { decision: 'APPROVE', notes: 'Synthetic orchestration fixture.' });
    await factory.resume(runId);
    const stateFile = path.join(runRoot, 'state.json');
    const priorState = await factory.status(runId);
    priorState.stages.CORE_SPEC_FROZEN!.status = coreStatus;
    await writeFile(stateFile, JSON.stringify(priorState));
    const oldLine = `${JSON.stringify(lockProductionLine('cut-stack-dodge'))}\n`;
    await writeFile(path.join(runRoot, 'artifacts/production-line-contract.json'), oldLine);
    const priorExperience = await readFile(path.join(runRoot, 'artifacts/experience-contract.json'), 'utf8');
    const manifestPath = path.join(runRoot, 'artifacts/asset-manifest.json');
    const oldAssets = JSON.parse(await readFile(manifestPath, 'utf8'));
    oldAssets.assets[0].id = 'superseded-slot';
    const priorAssets = `${JSON.stringify(oldAssets)}\n`;
    await writeFile(manifestPath, priorAssets);
    await writeFile(path.join(runRoot, 'workspace/generated-assets/user-note.txt'), 'preserve this note');

    const resumed = await factory.resume(runId).catch((error: unknown) => error);
    expect(resumed).not.toBeInstanceOf(Error);

    const archiveRoot = path.join(runRoot, 'history/factory-migrations');
    const manifests = await Promise.all((await readdir(archiveRoot)).map(async (name) => RunArchiveManifestSchema.parse(JSON.parse(await readFile(path.join(archiveRoot, name, 'manifest.json'), 'utf8')))));
    const contents = new Map(await Promise.all(manifests.flatMap((archive) => archive.entries.filter((entry) => entry.kind === 'file')).map(async (entry) => [entry.sourcePath, await readFile(path.join(runRoot, entry.archivedPath), 'utf8')] as const)));
    expect(contents.get('artifacts/production-line-contract.json')).toBe(oldLine);
    expect(contents.get('artifacts/experience-contract.json')).toBe(priorExperience);
    expect(contents.get('artifacts/asset-manifest.json')).toBe(priorAssets);
    expect(contents.get('workspace/generated-assets/user-note.txt')).toBe('preserve this note');
    expect(manifests.every((archive) => archive.targetRunId === runId && archive.status === 'archived')).toBe(true);
    expect(JSON.parse(await readFile(path.join(runRoot, 'artifacts/production-line-contract.json'), 'utf8')).line).toBe('idle-management');
  });

  it('routes an explicit cut mother template to the cut production line before any model call', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'factory-cut-route-'));
    roots.push(root);
    const seed = path.join(root, 'cut-seed.yaml');
    await writeFile(seed, `title: Original Blade Trial
theme: An original one-touch obstacle course
template: cut-stack-dodge-v1
designMode: reference_reskin
referenceMechanics:
  schemaVersion: 1
  lockedBy: human
  source: { name: Bound recording, url: https://example.com/reference, researchFiles: [] }
  coreLoop: [ready state, tap to flip, resolve contact, reach terminal]
  playerActions: [tap]
  progressionSystems: [authored checkpoints]
  unlockRules: [finish the prior checkpoint]
  feedbackCadence: { immediateSeconds: 1, microGoalMinSeconds: 2, microGoalMaxSeconds: 20 }
  mustPreserveMechanics: [tap-to-state transition]
  adaptableMechanics: [original expression]
  expressionIsolation:
    originalCode: true
    originalAssets: true
    originalNamesAndText: true
    originalUiLayout: true
    originalAudio: true
    originalTuningValues: true
`);
    const factory = createFactory({ root, mode: 'mock', qaMode: 'stub' });
    const runId = await factory.newRun(seed);
    const decision = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/production-line-decision.json'), 'utf8'));
    const resolution = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/production-line-resolution.json'), 'utf8'));
    const plan = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/pipeline-plan.json'), 'utf8'));
    expect(decision).toMatchObject({ supportDecision: 'SUPPORTED', profile: 'ACTION_FEEL', line: 'cut-stack-dodge' });
    expect(resolution).toMatchObject({ status: 'RESOLVED', line: 'cut-stack-dodge', template: 'cut-stack-dodge-v1', runtime: 'web-lite', profile: 'ACTION_FEEL' });
    expect(resolution.resolutionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.productionLine).toBe('cut-stack-dodge');
  });

  it('fails closed when a run model policy drifts before execution', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'factory-model-drift-'));
    roots.push(root);
    const seed = path.join(root, 'seed.yaml');
    await writeFile(seed, 'title: Model Drift Fixture\ntheme: bounded idle loop\ntemplate: idle-shop-v1\ndesignMode: prototype_tournament\n');
    const previous = process.env.FACTORY_BUILDER_MODEL;
    delete process.env.FACTORY_BUILDER_MODEL;
    try {
      const factory = createFactory({ root, mode: 'mock', qaMode: 'stub' });
      const runId = await factory.newRun(seed);
      process.env.FACTORY_BUILDER_MODEL = 'gpt-5.6-terra';
      await expect(factory.run(runId)).rejects.toThrow(/model policy snapshot drifted/iu);
    } finally {
      if (previous === undefined) delete process.env.FACTORY_BUILDER_MODEL;
      else process.env.FACTORY_BUILDER_MODEL = previous;
    }
  });

  it('locks a human-designated reference and never asks agents to invent or tournament-test game ideas', async () => {
    class NoIdeationProvider extends MockAgentProvider {
      openSourceWasDurableBeforeBlueprint = false;
      override async generateCompetitorResearch(): Promise<never> { throw new Error('reference mode must not run competitor ideation'); }
      override async generateIdeas(): Promise<never> { throw new Error('reference mode must not generate ideas'); }
      override async generateBlueprint(...args: Parameters<MockAgentProvider['generateBlueprint']>) {
        const context = args[1];
        if (context) {
          const artifact = JSON.parse(await readFile(path.join(context.runRoot, 'artifacts/open-source-research.json'), 'utf8')) as { unknowns?: string[] };
          this.openSourceWasDurableBeforeBlueprint = Array.isArray(artifact.unknowns) && artifact.unknowns.length === 0;
        }
        return super.generateBlueprint(...args);
      }
    }
    const root = await mkdtemp(path.join(tmpdir(), 'factory-reference-test-'));
    roots.push(root);
    const seed = path.join(root, 'reference-seed.yaml');
    await writeFile(seed, `title: 我要当美女
theme: 原创都市变美逆袭
template: idle-shop-v1
designMode: reference_reskin
referenceMechanics:
  schemaVersion: 1
  lockedBy: human
  source:
    name: Named benchmark
    url: https://example.com/reference
    researchFiles: [input/reference-report.txt]
  coreLoop: [持续执行当前动作, 获得资源, 升级动作效率, 解锁下一项可见目标]
  playerActions: [点击加速当前动作, 购买当前项目升级]
  progressionSystems: [动作效率升级, 人物外观阶段变化, 场景阶段变化]
  unlockRules: [下一目标始终可见但未满足条件时锁定]
  feedbackCadence:
    immediateSeconds: 1
    microGoalMinSeconds: 10
    microGoalMaxSeconds: 300
  mustPreserveMechanics: [持续动作与自动产出并存, 长期逆袭拆成连续的小目标]
  adaptableMechanics: [项目数量, 阶段数量, 题材映射]
  expressionIsolation:
    originalCode: true
    originalAssets: true
    originalNamesAndText: true
    originalUiLayout: true
    originalAudio: true
    originalTuningValues: true
`);
    const provider = new NoIdeationProvider();
    const factory = createFactory({ root, mode: 'mock', qaMode: 'stub', agentProvider: provider, enforceStageContracts: true, enforceExplicitStageContracts: true });
    const runId = await factory.newRun(seed);
    // Preview runs require run-bound supplemental evidence.  In production
    // this is supplied by evidence:ingest between run creation and execution.
    await writeFile(path.join(root, 'runs', runId, 'input/reference-report.txt'), 'Observed loop: act, earn, upgrade, unlock, retry.\n');
    const paused = await factory.run(runId);

    expect(paused).toMatchObject({ stage: 'WAITING_FOR_REFERENCE_APPROVAL', status: 'waiting' });
    expect(paused.stages.REFERENCE_MECHANIC_LOCK?.status).toBe('completed');
    expect(paused.stages.REFERENCE_MECHANIC_LOCK?.evidence).toContain('mechanic-fidelity:maximum-core-mechanics');
    const behaviorAnalysis = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/reference-behavior-analysis.json'), 'utf8')) as { behaviorChecks: unknown[]; status: string };
    expect(behaviorAnalysis).toMatchObject({ status: 'READY' });
    expect(behaviorAnalysis.behaviorChecks).toHaveLength(5);
    for (const forbidden of ['COMPETITOR_RESEARCH', 'IDEA_GENERATION', 'LOW_COST_FILTER', 'PROTOTYPE_SELECTION', 'BUILD_3_PROTOTYPES', 'PLAYTEST_TOURNAMENT', 'WINNER_SELECTION']) {
      expect(paused.stages[forbidden as keyof typeof paused.stages]).toBeUndefined();
    }
    const locked = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/reference-mechanic-spec.json'), 'utf8')) as { lockedBy: string; source: { name: string }; fidelityPolicy: { level: string } };
    expect(locked).toMatchObject({ lockedBy: 'human', source: { name: 'Named benchmark' }, fidelityPolicy: { level: 'maximum_core_mechanics' } });

    await factory.approveReference(runId, { decision: 'APPROVE', notes: '机制关系确认，表现层全部原创。' });
    const done = await factory.resume(runId);
    expect(provider.openSourceWasDurableBeforeBlueprint).toBe(true);
    expect(done.stage).toBe('QA');
    expect(done.status).toBe('waiting');
    expect(done.stages.FULL_BUILD?.status).toBe('completed');
    expect(done.stages.QA?.status).toBe('waiting');
    const fidelityGate = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/reference-fidelity-gate.json'), 'utf8'));
    expect(fidelityGate.passed).toBe(false);
    expect(fidelityGate.blockers).toContain('fidelity:review-missing');
    const reviewTask = await readFile(path.join(root, 'runs', runId, 'human/reference-fidelity-review-task.md'), 'utf8');
    expect(reviewTask).toContain(fidelityGate.buildHash);
    expect(reviewTask).toContain('reference-fidelity-review.json');
    const coreSpec = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/core-spec-lock.json'), 'utf8'));
    expect(coreSpec.acceptanceDimensions).toContain('reference:reference-spatial_relation');
    expect(done.stages.OPEN_SOURCE_RESEARCH).toBeUndefined();
    expect(done.stages.IAA_REVIEW).toBeUndefined();
    const blueprint = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/game-blueprint.json'), 'utf8')) as { designMode: string; referenceMechanics: { lockedBy: string } };
    expect(blueprint).toMatchObject({ designMode: 'reference_reskin', referenceMechanics: { lockedBy: 'human' } });

    // Synthetic evidence tests orchestration only. It is not a real game acceptance.
    const runRoot = path.join(root, 'runs', runId);
    const artifact = (name: string) => path.join(runRoot, 'artifacts', name);
    const contract = ReferenceFidelityContractSchema.parse(JSON.parse(await readFile(artifact('reference-fidelity-contract.json'), 'utf8')));
    const image = { path: 'screenshots/fixture.png', sha256: sha256Text('synthetic image') };
    await writeFile(path.join(runRoot, image.path), 'synthetic image');
    const flow = {
      schemaVersion: 1, startedFromReset: true, actions: ['page.tap target', 'page.tap replay'],
      transitions: contract.behaviorChecks.map((check) => ({ name: check.id, changed: true, evidence: 'synthetic branch observation' })),
      completion: 'settlement', replayObserved: true, forbiddenOperations: [], screenshots: [image.path],
      passed: true, blockers: [], buildHash: fidelityGate.buildHash, runtime: 'web-lite',
      device: { width: 390, height: 844, label: 'mobile' }, seed: 1, runner: 'synthetic-test-only', observedAt: new Date(0).toISOString(),
    };
    const trace = { path: 'logs/fixture-natural.json', sha256: sha256Text(JSON.stringify(flow)) };
    await writeFile(path.join(runRoot, trace.path), JSON.stringify(flow));
    const rawQa = JSON.parse(await readFile(artifact('qa-report.json'), 'utf8'));
    await writeFile(artifact('qa-report.json'), JSON.stringify({ ...rawQa, naturalFlow: flow }));
    await writeFile(artifact('runtime-product-gates.json'), JSON.stringify(deriveRuntimeProductGate({ naturalFlow: flow, runtimeWiredFiles: ['workspace/game/index.html'], browserEvidence: [image.path] })));
    await writeFile(artifact('reference-fidelity-review.json'), JSON.stringify({
      schemaVersion: 1, targetRunId: runId, workspace: path.join(runRoot, 'workspace/game'), contractHash: fidelityGate.contractHash, buildHash: fidelityGate.buildHash,
      reviewer: 'QAAgent', authorIndependent: true,
      cases: contract.behaviorChecks.map((check) => ({ checkId: check.id, objectType: check.objectType, stateBranch: check.stateBranch, viewport: check.viewport,
        passed: true, perceptualPassed: true, observedStateChange: 'synthetic observed state', observedFeedback: 'synthetic visible feedback', screenshots: [image], trace })),
    }));
    vi.spyOn(MockQAProvider.prototype, 'playtest').mockImplementation(async () => { throw new Error('review resume must preserve the existing evidence'); });
    const awaitingCoreDemo = await factory.resume(runId);
    expect(awaitingCoreDemo).toMatchObject({ stage: 'WAITING_FOR_HUMAN_PLAYTEST', status: 'waiting' });
    await expect(readFile(path.join(runRoot, 'artifacts/content-expansion.json'), 'utf8')).rejects.toThrow();
    await expect(readFile(path.join(runRoot, 'artifacts/ui-skeleton.json'), 'utf8')).rejects.toThrow();
    const productContract = JSON.parse(await readFile(artifact('product-experience-contract.json'), 'utf8'));
    expect(productContract).toMatchObject({ schemaVersion: 2, sourceArtifact: { kind: 'reference-fidelity' } });
    await factory.approveHumanPlaytest(runId, {
      schemaVersion: 1, passed: true, sessionId: 'CORE_DEMO', buildHash: fidelityGate.buildHash,
      inputMode: 'touch', notes: ['synthetic orchestration approval'], evidence: [image.path], approvedAt: new Date().toISOString(),
    });
    const accepted = await factory.resume(runId);
    expect(accepted).toMatchObject({ stage: 'COMPLETED', status: 'completed' });
    expect(JSON.parse(await readFile(artifact('reference-fidelity-gate.json'), 'utf8')).passed).toBe(true);
  });

  it('runs the recording-level comparison during preview QA and binds it to the exact build', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'factory-recording-level-test-'));
    roots.push(root);
    const seed = path.join(root, 'reference-seed.yaml');
    const sourceSeed = path.join(process.cwd(), 'examples/seeds/relic-revival-workshop.yaml');
    await writeFile(seed, (await readFile(sourceSeed, 'utf8')).replace('researchFiles: []', 'researchFiles: [input/reference-report.txt]').replace('preferences:\n', 'identity:\n  canonicalGameId: relic-revival\n  aliases: []\n  variantId: relic-revival-preview\n  variantOf: relic-revival\npreferences:\n'));
    let qaCalls = 0;
    const factory = createFactory({
      root,
      mode: 'mock',
      qaMode: 'stub',
      enforceStageContracts: true,
      enforceExplicitStageContracts: true,
      allowSyntheticReferenceAnalysisForTests: true,
      referenceFrameExtractor: async ({ outputDir }) => {
        await import('node:fs/promises').then(({ mkdir }) => mkdir(outputDir, { recursive: true }));
        const frames = await Promise.all(Array.from({ length: 6 }, async (_, index) => {
          const fileName = `frame-${index}.png`;
          await writeFile(path.join(outputDir, fileName), `frame ${index}`);
          return { index, requestedMs: index * 125, actualMs: index * 125, fileName };
        }));
        await writeFile(path.join(outputDir, 'contact.png'), 'contact');
        return { durationMs: 626, width: 1100, height: 720, frames, contactSheets: [{ index: 0, firstFrameIndex: 0, lastFrameIndex: 5, fileName: 'contact.png' }] };
      },
      referenceLevelQaRunner: async ({ contract, runtimeData, buildHash, viewport, runRoot }) => {
        qaCalls += 1;
        const observedRelationIds = qaCalls === 1 ? [] : contract.spatialRelations.map((relation) => relation.id);
        const screenshotPath = 'screenshots/reference-level/integration.png';
        const eventPath = 'logs/reference-level/integration.json';
        await import('node:fs/promises').then(({ mkdir }) => Promise.all([mkdir(path.join(runRoot, 'screenshots/reference-level'), { recursive: true }), mkdir(path.join(runRoot, 'logs/reference-level'), { recursive: true })]));
        await writeFile(path.join(runRoot, screenshotPath), 'recording level screenshot');
        await writeFile(path.join(runRoot, eventPath), 'recording level trace');
        const checkpoints: ReferenceLevelRuntimeTrace['checkpoints'] = contract.checkpointSequence.map((expected, checkpointIndex) => ({
          sourceCheckpointId: expected.id,
          phase: expected.phase,
          objectStates: contract.requiredObjects.map((object) => {
            const placement = contract.placementRules.find((rule) => rule.checkpointId === expected.id && rule.semanticId === object.semanticId);
            return {
              semanticId: object.semanticId,
              role: object.role,
              lifecycle: object.lifecycleOrder[Math.min(checkpointIndex, object.lifecycleOrder.length - 1)]!,
              visible: expected.requiredVisibleObjectIds.includes(object.semanticId),
              ...(placement ? { placement: { horizontalBand: placement.horizontalBand, verticalBand: placement.verticalBand, widthBand: placement.widthBand, heightBand: placement.heightBand, orientationBand: placement.orientationBand } } : {}),
            };
          }),
          observedRelationIds,
          cameraMode: contract.cameraSequence.find((camera) => camera.checkpointId === expected.id)?.mode ?? 'unknown',
          visibleFeedbackIds: expected.visibleFeedbackIds,
        }));
        for (const object of contract.requiredObjects) for (const lifecycle of object.lifecycleOrder) checkpoints.push({ sourceCheckpointId: contract.interactionSequence[0]?.toCheckpointId ?? contract.terminal!.checkpointId, phase: 'interaction', objectStates: [{ semanticId: object.semanticId, role: object.role, lifecycle, visible: false }], observedRelationIds: [], cameraMode: 'unknown', visibleFeedbackIds: [] });
        const trace = ReferenceLevelRuntimeTraceSchema.parse({
          schemaVersion: 1, artifactType: 'reference-level-runtime-trace', targetRunId: contract.targetRunId, targetGame: contract.targetGame, workspace: contract.workspace,
          contractHash: sha256Text(JSON.stringify(contract)), buildHash, viewport, startedFromReset: true, naturalInputOnly: true,
          actions: contract.interactionSequence.map((action) => ({ order: action.order, actionId: action.actionId, kind: action.kind, targetObjectId: action.targetObjectId, naturalInput: true, stateChanged: true, observedCheckpointId: action.toCheckpointId })),
          checkpoints: checkpoints.map((checkpoint) => ({ ...checkpoint, runtimeBinding: {
            runtimeDataHash: runtimeData.runtimeDataHash, contractHash: runtimeData.sourceContract.sha256,
            resolutionHash: runtimeData.production.resolutionHash, dataPath: 'src/generated/reference-level.json',
          } })),
          terminal: { reached: true, result: contract.terminal!.result, causeVisible: true, settlementVisible: true },
          replay: { actionId: contract.replay!.actionId, returnedToCheckpointId: contract.replay!.returnsToCheckpointId, naturalInput: true },
          screenshots: [{ path: screenshotPath, sha256: sha256Text('recording level screenshot') }], trace: { path: eventPath, sha256: sha256Text('recording level trace') },
          reviewer: 'QAAgent', authorIndependent: true, observedAt: new Date(0).toISOString(),
        });
        return { trace, gate: evaluateReferenceLevelRuntimeTrace(contract, trace, runtimeData) };
      },
    });
    const runId = await factory.newRun(seed);
    const runRoot = path.join(root, 'runs', runId);
    const workspace = path.join(runRoot, 'workspace/game');
    await writeFile(path.join(runRoot, 'input/reference-report.txt'), 'Observed level flow: ready, tap, interaction, settlement, replay.\n');
    const videoPath = path.join(runRoot, 'reference-evidence/incoming/level.mp4');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(path.dirname(videoPath), { recursive: true }));
    await writeFile(videoPath, 'verified recording');
    const videoHash = createHash('sha256').update('verified recording').digest('hex');
    await writeFile(path.join(runRoot, 'reference-evidence/manifest.json'), JSON.stringify({
      schemaVersion: 1, targetGame: 'relic-revival-preview', workspace,
      entries: [{ id: 'level-recording', sourcePath: videoPath, storedPath: 'reference-evidence/incoming/level.mp4', purpose: 'gameplay-reference', sha256: videoHash, targetGame: 'relic-revival-preview', workspace, identityStatus: 'VERIFIED_TARGET', reviewStatus: 'VERIFIED', usableAsEvidence: true }],
    }));

    expect(await factory.run(runId)).toMatchObject({ stage: 'WAITING_FOR_REFERENCE_APPROVAL', status: 'waiting' });
    await factory.approveReference(runId, { decision: 'APPROVE', notes: 'recording semantics approved' });
    const paused = await factory.resume(runId);

    expect(paused).toMatchObject({ stage: 'QA', status: 'waiting' });
    expect(qaCalls).toBe(2);
    expect(paused.fixAttempts).toBe(1);
    expect(paused.stages.FIX?.status).toBe('completed');
    await expect(readFile(path.join(runRoot, 'artifacts/reference-level-runtime-data.json'), 'utf8')).resolves.toContain('reference-level-runtime-data');
    const runtimeData = JSON.parse(await readFile(path.join(runRoot, 'artifacts/reference-level-runtime-data.json'), 'utf8'));
    expect(runtimeData).toMatchObject({ targetRunId: runId, targetGame: 'relic-revival-preview', workspace });
    expect(JSON.parse(await readFile(path.join(workspace, 'src/generated/reference-level.json'), 'utf8'))).toEqual(runtimeData);
    expect(paused.stages.FULL_BUILD?.inputArtifacts).toContain('artifacts/reference-level-runtime-data.json');
    expect(paused.stages.QA?.inputArtifacts).toContain('artifacts/reference-level-runtime-data.json');
    expect(JSON.parse(await readFile(path.join(runRoot, 'artifacts/reference-level-comparison-gate.json'), 'utf8'))).toMatchObject({ passed: true });
    expect(JSON.parse(await readFile(path.join(runRoot, 'artifacts/qa-report.json'), 'utf8'))).toMatchObject({
      checks: expect.arrayContaining([expect.objectContaining({ name: 'recording-level-comparison', passed: true })]),
    });
    const runtimeArtifact = path.join(runRoot, 'artifacts/reference-level-runtime-data.json');
    const edited = { ...runtimeData, targetGame: 'Another game' };
    await writeFile(runtimeArtifact, JSON.stringify(edited));
    const resumed = await factory.resume(runId);
    expect(resumed).toMatchObject({ stage: 'FULL_BUILD', status: 'waiting' });
    expect(resumed.stages.FULL_BUILD?.evidence.join(' ')).toContain('requires migration');
    expect(qaCalls).toBe(2);
    expect(JSON.parse(await readFile(runtimeArtifact, 'utf8'))).toEqual(edited);
    expect(JSON.parse(await readFile(path.join(workspace, 'src/generated/reference-level.json'), 'utf8'))).toEqual(runtimeData);
  });

  it('builds and independently reviews three playable prototypes before any IAA or art work', async () => {
    const { factory, seed, root } = await fixture();
    const runId = await factory.newRun(seed);
    const paused = await factory.run(runId);
    expect(paused.stage).toBe('WAITING_FOR_PROTOTYPE_APPROVAL');
    for (const stage of ['COMPETITOR_RESEARCH', 'IDEA_GENERATION', 'LOW_COST_FILTER', 'PROTOTYPE_SELECTION', 'BUILD_3_PROTOTYPES', 'PLAYTEST_TOURNAMENT', 'WINNER_SELECTION']) {
      expect(paused.stages[stage]?.status).toBe('completed');
    }
    expect(paused.stages.IAA_REVIEW).toBeUndefined();
    expect(paused.stages.ART_DIRECTIONS).toBeUndefined();
    for (const file of ['idea-generation.batch-1.json', 'low-cost-filter.batch-1.json', 'prototype-selection.batch-1.json', 'prototype-build-report.batch-1.json', 'playtest-tournament.batch-1.json', 'winner-selection.batch-1.json']) {
      await expect(readFile(path.join(root, 'runs', runId, 'artifacts', file), 'utf8')).resolves.toBeTruthy();
    }
    const humanReview = JSON.parse(await readFile(path.join(root, 'runs', runId, 'human/prototype-review.json'), 'utf8')) as { prototypes: unknown[]; recommendation: string; rationale: string };
    expect(humanReview).toMatchObject({ recommendation: 'WINNER_A' });
    expect(humanReview.prototypes).toHaveLength(3);
    expect(humanReview.rationale).toBeTruthy();
    for (const slot of ['a', 'b', 'c']) await expect(readFile(path.join(root, 'runs', runId, `workspace/prototype-${slot}/dist/index.html`), 'utf8')).resolves.toContain('<!doctype html>');
  });

  it('accepts NONE and automatically tries only one additional batch', async () => {
    class NoWinnerAgentProvider extends MockAgentProvider {
      override async generateWinnerSelection(tournament: Parameters<MockAgentProvider['generateWinnerSelection']>[0]) { return { value: { schemaVersion: 1, batch: tournament.batch, decision: 'NONE', selectedIdeaId: null, rationale: 'Every prototype became rote after five inputs.' }, metrics: { provider: 'test', model: 'deterministic', calls: 0 } }; }
    }
    const { seed, root } = await fixture();
    const factory = createFactory({ root, mode: 'mock', qaMode: 'stub', agentProvider: new NoWinnerAgentProvider() });
    const runId = await factory.newRun(seed);
    const stopped = await factory.run(runId);
    expect(stopped).toMatchObject({ stage: 'NO_PROTOTYPE_WINNER', status: 'completed', prototypeBatch: 2 });
    expect(stopped.stages.WINNER_SELECTION).toMatchObject({ status: 'completed', attempts: 2, evidence: expect.arrayContaining(['decision:NONE']) });
    await expect(readFile(path.join(root, 'runs', runId, 'artifacts/game-blueprint.json'), 'utf8')).rejects.toThrow();
    const resumed = await factory.resume(runId);
    expect(resumed.stages.WINNER_SELECTION!.attempts).toBe(2);
  });

  it('pauses normally for art approval and resumes the same run', async () => {
    const { factory, seed, root } = await fixture();
    const runId = await factory.newRun(seed);
    const paused = await factory.run(runId);
    expect(paused.stage).toBe('WAITING_FOR_PROTOTYPE_APPROVAL');
    expect(paused.status).toBe('waiting');
    await factory.approvePrototype(runId, { decision: 'APPROVE', notes: '' });
    const artPaused = await factory.resume(runId);
    expect(artPaused.stage).toBe('WAITING_FOR_ART_APPROVAL');
    expect(artPaused.stages.OPEN_SOURCE_RESEARCH?.status).toBe('completed');
    expect(artPaused.stages.IAA_REVIEW?.status).toBe('completed');
    expect(Date.parse(artPaused.stages.OPEN_SOURCE_RESEARCH!.finishedAt!)).toBeLessThanOrEqual(Date.parse(artPaused.stages.IAA_REVIEW!.startedAt!));
    expect(artPaused.stages.IAA_REVIEW!.inputArtifacts).toContain('artifacts/open-source-research.json');
    await expect(readFile(path.join(root, 'runs', runId, 'artifacts/open-source-research.json'), 'utf8')).resolves.toBeTruthy();
    const blueprint = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/game-blueprint.json'), 'utf8')) as { targetPlatforms: string[] };
    expect(blueprint.targetPlatforms).toEqual(['wechat-minigame', 'douyin-minigame', 'taptap-minigame']);
    await writeFile(path.join(root, 'runs', runId, 'human/art-approval.yaml'), 'selected_direction: direction_b\nkeep: [overall_palette]\nchange: [reduce_saturation]\nnotes: [UI要简洁]\n');
    const done = await factory.resume(runId);
    expect(done.status).toBe('completed');
    expect(done.stage).toBe('COMPLETED');
    expect(Date.parse(done.stages.WAITING_FOR_ART_APPROVAL!.finishedAt!)).toBeLessThanOrEqual(Date.parse(done.stages.STYLE_LOCK!.startedAt!));
  });

  it('is idempotent after completion', async () => {
    const { factory, seed, root } = await fixture();
    const runId = await factory.newRun(seed);
    await factory.run(runId);
    await factory.approvePrototype(runId, { decision: 'APPROVE', notes: '' });
    await factory.resume(runId);
    await writeFile(path.join(root, 'runs', runId, 'human/art-approval.yaml'), 'selected_direction: direction_a\n');
    const first = await factory.resume(runId);
    const attempts = first.stages.RELEASE!.attempts;
    const second = await factory.run(runId);
    expect(second.stages.RELEASE!.attempts).toBe(attempts);
  });

  it('retries a failed stage without erasing its attempt history', async () => {
    const { factory, seed, root } = await fixture();
    const runId = await factory.newRun(seed);
    await factory.run(runId);
    await factory.approvePrototype(runId, { decision: 'APPROVE', notes: '' });
    await factory.resume(runId);
    const approval = path.join(root, 'runs', runId, 'human/art-approval.yaml');
    await writeFile(approval, 'selected_direction: direction_z\n');
    await expect(factory.resume(runId)).rejects.toThrow();
    const failed = await factory.status(runId);
    expect(failed.stage).toBe('FAILED');
    expect(failed.stages.STYLE_LOCK).toMatchObject({ status: 'failed', attempts: 1 });

    await writeFile(approval, 'selected_direction: direction_a\n');
    const recovered = await factory.retry(runId, 'STYLE_LOCK');
    expect(recovered.status).toBe('completed');
    expect(recovered.stages.STYLE_LOCK).toMatchObject({ status: 'completed', attempts: 2 });
  });

  it('repeated resume after completion does not mutate state or release output', async () => {
    const { factory, seed, root } = await fixture();
    const runId = await factory.demo(seed);
    const runRoot = path.join(root, 'runs', runId);
    const digest = async (file: string) => createHash('sha256').update(await readFile(file)).digest('hex');
    const stateFile = path.join(runRoot, 'state.json');
    const releaseFile = path.join(runRoot, 'release-candidate/release-manifest.json');
    const before = [await digest(stateFile), await digest(releaseFile)];
    await factory.resume(runId);
    await factory.resume(runId);
    expect([await digest(stateFile), await digest(releaseFile)]).toEqual(before);
  });

  it('validates every mock agent artifact and packages a complete candidate', async () => {
    const { factory, seed, root } = await fixture();
    const runId = await factory.demo(seed);
    const state = await factory.status(runId);
    const productionLine = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/production-line-contract.json'), 'utf8')) as { line: string; primaryProfile: string };
    expect(productionLine).toMatchObject({ line: 'idle-management', primaryProfile: 'STRATEGIC_SYSTEM' });
    for (const stage of ['COMPETITOR_RESEARCH', 'IDEA_GENERATION', 'LOW_COST_FILTER', 'PROTOTYPE_SELECTION', 'BUILD_3_PROTOTYPES', 'PLAYTEST_TOURNAMENT', 'WINNER_SELECTION', 'OPEN_SOURCE_RESEARCH', 'IAA_REVIEW', 'ART_DIRECTIONS', 'STYLE_LOCK', 'ASSETS', 'FULL_BUILD', 'QA', 'RELEASE']) expect(state.stages[stage]?.status).toBe('completed');
    const releaseRoot = path.join(root, 'runs', runId, 'release-candidate');
    const buildReport = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/build-report.json'), 'utf8')) as { verification: string[] };
    expect(buildReport.verification).toEqual(expect.arrayContaining(['contract:test-api-7', 'save:versioned']));
    for (const file of ['release-manifest.json', 'web/index.html', 'reports/build-report.json', 'reports/qa-report.json']) await expect(readFile(path.join(releaseRoot, file), 'utf8')).resolves.toBeTruthy();
    const qualityMatrix = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/quality-gate-matrix.json'), 'utf8')) as { dimensions?: unknown[]; passed?: boolean };
    expect(qualityMatrix.dimensions).toHaveLength(7);
    expect(typeof qualityMatrix.passed).toBe('boolean');
  });

  it('repackages downstream release artifacts when QA is explicitly retried', async () => {
    const { factory, seed, root } = await fixture();
    const runId = await factory.demo(seed);
    const before = await factory.status(runId);
    const releaseAttempts = before.stages.RELEASE!.attempts;
    const runRoot = path.join(root, 'runs', runId);
    const previousQa = await readFile(path.join(runRoot, 'artifacts/qa-report.json'), 'utf8');

    const retried = await factory.retry(runId, 'QA');

    expect(retried).toMatchObject({ stage: 'COMPLETED', status: 'completed' });
    expect(retried.stages.QA!.attempts).toBe(before.stages.QA!.attempts + 1);
    expect(retried.stages.RELEASE!.attempts).toBe(releaseAttempts + 1);
    const archiveRoot = path.join(runRoot, 'history/factory-migrations');
    const retryArchives = (await readdir(archiveRoot)).filter((name) => name.startsWith('stage-retry-'));
    expect(retryArchives).toHaveLength(1);
    expect(await readFile(path.join(archiveRoot, retryArchives[0]!, 'files/artifacts/qa-report.json'), 'utf8')).toBe(previousQa);
  });

  it('preserves the run-wide repair count when the build stage is retried', async () => {
    const { factory, seed, root } = await fixture();
    const runId = await factory.demo(seed);
    const state = await factory.status(runId);
    state.fixAttempts = 3;
    await writeFile(path.join(root, 'runs', runId, 'state.json'), JSON.stringify(state));
    await factory.retry(runId, 'FULL_BUILD').catch(() => undefined);
    expect((await factory.status(runId)).fixAttempts).toBe(3);
  });

  it('uses recorded execution intervals instead of run age for a resumed cost budget', async () => {
    const { factory, seed, root } = await fixture();
    const runId = await factory.demo(seed);
    const state = await factory.status(runId);
    state.createdAt = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
    const runRoot = path.join(root, 'runs', runId);
    await writeFile(path.join(runRoot, 'state.json'), JSON.stringify(state));
    const resumed = await factory.retry(runId, 'QA');
    expect(resumed.stage).toBe('COMPLETED');
    const usage = JSON.parse(await readFile(path.join(runRoot, 'artifacts/cost-usage.json'), 'utf8'));
    expect(usage.wallClockMinutes).toBeLessThan(30);
  });
});
