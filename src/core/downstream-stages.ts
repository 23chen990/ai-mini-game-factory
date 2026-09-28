import type { StageName } from '../schemas/index.js';

/**
 * Canonical dependency invalidation map.  It is intentionally exported and
 * tested separately from the orchestrator so retries cannot silently leave a
 * stale candidate or human approval marked as usable.
 */
const downstream: Partial<Record<StageName, readonly StageName[]>> = {
  // Business approval is a root gate for every game-specific and release
  // stage. A changed account portfolio, platform rule, rights decision or
  // payout setup must rewind all dependent evidence, not just this stage.
  BUSINESS_PREFLIGHT: ['PRODUCTION_LINE_REVIEW', 'REFERENCE_DEEP_RESEARCH', 'REFERENCE_MECHANIC_LOCK', 'WAITING_FOR_REFERENCE_APPROVAL', 'OPEN_SOURCE_RESEARCH', 'IAA_REVIEW', 'BLUEPRINT', 'EXPERIENCE_HYPOTHESIS', 'EXPERIENCE_CONTRACT', 'CORE_SPEC_FROZEN', 'GRAYBOX_CORE', 'FEEL_PROTOTYPE', 'NATURAL_PLAY_QA', 'EXPERIENCE_REVIEW', 'FEEL_REPAIR', 'NARRATIVE_CONTRACT', 'STORY_VERTICAL_SLICE', 'CHOICE_CONSEQUENCE_QA', 'NARRATIVE_REVIEW', 'REPLAY_VALUE_QA', 'SYSTEMS_CONTRACT', 'SYSTEMS_PROTOTYPE', 'STRATEGY_QA', 'PROGRESSION_REVIEW', 'PUZZLE_CONTRACT', 'PUZZLE_PROTOTYPE', 'PUZZLE_FAIRNESS_QA', 'PUZZLE_REVIEW', 'ART_DIRECTIONS', 'WAITING_FOR_ART_APPROVAL', 'WAITING_FOR_CODEX_IMAGEGEN', 'STYLE_LOCK', 'CONTENT_EXPANSION', 'UI_SKELETON', 'POLISH_VERTICAL_SLICE', 'ASSETS', 'FULL_BUILD', 'QA', 'FINAL_PROFILE_QA', 'NORMAL_FLOW_QA', 'VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA', 'QUALITY_BASELINE_QA', 'PRESENTATION_QA', 'SUPPLY_CHAIN_QA', 'ORIGINALITY_REVIEW', 'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'CERTIFICATION', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  PRODUCTION_LINE_REVIEW: ['REFERENCE_DEEP_RESEARCH', 'REFERENCE_MECHANIC_LOCK', 'WAITING_FOR_REFERENCE_APPROVAL', 'OPEN_SOURCE_RESEARCH', 'IAA_REVIEW', 'BLUEPRINT', 'EXPERIENCE_HYPOTHESIS', 'CORE_SPEC_FROZEN', 'ART_DIRECTIONS', 'STYLE_LOCK', 'CONTENT_EXPANSION', 'UI_SKELETON', 'ASSETS', 'FULL_BUILD', 'QA', 'FINAL_PROFILE_QA', 'NORMAL_FLOW_QA', 'VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA', 'QUALITY_BASELINE_QA', 'ORIGINALITY_REVIEW', 'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'CERTIFICATION', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  COMPETITOR_RESEARCH: ['IDEA_GENERATION', 'LOW_COST_FILTER', 'PROTOTYPE_SELECTION', 'BUILD_3_PROTOTYPES', 'PLAYTEST_TOURNAMENT', 'WINNER_SELECTION', 'WAITING_FOR_PROTOTYPE_APPROVAL', 'OPEN_SOURCE_RESEARCH', 'IAA_REVIEW', 'BLUEPRINT', 'EXPERIENCE_HYPOTHESIS', 'CORE_SPEC_FROZEN', 'ART_DIRECTIONS', 'STYLE_LOCK', 'CONTENT_EXPANSION', 'UI_SKELETON', 'ASSETS', 'FULL_BUILD', 'QA', 'FINAL_PROFILE_QA', 'NORMAL_FLOW_QA', 'VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA', 'QUALITY_BASELINE_QA', 'ORIGINALITY_REVIEW', 'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'CERTIFICATION', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  FACTORY_EVAL: ['REFERENCE_DEEP_RESEARCH', 'REFERENCE_MECHANIC_LOCK', 'WAITING_FOR_REFERENCE_APPROVAL', 'OPEN_SOURCE_RESEARCH', 'IAA_REVIEW', 'BLUEPRINT', 'EXPERIENCE_HYPOTHESIS', 'CORE_SPEC_FROZEN', 'ART_DIRECTIONS', 'STYLE_LOCK', 'CONTENT_EXPANSION', 'UI_SKELETON', 'ASSETS', 'FULL_BUILD', 'QA', 'FINAL_PROFILE_QA', 'NORMAL_FLOW_QA', 'VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA', 'QUALITY_BASELINE_QA', 'ORIGINALITY_REVIEW', 'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'CERTIFICATION', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  REFERENCE_MECHANIC_LOCK: ['WAITING_FOR_REFERENCE_APPROVAL', 'OPEN_SOURCE_RESEARCH', 'IAA_REVIEW', 'BLUEPRINT', 'EXPERIENCE_HYPOTHESIS', 'CORE_SPEC_FROZEN', 'ART_DIRECTIONS', 'STYLE_LOCK', 'CONTENT_EXPANSION', 'UI_SKELETON', 'ASSETS', 'FULL_BUILD', 'QA', 'FINAL_PROFILE_QA', 'VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA', 'QUALITY_BASELINE_QA', 'ORIGINALITY_REVIEW', 'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'CERTIFICATION', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  OPEN_SOURCE_RESEARCH: ['IAA_REVIEW', 'BLUEPRINT', 'EXPERIENCE_HYPOTHESIS', 'CORE_SPEC_FROZEN', 'ART_DIRECTIONS', 'STYLE_LOCK', 'CONTENT_EXPANSION', 'UI_SKELETON', 'ASSETS', 'FULL_BUILD', 'QA', 'FINAL_PROFILE_QA', 'VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA', 'QUALITY_BASELINE_QA', 'ORIGINALITY_REVIEW', 'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'CERTIFICATION', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  IAA_REVIEW: ['BLUEPRINT', 'EXPERIENCE_HYPOTHESIS', 'CORE_SPEC_FROZEN', 'ART_DIRECTIONS', 'STYLE_LOCK', 'CONTENT_EXPANSION', 'UI_SKELETON', 'ASSETS', 'FULL_BUILD', 'QA', 'FINAL_PROFILE_QA', 'VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA', 'QUALITY_BASELINE_QA', 'ORIGINALITY_REVIEW', 'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'CERTIFICATION', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  BLUEPRINT: ['EXPERIENCE_CONTRACT', 'EXPERIENCE_HYPOTHESIS', 'GRAYBOX_CORE', 'CORE_SPEC_FROZEN', 'ART_DIRECTIONS', 'STYLE_LOCK', 'CONTENT_EXPANSION', 'UI_SKELETON', 'ASSETS', 'FULL_BUILD', 'QA', 'FINAL_PROFILE_QA', 'VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA', 'QUALITY_BASELINE_QA', 'ORIGINALITY_REVIEW', 'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'CERTIFICATION', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  EXPERIENCE_CONTRACT: ['PRODUCT_EXPERIENCE_CONTRACT', 'PERCEPTUAL_QA', 'EXPERIENCE_HYPOTHESIS', 'CORE_SPEC_FROZEN', 'FEEL_PROTOTYPE', 'NATURAL_PLAY_QA', 'EXPERIENCE_REVIEW', 'NARRATIVE_CONTRACT', 'STORY_VERTICAL_SLICE', 'CHOICE_CONSEQUENCE_QA', 'NARRATIVE_REVIEW', 'REPLAY_VALUE_QA', 'SYSTEMS_CONTRACT', 'SYSTEMS_PROTOTYPE', 'STRATEGY_QA', 'PROGRESSION_REVIEW', 'PUZZLE_CONTRACT', 'PUZZLE_PROTOTYPE', 'PUZZLE_FAIRNESS_QA', 'PUZZLE_REVIEW', 'CONTENT_EXPANSION', 'UI_SKELETON', 'ASSETS', 'FULL_BUILD', 'QA', 'FINAL_PROFILE_QA', 'VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA', 'QUALITY_BASELINE_QA', 'ORIGINALITY_REVIEW', 'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'CERTIFICATION', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  EXPERIENCE_HYPOTHESIS: ['CORE_SPEC_FROZEN', 'FEEL_PROTOTYPE', 'NATURAL_PLAY_QA', 'EXPERIENCE_REVIEW', 'NARRATIVE_CONTRACT', 'STORY_VERTICAL_SLICE', 'CHOICE_CONSEQUENCE_QA', 'NARRATIVE_REVIEW', 'REPLAY_VALUE_QA', 'SYSTEMS_CONTRACT', 'SYSTEMS_PROTOTYPE', 'STRATEGY_QA', 'PROGRESSION_REVIEW', 'PUZZLE_CONTRACT', 'PUZZLE_PROTOTYPE', 'PUZZLE_FAIRNESS_QA', 'PUZZLE_REVIEW', 'CONTENT_EXPANSION', 'UI_SKELETON', 'ASSETS', 'FULL_BUILD', 'QA', 'FINAL_PROFILE_QA', 'VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA', 'QUALITY_BASELINE_QA', 'ORIGINALITY_REVIEW', 'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'CERTIFICATION', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  CORE_SPEC_FROZEN: ['FEEL_PROTOTYPE', 'NATURAL_PLAY_QA', 'EXPERIENCE_REVIEW', 'NARRATIVE_CONTRACT', 'STORY_VERTICAL_SLICE', 'CHOICE_CONSEQUENCE_QA', 'NARRATIVE_REVIEW', 'REPLAY_VALUE_QA', 'SYSTEMS_CONTRACT', 'SYSTEMS_PROTOTYPE', 'STRATEGY_QA', 'PROGRESSION_REVIEW', 'PUZZLE_CONTRACT', 'PUZZLE_PROTOTYPE', 'PUZZLE_FAIRNESS_QA', 'PUZZLE_REVIEW', 'CONTENT_EXPANSION', 'UI_SKELETON', 'ASSETS', 'FULL_BUILD', 'QA', 'FINAL_PROFILE_QA', 'VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA', 'QUALITY_BASELINE_QA', 'ORIGINALITY_REVIEW', 'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'CERTIFICATION', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  STYLE_LOCK: ['CONTENT_EXPANSION', 'UI_SKELETON', 'ASSETS', 'FULL_BUILD', 'QA', 'FINAL_PROFILE_QA', 'VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA', 'QUALITY_BASELINE_QA', 'ORIGINALITY_REVIEW', 'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  CONTENT_EXPANSION: ['UI_SKELETON', 'POLISH_VERTICAL_SLICE', 'ASSETS', 'FULL_BUILD', 'QA', 'FINAL_PROFILE_QA', 'VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA', 'QUALITY_BASELINE_QA', 'ORIGINALITY_REVIEW', 'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  UI_SKELETON: ['POLISH_VERTICAL_SLICE', 'ASSETS', 'FULL_BUILD', 'QA', 'FINAL_PROFILE_QA', 'VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA', 'QUALITY_BASELINE_QA', 'ORIGINALITY_REVIEW', 'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  ASSETS: ['FULL_BUILD', 'QA', 'FINAL_PROFILE_QA', 'VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA', 'QUALITY_BASELINE_QA', 'ORIGINALITY_REVIEW', 'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  FULL_BUILD: ['QA', 'FINAL_PROFILE_QA', 'NORMAL_FLOW_QA', 'VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA', 'QUALITY_BASELINE_QA', 'PRESENTATION_QA', 'SUPPLY_CHAIN_QA', 'ORIGINALITY_REVIEW', 'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'CERTIFICATION', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  BUILD: ['QA', 'FINAL_PROFILE_QA', 'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  QA: ['FINAL_PROFILE_QA', 'NORMAL_FLOW_QA', 'VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA', 'QUALITY_BASELINE_QA', 'PRESENTATION_QA', 'SUPPLY_CHAIN_QA', 'ORIGINALITY_REVIEW', 'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'CERTIFICATION', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  FINAL_PROFILE_QA: ['VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA', 'QUALITY_BASELINE_QA', 'ORIGINALITY_REVIEW', 'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  VISUAL_EVIDENCE_QA: ['PRESENTATION_QA', 'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  CONTENT_VARIATION_QA: ['QUALITY_BASELINE_QA', 'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  QUALITY_BASELINE_QA: ['ORIGINALITY_REVIEW', 'RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  ORIGINALITY_REVIEW: ['RELEASE_CANDIDATE', 'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'CERTIFICATION', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  RELEASE_CANDIDATE: ['BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'CERTIFICATION', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  BLIND_PLAYTEST_QA: ['WAITING_FOR_HUMAN_PLAYTEST', 'RELEASE', 'COMPLETED'],
  WAITING_FOR_HUMAN_PLAYTEST: ['CERTIFICATION', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  PLATFORM_ADAPTER_QA: ['TARGET_PLATFORM_QA', 'RELEASE', 'COMPLETED'],
  TARGET_PLATFORM_QA: ['RELEASE', 'COMPLETED'],
  LIVE_MONITORING: ['LIVE_VERIFIED', 'COMPLETED'],
  LIVE_VERIFIED: ['COMPLETED'],
};

// Every change before candidate freezing invalidates the automatic release
// evidence as well as the candidate and both final player gates.  Keeping this
// expansion central prevents a newly added prerequisite (notably COST_GATE or
// certification/platform checks) from being accidentally left out of one of
// the long legacy arrays above.
const PRE_CANDIDATE_ROOTS: readonly StageName[] = [
  'BUSINESS_PREFLIGHT', 'PRODUCTION_LINE_REVIEW', 'FACTORY_EVAL',
  'REFERENCE_DEEP_RESEARCH', 'REFERENCE_MECHANIC_LOCK', 'WAITING_FOR_REFERENCE_APPROVAL',
  'COMPETITOR_RESEARCH', 'IDEA_GENERATION', 'LOW_COST_FILTER', 'PROTOTYPE_SELECTION',
  'BUILD_3_PROTOTYPES', 'PLAYTEST_TOURNAMENT', 'WINNER_SELECTION', 'WAITING_FOR_PROTOTYPE_APPROVAL',
  'OPEN_SOURCE_RESEARCH', 'IAA_REVIEW', 'BLUEPRINT', 'EXPERIENCE_HYPOTHESIS', 'EXPERIENCE_CONTRACT', 'PRODUCT_EXPERIENCE_CONTRACT', 'PERCEPTUAL_QA',
  'CORE_SPEC_FROZEN', 'FEEL_PROTOTYPE', 'NATURAL_PLAY_QA', 'EXPERIENCE_REVIEW', 'FEEL_REPAIR',
  'NARRATIVE_CONTRACT', 'STORY_VERTICAL_SLICE', 'CHOICE_CONSEQUENCE_QA', 'NARRATIVE_REVIEW', 'REPLAY_VALUE_QA',
  'SYSTEMS_CONTRACT', 'SYSTEMS_PROTOTYPE', 'STRATEGY_QA', 'PROGRESSION_REVIEW',
  'PUZZLE_CONTRACT', 'PUZZLE_PROTOTYPE', 'PUZZLE_FAIRNESS_QA', 'PUZZLE_REVIEW',
  'ART_DIRECTIONS', 'WAITING_FOR_CODEX_IMAGEGEN', 'WAITING_FOR_ART_APPROVAL', 'STYLE_LOCK',
  'CONTENT_EXPANSION', 'UI_SKELETON', 'POLISH_VERTICAL_SLICE', 'ASSETS', 'FULL_BUILD', 'BUILD',
  'QA', 'FINAL_PROFILE_QA', 'NORMAL_FLOW_QA', 'VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA',
  'QUALITY_BASELINE_QA', 'PRESENTATION_QA', 'SUPPLY_CHAIN_QA', 'ORIGINALITY_REVIEW', 'CERTIFICATION',
  'COST_GATE', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA',
];
const PRE_CANDIDATE_DEPENDENTS: readonly StageName[] = [
  'QUALITY_BASELINE_QA', 'PRESENTATION_QA', 'SUPPLY_CHAIN_QA', 'ORIGINALITY_REVIEW', 'CERTIFICATION',
  'COST_GATE', 'PLATFORM_ADAPTER_QA', 'TARGET_PLATFORM_QA', 'RELEASE_CANDIDATE',
  'BLIND_PLAYTEST_QA', 'WAITING_FOR_HUMAN_PLAYTEST', 'ACCEPTANCE_REVIEW', 'RELEASE', 'COMPLETED',
];
for (const stage of PRE_CANDIDATE_ROOTS) {
  downstream[stage] = [...new Set([...(downstream[stage] ?? []), ...PRE_CANDIDATE_DEPENDENTS])];
}
downstream.PRODUCT_EXPERIENCE_CONTRACT = ['PERCEPTUAL_QA', 'FULL_BUILD', 'QA', 'FINAL_PROFILE_QA', 'NORMAL_FLOW_QA', 'VISUAL_EVIDENCE_QA', 'RELEASE_CANDIDATE', 'RELEASE', 'COMPLETED'];
downstream.PERCEPTUAL_QA = ['FULL_BUILD', 'QA', 'FINAL_PROFILE_QA', 'NORMAL_FLOW_QA', 'VISUAL_EVIDENCE_QA', 'RELEASE_CANDIDATE', 'RELEASE', 'COMPLETED'];

/**
 * Explicit files that may be invalidated when a stage is retried.  This list
 * is deliberately allow-listed rather than derived from a glob: a retry must
 * never delete a generated game workspace or an unrelated run.  Directories
 * are included only when they are disposable evidence/packaging directories.
 */
const stageArtifacts: Partial<Record<StageName, readonly string[]>> = {
  PRODUCT_EXPERIENCE_CONTRACT: ['artifacts/product-experience-contract.json'],
  PERCEPTUAL_QA: ['artifacts/perceptual-qa-report.json', 'screenshots/product-experience/'],
  BUSINESS_PREFLIGHT: ['artifacts/business-preflight.json', 'artifacts/account-capacity.json', 'artifacts/account-capacity-evaluation.json', 'artifacts/platform-policy-evaluation.json'],
  PRODUCTION_LINE_REVIEW: ['artifacts/production-line-decision.json', 'artifacts/production-line-capability.json', 'artifacts/production-line-contract.json', 'artifacts/pipeline-plan.json'],
  FACTORY_EVAL: ['artifacts/factory-eval-report.json'],
  REFERENCE_DEEP_RESEARCH: [
    'artifacts/reference-evidence-pack.json',
    'artifacts/reference-fidelity-contract.json',
    'artifacts/reference-behavior-analysis.json',
    'artifacts/reference-failure-pressure-contract.json',
    'artifacts/reference-frame-manifest.json',
    'artifacts/reference-level-reconstruction.json',
    'artifacts/reference-level-implementation-contract.json',
    'artifacts/reference-research-resolution.json',
  ],
  COMPETITOR_RESEARCH: ['artifacts/competitor-research.json', 'artifacts/competitor-research-evidence.json'],
  REFERENCE_MECHANIC_LOCK: ['artifacts/reference-mechanic-spec.json', 'human/reference-mechanic-review.json', 'human/reference-decision.yaml'],
  OPEN_SOURCE_RESEARCH: ['artifacts/open-source-research.json'],
  IAA_REVIEW: ['artifacts/iaa-monetization-review.json', 'artifacts/iaa-contract.json'],
  BLUEPRINT: ['artifacts/game-blueprint.json', 'artifacts/differentiation-contract.json'],
  EXPERIENCE_HYPOTHESIS: ['artifacts/experience-hypothesis.json'],
  EXPERIENCE_CONTRACT: ['artifacts/experience-contract.json', 'artifacts/profile-experience-contract.json', 'artifacts/natural-play-plan.json', 'artifacts/profile-experience-bundle.json', 'artifacts/product-experience-contract.json', 'artifacts/perceptual-qa-report.json'],
  CORE_SPEC_FROZEN: ['artifacts/core-spec-lock.json'],
  FEEL_REPAIR: ['artifacts/profile-repair-triage.json'],
  ART_DIRECTIONS: ['artifacts/art-directions.json', 'artifacts/art-preview-manifest.json', 'art-review/'],
  // The human approval is an upstream attestation, not disposable output.
  // Retrying STYLE_LOCK must preserve it so the same decision is replayed.
  STYLE_LOCK: ['artifacts/style-lock.json'],
  CONTENT_EXPANSION: ['artifacts/content-expansion.json'],
  UI_SKELETON: ['artifacts/ui-skeleton.json'],
  ASSETS: ['artifacts/asset-manifest.json', 'artifacts/art-quality.json'],
  // Generated assets are immutable inputs to a build retry.  They are owned by
  // ASSETS and may only be regenerated by explicitly retrying that stage.
  FULL_BUILD: ['artifacts/build-report.json', 'artifacts/release-lifecycle.json', 'artifacts/supply-chain.json', 'artifacts/dependency-manifest.json', 'artifacts/sbom.json', 'artifacts/build-provenance.json', 'artifacts/presentation-quality.json'],
  BUILD: ['artifacts/build-report.json'],
  QA: ['artifacts/qa-report.json', 'artifacts/qa-evidence.json', 'artifacts/interaction-continuity-report.json', 'artifacts/runtime-product-gates.json', 'artifacts/completion-gates.json', 'artifacts/production-line-play-evidence.json', 'artifacts/reference-level-runtime-trace.json', 'artifacts/reference-level-comparison-gate.json', 'artifacts/reference-level-difference-report.md', 'artifacts/reference-fidelity-gate.json', 'artifacts/quality-gate-matrix.json', 'logs/console.log', 'screenshots/'],
  FINAL_PROFILE_QA: ['artifacts/final-profile-qa.json', 'artifacts/profile-qa-evidence.json', 'artifacts/interaction-continuity-report.json', 'artifacts/production-line-play-plan.json', 'artifacts/production-line-play-evaluation.json', 'artifacts/quality-gate-matrix.json'],
  NORMAL_FLOW_QA: ['artifacts/qa-report.json', 'artifacts/qa-evidence.json', 'artifacts/interaction-continuity-report.json', 'artifacts/production-line-play-evidence.json', 'artifacts/quality-gate-matrix.json', 'screenshots/', 'logs/console.log'],
  VISUAL_EVIDENCE_QA: ['artifacts/visual-evidence.json', 'artifacts/quality-gate-matrix.json'],
  CONTENT_VARIATION_QA: ['artifacts/content-variation.json', 'artifacts/level-difference.json', 'artifacts/quality-gate-matrix.json'],
  QUALITY_BASELINE_QA: ['artifacts/quality-baseline.json', 'artifacts/quality-gate-matrix.json'],
  PRESENTATION_QA: ['artifacts/presentation-evaluation.json'],
  SUPPLY_CHAIN_QA: ['artifacts/supply-chain-evaluation.json'],
  ORIGINALITY_REVIEW: ['artifacts/originality-declaration.json', 'artifacts/quality-gate-matrix.json'],
  RELEASE_CANDIDATE: ['artifacts/release-candidate.json', 'artifacts/interaction-continuity-report.json', 'artifacts/quality-gate-matrix.json', 'artifacts/human-approval-evaluation.json', 'release-candidate/'],
  BLIND_PLAYTEST_QA: ['artifacts/blind-playtest-evaluation.json'],
  WAITING_FOR_HUMAN_PLAYTEST: ['human/playtest-acceptance.json', 'human/playtest-acceptance.example.json', 'artifacts/quality-gate-matrix.json', 'artifacts/human-approval-evaluation.json'],
  CERTIFICATION: ['artifacts/certification-checklist.json'],
  COST_GATE: ['artifacts/cost-gate.json'],
  PLATFORM_ADAPTER_QA: ['artifacts/platform-spine.json'],
  TARGET_PLATFORM_QA: ['artifacts/platform-release-matrix.json', 'artifacts/platform-package-set.json', 'artifacts/platform-package-evaluation.json', 'artifacts/quality-gate-matrix.json', 'human/platform-qa.example.json'],
  RELEASE: ['artifacts/release-manifest.json'],
};

export function getDownstreamStages(stage: StageName): StageName[] {
  return [...(downstream[stage] ?? [])];
}

/** Return a deterministic allow-list of disposable files for a retry. */
export function getDownstreamArtifactPaths(stage: StageName): string[] {
  const stages = [stage, ...getDownstreamStages(stage)];
  const paths = stages.flatMap((name) => stageArtifacts[name] ?? []);
  const metadata = paths
    .filter((item) => !item.endsWith('/'))
    .map((item) => `artifacts/artifact-metadata/${item.replaceAll('/', '__')}.json`);
  const audit = stages.flatMap((name) => [
    `artifacts/stage-contracts/${name}.json`,
    `artifacts/provider-errors/${name}.json`,
  ]);
  return [...new Set([...paths, ...metadata, ...audit])];
}
