import { PipelineModeSchema, PipelinePlanSchema, type PipelineMode, type PipelinePlan } from '../schemas/pipeline-plan.js';
import { StageNameSchema, type StageName } from '../schemas/index.js';

export { PipelinePlanSchema, PipelineModeSchema } from '../schemas/pipeline-plan.js';

const PROFILE_STAGES: Record<string, string[]> = {
  ACTION_FEEL: ['EXPERIENCE_CONTRACT', 'FEEL_PROTOTYPE', 'NATURAL_PLAY_QA', 'EXPERIENCE_REVIEW'],
  NARRATIVE_AGENCY: ['NARRATIVE_CONTRACT', 'STORY_VERTICAL_SLICE', 'CHOICE_CONSEQUENCE_QA', 'NARRATIVE_REVIEW', 'REPLAY_VALUE_QA'],
  STRATEGIC_SYSTEM: ['SYSTEMS_CONTRACT', 'SYSTEMS_PROTOTYPE', 'STRATEGY_QA', 'PROGRESSION_REVIEW'],
  PUZZLE_CLARITY: ['PUZZLE_CONTRACT', 'PUZZLE_PROTOTYPE', 'PUZZLE_FAIRNESS_QA', 'PUZZLE_REVIEW'],
  SOCIAL_EMOTION: ['NARRATIVE_CONTRACT', 'STORY_VERTICAL_SLICE', 'CHOICE_CONSEQUENCE_QA', 'NARRATIVE_REVIEW'],
  EXPLORATION_DISCOVERY: ['EXPERIENCE_CONTRACT', 'FEEL_PROTOTYPE', 'NATURAL_PLAY_QA', 'EXPERIENCE_REVIEW'],
};

/** All stages that provide profile-specific experience evidence. Keeping this
 * list derived from the routing table gives the control plane one canonical
 * way to detect a full-validation plan that would otherwise jump from the
 * generic core lock straight to art/build work. */
const PROFILE_STAGE_SET = new Set(Object.values(PROFILE_STAGES).flat());

export function missingMandatoryProfileStages(planValue: PipelinePlan, completedStages: readonly string[]): StageName[] {
  const plan = PipelinePlanSchema.parse(planValue);
  const completed = new Set(completedStages);
  return plan.mandatoryStages
    .filter((stage) => PROFILE_STAGE_SET.has(stage) && !completed.has(stage))
    .map((stage) => StageNameSchema.parse(stage));
}

export type ConstitutionStageOptions = {
  includeRelease?: boolean;
  certificationRequired?: boolean;
  presentationQualityRequired?: boolean;
  supplyChainRequired?: boolean;
  blindPlaytestRequired?: boolean;
};

/** Return the governance stages that a policy explicitly promotes to hard
 * gates.  Keeping this list in one place lets bootstrap, constitution and
 * release validation agree when an old run is resumed under a stricter
 * production profile. */
export function requiredGovernanceStages(options: ConstitutionStageOptions = {}): StageName[] {
  return [
    ...(options.presentationQualityRequired ? ['PRESENTATION_QA' as const] : []),
    ...(options.supplyChainRequired ? ['SUPPLY_CHAIN_QA' as const] : []),
    ...(options.blindPlaytestRequired ? ['BLIND_PLAYTEST_QA' as const] : []),
    ...(options.certificationRequired ? ['CERTIFICATION' as const] : []),
  ];
}

/** Identify a stale plan instead of silently upgrading it in place. Stage
 * plans are frozen inputs; an operator must intentionally create/migrate a
 * run when the effective production policy becomes stricter. */
export function missingRequiredGovernanceStages(planValue: PipelinePlan, options: ConstitutionStageOptions = {}): StageName[] {
  const plan = PipelinePlanSchema.parse(planValue);
  return requiredGovernanceStages(options).filter((stage) => !plan.mandatoryStages.includes(stage));
}

const OPTIONAL_GOVERNANCE_STAGES = new Set<StageName>(['PRESENTATION_QA', 'SUPPLY_CHAIN_QA', 'BLIND_PLAYTEST_QA', 'CERTIFICATION']);
const NON_TERMINAL_CONTROL_STAGES = new Set<StageName>(['CREATED', 'FAILED', 'ABANDONED', 'COMPLETED', 'NOT_GREENLIT', 'NO_PROTOTYPE_WINNER', 'DESIGN_REJECTED', 'PROTOTYPE_REVISION_REQUESTED']);
const DEFAULT_CONSTITUTION_STAGES: StageName[] = ['QA', 'FINAL_PROFILE_QA', 'NORMAL_FLOW_QA', 'VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA', 'RELEASE_CANDIDATE'];

/**
 * Return the stage audits that a strict release must contain for this exact
 * plan.  The old control plane used a hand-maintained list, which meant a new
 * mandatory stage could run without ever being checked by the constitution.
 * Optional governance stages are included only when their profile switch is
 * enabled; release itself is checked in the post-release evaluation.
 */
export function requiredStageContractsForPlan(planValue: PipelinePlan, options: ConstitutionStageOptions = {}): StageName[] {
  const plan = PipelinePlanSchema.parse(planValue);
  const includeRelease = options.includeRelease === true;
  const enabled = new Set<StageName>(requiredGovernanceStages(options));
  const stages = plan.mandatoryStages
    .map((stage) => StageNameSchema.parse(stage))
    .filter((stage) => !NON_TERMINAL_CONTROL_STAGES.has(stage))
    .filter((stage) => includeRelease || stage !== 'RELEASE')
    .filter((stage) => !OPTIONAL_GOVERNANCE_STAGES.has(stage) || enabled.has(stage));
  // A legacy plan may not have a pipeline artifact yet. Keep a conservative
  // fallback for callers migrating old runs, while never inventing optional
  // gates or a release audit before the release step.
  if (stages.length > 0) return stages;
  return DEFAULT_CONSTITUTION_STAGES.filter((stage) => includeRelease || stage !== 'RELEASE');
}

const FAST_SKIPPED = [
  'COMPETITOR_RESEARCH', 'IDEA_GENERATION', 'LOW_COST_FILTER', 'PROTOTYPE_SELECTION',
  'BUILD_3_PROTOTYPES', 'PLAYTEST_TOURNAMENT', 'WINNER_SELECTION',
];

/** The preview lane proves only the reference-driven core loop. Everything
 * below is still available to an explicit release/full-validation run, but it
 * cannot quietly become part of the preview's success claim. */
const REPLICA_PREVIEW_DEFERRED = [
  'BUSINESS_PREFLIGHT', 'PRODUCTION_LINE_REVIEW', 'FACTORY_EVAL', 'PRODUCTION_COST_REVIEW', 'OPEN_SOURCE_RESEARCH',
  'IAA_MONETIZATION_REVIEW', 'IAA_REVIEW', 'GREENLIGHT_GATE', 'EXPERIENCE_CONTRACT', 'EXPERIENCE_HYPOTHESIS',
  'CONTENT_EXPANSION', 'UI_SKELETON', 'ART_DIRECTIONS', 'WAITING_FOR_ART_APPROVAL', 'STYLE_LOCK',
  'ASSETS', 'WAITING_FOR_CODEX_IMAGEGEN', 'PRESENTATION_QA', 'SUPPLY_CHAIN_QA', 'FINAL_PROFILE_QA', 'NORMAL_FLOW_QA', 'PERCEPTUAL_QA', 'VISUAL_EVIDENCE_QA',
  'CONTENT_VARIATION_QA', 'QUALITY_BASELINE_QA', 'ORIGINALITY_REVIEW', 'CERTIFICATION', 'COST_GATE',
  'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA', 'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA',
  'ACCEPTANCE_REVIEW', 'RELEASE', 'LIVE_MONITORING', 'LIVE_VERIFIED', 'LAUNCH_METRICS',
];

const REPLICA_PREVIEW_GUIDES = [
  { stage: 'REFERENCE_DEEP_RESEARCH', purpose: 'Bind the reference to verified, run-scoped behavior evidence and reconstruct any verified gameplay recording.', inputs: ['input/seed.yaml', 'reference-evidence/incoming/'], outputs: ['artifacts/reference-evidence-pack.json', 'artifacts/reference-failure-pressure-contract.json', 'artifacts/reference-fidelity-contract.json', 'artifacts/reference-frame-manifest.json (when recording)', 'artifacts/reference-level-reconstruction.json (when recording)', 'artifacts/reference-level-implementation-contract.json (when recording)'], evidence: ['verified source hash', 'observation/inference/unknown separation', 'source-bound failure pressure with signal, escalation, attribution and recovery', 'recording frame/timeline/semantic-level contract when recording'] },
  { stage: 'REFERENCE_MECHANIC_LOCK', purpose: 'Freeze the generic mechanic relationships and the originality boundary.', inputs: ['input/seed.yaml', 'artifacts/reference-evidence-pack.json'], outputs: ['artifacts/reference-mechanic-spec.json'], evidence: ['human mechanic lock', 'maximum core-mechanic fidelity', 'expression isolation'] },
  { stage: 'WAITING_FOR_REFERENCE_APPROVAL', purpose: 'Ask the owner to approve the exact mechanic lock before implementation.', inputs: ['artifacts/reference-mechanic-spec.json'], outputs: ['human/reference-decision.yaml'], evidence: ['explicit APPROVE or REJECT'] },
  { stage: 'BLUEPRINT', purpose: 'Translate the locked reference behavior into an implementation blueprint without inventing a new game.', inputs: ['artifacts/reference-mechanic-spec.json', 'artifacts/reference-fidelity-contract.json', 'artifacts/reference-failure-pressure-contract.json', 'artifacts/open-source-research.json'], outputs: ['artifacts/game-blueprint.json'], evidence: ['blueprint schema', 'mechanic and failure-pressure traceability', 'open-source research persisted before blueprint', 'original expression fields'] },
  { stage: 'PRODUCT_EXPERIENCE_CONTRACT', purpose: 'Translate every reference behavior and recording-level semantic check into exact object/state/phone-viewport Builder and QA cases.', inputs: ['artifacts/reference-fidelity-contract.json', 'artifacts/reference-level-implementation-contract.json (when recording)', 'artifacts/experience-contract.json'], outputs: ['artifacts/product-experience-contract.json'], evidence: ['reference check IDs', 'recording semantic object/action/relation IDs', 'exact branch matrix', 'mobile viewports', 'negative assertions'] },
  { stage: 'CORE_SPEC_FROZEN', purpose: 'Freeze the preview acceptance dimensions before Builder work.', inputs: ['artifacts/game-blueprint.json', 'artifacts/reference-fidelity-contract.json'], outputs: ['artifacts/core-spec-lock.json'], evidence: ['core-loop order', 'input/state transitions', 'failure/recovery', 'feedback timing bands'] },
  { stage: 'FULL_BUILD', purpose: 'Build one playable reference-driven candidate in this run workspace and implement the complete semantic recording contract when one exists.', inputs: ['artifacts/game-blueprint.json', 'artifacts/core-spec-lock.json', 'artifacts/reference-level-implementation-contract.json (when recording)', 'artifacts/reference-level-runtime-data.json (when recording)'], outputs: ['artifacts/reference-level-runtime-data.json (when recording)', 'artifacts/build-report.json', 'workspace/game/dist/'], evidence: ['tests', 'typecheck', 'web build', 'runtime entrypoint', 'recording checkpoint/object/placement/relation/action/camera/terminal/replay wiring'] },
  { stage: 'QA', purpose: 'Run deterministic and natural-input checks against the locked core loop, then independently compare a recording-driven candidate trace with the reconstruction contract.', inputs: ['artifacts/build-report.json', 'artifacts/core-spec-lock.json', 'artifacts/reference-level-reconstruction.json (when recording)', 'artifacts/reference-level-implementation-contract.json (when recording)', 'artifacts/reference-level-runtime-data.json (when recording)'], outputs: ['artifacts/qa-report.json', 'artifacts/runtime-product-gates.json', 'artifacts/reference-level-runtime-trace.json (when recording)', 'artifacts/reference-level-comparison-gate.json (when recording)'], evidence: ['core loop trace', 'failure/recovery trace', 'player-visible feedback', 'replay path', 'recording checkpoint/object/placement/relation/action/camera/terminal/replay comparison', 'bounded formal FIX retry on comparison failure'] },
  { stage: 'WAITING_FOR_HUMAN_PLAYTEST', purpose: 'Pause on the hash-bound core demo until the owner confirms the reference behavior and basic feel are worth expanding.', inputs: ['artifacts/build-report.json', 'artifacts/reference-fidelity-gate.json'], outputs: ['human/playtest-acceptance.json'], evidence: ['CORE_DEMO natural play', 'candidate build hash', 'explicit approve or reject'] },
  { stage: 'COMPLETED', purpose: 'Mark a preview candidate complete while clearly keeping release gates deferred.', inputs: ['artifacts/qa-report.json'], outputs: ['state.json'], evidence: ['preview QA passed', 'release deferred marker'] },
];

// These are the minimum evidence-producing stages for any release lane.  The
// five completion gates are deliberately explicit so a plan cannot describe a
// successful build while omitting normal-flow, visual, variation or human
// evidence.
const RELEASE_CRITICAL = ['BUSINESS_PREFLIGHT', 'PRODUCTION_LINE_REVIEW', 'FACTORY_EVAL', 'OPEN_SOURCE_RESEARCH', 'FULL_BUILD', 'QA', 'FINAL_PROFILE_QA', 'NORMAL_FLOW_QA', 'VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA', 'QUALITY_BASELINE_QA', 'ORIGINALITY_REVIEW', 'CERTIFICATION', 'COST_GATE', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA', 'RELEASE_CANDIDATE', 'WAITING_FOR_HUMAN_PLAYTEST', 'RELEASE'];
RELEASE_CRITICAL.splice(RELEASE_CRITICAL.indexOf('VISUAL_EVIDENCE_QA'), 0, 'PRODUCT_EXPERIENCE_CONTRACT', 'PERCEPTUAL_QA');

/** Branch-independent order used for plan validation (the enum declaration is
 * intentionally grouped by feature and is not a workflow ordering). */
export const CANONICAL_STAGE_ORDER: StageName[] = [
  'CREATED', 'BUSINESS_PREFLIGHT', 'PRODUCTION_LINE_REVIEW', 'FACTORY_EVAL',
  'REFERENCE_DEEP_RESEARCH', 'REFERENCE_MECHANIC_LOCK', 'WAITING_FOR_REFERENCE_APPROVAL',
  'COMPETITOR_RESEARCH', 'IDEA_GENERATION', 'LOW_COST_FILTER', 'PROTOTYPE_SELECTION',
  'BUILD_3_PROTOTYPES', 'PLAYTEST_TOURNAMENT', 'WINNER_SELECTION', 'WAITING_FOR_PROTOTYPE_APPROVAL',
  'NO_PROTOTYPE_WINNER', 'PROTOTYPE_REVISION_REQUESTED', 'DESIGN_REJECTED',
  'ACTION_EXPERIMENT_SPEC', 'BUILD_ACTION_PROTOTYPES', 'PLAYTEST_ACTION_PROTOTYPES',
  'WAITING_FOR_ACTION_APPROVAL', 'ACTION_EXPERIMENT_APPROVED', 'ACTION_EXPERIMENT_REFACTOR',
  'ACTION_EXPERIMENT_KILLED', 'OPEN_SOURCE_RESEARCH', 'PRODUCTION_COST_REVIEW',
  'IAA_MONETIZATION_REVIEW', 'IAA_REVIEW', 'GREENLIGHT_GATE', 'NOT_GREENLIT', 'BLUEPRINT',
  'EXPERIENCE_CONTRACT', 'PRODUCT_EXPERIENCE_CONTRACT', 'EXPERIENCE_HYPOTHESIS', 'GRAYBOX_CORE', 'CORE_SPEC_FROZEN',
  'FEEL_PROTOTYPE', 'NATURAL_PLAY_QA', 'EXPERIENCE_REVIEW', 'FEEL_REPAIR',
  'NARRATIVE_CONTRACT', 'STORY_VERTICAL_SLICE', 'CHOICE_CONSEQUENCE_QA', 'NARRATIVE_REVIEW',
  'REPLAY_VALUE_QA', 'SYSTEMS_CONTRACT', 'SYSTEMS_PROTOTYPE', 'STRATEGY_QA', 'PROGRESSION_REVIEW',
  'PUZZLE_CONTRACT', 'PUZZLE_PROTOTYPE', 'PUZZLE_FAIRNESS_QA', 'PUZZLE_REVIEW',
  'CONTENT_EXPANSION', 'UI_SKELETON', 'ART_DIRECTIONS', 'WAITING_FOR_CODEX_IMAGEGEN',
  'WAITING_FOR_ART_APPROVAL', 'STYLE_LOCK', 'ASSETS', 'POLISH_VERTICAL_SLICE', 'FULL_BUILD',
  'BUILD', 'QA', 'FIX', 'FINAL_PROFILE_QA', 'NORMAL_FLOW_QA', 'PERCEPTUAL_QA', 'VISUAL_EVIDENCE_QA',
  'CONTENT_VARIATION_QA', 'QUALITY_BASELINE_QA', 'PRESENTATION_QA', 'SUPPLY_CHAIN_QA',
  'ORIGINALITY_REVIEW', 'CERTIFICATION', 'COST_GATE', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA',
  'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST',
  'ACCEPTANCE_REVIEW',
  'RELEASE', 'LIVE_MONITORING', 'LIVE_VERIFIED', 'LAUNCH_METRICS', 'ABANDONED', 'COMPLETED', 'FAILED',
];

export function buildPipelinePlan(input: { mode?: PipelineMode; designMode: 'reference_reskin' | 'prototype_tournament'; productionLine: string; primaryProfile?: string; presentationQualityRequired?: boolean; supplyChainRequired?: boolean; blindPlaytestRequired?: boolean }): PipelinePlan {
  const requestedMode = input.mode ?? (input.designMode === 'reference_reskin' ? 'replica-preview' : 'fast-reskin');
  const mode = PipelineModeSchema.parse(requestedMode);
  if (mode === 'replica-preview' && input.designMode !== 'reference_reskin') throw new Error('replica-preview requires reference_reskin design mode');
  if (mode === 'replica-preview') {
    const mandatoryStages = REPLICA_PREVIEW_GUIDES.map((guide) => guide.stage);
    const releaseCriticalStages = mandatoryStages.filter((stage) => stage !== 'COMPLETED');
    return PipelinePlanSchema.parse({
      schemaVersion: 1,
      mode,
      designMode: input.designMode,
      productionLine: input.productionLine,
      mandatoryStages,
      skippedStages: [...FAST_SKIPPED],
      optionalStages: ['FIX'],
      deferredStages: REPLICA_PREVIEW_DEFERRED,
      stageGuides: REPLICA_PREVIEW_GUIDES,
      humanApprovalSessions: ['GO_NO_GO', 'CORE_DEMO', 'FINAL_RELEASE'],
      releaseCriticalStages,
      rationale: 'Use the compact reference-preview lane to verify the reference behavior and one playable candidate. Business, open-source, platform, originality, human-release and packaging gates remain explicit deferred work for full-validation.',
    });
  }
  const profileStages = PROFILE_STAGES[input.primaryProfile ?? ''] ?? [];
  // The fast lane relies on the validated mother-template contract; specialist
  // profile stages are still recorded as optional evidence and can be promoted
  // when the request or risk level warrants it. Full validation runs the whole
  // profile-specific chain.
  const profileMandatory = mode === 'full-validation' ? profileStages : [];
  const profileOptional = mode === 'fast-reskin' ? profileStages : [];
  const common = [
    'BUSINESS_PREFLIGHT',
    'PRODUCTION_LINE_REVIEW',
    'FACTORY_EVAL',
    ...(input.designMode === 'reference_reskin' ? ['REFERENCE_DEEP_RESEARCH', 'REFERENCE_MECHANIC_LOCK', 'WAITING_FOR_REFERENCE_APPROVAL'] : []),
    // `prototype_tournament` is an explicit legacy/experimental entry point.
    // It still executes its bounded tournament in the fast lane, so the plan
    // must describe those stages instead of claiming they were skipped.
    ...(input.designMode === 'prototype_tournament' ? ['COMPETITOR_RESEARCH', 'IDEA_GENERATION', 'LOW_COST_FILTER', 'PROTOTYPE_SELECTION', 'BUILD_3_PROTOTYPES', 'PLAYTEST_TOURNAMENT', 'WINNER_SELECTION', 'WAITING_FOR_PROTOTYPE_APPROVAL'] : []),
    'OPEN_SOURCE_RESEARCH',
    'IAA_REVIEW', 'BLUEPRINT', 'EXPERIENCE_CONTRACT', 'PRODUCT_EXPERIENCE_CONTRACT', 'EXPERIENCE_HYPOTHESIS', 'CORE_SPEC_FROZEN', ...profileMandatory,
    'CONTENT_EXPANSION', 'UI_SKELETON', 'ART_DIRECTIONS', 'WAITING_FOR_ART_APPROVAL', 'STYLE_LOCK', 'ASSETS',
    'FULL_BUILD', 'QA', 'FINAL_PROFILE_QA', 'NORMAL_FLOW_QA', 'PERCEPTUAL_QA', 'VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA', 'QUALITY_BASELINE_QA',
    ...(input.presentationQualityRequired ? ['PRESENTATION_QA'] : []),
    ...(input.supplyChainRequired ? ['SUPPLY_CHAIN_QA'] : []),
    'ORIGINALITY_REVIEW', 'CERTIFICATION', 'COST_GATE', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA', 'RELEASE_CANDIDATE',
    ...(input.blindPlaytestRequired || process.env.FACTORY_BLIND_PLAYTEST_REQUIRED === '1' ? ['BLIND_PLAYTEST_QA'] : []),
    'WAITING_FOR_HUMAN_PLAYTEST', 'ACCEPTANCE_REVIEW', 'RELEASE',
  ];
  const mandatoryStages = [...new Set(common)];
  const skippedStages = mode === 'fast-reskin' ? FAST_SKIPPED.filter((stage) => !mandatoryStages.includes(stage)) : [];
  const optionalGovernance = [
    ...(input.presentationQualityRequired ? [] : ['PRESENTATION_QA']),
    ...(input.supplyChainRequired ? [] : ['SUPPLY_CHAIN_QA']),
    ...(input.blindPlaytestRequired || process.env.FACTORY_BLIND_PLAYTEST_REQUIRED === '1' ? [] : ['BLIND_PLAYTEST_QA']),
  ];
  return PipelinePlanSchema.parse({
    schemaVersion: 1,
    mode,
    designMode: input.designMode,
    productionLine: input.productionLine,
    mandatoryStages,
    skippedStages,
    optionalStages: [...new Set([...profileOptional, ...optionalGovernance])].filter((stage) => !mandatoryStages.includes(stage)),
    deferredStages: [],
    stageGuides: [],
    humanApprovalSessions: ['GO_NO_GO', 'CORE_DEMO', 'FINAL_RELEASE'],
    releaseCriticalStages: [...new Set([
      ...RELEASE_CRITICAL,
      ...(input.presentationQualityRequired ? ['PRESENTATION_QA'] : []),
      ...(input.supplyChainRequired ? ['SUPPLY_CHAIN_QA'] : []),
    ])],
    rationale: mode === 'fast-reskin'
      ? input.designMode === 'prototype_tournament'
        ? 'Use the explicitly requested bounded prototype tournament, then retain business, rights, build, five acceptance, platform and release gates.'
        : 'Use a validated mother template and skip exploratory ideation, while retaining business, rights, build, five acceptance, platform and release gates.'
      : 'Run the full evidence path, including independent idea and prototype comparison, before production.',
  });
}

/** Validate a plan before it can become the run's source of truth. */
export function validatePipelinePlan(value: unknown): PipelinePlan {
  const plan = PipelinePlanSchema.parse(value);
  const validateNames = (stages: string[], label: string) => {
    for (const stage of stages) {
      if (!StageNameSchema.safeParse(stage).success) throw new Error(`${label} contains unknown stage ${stage}`);
    }
    if (new Set(stages).size !== stages.length) throw new Error(`${label} contains duplicate stages`);
  };
  validateNames(plan.mandatoryStages, 'mandatoryStages');
  validateNames(plan.skippedStages, 'skippedStages');
  validateNames(plan.optionalStages, 'optionalStages');
  validateNames(plan.deferredStages, 'deferredStages');
  validateNames(plan.releaseCriticalStages, 'releaseCriticalStages');
  for (const guide of plan.stageGuides) {
    if (!StageNameSchema.safeParse(guide.stage).success) throw new Error(`stageGuides contains unknown stage ${guide.stage}`);
  }
  if (plan.mandatoryStages.length === 0) throw new Error('pipeline plan must have mandatory stages');
  const order = new Map(CANONICAL_STAGE_ORDER.map((stage, index) => [stage, index]));
  const canonicalMandatory = plan.mandatoryStages.map((stage) => StageNameSchema.parse(stage));
  const nonMonotonic = canonicalMandatory.some((stage, index) => index > 0 && (order.get(stage) ?? 0) < (order.get(canonicalMandatory[index - 1]!) ?? 0));
  if (nonMonotonic) throw new Error('mandatoryStages must follow the canonical stage order');
  for (const stage of plan.releaseCriticalStages) if (!plan.mandatoryStages.includes(stage)) throw new Error(`release-critical stage ${stage} must be mandatory`);
  return plan;
}

export function isStagePlanned(planValue: PipelinePlan, stageValue: StageName): 'mandatory' | 'optional' | 'skipped' | 'deferred' | 'unlisted' {
  const plan = PipelinePlanSchema.parse(planValue); const stage = StageNameSchema.parse(stageValue);
  if (plan.mandatoryStages.includes(stage)) return 'mandatory';
  if (plan.optionalStages.includes(stage)) return 'optional';
  if (plan.skippedStages.includes(stage)) return 'skipped';
  if (plan.deferredStages.includes(stage)) return 'deferred';
  return 'unlisted';
}

export function isStageMandatory(planValue: PipelinePlan, stage: string): boolean {
  const plan = PipelinePlanSchema.parse(planValue);
  return plan.mandatoryStages.includes(stage);
}

export type StageExecutionPolicy = {
  allowed: boolean;
  classification: 'mandatory' | 'optional' | 'skipped' | 'deferred' | 'unlisted' | 'legacy';
};

const FAILURE_ROUTE_STAGES = new Set<StageName>(['FEEL_REPAIR', 'FIX']);

/**
 * Decide whether a stage may execute under the frozen plan.  A stage that is
 * skipped or absent is a policy violation, rather than an invitation to run
 * an unplanned side path.  Runs created before pipeline-plan existed can opt
 * into the explicit legacy fallback so they remain resumable.
 */
export function stageExecutionPolicy(planValue: PipelinePlan | undefined, stageValue: StageName, options: { legacyPlan?: boolean } = {}): StageExecutionPolicy {
  const stage = StageNameSchema.parse(stageValue);
  if (!planValue) return options.legacyPlan ? { allowed: true, classification: 'legacy' } : { allowed: false, classification: 'unlisted' };
  const classification = isStagePlanned(planValue, stage);
  // Repair stages are failure routes from planned stages. They are intentionally
  // not part of the initial happy-path mandatory list, but a frozen plan must
  // still allow the recorded repair loop to execute without silently widening
  // the product pipeline.
  if (classification === 'unlisted' && FAILURE_ROUTE_STAGES.has(stage)) {
    return { allowed: true, classification: 'optional' };
  }
  return { allowed: classification === 'mandatory' || classification === 'optional', classification };
}

export function assertStagePlannedOrLegacy(planValue: PipelinePlan | undefined, stageValue: StageName, options: { legacyPlan?: boolean } = {}): StageExecutionPolicy {
  const policy = stageExecutionPolicy(planValue, stageValue, options);
  if (!policy.allowed) throw new Error(`Stage ${stageValue} is ${policy.classification} in the frozen pipeline plan`);
  return policy;
}
