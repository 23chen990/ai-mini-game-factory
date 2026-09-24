import { describe, expect, it } from 'vitest';
import * as schemas from '../../src/schemas/index.js';

const source = (id: string, sourceType: string, url: string | null, localPath: string | null) => ({
  id,
  sourceType,
  url,
  localPath,
  accessedAt: '2026-08-31T06:00:00.000Z',
  confidence: 'high',
  observations: ['This source exposes a concrete mechanic relationship.'],
});

const activity = (
  id: string,
  role: string,
  requirements: Array<{ targetId: string }> = [],
) => ({
  id,
  role,
  producesWhileActive: true,
  hasOwnUpgradeTrack: true,
  hasVisibleProgress: true,
  visibleBeforeUnlock: requirements.length > 0,
  requirements: requirements.map(({ targetId }) => ({
    type: 'activity_level',
    targetId,
    relation: 'at_least',
    copiedThresholdValue: false,
  })),
  feedback: ['character motion', 'floating resource', 'progress movement'],
});

const candidate = {
  schemaVersion: 1,
  artifactType: 'reference_core_gameplay_research',
  targetRunId: '20260830141456-e0aac979',
  benchmark: {
    name: 'Designated life-progression idle benchmark',
    primaryUrl: 'https://example.com/reference',
    suppliedResearchFiles: ['attachments/reference-report.txt'],
  },
  evidenceSources: [
    source('official-page', 'official_game_page', 'https://example.com/reference', null),
    source('official-store', 'official_store_listing', 'https://example.com/store', null),
    source('interface-shot', 'screenshot', 'https://example.com/screenshot', null),
    source('supplied-report', 'user_supplied_report', null, 'attachments/reference-report.txt'),
  ],
  observedMechanics: {
    activeInput: {
      activitySelectionStartsExecution: true,
      selectedActivityControlsVisibleAnimation: true,
      tapTarget: 'character',
      tapEffect: 'accelerate_current_activity',
      directCurrencyButton: false,
    },
    coreLoop: [
      'select visible activity',
      'character performs it continuously',
      'activity produces resources and progress',
      'tap character to accelerate the current activity',
      'spend resources on that activity upgrade',
      'increase that activity output and progress',
      'satisfy one or more visible prerequisites',
      'unlock the next activity or life chapter',
      'show a character, environment, or identity change',
    ],
    chapters: [
      {
        id: 'entry-training',
        order: 1,
        role: 'entry_self_improvement',
        unlock: { mode: 'initial', visibleBeforeUnlock: true, requiresChapterIds: [] },
        activities: [
          activity('entry-basic-action', 'animated_action'),
          activity('entry-support-action', 'support_action', [{ targetId: 'entry-basic-action' }]),
          activity('entry-advanced-action', 'animated_action', [
            { targetId: 'entry-basic-action' },
            { targetId: 'entry-support-action' },
          ]),
        ],
      },
      {
        id: 'education',
        order: 2,
        role: 'capability_gate',
        unlock: { mode: 'prerequisite_gate', visibleBeforeUnlock: true, requiresChapterIds: ['entry-training'] },
        activities: [activity('education-basic', 'animated_action')],
      },
      {
        id: 'career',
        order: 3,
        role: 'identity_income_ladder',
        unlock: { mode: 'prerequisite_gate', visibleBeforeUnlock: true, requiresChapterIds: ['education'] },
        activities: [activity('career-tier', 'career_tier')],
      },
      {
        id: 'social',
        order: 4,
        role: 'world_population_progress',
        unlock: { mode: 'prerequisite_gate', visibleBeforeUnlock: true, requiresChapterIds: ['career'] },
        activities: [activity('social-activity', 'social_activity')],
      },
      {
        id: 'home',
        order: 5,
        role: 'visible_wealth_sink',
        unlock: { mode: 'prerequisite_gate', visibleBeforeUnlock: true, requiresChapterIds: ['career'] },
        activities: [{
          ...activity('home-purchase', 'home_purchase'),
          producesWhileActive: false,
          hasOwnUpgradeTrack: false,
        }],
      },
    ],
    crossChapterGates: [
      { fromChapterId: 'entry-training', toChapterId: 'education', relationship: 'milestone_unlock' },
      { fromChapterId: 'education', toChapterId: 'career', relationship: 'capability_requirement' },
      { fromChapterId: 'career', toChapterId: 'social', relationship: 'status_and_resource_requirement' },
      { fromChapterId: 'career', toChapterId: 'home', relationship: 'resource_requirement' },
    ],
    economy: {
      perActivityBaseProduction: true,
      totalProductionAggregatesUnlockedActivities: true,
      upgradesPrimarilyAffectOwningActivity: true,
      laterActivitiesChangeMagnitude: true,
      batchPurchasingAppearsLater: true,
      offlineProgressionPresent: true,
      copiedRawValues: false,
    },
    feedbackCadence: [
      { band: 'immediate', minSeconds: 0, maxSeconds: 1, outcomes: ['motion accelerates'] },
      { band: 'short', minSeconds: 3, maxSeconds: 45, outcomes: ['upgrade becomes affordable', 'progress visibly moves'] },
      { band: 'milestone', minSeconds: 60, maxSeconds: 600, outcomes: ['new activity', 'visible transformation'] },
    ],
    visibleProgression: [
      { dimension: 'character', examples: ['posture and capability stage'] },
      { dimension: 'environment', examples: ['room gains functional objects'] },
      { dimension: 'identity', examples: ['education and career stage'] },
      { dimension: 'world', examples: ['social scene gains people'] },
    ],
    misreadingsToReject: [
      'one flat card per life system',
      'a generic currency button disconnected from character motion',
      'abstract project names without a visible performed action',
      'independent systems with no cross-system prerequisites',
    ],
  },
  reskinProposal: {
    status: 'AWAITING_HUMAN_APPROVAL',
    title: '逆袭公主',
    chapters: [
      {
        id: 'fitness',
        order: 1,
        benchmarkRole: 'entry_self_improvement',
        name: '健身',
        milestoneTransformation: '角色站姿与体能表现升级，健身角增加器材',
        unlock: { mode: 'initial', requiresChapterIds: [] },
        activities: [
          { id: 'bodyweight-squat', name: '深蹲训练', visibleVerb: '角色持续完成深蹲', animationRequired: true, requireAllActivityIds: [] },
          { id: 'hydration', name: '补水休整', visibleVerb: '角色拿起水杯补水', animationRequired: true, requireAllActivityIds: ['bodyweight-squat'] },
          { id: 'core-training', name: '核心训练', visibleVerb: '角色在垫子上完成核心动作', animationRequired: true, requireAllActivityIds: ['bodyweight-squat', 'hydration'] },
        ],
      },
      {
        id: 'skincare',
        order: 2,
        benchmarkRole: 'second_gated_growth_line',
        name: '护肤',
        milestoneTransformation: '洗手台与梳妆区被整理，角色状态更精神',
        unlock: { mode: 'prerequisite_gate', requiresChapterIds: ['fitness'] },
        activities: [
          { id: 'cleanse', name: '温和清洁', visibleVerb: '角色在洗手台前清洁脸部', animationRequired: true, requireAllActivityIds: [] },
          { id: 'moisturize', name: '保湿护理', visibleVerb: '角色在镜子前进行保湿护理', animationRequired: true, requireAllActivityIds: ['cleanse'] },
          { id: 'sun-care', name: '白天防护', visibleVerb: '角色在出门前涂抹日常防护', animationRequired: true, requireAllActivityIds: ['cleanse', 'moisturize'] },
        ],
      },
      {
        id: 'styling',
        order: 3,
        benchmarkRole: 'visible_identity_progress',
        name: '穿搭',
        milestoneTransformation: '衣橱从凌乱变为分区收纳，角色整套配色与单品更换',
        unlock: { mode: 'prerequisite_gate', requiresChapterIds: ['skincare'] },
        activities: [
          { id: 'wardrobe-sort', name: '衣橱整理', visibleVerb: '角色把衣物分类收纳到衣橱', animationRequired: true, requireAllActivityIds: [] },
          { id: 'color-match', name: '配色练习', visibleVerb: '角色在镜子前更换上下装配色', animationRequired: true, requireAllActivityIds: ['wardrobe-sort'] },
          { id: 'occasion-look', name: '场合穿搭', visibleVerb: '角色完成一套有明确场合的造型', animationRequired: true, requireAllActivityIds: ['wardrobe-sort', 'color-match'] },
        ],
      },
    ],
    preserveRelationships: [
      'character continuously performs the selected activity',
      'tap character to accelerate only that activity',
      'each chapter contains multiple upgradable activities',
      'later activities use visible conjunctive prerequisites',
      'milestones cause visible character or room changes',
    ],
    originalExpressionRequired: [
      'all target names and copy',
      'all character and environment art',
      'all UI layout and iconography',
      'all tuning values and economy curves',
      'all animation and audio assets',
    ],
    demoExitCriteria: {
      minimumChapters: 3,
      minimumActivities: 9,
      minimumConjunctiveUnlocks: 2,
      minimumVisibleTransformations: 3,
      mobileCoreLoopVisibleWithoutScroll: true,
    },
  },
  uncertainties: ['Exact late-game thresholds are intentionally not recorded or reused.'],
  conclusion: 'Reject the flat three-card prototype and replace it only after human approval of this graph.',
  researchedAt: '2026-08-31T06:00:00.000Z',
};

describe('reference core gameplay research artifact', () => {
  it('captures a nested activity graph, cross-chapter gates, and a concrete reskin proposal', () => {
    const researchSchema = (schemas as Record<string, unknown>).ReferenceCoreGameplayResearchSchema as
      | { parse: (value: unknown) => typeof candidate }
      | undefined;

    expect(researchSchema).toBeDefined();
    expect(researchSchema?.parse(candidate)).toMatchObject({
      observedMechanics: { activeInput: { tapTarget: 'character', directCurrencyButton: false } },
      reskinProposal: { title: '逆袭公主', status: 'AWAITING_HUMAN_APPROVAL' },
    });
  });

  it('rejects the flat-card misreading that caused the current demo', () => {
    const researchSchema = (schemas as Record<string, unknown>).ReferenceCoreGameplayResearchSchema as
      | { parse: (value: unknown) => typeof candidate }
      | undefined;

    expect(researchSchema).toBeDefined();
    const flattened = {
      ...candidate,
      observedMechanics: {
        ...candidate.observedMechanics,
        chapters: candidate.observedMechanics.chapters.map((chapter) => ({
          ...chapter,
          activities: chapter.activities.slice(0, 1),
        })),
        crossChapterGates: [],
      },
    };

    expect(() => researchSchema?.parse(flattened)).toThrow(/nested|cross-chapter|activity graph/i);
  });

  it('rejects abstract target activities and copied tuning authorization', () => {
    const researchSchema = (schemas as Record<string, unknown>).ReferenceCoreGameplayResearchSchema as
      | { parse: (value: unknown) => typeof candidate }
      | undefined;

    expect(researchSchema).toBeDefined();
    const abstractAction = {
      ...candidate,
      reskinProposal: {
        ...candidate.reskinProposal,
        chapters: candidate.reskinProposal.chapters.map((chapter, chapterIndex) => chapterIndex === 0
          ? {
              ...chapter,
              activities: chapter.activities.map((item, itemIndex) => itemIndex === 0
                ? { ...item, visibleVerb: '', animationRequired: false }
                : item),
            }
          : chapter),
      },
    };
    const copiedTuning = {
      ...candidate,
      observedMechanics: {
        ...candidate.observedMechanics,
        economy: { ...candidate.observedMechanics.economy, copiedRawValues: true },
      },
    };

    expect(() => researchSchema?.parse(abstractAction)).toThrow();
    expect(() => researchSchema?.parse(copiedTuning)).toThrow();
  });

  it('keeps aggregate passive production separate from the selected visible action', () => {
    const researchSchema = (schemas as Record<string, unknown>).ReferenceCoreGameplayResearchSchema as
      | { parse: (value: unknown) => typeof candidate }
      | undefined;

    expect(researchSchema).toBeDefined();
    const singleActivityEconomy = {
      ...candidate,
      observedMechanics: {
        ...candidate.observedMechanics,
        economy: {
          ...candidate.observedMechanics.economy,
          totalProductionAggregatesUnlockedActivities: false,
        },
      },
    };

    expect(() => researchSchema?.parse(singleActivityEconomy)).toThrow(/aggregate|production|literal/i);
  });
});
