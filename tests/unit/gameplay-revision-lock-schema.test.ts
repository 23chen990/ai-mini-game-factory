import { describe, expect, it } from 'vitest';
import * as schemas from '../../src/schemas/index.js';

const action = (
  id: string,
  order: number,
  name: string,
  visibleVerb: string,
  requireAll: Array<{ activityId: string; minimumLevel: number }> = [],
  kind: 'repeated_action' | 'purchase' = 'repeated_action',
) => ({
  id,
  order,
  name,
  visibleVerb,
  kind,
  animationRequired: true,
  contributesPassiveRate: kind === 'repeated_action',
  requireAll,
});

const chapter = (
  id: string,
  order: number,
  name: string,
  actions: ReturnType<typeof action>[],
  requireAll: Array<{ activityId: string; minimumLevel: number }>,
) => ({
  id,
  order,
  name,
  milestoneTransformation: `${name}完成后角色或场景出现明显变化`,
  requireAll,
  actions,
});

const chapters = [
  chapter('fitness', 1, '健身', [
    action('squat', 1, '深蹲', '角色连续做深蹲'),
    action('sit-up', 2, '仰卧起坐', '角色在垫子上做仰卧起坐', [{ activityId: 'squat', minimumLevel: 2 }]),
    action('running', 3, '跑步', '角色在跑步机上跑步', [{ activityId: 'squat', minimumLevel: 2 }, { activityId: 'sit-up', minimumLevel: 2 }]),
  ], []),
  chapter('skincare', 2, '护肤', [
    action('wash-face', 1, '洗脸', '角色在洗手台前洗脸'),
    action('face-mask', 2, '敷面膜', '角色坐在镜子前敷面膜', [{ activityId: 'wash-face', minimumLevel: 2 }]),
    action('face-cream', 3, '抹面霜', '角色在镜子前抹面霜', [{ activityId: 'wash-face', minimumLevel: 2 }, { activityId: 'face-mask', minimumLevel: 2 }]),
  ], [{ activityId: 'running', minimumLevel: 2 }]),
  chapter('styling', 3, '穿搭', [
    action('try-top', 1, '试上衣', '角色在镜子前换上衣'),
    action('change-bottom', 2, '换下装', '角色在镜子前换下装', [{ activityId: 'try-top', minimumLevel: 2 }]),
    action('change-shoes', 3, '换鞋', '角色坐下换鞋并起身照镜子', [{ activityId: 'try-top', minimumLevel: 2 }, { activityId: 'change-bottom', minimumLevel: 2 }]),
  ], [{ activityId: 'face-cream', minimumLevel: 2 }]),
  chapter('study', 4, '学习', [
    action('read-book', 1, '看书', '角色坐在书桌前看书'),
    action('answer-questions', 2, '做题', '角色在纸上做题', [{ activityId: 'read-book', minimumLevel: 2 }]),
    action('take-exam', 3, '考试', '角色在考卷上作答', [{ activityId: 'read-book', minimumLevel: 2 }, { activityId: 'answer-questions', minimumLevel: 2 }]),
  ], [{ activityId: 'change-shoes', minimumLevel: 2 }]),
  chapter('career', 5, '工作', [
    action('write-resume', 1, '写简历', '角色坐在电脑前写简历'),
    action('interview', 2, '面试', '角色坐在办公桌前参加面试', [{ activityId: 'write-resume', minimumLevel: 2 }]),
    action('work-shift', 3, '上班', '角色在工位前上班', [{ activityId: 'write-resume', minimumLevel: 2 }, { activityId: 'interview', minimumLevel: 2 }]),
  ], [{ activityId: 'take-exam', minimumLevel: 2 }]),
  chapter('social', 6, '社交', [
    action('send-message', 1, '发消息', '角色拿起手机发消息'),
    action('meet-friend', 2, '见朋友', '角色与朋友见面打招呼', [{ activityId: 'send-message', minimumLevel: 2 }]),
    action('join-party', 3, '参加聚会', '角色和朋友一起参加聚会', [{ activityId: 'send-message', minimumLevel: 2 }, { activityId: 'meet-friend', minimumLevel: 2 }]),
  ], [
    { activityId: 'take-exam', minimumLevel: 3 },
    { activityId: 'change-shoes', minimumLevel: 3 },
    { activityId: 'work-shift', minimumLevel: 2 },
  ]),
  chapter('romance', 7, '恋爱', [
    action('reply-message', 1, '回消息', '角色拿起手机回复消息'),
    action('meet-friends', 2, '见朋友', '角色与朋友和喜欢的人见面', [{ activityId: 'reply-message', minimumLevel: 2 }]),
    action('tell-truth', 3, '说出身份', '角色向朋友和喜欢的人说出公主身份', [{ activityId: 'reply-message', minimumLevel: 2 }, { activityId: 'meet-friends', minimumLevel: 2 }]),
  ], [
    { activityId: 'join-party', minimumLevel: 3 },
    { activityId: 'work-shift', minimumLevel: 3 },
  ]),
  chapter('leadership', 8, '公主就任', [
    action('rehearse-address', 1, '练演说', '角色在空讲台前练习就任演说'),
    action('walk-to-podium', 2, '走上台', '角色穿过大厅走上公开讲台', [{ activityId: 'rehearse-address', minimumLevel: 2 }]),
    action('public-speech', 3, '发表演说', '角色公开接受公主身份并发表亮相演说', [{ activityId: 'rehearse-address', minimumLevel: 2 }, { activityId: 'walk-to-podium', minimumLevel: 2 }]),
  ], [
    { activityId: 'tell-truth', minimumLevel: 2 },
    { activityId: 'work-shift', minimumLevel: 4 },
  ]),
];

const storyBeats = [
  { arcBeat: 'ordinary_life', cardTitle: '平常的一天', cardText: '花店助理林夏澄仍在为迟到和体力不足发愁。', gameplayPurpose: '先从简单健身动作进入普通女孩的日常。' },
  { arcBeat: 'identity_revelation', cardTitle: '王室来信', cardText: '家族档案确认：她本来就是晴屿王国的公主与继承人。', gameplayPurpose: '确认身份后用短小形象训练立即回到玩法。' },
  { arcBeat: 'short_training', cardTitle: '礼仪导师', cardText: '王室导师闻雪仪为首次亮相安排穿搭与礼仪训练。', gameplayPurpose: '穿搭与礼仪动作直接准备首次公开亮相。' },
  { arcBeat: 'short_training', cardTitle: '王室课程', cardText: '她必须补上王国历史、族谱与公开演讲课程。', gameplayPurpose: '学习动作服务于理解身份和完成亮相演说。' },
  { arcBeat: 'double_life', cardTitle: '两张日程表', cardText: '白天继续花店工作，晚上接受王室短训。', gameplayPurpose: '事业动作表现普通生活与王室身份并行。' },
  { arcBeat: 'public_test', cardTitle: '第一次亮相', cardText: '王室晚宴成为她第一次以公主身份面对公众的考验。', gameplayPurpose: '社交在事业达标后开放，并完成首次公开亮相。' },
  { arcBeat: 'public_test', cardTitle: '身份的距离', cardText: '身份曝光后，友情与恋爱都因隐瞒受到考验。', gameplayPurpose: '恋爱在社交后开放，选择坦诚修复亲密关系。' },
  { arcBeat: 'chosen_responsibility', cardTitle: '我愿意成为公主', cardText: '她决定公开接受公主身份，并用自己的话发表就任演说。', gameplayPurpose: '通过练演说、走上台和发表演说完成自主接受。' },
] as const;

const narrativeChapters = chapters.map((item, index) => ({
  ...item,
  storyBeat: {
    ...storyBeats[index]!,
    trigger: 'on_chapter_first_unlock',
    repeatPolicy: 'once_per_save',
    dismissal: 'tap_or_skip',
  },
}));

export const gameplayRevisionLock = {
  schemaVersion: 3,
  revisionId: 'original-princess-identity-v4',
  lockedBy: 'human',
  approval: {
    status: 'APPROVED',
    evidence: '用户确认采用普通女孩被确认本来就是公主与继承人、接受短训、经历双重生活和关系考验、最终自主公开接受身份的高层故事逻辑',
    approvedAt: '2026-08-31T04:00:00.000Z',
  },
  targetRunId: '20260830141456-e0aac979',
  title: '逆袭公主',
  supersedes: ['artifacts/gameplay-revision-lock-v3.json', 'artifacts/reference-core-gameplay-research.json'],
  researchArtifacts: [
    'artifacts/reference-core-gameplay-research.json',
    'artifacts/open-source-research.json',
  ],
  openSourceGate: {
    artifactPath: 'artifacts/open-source-research.json',
    outcome: 'NO_SUITABLE_CANDIDATE',
    noNewDependencies: true,
  },
  contentRules: {
    actionNamesDescribeVisibleVerbs: true,
    everyActionHasVisibleAnimation: true,
    forbiddenAbstractLabels: ['晨光舒展', '补水休整', '白天防护'],
  },
  narrativeDirection: {
    mode: 'original_modern_princess_identity',
    premise: '普通女孩被确认本来就是虚构王国的公主与继承人，在短训、双重生活和关系考验后自主公开接受身份。',
    protagonist: {
      name: '林夏澄',
      ordinaryIdentity: '城市花店助理',
      discoveredRole: '晴屿王国公主与继承人',
      agencyResolution: '不由导师替她决定，以自己的话公开接受公主身份并发表就任演说。',
    },
    fictionalSetting: {
      realmName: '晴屿王国',
      homeCityName: '云津市',
      contemporary: true,
      whollyFictional: true,
    },
    mentor: {
      name: '闻雪仪',
      role: '王室礼仪与历史导师',
      dramaticFunction: '安排短期形象、礼仪、历史和演讲训练，但不替主角决定是否公开接受身份。',
    },
    royalIdentity: {
      status: 'confirmed_princess_and_heir',
      innateIdentityNotSelection: true,
      candidacyOrQualificationPlotExcluded: true,
    },
    trainingPlan: {
      assignedByRoyalMentor: true,
      shortTerm: true,
      modules: ['image_and_self_care', 'etiquette', 'royal_history', 'public_speaking'],
    },
    relationshipTest: {
      friendshipAndRomanceAffectedByIdentity: true,
      resolvesThroughHonestyAndAgency: true,
    },
    finale: {
      publiclyAcceptsPrincessIdentity: true,
      speechType: 'accession_or_debut',
    },
    centralConflict: '突如其来的王室身份打乱普通生活，首次公开亮相又让友情与恋爱因隐瞒受到考验。',
    requiredArcBeats: ['ordinary_life', 'identity_revelation', 'short_training', 'double_life', 'public_test', 'chosen_responsibility'],
    delivery: {
      format: 'skippable_story_cards',
      storyCardsSkippable: true,
      maximumStoryCardCharacters: 48,
      gameplayActionAvailableBeforeStoryCard: true,
      storyCardsNeverBlockRepeatableActions: true,
    },
    originality: {
      originalCharacters: true,
      fictionalRealm: true,
      thirdPartyNamesAndDialogueExcluded: true,
      copiedSpecificPlotBeatsExcluded: true,
    },
  },
  marketingBoundary: {
    unlicensedOriginal: true,
    gameTitleMustRemainOriginal: true,
    storeListingCannotClaimOrImplyOfficialAdaptation: true,
    advertisingCannotUseThirdPartyTitleCharacterOrRealmNames: true,
    genericModernPrincessGrowthLanguageOnly: true,
    authorizedIpAdaptationRequiresSeparateApprovalFlow: true,
  },
  expressionBoundary: {
    approvedFormalDirection: 'clean_flat_vector_study_scene',
    excludedVisualReferencePackages: ['art-review/explorations/royal-coming-of-age-v2'],
    diaryOrJournalCoreVisualMetaphorExcluded: true,
    curlyHairRoundGlassesHeroineLookExcluded: true,
    signatureThirdPartyScenesExcluded: true,
  },
  coreLoop: {
    selectedActivityControlsVisibleAnimation: true,
    allUnlockedActivitiesContributePassiveRate: true,
    tapTarget: 'character',
    tapEffect: 'accelerate_current_activity',
    directCurrencyButton: false,
    eachActivityHasIndependentLevel: true,
    unlocksUseAllRequirements: true,
  },
  demoTuning: {
    tuningIsOriginal: true,
    actionCycleSeconds: 6,
    tapAccelerationSeconds: 1.5,
    baseRewardPerCycle: 4,
    levelRewardMultiplier: 1.55,
    upgradeCostFormula: 'ceil_base_times_growth_power_level_minus_one',
    upgradeCostBase: 8,
    upgradeCostGrowthMultiplier: 1.45,
    offlineProgressCapMinutes: 120,
    targetPacing: {
      firstUpgradeTargetSeconds: 15,
      firstChapterCompletionTargetSeconds: 120,
      secondChapterCompletionTargetSeconds: 300,
      minimumChaptersCompletedWithinFiveMinutes: 2,
    },
  },
  persistenceAndTestContract: {
    saveVersion: 4,
    stateFields: [
      'activeChapterId',
      'activeActivityId',
      'levels',
      'unlockedActivityIds',
      'archivedChapterIds',
      'seenStoryCardIds',
      'visibleDecisionIds',
      'roadmapOpen',
      'eventSeq',
    ],
    testCommands: ['selectActivity', 'dismissStoryCard', 'openRoadmap', 'closeRoadmap'],
    invariants: {
      visibleDecisionIdsMaximum: 3,
      eventSeqMonotonic: true,
      storyCardSeenStatePersists: true,
      archivedActivitiesKeepProducing: true,
    },
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
  chapters: narrativeChapters,
  demoAcceptance: {
    firstViewportContainsCurrentActionNextActionAndNextChapter: true,
    primaryActionRequiresNoScroll: true,
    mobileTouchTargetMinimumPx: 44,
    roadmapNotOpenByDefault: true,
    lockedRequirementShowsCurrentAndRequiredLevels: true,
    allEightChaptersExistInData: true,
    storyStateExposesCurrentChapterId: true,
    storyStateExposesSeenCardIds: true,
    storyCardCanBeSkipped: true,
    storyCardNeverBlocksPrimaryAction: true,
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

describe('human-approved gameplay revision lock', () => {
  it('accepts the confirmed-princess identity arc while keeping the eight-stage action graph', () => {
    const revisionSchema = (schemas as Record<string, unknown>).GameplayRevisionLockSchema as
      | { parse: (value: unknown) => typeof gameplayRevisionLock }
      | undefined;

    expect(revisionSchema).toBeDefined();
    expect(revisionSchema?.parse(gameplayRevisionLock)).toMatchObject({
      title: '逆袭公主',
      revisionId: 'original-princess-identity-v4',
      narrativeDirection: {
        mode: 'original_modern_princess_identity',
        royalIdentity: {
          status: 'confirmed_princess_and_heir',
          innateIdentityNotSelection: true,
        },
        finale: {
          publiclyAcceptsPrincessIdentity: true,
          speechType: 'accession_or_debut',
        },
        delivery: {
          storyCardsSkippable: true,
          gameplayActionAvailableBeforeStoryCard: true,
        },
      },
      marketingBoundary: {
        unlicensedOriginal: true,
        storeListingCannotClaimOrImplyOfficialAdaptation: true,
      },
      expressionBoundary: {
        approvedFormalDirection: 'clean_flat_vector_study_scene',
        diaryOrJournalCoreVisualMetaphorExcluded: true,
      },
      demoTuning: {
        targetPacing: {
          minimumChaptersCompletedWithinFiveMinutes: 2,
        },
      },
      persistenceAndTestContract: {
        invariants: {
          visibleDecisionIdsMaximum: 3,
          eventSeqMonotonic: true,
        },
      },
      progressiveDisclosure: { maximumSimultaneousDecisions: 3 },
      chapters: expect.arrayContaining([
        expect.objectContaining({ id: 'social', requireAll: expect.any(Array) }),
        expect.objectContaining({ id: 'romance', requireAll: expect.any(Array) }),
        expect.objectContaining({
          id: 'leadership',
          storyBeat: expect.objectContaining({ repeatPolicy: 'once_per_save', dismissal: 'tap_or_skip' }),
          actions: expect.arrayContaining([expect.objectContaining({ id: 'public-speech' })]),
        }),
      ]),
      demoAcceptance: {
        storyStateExposesCurrentChapterId: true,
        storyStateExposesSeenCardIds: true,
        storyCardNeverBlocksPrimaryAction: true,
      },
    });
  });

  it('requires every narrative-lock chapter to carry a short story beat in arc order', () => {
    const revisionSchema = (schemas as Record<string, unknown>).GameplayRevisionLockSchema as
      | { parse: (value: unknown) => typeof gameplayRevisionLock }
      | undefined;
    expect(revisionSchema).toBeDefined();

    const missingBeat = structuredClone(gameplayRevisionLock) as Record<string, any>;
    delete missingBeat.chapters[2].storyBeat;
    const longCard = structuredClone(gameplayRevisionLock) as Record<string, any>;
    longCard.chapters[1]!.storyBeat.cardText = '这是一段故意写得非常非常长的故事卡文字，它会挤占手机首屏并拖慢玩家进入可重复动作的速度，因此必须被数据契约拒绝。';
    const reversedArc = structuredClone(gameplayRevisionLock) as Record<string, any>;
    reversedArc.chapters[6]!.storyBeat.arcBeat = 'ordinary_life';

    expect(() => revisionSchema?.parse(missingBeat)).toThrow(/story beat|storyBeat|chapter/i);
    expect(() => revisionSchema?.parse(longCard)).toThrow(/48|character|short|too_big/i);
    expect(() => revisionSchema?.parse(reversedArc)).toThrow(/arc|order|sequence/i);
  });

  it('rejects third-party names and narrative delivery that blocks or delays gameplay', () => {
    const revisionSchema = (schemas as Record<string, unknown>).GameplayRevisionLockSchema as
      | { parse: (value: unknown) => typeof gameplayRevisionLock }
      | undefined;
    expect(revisionSchema).toBeDefined();

    const copiedName = structuredClone(gameplayRevisionLock);
    copiedName.narrativeDirection.protagonist.name = '米娅';
    const blockingStory = structuredClone(gameplayRevisionLock) as Record<string, any>;
    blockingStory.narrativeDirection.delivery.gameplayActionAvailableBeforeStoryCard = false;

    expect(() => revisionSchema?.parse(copiedName)).toThrow(/third-party|original|name/i);
    expect(() => revisionSchema?.parse(blockingStory)).toThrow(/true|literal|gameplay/i);
  });

  it('rejects candidate-selection, qualification-review, and community-project rewrites in version four', () => {
    const revisionSchema = (schemas as Record<string, unknown>).GameplayRevisionLockSchema as
      | { parse: (value: unknown) => typeof gameplayRevisionLock }
      | undefined;
    expect(revisionSchema).toBeDefined();

    const candidateRewrite = structuredClone(gameplayRevisionLock) as Record<string, any>;
    candidateRewrite.narrativeDirection.centralConflict = '她必须通过继承候选人的资格审查，并提交社区方案。';

    expect(() => revisionSchema?.parse(candidateRewrite)).toThrow(/candidate|qualification|community|候选|资格|社区/i);
  });

  it('keeps game and marketing expression original unless a separate IP authorization flow is approved', () => {
    const revisionSchema = (schemas as Record<string, unknown>).GameplayRevisionLockSchema as
      | { parse: (value: unknown) => typeof gameplayRevisionLock }
      | undefined;
    expect(revisionSchema).toBeDefined();

    const impliedAdaptation = structuredClone(gameplayRevisionLock) as Record<string, any>;
    impliedAdaptation.marketingBoundary.storeListingCannotClaimOrImplyOfficialAdaptation = false;
    const riskyVisualPackage = structuredClone(gameplayRevisionLock) as Record<string, any>;
    riskyVisualPackage.expressionBoundary.excludedVisualReferencePackages = [];

    expect(() => revisionSchema?.parse(impliedAdaptation)).toThrow(/true|literal|adaptation|marketing/i);
    expect(() => revisionSchema?.parse(riskyVisualPackage)).toThrow(/royal-coming-of-age-v2|visual|reference/i);
  });

  it('locks original five-minute demo pacing and a reproducible persistence/test contract', () => {
    const revisionSchema = (schemas as Record<string, unknown>).GameplayRevisionLockSchema as
      | { parse: (value: unknown) => typeof gameplayRevisionLock }
      | undefined;
    expect(revisionSchema).toBeDefined();

    const tooSlow = structuredClone(gameplayRevisionLock);
    tooSlow.demoTuning.targetPacing.secondChapterCompletionTargetSeconds = 301;
    const missingStoryState = structuredClone(gameplayRevisionLock);
    missingStoryState.persistenceAndTestContract.stateFields = missingStoryState.persistenceAndTestContract.stateFields
      .filter((field) => field !== 'seenStoryCardIds');
    const tooManyDecisions = structuredClone(gameplayRevisionLock) as Record<string, any>;
    tooManyDecisions.persistenceAndTestContract.invariants.visibleDecisionIdsMaximum = 4;

    expect(() => revisionSchema?.parse(tooSlow)).toThrow(/300|five.minute|pacing/i);
    expect(() => revisionSchema?.parse(missingStoryState)).toThrow(/seenStoryCardIds|state field/i);
    expect(() => revisionSchema?.parse(tooManyDecisions)).toThrow(/3|decision/i);
  });

  it('rejects abstract action labels and more than three simultaneous decisions', () => {
    const revisionSchema = (schemas as Record<string, unknown>).GameplayRevisionLockSchema as
      | { parse: (value: unknown) => typeof gameplayRevisionLock }
      | undefined;
    expect(revisionSchema).toBeDefined();

    const abstractAction = structuredClone(gameplayRevisionLock);
    abstractAction.chapters[0]!.actions[0]!.name = '晨光舒展';
    const overloaded = structuredClone(gameplayRevisionLock);
    overloaded.progressiveDisclosure.maximumSimultaneousDecisions = 4;

    expect(() => revisionSchema?.parse(abstractAction)).toThrow(/abstract|forbidden|visible/i);
    expect(() => revisionSchema?.parse(overloaded)).toThrow();
  });

  it('rejects soft-locks and social or romance without combined prior requirements', () => {
    const revisionSchema = (schemas as Record<string, unknown>).GameplayRevisionLockSchema as
      | { parse: (value: unknown) => typeof gameplayRevisionLock }
      | undefined;
    expect(revisionSchema).toBeDefined();

    const futureDependency = structuredClone(gameplayRevisionLock);
    futureDependency.chapters[0]!.actions[0]!.requireAll = [{ activityId: 'public-speech', minimumLevel: 1 }];
    const flatSocial = structuredClone(gameplayRevisionLock);
    flatSocial.chapters.find(({ id }) => id === 'social')!.requireAll = [{ activityId: 'work-shift', minimumLevel: 2 }];

    expect(() => revisionSchema?.parse(futureDependency)).toThrow(/future|soft-lock|earlier/i);
    expect(() => revisionSchema?.parse(flatSocial)).toThrow(/social|combined|requirements/i);
  });

  it('allows the technical blueprint to embed only an approved matching revision', () => {
    const blueprintSchema = schemas.GameBlueprintSchema;
    const referenceMechanics = {
      schemaVersion: 1,
      lockedBy: 'human',
      source: { name: 'Benchmark', url: 'https://example.com/reference', researchFiles: [] },
      coreLoop: ['act', 'earn', 'upgrade', 'unlock'],
      playerActions: ['tap character'],
      progressionSystems: ['activity graph'],
      unlockRules: ['visible locked next goal'],
      feedbackCadence: { immediateSeconds: 1, microGoalMinSeconds: 10, microGoalMaxSeconds: 300 },
      mustPreserveMechanics: ['active and passive progress coexist'],
      adaptableMechanics: ['original content'],
      expressionIsolation: { originalCode: true, originalAssets: true, originalNamesAndText: true, originalUiLayout: true, originalAudio: true, originalTuningValues: true },
    };
    const blueprint = {
      schemaVersion: 1,
      gameId: 'princess-reversal',
      title: '逆袭公主',
      theme: '都市成长',
      runtime: 'web-lite',
      template: 'idle-shop-v1',
      designMode: 'reference_reskin',
      referenceMechanics,
      gameplayRevision: {
        artifactPath: 'artifacts/gameplay-revision-lock-v4.json',
        revisionId: gameplayRevisionLock.revisionId,
        targetRunId: gameplayRevisionLock.targetRunId,
        title: gameplayRevisionLock.title,
      },
      targetPlatforms: ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'],
      concept: '通过具体行为和渐进解锁完成人生成长',
      coreLoop: ['act', 'earn', 'upgrade', 'unlock'],
      content: { productName: '行动', customerName: '女孩', currencyName: '成长值' },
      balance: { startingCurrency: 0, orderReward: 1, baseUpgradeCost: 2 },
      preferences: {},
    };

    expect(blueprintSchema.parse(blueprint)).toMatchObject({ gameplayRevision: { revisionId: 'original-princess-identity-v4' } });
    expect(() => blueprintSchema.parse({ ...blueprint, title: '其他游戏' })).toThrow(/revision|title|target/i);
  });
});
