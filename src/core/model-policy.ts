import { StageNameSchema, type StageName } from '../schemas/index.js';
import type { ModelFailureKind } from '../schemas/model-policy.js';
import { getStageContract } from './stage-contracts.js';

export type ModelTier = 'frontier' | 'builder' | 'reviewer' | 'fast';
export type ModelPolicy = { tier: ModelTier; model: string; reasoning: 'low' | 'medium' | 'high' | 'max'; maxInputChars: number; canModifyWorkspace: boolean };
export type ExecutionPolicy = ModelPolicy & {
  role: 'research' | 'producer' | 'builder' | 'fixer' | 'reviewer' | 'evidence-helper' | 'release';
  sandbox: 'read-only' | 'workspace-write';
  handoffMaxChars: number;
};

const defaults: Record<ModelTier, { model: string; reasoning: ModelPolicy['reasoning'] }> = {
  frontier: { model: 'gpt-5.6-luna', reasoning: 'max' },
  builder: { model: 'gpt-5.6-luna', reasoning: 'max' },
  reviewer: { model: 'gpt-5.6-luna', reasoning: 'max' },
  fast: { model: 'gpt-5.6-luna', reasoning: 'max' },
};

function reasoningForTier(tier: ModelTier): ModelPolicy['reasoning'] {
  const value = process.env[`FACTORY_${tier.toUpperCase()}_REASONING`]?.trim().toLowerCase();
  return value === 'low' || value === 'medium' || value === 'high' || value === 'max' ? value : defaults[tier].reasoning;
}

function tierPolicy(tier: ModelTier): ModelPolicy {
  const configured = process.env[`FACTORY_${tier.toUpperCase()}_MODEL`];
  const configuredMax = Number(process.env[`FACTORY_${tier.toUpperCase()}_MAX_INPUT_CHARS`]);
  const defaultMax = tier === 'fast' ? 18_000 : tier === 'reviewer' ? 32_000 : 64_000;
  const maxInputChars = Number.isFinite(configuredMax) && configuredMax >= 1_000 ? Math.min(Math.trunc(configuredMax), 100_000) : defaultMax;
  return { tier, model: configured?.trim() || defaults[tier].model, reasoning: reasoningForTier(tier), maxInputChars, canModifyWorkspace: tier === 'builder' };
}

const frontierStages = new Set<StageName>(['REFERENCE_DEEP_RESEARCH', 'REFERENCE_MECHANIC_LOCK', 'COMPETITOR_RESEARCH', 'OPEN_SOURCE_RESEARCH', 'PRODUCTION_COST_REVIEW', 'IAA_REVIEW', 'IAA_MONETIZATION_REVIEW', 'GREENLIGHT_GATE', 'BLUEPRINT', 'EXPERIENCE_CONTRACT', 'EXPERIENCE_REVIEW', 'FEEL_REPAIR', 'NARRATIVE_CONTRACT', 'NARRATIVE_REVIEW', 'REPLAY_VALUE_QA', 'SYSTEMS_CONTRACT', 'PROGRESSION_REVIEW', 'PUZZLE_CONTRACT', 'PUZZLE_REVIEW', 'FINAL_PROFILE_QA', 'CORE_SPEC_FROZEN', 'RELEASE']);
const researchStages = new Set<StageName>(['REFERENCE_DEEP_RESEARCH', 'COMPETITOR_RESEARCH', 'OPEN_SOURCE_RESEARCH']);
const reviewerStages = new Set<StageName>(['CREATED', 'REFERENCE_MECHANIC_LOCK', 'WAITING_FOR_REFERENCE_APPROVAL', 'PLAYTEST_TOURNAMENT', 'NO_PROTOTYPE_WINNER', 'PROTOTYPE_REVISION_REQUESTED', 'DESIGN_REJECTED', 'PLAYTEST_ACTION_PROTOTYPES', 'WAITING_FOR_ACTION_APPROVAL', 'ACTION_EXPERIMENT_APPROVED', 'ACTION_EXPERIMENT_REFACTOR', 'ACTION_EXPERIMENT_KILLED', 'NATURAL_PLAY_QA', 'CHOICE_CONSEQUENCE_QA', 'STRATEGY_QA', 'PROGRESSION_REVIEW', 'PUZZLE_FAIRNESS_QA', 'PUZZLE_REVIEW', 'QA', 'FIX', 'ART_DIRECTIONS', 'STYLE_LOCK', 'WAITING_FOR_CODEX_IMAGEGEN', 'WAITING_FOR_ART_APPROVAL', 'WAITING_FOR_HUMAN_PLAYTEST', 'BLIND_PLAYTEST_QA', 'FINAL_PROFILE_QA', 'PRESENTATION_QA', 'SUPPLY_CHAIN_QA', 'QUALITY_BASELINE_QA', 'ORIGINALITY_REVIEW', 'TARGET_PLATFORM_QA', 'PLATFORM_ADAPTER_QA', 'FACTORY_EVAL', 'ACCEPTANCE_REVIEW', 'BUSINESS_PREFLIGHT', 'PRODUCTION_LINE_REVIEW', 'CERTIFICATION', 'COST_GATE', 'LIVE_MONITORING', 'LIVE_VERIFIED', 'LAUNCH_METRICS', 'ABANDONED', 'COMPLETED', 'FAILED']);
// UI skeletons encode hierarchy, ad placement and first-viewport comprehension;
// keep them on the reviewer tier. Spark remains appropriate for mechanical
// evidence formatting and deterministic coverage checks only.
const fastStages = new Set<StageName>([
  'VISUAL_EVIDENCE_QA',
  'CONTENT_VARIATION_QA',
  'ASSETS',
  'PRESENTATION_QA',
  'SUPPLY_CHAIN_QA',
  'COST_GATE',
  'FACTORY_EVAL',
  'QUALITY_BASELINE_QA',
]);
frontierStages.add('PRODUCT_EXPERIENCE_CONTRACT');
fastStages.add('PERCEPTUAL_QA');
const builderStages = new Set<StageName>(['FULL_BUILD', 'BUILD', 'BUILD_3_PROTOTYPES', 'BUILD_ACTION_PROTOTYPES', 'FEEL_PROTOTYPE', 'STORY_VERTICAL_SLICE', 'SYSTEMS_PROTOTYPE', 'PUZZLE_PROTOTYPE', 'GRAYBOX_CORE', 'POLISH_VERTICAL_SLICE']);
const fixerStages = new Set<StageName>(['FIX', 'FEEL_REPAIR']);
const producerStages = new Set<StageName>(['IDEA_GENERATION', 'LOW_COST_FILTER', 'PROTOTYPE_SELECTION', 'WINNER_SELECTION', 'PRODUCTION_COST_REVIEW', 'IAA_REVIEW', 'IAA_MONETIZATION_REVIEW', 'GREENLIGHT_GATE', 'BLUEPRINT', 'EXPERIENCE_HYPOTHESIS', 'EXPERIENCE_CONTRACT', 'NARRATIVE_CONTRACT', 'SYSTEMS_CONTRACT', 'PUZZLE_CONTRACT', 'CONTENT_EXPANSION']);
const releaseStages = new Set<StageName>(['RELEASE', 'RELEASE_CANDIDATE']);

export function getModelPolicy(): Record<string, ModelPolicy> {
  const result: Record<string, ModelPolicy> = {};
  // Keep the snapshot complete: a newly added stage must not silently fall
  // through an undocumented model/permission policy.  Unknown/terminal
  // stages intentionally receive the read-only reviewer default.
  for (const stage of StageNameSchema.options) result[stage] = modelForStage(stage);
  return result;
}

export function modelForStage(stage: StageName): ModelPolicy {
  const tier: ModelTier = frontierStages.has(stage) ? 'frontier' : fastStages.has(stage) ? 'fast' : reviewerStages.has(stage) ? 'reviewer' : builderStages.has(stage) ? 'builder' : 'reviewer';
  const policy = tierPolicy(tier);
  const stageOverride = process.env[`FACTORY_STAGE_${stage.replaceAll(/[^A-Z0-9]+/giu, '_')}_MODEL`]?.trim();
  return stageOverride ? { ...policy, model: stageOverride } : policy;
}

export function modelPolicySignature(stages: StageName[] = [...StageNameSchema.options]) {
  return stages.map((stage) => `${stage}:${modelForStage(stage).tier}:${modelForStage(stage).model}:${modelForStage(stage).reasoning}`).sort().join('|');
}

export function classifyModelFailure(message: string): ModelFailureKind {
  const text = String(message).toLowerCase();
  if (/(?:timeout|timed out|rate limit|usage limit|quota|try again at|at capacity|429|temporar|econnreset|503|network)/u.test(text)) return 'TRANSIENT';
  if (/(?:policy|permission|forbidden|license|copyright|unsafe|blocked by)/u.test(text)) return 'POLICY_BLOCK';
  if (/(?:schema|invalid input|spec|acceptance standard|unknown requirement)/u.test(text)) return 'SPEC_ERROR';
  if (/(?:tool|command|enoent|playwright|cannot spawn|file not found)/u.test(text)) return 'TOOL_ERROR';
  return 'CAPABILITY_ERROR';
}

export function nextModelAfterFailure(
  stage: StageName,
  attempt: number,
  failureKind: ModelFailureKind = 'CAPABILITY_ERROR',
  allowedTiers?: readonly ModelTier[],
): ModelPolicy {
  const current = modelForStage(stage);
  if (attempt <= 0 || failureKind !== 'CAPABILITY_ERROR') return current;
  const escalation: Record<ModelTier, ModelTier> = { fast: 'reviewer', reviewer: 'builder', builder: 'frontier', frontier: 'frontier' };
  // The stage contract is the authority for escalation.  A capability retry
  // may skip a tier that is not approved for the stage, but it can never cross
  // the contract's model boundary (and therefore can never acquire a new
  // workspace permission).  Keeping the default here prevents callers that
  // forget to pass a contract from silently widening the route.
  const allowed = new Set<ModelTier>(allowedTiers ?? getStageContract(stage).allowedModelTiers);
  if (!allowed.has(current.tier)) return current;
  let tier = current.tier;
  // `attempt` is the number of capability failures already observed. Walk the
  // ladder rather than jumping only one tier from the base on every retry:
  // Spark → Luna → Terra → Sol. Policy/error retries never escalate.
  for (let index = 0; index < Math.trunc(attempt); index += 1) {
    let candidate = escalation[tier];
    while (candidate !== 'frontier' && !allowed.has(candidate)) candidate = escalation[candidate];
    // No stronger tier is allowed by this contract. Keep the current route.
    if (!allowed.has(candidate)) break;
    tier = candidate;
  }
  return tierPolicy(tier);
}

/**
 * Map a stage to an execution boundary, not just a model name. Fast helpers are
 * deliberately read-only; only an explicitly designated Builder/Fixer call may
 * mutate a generated game workspace.
 */
export function executionPolicyForStage(stage: StageName): ExecutionPolicy {
  const policy = modelForStage(stage);
  // Research is an explicit capability, never the catch-all for a newly
  // added/uncategorised stage. Unknown governance stages therefore fail into
  // a read-only reviewer role instead of accidentally receiving the browser
  // research network profile.
  const role: ExecutionPolicy['role'] = fixerStages.has(stage) ? 'fixer' : builderStages.has(stage) ? 'builder' : releaseStages.has(stage) ? 'release' : fastStages.has(stage) ? 'evidence-helper' : researchStages.has(stage) ? 'research' : producerStages.has(stage) ? 'producer' : reviewerStages.has(stage) ? 'reviewer' : 'reviewer';
  const canModifyWorkspace = role === 'builder' || role === 'fixer';
  return {
    ...policy,
    canModifyWorkspace,
    role,
    sandbox: canModifyWorkspace ? 'workspace-write' : 'read-only',
    handoffMaxChars: Math.min(policy.maxInputChars, policy.tier === 'fast' ? 8_000 : policy.tier === 'reviewer' ? 16_000 : 24_000),
  };
}

/**
 * Resolve the policy that will actually be sent to a provider for a stage
 * attempt. Attempt one uses the declared route; later attempts may escalate
 * only for capability failures. The role, sandbox and workspace permission are
 * always inherited from the stage and can never be acquired through model
 * escalation.
 */
export function executionPolicyForAttempt(
  stageValue: StageName,
  attemptValue: number,
  failureKind: ModelFailureKind = 'CAPABILITY_ERROR',
  allowedTiers?: readonly ModelTier[],
): ExecutionPolicy {
  const stage = StageNameSchema.parse(stageValue);
  const attempt = Math.max(1, Math.trunc(attemptValue));
  const base = executionPolicyForStage(stage);
  const selected = nextModelAfterFailure(stage, attempt - 1, failureKind, allowedTiers);
  return {
    ...base,
    ...selected,
    role: base.role,
    sandbox: base.sandbox,
    canModifyWorkspace: base.canModifyWorkspace,
    handoffMaxChars: Math.min(base.handoffMaxChars, selected.maxInputChars),
  };
}

/**
 * Validate a proposed route before a provider call.  Escalating the model is
 * allowed only when the execution role and sandbox remain those of the stage;
 * a reviewer/fast task can never acquire Builder workspace permissions by
 * merely changing its model tier.
 */
export function validateModelRoute(stageValue: StageName, proposed: { tier: ModelTier; role: ExecutionPolicy['role']; sandbox: ExecutionPolicy['sandbox'] }): ExecutionPolicy {
  const stage = StageNameSchema.parse(stageValue);
  const expected = executionPolicyForStage(stage);
  if (proposed.role !== expected.role) throw new Error(`model route role mismatch for ${stage}: expected ${expected.role}, got ${proposed.role}`);
  if (proposed.sandbox !== expected.sandbox) throw new Error(`model route sandbox mismatch for ${stage}: expected ${expected.sandbox}, got ${proposed.sandbox}`);
  const proposedCanModify = proposed.role === 'builder' || proposed.role === 'fixer';
  if (proposedCanModify !== expected.canModifyWorkspace) throw new Error(`model route permission mismatch for ${stage}`);
  // A stage may use a stronger model for a capability escalation, but never a
  // lower model than the declared fast/reviewer boundary without an explicit
  // stage override in the policy itself.
  const rank: Record<ModelTier, number> = { fast: 0, reviewer: 1, builder: 2, frontier: 3 };
  if (rank[proposed.tier] < rank[expected.tier]) throw new Error(`model route tier downgrade for ${stage}`);
  if (!getStageContract(stage).allowedModelTiers.includes(proposed.tier)) throw new Error(`model route tier not allowed for ${stage}: ${proposed.tier}`);
  return expected;
}
