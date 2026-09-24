import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createFactory } from '../../src/factory.js';
import { MockAgentProvider } from '../../src/providers/mock.js';
import type { AgentExecutionContext } from '../../src/providers/interfaces.js';
import type { CompetitorResearch, ReferenceMechanicSpec, Seed } from '../../src/schemas/index.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

it('exposes one feedback entrypoint on the factory', () => {
  const factory = createFactory({ mode: 'mock', qaMode: 'stub' }) as ReturnType<typeof createFactory> & {
    recordFeedback?: unknown;
  };

  expect(factory.recordFeedback).toBeTypeOf('function');
});

it('routes project feedback and persists reusable lessons as validated artifacts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'feedback-lessons-'));
  roots.push(root);
  const seed = path.join(root, 'seed.yaml');
  await writeFile(seed, 'title: 妖怪夜市\ntheme: 夜市妖怪\ntemplate: idle-shop-v1\ndesignMode: prototype_tournament\n');
  const factory = createFactory({ root, mode: 'mock', qaMode: 'stub' });
  const runId = await factory.newRun(seed);

  const result = await factory.recordFeedback(runId, '当前游戏玩法太无聊，核心循环缺少真实选择。以后每次收到玩法反馈，都要把可复用经验交给相关 Agent 自动读取。可复用经验必须进入 design-lessons，并由相关 Agent 自动读取。');

  expect(result.projectChanges).toEqual(['当前游戏玩法太无聊，核心循环缺少真实选择']);
  expect(result.projectRoute).toMatchObject({ targetRunId: runId, requestType: 'GAMEPLAY_REVISION', stages: ['FULL_BUILD', 'QA'] });
  expect(result.reusableLessons).toHaveLength(2);
  expect(result.reusableLessons[0]).toMatchObject({
    text: '以后每次收到玩法反馈，都要把可复用经验交给相关 Agent 自动读取',
    occurrences: 1,
  });
  expect(result.reusableLessons[1]).toMatchObject({
    text: '可复用经验必须进入 design-lessons，并由相关 Agent 自动读取',
    tags: ['general'],
    appliesTo: ['CompetitorResearchAgent', 'GameDesignerAgent', 'ProductionCostReviewer', 'IAAReviewer', 'GreenlightAgent', 'BuilderAgent', 'PlaytestAgent'],
  });
  const recorded = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/feedback', `${result.feedbackId}.json`), 'utf8')) as unknown;
  expect(recorded).toEqual(result);
  const library = JSON.parse(await readFile(path.join(root, 'design-lessons/index.json'), 'utf8')) as { lessons: unknown[] };
  expect(library.lessons).toEqual(result.reusableLessons);
});

it('injects relevant design lessons into every pre-production design decision', async () => {
  class CapturingProvider extends MockAgentProvider {
    readonly inputs = new Map<string, string[]>();
    private capture(stage: string, context?: AgentExecutionContext) { this.inputs.set(stage, context?.inputPaths ?? []); }
    override async generateCompetitorResearch(seed: Seed, context?: AgentExecutionContext) { this.capture('CompetitorResearchAgent', context); return super.generateCompetitorResearch(seed); }
    override async generateLowCostFilter(ideas: Parameters<MockAgentProvider['generateLowCostFilter']>[0], context?: AgentExecutionContext) { this.capture('ProductionCostReviewer', context); return super.generateLowCostFilter(ideas); }
    override async generateIaaMonetizationReview(_seed?: Seed, _research?: CompetitorResearch | ReferenceMechanicSpec, context?: AgentExecutionContext) { this.capture('IAAReviewer', context); return super.generateIaaMonetizationReview(); }
    override async generatePrototypeSelection(ideas: Parameters<MockAgentProvider['generatePrototypeSelection']>[0], filter: Parameters<MockAgentProvider['generatePrototypeSelection']>[1], context?: AgentExecutionContext) { this.capture('GreenlightAgent', context); return super.generatePrototypeSelection(ideas, filter); }
    override async generateIdeas(seed: Seed, research: CompetitorResearch, batch: number, context?: AgentExecutionContext) { this.capture('GameDesignerAgent', context); return super.generateIdeas(seed, research, batch); }
  }
  const root = await mkdtemp(path.join(tmpdir(), 'feedback-injection-'));
  roots.push(root);
  const seed = path.join(root, 'seed.yaml');
  await writeFile(seed, 'title: 妖怪夜市\ntheme: 夜市妖怪\ntemplate: idle-shop-v1\ndesignMode: prototype_tournament\n');
  const provider = new CapturingProvider();
  const factory = createFactory({ root, mode: 'mock', qaMode: 'stub', agentProvider: provider });
  const runId = await factory.newRun(seed);
  await factory.recordFeedback(runId, '以后每次工厂流程都必须读取这条通用经验。');

  await factory.run(runId);
  await factory.approvePrototype(runId, { decision: 'APPROVE', notes: '' });
  await factory.resume(runId);

  for (const agent of ['CompetitorResearchAgent', 'ProductionCostReviewer', 'IAAReviewer', 'GreenlightAgent', 'GameDesignerAgent']) {
    const lessonPath = `artifacts/design-lessons/${agent}.json`;
    expect(provider.inputs.get(agent)).toContain(lessonPath);
    const snapshot = JSON.parse(await readFile(path.join(root, 'runs', runId, lessonPath), 'utf8')) as { lessons: Array<{ text: string }> };
    expect(snapshot.lessons.map((lesson) => lesson.text)).toContain('以后每次工厂流程都必须读取这条通用经验');
  }
});

it('persists structured feedback as a reusable factory regression case', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'feedback-regression-'));
  roots.push(root);
  const seed = path.join(root, 'seed.yaml');
  await writeFile(seed, 'title: 妖怪夜市\ntheme: 夜市妖怪\ntemplate: idle-shop-v1\ndesignMode: prototype_tournament\n');
  const factory = createFactory({ root, mode: 'mock', qaMode: 'stub' });
  const runId = await factory.newRun(seed);
  const result = await factory.recordStructuredFeedback(runId, {
    project: '妖怪夜市', artifact_version: 'candidate-a', rejected_dimension: 'feel',
    reason: '物体掉落像瞬移', before: '直接改坐标', after: '保留速度并逐渐落地',
    accepted_result: '不同角度掉落自然', new_regression_case: '三种切割角度都必须有连续下落轨迹',
  });
  expect(result.structuredFeedback?.new_regression_case).toContain('连续下落');
  const file = path.join(root, 'factory-eval', 'feedback-regressions.json');
  const saved = JSON.parse(await readFile(file, 'utf8')) as { cases: Array<{ sourceRunId: string; new_regression_case: string }> };
  expect(saved.cases).toHaveLength(1);
  expect(saved.cases[0]).toMatchObject({ sourceRunId: runId });
});

it('persists an optional machine-runnable assertion with structured feedback', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'feedback-regression-eval-'));
  roots.push(root);
  const seed = path.join(root, 'seed.yaml');
  await writeFile(seed, 'title: 妖怪夜市\ntheme: 夜市妖怪\ntemplate: idle-shop-v1\ndesignMode: prototype_tournament\n');
  const factory = createFactory({ root, mode: 'mock', qaMode: 'stub' });
  const runId = await factory.newRun(seed);
  await factory.recordStructuredFeedback(runId, {
    project: '妖怪夜市', artifact_version: 'candidate-b', rejected_dimension: 'feel',
    reason: '掉落不自然', before: '瞬移', after: '连续轨迹', accepted_result: '自然', new_regression_case: '动作路由仍应识别为手感产线',
    regression_eval: { input: '做一个切割躲避小游戏，重点是手感和碰撞', expectedProfile: 'ACTION_FEEL', acceptableProfiles: ['ACTION_FEEL'], requiredStages: ['REFERENCE_MECHANIC_LOCK'], forbiddenOutcomes: [], dataset: 'holdout' },
  });
  const file = path.join(root, 'factory-eval', 'feedback-regressions.json');
  const saved = JSON.parse(await readFile(file, 'utf8')) as { cases: Array<{ evalCase?: { input: string } }> };
  expect(saved.cases[0]?.evalCase?.input).toContain('切割');
  await factory.run(runId);
  const evalReport = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts', 'factory-eval-report.json'), 'utf8')) as { feedbackRegressionCoverage?: { total: number; executable: number; executed: number }; cases: Array<{ caseId: string }> };
  expect(evalReport.feedbackRegressionCoverage).toEqual({ total: 1, executable: 1, executed: 1 });
  expect(evalReport.cases.some((item) => item.caseId.startsWith('feedback:'))).toBe(true);
});
