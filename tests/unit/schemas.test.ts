import { describe, expect, it } from 'vitest';
import {
  ArtDirectionsSchema,
  ArtPreviewManifestSchema,
  BuildReportSchema,
  CompetitorResearchSchema,
  GameBlueprintSchema,
  GreenlightDecisionSchema,
  IaaMonetizationReviewSchema,
  OpenSourceResearchSchema,
  ProductionCostReviewSchema,
  ReferenceMechanicSpecSchema,
  SeedSchema,
  StageRecordSchema,
  TARGET_MINIGAME_PLATFORMS,
} from '../../src/schemas/index.js';

describe('artifact schemas', () => {
  it('rejects a seed without a supported template', () => {
    expect(() => SeedSchema.parse({ title: 'x', theme: 'ghosts', template: 'unknown' })).toThrow();
  });

  it('accepts a design-rejected regression fixture seed', () => {
    expect(SeedSchema.parse({ title: '妖怪夜市', theme: '妖怪夜市', template: 'idle-shop-v1', designMode: 'prototype_tournament', status: 'DESIGN_REJECTED', purpose: 'regression_fixture' })).toMatchObject({ status: 'DESIGN_REJECTED', purpose: 'regression_fixture' });
  });

  it('targets WeChat, Douyin, and TapTap mini games by default', () => {
    const seed = SeedSchema.parse({ title: 'x', theme: 'ghosts', template: 'idle-shop-v1', designMode: 'prototype_tournament' });
    expect(seed.targetPlatforms).toEqual(['wechat-minigame', 'douyin-minigame', 'taptap-minigame']);
  });

  it('requires a human-authored mechanic lock for the default reference-reskin workflow', () => {
    expect(() => SeedSchema.parse({ title: '我要当美女', theme: '原创都市变美逆袭', template: 'idle-shop-v1' })).toThrow(/referenceMechanics/i);

    const referenceMechanics = ReferenceMechanicSpecSchema.parse({
      schemaVersion: 1,
      lockedBy: 'human',
      source: { name: 'Named benchmark', url: 'https://example.com/reference', researchFiles: ['input/reference-report.txt'] },
      coreLoop: ['持续执行当前动作', '获得资源', '升级动作效率', '解锁下一项可见目标'],
      playerActions: ['点击加速当前动作', '购买当前项目升级'],
      progressionSystems: ['动作效率升级', '人物外观阶段变化', '场景阶段变化'],
      unlockRules: ['下一目标始终可见但未满足条件时锁定'],
      feedbackCadence: { immediateSeconds: 1, microGoalMinSeconds: 10, microGoalMaxSeconds: 300 },
      mustPreserveMechanics: ['持续动作与自动产出并存', '长期逆袭拆成连续的小目标'],
      adaptableMechanics: ['项目数量', '阶段数量', '题材映射'],
      expressionIsolation: {
        originalCode: true,
        originalAssets: true,
        originalNamesAndText: true,
        originalUiLayout: true,
        originalAudio: true,
        originalTuningValues: true,
      },
    });
    const seed = SeedSchema.parse({ title: '我要当美女', theme: '原创都市变美逆袭', template: 'idle-shop-v1', referenceMechanics });

    expect(seed.designMode).toBe('reference_reskin');
    expect(seed.referenceMechanics?.lockedBy).toBe('human');
    expect(seed.referenceMechanics?.fidelityPolicy).toEqual({
      level: 'maximum_core_mechanics',
      preserveInputStateTransitions: true,
      preserveCoreLoopOrder: true,
      preserveProgressionTopology: true,
      preserveUnlockDependencies: true,
      preserveFailureAndRecoveryRules: true,
      preserveFeedbackTimingBands: true,
    });
  });

  it('rejects any attempt to downgrade maximum core-mechanic fidelity', () => {
    const candidate = {
      schemaVersion: 1,
      lockedBy: 'human',
      source: { name: 'Benchmark', url: 'https://example.com/reference', researchFiles: [] },
      coreLoop: ['act', 'earn', 'upgrade', 'unlock'],
      playerActions: ['tap'],
      progressionSystems: ['upgrade'],
      unlockRules: ['visible next goal'],
      feedbackCadence: { immediateSeconds: 1, microGoalMinSeconds: 10, microGoalMaxSeconds: 300 },
      mustPreserveMechanics: ['loop relation'],
      adaptableMechanics: ['content count'],
      expressionIsolation: { originalCode: true, originalAssets: true, originalNamesAndText: true, originalUiLayout: true, originalAudio: true, originalTuningValues: true },
      fidelityPolicy: {
        level: 'selective',
        preserveInputStateTransitions: true,
        preserveCoreLoopOrder: true,
        preserveProgressionTopology: true,
        preserveUnlockDependencies: true,
        preserveFailureAndRecoveryRules: true,
        preserveFeedbackTimingBands: true,
      },
    };

    expect(() => ReferenceMechanicSpecSchema.parse(candidate)).toThrow();
  });

  it('rejects a reference-reskin seed that authorizes copied expression', () => {
    expect(() => SeedSchema.parse({
      title: 'x',
      theme: 'original theme',
      template: 'idle-shop-v1',
      referenceMechanics: {
        schemaVersion: 1,
        lockedBy: 'human',
        source: { name: 'Benchmark', url: 'https://example.com/reference', researchFiles: [] },
        coreLoop: ['act', 'earn', 'upgrade', 'unlock'],
        playerActions: ['tap'],
        progressionSystems: ['upgrade'],
        unlockRules: ['visible next goal'],
        feedbackCadence: { immediateSeconds: 1, microGoalMinSeconds: 10, microGoalMaxSeconds: 300 },
        mustPreserveMechanics: ['loop relation'],
        adaptableMechanics: ['content count'],
        expressionIsolation: { originalCode: false, originalAssets: true, originalNamesAndText: true, originalUiLayout: true, originalAudio: true, originalTuningValues: true },
      },
    })).toThrow(/originalCode/i);
  });

  it('keeps all distribution targets in the technical blueprint', () => {
    const blueprint = GameBlueprintSchema.parse({
      schemaVersion: 1,
      gameId: 'portable-game',
      title: 'Portable Game',
      theme: 'night market',
      runtime: 'web-lite',
      template: 'idle-shop-v1',
      targetPlatforms: ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'],
      concept: 'An original portable game concept.',
      coreLoop: ['observe', 'choose', 'act', 'resolve'],
      content: { productName: 'Item', customerName: 'Guest', currencyName: 'Coin' },
      balance: { startingCurrency: 0, orderReward: 1, baseUpgradeCost: 2 },
      preferences: {},
    });
    expect(blueprint.targetPlatforms).toEqual(['wechat-minigame', 'douyin-minigame', 'taptap-minigame']);
  });

  it('accepts a Cocos 3D build report without treating web QA as platform publication', () => {
    const report = BuildReportSchema.parse({
      schemaVersion: 1,
      success: true,
      runtime: 'cocos-3d',
      template: 'spatial-shop-3d-v1',
      workspace: 'workspace/game',
      webBuild: 'workspace/game/build/web-mobile',
      files: ['index.html'],
      verification: ['test:passed', 'typecheck:passed'],
      builtAt: new Date().toISOString(),
    });
    expect(report.runtime).toBe('cocos-3d');
  });

  it('validates a license-aware open-source research artifact even when nothing is reusable', () => {
    expect(() => OpenSourceResearchSchema.parse({
      schemaVersion: 1,
      targetPlatforms: TARGET_MINIGAME_PLATFORMS,
      queries: ['portable canvas mini game adapter', 'wechat douyin minigame adapter', 'taptap minigame adapter'],
      candidates: [],
      outcome: 'NO_SUITABLE_CANDIDATE',
      selectedCandidateIds: [],
      rationale: 'No candidate met the license, maintenance, and three-platform compatibility requirements.',
      researchedAt: new Date().toISOString(),
    })).not.toThrow();
  });

  it('rejects reuse selections without verified license evidence', () => {
    expect(() => OpenSourceResearchSchema.parse({
      schemaVersion: 1,
      targetPlatforms: TARGET_MINIGAME_PLATFORMS,
      queries: ['portable mini game adapter'],
      candidates: [{
        id: 'adapter-a',
        name: 'Adapter A',
        repositoryUrl: 'https://example.com/adapter-a',
        revision: 'v1.0.0',
        license: 'MIT',
        licenseEvidenceUrl: null,
        targetPlatforms: TARGET_MINIGAME_PLATFORMS,
        technicalFit: 'Potentially reusable platform adapter.',
        maintenanceRisk: 'low',
        securityRisks: [],
        attributionRequirements: [],
        decision: 'REUSE',
      }],
      outcome: 'REUSE_APPROVED',
      selectedCandidateIds: ['adapter-a'],
      rationale: 'Use the adapter.',
      researchedAt: new Date().toISOString(),
    })).toThrow(/license evidence/i);
  });

  it('requires exactly four uniquely identified art directions', () => {
    const direction = { id: 'direction_a', name: 'A', summary: 'A distinct silhouette-led direction', visualKeywords: ['ink'], palette: ['#112233'], characterStyle: 'paper-cut figures', environmentStyle: 'layered night market', uiStyle: 'round', iconConcept: 'lantern seal', forbiddenElements: ['copied IP'], productionComplexity: 'low', previewPrompt: 'original ink market' };
    expect(() => ArtDirectionsSchema.parse({ directions: [direction] })).toThrow();
  });

  it('rejects four directions that differ only by palette', () => {
    const directions = (['a', 'b', 'c', 'd'] as const).map((suffix, index) => ({ id: `direction_${suffix}`, name: `Direction ${suffix}`, summary: 'same summary', visualKeywords: ['same'], palette: [`#00000${index}`], characterStyle: 'same character', environmentStyle: 'same environment', uiStyle: 'same ui', iconConcept: 'same icon', forbiddenElements: ['logos'], productionComplexity: 'low', previewPrompt: 'same prompt' }));
    expect(() => ArtDirectionsSchema.parse({ directions })).toThrow(/meaningfully distinct/i);
  });

  it('validates image preview metadata including failed previews', () => {
    expect(() => ArtPreviewManifestSchema.parse({ schemaVersion: 1, provider: 'openai', callCount: 2, previews: [{ directionId: 'direction_a', provider: 'openai', model: 'image-model', prompt: 'original scene', size: '1024x1024', quality: 'low', outputPath: 'previews/direction_a.png', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), attempts: 2, status: 'failed', error: 'request failed' }] })).not.toThrow();
  });

  it('requires stage execution evidence fields', () => {
    expect(() => StageRecordSchema.parse({ status: 'completed' })).toThrow();
  });

  it('validates the three pre-production review artifacts', () => {
    expect(() => CompetitorResearchSchema.parse({
      schemaVersion: 1,
      market: 'cozy mobile idle shop games',
      competitors: [
        { name: 'Reference A', positioning: 'short-session shop sim', coreLoop: ['serve', 'upgrade'], monetization: ['rewarded ads'], strengths: ['clear loop'], weaknesses: ['low variety'] },
        { name: 'Reference B', positioning: 'collection-led idle game', coreLoop: ['collect', 'upgrade'], monetization: ['interstitial ads'], strengths: ['strong goals'], weaknesses: ['interruptive ads'] },
        { name: 'Reference C', positioning: 'narrative market sim', coreLoop: ['serve', 'unlock stories'], monetization: ['rewarded ads'], strengths: ['theme'], weaknesses: ['high content cost'] },
      ],
      opportunities: ['three-minute sessions'],
      risks: ['crowded category'],
      differentiationThesis: 'A supernatural night market with compact deterministic sessions.',
    })).not.toThrow();
    expect(() => ProductionCostReviewSchema.parse({
      schemaVersion: 1,
      costBand: 'low',
      prototypeDays: 2,
      productionWeeks: 2,
      teamSize: 1,
      assetEstimate: { characters: 4, environments: 1, ui: 8, audio: 6 },
      technicalRisks: ['save recovery'],
      scopeCuts: ['single shop'],
      recommendation: 'proceed',
      rationale: 'Fits the web-lite template and asset budget.',
    })).not.toThrow();
    expect(() => IaaMonetizationReviewSchema.parse({
      schemaVersion: 1,
      audienceFit: 'broad casual audience',
      sessionFit: 'medium',
      placements: [{ format: 'rewarded', trigger: 'optional production boost', playerValue: 'shorter wait', frequencyCap: 'at most once per three-minute session' }],
      retentionRisk: 'low',
      revenuePotential: 'medium',
      complianceRisks: ['age-appropriate consent flow'],
      recommendation: 'test_cautiously',
      rationale: 'Optional rewarded ads fit without interrupting orders.',
    })).not.toThrow();
  });

  it('rejects a greenlight GO below the score threshold', () => {
    expect(() => GreenlightDecisionSchema.parse({
      schemaVersion: 1,
      decision: 'GO',
      overallScore: 69,
      scores: { differentiation: 70, productionFeasibility: 80, iaaFit: 60, strategicFit: 65 },
      reasons: ['Promising but below policy threshold.'],
      blockers: [],
      requiredChanges: [],
    })).toThrow(/GO requires/i);
  });
});
