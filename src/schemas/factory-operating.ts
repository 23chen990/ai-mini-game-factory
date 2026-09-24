import { z } from 'zod';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu, 'expected a SHA-256 hex digest');

/** Distribution targets are deliberately separate from the three mandatory domestic mini-game targets. */
export const DistributionPlatformSchema = z.enum([
  'wechat-minigame',
  'douyin-minigame',
  'taptap-minigame',
  'poki-web',
  'crazygames-web',
]);
export type DistributionPlatform = z.infer<typeof DistributionPlatformSchema>;

export const ReleaseChildStatusSchema = z.enum(['planned', 'blocked', 'qa', 'ready', 'released', 'rejected']);
export type ReleaseChildStatus = z.infer<typeof ReleaseChildStatusSchema>;

export const PlatformReleaseChildSchema = z.object({
  platform: DistributionPlatformSchema,
  /** Optional children are prepared and audited when selected, but do not
   * block the primary release until explicitly promoted to required. */
  required: z.boolean().default(true),
  status: ReleaseChildStatusSchema,
  adapterPath: Text,
  buildPath: Text,
  configPath: Text,
  childRoot: Text.optional(),
  evidence: z.array(Text),
  normalFlowEvidence: z.array(Text).default([]),
  visualEvidence: z.array(Text).default([]),
  runtimeEvidence: z.array(Text).default([]),
  blockers: z.array(Text),
  artifactHash: Sha256.nullable(),
}).strict().superRefine((child, context) => {
  if (['ready', 'released'].includes(child.status) && (child.evidence.length === 0 || child.artifactHash === null)) {
    context.addIssue({ code: 'custom', message: 'ready or released platform children require evidence and an artifact hash' });
  }
  if (['blocked', 'rejected'].includes(child.status) && child.blockers.length === 0) {
    context.addIssue({ code: 'custom', message: 'blocked or rejected platform children require a blocker' });
  }
});
export type PlatformReleaseChild = z.infer<typeof PlatformReleaseChildSchema>;

export const PlatformReleaseMatrixSchema = z.object({
  schemaVersion: z.literal(1),
  gameId: Text,
  coreHash: Sha256,
  primaryPlatform: DistributionPlatformSchema,
  generatedAt: z.string().datetime(),
  /** Omitted on legacy matrices; in that case every child is required. */
  requiredPlatforms: z.array(DistributionPlatformSchema).min(1).optional(),
  optionalPlatforms: z.array(DistributionPlatformSchema).default([]),
  children: z.array(PlatformReleaseChildSchema).min(1),
}).strict().superRefine((matrix, context) => {
  const platforms = matrix.children.map((child) => child.platform);
  if (new Set(platforms).size !== platforms.length) context.addIssue({ code: 'custom', path: ['children'], message: 'platform children must be unique' });
  if (!platforms.includes(matrix.primaryPlatform)) context.addIssue({ code: 'custom', path: ['primaryPlatform'], message: 'primaryPlatform must have a release child' });
  const required = matrix.requiredPlatforms ?? matrix.children.filter((child) => child.required).map((child) => child.platform);
  if (new Set(required).size !== required.length) context.addIssue({ code: 'custom', path: ['requiredPlatforms'], message: 'required platforms must be unique' });
  if (matrix.optionalPlatforms.some((platform) => required.includes(platform))) context.addIssue({ code: 'custom', path: ['optionalPlatforms'], message: 'optional platforms must not duplicate required platforms' });
  for (const platform of required) if (!platforms.includes(platform)) context.addIssue({ code: 'custom', path: ['requiredPlatforms'], message: `required platform ${platform} has no child` });
});
export type PlatformReleaseMatrix = z.infer<typeof PlatformReleaseMatrixSchema>;

export const PlatformQaResultSchema = z.object({
  platform: DistributionPlatformSchema,
  passed: z.boolean(),
  evidence: z.array(Text),
  normalFlowEvidence: z.array(Text).default([]),
  visualEvidence: z.array(Text).default([]),
  runtimeEvidence: z.array(Text).default([]),
  artifactHash: Sha256.optional(),
  packagePath: Text.optional(),
  device: z.object({ name: Text, width: z.number().int().positive(), height: z.number().int().positive() }).strict().optional(),
  consoleErrors: z.array(Text).default([]),
  pageErrors: z.array(Text).default([]),
  performance: z.object({ p95FrameMs: z.number().nonnegative(), memoryMb: z.number().nonnegative() }).strict().optional(),
}).strict().superRefine((result, context) => {
  if (result.passed && !result.artifactHash) context.addIssue({ code: 'custom', path: ['artifactHash'], message: 'passed platform QA requires an artifact hash' });
  if (result.passed && !result.device) context.addIssue({ code: 'custom', path: ['device'], message: 'passed platform QA requires device dimensions' });
  if (result.passed && (result.consoleErrors.length > 0 || result.pageErrors.length > 0)) context.addIssue({ code: 'custom', message: 'passed platform QA cannot contain console or page errors' });
});
export const PlatformQaSubmissionSchema = z.object({ schemaVersion: z.literal(1), results: z.array(PlatformQaResultSchema).min(1), submittedAt: z.string().datetime() }).strict().superRefine((submission, context) => {
  const platforms = submission.results.map((result) => result.platform);
  if (new Set(platforms).size !== platforms.length) context.addIssue({ code: 'custom', path: ['results'], message: 'platform QA may submit each platform only once' });
});
export type PlatformQaResult = z.infer<typeof PlatformQaResultSchema>;
export type PlatformQaSubmission = z.infer<typeof PlatformQaSubmissionSchema>;

export const CostBudgetSchema = z.object({
  currency: z.literal('CNY'),
  maxTotalCents: z.number().int().positive(),
  maxPaidTrafficCents: z.number().int().nonnegative(),
  maxAgentTokens: z.number().int().positive(),
  maxHumanMinutes: z.number().int().positive(),
  /** Optional project-specific ceiling. Omission means FIX has no attempt-count ceiling. */
  maxFixAttempts: z.number().int().nonnegative().optional(),
  paybackWindowDays: z.number().int().positive().max(365),
  /** Non-money ceilings keep an unattended run from burning time or assets. */
  maxWallClockMinutes: z.number().int().positive().optional(),
  maxAssetBatches: z.number().int().positive().optional(),
  maxBuildAttempts: z.number().int().positive().optional(),
  maxRepairLoops: z.number().int().positive().optional(),
}).strict().superRefine((budget, context) => {
  if (budget.maxPaidTrafficCents > budget.maxTotalCents) context.addIssue({ code: 'custom', path: ['maxPaidTrafficCents'], message: 'paid traffic budget cannot exceed total budget' });
});
export type CostBudget = z.infer<typeof CostBudgetSchema>;

export const CostBlockerSchema = z.enum(['total-cost', 'paid-traffic', 'agent-tokens', 'human-time', 'fix-attempts', 'wall-clock', 'asset-batches', 'build-attempts', 'repair-loops']);
export type CostBlocker = z.infer<typeof CostBlockerSchema>;

export const CostUsageBreakdownSchema = z.object({
  agentCents: z.number().int().nonnegative(),
  imageCents: z.number().int().nonnegative(),
  humanCents: z.number().int().nonnegative(),
  paidTrafficCents: z.number().int().nonnegative(),
  adjustmentCents: z.number().int().nonnegative(),
}).strict();
export type CostUsageBreakdown = z.infer<typeof CostUsageBreakdownSchema>;

export const CostUsageSchema = z.object({
  totalCents: z.number().int().nonnegative(),
  paidTrafficCents: z.number().int().nonnegative(),
  agentTokens: z.number().int().nonnegative(),
  humanMinutes: z.number().int().nonnegative(),
  fixAttempts: z.number().int().nonnegative(),
  wallClockMinutes: z.number().int().nonnegative().optional(),
  assetBatches: z.number().int().nonnegative().optional(),
  buildAttempts: z.number().int().nonnegative().optional(),
  repairLoops: z.number().int().nonnegative().optional(),
  /** Cost attribution is optional for backwards-compatible legacy artifacts. */
  breakdown: CostUsageBreakdownSchema.optional(),
}).strict();
export type CostUsage = z.infer<typeof CostUsageSchema>;

export const CostGateReportSchema = z.object({
  schemaVersion: z.literal(1),
  passed: z.boolean(),
  blockers: z.array(CostBlockerSchema),
  budget: CostBudgetSchema,
  usage: CostUsageSchema,
}).strict();
export type CostGateReport = z.infer<typeof CostGateReportSchema>;

export const AccountCheckSchema = z.object({
  platform: DistributionPlatformSchema,
  status: z.enum(['pass', 'blocked', 'unknown']),
  evidence: z.array(Text).min(1),
  checkedAt: z.string().datetime(),
}).strict();
export type AccountCheck = z.infer<typeof AccountCheckSchema>;

export const BusinessPreflightSchema = z.object({
  schemaVersion: z.literal(1),
  entity: z.enum(['personal', 'sole_proprietor', 'company', 'publisher']),
  monetization: z.literal('IAA'),
  targets: z.array(DistributionPlatformSchema).min(1),
  /**
   * Optional distribution children are tracked for planning, but their
   * account/payout uncertainty must not block a domestic release.  Legacy
   * artifacts omit this field and therefore retain the old all-required
   * semantics for `targets`.
   */
  optionalTargets: z.array(DistributionPlatformSchema).default([]),
  accountChecks: z.array(AccountCheckSchema).min(1),
  rightsStatus: z.enum(['pass', 'blocked', 'unknown']),
  payoutStatus: z.enum(['pass', 'blocked', 'unknown']),
  budget: CostBudgetSchema,
  decision: z.enum(['GO', 'PAUSE', 'KILL']),
  blockers: z.array(Text),
  unknowns: z.array(Text),
  checkedAt: z.string().datetime(),
}).strict().superRefine((preflight, context) => {
  const targetSet = new Set(preflight.targets);
  if (new Set(preflight.targets).size !== preflight.targets.length) context.addIssue({ code: 'custom', path: ['targets'], message: 'required targets must be unique' });
  if (new Set(preflight.optionalTargets).size !== preflight.optionalTargets.length) context.addIssue({ code: 'custom', path: ['optionalTargets'], message: 'optional targets must be unique' });
  if (preflight.optionalTargets.some((target) => targetSet.has(target))) context.addIssue({ code: 'custom', path: ['optionalTargets'], message: 'optional targets must not duplicate required targets' });
  const checksByPlatform = new Map(preflight.accountChecks.map((check) => [check.platform, check]));
  for (const target of targetSet) {
    const check = checksByPlatform.get(target);
    if (!check) context.addIssue({ code: 'custom', path: ['accountChecks'], message: `missing account check for ${target}` });
    else if (check.status === 'blocked' && !preflight.blockers.includes(target)) context.addIssue({ code: 'custom', path: ['blockers'], message: `blocked platform ${target} must be listed as a blocker` });
    else if (check.status === 'unknown' && !preflight.unknowns.includes(target)) context.addIssue({ code: 'custom', path: ['unknowns'], message: `unknown platform ${target} must be listed as an unknown` });
  }
  if (preflight.rightsStatus === 'blocked' && !preflight.blockers.includes('rights')) context.addIssue({ code: 'custom', path: ['blockers'], message: 'blocked rights must be listed as a blocker' });
  if (preflight.rightsStatus === 'unknown' && !preflight.unknowns.includes('rights')) context.addIssue({ code: 'custom', path: ['unknowns'], message: 'unknown rights must be listed as an unknown' });
  if (preflight.payoutStatus === 'blocked' && !preflight.blockers.includes('payout')) context.addIssue({ code: 'custom', path: ['blockers'], message: 'blocked payout must be listed as a blocker' });
  if (preflight.payoutStatus === 'unknown' && !preflight.unknowns.includes('payout')) context.addIssue({ code: 'custom', path: ['unknowns'], message: 'unknown payout must be listed as an unknown' });
  if (preflight.decision === 'GO' && (preflight.blockers.length > 0 || preflight.unknowns.length > 0)) context.addIssue({ code: 'custom', message: 'GO requires zero blockers and zero unknowns' });
  if (preflight.decision === 'PAUSE' && preflight.blockers.length === 0 && preflight.unknowns.length === 0) context.addIssue({ code: 'custom', message: 'PAUSE requires a blocker or unknown' });
  if (preflight.decision === 'KILL' && preflight.blockers.length === 0) context.addIssue({ code: 'custom', message: 'KILL requires a blocker' });
});
export type BusinessPreflight = z.infer<typeof BusinessPreflightSchema>;

export const GrowthChannelSchema = z.object({
  kind: z.enum(['organic', 'paid']),
  platform: DistributionPlatformSchema,
  campaignId: Text.nullable(),
  creativePaths: z.array(Text).min(1),
  stopRules: z.array(Text).min(1),
}).strict();

export const GrowthExperimentSchema = z.object({
  schemaVersion: z.literal(1),
  gameId: Text,
  maxBudgetCents: z.number().int().nonnegative(),
  channels: z.array(GrowthChannelSchema).min(1),
  createdAt: z.string().datetime(),
}).strict().superRefine((experiment, context) => {
  if (!experiment.channels.some((channel) => channel.kind === 'organic')) context.addIssue({ code: 'custom', path: ['channels'], message: 'growth plan must include an organic channel' });
  if (experiment.channels.some((channel) => channel.kind === 'paid') && experiment.maxBudgetCents === 0) context.addIssue({ code: 'custom', path: ['maxBudgetCents'], message: 'paid growth requires a non-zero capped budget' });
});
export type GrowthExperiment = z.infer<typeof GrowthExperimentSchema>;

export const GrowthDecisionSchema = z.object({
  schemaVersion: z.literal(1),
  platform: DistributionPlatformSchema,
  channel: z.enum(['organic', 'paid']),
  decision: z.enum(['COLLECTING', 'SCALE', 'ITERATE_ONCE', 'KILL']),
  users: z.number().int().nonnegative(),
  spendCents: z.number().int().nonnegative(),
  netRevenueCents: z.number().int().nonnegative(),
  cpiCents: z.number().nonnegative(),
  netLtvCents: z.number().nonnegative(),
  observedDays: z.number().int().nonnegative(),
  blockers: z.array(Text),
  rationale: Text,
  decidedAt: z.string().datetime(),
}).strict();
export type GrowthDecision = z.infer<typeof GrowthDecisionSchema>;

export const QaEvidenceModeSchema = z.enum(['NATURAL_E2E', 'STATE_COVERAGE', 'SIMULATION_FUZZ']);
export type QaEvidenceMode = z.infer<typeof QaEvidenceModeSchema>;

export const QaEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  mode: QaEvidenceModeSchema,
  actions: z.array(Text).min(1),
  artifacts: z.array(Text).min(1),
  forbiddenOperations: z.array(Text),
  /** Trusted-runner provenance; optional keeps legacy evidence readable. */
  buildHash: Sha256.optional(),
  runtime: Text.optional(),
  device: z.object({ width: z.number().int().positive(), height: z.number().int().positive(), label: Text }).strict().optional(),
  seed: z.union([z.number().int(), Text]).optional(),
  runner: Text.optional(),
}).strict().superRefine((evidence, context) => {
  if (evidence.mode === 'NATURAL_E2E' && evidence.forbiddenOperations.length > 0) {
    context.addIssue({ code: 'custom', path: ['forbiddenOperations'], message: 'NATURAL_E2E cannot contain state-forcing operations' });
  }
});
export type QaEvidence = z.infer<typeof QaEvidenceSchema>;

export const FailureHypothesisSchema = z.object({
  cause: Text,
  confidence: z.number().min(0).max(1),
  evidence: z.array(Text).min(1),
}).strict();

export const FailureReportSchema = z.object({
  schemaVersion: z.literal(1),
  stage: Text,
  failureClass: z.enum(['rights', 'compliance', 'core_experience', 'platform', 'build', 'qa', 'growth', 'monetization', 'unknown']),
  routeTo: Text,
  message: Text,
  hypotheses: z.array(FailureHypothesisSchema).min(1),
  /** Structured attribution prevents every failure from being handed to Fixer. */
  symptom: Text.optional(),
  reproduction: Text.optional(),
  suspectedRootCauses: z.array(z.object({ artifact: Text, confidence: z.number().min(0).max(1), reason: Text }).strict()).default([]),
  primaryRoute: Text.optional(),
  secondaryRoutes: z.array(Text).default([]),
  owner: z.enum(['ResearchAgent', 'ProducerAgent', 'BuilderAgent', 'FixerAgent', 'QAAgent', 'ReleaseAgent', 'HumanReviewer', 'FactoryControlPlane']).optional(),
  regressionTest: Text.nullable().default(null),
  status: z.enum(['OPEN', 'ROUTED', 'RESOLVED', 'WAIVED']).default('OPEN'),
  failureKind: z.enum(['TRANSIENT', 'SPEC_ERROR', 'TOOL_ERROR', 'CAPABILITY_ERROR', 'POLICY_BLOCK']).default('CAPABILITY_ERROR'),
  retryable: z.boolean().default(true),
  attempts: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
}).strict();
export type FailureReport = z.infer<typeof FailureReportSchema>;

/** Durable control-plane evidence emitted when automatic FIX reaches its cap. */
export const FixCapBlockerSchema = z.object({
  schemaVersion: z.literal(1),
  stage: z.literal('FIX'),
  status: z.literal('BLOCKED'),
  attempts: z.number().int().positive(),
  maxAutomaticAttempts: z.number().int().positive(),
  reason: Text,
  nextAction: z.literal('human-review-required'),
  message: Text,
}).strict();
export type FixCapBlocker = z.infer<typeof FixCapBlockerSchema>;

export const ReleaseCandidateSchema = z.object({
  schemaVersion: z.literal(1),
  gameId: Text,
  coreHash: Sha256,
  acceptanceArtifact: Text,
  /** Present for a platform-ready candidate; omitted for a web-only dev package. */
  platformMatrix: Text.optional(),
  testedAt: z.string().datetime(),
  status: z.enum(['READY', 'BLOCKED']),
  files: z.array(z.object({ path: Text, sha256: Sha256 }).strict()).min(1),
  platformHash: Sha256.optional(),
  acceptanceHash: Sha256.optional(),
  /** Quality evidence is bound to the exact candidate files that were tested. */
  qualityMatrix: Text.optional(),
  qualityBaseline: Text.optional(),
  originalityDeclaration: Text.optional(),
}).strict().superRefine((candidate, context) => {
  if (candidate.status === 'READY' && candidate.files.length === 0) context.addIssue({ code: 'custom', path: ['files'], message: 'READY candidates require hashed files' });
});
export type ReleaseCandidate = z.infer<typeof ReleaseCandidateSchema>;

export const HumanApprovalSessionSchema = z.object({
  schemaVersion: z.literal(1),
  session: z.enum(['GO_NO_GO', 'CORE_DEMO', 'FINAL_RELEASE']),
  decision: z.enum(['APPROVE', 'REVISE', 'KILL']),
  notes: z.array(Text),
  evidence: z.array(Text).min(1),
  approvedAt: z.string().datetime(),
}).strict();
export type HumanApprovalSession = z.infer<typeof HumanApprovalSessionSchema>;

export const HumanPlaytestAcceptanceSchema = z.object({
  schemaVersion: z.literal(1),
  passed: z.boolean(),
  sessionId: Text,
  /** SHA-256 of the immutable candidate actually played by the reviewer. */
  buildHash: Sha256.optional(),
  inputMode: z.enum(['touch', 'mouse', 'keyboard', 'mouse_and_touch']),
  notes: z.array(Text).min(1),
  evidence: z.array(Text).min(1),
  approvedAt: z.string().datetime(),
}).strict();
export type HumanPlaytestAcceptance = z.infer<typeof HumanPlaytestAcceptanceSchema>;

export const ContentVariationReportSchema = z.object({
  schemaVersion: z.literal(1),
  passed: z.boolean(),
  variants: z.array(z.object({ id: Text, differences: z.array(Text).min(1), evidence: z.array(Text).min(1) }).strict()).min(2),
  rationale: Text,
}).strict().superRefine((report, context) => {
  if (new Set(report.variants.map((variant) => variant.id)).size !== report.variants.length) context.addIssue({ code: 'custom', path: ['variants'], message: 'content variation ids must be unique' });
  if (report.passed && report.variants.some((variant) => variant.differences.every((difference) => /(?:text|color|cosmetic|palette|文案|颜色|换皮)/iu.test(difference)))) context.addIssue({ code: 'custom', path: ['variants'], message: 'passed variation must include structural or decision differences, not only presentation' });
});
export type ContentVariationReport = z.infer<typeof ContentVariationReportSchema>;

/** Evaluation cohorts have different jobs: calibration tunes thresholds,
 * golden protects known behavior, holdout checks generalization, canary
 * catches release regressions, and adversarial cases probe safety boundaries. */
export const FactoryEvalDatasetSchema = z.enum(['calibration', 'golden', 'holdout', 'canary', 'adversarial']);
export type FactoryEvalDataset = z.infer<typeof FactoryEvalDatasetSchema>;

/** Human-calibrated benchmark notes keep an eval case useful beyond routing.
 * They describe what a reviewer should feel/observe and what the smallest
 * honest prototype may claim.  All fields are descriptive data; they are not
 * executable instructions for a provider. */
export const FactoryEvalBenchmarkSchema = z.object({
  experienceType: Text,
  coreLoop: z.array(Text).min(1),
  keyOperation: Text,
  delight: z.array(Text).min(1),
  failureMechanisms: z.array(Text).min(1),
  prototypeScope: z.array(Text).min(1),
  prohibitedCopying: z.array(Text).min(1),
  technicalDifficulties: z.array(Text),
  /** A human score is optional until a case has been manually calibrated. */
  humanScore: z.number().min(0).max(10).nullable().optional(),
  reviewerNotes: z.array(Text).default([]),
}).strict();
export type FactoryEvalBenchmark = z.infer<typeof FactoryEvalBenchmarkSchema>;

export const FactoryEvalCaseSchema = z.object({
  schemaVersion: z.literal(1),
  caseId: Text,
  input: Text,
  targetRunId: Text.optional(),
  expectedProfile: z.enum(['ACTION_FEEL', 'NARRATIVE_AGENCY', 'STRATEGIC_SYSTEM', 'PUZZLE_CLARITY', 'SOCIAL_EMOTION', 'EXPLORATION_DISCOVERY']),
  /** Acceptable alternatives make ambiguity explicit instead of hiding it in a prompt. */
  acceptableProfiles: z.array(z.enum(['ACTION_FEEL', 'NARRATIVE_AGENCY', 'STRATEGIC_SYSTEM', 'PUZZLE_CLARITY', 'SOCIAL_EMOTION', 'EXPLORATION_DISCOVERY'])).default([]),
  /** Support is a separate boundary decision; a profile match must not greenlight an unsupported product. */
  expectedSupportDecision: z.enum(['SUPPORTED', 'HYBRID_REVIEW_REQUIRED', 'NEW_LINE_REQUIRED', 'UNSUPPORTED']).optional(),
  acceptableSupportDecisions: z.array(z.enum(['SUPPORTED', 'HYBRID_REVIEW_REQUIRED', 'NEW_LINE_REQUIRED', 'UNSUPPORTED'])).optional(),
  dataset: FactoryEvalDatasetSchema.default('golden'),
  requiredStages: z.array(Text).min(1),
  forbiddenOutcomes: z.array(Text),
  benchmark: FactoryEvalBenchmarkSchema.optional(),
}).strict();
export type FactoryEvalCase = z.infer<typeof FactoryEvalCaseSchema>;

/** Versioned, reviewable factory-eval corpus. Keeping the corpus outside
 * executable code lets a product owner add a regression case without
 * changing routing logic; the file itself is included in the factory source
 * signature so cached reports cannot survive a dataset edit. */
export const FactoryEvalCasesFileSchema = z.object({
  schemaVersion: z.literal(1),
  suiteVersion: Text,
  cases: z.array(FactoryEvalCaseSchema).min(1),
}).strict().superRefine((value, context) => {
  const ids = value.cases.map((item) => item.caseId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['cases'], message: 'factory eval case ids must be unique' });
});
export type FactoryEvalCasesFile = z.infer<typeof FactoryEvalCasesFileSchema>;

export const FactoryEvalReportSchema = z.object({
  schemaVersion: z.literal(1),
  suiteVersion: Text,
  modelSignature: Text,
  promptSignature: Text,
  /** Hash of the factory source/templates/config used for this evaluation. */
  factorySignature: Sha256.optional(),
  /** Structured feedback cases included in the run, if any. */
  feedbackRegressionIds: z.array(Text).default([]),
  /** Content hash of the feedback regression ledger, not just its ids. */
  feedbackRegressionSignature: Sha256.optional(),
  feedbackRegressionCoverage: z.object({ total: z.number().int().nonnegative(), executable: z.number().int().nonnegative(), executed: z.number().int().nonnegative() }).strict().optional(),
  cases: z.array(z.object({ caseId: Text, dataset: FactoryEvalDatasetSchema.default('golden'), observedProfile: z.string().trim().min(1).optional(), observedSupportDecision: z.enum(['SUPPORTED', 'HYBRID_REVIEW_REQUIRED', 'NEW_LINE_REQUIRED', 'UNSUPPORTED']).optional(), inputHash: Sha256.optional(), passed: z.boolean(), failures: z.array(Text) }).strict()).min(1),
  passed: z.boolean(),
  runAt: z.string().datetime(),
}).strict();
export type FactoryEvalReport = z.infer<typeof FactoryEvalReportSchema>;

export const LiveMonitoringSchema = z.object({
  schemaVersion: z.literal(1),
  gameId: Text,
  platform: DistributionPlatformSchema,
  releaseHash: Sha256,
  status: z.enum(['LIVE_VERIFIED', 'LIVE_MONITORING', 'PAUSED', 'TAKEN_DOWN']),
  metrics: z.object({ starts: z.number().int().nonnegative(), firstSessionCompletionRate: z.number().min(0).max(1), crashRate: z.number().min(0).max(1), adShowRate: z.number().min(0).max(1), netRevenueCents: z.number().int().nonnegative() }).strict(),
  alerts: z.array(Text),
  observedAt: z.string().datetime(),
}).strict();
export type LiveMonitoring = z.infer<typeof LiveMonitoringSchema>;
