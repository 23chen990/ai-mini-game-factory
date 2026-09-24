import { z } from 'zod';

const NonEmptyStringSchema = z.string().trim().min(1);
const NonNegativeSecondsSchema = z.number().nonnegative();

const EvidenceSourceSchema = z.object({
  id: NonEmptyStringSchema,
  sourceType: z.enum([
    'official_game_page',
    'official_store_listing',
    'screenshot',
    'walkthrough',
    'user_supplied_report',
  ]),
  url: z.url().nullable(),
  localPath: NonEmptyStringSchema.nullable(),
  accessedAt: z.string().datetime(),
  confidence: z.enum(['high', 'medium', 'low']),
  observations: z.array(NonEmptyStringSchema).min(1),
}).strict().superRefine((source, context) => {
  if (source.url === null && source.localPath === null) {
    context.addIssue({ code: 'custom', message: 'an evidence source requires a URL or local path' });
  }
});

const ActivityRequirementSchema = z.object({
  type: z.enum(['activity_level', 'chapter_milestone', 'resource']),
  targetId: NonEmptyStringSchema,
  relation: z.literal('at_least'),
  copiedThresholdValue: z.literal(false),
}).strict();

const ObservedActivitySchema = z.object({
  id: NonEmptyStringSchema,
  role: z.enum(['animated_action', 'support_action', 'career_tier', 'social_activity', 'home_purchase']),
  producesWhileActive: z.boolean(),
  hasOwnUpgradeTrack: z.boolean(),
  hasVisibleProgress: z.literal(true),
  visibleBeforeUnlock: z.boolean(),
  requirements: z.array(ActivityRequirementSchema),
  feedback: z.array(NonEmptyStringSchema).min(2),
}).strict();

const ObservedChapterSchema = z.object({
  id: NonEmptyStringSchema,
  order: z.number().int().positive(),
  role: z.enum([
    'entry_self_improvement',
    'capability_gate',
    'identity_income_ladder',
    'world_population_progress',
    'visible_wealth_sink',
  ]),
  unlock: z.object({
    mode: z.enum(['initial', 'prerequisite_gate']),
    visibleBeforeUnlock: z.literal(true),
    requiresChapterIds: z.array(NonEmptyStringSchema),
  }).strict(),
  activities: z.array(ObservedActivitySchema).min(1),
}).strict();

const ObservedMechanicsSchema = z.object({
  activeInput: z.object({
    activitySelectionStartsExecution: z.literal(true),
    selectedActivityControlsVisibleAnimation: z.literal(true),
    tapTarget: z.literal('character'),
    tapEffect: z.literal('accelerate_current_activity'),
    directCurrencyButton: z.literal(false),
  }).strict(),
  coreLoop: z.array(NonEmptyStringSchema).min(8),
  chapters: z.array(ObservedChapterSchema).min(5),
  crossChapterGates: z.array(z.object({
    fromChapterId: NonEmptyStringSchema,
    toChapterId: NonEmptyStringSchema,
    relationship: z.enum([
      'milestone_unlock',
      'capability_requirement',
      'status_and_resource_requirement',
      'resource_requirement',
    ]),
  }).strict()),
  economy: z.object({
    perActivityBaseProduction: z.literal(true),
    totalProductionAggregatesUnlockedActivities: z.literal(true),
    upgradesPrimarilyAffectOwningActivity: z.literal(true),
    laterActivitiesChangeMagnitude: z.literal(true),
    batchPurchasingAppearsLater: z.literal(true),
    offlineProgressionPresent: z.literal(true),
    copiedRawValues: z.literal(false),
  }).strict(),
  feedbackCadence: z.array(z.object({
    band: z.enum(['immediate', 'short', 'milestone']),
    minSeconds: NonNegativeSecondsSchema,
    maxSeconds: z.number().positive(),
    outcomes: z.array(NonEmptyStringSchema).min(1),
  }).strict()).length(3),
  visibleProgression: z.array(z.object({
    dimension: z.enum(['character', 'environment', 'identity', 'world']),
    examples: z.array(NonEmptyStringSchema).min(1),
  }).strict()).min(3),
  misreadingsToReject: z.array(NonEmptyStringSchema).min(4),
}).strict().superRefine((mechanics, context) => {
  const chapterIds = mechanics.chapters.map(({ id }) => id);
  if (new Set(chapterIds).size !== chapterIds.length) {
    context.addIssue({ code: 'custom', path: ['chapters'], message: 'chapter ids must be unique' });
  }
  const chapterOrders = mechanics.chapters.map(({ order }) => order);
  if (new Set(chapterOrders).size !== chapterOrders.length) {
    context.addIssue({ code: 'custom', path: ['chapters'], message: 'chapter order values must be unique' });
  }

  const initialChapters = mechanics.chapters.filter(({ unlock }) => unlock.mode === 'initial');
  if (initialChapters.length !== 1 || initialChapters[0]?.unlock.requiresChapterIds.length !== 0) {
    context.addIssue({ code: 'custom', path: ['chapters'], message: 'the observed graph requires exactly one dependency-free initial chapter' });
  }

  const chapterIdSet = new Set(chapterIds);
  const activityIds = mechanics.chapters.flatMap(({ activities }) => activities.map(({ id }) => id));
  if (new Set(activityIds).size !== activityIds.length) {
    context.addIssue({ code: 'custom', path: ['chapters'], message: 'activity ids must be globally unique' });
  }
  const activityIdSet = new Set(activityIds);

  for (const chapter of mechanics.chapters) {
    if (chapter.unlock.mode === 'prerequisite_gate' && chapter.unlock.requiresChapterIds.length === 0) {
      context.addIssue({ code: 'custom', path: ['chapters'], message: `chapter ${chapter.id} requires at least one chapter prerequisite` });
    }
    for (const prerequisiteId of chapter.unlock.requiresChapterIds) {
      if (!chapterIdSet.has(prerequisiteId)) {
        context.addIssue({ code: 'custom', path: ['chapters'], message: `chapter ${chapter.id} references unknown prerequisite ${prerequisiteId}` });
      }
    }
    for (const item of chapter.activities) {
      for (const requirement of item.requirements) {
        if (requirement.type === 'activity_level' && !activityIdSet.has(requirement.targetId)) {
          context.addIssue({ code: 'custom', path: ['chapters'], message: `activity ${item.id} references unknown activity ${requirement.targetId}` });
        }
        if (requirement.type === 'chapter_milestone' && !chapterIdSet.has(requirement.targetId)) {
          context.addIssue({ code: 'custom', path: ['chapters'], message: `activity ${item.id} references unknown chapter ${requirement.targetId}` });
        }
      }
    }
  }

  const hasNestedOpeningChapter = mechanics.chapters.some(({ activities }) => activities.length >= 3);
  const hasConjunctiveActivityGate = mechanics.chapters.some(({ activities }) =>
    activities.some(({ requirements }) => requirements.length >= 2));
  if (!hasNestedOpeningChapter || !hasConjunctiveActivityGate) {
    context.addIssue({
      code: 'custom',
      path: ['chapters'],
      message: 'the reference requires a nested activity graph with a multi-requirement unlock',
    });
  }
  if (mechanics.crossChapterGates.length < 2) {
    context.addIssue({
      code: 'custom',
      path: ['crossChapterGates'],
      message: 'the reference requires cross-chapter gates rather than independent flat cards',
    });
  }
  for (const gate of mechanics.crossChapterGates) {
    if (!chapterIdSet.has(gate.fromChapterId) || !chapterIdSet.has(gate.toChapterId)) {
      context.addIssue({ code: 'custom', path: ['crossChapterGates'], message: 'cross-chapter gates must reference known chapters' });
    }
    if (gate.fromChapterId === gate.toChapterId) {
      context.addIssue({ code: 'custom', path: ['crossChapterGates'], message: 'cross-chapter gates cannot point to the same chapter' });
    }
  }

  const bands = mechanics.feedbackCadence.map(({ band }) => band);
  if (new Set(bands).size !== 3) {
    context.addIssue({ code: 'custom', path: ['feedbackCadence'], message: 'feedback cadence must cover immediate, short, and milestone bands' });
  }
  for (const cadence of mechanics.feedbackCadence) {
    if (cadence.minSeconds > cadence.maxSeconds) {
      context.addIssue({ code: 'custom', path: ['feedbackCadence'], message: `${cadence.band} cadence minimum cannot exceed its maximum` });
    }
  }
});

const ProposedActivitySchema = z.object({
  id: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  visibleVerb: NonEmptyStringSchema,
  animationRequired: z.literal(true),
  requireAllActivityIds: z.array(NonEmptyStringSchema),
}).strict();

const ReskinProposalSchema = z.object({
  status: z.literal('AWAITING_HUMAN_APPROVAL'),
  title: NonEmptyStringSchema,
  chapters: z.array(z.object({
    id: NonEmptyStringSchema,
    order: z.number().int().positive(),
    benchmarkRole: z.enum(['entry_self_improvement', 'second_gated_growth_line', 'visible_identity_progress']),
    name: NonEmptyStringSchema,
    milestoneTransformation: NonEmptyStringSchema,
    unlock: z.object({
      mode: z.enum(['initial', 'prerequisite_gate']),
      requiresChapterIds: z.array(NonEmptyStringSchema),
    }).strict(),
    activities: z.array(ProposedActivitySchema).min(3),
  }).strict()).min(3),
  preserveRelationships: z.array(NonEmptyStringSchema).min(5),
  originalExpressionRequired: z.array(NonEmptyStringSchema).min(5),
  demoExitCriteria: z.object({
    minimumChapters: z.number().int().min(3),
    minimumActivities: z.number().int().min(9),
    minimumConjunctiveUnlocks: z.number().int().min(2),
    minimumVisibleTransformations: z.number().int().min(3),
    mobileCoreLoopVisibleWithoutScroll: z.literal(true),
  }).strict(),
}).strict().superRefine((proposal, context) => {
  const chapterIds = proposal.chapters.map(({ id }) => id);
  if (new Set(chapterIds).size !== chapterIds.length) {
    context.addIssue({ code: 'custom', path: ['chapters'], message: 'proposed chapter ids must be unique' });
  }
  const chapterOrders = proposal.chapters.map(({ order }) => order);
  if (new Set(chapterOrders).size !== chapterOrders.length) {
    context.addIssue({ code: 'custom', path: ['chapters'], message: 'proposed chapter order values must be unique' });
  }
  const initialChapters = proposal.chapters.filter(({ unlock }) => unlock.mode === 'initial');
  if (initialChapters.length !== 1 || initialChapters[0]?.unlock.requiresChapterIds.length !== 0) {
    context.addIssue({ code: 'custom', path: ['chapters'], message: 'the proposal requires exactly one dependency-free initial chapter' });
  }

  const chapterIdSet = new Set(chapterIds);
  const allActivities = proposal.chapters.flatMap(({ activities }) => activities);
  const activityIds = allActivities.map(({ id }) => id);
  if (new Set(activityIds).size !== activityIds.length) {
    context.addIssue({ code: 'custom', path: ['chapters'], message: 'proposed activity ids must be globally unique' });
  }
  const activityIdSet = new Set(activityIds);
  for (const chapter of proposal.chapters) {
    if (chapter.unlock.mode === 'prerequisite_gate' && chapter.unlock.requiresChapterIds.length === 0) {
      context.addIssue({ code: 'custom', path: ['chapters'], message: `proposed chapter ${chapter.id} requires a chapter prerequisite` });
    }
    for (const prerequisiteId of chapter.unlock.requiresChapterIds) {
      if (!chapterIdSet.has(prerequisiteId)) {
        context.addIssue({ code: 'custom', path: ['chapters'], message: `proposed chapter ${chapter.id} references unknown chapter ${prerequisiteId}` });
      }
    }
    for (const item of chapter.activities) {
      for (const prerequisiteId of item.requireAllActivityIds) {
        if (!activityIdSet.has(prerequisiteId)) {
          context.addIssue({ code: 'custom', path: ['chapters'], message: `proposed activity ${item.id} references unknown activity ${prerequisiteId}` });
        }
      }
    }
  }

  const conjunctiveUnlocks = allActivities.filter(({ requireAllActivityIds }) => requireAllActivityIds.length >= 2).length;
  if (conjunctiveUnlocks < proposal.demoExitCriteria.minimumConjunctiveUnlocks) {
    context.addIssue({ code: 'custom', path: ['chapters'], message: 'the proposal does not contain enough conjunctive activity unlocks' });
  }
  if (proposal.chapters.length < proposal.demoExitCriteria.minimumChapters) {
    context.addIssue({ code: 'custom', path: ['chapters'], message: 'the proposal does not meet its minimum chapter count' });
  }
  if (allActivities.length < proposal.demoExitCriteria.minimumActivities) {
    context.addIssue({ code: 'custom', path: ['chapters'], message: 'the proposal does not meet its minimum activity count' });
  }
  if (proposal.chapters.length < proposal.demoExitCriteria.minimumVisibleTransformations) {
    context.addIssue({ code: 'custom', path: ['chapters'], message: 'each proposed chapter supplies one milestone transformation, but the proposal requires more transformations' });
  }
});

export const ReferenceCoreGameplayResearchSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('reference_core_gameplay_research'),
  targetRunId: NonEmptyStringSchema,
  benchmark: z.object({
    name: NonEmptyStringSchema,
    primaryUrl: z.url(),
    suppliedResearchFiles: z.array(NonEmptyStringSchema),
  }).strict(),
  evidenceSources: z.array(EvidenceSourceSchema).min(4),
  observedMechanics: ObservedMechanicsSchema,
  reskinProposal: ReskinProposalSchema,
  uncertainties: z.array(NonEmptyStringSchema),
  conclusion: NonEmptyStringSchema,
  researchedAt: z.string().datetime(),
}).strict().superRefine((research, context) => {
  const sourceIds = research.evidenceSources.map(({ id }) => id);
  if (new Set(sourceIds).size !== sourceIds.length) {
    context.addIssue({ code: 'custom', path: ['evidenceSources'], message: 'evidence source ids must be unique' });
  }
  if (!research.evidenceSources.some(({ sourceType }) => sourceType === 'official_game_page')) {
    context.addIssue({ code: 'custom', path: ['evidenceSources'], message: 'research requires an official game-page source' });
  }
  if (!research.evidenceSources.some(({ sourceType }) => sourceType === 'screenshot')) {
    context.addIssue({ code: 'custom', path: ['evidenceSources'], message: 'research requires screenshot evidence for the activity graph' });
  }
  if (!research.evidenceSources.some(({ sourceType }) => sourceType === 'user_supplied_report')) {
    context.addIssue({ code: 'custom', path: ['evidenceSources'], message: 'research must retain the user-supplied report as evidence' });
  }
});

export type ReferenceCoreGameplayResearch = z.infer<typeof ReferenceCoreGameplayResearchSchema>;
