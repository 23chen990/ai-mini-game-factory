import { z } from 'zod';

const SchemaVersion = z.literal(1);
const PrototypeSlotSchema = z.enum(['A', 'B', 'C']);
const ExperimentIdSchema = z.string().trim().min(1);
const NonEmptyStringSchema = z.string().trim().min(1);
const HashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/i, 'hash must use sha256:<64 hex characters> format');
const SafeRepositoryRelativePathSchema = z.string().trim().min(1)
  .refine((value) => !value.includes('\\'), 'repository-relative paths must not contain backslashes')
  .refine((value) => !value.startsWith('/') && !/^[a-z]:/i.test(value), 'path must be repository-relative')
  .refine(
    (value) => value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..' && !segment.includes('\0')),
    'repository-relative paths must contain only safe path segments',
  );

const ActionPrototypeSpecSchema = z.object({
  slot: PrototypeSlotSchema,
  name: NonEmptyStringSchema,
  workspace: NonEmptyStringSchema,
  geometryFixtureHash: HashSchema,
  treatmentHash: HashSchema,
  hypothesis: NonEmptyStringSchema,
  treatment: z.array(NonEmptyStringSchema).min(1),
}).strict();

const uniquePrototypeSet = <T extends { slot: string; workspace: string }>(
  items: T[],
  context: z.RefinementCtx,
) => {
  if (new Set(items.map(({ slot }) => slot)).size !== 3) {
    context.addIssue({ code: 'custom', message: 'prototype slots must contain A, B, and C exactly once' });
  }
  if (new Set(items.map(({ workspace }) => workspace)).size !== 3) {
    context.addIssue({ code: 'custom', message: 'prototype workspaces must be isolated' });
  }
};

const MaximumThresholdSchema = z.object({
  max: z.number().nonnegative(),
}).strict();

export const ActionMechanicExperimentSpecSchema = z.object({
  schemaVersion: SchemaVersion,
  experimentId: ExperimentIdSchema,
  question: NonEmptyStringSchema,
  coreAction: NonEmptyStringSchema,
  decisionIntervalMs: z.number().int().min(400).max(2_000),
  sourceWorkspace: SafeRepositoryRelativePathSchema,
  sharedGeometryFixture: NonEmptyStringSchema,
  constraints: z.object({
    greyboxOnly: z.literal(true),
    chaseIncluded: z.literal(false),
    formalUiIncluded: z.literal(false),
    iaaIncluded: z.literal(false),
  }).strict(),
  prototypes: z.array(ActionPrototypeSpecSchema).length(3),
  automaticQaThresholds: z.object({
    inputResponseMs: MaximumThresholdSchema,
    releaseVelocityRetentionRatio: z.object({ min: z.number().min(0).max(1) }).strict(),
    wrongHookAttachments: z.object({ max: z.number().int().nonnegative() }).strict(),
    maxEventGapMs: MaximumThresholdSchema,
    retryFrictionMs: MaximumThresholdSchema,
    missedFinishDetections: z.object({ max: z.number().int().nonnegative() }).strict(),
  }).strict(),
}).strict().superRefine(({ prototypes }, context) => {
  uniquePrototypeSet(prototypes, context);
  if (new Set(prototypes.map(({ geometryFixtureHash }) => geometryFixtureHash)).size !== 1) {
    context.addIssue({ code: 'custom', message: 'all prototypes must use the same geometry fixture hash' });
  }
});
export type ActionMechanicExperimentSpec = z.infer<typeof ActionMechanicExperimentSpecSchema>;

const ActionPrototypeBuildSchema = z.object({
  slot: PrototypeSlotSchema,
  workspace: NonEmptyStringSchema,
  geometryFixtureHash: HashSchema,
  treatmentHash: HashSchema,
  entrypoint: NonEmptyStringSchema,
  launchCommand: NonEmptyStringSchema,
  author: z.literal('BuilderAgent'),
  verification: z.array(NonEmptyStringSchema).min(2),
}).strict();

export const ActionPrototypeBuildReportSchema = z.object({
  schemaVersion: SchemaVersion,
  experimentId: ExperimentIdSchema,
  prototypes: z.array(ActionPrototypeBuildSchema).length(3),
}).strict().superRefine(({ prototypes }, context) => uniquePrototypeSet(prototypes, context));
export type ActionPrototypeBuildReport = z.infer<typeof ActionPrototypeBuildReportSchema>;

const MeasuredMetricSchema = z.object({
  value: z.number().nonnegative(),
  passed: z.boolean(),
  evidence: NonEmptyStringSchema,
}).strict();

const ActionPlaytestResultSchema = z.object({
  slot: PrototypeSlotSchema,
  workspace: NonEmptyStringSchema,
  inputResponseMs: MeasuredMetricSchema,
  releaseVelocityRetentionRatio: MeasuredMetricSchema,
  wrongHookAttachments: MeasuredMetricSchema,
  maxEventGapMs: MeasuredMetricSchema,
  retryFrictionMs: MeasuredMetricSchema,
  missedFinishDetections: MeasuredMetricSchema,
}).strict();

export const ActionPlaytestReportSchema = z.object({
  schemaVersion: SchemaVersion,
  experimentId: ExperimentIdSchema,
  reviewer: z.enum(['QAAgent', 'BuilderAgent']),
  prototypeAuthor: z.literal('BuilderAgent'),
  results: z.array(ActionPlaytestResultSchema).length(3),
  recommendation: z.enum(['A', 'B', 'C', 'NONE']),
  rationale: NonEmptyStringSchema,
}).strict().superRefine((value, context) => {
  if (value.reviewer === value.prototypeAuthor) {
    context.addIssue({ code: 'custom', message: 'action prototypes require an independent QA reviewer' });
  }
  uniquePrototypeSet(value.results, context);
});
export type ActionPlaytestReport = z.infer<typeof ActionPlaytestReportSchema>;

export const HumanActionMechanicDecisionSchema = z.object({
  schemaVersion: SchemaVersion,
  experimentId: ExperimentIdSchema,
  decision: z.enum(['KEEP', 'REFACTOR', 'KILL']),
  selectedSlot: PrototypeSlotSchema.nullable(),
  rationale: NonEmptyStringSchema,
  requiredChanges: z.array(NonEmptyStringSchema),
}).strict().superRefine((value, context) => {
  if (value.decision === 'KILL' && value.selectedSlot !== null) {
    context.addIssue({ code: 'custom', message: 'KILL cannot select a prototype' });
  }
  if (value.decision !== 'KILL' && value.selectedSlot === null) {
    context.addIssue({ code: 'custom', message: `${value.decision} requires a selected prototype` });
  }
  if (value.decision === 'REFACTOR' && value.requiredChanges.length === 0) {
    context.addIssue({ code: 'custom', message: 'REFACTOR requires at least one required change' });
  }
});
export type HumanActionMechanicDecision = z.infer<typeof HumanActionMechanicDecisionSchema>;

type PlaytestResult = z.infer<typeof ActionPlaytestResultSchema>;
type QaThresholds = z.infer<typeof ActionMechanicExperimentSpecSchema>['automaticQaThresholds'];

const recomputeThresholds = (result: PlaytestResult, thresholds: QaThresholds) => ({
  inputResponseMs: result.inputResponseMs.value <= thresholds.inputResponseMs.max,
  releaseVelocityRetentionRatio: result.releaseVelocityRetentionRatio.value >= thresholds.releaseVelocityRetentionRatio.min,
  wrongHookAttachments: result.wrongHookAttachments.value <= thresholds.wrongHookAttachments.max,
  maxEventGapMs: result.maxEventGapMs.value <= thresholds.maxEventGapMs.max,
  retryFrictionMs: result.retryFrictionMs.value <= thresholds.retryFrictionMs.max,
  missedFinishDetections: result.missedFinishDetections.value <= thresholds.missedFinishDetections.max,
});

export const ActionMechanicExperimentBundleSchema = z.object({
  spec: ActionMechanicExperimentSpecSchema,
  buildReport: ActionPrototypeBuildReportSchema,
  playtestReport: ActionPlaytestReportSchema,
  humanDecision: HumanActionMechanicDecisionSchema,
}).strict().superRefine((bundle, context) => {
  const experimentIds = [
    bundle.spec.experimentId,
    bundle.buildReport.experimentId,
    bundle.playtestReport.experimentId,
    bundle.humanDecision.experimentId,
  ];
  if (new Set(experimentIds).size !== 1) {
    context.addIssue({ code: 'custom', message: 'all artifacts must reference the same experiment' });
  }

  const expectedWorkspaces = new Map(bundle.spec.prototypes.map(({ slot, workspace }) => [slot, workspace]));
  const expectedHashes = new Map(bundle.spec.prototypes.map(({ slot, geometryFixtureHash, treatmentHash }) => [slot, { geometryFixtureHash, treatmentHash }]));
  for (const artifact of [...bundle.buildReport.prototypes, ...bundle.playtestReport.results]) {
    if (expectedWorkspaces.get(artifact.slot) !== artifact.workspace) {
      context.addIssue({ code: 'custom', message: `workspace for prototype ${artifact.slot} must match its experiment specification` });
    }
  }

  for (const build of bundle.buildReport.prototypes) {
    const expected = expectedHashes.get(build.slot);
    if (expected?.geometryFixtureHash !== build.geometryFixtureHash) {
      context.addIssue({ code: 'custom', message: `geometry fixture hash for prototype ${build.slot} must match its experiment specification` });
    }
    if (expected?.treatmentHash !== build.treatmentHash) {
      context.addIssue({ code: 'custom', message: `treatment hash for prototype ${build.slot} must match its experiment specification` });
    }
  }

  const thresholdResults = new Map<z.infer<typeof PrototypeSlotSchema>, ReturnType<typeof recomputeThresholds>>();
  for (const result of bundle.playtestReport.results) {
    const recomputed = recomputeThresholds(result, bundle.spec.automaticQaThresholds);
    thresholdResults.set(result.slot, recomputed);
    for (const metricName of Object.keys(recomputed) as Array<keyof typeof recomputed>) {
      if (result[metricName].passed !== recomputed[metricName]) {
        context.addIssue({ code: 'custom', message: `${metricName} passed flag must match its measured value and experiment threshold` });
      }
    }
  }

  const recommendation = bundle.playtestReport.recommendation;
  if (recommendation !== 'NONE') {
    const recommendedThresholds = thresholdResults.get(recommendation);
    if (!recommendedThresholds || !Object.values(recommendedThresholds).every(Boolean)) {
      context.addIssue({ code: 'custom', message: 'an A/B/C recommendation requires all six recomputed thresholds to pass; otherwise recommendation must be NONE' });
    }
  }
});
export type ActionMechanicExperimentBundle = z.infer<typeof ActionMechanicExperimentBundleSchema>;
