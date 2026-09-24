import { z } from 'zod';

const EvidenceFlagSchema = z.object({ exists: z.boolean(), evidence: z.string().min(1) });
const CostLevelSchema = z.enum(['very_low', 'low', 'medium', 'high']);
const ReuseLevelSchema = z.enum(['low', 'medium', 'high']);
const ScoreSchema = z.number().int().min(1).max(10);

const GrowthOnlyTerms = /^(?:赚钱|升级|解锁|收集|数值变大|earn(?:ing)? money|upgrade|unlock|collect|number go(?:es)? up)$/i;
const PrototypeSlotSchema = z.enum(['a', 'b', 'c']);

export const GameplayIdeaSchema = z.object({
  id: z.string().regex(/^idea_[a-z0-9_-]+$/),
  name: z.string().min(1),
  coreAction: z.string().trim().min(1).refine((value) => !GrowthOnlyTerms.test(value), 'growth labels are not core gameplay'),
  decisionIntervalSeconds: z.number().int().min(10).max(20),
  decision: z.string().min(1),
  choiceDrivers: z.array(z.string().min(1)).min(1),
  pressure: z.string().min(1),
  firstDelight: z.string().min(1),
  secondRunVariation: z.string().min(1),
  growthMechanic: z.string().min(1),
  randomVariation: z.string().min(1),
  majorSystems: z.array(z.string().min(1)).min(1).max(2, 'a prototype may contain at most 2 major systems'),
  realDecision: z.literal(true),
});
export type GameplayIdea = z.infer<typeof GameplayIdeaSchema>;

export const IdeaGenerationSchema = z.object({
  schemaVersion: z.literal(1),
  batch: z.number().int().min(1).max(2),
  theme: z.string().min(1),
  ideas: z.array(GameplayIdeaSchema).min(6, 'at least 6 gameplay ideas are required')
    .refine((items) => new Set(items.map(({ id }) => id)).size === items.length, 'idea ids must be unique'),
});
export type IdeaGeneration = z.infer<typeof IdeaGenerationSchema>;

export const LowCostFilterSchema = z.object({
  schemaVersion: z.literal(1),
  batch: z.number().int().min(1).max(2),
  selectedIdeaIds: z.array(z.string()).length(3).refine((ids) => new Set(ids).size === 3, 'selected ideas must be unique'),
  evaluations: z.array(z.object({
    ideaId: z.string(),
    hasOneCoreAction: z.boolean(),
    hasRealDecision: z.boolean(),
    majorSystemCount: z.number().int().min(1).max(2),
    prototypeMinutes: z.number().int().min(30).max(60),
    verdict: z.enum(['SELECT', 'REJECT']),
    rationale: z.string().min(1),
  })).min(6),
}).superRefine((value, context) => {
  const selected = new Set(value.selectedIdeaIds);
  const selectedRows = value.evaluations.filter(({ verdict }) => verdict === 'SELECT');
  if (selectedRows.length !== 3 || selectedRows.some(({ ideaId }) => !selected.has(ideaId))) context.addIssue({ code: 'custom', message: 'exactly the three selected ideas must have SELECT verdicts' });
  for (const row of selectedRows) if (!row.hasOneCoreAction || !row.hasRealDecision || row.majorSystemCount > 2) context.addIssue({ code: 'custom', message: `selected idea ${row.ideaId} violates low-cost prototype constraints` });
});
export type LowCostFilter = z.infer<typeof LowCostFilterSchema>;

export const PrototypeSelectionSchema = z.object({
  schemaVersion: z.literal(1),
  batch: z.number().int().min(1).max(2),
  decision: z.literal('BUILD_3'),
  selectedIdeaIds: z.array(z.string()).length(3).refine((ids) => new Set(ids).size === 3, 'prototype selection must contain three unique ideas'),
  rationale: z.string().min(1),
  constraints: z.array(z.string().min(1)).min(1),
});
export type PrototypeSelection = z.infer<typeof PrototypeSelectionSchema>;

export const PrototypeBuildReportSchema = z.object({
  schemaVersion: z.literal(1),
  batch: z.number().int().min(1).max(2),
  prototypes: z.array(z.object({
    slot: PrototypeSlotSchema,
    ideaId: z.string(),
    workspace: z.string().min(1),
    entrypoint: z.string().min(1),
    launchCommand: z.string().min(1),
    placeholderArt: z.literal(true),
    formalUi: z.literal(false),
    iaaIncluded: z.literal(false),
    majorSystems: z.array(z.string().min(1)).min(1).max(2, 'a prototype may contain at most 2 major systems'),
    verification: z.array(z.string().min(1)).min(2),
    author: z.literal('BuilderAgent'),
  })).length(3)
    .refine((items) => new Set(items.map(({ slot }) => slot)).size === 3, 'prototype slots must be unique')
    .refine((items) => new Set(items.map(({ ideaId }) => ideaId)).size === 3, 'prototype ideas must be unique')
    .refine((items) => new Set(items.map(({ workspace }) => workspace)).size === 3, 'prototype workspaces must be isolated'),
});
export type PrototypeBuildReport = z.infer<typeof PrototypeBuildReportSchema>;

const PlaytestCriterionSchema = z.object({ score: ScoreSchema, evidence: z.string().min(1) });
export const PlaytestTournamentSchema = z.object({
  schemaVersion: z.literal(1),
  batch: z.number().int().min(1).max(2),
  reviewer: z.enum(['QAAgent', 'BuilderAgent']),
  prototypeAuthor: z.literal('BuilderAgent'),
  comparisons: z.array(z.object({
    slot: PrototypeSlotSchema,
    ideaId: z.string(),
    testedUrl: z.string().min(1),
    playtestActions: z.array(z.string().min(1)).min(5),
    tenSecondUnderstanding: PlaytestCriterionSchema,
    funWithinThirtySeconds: PlaytestCriterionSchema,
    realDecision: PlaytestCriterionSchema,
    mechanicalRepetition: PlaytestCriterionSchema,
    pressureOrFailure: PlaytestCriterionSchema,
    retryUrge: PlaytestCriterionSchema,
    variationAfterFiveRepeats: PlaytestCriterionSchema,
    extensibility: PlaytestCriterionSchema,
    screenshot: z.string().min(1),
    consoleLog: z.string().min(1),
  })).length(3).refine((items) => new Set(items.map(({ slot }) => slot)).size === 3, 'all three prototypes must be reviewed'),
}).superRefine((value, context) => {
  if (value.reviewer === value.prototypeAuthor) context.addIssue({ code: 'custom', message: 'prototype reviewer must be independent from the prototype author' });
});
export type PlaytestTournament = z.infer<typeof PlaytestTournamentSchema>;

export const WinnerSelectionSchema = z.object({
  schemaVersion: z.literal(1),
  batch: z.number().int().min(1).max(2),
  decision: z.enum(['WINNER_A', 'WINNER_B', 'WINNER_C', 'NONE']),
  selectedIdeaId: z.string().nullable(),
  rationale: z.string().min(1),
}).superRefine((value, context) => {
  if ((value.decision === 'NONE') !== (value.selectedIdeaId === null)) context.addIssue({ code: 'custom', message: 'NONE must not select an idea; a winner must select one' });
});
export type WinnerSelection = z.infer<typeof WinnerSelectionSchema>;

export const PrototypeHumanReviewSchema = z.object({
  schemaVersion: z.literal(1),
  batch: z.number().int().min(1).max(2),
  prototypes: z.array(z.object({ slot: PrototypeSlotSchema, name: z.string().min(1), coreAction: z.string().min(1), decision: z.string().min(1), entrypoint: z.string().min(1), launchCommand: z.string().min(1) })).length(3),
  recommendation: z.enum(['WINNER_A', 'WINNER_B', 'WINNER_C']),
  rationale: z.string().min(1),
});

export const HumanPrototypeDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT', 'PREFER_A', 'PREFER_B', 'PREFER_C', 'REVISE']),
  notes: z.array(z.string().min(1)).default([]),
});
export type HumanPrototypeDecision = z.infer<typeof HumanPrototypeDecisionSchema>;

export const CurrentGameReviewSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().min(1),
  playtestDurationSeconds: z.number().int().positive(),
  coreLoop: z.array(z.string().min(1)).min(1),
  primaryActions: z.array(z.string().min(1)).min(1),
  first30Seconds: z.string().min(1),
  afterOneMinute: z.string().min(1),
  boredomReasons: z.array(z.string().min(1)).min(1),
  keep: z.array(z.string().min(1)),
  remove: z.array(z.string().min(1)),
  realChoice: EvidenceFlagSchema,
  growthFeedback: EvidenceFlagSchema,
  randomVariation: EvidenceFlagSchema,
  shortTermGoal: EvidenceFlagSchema,
  iaaOpportunities: z.array(z.string().min(1)),
  issues: z.array(z.object({ severity: z.enum(['CRITICAL', 'IMPORTANT', 'OPTIONAL']), problem: z.string().min(1), evidence: z.string().min(1) })).min(1),
});

export const CompetitorPatternsSchema = z.object({
  schemaVersion: z.literal(1),
  category: z.string().min(1),
  sources: z.array(z.object({ title: z.string().min(1), url: z.url(), observedPattern: z.string().min(1) })).min(1),
  patterns: z.array(z.object({
    name: z.string().min(1),
    coreLoop: z.string().min(1),
    shortTermGoal: z.string().min(1),
    growth: z.string().min(1),
    randomVariation: z.string().min(1),
    choice: z.string().min(1),
    pressure: z.string().min(1),
    rewardedAdFit: z.string().min(1),
    whyNextMinute: z.string().min(1),
    codeCost: CostLevelSchema,
    artCost: CostLevelSchema,
  })).min(1),
  lowCostHighImpact: z.array(z.string().min(1)).min(1),
  prohibitedCopying: z.array(z.string().min(1)).min(1),
});

export const GameplayRedesignProposalSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mechanisms: z.array(z.string().min(1)).min(1).max(2, 'a proposal may contain at most 2 major mechanics'),
  playerActions: z.array(z.string().min(1)).min(1),
  whyMoreFun: z.string().min(1),
  codeChange: CostLevelSchema,
  artChange: CostLevelSchema,
  contentLoad: CostLevelSchema,
  fitsFiveMinutes: z.boolean(),
  themeReuse: ReuseLevelSchema,
  funUplift: ScoreSchema,
});

export const GameplayRedesignProposalsSchema = z.object({
  schemaVersion: z.literal(1),
  proposals: z.array(GameplayRedesignProposalSchema).length(5).refine((items) => new Set(items.map(({ id }) => id)).size === 5, 'proposal ids must be unique'),
});

export const GameplayCostReviewSchema = z.object({
  schemaVersion: z.literal(1),
  reviews: z.array(z.object({
    proposalId: z.string().min(1),
    codeCostFit: ScoreSchema,
    artCostFit: ScoreSchema,
    contentCostFit: ScoreSchema,
    testCostFit: ScoreSchema,
    aiBuildability: ScoreSchema,
    themeReuse: ScoreSchema,
    overall: z.number().min(1).max(10),
    rationale: z.string().min(1),
  })).length(5),
});

export const GameplayIaaReviewSchema = z.object({
  schemaVersion: z.literal(1),
  reviews: z.array(z.object({
    proposalId: z.string().min(1),
    naturalRewardedOpportunity: z.boolean(),
    rewardedOpportunitiesPerFiveMinutes: z.number().int().nonnegative(),
    naturalInterstitialPoint: z.string().min(1),
    requiresForcedInterruption: z.boolean(),
    rewardClarity: ReuseLevelSchema,
    growthIntegration: ReuseLevelSchema,
    experienceDamage: ReuseLevelSchema,
    placements: z.array(z.string().min(1)),
    rationale: z.string().min(1),
  })).length(5),
});

export const GameplayGreenlightSchema = z.object({
  schemaVersion: z.literal(1),
  decision: z.enum(['GO', 'REVISE', 'KILL']),
  selectedProposalId: z.string().min(1).nullable(),
  funCostValue: z.number().min(0).max(10),
  scores: z.object({ funUplift: ScoreSchema, costValue: ScoreSchema, iaaFit: ScoreSchema, aiBuildability: ScoreSchema, reuse: ScoreSchema }),
  rationale: z.string().min(1),
  constraints: z.array(z.string().min(1)).min(1),
}).superRefine((value, context) => {
  if (value.decision === 'KILL' && value.selectedProposalId !== null) context.addIssue({ code: 'custom', message: 'KILL cannot select a proposal' });
  if (value.decision !== 'KILL' && value.selectedProposalId === null) context.addIssue({ code: 'custom', message: `${value.decision} requires a selected proposal` });
});

export const GameplayExperimentBundleSchema = z.object({
  currentReview: CurrentGameReviewSchema,
  patterns: CompetitorPatternsSchema,
  proposals: GameplayRedesignProposalsSchema,
  costReview: GameplayCostReviewSchema,
  iaaReview: GameplayIaaReviewSchema,
  greenlight: GameplayGreenlightSchema,
}).superRefine((bundle, context) => {
  const proposalIds = bundle.proposals.proposals.map(({ id }) => id);
  const sameIds = (ids: string[]) => ids.length === proposalIds.length && proposalIds.every((id) => ids.includes(id));
  if (!sameIds(bundle.costReview.reviews.map(({ proposalId }) => proposalId))) context.addIssue({ code: 'custom', message: 'cost review rows must match all five proposals' });
  if (!sameIds(bundle.iaaReview.reviews.map(({ proposalId }) => proposalId))) context.addIssue({ code: 'custom', message: 'IAA review rows must match all five proposals' });
  if (bundle.greenlight.selectedProposalId !== null && !proposalIds.includes(bundle.greenlight.selectedProposalId)) context.addIssue({ code: 'custom', message: 'selected proposal must exist in the five proposals' });
});

export const FunReportAfterSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().min(1),
  playtestDurationSeconds: z.number().int().min(180),
  iteration: z.number().int().min(1).max(2),
  checks: z.object({
    rewardInFirst10Seconds: EvidenceFlagSchema,
    growthInFirst30Seconds: EvidenceFlagSchema,
    noFeedbackGapOver15Seconds: EvidenceFlagSchema,
    noSameActionOverEightTimes: EvidenceFlagSchema,
    newGoalWithin60Seconds: EvidenceFlagSchema,
    newContentWithin120Seconds: EvidenceFlagSchema,
    realChoice: EvidenceFlagSchema,
    randomVariation: EvidenceFlagSchema,
    upgradeIsNoticeable: EvidenceFlagSchema,
    reasonToContinueFiveMinutes: EvidenceFlagSchema,
    iaaRewardFeelsNatural: EvidenceFlagSchema,
  }),
  comparison: z.object({ before: z.string().min(1), after: z.string().min(1), materiallyImproved: z.boolean() }),
  verdict: z.enum(['WORTH_CONTINUING', 'NEEDS_REVISION', 'ABANDON']),
  evidence: z.array(z.string().min(1)).min(1),
});
