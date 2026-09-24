import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createFactory } from '../../src/factory.js';
import { MockImageProvider } from '../../src/providers/mock.js';
import { OpenAIAgentProvider, OpenAIImageProvider, type ImageGenerationClient, type StructuredAgentRunner } from '../../src/providers/real.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));
const targetPlatforms = ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'] as const;
const blueprint = { schemaVersion: 1 as const, gameId: 'live-art', title: '妖怪夜市', theme: '夜市妖怪', runtime: 'web-lite' as const, template: 'idle-shop-v1' as const, targetPlatforms: [...targetPlatforms], concept: '妖怪夜市团子摊', coreLoop: ['customer', 'production', 'delivery', 'reward', 'upgrade'], content: { productName: '团子', customerName: '妖怪', currencyName: '灯币' }, balance: { startingCurrency: 0, orderReward: 5, baseUpgradeCost: 10 }, preferences: {} };
const research = { schemaVersion: 1 as const, market: 'casual idle shops', competitors: [
  { name: 'A', positioning: 'short sessions', coreLoop: ['serve', 'upgrade'], monetization: ['rewarded'], strengths: ['clarity'], weaknesses: ['variety'] },
  { name: 'B', positioning: 'collection', coreLoop: ['collect', 'expand'], monetization: ['interstitial'], strengths: ['goals'], weaknesses: ['interruptions'] },
  { name: 'C', positioning: 'story market', coreLoop: ['serve', 'unlock'], monetization: ['rewarded'], strengths: ['theme'], weaknesses: ['cost'] },
], opportunities: ['compact sessions'], risks: ['crowded market'], differentiationThesis: 'Original supernatural market sessions.' };
const iaaReview = { schemaVersion: 1 as const, audienceFit: 'casual', sessionFit: 'medium' as const, placements: [{ format: 'rewarded' as const, trigger: 'optional boost', playerValue: 'shorter wait', frequencyCap: 'once per session' }], retentionRisk: 'low' as const, revenuePotential: 'medium' as const, complianceRisks: ['consent'], recommendation: 'test_cautiously' as const, rationale: 'Optional only.' };
const makeIdea = (id: string) => ({ id, name: id, coreAction: 'route one visitor', decisionIntervalSeconds: 12, decision: 'safe or risky route', choiceDrivers: ['trait'], pressure: 'queue overflow', firstDelight: 'first combo', secondRunVariation: 'reseeded traits', growthMechanic: 'one modifier', randomVariation: 'seeded traits', majorSystems: ['routing', 'queue'], realDecision: true as const });
const ideas = { schemaVersion: 1 as const, batch: 1, theme: '夜市妖怪', ideas: ['idea_a', 'idea_b', 'idea_c', 'idea_d', 'idea_e', 'idea_f'].map(makeIdea) };
const lowCostFilter = { schemaVersion: 1 as const, batch: 1, selectedIdeaIds: ['idea_a', 'idea_b', 'idea_c'], evaluations: ideas.ideas.map((idea, index) => ({ ideaId: idea.id, hasOneCoreAction: true, hasRealDecision: true, majorSystemCount: 2, prototypeMinutes: 45, verdict: index < 3 ? 'SELECT' as const : 'REJECT' as const, rationale: 'small prototype' })) };
const prototypeSelection = { schemaVersion: 1 as const, batch: 1, decision: 'BUILD_3' as const, selectedIdeaIds: lowCostFilter.selectedIdeaIds, rationale: 'prototype-only approval', constraints: ['placeholder art'] };
const winner = { schemaVersion: 1 as const, batch: 1, decision: 'WINNER_A' as const, selectedIdeaId: 'idea_a', rationale: 'strongest evidence' };
const openSourceResearch = { schemaVersion: 1 as const, targetPlatforms: [...targetPlatforms], queries: ['portable canvas mini game adapter'], candidates: [], outcome: 'NO_SUITABLE_CANDIDATE' as const, selectedCandidateIds: [], rationale: 'No verified three-platform candidate.', researchedAt: new Date().toISOString() };
const directions = { directions: (['a', 'b', 'c', 'd'] as const).map((suffix) => ({ id: `direction_${suffix}` as const, name: `Direction ${suffix}`, summary: `Distinct ${suffix}`, visualKeywords: [`shape-${suffix}`], palette: ['#112233', '#DDEEFF'], characterStyle: `character ${suffix}`, environmentStyle: `environment ${suffix}`, uiStyle: `ui ${suffix}`, iconConcept: `icon ${suffix}`, forbiddenElements: ['logos'], productionComplexity: 'low' as const, previewPrompt: `original ${suffix}` })) };
const styleLock = { schemaVersion: 1 as const, directionId: 'direction_b', direction: directions.directions[1]!, kept: [], changes: [], notes: ['less saturated'], lockedAt: new Date().toISOString() };

class FakeRunner implements StructuredAgentRunner {
  constructor(private readonly outputs: unknown[]) {}
  async run() { const output = this.outputs.shift(); return { output, rawResponse: output, usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } }; }
}
class FakeImages implements ImageGenerationClient {
  calls = 0;
  async generate() { this.calls += 1; return { data: [{ b64_json: Buffer.from('png').toString('base64') }], usage: { total_tokens: 3 } }; }
}

it('live-art uses real art providers, pauses, then resumes with mock downstream stages', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'factory-live-art-'));
  roots.push(root);
  const seed = path.join(root, 'seed.yaml');
  await writeFile(seed, 'title: 妖怪夜市\ntheme: 夜市妖怪\ntemplate: idle-shop-v1\ndesignMode: prototype_tournament\n');
  const runner = new FakeRunner([research, ideas, lowCostFilter, prototypeSelection, winner, openSourceResearch, iaaReview, blueprint, directions, styleLock]);
  const imageClient = new FakeImages();
  const factory = createFactory({
    root, repositoryRoot: process.cwd(), mode: 'live-art', qaMode: 'stub',
    agentProvider: new OpenAIAgentProvider({ runner, apiKey: 'test-key', model: 'test-model' }),
    previewImageProvider: new OpenAIImageProvider({ client: imageClient, apiKey: 'test-key', model: 'test-image', size: '1024x1024', quality: 'low' }),
    assetImageProvider: new MockImageProvider(),
  });

  const runId = await factory.newRun(seed);
  const paused = await factory.run(runId);

  expect(paused.stage).toBe('WAITING_FOR_PROTOTYPE_APPROVAL');
  expect(paused.providerMode).toBe('live-art');
  expect(paused.stages.PROTOTYPE_SELECTION?.providerCalls).toMatchObject({ agent: 1, image: 0 });
  expect(paused.stages.IAA_REVIEW).toBeUndefined();
  await factory.approvePrototype(runId, { decision: 'APPROVE', notes: '' });
  const artPaused = await factory.resume(runId);
  expect(artPaused.stage).toBe('WAITING_FOR_ART_APPROVAL');
  // IAA review and blueprint are now separate stages/calls.  The review
  // stage should account for exactly its own provider invocation rather than
  // inheriting the legacy combined-call count.
  expect(artPaused.stages.IAA_REVIEW?.providerCalls).toMatchObject({ agent: 1, image: 0 });
  expect(artPaused.stages.ART_DIRECTIONS?.providerCalls).toMatchObject({ agent: 1, image: 4 });
  expect(await readFile(path.join(root, 'runs', runId, 'art-review/previews/direction_a.png'), 'utf8')).toBe('png');
  expect(await readFile(path.join(root, 'runs', runId, 'art-review/index.html'), 'utf8')).toContain('previews/direction_a.png');

  await factory.approve(runId, { direction: 'direction_b', notes: 'less saturated' });
  const completed = await factory.resume(runId);

  expect(completed.stage).toBe('COMPLETED');
  expect(completed.stages.STYLE_LOCK?.providerCalls.agent).toBe(1);
  expect(completed.stages.ASSETS?.evidence).toContain('provider:mock-svg');
});

it('redacts API-key-shaped secrets from failed provider logs and artifacts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'factory-redaction-'));
  roots.push(root);
  const seed = path.join(root, 'seed.yaml');
  await writeFile(seed, 'title: Test\ntheme: spirits\ntemplate: idle-shop-v1\ndesignMode: prototype_tournament\n');
  const secret = 'sk-test-secret-1234567890';
  const runner = new FakeRunner([{ leaked: secret }, { leakedAgain: secret }]);
  const factory = createFactory({ root, repositoryRoot: process.cwd(), mode: 'live-art', qaMode: 'stub', agentProvider: new OpenAIAgentProvider({ runner, apiKey: secret, model: 'test-model' }), previewImageProvider: new OpenAIImageProvider({ client: new FakeImages(), apiKey: secret, model: 'test-image', size: '1024x1024', quality: 'low' }), assetImageProvider: new MockImageProvider() });
  const runId = await factory.newRun(seed);

  await expect(factory.run(runId)).rejects.toThrow();

  const runRoot = path.join(root, 'runs', runId);
  const contents = await Promise.all(['state.json', 'logs/factory.jsonl', 'artifacts/provider-errors/COMPETITOR_RESEARCH.json'].map((file) => readFile(path.join(runRoot, file), 'utf8')));
  expect(contents.join('\n')).not.toContain(secret);
  expect(contents.join('\n')).toContain('[REDACTED]');
});
