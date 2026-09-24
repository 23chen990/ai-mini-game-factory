import { z } from 'zod';
import { ReferenceMechanicSpecSchema } from './reference-mechanic.js';
import { SpatialShopSpecSchema } from './spatial-shop.js';
import { GameplayRevisionReferenceSchema } from './gameplay-revision.js';
import { ExperienceProfileSelectionSchema } from './experience-profile.js';
import { PlayerAcceptanceGateSchema } from './acceptance-artifacts.js';
import { QaEvidenceSchema } from './factory-operating.js';
import { NaturalFlowEvidenceSchema } from './natural-flow.js';
import { StageNameSchema } from './stage-name.js';
import type { StageName } from './stage-name.js';
import { InteractionContinuityReportSchema } from './interaction-continuity.js';
import { FailurePressureContractSchema } from './failure-pressure-contract.js';
import { GameSeedIdentitySchema } from './game-identity.js';

export { StageNameSchema } from './stage-name.js';
export type { StageName } from './stage-name.js';

export { HumanReferenceDecisionSchema, ReferenceMechanicSpecSchema } from './reference-mechanic.js';
export type { HumanReferenceDecision, ReferenceMechanicSpec } from './reference-mechanic.js';
export { ReferenceFidelityContractSchema } from './reference-fidelity.js';
export type { ReferenceFidelityContract } from './reference-fidelity.js';
export { ReferenceCoreGameplayResearchSchema } from './reference-core-gameplay-research.js';
export type { ReferenceCoreGameplayResearch } from './reference-core-gameplay-research.js';
export { FailurePressureContractSchema, FailurePressureEvidenceSchema, FailurePressureRuleSchema } from './failure-pressure-contract.js';
export type { FailurePressureContract, FailurePressureEvidence, FailurePressureRule } from './failure-pressure-contract.js';
export { GameplayRevisionLockSchema, GameplayRevisionReferenceSchema } from './gameplay-revision.js';
export type { GameplayRevisionLock, GameplayRevisionReference } from './gameplay-revision.js';
export { SpatialShopSpecSchema, SpatialShopStationSchema } from './spatial-shop.js';
export type { SpatialShopSpec, SpatialShopStation } from './spatial-shop.js';
export { isNarrativeChoiceAvailable, NarrativeLifePrototypeSchema, resolveNarrativeEnding } from './narrative-life-prototype.js';
export type { NarrativeLifePrototype } from './narrative-life-prototype.js';
export { ExperienceContractSchema, NaturalPlayPlanSchema, ExperienceReviewReportSchema } from './experience-contract.js';
export type { ExperienceContract, NaturalPlayPlan, ExperienceReviewReport } from './experience-contract.js';
export { ExperienceProfileSelectionSchema, PrimaryExperienceProfileSchema, SecondaryExperienceProfileSchema, ActionFeelContractSchema, NarrativeAgencyContractSchema, StrategicSystemContractSchema, PuzzleClarityContractSchema, SocialEmotionContractSchema, ExplorationDiscoveryContractSchema, ProfileExperienceContractSchema } from './experience-profile.js';
export type { ExperienceProfileSelection, ProfileExperienceContract } from './experience-profile.js';
export {
  InteractionConstraintSchema,
  InteractionRecoverySchema,
  InteractionRepetitionSchema,
  InteractionEvidenceSchema,
  InteractionActionSchema,
  InteractionNodeSchema,
  InteractionScenarioSchema,
  InteractionContinuityContractSchema,
  InteractionContinuityObservationNodeSchema,
  InteractionRepetitionObservationSchema,
  InteractionContinuityObservationSchema,
  InteractionContinuityReportSchema,
  InteractionContinuitySummarySchema,
} from './interaction-continuity.js';
export type {
  InteractionConstraint,
  InteractionRecovery,
  InteractionRepetition,
  InteractionEvidence,
  InteractionAction,
  InteractionNode,
  InteractionScenario,
  InteractionContinuityContract,
  InteractionContinuityObservationNode,
  InteractionContinuityObservation,
  InteractionContinuityReport,
  InteractionContinuitySummary,
} from './interaction-continuity.js';
export { AcceptanceManifestSchema, ActionRealizabilitySchema, PlaytestTraceSchema, ProfileReviewReportSchema, PlayerAcceptanceGateSchema, isPlayerAcceptanceReady } from './acceptance-artifacts.js';
export type { AcceptanceManifest, ActionRealizability, PlaytestTrace, ProfileReviewReport, PlayerAcceptanceGate } from './acceptance-artifacts.js';
export * from './factory-operating.js';
export * from './stage-contracts.js';
export * from './product-experience.js';
export * from './operating-profile.js';
export * from './feedback.js';
export * from './pipeline-plan.js';
export * from './quality-baseline.js';
export * from './originality.js';
export * from './launch-operations.js';
export * from './platform-spine.js';
export * from './art-quality.js';
export * from './reference-evidence.js';
export * from './game-identity.js';
export * from './reference-quality-audit.js';
export * from './experience-complaint.js';
export * from './evidence-provenance.js';
export * from './model-policy.js';
export * from './artifact-ledger.js';
export * from './human-approval.js';
export * from './release-lifecycle.js';
export * from './randomness.js';
export * from './permission-manifest.js';
export * from './iaa-contract.js';
export * from './differentiation.js';
export * from './evidence-claims.js';
export * from './unknowns.js';
export * from './production-line.js';
export * from './production-line-resolution.js';
export * from './profile-stage.js';
export * from './platform-package.js';
export * from './presentation-evidence.js';
export { PreviewPresentationDisclosureSchema } from '../core/preview-presentation-disclosure.js';
export type { PreviewPresentationDisclosure } from '../core/preview-presentation-disclosure.js';
export * from './supply-chain.js';
export { DependencyAllowlistEntrySchema, DependencyPolicySchema } from './dependency-policy.js';
export type { DependencyAllowlistEntry, DependencyPolicy as DependencyAllowlistPolicy } from './dependency-policy.js';
export * from './side-effect.js';
export * from './side-effect-journal.js';
export * from './blind-playtest.js';
export * from './artifact-metadata.js';
export * from './content-variation.js';
export * from './live-verification.js';
export * from './variation-coverage.js';
export * from './profile-qa.js';
export * from './experience-hypothesis.js';
export * from './content-expansion.js';
export * from './ui-skeleton.js';
export * from './profile-contract.js';
export * from './production-line-qa.js';
export * from './factory-constitution.js';
export * from './business-strategy.js';
export * from './account-capacity.js';
export * from './portfolio-strategy.js';
export * from './platform-policy.js';
export * from './schema-migrations.js';
export * from './research-evidence.js';
export * from './quality-gates.js';
export * from './natural-flow.js';
export * from './natural-input-policy.js';
export * from './cost-accounting.js';
export * from './state-transition.js';
export { auditNarrativeChoices, NarrativeChoiceAuditSchema } from './narrative-choice-audit.js';
export type { NarrativeChoiceAudit, NarrativeChoiceAuditOptions } from './narrative-choice-audit.js';

export const ExecutionStatusSchema = z.enum(['pending', 'running', 'waiting', 'completed', 'failed']);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

/** Operator-facing readiness is intentionally separate from the low-level
 * execution status. A completed Builder stage is not automatically a release
 * candidate, and a fast-lane completion must remain visibly distinguishable
 * from a fully approved release. */
export const RunReadinessSchema = z.enum([
  'IN_PROGRESS',
  'WAITING',
  'IMPLEMENTATION_READY',
  'CANDIDATE_READY',
  'RELEASE_READY',
  'LIVE_MONITORING',
  'LIVE_VERIFIED',
  'LAUNCH_METRICS',
  'FAILED',
  'ABANDONED',
  'NOT_GREENLIT',
  'DESIGN_REJECTED',
  'NO_PROTOTYPE_WINNER',
  'EXPERIMENT_APPROVED',
  'EXPERIMENT_REFACTOR',
  'EXPERIMENT_KILLED',
]);
export type RunReadiness = z.infer<typeof RunReadinessSchema>;

export const RequestTypeSchema = z.enum(['NEW_GAME', 'GAMEPLAY_REVISION', 'PRODUCTIZATION_REVISION', 'VISUAL_REVISION', 'BALANCE_REVISION', 'BUG_FIX', 'MONETIZATION_REVISION', 'RELEASE']);
export type RequestType = z.infer<typeof RequestTypeSchema>;
export const OptionalReviewStageSchema = z.enum(['COMPETITOR_RESEARCH', 'PRODUCTION_COST_REVIEW', 'IAA_MONETIZATION_REVIEW']);
export type OptionalReviewStage = z.infer<typeof OptionalReviewStageSchema>;
export const ReviewAgentNameSchema = z.enum(['CompetitorResearchAgent', 'ProductionCostReviewerAgent', 'IaaMonetizationReviewerAgent']);
export type ReviewAgentName = z.infer<typeof ReviewAgentNameSchema>;
export const RequestRouterInputSchema = z.object({ request: z.string().trim().min(1), targetRunId: z.string().trim().min(1).optional() });
export type RequestRouterInput = z.infer<typeof RequestRouterInputSchema>;
export const RouteSupportDecisionSchema = z.enum(['SUPPORTED', 'HYBRID_REVIEW_REQUIRED', 'NEW_LINE_REQUIRED', 'UNSUPPORTED']);
export type RouteSupportDecision = z.infer<typeof RouteSupportDecisionSchema>;
export const FeedbackRepairRouteSchema = z.enum(['direct-builder', 'formal-fixer']);
export type FeedbackRepairRoute = z.infer<typeof FeedbackRepairRouteSchema>;

const REVIEW_AGENT_BY_STAGE = {
  COMPETITOR_RESEARCH: 'CompetitorResearchAgent',
  PRODUCTION_COST_REVIEW: 'ProductionCostReviewerAgent',
  IAA_MONETIZATION_REVIEW: 'IaaMonetizationReviewerAgent',
} as const satisfies Record<OptionalReviewStage, ReviewAgentName>;

export const ReviewEscalationSchema = z.object({
  schemaVersion: z.literal(1),
  requestedBy: ReviewAgentNameSchema,
  review: OptionalReviewStageSchema,
  reason: z.string().trim().min(1),
}).superRefine((value, context) => {
  if (REVIEW_AGENT_BY_STAGE[value.review] !== value.requestedBy) {
    context.addIssue({ code: 'custom', message: `${value.review} may only be requested by its corresponding review agent` });
  }
});
export type ReviewEscalation = z.infer<typeof ReviewEscalationSchema>;

const NEW_GAME_REVIEW_PATH: StageName[] = ['REFERENCE_DEEP_RESEARCH', 'REFERENCE_MECHANIC_LOCK', 'WAITING_FOR_REFERENCE_APPROVAL'];
const NEW_GAME_FORBIDDEN_IDEATION_STAGES = new Set<StageName>(['COMPETITOR_RESEARCH', 'IDEA_GENERATION', 'LOW_COST_FILTER', 'PROTOTYPE_SELECTION', 'BUILD_3_PROTOTYPES', 'PLAYTEST_TOURNAMENT', 'WINNER_SELECTION', 'WAITING_FOR_PROTOTYPE_APPROVAL']);
export const RequestRouteSchema = z.object({
  schemaVersion: z.literal(1),
  request: z.string().trim().min(1),
  requestType: RequestTypeSchema,
  targetRunId: z.string().trim().min(1).nullable(),
  stages: z.array(StageNameSchema).min(1),
  fullGreenlight: z.boolean(),
  reviewEscalations: z.array(ReviewEscalationSchema),
  experienceProfile: ExperienceProfileSelectionSchema.default({ schemaVersion: 1, primary: 'STRATEGIC_SYSTEM', secondary: null, lockedBy: 'agent', rationale: 'Legacy route default.' }),
  /** Explicitly prevents complex products from silently entering a light-game line. */
  supportDecision: RouteSupportDecisionSchema.default('SUPPORTED'),
  /** Machine-readable ownership route; existing-game defects cannot silently downgrade. */
  repairRoute: FeedbackRepairRouteSchema.default('direct-builder'),
  repairReasons: z.array(z.string().trim().min(1)).default([]),
  rationale: z.string().trim().min(1),
}).superRefine((value, context) => {
  if (value.requestType === 'NEW_GAME') {
    if (value.targetRunId !== null) context.addIssue({ code: 'custom', path: ['targetRunId'], message: 'NEW_GAME must not target an existing run' });
    if (value.supportDecision !== 'SUPPORTED') {
      if (value.fullGreenlight) context.addIssue({ code: 'custom', path: ['fullGreenlight'], message: 'unsupported or new-line requests cannot be greenlit' });
      if (JSON.stringify(value.stages) !== JSON.stringify(['BUSINESS_PREFLIGHT', 'PRODUCTION_LINE_REVIEW'])) context.addIssue({ code: 'custom', path: ['stages'], message: 'unsupported new games must stop at business and production-line review' });
      return;
    }
    if (!value.fullGreenlight || NEW_GAME_REVIEW_PATH.some((stage, index) => value.stages[index] !== stage)) {
      context.addIssue({ code: 'custom', path: ['stages'], message: 'NEW_GAME requires a human-locked designated-reference path' });
    }
    if (value.stages.some((stage) => NEW_GAME_FORBIDDEN_IDEATION_STAGES.has(stage))) {
      context.addIssue({ code: 'custom', path: ['stages'], message: 'NEW_GAME reference mode forbids agent ideation and prototype tournament stages' });
    }
    return;
  }
  if (!value.targetRunId) context.addIssue({ code: 'custom', path: ['targetRunId'], message: 'targetRunId is required for an existing-game request' });
  if (value.fullGreenlight) context.addIssue({ code: 'custom', path: ['fullGreenlight'], message: 'Existing-game requests must not default to full greenlight' });
  if (value.stages.includes('GREENLIGHT_GATE')) context.addIssue({ code: 'custom', path: ['stages'], message: 'Existing-game routes must not include GREENLIGHT_GATE by default' });
  if (value.repairRoute === 'formal-fixer' && JSON.stringify(value.stages.slice(0, 3)) !== JSON.stringify(['QA', 'FIX', 'QA'])) {
    context.addIssue({ code: 'custom', path: ['stages'], message: 'formal-fixer routes must begin with QA → FIX → QA' });
  }
  const authorizedReviews = new Set(value.reviewEscalations.map((decision) => decision.review));
  for (const review of OptionalReviewStageSchema.options) {
    if (value.stages.includes(review) && !authorizedReviews.has(review)) context.addIssue({ code: 'custom', path: ['stages'], message: `${review} requires a corresponding agent escalation` });
  }
});
export type RequestRoute = z.infer<typeof RequestRouteSchema>;

export const LessonAgentSchema = z.enum(['CompetitorResearchAgent', 'GameDesignerAgent', 'ProductionCostReviewer', 'IAAReviewer', 'GreenlightAgent', 'BuilderAgent', 'PlaytestAgent']);
export type LessonAgent = z.infer<typeof LessonAgentSchema>;
export const DesignLessonTagSchema = z.enum(['gameplay', 'production_cost', 'iaa', 'greenlight', 'qa', 'art', 'general']);
export const DesignLessonSchema = z.object({
  lessonId: z.string().min(8),
  text: z.string().trim().min(1),
  tags: z.array(DesignLessonTagSchema).min(1),
  appliesTo: z.array(LessonAgentSchema).min(1),
  sourceRunIds: z.array(z.string().min(1)).min(1),
  occurrences: z.number().int().positive(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
});
export type DesignLesson = z.infer<typeof DesignLessonSchema>;
export const DesignLessonsSchema = z.object({ schemaVersion: z.literal(1), lessons: z.array(DesignLessonSchema) });
export type DesignLessons = z.infer<typeof DesignLessonsSchema>;
export const FeedbackRecordSchema = z.object({
  schemaVersion: z.literal(1),
  feedbackId: z.string().min(8),
  runId: z.string().min(1),
  rawFeedback: z.string().trim().min(1),
  projectChanges: z.array(z.string().trim().min(1)),
  projectRoute: RequestRouteSchema.nullable(),
  reusableLessons: z.array(DesignLessonSchema),
  recordedAt: z.string(),
  structuredFeedback: z.object({ project: z.string(), artifact_version: z.string(), rejected_dimension: z.string(), reason: z.string(), before: z.string(), after: z.string(), accepted_result: z.string(), new_regression_case: z.string(), regression_eval: z.unknown().optional() }).strict().optional(),
}).superRefine((value, context) => {
  if (value.projectChanges.length === 0 && value.reusableLessons.length === 0) context.addIssue({ code: 'custom', message: 'Feedback must contain a project change or reusable lesson' });
  if ((value.projectChanges.length > 0) !== (value.projectRoute !== null)) context.addIssue({ code: 'custom', path: ['projectRoute'], message: 'Project changes require a project route' });
});
export type FeedbackRecord = z.infer<typeof FeedbackRecordSchema>;

export const TargetMiniGamePlatformSchema = z.enum(['wechat-minigame', 'douyin-minigame', 'taptap-minigame']);
export type TargetMiniGamePlatform = z.infer<typeof TargetMiniGamePlatformSchema>;
export const TARGET_MINIGAME_PLATFORMS: TargetMiniGamePlatform[] = ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'];
const AllTargetMiniGamePlatformsSchema = z.array(TargetMiniGamePlatformSchema).length(TARGET_MINIGAME_PLATFORMS.length).superRefine((platforms, context) => {
  if (new Set(platforms).size !== TARGET_MINIGAME_PLATFORMS.length || TARGET_MINIGAME_PLATFORMS.some((platform) => !platforms.includes(platform))) {
    context.addIssue({ code: 'custom', message: 'all factory games must target WeChat, Douyin, and TapTap mini games' });
  }
});

export const DesignModeSchema = z.enum(['reference_reskin', 'prototype_tournament']);
export type DesignMode = z.infer<typeof DesignModeSchema>;
export const RuntimeNameSchema = z.enum(['web-lite', 'cocos-3d']);
export type RuntimeName = z.infer<typeof RuntimeNameSchema>;
export const TemplateNameSchema = z.enum(['idle-shop-v1', 'spatial-shop-v1', 'spatial-shop-3d-v1', 'cut-stack-dodge-v1']);
export type TemplateName = z.infer<typeof TemplateNameSchema>;

const SPATIAL_SHOP_TEMPLATES = new Set<TemplateName>(['spatial-shop-v1', 'spatial-shop-3d-v1']);
const TEMPLATE_RUNTIME: Record<TemplateName, RuntimeName> = {
  'idle-shop-v1': 'web-lite',
  'spatial-shop-v1': 'web-lite',
  'spatial-shop-3d-v1': 'cocos-3d',
  'cut-stack-dodge-v1': 'web-lite',
};

export const SeedSchema = z.object({
  title: z.string().min(1),
  theme: z.string().min(1),
  /** Optional only for legacy fixtures; new runs should declare identity. */
  identity: GameSeedIdentitySchema.optional(),
  runtime: RuntimeNameSchema.default('web-lite'),
  template: TemplateNameSchema,
  designMode: DesignModeSchema.default('reference_reskin'),
  referenceMechanics: ReferenceMechanicSpecSchema.optional(),
  spatialShop: SpatialShopSpecSchema.optional(),
  targetPlatforms: AllTargetMiniGamePlatformsSchema.default(() => [...TARGET_MINIGAME_PLATFORMS]),
  status: z.literal('DESIGN_REJECTED').optional(),
  purpose: z.literal('regression_fixture').optional(),
  preferences: z.record(z.string(), z.unknown()).default({}),
}).superRefine((value, context) => {
  if ((value.status === 'DESIGN_REJECTED') !== (value.purpose === 'regression_fixture')) context.addIssue({ code: 'custom', message: 'DESIGN_REJECTED and regression_fixture must be declared together' });
  if (value.designMode === 'reference_reskin' && !value.referenceMechanics) context.addIssue({ code: 'custom', path: ['referenceMechanics'], message: 'referenceMechanics is required because agents do not invent games in reference_reskin mode' });
  if (value.designMode === 'prototype_tournament' && value.referenceMechanics) context.addIssue({ code: 'custom', path: ['referenceMechanics'], message: 'referenceMechanics may only be used in reference_reskin mode' });
  if (SPATIAL_SHOP_TEMPLATES.has(value.template) && !value.spatialShop) context.addIssue({ code: 'custom', path: ['spatialShop'], message: 'spatialShop is required for spatial shop templates' });
  if (!SPATIAL_SHOP_TEMPLATES.has(value.template) && value.spatialShop) context.addIssue({ code: 'custom', path: ['spatialShop'], message: 'spatialShop may only be used with spatial shop templates' });
  if (TEMPLATE_RUNTIME[value.template] !== value.runtime) context.addIssue({ code: 'custom', path: ['runtime'], message: `${value.template} requires the ${TEMPLATE_RUNTIME[value.template]} runtime` });
});
export type Seed = z.infer<typeof SeedSchema>;

const CompetitorSourceKindSchema = z.enum(['url', 'store_listing', 'video', 'file', 'other']);
export const CompetitorSourceRecordSchema = z.object({
  sourceId: z.string().trim().min(1),
  kind: CompetitorSourceKindSchema,
  /** URL or run-relative file pointer; raw page text is never stored here. */
  locator: z.string().trim().min(1),
  title: z.string().trim().min(1),
  retrievedAt: z.string().datetime(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/iu).optional(),
  notes: z.array(z.string().trim().min(1)).default([]),
}).strict();
export type CompetitorSourceRecord = z.infer<typeof CompetitorSourceRecordSchema>;

export const CompetitorResearchSchema = z.object({
  schemaVersion: z.literal(1),
  observations: z.array(z.string().trim().min(1)).default([]),
  inferences: z.array(z.string().trim().min(1)).default([]),
  unknowns: z.array(z.string().trim().min(1)).default([]),
  market: z.string().min(1),
  competitors: z.array(z.object({
    name: z.string().min(1),
    positioning: z.string().min(1),
    coreLoop: z.array(z.string().min(1)).min(2),
    monetization: z.array(z.string().min(1)).min(1),
    strengths: z.array(z.string().min(1)).min(1),
    weaknesses: z.array(z.string().min(1)).min(1),
  })).min(3),
  opportunities: z.array(z.string().min(1)).min(1),
  risks: z.array(z.string().min(1)).min(1),
  differentiationThesis: z.string().min(1),
  /** Structured provenance only. Raw webpage/README/game text is excluded. */
  sourceRecords: z.array(CompetitorSourceRecordSchema).default([]),
  /** Optional claim-level projection; legacy research remains parseable. */
  claims: z.array(z.object({
    id: z.string().trim().min(1),
    statement: z.string().trim().min(1),
    status: z.enum(['OBSERVED', 'INFERRED', 'UNKNOWN']),
    sourceRefs: z.array(z.string().trim().min(1)),
    sourceHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/iu)),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.string().trim().min(1)),
    createdAt: z.string().datetime(),
  }).strict()).default([]),
  /** Optional for legacy reports; required by current research prompts for new runs. */
  failurePressureContract: z.lazy(() => FailurePressureContractSchema).optional(),
});
export type CompetitorResearch = z.infer<typeof CompetitorResearchSchema>;

export const OpenSourceCandidateSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  repositoryUrl: z.url(),
  revision: z.string().trim().min(1),
  license: z.string().trim().min(1),
  licenseEvidenceUrl: z.url().nullable(),
  targetPlatforms: z.array(TargetMiniGamePlatformSchema).min(1),
  technicalFit: z.string().trim().min(1),
  maintenanceRisk: z.enum(['low', 'medium', 'high', 'unknown']),
  securityRisks: z.array(z.string().trim().min(1)),
  attributionRequirements: z.array(z.string().trim().min(1)),
  decision: z.enum(['REUSE', 'REFERENCE_ONLY', 'REJECT']),
}).superRefine((candidate, context) => {
  if (candidate.decision === 'REUSE' && candidate.licenseEvidenceUrl === null) {
    context.addIssue({ code: 'custom', path: ['licenseEvidenceUrl'], message: 'REUSE requires verified license evidence' });
  }
});
export type OpenSourceCandidate = z.infer<typeof OpenSourceCandidateSchema>;

export const OpenSourceResearchSchema = z.object({
  schemaVersion: z.literal(1),
  observations: z.array(z.string().trim().min(1)).default([]),
  inferences: z.array(z.string().trim().min(1)).default([]),
  unknowns: z.array(z.string().trim().min(1)).default([]),
  targetPlatforms: AllTargetMiniGamePlatformsSchema,
  queries: z.array(z.string().trim().min(1)).min(1),
  candidates: z.array(OpenSourceCandidateSchema),
  outcome: z.enum(['REUSE_APPROVED', 'NO_SUITABLE_CANDIDATE']),
  selectedCandidateIds: z.array(z.string().trim().min(1)),
  rationale: z.string().trim().min(1),
  researchedAt: z.string().datetime(),
}).superRefine((research, context) => {
  const candidateById = new Map(research.candidates.map((candidate) => [candidate.id, candidate]));
  if (candidateById.size !== research.candidates.length) context.addIssue({ code: 'custom', path: ['candidates'], message: 'candidate ids must be unique' });
  const invalidSelection = research.selectedCandidateIds.find((id) => candidateById.get(id)?.decision !== 'REUSE');
  if (invalidSelection) context.addIssue({ code: 'custom', path: ['selectedCandidateIds'], message: `selected candidate ${invalidSelection} must have a REUSE decision` });
  if (research.outcome === 'REUSE_APPROVED' && research.selectedCandidateIds.length === 0) context.addIssue({ code: 'custom', path: ['selectedCandidateIds'], message: 'REUSE_APPROVED requires at least one selected candidate' });
  if (research.outcome === 'NO_SUITABLE_CANDIDATE' && research.selectedCandidateIds.length > 0) context.addIssue({ code: 'custom', path: ['selectedCandidateIds'], message: 'NO_SUITABLE_CANDIDATE cannot select candidates' });
});
export type OpenSourceResearch = z.infer<typeof OpenSourceResearchSchema>;

export const ProductionCostReviewSchema = z.object({
  schemaVersion: z.literal(1),
  costBand: z.enum(['low', 'medium', 'high']),
  prototypeDays: z.number().int().positive(),
  productionWeeks: z.number().int().positive(),
  teamSize: z.number().int().positive(),
  assetEstimate: z.object({ characters: z.number().int().nonnegative(), environments: z.number().int().nonnegative(), ui: z.number().int().nonnegative(), audio: z.number().int().nonnegative() }),
  technicalRisks: z.array(z.string().min(1)),
  scopeCuts: z.array(z.string().min(1)),
  recommendation: z.enum(['proceed', 'reduce_scope', 'do_not_produce']),
  rationale: z.string().min(1),
});
export type ProductionCostReview = z.infer<typeof ProductionCostReviewSchema>;

export const IaaMonetizationReviewSchema = z.object({
  schemaVersion: z.literal(1),
  audienceFit: z.string().min(1),
  sessionFit: z.enum(['low', 'medium', 'high']),
  placements: z.array(z.object({
    format: z.enum(['rewarded', 'interstitial', 'banner', 'app_open']),
    trigger: z.string().min(1),
    playerValue: z.string().min(1),
    frequencyCap: z.string().min(1),
  })),
  deliveryRules: z.object({
    firstRun: z.literal('ENDING_ONLY'),
    endingAdPolicy: z.literal('REWARDED_OR_INTERSTITIAL'),
    minMinutesBetweenAds: z.number().int().positive(),
    maxAdsPerRun: z.number().int().positive(),
    maxAdsPerSession: z.number().int().positive(),
    targetImpressionsPerCompletedLife: z.object({
      min: z.number().nonnegative(),
      max: z.number().positive(),
    }).refine(({ min, max }) => min <= max, 'minimum target impressions must not exceed maximum'),
  }).strict().optional(),
  retentionRisk: z.enum(['low', 'medium', 'high']),
  revenuePotential: z.enum(['low', 'medium', 'high']),
  complianceRisks: z.array(z.string().min(1)),
  recommendation: z.enum(['pursue', 'test_cautiously', 'not_viable']),
  rationale: z.string().min(1),
});
export type IaaMonetizationReview = z.infer<typeof IaaMonetizationReviewSchema>;

export const GreenlightDecisionSchema = z.object({
  schemaVersion: z.literal(1),
  decision: z.enum(['GO', 'NO_GO']),
  overallScore: z.number().int().min(0).max(100),
  scores: z.object({ differentiation: z.number().int().min(0).max(100), productionFeasibility: z.number().int().min(0).max(100), iaaFit: z.number().int().min(0).max(100), strategicFit: z.number().int().min(0).max(100) }),
  reasons: z.array(z.string().min(1)).min(1),
  blockers: z.array(z.string().min(1)),
  requiredChanges: z.array(z.string().min(1)),
}).superRefine((value, context) => {
  if (value.decision === 'GO' && (value.overallScore < 70 || value.blockers.length > 0)) context.addIssue({ code: 'custom', message: 'GO requires an overall score of at least 70 and no blockers' });
  if (value.decision === 'NO_GO' && value.overallScore >= 70 && value.blockers.length === 0) context.addIssue({ code: 'custom', message: 'NO_GO requires a score below 70 or at least one blocker' });
});
export type GreenlightDecision = z.infer<typeof GreenlightDecisionSchema>;

export const GameBlueprintSchema = z.object({
  schemaVersion: z.literal(1), gameId: z.string(), canonicalGameId: z.string().trim().min(1).optional(), variantId: z.string().trim().min(1).optional(), identityManifestHash: z.string().regex(/^[a-f0-9]{64}$/iu).optional(), title: z.string(), theme: z.string(), runtime: RuntimeNameSchema, template: TemplateNameSchema,
  designMode: DesignModeSchema.default('prototype_tournament'), referenceMechanics: ReferenceMechanicSpecSchema.optional(),
  gameplayRevision: GameplayRevisionReferenceSchema.optional(),
  spatialShop: SpatialShopSpecSchema.optional(),
  targetPlatforms: AllTargetMiniGamePlatformsSchema,
  concept: z.string(), coreLoop: z.array(z.string()).min(4), content: z.object({ productName: z.string(), customerName: z.string(), currencyName: z.string() }),
  balance: z.object({ startingCurrency: z.number().int().nonnegative(), orderReward: z.number().int().positive(), baseUpgradeCost: z.number().int().positive() }),
  preferences: z.record(z.string(), z.unknown()),
}).superRefine((value, context) => {
  if (value.designMode === 'reference_reskin' && !value.referenceMechanics) context.addIssue({ code: 'custom', path: ['referenceMechanics'], message: 'reference-reskin blueprints must embed the approved human mechanic lock' });
  if (value.gameplayRevision && value.designMode !== 'reference_reskin') context.addIssue({ code: 'custom', path: ['gameplayRevision'], message: 'a gameplay revision may only extend a reference-reskin blueprint' });
  if (value.gameplayRevision && value.gameplayRevision.title !== value.title) context.addIssue({ code: 'custom', path: ['gameplayRevision'], message: 'gameplay revision title must match the target blueprint title' });
  if (SPATIAL_SHOP_TEMPLATES.has(value.template) && !value.spatialShop) context.addIssue({ code: 'custom', path: ['spatialShop'], message: 'spatial-shop blueprints must embed the validated spatial shop configuration' });
  if (!SPATIAL_SHOP_TEMPLATES.has(value.template) && value.spatialShop) context.addIssue({ code: 'custom', path: ['spatialShop'], message: 'spatialShop may only be used with spatial shop templates' });
  if (TEMPLATE_RUNTIME[value.template] !== value.runtime) context.addIssue({ code: 'custom', path: ['runtime'], message: `${value.template} requires the ${TEMPLATE_RUNTIME[value.template]} runtime` });
});
export type GameBlueprint = z.infer<typeof GameBlueprintSchema>;

export const ArtDirectionSchema = z.object({
  id: z.string().regex(/^direction_[a-d]$/), name: z.string().min(1), summary: z.string().min(1), visualKeywords: z.array(z.string()).min(1), palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1),
  characterStyle: z.string().min(1), environmentStyle: z.string().min(1), uiStyle: z.string().min(1), iconConcept: z.string().min(1), forbiddenElements: z.array(z.string()), productionComplexity: z.enum(['low', 'medium', 'high']), previewPrompt: z.string().min(1), previewPath: z.string().optional(),
});
export const ArtDirectionsSchema = z.object({ directions: z.array(ArtDirectionSchema).length(4)
  .refine((items) => new Set(items.map((item) => item.id)).size === 4, 'direction ids must be unique')
  .refine((items) => new Set(items.map((item) => JSON.stringify([item.summary, item.visualKeywords, item.characterStyle, item.environmentStyle, item.uiStyle, item.iconConcept, item.previewPrompt]))).size === 4, 'art directions must be meaningfully distinct beyond palette') });
export type ArtDirections = z.infer<typeof ArtDirectionsSchema>;

export const ArtPreviewSchema = z.object({
  directionId: z.string().regex(/^direction_[a-d]$/), provider: z.string(), model: z.string(), prompt: z.string(), size: z.string(), quality: z.string(), outputPath: z.string(),
  startedAt: z.string(), finishedAt: z.string(), attempts: z.number().int().min(1).max(2), status: z.enum(['generated', 'failed']), error: z.string().nullable(),
});
export const ArtPreviewManifestSchema = z.object({
  schemaVersion: z.literal(1), provider: z.string(), callCount: z.number().int().nonnegative().max(8), previews: z.array(ArtPreviewSchema).max(4),
  usage: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(), totalTokens: z.number().int().nonnegative() }).optional(),
});
export type ArtPreviewManifest = z.infer<typeof ArtPreviewManifestSchema>;

export const ArtApprovalSchema = z.object({ selected_direction: z.string().regex(/^direction_[a-d]$/), keep: z.array(z.string()).default([]), change: z.array(z.string()).default([]), notes: z.array(z.string()).default([]) });
export type ArtApproval = z.infer<typeof ArtApprovalSchema>;
export const StyleLockSchema = z.object({ schemaVersion: z.literal(1), directionId: z.string(), direction: ArtDirectionSchema, kept: z.array(z.string()), changes: z.array(z.string()), notes: z.array(z.string()), lockedAt: z.string() });
export type StyleLock = z.infer<typeof StyleLockSchema>;

export const AssetItemSchema = z.object({ id: z.string(), kind: z.enum(['character', 'product', 'background', 'ui', 'marketing']), path: z.string(), prompt: z.string(), status: z.literal('generated'), sha256: z.string(), generationMethod: z.enum(['imagegen', 'licensed', 'original', 'procedural-placeholder']).optional(), sourceEvidence: z.array(z.string().trim().min(1)).optional() }).strict();
export const AssetManifestSchema = z.object({ schemaVersion: z.literal(1), assets: z.array(AssetItemSchema).min(4), provider: z.string() });
export type AssetManifest = z.infer<typeof AssetManifestSchema>;

export const BuildReportSchema = z.object({ schemaVersion: z.literal(1), success: z.boolean(), runtime: RuntimeNameSchema, template: z.string(), codexThreadId: z.string().optional(), workspace: z.string(), webBuild: z.string(), files: z.array(z.string()), verification: z.array(z.string()).min(2), builtAt: z.string(), completion: z.object({ status: z.enum(['IMPLEMENTATION_READY', 'CANDIDATE_BLOCKED', 'RELEASE_BLOCKED']), blockers: z.array(z.enum(['normalFlow', 'visualEvidence', 'levelDifference', 'humanPlaytest', 'runtimeProductJourney'])) }).strict().optional() });
export type BuildReport = z.infer<typeof BuildReportSchema>;
export const QaIssueSchema = z.object({ id: z.string(), severity: z.enum(['error', 'warning']), message: z.string(), evidence: z.string() });
export const QaReportSchema = z.object({ schemaVersion: z.literal(1), passed: z.boolean(), checks: z.array(z.object({ name: z.string(), passed: z.boolean(), evidence: z.string() })), issues: z.array(QaIssueSchema), screenshots: z.array(z.string()), consoleLog: z.string(), testedAt: z.string(), evidence: z.array(QaEvidenceSchema).optional(), naturalFlow: NaturalFlowEvidenceSchema.optional(), acceptance: PlayerAcceptanceGateSchema.optional(), interactionContinuity: InteractionContinuityReportSchema.optional() });
export type QaReport = z.infer<typeof QaReportSchema>;
export const ReleaseManifestSchema = z.object({ schemaVersion: z.literal(1), name: z.string(), description: z.string(), entrypoint: z.string(), iconAndPromoAssets: z.array(z.string()), reports: z.array(z.string()), files: z.array(z.object({ path: z.string(), sha256: z.string() })), createdAt: z.string(), coreHash: z.string().optional(), platformMatrix: z.string().optional(), releaseCandidate: z.string().optional(), platformHash: z.string().optional(), acceptanceHash: z.string().optional(), qualityMatrix: z.string().optional(), qualityBaseline: z.string().optional(), originalityDeclaration: z.string().optional() });
export type ReleaseManifest = z.infer<typeof ReleaseManifestSchema>;

const TokenUsageSchema = z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(), totalTokens: z.number().int().nonnegative() });
export const StageRecordSchema = z.object({ stage: StageNameSchema, status: ExecutionStatusSchema, startedAt: z.string().nullable(), finishedAt: z.string().nullable(), attempts: z.number().int().nonnegative(), inputArtifacts: z.array(z.string()), outputArtifacts: z.array(z.string()), errors: z.array(z.string()), evidence: z.array(z.string()), failureReason: z.string().optional(), providerCalls: z.object({ agent: z.number().int().nonnegative(), image: z.number().int().nonnegative() }).default({ agent: 0, image: 0 }), tokenUsage: TokenUsageSchema.default({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }) });
export type StageRecord = z.infer<typeof StageRecordSchema>;
export const RunStateSchema = z.object({ schemaVersion: z.literal(1), runId: z.string(), runKind: z.enum(['game', 'action-experiment']).default('game'), stage: StageNameSchema, status: ExecutionStatusSchema, readiness: RunReadinessSchema.default('IN_PROGRESS'), createdAt: z.string(), updatedAt: z.string(), fixAttempts: z.number().int().nonnegative(), prototypeBatch: z.number().int().min(1).max(2).default(1), providerMode: z.enum(['mock', 'live-art', 'codex-account']), codexThreadId: z.string().optional(), failureReason: z.string().optional(), canonicalGameId: z.string().trim().min(1).optional(), variantId: z.string().trim().min(1).optional(), identityManifestHash: z.string().regex(/^[a-f0-9]{64}$/iu).optional(), stages: z.record(z.string(), StageRecordSchema), transitionHistory: z.array(z.object({ from: StageNameSchema, to: StageNameSchema, reason: z.string().trim().min(1), at: z.string().datetime(), runId: z.string().trim().min(1).optional() }).strict()).default([]) });
export type RunState = z.infer<typeof RunStateSchema>;

export * from './open-source-research.js';
export * from './formal-prototype-constraints.js';
export * from './ui-animation-standard.js';
export * from './hybrid-3d-assets.js';
export * from './generated-alpha-validation.js';
export * from './research-sandbox.js';
export * from './reference-recording.js';
export * from './reference-level-runtime.js';
export * from './reference-resolution.js';
export * from './cost-budget-authorization.js';
export * from './game-identity.js';
