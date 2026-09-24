import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFactory } from '../../src/factory.js';
import { CodexImagegenProvider } from '../../src/providers/codex-imagegen.js';
import { MockImageProvider } from '../../src/providers/mock.js';
import type { CodexExecRequest, CodexExecResult } from '../../src/providers/codex-cli.js';

const roots: string[] = [];
const targetPlatforms = ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'] as const;
const blueprint = { schemaVersion: 1 as const, gameId: 'codex-smoke', title: 'Codex Smoke', theme: 'spirit market', runtime: 'web-lite' as const, template: 'idle-shop-v1' as const, targetPlatforms: [...targetPlatforms], concept: 'A tiny spirit shop', coreLoop: ['arrive', 'produce', 'deliver', 'reward'], content: { productName: 'tea', customerName: 'spirit', currencyName: 'coin' }, balance: { startingCurrency: 0, orderReward: 2, baseUpgradeCost: 4 }, preferences: {} };
const baseDirection = { id: 'direction_a' as const, name: 'Ink', summary: 'ink silhouettes and layered paper stalls', visualKeywords: ['ink', 'paper'], palette: ['#112233'], characterStyle: 'paper silhouette', environmentStyle: 'layered ink market', uiStyle: 'seal cards', iconConcept: 'moon seal', forbiddenElements: ['logos'], productionComplexity: 'low' as const, previewPrompt: 'original ink spirit market' };
const directions = { directions: [baseDirection, { ...baseDirection, id: 'direction_b' as const, name: 'Clay', summary: 'rounded clay figures and diorama stalls', visualKeywords: ['clay'], characterStyle: 'rounded clay', environmentStyle: 'diorama', uiStyle: 'soft tabs', iconConcept: 'clay bowl', previewPrompt: 'original clay spirit market' }, { ...baseDirection, id: 'direction_c' as const, name: 'Neon', summary: 'angular neon figures and graphic street grids', visualKeywords: ['neon'], characterStyle: 'angular graphic', environmentStyle: 'street grid', uiStyle: 'sharp panels', iconConcept: 'neon ticket', previewPrompt: 'original neon spirit market' }, { ...baseDirection, id: 'direction_d' as const, name: 'Wood', summary: 'woodcut figures and carved architectural layers', visualKeywords: ['woodcut'], characterStyle: 'carved figures', environmentStyle: 'woodblock stalls', uiStyle: 'stamp frames', iconConcept: 'wood coin', previewPrompt: 'original woodcut spirit market' }] };
const research = { schemaVersion: 1 as const, market: 'casual idle shops', competitors: [
  { name: 'A', positioning: 'short sessions', coreLoop: ['serve', 'upgrade'], monetization: ['rewarded'], strengths: ['clarity'], weaknesses: ['variety'] },
  { name: 'B', positioning: 'collection', coreLoop: ['collect', 'expand'], monetization: ['interstitial'], strengths: ['goals'], weaknesses: ['interruptions'] },
  { name: 'C', positioning: 'story market', coreLoop: ['serve', 'unlock'], monetization: ['rewarded'], strengths: ['theme'], weaknesses: ['cost'] },
], opportunities: ['compact sessions'], risks: ['crowded market'], differentiationThesis: 'Original supernatural market sessions.' };
const costReview = { schemaVersion: 1 as const, costBand: 'low' as const, prototypeDays: 2, productionWeeks: 2, teamSize: 1, assetEstimate: { characters: 4, environments: 1, ui: 8, audio: 6 }, technicalRisks: ['save recovery'], scopeCuts: ['one shop'], recommendation: 'proceed' as const, rationale: 'Fits the template.' };
const iaaReview = { schemaVersion: 1 as const, audienceFit: 'casual', sessionFit: 'medium' as const, placements: [{ format: 'rewarded' as const, trigger: 'optional boost', playerValue: 'shorter wait', frequencyCap: 'once per session' }], retentionRisk: 'low' as const, revenuePotential: 'medium' as const, complianceRisks: ['consent'], recommendation: 'test_cautiously' as const, rationale: 'Optional only.' };
const greenlight = { schemaVersion: 1 as const, decision: 'GO' as const, overallScore: 80, scores: { differentiation: 80, productionFeasibility: 90, iaaFit: 72, strategicFit: 78 }, reasons: ['Feasible differentiated test.'], blockers: [], requiredChanges: ['Cap ad frequency.'] };
const idea = (id: string) => ({ id, name: id, coreAction: 'route a visitor left or right', decisionIntervalSeconds: 12, decision: 'safe route or combo route', choiceDrivers: ['visitor trait'], pressure: 'queue overflow ends the run', firstDelight: 'first combo', secondRunVariation: 'traits are reseeded', growthMechanic: 'one modifier', randomVariation: 'seeded traits', majorSystems: ['routing', 'queue'], realDecision: true as const });
const ideas = { schemaVersion: 1 as const, batch: 1, theme: 'spirit market', ideas: ['idea_a', 'idea_b', 'idea_c', 'idea_d', 'idea_e', 'idea_f'].map(idea) };
const lowCostFilter = { schemaVersion: 1 as const, batch: 1, selectedIdeaIds: ['idea_a', 'idea_b', 'idea_c'], evaluations: ideas.ideas.map((item, index) => ({ ideaId: item.id, hasOneCoreAction: true, hasRealDecision: true, majorSystemCount: 2, prototypeMinutes: 45, verdict: index < 3 ? 'SELECT' as const : 'REJECT' as const, rationale: 'small greybox scope' })) };
const prototypeSelection = { schemaVersion: 1 as const, batch: 1, decision: 'BUILD_3' as const, selectedIdeaIds: lowCostFilter.selectedIdeaIds, rationale: 'worth minimal prototypes only', constraints: ['placeholder art'] };
const winner = { schemaVersion: 1 as const, batch: 1, decision: 'WINNER_A' as const, selectedIdeaId: 'idea_a', rationale: 'best repeated decision evidence' };
const openSourceResearch = { schemaVersion: 1 as const, targetPlatforms: [...targetPlatforms], queries: ['portable canvas mini game adapter'], candidates: [], outcome: 'NO_SUITABLE_CANDIDATE' as const, selectedCandidateIds: [], rationale: 'No verified three-platform candidate.', researchedAt: new Date().toISOString() };

function result(label: string, output: unknown, threadId = `thread-${label}`): CodexExecResult {
  return { output, threadId, attempts: 1, events: [], completed: true, failed: false, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, errors: [], stdout: '', stderr: '' };
}

class FakeExecutor {
  labels: string[] = [];
  async assertChatGptLogin() { return { method: 'chatgpt' as const, message: 'Logged in using ChatGPT' }; }
  async execute(request: CodexExecRequest) {
    this.labels.push(request.label);
    if (request.label === 'COMPETITOR_RESEARCH') return result(request.label, research);
    if (request.label === 'IDEA_GENERATION') return result(request.label, ideas);
    if (request.label === 'LOW_COST_FILTER') return result(request.label, lowCostFilter);
    if (request.label === 'PROTOTYPE_SELECTION') return result(request.label, prototypeSelection);
    if (request.label === 'WINNER_SELECTION') return result(request.label, winner);
    if (request.label === 'OPEN_SOURCE_RESEARCH') return result(request.label, openSourceResearch);
    if (request.label === 'PRODUCTION_COST_REVIEW') return result(request.label, costReview);
    if (request.label === 'IAA_REVIEW') return result(request.label, iaaReview);
    if (request.label === 'GREENLIGHT_GATE') return result(request.label, greenlight);
    if (request.label === 'BLUEPRINT') return result(request.label, blueprint);
    if (request.label === 'ART_DIRECTIONS') return result(request.label, directions);
    if (request.label === 'STYLE_LOCK') return result(request.label, { schemaVersion: 1, directionId: 'direction_a', direction: baseDirection, kept: [], changes: [], notes: ['approved'], lockedAt: new Date().toISOString() });
    if (request.label === 'BUILD') {
      const packageFile = path.join(request.cwd, 'package.json');
      const packageJson = JSON.parse(await readFile(packageFile, 'utf8')) as { scripts: Record<string, string> };
      packageJson.scripts.test = 'node -e ""';
      packageJson.scripts.typecheck = 'node -e ""';
      await writeFile(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`);
    }
    return result(request.label, 'completed');
  }
}

async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), 'factory-codex-account-'));
  roots.push(root);
  const seed = path.join(root, 'seed.yaml');
  await writeFile(seed, 'title: Codex Smoke\ntheme: spirit market\ntemplate: idle-shop-v1\ndesignMode: prototype_tournament\npreferences: {}\n');
  return { root, seed };
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('codex-account orchestration', () => {
  it.each(['builder-call', 'build-report', 'repair-history'] as const)('rejects pre-build research reprojection after %s without mutating the run', async (kind) => {
    const { root, seed } = await setup();
    const executor = new FakeExecutor();
    const factory = createFactory({ root, mode: 'codex-account', qaMode: 'stub', codexExecutor: executor });
    const runId = await factory.newRun(seed);
    const state = await factory.status(runId);
    const record = {
      status: 'completed' as const, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), attempts: 2,
      inputArtifacts: [], outputArtifacts: [], errors: [], evidence: [], providerCalls: { agent: 2, image: 0 }, tokenUsage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 },
    };
    state.stages.REFERENCE_DEEP_RESEARCH = { ...record, stage: 'REFERENCE_DEEP_RESEARCH' };
    if (kind === 'builder-call') state.stages.FULL_BUILD = { ...record, stage: 'FULL_BUILD', attempts: 1, providerCalls: { agent: 1, image: 0 } };
    if (kind === 'repair-history') state.fixAttempts = 2;
    const runRoot = path.join(root, 'runs', runId);
    if (kind === 'build-report') await writeFile(path.join(runRoot, 'artifacts/build-report.json'), '{"preserve":"report"}');
    const stateFile = path.join(runRoot, 'state.json');
    const before = JSON.stringify(state);
    await writeFile(stateFile, before);

    await expect(factory.recoverReferenceResearch(runId, { reprojectCompleted: true })).rejects.toThrow('requires a pre-build run');
    expect(await readFile(stateFile, 'utf8')).toBe(before);
    expect(executor.labels).toEqual([]);
  });

  it('rejects resuming a codex-account run from mock mode before running a Mock stage', async () => {
    const { root, seed } = await setup();
    const codexFactory = createFactory({ root, repositoryRoot: process.cwd(), mode: 'codex-account', qaMode: 'stub', codexExecutor: new FakeExecutor(), previewImageProvider: new MockImageProvider(), assetImageProvider: new MockImageProvider() });
    const runId = await codexFactory.newRun(seed);
    const mockFactory = createFactory({ root, repositoryRoot: process.cwd(), mode: 'mock', qaMode: 'stub' });

    await expect(mockFactory.resume(runId)).rejects.toThrow(/provider mode.*codex-account.*mock/i);
    await expect(readFile(path.join(root, 'runs', runId, 'artifacts/game-blueprint.json'))).rejects.toThrow();
  });

  it('rejects retrying a codex-account run from mock mode before running a Mock stage', async () => {
    const { root, seed } = await setup();
    const codexFactory = createFactory({ root, repositoryRoot: process.cwd(), mode: 'codex-account', qaMode: 'stub', codexExecutor: new FakeExecutor(), previewImageProvider: new MockImageProvider(), assetImageProvider: new MockImageProvider() });
    const runId = await codexFactory.newRun(seed);
    const mockFactory = createFactory({ root, repositoryRoot: process.cwd(), mode: 'mock', qaMode: 'stub' });

    await expect(mockFactory.retry(runId, 'IDEA_GENERATION')).rejects.toThrow(/provider mode.*codex-account.*mock/i);
    await expect(readFile(path.join(root, 'runs', runId, 'artifacts/game-blueprint.json'))).rejects.toThrow();
  });

  it('rejects verify-build for a codex-account run from mock mode', async () => {
    const { root, seed } = await setup();
    const codexFactory = createFactory({ root, repositoryRoot: process.cwd(), mode: 'codex-account', qaMode: 'stub', codexExecutor: new FakeExecutor(), previewImageProvider: new MockImageProvider(), assetImageProvider: new MockImageProvider() });
    const runId = await codexFactory.newRun(seed);
    const stateFile = path.join(root, 'runs', runId, 'state.json');
    const state = JSON.parse(await readFile(stateFile, 'utf8')) as { stage: string; status: string; stages: Record<string, unknown> };
    state.stage = 'FAILED';
    state.status = 'failed';
    state.stages.FULL_BUILD = {
      stage: 'FULL_BUILD', status: 'failed', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), attempts: 1,
      inputArtifacts: [], outputArtifacts: [], errors: ['builder failed'], evidence: [], providerCalls: { agent: 0, image: 0 }, tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
    await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`);
    const mockFactory = createFactory({ root, repositoryRoot: process.cwd(), mode: 'mock', qaMode: 'stub' });

    await expect(mockFactory.verifyBuild(runId)).rejects.toThrow(/provider mode.*codex-account.*mock/i);
  });

  it('pauses for manual Codex imagegen and will not continue while images are missing', async () => {
    const { root, seed } = await setup();
    const executor = new FakeExecutor();
    const factory = createFactory({ root, repositoryRoot: process.cwd(), mode: 'codex-account', qaMode: 'stub', codexExecutor: executor, previewImageProvider: new CodexImagegenProvider(), assetImageProvider: new CodexImagegenProvider() });
    const runId = await factory.newRun(seed);

    const prototypes = await factory.run(runId);
    expect(prototypes.stage).toBe('WAITING_FOR_PROTOTYPE_APPROVAL');
    expect(prototypes.stages.BUILD_3_PROTOTYPES?.providerCalls.agent).toBe(3);
    await factory.approvePrototype(runId, { decision: 'APPROVE', notes: '' });
    const paused = await factory.resume(runId);
    expect(paused).toMatchObject({ stage: 'WAITING_FOR_CODEX_IMAGEGEN', status: 'waiting', providerMode: 'codex-account' });
    expect(executor.labels).toEqual(['COMPETITOR_RESEARCH', 'IDEA_GENERATION', 'LOW_COST_FILTER', 'PROTOTYPE_SELECTION', 'PROTOTYPE_A', 'PROTOTYPE_B', 'PROTOTYPE_C', 'WINNER_SELECTION', 'OPEN_SOURCE_RESEARCH', 'IAA_REVIEW', 'BLUEPRINT', 'ART_DIRECTIONS']);
    expect((await readFile(path.join(root, 'runs', runId, 'art-review/art-imagegen-task.md'), 'utf8')).match(/\$imagegen/g)).toHaveLength(4);

    const pausedAgain = await factory.resume(runId);
    expect(pausedAgain.stage).toBe('WAITING_FOR_CODEX_IMAGEGEN');
    expect(executor.labels.at(-1)).toBe('ART_DIRECTIONS');
  });

  it('fails clearly when ChatGPT login is unavailable and never falls back to Mock', async () => {
    const { root, seed } = await setup();
    const executor = new FakeExecutor();
    executor.assertChatGptLogin = async () => { throw new Error('Codex CLI is not logged in with ChatGPT; run codex login'); };
    const factory = createFactory({ root, mode: 'codex-account', qaMode: 'stub', codexExecutor: executor });
    const runId = await factory.newRun(seed);

    await expect(factory.run(runId)).rejects.toThrow('run codex login');
    await expect(readFile(path.join(root, 'runs', runId, 'artifacts/game-blueprint.json'))).rejects.toThrow();
  });

  it('records the real Builder Codex thread id for a later resume', async () => {
    const { root, seed } = await setup();
    const executor = new FakeExecutor();
    const explicitTestImages = new MockImageProvider();
    const factory = createFactory({ root, repositoryRoot: process.cwd(), mode: 'codex-account', qaMode: 'stub', codexExecutor: executor, previewImageProvider: explicitTestImages, assetImageProvider: explicitTestImages });
    const runId = await factory.newRun(seed);
    await factory.run(runId);
    await factory.approvePrototype(runId, { decision: 'APPROVE', notes: '' });
    await factory.resume(runId);
    await factory.approve(runId, { direction: 'direction_a', notes: 'approved' });

    const completed = await factory.resume(runId);

    expect(completed.codexThreadId).toBe('thread-BUILD');
    expect(executor.labels).toContain('BUILD');
    expect(completed.stages.FULL_BUILD).toMatchObject({
      providerCalls: { agent: 1, image: 0 },
      tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });
    const usage = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/provider-usage.json'), 'utf8')) as { stages: Record<string, unknown> };
    expect(usage.stages.FULL_BUILD).toMatchObject({ providerCalls: { agent: 1, image: 0 }, tokenUsage: { totalTokens: 2 } });
  });

  it('re-verifies a completed Builder workspace after a factory-side verification failure without another Codex call', async () => {
    const { root, seed } = await setup();
    const executor = new FakeExecutor();
    const explicitTestImages = new MockImageProvider();
    const factory = createFactory({ root, repositoryRoot: process.cwd(), mode: 'codex-account', qaMode: 'stub', codexExecutor: executor, previewImageProvider: explicitTestImages, assetImageProvider: explicitTestImages });
    const runId = await factory.newRun(seed);
    await factory.run(runId);
    await factory.approvePrototype(runId, { decision: 'APPROVE', notes: '' });
    await factory.resume(runId);
    await factory.approve(runId, { direction: 'direction_a', notes: 'approved' });
    await factory.resume(runId);

    const runRoot = path.join(root, 'runs', runId);
    const stateFile = path.join(runRoot, 'state.json');
    const state = JSON.parse(await readFile(stateFile, 'utf8')) as { stage: string; status: string; codexThreadId?: string; stages: Record<string, { status: string; errors: string[] }> };
    state.stage = 'FAILED';
    state.status = 'failed';
    delete state.codexThreadId;
    state.stages.FULL_BUILD!.status = 'failed';
    state.stages.FULL_BUILD!.errors.push('factory verifier false negative');
    for (const stage of ['QA', 'FIX', 'RELEASE', 'COMPLETED']) delete state.stages[stage];
    await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`);
    await mkdir(path.join(runRoot, 'logs/codex'), { recursive: true });
    await writeFile(path.join(runRoot, 'logs/codex/BUILD.attempt-1.stdout.jsonl'), '{"type":"thread.started","thread_id":"recovered-builder-thread"}\n{"type":"turn.completed","usage":{}}\n');
    const buildCallsBefore = executor.labels.filter((label) => label === 'BUILD').length;

    const recovered = await factory.verifyBuild(runId);

    expect(recovered).toMatchObject({ stage: 'COMPLETED', status: 'completed', codexThreadId: 'recovered-builder-thread' });
    expect(executor.labels.filter((label) => label === 'BUILD')).toHaveLength(buildCallsBefore);
    const report = JSON.parse(await readFile(path.join(runRoot, 'artifacts/build-report.json'), 'utf8')) as { verification: string[] };
    expect(report.verification).toEqual(expect.arrayContaining(['test:passed', 'typecheck:passed']));
  });

  it('refreshes a completed build report and downstream QA/release without another Codex call', async () => {
    const { root, seed } = await setup();
    const executor = new FakeExecutor();
    const explicitTestImages = new MockImageProvider();
    const factory = createFactory({ root, repositoryRoot: process.cwd(), mode: 'codex-account', qaMode: 'stub', codexExecutor: executor, previewImageProvider: explicitTestImages, assetImageProvider: explicitTestImages });
    const runId = await factory.newRun(seed);
    await factory.run(runId);
    await factory.approvePrototype(runId, { decision: 'APPROVE', notes: '' });
    await factory.resume(runId);
    await factory.approve(runId, { direction: 'direction_a', notes: 'approved' });
    const completed = await factory.resume(runId);
    const buildCallsBefore = executor.labels.filter((label) => label === 'BUILD').length;
    const runRoot = path.join(root, 'runs', runId);
    const stateFile = path.join(runRoot, 'state.json');
    const storedState = JSON.parse(await readFile(stateFile, 'utf8')) as { stages: Record<string, { providerCalls: { agent: number; image: number }; tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number } }> };
    storedState.stages.FULL_BUILD!.providerCalls.agent = 0;
    storedState.stages.FULL_BUILD!.tokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    storedState.stages.FIX = {
      stage: 'FIX', status: 'completed', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), attempts: 2,
      inputArtifacts: ['artifacts/qa-report.json'], outputArtifacts: ['workspace/game/dist/'], errors: [], evidence: ['fix-attempt:1'],
      providerCalls: { agent: 0, image: 0 }, tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    } as never;
    await writeFile(stateFile, `${JSON.stringify(storedState, null, 2)}\n`);
    await mkdir(path.join(runRoot, 'logs/codex'), { recursive: true });
    await writeFile(path.join(runRoot, 'logs/codex/BUILD.attempt-1.stdout.jsonl'), '{"type":"thread.started","thread_id":"thread-BUILD"}\n{"type":"turn.completed","usage":{"input_tokens":7,"output_tokens":3,"total_tokens":10}}\n');
    await writeFile(path.join(runRoot, 'logs/codex/FIX.attempt-1.stdout.jsonl'), '{"type":"thread.started","thread_id":"thread-BUILD"}\n{"type":"turn.completed","usage":{"input_tokens":11,"output_tokens":5,"total_tokens":16}}\n');

    const refreshed = await factory.verifyBuild(runId);

    expect(refreshed).toMatchObject({ stage: 'COMPLETED', status: 'completed', codexThreadId: 'thread-BUILD' });
    expect(refreshed.stages.FULL_BUILD!.attempts).toBe(completed.stages.FULL_BUILD!.attempts + 1);
    expect(refreshed.stages.QA!.attempts).toBe(completed.stages.QA!.attempts + 1);
    expect(refreshed.stages.RELEASE!.attempts).toBe(completed.stages.RELEASE!.attempts + 1);
    expect(refreshed.stages.FULL_BUILD).toMatchObject({ providerCalls: { agent: 1, image: 0 }, tokenUsage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 } });
    expect(refreshed.stages.FIX).toMatchObject({ providerCalls: { agent: 2, image: 0 }, tokenUsage: { inputTokens: 11, outputTokens: 5, totalTokens: 16 } });
    expect(refreshed.stages.FULL_BUILD!.evidence.some((item: string) => item.startsWith('model:'))).toBe(true);
    expect(refreshed.stages.FIX!.evidence.some((item: string) => item.startsWith('model:'))).toBe(true);
    expect(executor.labels.filter((label) => label === 'BUILD')).toHaveLength(buildCallsBefore);
  });
});
