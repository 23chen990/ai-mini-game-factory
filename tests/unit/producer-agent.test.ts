import { describe, expect, it } from 'vitest';
import { ProducerAgent } from '../../src/agents/index.js';
import type { AgentProvider } from '../../src/providers/interfaces.js';
import { OpenSourceResearchSchema, ReferenceMechanicSpecSchema, SeedSchema } from '../../src/schemas/index.js';
import { airportSpatialShop, beachSpatialShop } from '../fixtures/spatial-shop.js';

describe('ProducerAgent', () => {
  it('embeds the exact human reference lock before validating a reference-reskin blueprint', async () => {
    const referenceMechanics = ReferenceMechanicSpecSchema.parse({
      schemaVersion: 1,
      lockedBy: 'human',
      source: { name: 'Benchmark', url: 'https://example.com/reference', researchFiles: [] },
      coreLoop: ['perform current activity', 'earn shine', 'upgrade activity', 'unlock visible next goal'],
      playerActions: ['tap to accelerate', 'buy the current upgrade'],
      progressionSystems: ['activity levels'],
      unlockRules: ['show the next goal while locked'],
      feedbackCadence: { immediateSeconds: 1, microGoalMinSeconds: 10, microGoalMaxSeconds: 300 },
      mustPreserveMechanics: ['active and passive progress coexist'],
      adaptableMechanics: ['activity count'],
      expressionIsolation: {
        originalCode: true,
        originalAssets: true,
        originalNamesAndText: true,
        originalUiLayout: true,
        originalAudio: true,
        originalTuningValues: true,
      },
    });
    const seed = SeedSchema.parse({ title: '我要当美女', theme: '原创都市成长', template: 'idle-shop-v1', referenceMechanics });
    const research = OpenSourceResearchSchema.parse({
      schemaVersion: 1,
      targetPlatforms: seed.targetPlatforms,
      queries: ['portable mini-game runtime'],
      candidates: [],
      outcome: 'NO_SUITABLE_CANDIDATE',
      selectedCandidateIds: [],
      rationale: 'No reusable candidate passed the license and platform gate.',
      researchedAt: new Date().toISOString(),
    });
    const generatedWithoutLock = {
      schemaVersion: 1,
      gameId: 'beauty-idle',
      title: '错误标题',
      theme: '错误主题',
      runtime: 'web-lite',
      template: 'idle-shop-v1',
      designMode: 'reference_reskin',
      targetPlatforms: seed.targetPlatforms,
      concept: 'A compact self-improvement idle loop.',
      coreLoop: ['invented one', 'invented two', 'invented three', 'invented four'],
      content: { productName: '成长计划', customerName: '主角', currencyName: '闪耀值' },
      balance: { startingCurrency: 0, orderReward: 5, baseUpgradeCost: 10 },
      preferences: {},
    };
    const provider = {
      async generateBlueprint() {
        return { value: generatedWithoutLock, metrics: { provider: 'test', model: 'test', calls: 1 } };
      },
    } as unknown as AgentProvider;

    const result = await new ProducerAgent(provider).run(seed, referenceMechanics, research);

    expect(result.value).toMatchObject({
      title: seed.title,
      theme: seed.theme,
      designMode: 'reference_reskin',
      targetPlatforms: seed.targetPlatforms,
      coreLoop: referenceMechanics.coreLoop,
      referenceMechanics,
    });
  });

  it('pins the validated spatial shop configuration from the seed', async () => {
    const seed = SeedSchema.parse({
      title: '海滩渔货铺',
      theme: '原创海滩物流经营',
      template: 'spatial-shop-v1',
      designMode: 'prototype_tournament',
      spatialShop: beachSpatialShop,
    });
    const research = OpenSourceResearchSchema.parse({
      schemaVersion: 1,
      targetPlatforms: seed.targetPlatforms,
      queries: ['spatial shop infrastructure'],
      candidates: [],
      outcome: 'NO_SUITABLE_CANDIDATE',
      selectedCandidateIds: [],
      rationale: 'Use the original deterministic simulation.',
      researchedAt: new Date().toISOString(),
    });
    const generated = {
      schemaVersion: 1,
      gameId: 'beach-shop',
      title: seed.title,
      theme: seed.theme,
      runtime: 'web-lite',
      template: seed.template,
      designMode: seed.designMode,
      spatialShop: airportSpatialShop,
      targetPlatforms: seed.targetPlatforms,
      concept: '配置驱动的空间经营',
      coreLoop: ['采集', '搬运', '补货', '收银'],
      content: { productName: '渔货', customerName: '岛民', currencyName: '贝币' },
      balance: { startingCurrency: 0, orderReward: 2, baseUpgradeCost: 4 },
      preferences: {},
    };
    const provider = {
      async generateBlueprint() {
        return { value: generated, metrics: { provider: 'test', model: 'test', calls: 1 } };
      },
    } as unknown as AgentProvider;

    const result = await new ProducerAgent(provider).run(seed, {
      id: 'idea_spatial-loop',
      name: '空间经营',
      coreAction: '移动串联采集与补货',
      decisionIntervalSeconds: 12,
      decision: '优先解决当前瓶颈',
      choiceDrivers: ['库存', '队列', '距离'],
      pressure: '顾客耐心与站点产能',
      firstDelight: '首次完成自动搬运链',
      secondRunVariation: '流量窗口改变瓶颈',
      growthMechanic: '扩建站点与提升携带量',
      randomVariation: '可注入种子的需求权重',
      majorSystems: ['spatial logistics'],
      realDecision: true,
    }, research);

    expect(result.value.spatialShop).toEqual(beachSpatialShop);
  });

  it('pins the Cocos runtime from the seed instead of trusting generated output', async () => {
    const seed = SeedSchema.parse({
      title: '玩具工厂直营店 3D',
      theme: '原创玩具工厂',
      runtime: 'cocos-3d',
      template: 'spatial-shop-3d-v1',
      designMode: 'prototype_tournament',
      spatialShop: beachSpatialShop,
    });
    const research = OpenSourceResearchSchema.parse({
      schemaVersion: 1,
      targetPlatforms: seed.targetPlatforms,
      queries: ['Cocos 3.8 mini-game runtime'],
      candidates: [],
      outcome: 'NO_SUITABLE_CANDIDATE',
      selectedCandidateIds: [],
      rationale: 'The runtime selection is already human-locked for this test.',
      researchedAt: new Date().toISOString(),
    });
    const provider = {
      async generateBlueprint() {
        return { value: {
          schemaVersion: 1,
          gameId: 'toy-factory',
          title: seed.title,
          theme: seed.theme,
          runtime: 'web-lite',
          template: 'spatial-shop-v1',
          targetPlatforms: seed.targetPlatforms,
          concept: 'Hybrid 3D toy shop.',
          coreLoop: ['collect', 'stock', 'checkout', 'expand'],
          content: { productName: 'toy', customerName: 'shopper', currencyName: 'gear' },
          balance: { startingCurrency: 0, orderReward: 3, baseUpgradeCost: 12 },
          preferences: {},
        }, metrics: { provider: 'test', model: 'test', calls: 1 } };
      },
    } as unknown as AgentProvider;

    const result = await new ProducerAgent(provider).run(seed, {
      id: 'idea_toy-factory', name: 'Toy factory', coreAction: 'move goods', decisionIntervalSeconds: 12,
      decision: 'resolve bottleneck', choiceDrivers: ['stock'], pressure: 'queue', firstDelight: 'first sale',
      secondRunVariation: 'rush', growthMechanic: 'expansion', randomVariation: 'demand', majorSystems: ['spatial logistics'], realDecision: true,
    }, research);

    expect(result.value).toMatchObject({ runtime: 'cocos-3d', template: 'spatial-shop-3d-v1', spatialShop: beachSpatialShop });
  });
});
