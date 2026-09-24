import { z } from 'zod';

const NonEmptyStringSchema = z.string().trim().min(1);
const RequirementSchema = z.object({
  activityId: NonEmptyStringSchema,
  minimumLevel: z.number().int().positive(),
}).strict();

const NarrativeArcBeatSchema = z.enum([
  'ordinary_life',
  'identity_revelation',
  'short_training',
  'double_life',
  'public_test',
  'chosen_responsibility',
]);

const ChapterStoryBeatSchema = z.object({
  arcBeat: NarrativeArcBeatSchema,
  cardTitle: NonEmptyStringSchema.max(16),
  cardText: NonEmptyStringSchema.max(48),
  gameplayPurpose: NonEmptyStringSchema.max(64),
  trigger: z.literal('on_chapter_first_unlock'),
  repeatPolicy: z.literal('once_per_save'),
  dismissal: z.literal('tap_or_skip'),
}).strict();

const NarrativeDirectionV3Schema = z.object({
  mode: z.literal('original_modern_princess_growth'),
  premise: NonEmptyStringSchema.max(120),
  protagonist: z.object({
    name: NonEmptyStringSchema.max(20),
    ordinaryIdentity: NonEmptyStringSchema.max(40),
    discoveredRole: NonEmptyStringSchema.max(40),
    agencyResolution: NonEmptyStringSchema.max(100),
  }).strict(),
  fictionalSetting: z.object({
    realmName: NonEmptyStringSchema.max(24),
    homeCityName: NonEmptyStringSchema.max(24),
    contemporary: z.literal(true),
    whollyFictional: z.literal(true),
  }).strict(),
  mentor: z.object({
    name: NonEmptyStringSchema.max(20),
    role: NonEmptyStringSchema.max(40),
    dramaticFunction: NonEmptyStringSchema.max(80),
  }).strict(),
  centralConflict: NonEmptyStringSchema.max(120),
  requiredArcBeats: z.tuple([
    z.literal('ordinary_life'),
    z.literal('identity_revelation'),
    z.literal('short_training'),
    z.literal('double_life'),
    z.literal('public_test'),
    z.literal('chosen_responsibility'),
  ]),
  delivery: z.object({
    format: z.literal('skippable_story_cards'),
    storyCardsSkippable: z.literal(true),
    maximumStoryCardCharacters: z.literal(48),
    gameplayActionAvailableBeforeStoryCard: z.literal(true),
    storyCardsNeverBlockRepeatableActions: z.literal(true),
  }).strict(),
  originality: z.object({
    originalCharacters: z.literal(true),
    fictionalRealm: z.literal(true),
    thirdPartyNamesAndDialogueExcluded: z.literal(true),
    copiedSpecificPlotBeatsExcluded: z.literal(true),
  }).strict(),
}).strict();

const NarrativeDirectionV4Schema = z.object({
  mode: z.literal('original_modern_princess_identity'),
  premise: NonEmptyStringSchema.max(120),
  protagonist: z.object({
    name: NonEmptyStringSchema.max(20),
    ordinaryIdentity: NonEmptyStringSchema.max(40),
    discoveredRole: NonEmptyStringSchema.max(40),
    agencyResolution: NonEmptyStringSchema.max(100),
  }).strict(),
  fictionalSetting: z.object({
    realmName: NonEmptyStringSchema.max(24),
    homeCityName: NonEmptyStringSchema.max(24),
    contemporary: z.literal(true),
    whollyFictional: z.literal(true),
  }).strict(),
  mentor: z.object({
    name: NonEmptyStringSchema.max(20),
    role: NonEmptyStringSchema.max(40),
    dramaticFunction: NonEmptyStringSchema.max(80),
  }).strict(),
  royalIdentity: z.object({
    status: z.literal('confirmed_princess_and_heir'),
    innateIdentityNotSelection: z.literal(true),
    candidacyOrQualificationPlotExcluded: z.literal(true),
  }).strict(),
  trainingPlan: z.object({
    assignedByRoyalMentor: z.literal(true),
    shortTerm: z.literal(true),
    modules: z.tuple([
      z.literal('image_and_self_care'),
      z.literal('etiquette'),
      z.literal('royal_history'),
      z.literal('public_speaking'),
    ]),
  }).strict(),
  relationshipTest: z.object({
    friendshipAndRomanceAffectedByIdentity: z.literal(true),
    resolvesThroughHonestyAndAgency: z.literal(true),
  }).strict(),
  finale: z.object({
    publiclyAcceptsPrincessIdentity: z.literal(true),
    speechType: z.literal('accession_or_debut'),
  }).strict(),
  centralConflict: NonEmptyStringSchema.max(120),
  requiredArcBeats: z.tuple([
    z.literal('ordinary_life'),
    z.literal('identity_revelation'),
    z.literal('short_training'),
    z.literal('double_life'),
    z.literal('public_test'),
    z.literal('chosen_responsibility'),
  ]),
  delivery: z.object({
    format: z.literal('skippable_story_cards'),
    storyCardsSkippable: z.literal(true),
    maximumStoryCardCharacters: z.literal(48),
    gameplayActionAvailableBeforeStoryCard: z.literal(true),
    storyCardsNeverBlockRepeatableActions: z.literal(true),
  }).strict(),
  originality: z.object({
    originalCharacters: z.literal(true),
    fictionalRealm: z.literal(true),
    thirdPartyNamesAndDialogueExcluded: z.literal(true),
    copiedSpecificPlotBeatsExcluded: z.literal(true),
  }).strict(),
}).strict();

const MarketingBoundarySchema = z.object({
  unlicensedOriginal: z.literal(true),
  gameTitleMustRemainOriginal: z.literal(true),
  storeListingCannotClaimOrImplyOfficialAdaptation: z.literal(true),
  advertisingCannotUseThirdPartyTitleCharacterOrRealmNames: z.literal(true),
  genericModernPrincessGrowthLanguageOnly: z.literal(true),
  authorizedIpAdaptationRequiresSeparateApprovalFlow: z.literal(true),
}).strict();

const ExpressionBoundarySchema = z.object({
  approvedFormalDirection: z.literal('clean_flat_vector_study_scene'),
  excludedVisualReferencePackages: z.array(NonEmptyStringSchema).min(1)
    .refine((paths) => paths.includes('art-review/explorations/royal-coming-of-age-v2'), 'the risky royal-coming-of-age-v2 visual reference package must be excluded'),
  diaryOrJournalCoreVisualMetaphorExcluded: z.literal(true),
  curlyHairRoundGlassesHeroineLookExcluded: z.literal(true),
  signatureThirdPartyScenesExcluded: z.literal(true),
}).strict();

const DemoTuningSchema = z.object({
  tuningIsOriginal: z.literal(true),
  actionCycleSeconds: z.number().positive().max(30),
  tapAccelerationSeconds: z.number().positive().max(10),
  baseRewardPerCycle: z.number().positive(),
  levelRewardMultiplier: z.number().gt(1).max(3),
  upgradeCostFormula: z.literal('ceil_base_times_growth_power_level_minus_one'),
  upgradeCostBase: z.number().positive(),
  upgradeCostGrowthMultiplier: z.number().gt(1).max(3),
  offlineProgressCapMinutes: z.number().int().positive().max(480),
  targetPacing: z.object({
    firstUpgradeTargetSeconds: z.number().positive().max(60),
    firstChapterCompletionTargetSeconds: z.number().positive().max(240),
    secondChapterCompletionTargetSeconds: z.number().positive().max(300),
    minimumChaptersCompletedWithinFiveMinutes: z.number().int().min(2),
  }).strict(),
}).strict().superRefine((tuning, context) => {
  if (tuning.tapAccelerationSeconds > tuning.actionCycleSeconds) {
    context.addIssue({ code: 'custom', path: ['tapAccelerationSeconds'], message: 'tap acceleration cannot exceed the full action cycle' });
  }
  const pacing = tuning.targetPacing;
  if (!(pacing.firstUpgradeTargetSeconds < pacing.firstChapterCompletionTargetSeconds
    && pacing.firstChapterCompletionTargetSeconds < pacing.secondChapterCompletionTargetSeconds)) {
    context.addIssue({ code: 'custom', path: ['targetPacing'], message: 'demo pacing targets must progress in chronological order' });
  }
});

const RequiredStateFields = [
  'activeChapterId',
  'activeActivityId',
  'levels',
  'unlockedActivityIds',
  'archivedChapterIds',
  'seenStoryCardIds',
  'visibleDecisionIds',
  'roadmapOpen',
  'eventSeq',
] as const;

const RequiredTestCommands = ['selectActivity', 'dismissStoryCard', 'openRoadmap', 'closeRoadmap'] as const;

const PersistenceAndTestContractSchema = z.object({
  saveVersion: z.number().int().positive(),
  stateFields: z.array(NonEmptyStringSchema).min(RequiredStateFields.length),
  testCommands: z.array(NonEmptyStringSchema).min(RequiredTestCommands.length),
  invariants: z.object({
    visibleDecisionIdsMaximum: z.literal(3),
    eventSeqMonotonic: z.literal(true),
    storyCardSeenStatePersists: z.literal(true),
    archivedActivitiesKeepProducing: z.literal(true),
  }).strict(),
}).strict().superRefine((contract, context) => {
  if (new Set(contract.stateFields).size !== contract.stateFields.length) {
    context.addIssue({ code: 'custom', path: ['stateFields'], message: 'persistence state fields must be unique' });
  }
  for (const field of RequiredStateFields) {
    if (!contract.stateFields.includes(field)) {
      context.addIssue({ code: 'custom', path: ['stateFields'], message: `persistence contract requires state field ${field}` });
    }
  }
  if (new Set(contract.testCommands).size !== contract.testCommands.length) {
    context.addIssue({ code: 'custom', path: ['testCommands'], message: 'test commands must be unique' });
  }
  for (const command of RequiredTestCommands) {
    if (!contract.testCommands.includes(command)) {
      context.addIssue({ code: 'custom', path: ['testCommands'], message: `test contract requires command ${command}` });
    }
  }
});

const ActivitySchema = z.object({
  id: NonEmptyStringSchema,
  order: z.number().int().positive(),
  name: NonEmptyStringSchema,
  visibleVerb: NonEmptyStringSchema,
  kind: z.enum(['repeated_action', 'purchase']),
  animationRequired: z.literal(true),
  contributesPassiveRate: z.boolean(),
  requireAll: z.array(RequirementSchema),
}).strict().superRefine((activity, context) => {
  if (activity.kind === 'repeated_action' && !activity.contributesPassiveRate) {
    context.addIssue({ code: 'custom', message: 'repeated actions must contribute passive production' });
  }
  if (activity.kind === 'purchase' && activity.contributesPassiveRate) {
    context.addIssue({ code: 'custom', message: 'home purchases are visible wealth sinks, not passive production actions' });
  }
});

const ChapterSchema = z.object({
  id: NonEmptyStringSchema,
  order: z.number().int().positive(),
  name: NonEmptyStringSchema,
  milestoneTransformation: NonEmptyStringSchema,
  storyBeat: ChapterStoryBeatSchema.optional(),
  requireAll: z.array(RequirementSchema),
  actions: z.array(ActivitySchema).length(3),
}).strict();

const OriginalExpressionOnlySchema = z.object({
  originalCode: z.literal(true),
  originalAssets: z.literal(true),
  originalNamesAndText: z.literal(true),
  originalUiLayout: z.literal(true),
  originalAudio: z.literal(true),
  originalTuningValues: z.literal(true),
}).strict();

const TargetPlatformsSchema = z.array(z.enum(['wechat-minigame', 'douyin-minigame', 'taptap-minigame']))
  .length(3)
  .superRefine((platforms, context) => {
    const required = ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'];
    if (new Set(platforms).size !== required.length || required.some((platform) => !platforms.includes(platform as typeof platforms[number]))) {
      context.addIssue({ code: 'custom', message: 'gameplay revisions must retain all three target mini-game platforms' });
    }
  });

export const GameplayRevisionLockSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  revisionId: NonEmptyStringSchema,
  lockedBy: z.literal('human'),
  approval: z.object({
    status: z.literal('APPROVED'),
    evidence: NonEmptyStringSchema,
    approvedAt: z.string().datetime(),
  }).strict(),
  targetRunId: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
  supersedes: z.array(NonEmptyStringSchema).min(1),
  researchArtifacts: z.array(NonEmptyStringSchema).min(2),
  openSourceGate: z.object({
    artifactPath: NonEmptyStringSchema,
    outcome: z.literal('NO_SUITABLE_CANDIDATE'),
    noNewDependencies: z.literal(true),
  }).strict(),
  contentRules: z.object({
    actionNamesDescribeVisibleVerbs: z.literal(true),
    everyActionHasVisibleAnimation: z.literal(true),
    forbiddenAbstractLabels: z.array(NonEmptyStringSchema).min(1),
  }).strict(),
  narrativeDirection: z.union([NarrativeDirectionV3Schema, NarrativeDirectionV4Schema]).optional(),
  marketingBoundary: MarketingBoundarySchema.optional(),
  expressionBoundary: ExpressionBoundarySchema.optional(),
  coreLoop: z.object({
    selectedActivityControlsVisibleAnimation: z.literal(true),
    allUnlockedActivitiesContributePassiveRate: z.literal(true),
    tapTarget: z.literal('character'),
    tapEffect: z.literal('accelerate_current_activity'),
    directCurrencyButton: z.literal(false),
    eachActivityHasIndependentLevel: z.literal(true),
    unlocksUseAllRequirements: z.literal(true),
  }).strict(),
  demoTuning: DemoTuningSchema.optional(),
  persistenceAndTestContract: PersistenceAndTestContractSchema.optional(),
  progressiveDisclosure: z.object({
    maximumSimultaneousDecisions: z.literal(3),
    showCurrentAction: z.literal(true),
    showNextAction: z.literal(true),
    showNextChapterPreview: z.literal(true),
    hideChaptersBeyondNext: z.literal(true),
    previousChaptersMoveToArchive: z.literal(true),
    archivedActivitiesRemainPassive: z.literal(true),
    fullRoadmapUsesSeparateOverlay: z.literal(true),
    socialHiddenUntilCareer: z.literal(true),
    romanceHiddenUntilSocial: z.literal(true),
  }).strict(),
  chapters: z.array(ChapterSchema).min(2),
  demoAcceptance: z.object({
    firstViewportContainsCurrentActionNextActionAndNextChapter: z.literal(true),
    primaryActionRequiresNoScroll: z.literal(true),
    mobileTouchTargetMinimumPx: z.number().int().min(44),
    roadmapNotOpenByDefault: z.literal(true),
    lockedRequirementShowsCurrentAndRequiredLevels: z.literal(true),
    allEightChaptersExistInData: z.literal(true),
    storyStateExposesCurrentChapterId: z.literal(true).optional(),
    storyStateExposesSeenCardIds: z.literal(true).optional(),
    storyCardCanBeSkipped: z.literal(true).optional(),
    storyCardNeverBlocksPrimaryAction: z.literal(true).optional(),
  }).strict(),
  targetPlatforms: TargetPlatformsSchema,
  expressionIsolation: OriginalExpressionOnlySchema,
}).strict().superRefine((revision, context) => {
  if (revision.chapters.length !== 8) {
    context.addIssue({ code: 'custom', path: ['chapters'], message: 'the approved revision requires all eight life chapters in data' });
  }

  const chapterIds = revision.chapters.map(({ id }) => id);
  const chapterOrders = revision.chapters.map(({ order }) => order);
  if (new Set(chapterIds).size !== chapterIds.length) {
    context.addIssue({ code: 'custom', path: ['chapters'], message: 'chapter ids must be unique' });
  }
  if (new Set(chapterOrders).size !== chapterOrders.length || [...chapterOrders].sort((a, b) => a - b).some((order, index) => order !== index + 1)) {
    context.addIssue({ code: 'custom', path: ['chapters'], message: 'chapter order must be unique and consecutive' });
  }

  const actionLocations = new Map<string, { chapterOrder: number; actionOrder: number }>();
  for (const chapter of revision.chapters) {
    const actionOrders = chapter.actions.map(({ order }) => order);
    if (new Set(actionOrders).size !== 3 || [...actionOrders].sort((a, b) => a - b).some((order, index) => order !== index + 1)) {
      context.addIssue({ code: 'custom', path: ['chapters'], message: `actions in ${chapter.id} must have order 1, 2, 3` });
    }
    for (const activity of chapter.actions) {
      if (actionLocations.has(activity.id)) {
        context.addIssue({ code: 'custom', path: ['chapters'], message: `activity id ${activity.id} must be globally unique` });
      }
      actionLocations.set(activity.id, { chapterOrder: chapter.order, actionOrder: activity.order });
    }
  }

  if (revision.schemaVersion !== 1) {
    if (!revision.narrativeDirection) {
      context.addIssue({ code: 'custom', path: ['narrativeDirection'], message: 'narrative gameplay revisions require an original narrative direction' });
    }
    if (!revision.marketingBoundary) {
      context.addIssue({ code: 'custom', path: ['marketingBoundary'], message: 'narrative gameplay revisions require an unlicensed-original marketing boundary' });
    }
    if (!revision.expressionBoundary) {
      context.addIssue({ code: 'custom', path: ['expressionBoundary'], message: 'narrative gameplay revisions require an original visual-expression boundary' });
    }
    if (!revision.demoTuning) {
      context.addIssue({ code: 'custom', path: ['demoTuning'], message: 'narrative gameplay revisions require original reproducible demo tuning' });
    }
    if (!revision.persistenceAndTestContract) {
      context.addIssue({ code: 'custom', path: ['persistenceAndTestContract'], message: 'narrative gameplay revisions require a persistence and test contract' });
    }

    const arcOrder: Record<z.infer<typeof NarrativeArcBeatSchema>, number> = {
      ordinary_life: 0,
      identity_revelation: 1,
      short_training: 2,
      double_life: 3,
      public_test: 4,
      chosen_responsibility: 5,
    };
    const seenArcBeats = new Set<z.infer<typeof NarrativeArcBeatSchema>>();
    let priorArcOrder = -1;
    for (const chapter of revision.chapters) {
      if (!chapter.storyBeat) {
        context.addIssue({ code: 'custom', path: ['chapters'], message: `chapter ${chapter.id} requires a story beat in a narrative lock` });
        continue;
      }
      const currentArcOrder = arcOrder[chapter.storyBeat.arcBeat];
      if (currentArcOrder < priorArcOrder) {
        context.addIssue({ code: 'custom', path: ['chapters'], message: `chapter ${chapter.id} breaks the narrative arc sequence order` });
      }
      priorArcOrder = currentArcOrder;
      seenArcBeats.add(chapter.storyBeat.arcBeat);
    }
    for (const requiredBeat of Object.keys(arcOrder) as Array<keyof typeof arcOrder>) {
      if (!seenArcBeats.has(requiredBeat)) {
        context.addIssue({ code: 'custom', path: ['chapters'], message: `narrative arc is missing required beat ${requiredBeat}` });
      }
    }
    if (revision.chapters.at(-1)?.storyBeat?.arcBeat !== 'chosen_responsibility') {
      context.addIssue({ code: 'custom', path: ['chapters'], message: 'the narrative arc must resolve with chosen responsibility' });
    }

    const requiredStorySignals = [
      'storyStateExposesCurrentChapterId',
      'storyStateExposesSeenCardIds',
      'storyCardCanBeSkipped',
      'storyCardNeverBlocksPrimaryAction',
    ] as const;
    for (const signal of requiredStorySignals) {
      if (revision.demoAcceptance[signal] !== true) {
        context.addIssue({ code: 'custom', path: ['demoAcceptance', signal], message: `narrative revisions require the ${signal} QA signal` });
      }
    }

    const career = revision.chapters.find(({ id }) => id === 'career');
    const social = revision.chapters.find(({ id }) => id === 'social');
    const romance = revision.chapters.find(({ id }) => id === 'romance');
    const leadership = revision.chapters.find(({ id }) => id === 'leadership');
    if (!career || !social || !romance || !leadership || !(career.order < social.order && social.order < romance.order && romance.order < leadership.order)) {
      context.addIssue({ code: 'custom', path: ['chapters'], message: 'modern princess growth requires career before social, social before romance, and leadership last' });
    } else {
      const careerActionIds = new Set(career.actions.map(({ id }) => id));
      const socialActionIds = new Set(social.actions.map(({ id }) => id));
      if (!social.requireAll.some(({ activityId }) => careerActionIds.has(activityId))) {
        context.addIssue({ code: 'custom', path: ['chapters'], message: 'social requires a completed career or public-appearance action' });
      }
      if (!romance.requireAll.some(({ activityId }) => socialActionIds.has(activityId))) {
        context.addIssue({ code: 'custom', path: ['chapters'], message: 'romance requires prior social progress' });
      }
      const finale = leadership.actions.at(-1);
      if (!finale || !/(公开|演说|发言|speech|address)/iu.test(`${finale.name} ${finale.visibleVerb}`)) {
        context.addIssue({ code: 'custom', path: ['chapters'], message: 'leadership must culminate in a visible public speech action' });
      }
    }

    const forbiddenThirdPartyTerms = ['安妮海瑟薇', '安妮·海瑟薇', '公主日记', '米娅', '瑟莫波利斯', '热那亚维亚', 'genovia'];
    const narrativeText = JSON.stringify({ narrativeDirection: revision.narrativeDirection, chapters: revision.chapters }).toLocaleLowerCase();
    const copiedTerm = forbiddenThirdPartyTerms.find((term) => narrativeText.includes(term.toLocaleLowerCase()));
    if (copiedTerm) {
      context.addIssue({ code: 'custom', path: ['narrativeDirection'], message: 'third-party character, setting, title, or dialogue terms are forbidden; use original expression' });
    }

    if (revision.schemaVersion === 2 && revision.narrativeDirection?.mode !== 'original_modern_princess_growth') {
      context.addIssue({ code: 'custom', path: ['narrativeDirection'], message: 'schema version two requires its original modern-princess growth direction' });
    }
    if (revision.schemaVersion === 3) {
      if (revision.narrativeDirection?.mode !== 'original_modern_princess_identity') {
        context.addIssue({ code: 'custom', path: ['narrativeDirection'], message: 'schema version three requires the confirmed original princess identity direction' });
      }
      if (!revision.supersedes.includes('artifacts/gameplay-revision-lock-v3.json')) {
        context.addIssue({ code: 'custom', path: ['supersedes'], message: 'version four must supersede gameplay-revision-lock-v3.json without overwriting it' });
      }
      const deprecatedPlotTerms = ['继承候选', '候选人', '资格审查', '遴选', '社区方案', '公共项目', 'candidate selection', 'qualification review', 'community proposal'];
      const deprecatedTerm = deprecatedPlotTerms.find((term) => narrativeText.includes(term.toLocaleLowerCase()));
      if (deprecatedTerm) {
        context.addIssue({ code: 'custom', path: ['narrativeDirection'], message: 'candidate selection, qualification review, and community-project plot rewrites are forbidden in version four' });
      }
      const socialText = JSON.stringify(revision.chapters.find(({ id }) => id === 'social') ?? '').toLocaleLowerCase();
      const romanceText = JSON.stringify(revision.chapters.find(({ id }) => id === 'romance') ?? '').toLocaleLowerCase();
      if (!/(亮相|公开|public appearance|debut)/iu.test(socialText)) {
        context.addIssue({ code: 'custom', path: ['chapters'], message: 'the social chapter must deliver the first public princess appearance' });
      }
      if (!/(友情|朋友|friend)/iu.test(romanceText) || !/(恋爱|喜欢|romance)/iu.test(romanceText) || !/(身份|identity)/iu.test(romanceText)) {
        context.addIssue({ code: 'custom', path: ['chapters'], message: 'the romance chapter must test both friendship and romance through the revealed identity' });
      }
    }
  }

  const forbidden = new Set(revision.contentRules.forbiddenAbstractLabels.map((label) => label.trim().toLocaleLowerCase()));
  for (const chapter of revision.chapters) {
    if (chapter.order === 1 && chapter.requireAll.length !== 0) {
      context.addIssue({ code: 'custom', path: ['chapters'], message: 'the first chapter cannot depend on future progress' });
    }
    if (chapter.order > 1 && chapter.requireAll.length === 0) {
      context.addIssue({ code: 'custom', path: ['chapters'], message: `chapter ${chapter.id} requires at least one earlier activity gate` });
    }
    for (const requirement of chapter.requireAll) {
      const target = actionLocations.get(requirement.activityId);
      if (!target) {
        context.addIssue({ code: 'custom', path: ['chapters'], message: `chapter ${chapter.id} references unknown activity ${requirement.activityId}` });
      } else if (target.chapterOrder >= chapter.order) {
        context.addIssue({ code: 'custom', path: ['chapters'], message: `chapter ${chapter.id} has a future dependency that would create a soft-lock` });
      }
    }
    for (const activity of chapter.actions) {
      if (forbidden.has(activity.name.trim().toLocaleLowerCase())) {
        context.addIssue({ code: 'custom', path: ['chapters'], message: `activity ${activity.id} uses a forbidden abstract label instead of a visible action` });
      }
      for (const requirement of activity.requireAll) {
        const target = actionLocations.get(requirement.activityId);
        if (!target) {
          context.addIssue({ code: 'custom', path: ['chapters'], message: `activity ${activity.id} references unknown activity ${requirement.activityId}` });
        } else if (target.chapterOrder > chapter.order || (target.chapterOrder === chapter.order && target.actionOrder >= activity.order)) {
          context.addIssue({ code: 'custom', path: ['chapters'], message: `activity ${activity.id} has a future dependency that would create a soft-lock` });
        }
      }
    }
  }

  for (const gatedChapterId of ['social', 'romance']) {
    const gatedChapter = revision.chapters.find(({ id }) => id === gatedChapterId);
    if (!gatedChapter || gatedChapter.requireAll.length < 2) {
      context.addIssue({ code: 'custom', path: ['chapters'], message: `${gatedChapterId} requires combined requirements from multiple earlier activities` });
    }
  }
});

export type GameplayRevisionLock = z.infer<typeof GameplayRevisionLockSchema>;

export const GameplayRevisionReferenceSchema = z.object({
  artifactPath: NonEmptyStringSchema
    .regex(/^artifacts\/[a-z0-9][a-z0-9._/-]*\.json$/i, 'gameplay revision artifact must be a JSON file under artifacts/')
    .refine((value) => !value.includes('..') && !value.includes('\\'), 'gameplay revision artifact path must not traverse directories'),
  revisionId: NonEmptyStringSchema,
  targetRunId: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
}).strict();

export type GameplayRevisionReference = z.infer<typeof GameplayRevisionReferenceSchema>;
