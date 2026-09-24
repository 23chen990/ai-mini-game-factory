import { StageNameSchema, type StageName } from '../schemas/index.js';
import { StageContractSchema, StageEvidenceResultSchema, StageContractAuditSchema, StageContractRegistryReportSchema, StageRoleSchema, type StageContract, type StageEvidenceResult, type StageContractAudit, type StageContractRegistryReport, type StageRole } from '../schemas/stage-contracts.js';

export function stageAttemptAllowed(contract: StageContract, attempt: number): boolean {
  if (contract.retryPolicy.unboundedUntilPass) return true;
  return attempt <= (contract.maxAttempts ?? Number.POSITIVE_INFINITY)
    && attempt <= (contract.retryPolicy.maxAttempts ?? Number.POSITIVE_INFINITY);
}

type ArtifactSeed = Omit<StageContract['inputs'][number], 'artifactVersion'> & { artifactVersion?: number };
type ContractSeed = Omit<StageContract, 'schemaVersion' | 'inputs' | 'outputs' | 'verifierRole' | 'retryPolicy' | 'sideEffects'> & {
  inputs: ArtifactSeed[];
  outputs: ArtifactSeed[];
  verifierRole?: StageContract['verifierRole'];
  retryPolicy?: Partial<StageContract['retryPolicy']>;
  sideEffects?: StageContract['sideEffects'];
};

const base = (input: ContractSeed): StageContract => {
  const verifierRole = input.verifierRole ?? (input.ownerRole === 'BuilderAgent' || input.ownerRole === 'FixerAgent' ? 'QAAgent' : input.ownerRole === 'QAAgent' ? 'HumanReviewer' : input.ownerRole === 'ReleaseAgent' ? 'HumanReviewer' : 'FactoryControlPlane');
  const retryPolicy = { maxAttempts: input.maxAttempts, unboundedUntilPass: false, retryableClasses: input.failureRoute.classes, preserveOutputs: false, backoffSeconds: 0, ...input.retryPolicy };
  const sideEffects = input.sideEffects ?? {
    workspaceWrite: input.mutationScope === 'game-workspace',
    externalNetwork: false,
    externalUpload: false,
    publish: input.stage === 'RELEASE',
    idempotent: true,
  };
  return StageContractSchema.parse({ schemaVersion: 1, ...input, verifierRole, retryPolicy, sideEffects });
};

const generic: ContractSeed = {
  stage: 'FACTORY_CONTROL',
  purpose: 'Persist a deterministic, resumable stage transition.',
  ownerRole: 'FactoryControlPlane',
  allowedModelTiers: ['frontier', 'builder', 'reviewer', 'fast'],
  mutationScope: 'run-metadata',
  inputs: [{ path: 'state.json', schema: 'RunStateSchema', required: true, trust: 'trusted' }],
  outputs: [{ path: 'state.json', schema: 'RunStateSchema', required: true, trust: 'trusted' }],
  evidenceRequired: [{ id: 'state:persisted', description: 'State can be loaded after the transition.', verifier: 'deterministic', required: true }],
  passCriteria: ['state is schema-valid', 'transition is idempotent'],
  failureRoute: { stage: 'FACTORY_CONTROL', classes: ['state', 'unknown'], rationale: 'The control plane owns state transition failures.' },
  maxAttempts: 1,
  contextBudgetChars: 8_000,
  approvalRequired: false,
  idempotencyKey: 'run:{runId}:stage:{stage}:attempt:{attempt}',
};

const governanceContracts: Record<string, ContractSeed> = {
  // Prototype builders are real workspace writers.  They used to fall back
  // to the generic metadata contract, which made strict side-effect checking
  // reject an otherwise valid tournament run (and hid the permission
  // boundary from the audit trail).
  BUILD_3_PROTOTYPES: {
    stage: 'BUILD_3_PROTOTYPES', purpose: 'Build three disposable, playable prototypes in isolated child workspaces.', ownerRole: 'BuilderAgent', allowedModelTiers: ['builder'], mutationScope: 'game-workspace', inputs: [{ path: 'artifacts/idea-generation.batch-{batch}.json', schema: 'IdeaGenerationSchema', required: true, trust: 'trusted' }, { path: 'artifacts/prototype-selection.batch-{batch}.json', schema: 'PrototypeSelectionSchema', required: true, trust: 'trusted' }], outputs: [{ path: 'artifacts/prototype-build-report.batch-{batch}.json', schema: 'PrototypeBuildReportSchema', required: true, trust: 'generated' }, { path: 'workspace/prototype-*/dist/', schema: 'build-output', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'playable:3', description: 'All three prototypes launch and expose the intended core action.', verifier: 'deterministic', required: true }], passCriteria: ['prototype workspaces stay inside the current run', 'prototype output is disposable and contains no IAA'], failureRoute: { stage: 'BUILD_3_PROTOTYPES', classes: ['build', 'core_experience'], rationale: 'Prototype implementation failures belong to the prototype Builder.' }, maxAttempts: 2, contextBudgetChars: 32_000, approvalRequired: false, idempotencyKey: 'run:{runId}:prototype-build:{batch}:{selectionHash}',
  },
  BUILD_ACTION_PROTOTYPES: {
    stage: 'BUILD_ACTION_PROTOTYPES', purpose: 'Build isolated action-feel experiment variants without touching the production game workspace.', ownerRole: 'BuilderAgent', allowedModelTiers: ['builder'], mutationScope: 'game-workspace', inputs: [{ path: 'artifacts/action-experiment-spec.json', schema: 'ActionMechanicExperimentSchema', required: true, trust: 'trusted' }], outputs: [{ path: 'artifacts/action-prototype-build-report.json', schema: 'FormalPrototypeBuildReportSchema', required: true, trust: 'generated' }, { path: 'workspace/action-*/dist/', schema: 'build-output', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'action-prototype:playable', description: 'Each action variant is independently launchable and measurable.', verifier: 'deterministic', required: true }], passCriteria: ['variants remain isolated from workspace/game', 'no release or monetization side effect is introduced'], failureRoute: { stage: 'BUILD_ACTION_PROTOTYPES', classes: ['build', 'core_experience'], rationale: 'Action experiment implementation failures belong to the experiment Builder.' }, maxAttempts: 2, contextBudgetChars: 32_000, approvalRequired: false, idempotencyKey: 'run:{runId}:action-prototypes:{specHash}',
  },
  PRODUCTION_LINE_REVIEW: {
    stage: 'PRODUCTION_LINE_REVIEW', purpose: 'Confirm that the request maps to an approved production line before any build work.', ownerRole: 'FactoryControlPlane', allowedModelTiers: ['frontier', 'reviewer'], mutationScope: 'run-metadata', inputs: [{ path: 'input/seed.yaml', schema: 'SeedSchema', required: true, trust: 'trusted' }], outputs: [{ path: 'artifacts/production-line-decision.json', schema: 'ProductionLineDecisionSchema', required: true, trust: 'generated' }, { path: 'artifacts/production-line-capability.json', schema: 'ProductionLineCapabilityReportSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'line:support-decision', description: 'Support decision and profile are explicit.', verifier: 'deterministic', required: true }, { id: 'line:capability-checked', description: 'The selected template/runtime is implemented by the line.', verifier: 'deterministic', required: true }], passCriteria: ['unsupported profiles cannot silently use another line', 'a missing template blocks before Builder'], failureRoute: { stage: 'PRODUCTION_LINE_REVIEW', classes: ['core_experience', 'unknown'], rationale: 'A missing production line requires a new line review.' }, maxAttempts: 1, contextBudgetChars: 8_000, approvalRequired: true, idempotencyKey: 'run:{runId}:line:{seedHash}',
  },
  EXPERIENCE_HYPOTHESIS: {
    stage: 'EXPERIENCE_HYPOTHESIS', purpose: 'Record a falsifiable profile hypothesis and measurable player outcome before implementation.', ownerRole: 'ProducerAgent', allowedModelTiers: ['frontier', 'reviewer'], mutationScope: 'design-artifacts-only', inputs: [{ path: 'artifacts/game-blueprint.json', schema: 'GameBlueprintSchema', required: true, trust: 'trusted' }], outputs: [{ path: 'artifacts/experience-hypothesis.json', schema: 'ExperienceHypothesisSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'hypothesis:measurable', description: 'Primary experience and success/failure measures are explicit.', verifier: 'independent-agent', required: true }], passCriteria: ['hypothesis is testable and profile-specific'], failureRoute: { stage: 'EXPERIENCE_HYPOTHESIS', classes: ['core_experience'], rationale: 'Producer owns an ambiguous experience target.' }, maxAttempts: 2, contextBudgetChars: 16_000, approvalRequired: false, idempotencyKey: 'run:{runId}:hypothesis:{blueprintHash}',
  },
  EXPERIENCE_CONTRACT: {
    stage: 'EXPERIENCE_CONTRACT', purpose: 'Freeze the profile-specific experience contract and oracle-free natural-play plan that Builder and QA must implement and verify.', ownerRole: 'ProducerAgent', allowedModelTiers: ['frontier', 'reviewer'], mutationScope: 'design-artifacts-only', inputs: [{ path: 'artifacts/game-blueprint.json', schema: 'GameBlueprintSchema', required: true, trust: 'trusted' }, { path: 'artifacts/production-line-contract.json', schema: 'ProductionLineContractSchema', required: true, trust: 'human-attested' }], outputs: [{ path: 'artifacts/experience-contract.json', schema: 'ExperienceContractSchema', required: true, trust: 'human-attested' }, { path: 'artifacts/profile-experience-contract.json', schema: 'ProfileExperienceContractSchema', required: true, trust: 'generated' }, { path: 'artifacts/natural-play-plan.json', schema: 'NaturalPlayPlanSchema', required: true, trust: 'generated' }, { path: 'artifacts/profile-experience-bundle.json', schema: 'ProfileExperienceBundleSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'experience:profile-locked', description: 'The selected profile, line and blueprint hash agree.', verifier: 'deterministic', required: true }, { id: 'experience:oracle-free', description: 'Natural-play scenarios forbid state-forcing shortcuts.', verifier: 'independent-agent', required: true }], passCriteria: ['profile-specific acceptance dimensions are explicit', 'natural-play evidence is separate from state coverage', 'later agents cannot lower the frozen experience standard'], failureRoute: { stage: 'EXPERIENCE_CONTRACT', classes: ['core_experience', 'unknown'], rationale: 'An ambiguous experience contract is an upstream design failure.' }, maxAttempts: 2, contextBudgetChars: 20_000, approvalRequired: true, idempotencyKey: 'run:{runId}:experience-contract:{blueprintHash}:{line}',
  },
  PRODUCT_EXPERIENCE_CONTRACT: {
    stage: 'PRODUCT_EXPERIENCE_CONTRACT', purpose: 'Freeze player-visible signals and natural triggers for every declared feature.', ownerRole: 'ProducerAgent', allowedModelTiers: ['frontier', 'reviewer'], mutationScope: 'design-artifacts-only', inputs: [{ path: 'artifacts/experience-contract.json', schema: 'ExperienceContractSchema', required: true, trust: 'trusted' }, { path: 'artifacts/reference-fidelity-contract.json', schema: 'ReferenceFidelityContractSchema', required: false, trust: 'trusted' }, { path: 'artifacts/reference-research-resolution.json', schema: 'ReferenceResearchResolutionSchema', required: false, trust: 'trusted' }, { path: 'artifacts/reference-failure-pressure-contract.json', schema: 'FailurePressureContractSchema', required: false, trust: 'trusted' }, { path: 'artifacts/reference-level-implementation-contract.json', schema: 'ReferenceLevelImplementationContractSchema', required: false, trust: 'trusted' }, { path: 'artifacts/reference-level-runtime-data.json', schema: 'ReferenceLevelRuntimeDataSchema', required: false, trust: 'trusted' }], outputs: [{ path: 'artifacts/product-experience-contract.json', schema: 'ProductExperienceContractSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'product:signals-explicit', description: 'Each feature names player action, visible signal, natural trigger and blocking gaps.', verifier: 'deterministic', required: true }, { id: 'product:exact-branch-viewport-matrix', description: 'Each feature is bound to exact object/state branches and required phone viewports.', verifier: 'deterministic', required: true }], passCriteria: ['every feature has a player-visible signal', 'state-only implementation is explicitly blocking', 'reference-driven games derive checks from the reference fidelity contract and recording-level semantic contract when available'], failureRoute: { stage: 'EXPERIENCE_CONTRACT', classes: ['core_experience', 'unknown'], rationale: 'Ambiguous product signals belong to the upstream experience contract.' }, maxAttempts: 2, contextBudgetChars: 24_000, approvalRequired: false, idempotencyKey: 'run:{runId}:product-experience:{experienceHash}:{referenceHash}',
  },
  PERCEPTUAL_QA: {
    stage: 'PERCEPTUAL_QA', purpose: 'Independently verify that declared features are visible and naturally triggerable in the product.', ownerRole: 'QAAgent', allowedModelTiers: ['reviewer', 'fast'], mutationScope: 'qa-artifacts-only', inputs: [{ path: 'artifacts/product-experience-contract.json', schema: 'ProductExperienceContractSchema', required: true, trust: 'trusted' }, { path: 'artifacts/build-report.json', schema: 'BuildReportSchema', required: true, trust: 'trusted' }, { path: 'artifacts/qa-report.json', schema: 'QaReportSchema', required: true, trust: 'generated' }], outputs: [{ path: 'artifacts/perceptual-qa-report.json', schema: 'PerceptualQaReportSchema', required: true, trust: 'generated' }, { path: 'artifacts/perceptual-qa-gate.json', schema: 'PerceptualQaGateSchema', required: true, trust: 'generated' }, { path: 'screenshots/product-experience/*', schema: 'evidence-file', required: true, trust: 'generated' }, { path: 'logs/product-experience/*', schema: 'evidence-file', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'perceptual:player-visible', description: 'Every passing feature has hash-bound screenshot evidence showing the player-visible signal.', verifier: 'independent-agent', required: true }, { id: 'perceptual:natural-trigger', description: 'Every passing feature is triggered through the default player journey.', verifier: 'independent-agent', required: true }, { id: 'perceptual:exact-matrix', description: 'Every object/state branch is checked at every required phone viewport.', verifier: 'deterministic', required: true }], passCriteria: ['deterministic capture cannot self-approve', 'no feature passes from state fields or unrelated text changes', 'all player-visible, natural-trigger, event-order and negative checks pass'], failureRoute: { stage: 'FULL_BUILD', classes: ['core_experience', 'qa'], rationale: 'Perceptual gaps require implementation changes before release evidence can proceed.' }, maxAttempts: 2, contextBudgetChars: 32_000, approvalRequired: false, idempotencyKey: 'run:{runId}:perceptual-qa:{buildHash}:{contractHash}',
  },
  IAA_REVIEW: {
    stage: 'IAA_REVIEW', purpose: 'Review a locked mechanic for player-respectful IAA placements without redesigning gameplay.', ownerRole: 'ProducerAgent', allowedModelTiers: ['frontier', 'reviewer'], mutationScope: 'design-artifacts-only', inputs: [{ path: 'input/seed.yaml', schema: 'SeedSchema', required: true, trust: 'trusted' }, { path: 'artifacts/open-source-research.json', schema: 'OpenSourceResearchSchema', required: true, trust: 'generated' }], outputs: [{ path: 'artifacts/iaa-monetization-review.json', schema: 'IaaMonetizationReviewSchema', required: true, trust: 'generated' }, { path: 'artifacts/iaa-contract.json', schema: 'IaaContractSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'iaa:bounded-contract', description: 'Ad placements are optional, frequency-capped and do not alter the core loop.', verifier: 'independent-agent', required: true }], passCriteria: ['IAA review cannot change the locked mechanic', 'deceptive or coercive placements are blocked'], failureRoute: { stage: 'IAA_REVIEW', classes: ['monetization', 'compliance'], rationale: 'IAA policy belongs to the monetization review, not Builder.' }, maxAttempts: 1, contextBudgetChars: 16_000, approvalRequired: false, idempotencyKey: 'run:{runId}:iaa:{mechanicsHash}',
  },
  BLUEPRINT: {
    stage: 'BLUEPRINT', purpose: 'Translate approved mechanic relationships into a bounded implementation blueprint.', ownerRole: 'ProducerAgent', allowedModelTiers: ['frontier', 'reviewer'], mutationScope: 'design-artifacts-only', inputs: [{ path: 'input/seed.yaml', schema: 'SeedSchema', required: true, trust: 'trusted' }, { path: 'artifacts/open-source-research.json', schema: 'OpenSourceResearchSchema', required: true, trust: 'generated' }, { path: 'artifacts/iaa-contract.json', schema: 'IaaContractSchema', required: true, trust: 'generated' }, { path: 'artifacts/reference-research-resolution.json', schema: 'ReferenceResearchResolutionSchema', required: false, trust: 'trusted' }, { path: 'artifacts/reference-failure-pressure-contract.json', schema: 'FailurePressureContractSchema', required: false, trust: 'trusted' }], outputs: [{ path: 'artifacts/game-blueprint.json', schema: 'GameBlueprintSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'zod:GameBlueprintSchema', description: 'The blueprint is schema-valid and preserves the selected runtime, template, targets and experience profile.', verifier: 'deterministic', required: true }, { id: 'open-source-research-before-blueprint:true', description: 'Open-source provenance was reviewed before technical design.', verifier: 'deterministic', required: true }], passCriteria: ['only approved infrastructure is referenced', 'core mechanic and experience profile are explicit', 'expression remains original'], failureRoute: { stage: 'BLUEPRINT', classes: ['core_experience', 'rights', 'unknown'], rationale: 'Blueprint ambiguity is an upstream design error and must not be patched in the generated workspace.' }, maxAttempts: 2, contextBudgetChars: 24_000, approvalRequired: false, idempotencyKey: 'run:{runId}:blueprint:{mechanicsHash}:{iaaHash}',
  },
  CONTENT_EXPANSION: {
    stage: 'CONTENT_EXPANSION', purpose: 'Author a small, profile-specific content and difficulty plan before full integration.', ownerRole: 'ProducerAgent', allowedModelTiers: ['frontier', 'reviewer'], mutationScope: 'design-artifacts-only', inputs: [{ path: 'artifacts/game-blueprint.json', schema: 'GameBlueprintSchema', required: true, trust: 'trusted' }, { path: 'artifacts/experience-hypothesis.json', schema: 'ExperienceHypothesisSchema', required: true, trust: 'generated' }, { path: 'artifacts/style-lock.json', schema: 'StyleLockSchema', required: true, trust: 'human-attested' }], outputs: [{ path: 'artifacts/content-expansion.json', schema: 'ContentExpansionPlanSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'content:representative-flow', description: 'A shortest representative flow and at least two materially different variants are explicit.', verifier: 'independent-agent', required: true }], passCriteria: ['variants alter structure, decision or pacing rather than only text/color', 'scope remains bounded'], failureRoute: { stage: 'CONTENT_EXPANSION', classes: ['core_experience', 'qa'], rationale: 'Content and difficulty ownership stays upstream of Builder.' }, maxAttempts: 2, contextBudgetChars: 16_000, approvalRequired: false, idempotencyKey: 'run:{runId}:content:{blueprintHash}:{styleHash}',
  },
  UI_SKELETON: {
    stage: 'UI_SKELETON', purpose: 'Define the information architecture and first-viewport feedback before visual polish.', ownerRole: 'ProducerAgent', allowedModelTiers: ['fast', 'reviewer', 'frontier'], mutationScope: 'design-artifacts-only', inputs: [{ path: 'artifacts/game-blueprint.json', schema: 'GameBlueprintSchema', required: true, trust: 'trusted' }, { path: 'artifacts/experience-hypothesis.json', schema: 'ExperienceHypothesisSchema', required: true, trust: 'generated' }, { path: 'artifacts/content-expansion.json', schema: 'ContentExpansionPlanSchema', required: true, trust: 'generated' }], outputs: [{ path: 'artifacts/ui-skeleton.json', schema: 'UiSkeletonSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'ui:first-viewport', description: 'Primary action, current goal, state feedback and retry affordance are anchored for the first viewport.', verifier: 'independent-agent', required: true }], passCriteria: ['the primary action is unambiguous on target phones', 'IAA never obscures the core action'], failureRoute: { stage: 'UI_SKELETON', classes: ['core_experience', 'qa'], rationale: 'Information architecture failures return to UI design before Builder integration.' }, maxAttempts: 2, contextBudgetChars: 16_000, approvalRequired: false, idempotencyKey: 'run:{runId}:ui:{blueprintHash}:{contentHash}',
  },
  GRAYBOX_CORE: {
    stage: 'GRAYBOX_CORE', purpose: 'Answer whether the primary interaction is fun with the smallest playable greybox.', ownerRole: 'BuilderAgent', allowedModelTiers: ['builder'], mutationScope: 'game-workspace', inputs: [{ path: 'artifacts/experience-hypothesis.json', schema: 'ExperienceHypothesisSchema', required: true, trust: 'trusted' }], outputs: [{ path: 'artifacts/graybox-build-report.json', schema: 'BuildReportSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'graybox:playable', description: 'A clean-reset core action is playable.', verifier: 'independent-agent', required: true }], passCriteria: ['greybox answers the core fun question before polish'], failureRoute: { stage: 'GRAYBOX_CORE', classes: ['core_experience', 'build'], rationale: 'Builder owns the greybox implementation.' }, maxAttempts: 2, contextBudgetChars: 32_000, approvalRequired: false, idempotencyKey: 'run:{runId}:graybox:{hypothesisHash}',
  },
  CORE_SPEC_FROZEN: {
    stage: 'CORE_SPEC_FROZEN', purpose: 'Freeze the machine-readable core experience standard before parallel production work.', ownerRole: 'ProducerAgent', allowedModelTiers: ['frontier', 'reviewer'], mutationScope: 'design-artifacts-only', inputs: [{ path: 'artifacts/experience-hypothesis.json', schema: 'ExperienceHypothesisSchema', required: true, trust: 'generated' }, { path: 'artifacts/production-line-contract.json', schema: 'ProductionLineContractSchema', required: true, trust: 'human-attested' }], outputs: [{ path: 'artifacts/core-spec-lock.json', schema: 'CoreSpecLockSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'spec:frozen', description: 'Acceptance dimensions and allowed ranges are recorded for downstream agents.', verifier: 'deterministic', required: true }], passCriteria: ['later agents cannot lower the acceptance bar without a versioned change', 'the final CORE_DEMO approval covers the playable and presentation result'], failureRoute: { stage: 'CORE_SPEC_FROZEN', classes: ['core_experience'], rationale: 'A malformed or inconsistent core standard belongs to the design contract owner.' }, maxAttempts: 1, contextBudgetChars: 12_000, approvalRequired: false, idempotencyKey: 'run:{runId}:core-spec:{hypothesisHash}',
  },
  POLISH_VERTICAL_SLICE: {
    stage: 'POLISH_VERTICAL_SLICE', purpose: 'Integrate one representative polished slice before multiplying content.', ownerRole: 'BuilderAgent', allowedModelTiers: ['builder'], mutationScope: 'game-workspace', inputs: [{ path: 'artifacts/core-spec-lock.json', schema: 'CoreSpecLockSchema', required: false, trust: 'human-attested' }, { path: 'artifacts/style-lock.json', schema: 'StyleLockSchema', required: true, trust: 'human-attested' }], outputs: [{ path: 'artifacts/vertical-slice-report.json', schema: 'BuildReportSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'slice:representative', description: 'The first content/UI/art slice is playable and reviewable.', verifier: 'independent-agent', required: true }], passCriteria: ['polish is validated before batch content'], failureRoute: { stage: 'POLISH_VERTICAL_SLICE', classes: ['build', 'core_experience'], rationale: 'Builder owns vertical-slice integration.' }, maxAttempts: 2, contextBudgetChars: 32_000, approvalRequired: false, idempotencyKey: 'run:{runId}:slice:{styleHash}:{contentHash}',
  },
  PRESENTATION_QA: {
    stage: 'PRESENTATION_QA', purpose: 'Verify audio, haptics, animation, readability and performance evidence.', ownerRole: 'QAAgent', allowedModelTiers: ['reviewer', 'fast'], mutationScope: 'qa-artifacts-only', inputs: [{ path: 'artifacts/presentation-quality.json', schema: 'PresentationQualityReportSchema', required: true, trust: 'generated' }], outputs: [{ path: 'artifacts/presentation-evaluation.json', schema: 'PresentationQualityEvaluationSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'presentation:dimensions', description: 'All required presentation dimensions have independent evidence.', verifier: 'independent-agent', required: true }], passCriteria: ['no audio/haptic/readability/performance blocker remains'], failureRoute: { stage: 'PRESENTATION_QA', classes: ['qa', 'core_experience', 'platform'], rationale: 'Presentation regressions return to the owning presentation or build stage.' }, maxAttempts: 2, contextBudgetChars: 20_000, approvalRequired: false, idempotencyKey: 'run:{runId}:presentation:{buildHash}',
  },
  SUPPLY_CHAIN_QA: {
    stage: 'SUPPLY_CHAIN_QA', purpose: 'Verify lockfile, SBOM, licenses and build provenance without executing unapproved scripts.', ownerRole: 'QAAgent', allowedModelTiers: ['reviewer', 'fast'], mutationScope: 'qa-artifacts-only', inputs: [{ path: 'artifacts/supply-chain.json', schema: 'SupplyChainManifestSchema', required: true, trust: 'generated' }, { path: 'artifacts/dependency-manifest.json', schema: 'DependencyManifestSchema', required: true, trust: 'generated' }, { path: 'artifacts/sbom.json', schema: 'SbomSchema', required: true, trust: 'generated' }, { path: 'artifacts/build-provenance.json', schema: 'BuildProvenanceSchema', required: true, trust: 'generated' }], outputs: [{ path: 'artifacts/supply-chain-evaluation.json', schema: 'SupplyChainEvaluationSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'supply-chain:provenance', description: 'Dependencies and build outputs are hash-bound.', verifier: 'deterministic', required: true }], passCriteria: ['unverified licenses and install scripts block release', 'separate dependency, SBOM and provenance evidence hashes agree'], failureRoute: { stage: 'SUPPLY_CHAIN_QA', classes: ['rights', 'security', 'build'], rationale: 'Supply-chain evidence must be repaired before release.' }, maxAttempts: 1, contextBudgetChars: 16_000, approvalRequired: false, idempotencyKey: 'run:{runId}:supply-chain:{lockHash}:{buildHash}',
  },
  COST_GATE: {
    stage: 'COST_GATE', purpose: 'Stop a run before further work when token, time or external-call budgets are exhausted.', ownerRole: 'FactoryControlPlane', allowedModelTiers: ['reviewer', 'fast'], mutationScope: 'run-metadata', inputs: [{ path: 'state.json', schema: 'RunStateSchema', required: true, trust: 'trusted' }], outputs: [{ path: 'artifacts/cost-gate.json', schema: 'CostGateEvaluationSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'cost:within-budget', description: 'Current usage is within the locked run budget.', verifier: 'deterministic', required: true }], passCriteria: ['budget is evaluated before downstream work', 'over-budget runs stop or are explicitly abandoned'], failureRoute: { stage: 'COST_GATE', classes: ['cost', 'unknown'], rationale: 'The control plane owns budget decisions and must not defer them to release.' }, maxAttempts: 1, contextBudgetChars: 8_000, approvalRequired: false, idempotencyKey: 'run:{runId}:cost:{stage}:{usageHash}',
  },
  BLIND_PLAYTEST_QA: {
    stage: 'BLIND_PLAYTEST_QA', purpose: 'Verify an unfamiliar player can complete the frozen candidate with natural input.', ownerRole: 'HumanReviewer', allowedModelTiers: ['reviewer'], mutationScope: 'qa-artifacts-only', inputs: [{ path: 'artifacts/release-candidate.json', schema: 'ReleaseCandidateSchema', required: true, trust: 'generated' }], outputs: [{ path: 'artifacts/blind-playtest-evaluation.json', schema: 'BlindPlaytestEvaluationSchema', required: true, trust: 'human-attested' }], evidenceRequired: [{ id: 'blind:clean-natural-play', description: 'The player was unfamiliar, started from reset and used natural input.', verifier: 'human', required: true }], passCriteria: ['candidate hash matches the played build'], failureRoute: { stage: 'BLIND_PLAYTEST_QA', classes: ['core_experience', 'qa'], rationale: 'Blind playtest failures return to the earliest experience owner.' }, maxAttempts: 1, contextBudgetChars: 12_000, approvalRequired: true, idempotencyKey: 'run:{runId}:blind:{candidateHash}:{playerId}',
  },
};

const definitions: Record<string, ContractSeed> = {
  REFERENCE_DEEP_RESEARCH: {
    stage: 'REFERENCE_DEEP_RESEARCH', purpose: 'Turn untrusted benchmark material into a bounded observation/inference/unknown evidence pack, failure-pressure contract, and exact behavior checks before any builder sees it.', ownerRole: 'ResearchAgent', allowedModelTiers: ['frontier', 'reviewer'], mutationScope: 'research-artifacts-only', inputs: [{ path: 'input/seed.yaml', schema: 'SeedSchema', required: true, trust: 'trusted' }, { path: 'input/reference-research/', schema: 'untrusted-source-files', required: false, trust: 'untrusted-sanitized' }, { path: 'reference-evidence/', schema: 'EvidenceProvenanceManifestSchema', required: false, trust: 'untrusted-sanitized' }], outputs: [{ path: 'artifacts/reference-evidence-pack.json', schema: 'ReferenceEvidencePackSchema', required: true, trust: 'generated' }, { path: 'artifacts/reference-behavior-analysis.model-output.raw.json', schema: 'raw-provider-output', required: false, trust: 'generated' }, { path: 'artifacts/reference-behavior-analysis.raw.json', schema: 'ReferenceBehaviorAnalysisSchema', required: false, trust: 'generated' }, { path: 'artifacts/reference-level-reconstruction.raw.json', schema: 'ReferenceLevelReconstructionSchema', required: false, trust: 'generated' }, { path: 'artifacts/reference-research-resolution.json', schema: 'ReferenceResearchResolutionSchema', required: false, trust: 'generated' }, { path: 'artifacts/reference-behavior-analysis.json', schema: 'ReferenceBehaviorAnalysisSchema', required: false, trust: 'generated' }, { path: 'artifacts/reference-failure-pressure-contract.json', schema: 'FailurePressureContractSchema', required: false, trust: 'generated' }, { path: 'artifacts/reference-frame-manifest.json', schema: 'ReferenceFrameManifestSchema', required: false, trust: 'generated' }, { path: 'artifacts/reference-level-reconstruction.json', schema: 'ReferenceLevelReconstructionSchema', required: false, trust: 'generated' }, { path: 'artifacts/reference-level-implementation-contract.json', schema: 'ReferenceLevelImplementationContractSchema', required: false, trust: 'generated' }, { path: 'artifacts/reference-fidelity-contract.json', schema: 'ReferenceFidelityContractSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'reference:evidence-pack', description: 'Observation, inference and unknown fields are separated and source hashes are retained.', verifier: 'independent-agent', required: true }, { id: 'reference:five-dimension-behavior-contract', description: 'Source-bound checks cover input/state, spatial relation, failure/recovery, feedback sequence and terminal/replay.', verifier: 'independent-agent', required: true }, { id: 'reference:failure-pressure-contract', description: 'Source-bound pressure records the signal, escalation, attributable failure, recovery, and no-copy boundary.', verifier: 'independent-agent', required: true }, { id: 'reference:recording-level-contract-when-recording', description: 'A verified gameplay recording produces a hash-bound frame manifest, reconstruction and semantic Builder contract.', verifier: 'deterministic', required: false }], passCriteria: ['raw source text is never forwarded as an instruction', 'missing evidence remains an explicit unknown', 'every behavior and pressure observation cites run-bound source evidence', 'verified gameplay recordings yield a READY event-level reconstruction before Builder handoff', 'all five behavior dimensions and the failure-pressure contract are ready before Builder handoff'], failureRoute: { stage: 'REFERENCE_DEEP_RESEARCH', classes: ['unknown', 'rights', 'core_experience'], rationale: 'Reference evidence gaps must be resolved before the mechanic lock is trusted.' }, maxAttempts: 2, contextBudgetChars: 32_000, approvalRequired: false, idempotencyKey: 'run:{runId}:reference-evidence:{sourceHash}',
  },
  COMPETITOR_RESEARCH: {
    stage: 'COMPETITOR_RESEARCH', purpose: 'Collect evidence about reference products without turning guesses or hostile page text into instructions.', ownerRole: 'ResearchAgent', allowedModelTiers: ['frontier', 'reviewer'], mutationScope: 'research-artifacts-only',
    inputs: [{ path: 'input/seed.yaml', schema: 'SeedSchema', required: true, trust: 'trusted' }, { path: 'input/reference-url.txt', schema: 'url-list', required: false, trust: 'untrusted-sanitized' }], outputs: [{ path: 'artifacts/competitor-research.json', schema: 'CompetitorResearchSchema', required: true, trust: 'generated' }, { path: 'artifacts/competitor-research-evidence.json', schema: 'CompetitorResearchEvidenceReportSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'research:source-count', description: 'At least three relevant source records are attributable in strict production runs.', verifier: 'independent-agent', required: true }, { id: 'research:observation-inference-unknown', description: 'Observed, inferred and unknown claims are separated.', verifier: 'deterministic', required: true }, { id: 'research:sources-verified', description: 'Source locators, hashes and claim references pass the isolated research boundary.', verifier: 'deterministic', required: true }, { id: 'research:failure-pressure-contract', description: 'A source-linked failure-pressure contract covers each relevant comparator and records signal, escalation, attribution and recovery.', verifier: 'independent-agent', required: true }], passCriteria: ['no raw webpage instructions reach a mutating role', 'unknowns are explicit', 'source evidence is durable and hash-bound', 'multiple relevant competitors may contribute behavioral evidence without copying expression'], failureRoute: { stage: 'COMPETITOR_RESEARCH', classes: ['unknown', 'rights', 'core_experience'], rationale: 'Research owns evidence gaps and source interpretation.' }, maxAttempts: 2, contextBudgetChars: 48_000, approvalRequired: false, idempotencyKey: 'run:{runId}:research:{inputHash}',
  },
  OPEN_SOURCE_RESEARCH: {
    stage: 'OPEN_SOURCE_RESEARCH', purpose: 'Verify reusable infrastructure, licenses and platform fit before technical design.', ownerRole: 'ResearchAgent', allowedModelTiers: ['frontier', 'reviewer'], mutationScope: 'research-artifacts-only', inputs: [{ path: 'input/seed.yaml', schema: 'SeedSchema', required: true, trust: 'trusted' }, { path: 'artifacts/reference-mechanic-spec.json', schema: 'ReferenceMechanicSpecSchema', required: false, trust: 'human-attested' }, { path: 'artifacts/selected-prototype.json', schema: 'SelectedPrototypeSchema', required: false, trust: 'human-attested' }], outputs: [{ path: 'artifacts/open-source-research.json', schema: 'OpenSourceResearchSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'opensource:license', description: 'Every selected candidate has direct license evidence and immutable revision.', verifier: 'independent-agent', required: true }, { id: 'opensource:platform-fit', description: 'Target platform fit and security risks are recorded.', verifier: 'independent-agent', required: true }], passCriteria: ['unlicensed material is rejected', 'selected infrastructure is allow-listed'], failureRoute: { stage: 'OPEN_SOURCE_RESEARCH', classes: ['rights', 'compliance', 'unknown'], rationale: 'License and platform uncertainty blocks downstream design.' }, maxAttempts: 2, contextBudgetChars: 32_000, approvalRequired: false, idempotencyKey: 'run:{runId}:opensource:{mechanicsHash}',
  },
  ART_DIRECTIONS: {
    stage: 'ART_DIRECTIONS', purpose: 'Offer four original visual directions that differ in structure, not only palette.', ownerRole: 'ProducerAgent', allowedModelTiers: ['frontier', 'reviewer'], mutationScope: 'design-artifacts-only', inputs: [{ path: 'artifacts/game-blueprint.json', schema: 'GameBlueprintSchema', required: true, trust: 'trusted' }], outputs: [{ path: 'artifacts/art-directions.json', schema: 'ArtDirectionsSchema', required: true, trust: 'generated' }, { path: 'art-review/previews/', schema: 'ArtPreviewManifestSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'art:four-structural-directions', description: 'Four candidate directions are materially distinct.', verifier: 'independent-agent', required: true }], passCriteria: ['no known character or logo imitation', 'directions fit the asset budget'], failureRoute: { stage: 'ART_DIRECTIONS', classes: ['rights', 'core_experience'], rationale: 'Art direction owns expression and feasibility failures.' }, maxAttempts: 2, contextBudgetChars: 24_000, approvalRequired: false, idempotencyKey: 'run:{runId}:art-directions:{blueprintHash}',
  },
  ASSETS: {
    stage: 'ASSETS', purpose: 'Generate the minimal approved asset set and verify provenance, alpha, hashes and source-bound visual fit.', ownerRole: 'ProducerAgent', allowedModelTiers: ['fast', 'reviewer'], mutationScope: 'design-artifacts-only', inputs: [{ path: 'artifacts/style-lock.json', schema: 'StyleLockSchema', required: true, trust: 'human-attested' }, { path: 'artifacts/asset-visual-fit-review.json', schema: 'AssetVisualFitReviewSchema', required: false, trust: 'human-attested' }, { path: 'artifacts/asset-manifest.json', schema: 'AssetManifestSchema', required: false, trust: 'generated' }], outputs: [{ path: 'artifacts/asset-manifest.json', schema: 'AssetManifestSchema', required: true, trust: 'generated' }, { path: 'artifacts/asset-production-gate.json', schema: 'AssetProductionGateSchema', required: true, trust: 'generated' }, { path: 'workspace/generated-assets/', schema: 'asset-files', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'assets:provenance', description: 'Every asset has source, status and hash.', verifier: 'deterministic', required: true }, { id: 'assets:alpha', description: 'Transparent assets have a meaningful alpha channel and no baked checkerboard.', verifier: 'deterministic', required: true }, { id: 'assets:visual-fit', description: 'Reference-reskin assets match the source-bound camera, geometry, material and lifecycle contract while keeping expression original.', verifier: 'independent-agent', required: true }], passCriteria: ['only approved style lock is used', 'asset paths stay inside the run', 'preview-only locks can only produce explicitly labelled procedural placeholders', 'reference-reskin formal assets have a passing visual-fit review'], failureRoute: { stage: 'ASSETS', classes: ['rights', 'build', 'core_experience'], rationale: 'Asset production owns provenance, alpha and reference-presentation failures.' }, maxAttempts: 2, contextBudgetChars: 16_000, approvalRequired: false, idempotencyKey: 'run:{runId}:assets:{styleHash}',
  },
  QA: {
    stage: 'QA', purpose: 'Run deterministic, natural, runtime-product and declared interaction-continuity checks against the isolated build.', ownerRole: 'QAAgent', allowedModelTiers: ['reviewer'], mutationScope: 'qa-artifacts-only', inputs: [{ path: 'artifacts/build-report.json', schema: 'BuildReportSchema', required: true, trust: 'trusted' }, { path: 'artifacts/production-line-contract.json', schema: 'ProductionLineContractSchema', required: true, trust: 'human-attested' }, { path: 'artifacts/product-experience-contract.json', schema: 'ProductExperienceContractSchema', required: true, trust: 'trusted' }, { path: 'artifacts/reference-fidelity-contract.json', schema: 'ReferenceFidelityContractSchema', required: false, trust: 'trusted' }, { path: 'artifacts/reference-research-resolution.json', schema: 'ReferenceResearchResolutionSchema', required: false, trust: 'trusted' }, { path: 'artifacts/reference-failure-pressure-contract.json', schema: 'FailurePressureContractSchema', required: false, trust: 'trusted' }, { path: 'artifacts/reference-level-reconstruction.json', schema: 'ReferenceLevelReconstructionSchema', required: false, trust: 'trusted' }, { path: 'artifacts/reference-level-implementation-contract.json', schema: 'ReferenceLevelImplementationContractSchema', required: false, trust: 'trusted' }, { path: 'artifacts/reference-level-runtime-data.json', schema: 'ReferenceLevelRuntimeDataSchema', required: false, trust: 'trusted' }, { path: 'artifacts/interaction-continuity-contract.json', schema: 'InteractionContinuityContractSchema', required: false, trust: 'trusted' }], outputs: [{ path: 'artifacts/qa-report.json', schema: 'QaReportSchema', required: true, trust: 'generated' }, { path: 'artifacts/completion-gates.json', schema: 'CompletionGateReportSchema', required: true, trust: 'generated' }, { path: 'artifacts/runtime-product-gates.json', schema: 'RuntimeProductGateSchema', required: true, trust: 'generated' }, { path: 'artifacts/reference-level-runtime-trace.json', schema: 'ReferenceLevelRuntimeTraceSchema', required: false, trust: 'generated' }, { path: 'artifacts/reference-level-comparison-gate.json', schema: 'ReferenceLevelComparisonGateSchema', required: false, trust: 'generated' }, { path: 'artifacts/interaction-continuity-report.json', schema: 'InteractionContinuityReportSchema', required: false, trust: 'generated' }, { path: 'artifacts/production-line-play-evidence.json', schema: 'ProductionLinePlayEvidenceSchema', required: false, trust: 'generated' }], evidenceRequired: [{ id: 'qa:core', description: 'Core tests pass.', verifier: 'deterministic', required: true }, { id: 'qa:normal-flow', description: 'Normal flow is playable.', verifier: 'independent-agent', required: true }, { id: 'qa:natural-e2e', description: 'At least one natural input trace has no state-forcing operations.', verifier: 'independent-agent', required: true }, { id: 'qa:runtime-product', description: 'The default entrypoint completes the declared product journey and legacy behavior is not still the default path.', verifier: 'independent-agent', required: true }, { id: 'qa:recording-level-comparison-when-declared', description: 'Recording-backed games pass semantic object, relation, action, camera, terminal and replay comparison.', verifier: 'independent-agent', required: false }, { id: 'qa:interaction-continuity-when-declared', description: 'Declared actions prove feedback candidates, playable successors, physical outcomes and recovery paths.', verifier: 'independent-agent', required: false }], passCriteria: ['all required checks pass', 'evidence mode is explicit', 'runtime-product journey is browser-observed before operating-gated release', 'a recording-level contract cannot be bypassed', 'a declared interaction-continuity contract cannot be bypassed'], failureRoute: { stage: 'FULL_BUILD', classes: ['build', 'core_experience', 'qa'], rationale: 'QA reports the symptom; implementation or contract owns the repair.' }, maxAttempts: 2, contextBudgetChars: 40_000, approvalRequired: false, idempotencyKey: 'run:{runId}:qa:{buildHash}:{productContractHash}:{referenceHash}',
  },
  FIX: {
    stage: 'FIX', purpose: 'Apply only explicitly reported QA repairs, prioritizing recording-level topology, interaction-node layout, feedback predicates and successor/recovery relations.', ownerRole: 'FixerAgent', allowedModelTiers: ['reviewer', 'builder'], mutationScope: 'game-workspace', inputs: [{ path: 'artifacts/qa-report.json', schema: 'QaReportSchema', required: true, trust: 'generated' }, { path: 'artifacts/reference-research-resolution.json', schema: 'ReferenceResearchResolutionSchema', required: false, trust: 'trusted' }, { path: 'artifacts/reference-failure-pressure-contract.json', schema: 'FailurePressureContractSchema', required: false, trust: 'trusted' }, { path: 'artifacts/reference-level-implementation-contract.json', schema: 'ReferenceLevelImplementationContractSchema', required: false, trust: 'trusted' }, { path: 'artifacts/reference-level-runtime-data.json', schema: 'ReferenceLevelRuntimeDataSchema', required: false, trust: 'trusted' }, { path: 'artifacts/reference-level-runtime-trace.json', schema: 'ReferenceLevelRuntimeTraceSchema', required: false, trust: 'generated' }, { path: 'artifacts/reference-level-comparison-gate.json', schema: 'ReferenceLevelComparisonGateSchema', required: false, trust: 'generated' }, { path: 'artifacts/interaction-continuity-report.json', schema: 'InteractionContinuityReportSchema', required: false, trust: 'generated' }], outputs: [{ path: 'workspace/game/dist', schema: 'build-output', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'fix:explicit-issues', description: 'Only issues present in the QA report are addressed.', verifier: 'deterministic', required: true }, { id: 'fix:continuity-root-cause', description: 'Continuity failures are repaired at node, feedback or successor/recovery ownership; thresholds are not widened wholesale.', verifier: 'independent-agent', required: false }, { id: 'fix:regression-test|fix:regression-test:contract', description: 'The repair is rechecked with a regression/build test before handoff (full mode), or passed contract-level verification (contract mode).', verifier: 'independent-agent', required: true }], passCriteria: ['workspace remains inside the current run', 'formal QA → FIX → QA has no fixed repair-attempt ceiling', 'every retry has a distinct evidence-backed repair hypothesis', 'the frozen experience contract is not weakened', 'recording-level failures repair the named checkpoint, object, placement, relation or action', 'continuity failures are fixed at their owning relation', 'configured cost, time, token or platform ceilings may pause the loop', 'unchanged code is never rebuilt repeatedly'], failureRoute: { stage: 'FULL_BUILD', classes: ['build', 'core_experience', 'qa'], rationale: 'A failed repair returns to the owning Builder or experience stage while a distinct evidence-backed repair remains; explicit project ceilings or the absence of a viable next hypothesis block the run.' }, maxAttempts: null, retryPolicy: { maxAttempts: null, unboundedUntilPass: true, retryableClasses: ['build', 'core_experience', 'qa', 'transient'], preserveOutputs: true, backoffSeconds: 0 }, contextBudgetChars: 32_000, approvalRequired: false, idempotencyKey: 'run:{runId}:fix:{qaHash}:{attempt}',
  },
  FEEL_REPAIR: {
    stage: 'FEEL_REPAIR', purpose: 'Record and execute a profile-specific experience repair while preserving the locked contract.', ownerRole: 'BuilderAgent', allowedModelTiers: ['frontier'], mutationScope: 'game-workspace', inputs: [{ path: 'artifacts/experience-review.json', schema: 'ExperienceReviewReportSchema', required: true, trust: 'generated' }, { path: 'artifacts/action-feel-natural-play-qa.json', schema: 'ActionPlaytestReportSchema', required: true, trust: 'generated' }], outputs: [{ path: 'artifacts/profile-repair-triage.json', schema: 'ProfileRepairTriageSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'feel:explicit-repair', description: 'The repair is tied to a recorded profile failure.', verifier: 'deterministic', required: true }, { id: 'feel:distinct-hypothesis', description: 'The retry names a distinct evidence-backed repair hypothesis.', verifier: 'deterministic', required: true }, { id: 'feel:qa-rerun-required', description: 'Independent profile QA is scheduled after the repair.', verifier: 'independent-agent', required: true }], passCriteria: ['only the recorded profile defect is changed', 'profile QA is rerun before downstream art or build stages'], failureRoute: { stage: 'EXPERIENCE_REVIEW', classes: ['core_experience', 'qa'], rationale: 'Feel defects remain owned by the experience review loop.' }, maxAttempts: null, retryPolicy: { maxAttempts: null, unboundedUntilPass: true, retryableClasses: ['core_experience', 'qa', 'transient'], preserveOutputs: true, backoffSeconds: 0 }, contextBudgetChars: 32_000, approvalRequired: false, idempotencyKey: 'run:{runId}:feel-repair:{reviewHash}:{attempt}',
  },
  BUSINESS_PREFLIGHT: {
    stage: 'BUSINESS_PREFLIGHT', purpose: 'Confirm entity, IAA policy, target accounts, platform rules, rights and payout readiness before release spend.', ownerRole: 'HumanReviewer', allowedModelTiers: ['reviewer', 'frontier'], mutationScope: 'run-metadata', inputs: [{ path: 'artifacts/factory-profile.json', schema: 'FactoryOperatingProfileSchema', required: true, trust: 'human-attested' }, { path: 'artifacts/account-capacity.json', schema: 'AccountCapacityPlanSchema', required: true, trust: 'generated' }, { path: 'artifacts/account-capacity-evaluation.json', schema: 'AccountCapacityReportSchema', required: true, trust: 'generated' }, { path: 'artifacts/platform-policy.json', schema: 'PlatformPolicySnapshotSchema', required: true, trust: 'human-attested' }, { path: 'artifacts/platform-policy-evaluation.json', schema: 'PlatformPolicyEvaluationSchema', required: true, trust: 'generated' }], outputs: [{ path: 'artifacts/business-preflight.json', schema: 'BusinessPreflightSchema', required: true, trust: 'human-attested' }, { path: 'artifacts/account-capacity.json', schema: 'AccountCapacityPlanSchema', required: true, trust: 'generated' }, { path: 'artifacts/account-capacity-evaluation.json', schema: 'AccountCapacityReportSchema', required: true, trust: 'generated' }, { path: 'artifacts/platform-policy-evaluation.json', schema: 'PlatformPolicyEvaluationSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'business:accounts', description: 'Each selected platform account is pass/blocked/unknown with evidence.', verifier: 'human', required: true }, { id: 'business:rights-payout', description: 'Rights and payout checks are explicit.', verifier: 'human', required: true }, { id: 'business:platform-policy', description: 'Current required-platform rules are operator-verified and hash-bound.', verifier: 'human', required: true }, { id: 'business:account-capacity', description: 'The capacity decision is bound to the current account portfolio snapshot.', verifier: 'deterministic', required: true }], passCriteria: ['GO has zero blockers and unknowns', 'required platform policy is verified', 'capacity evidence matches the current portfolio snapshot'], failureRoute: { stage: 'BUSINESS_PREFLIGHT', classes: ['rights', 'compliance', 'platform', 'unknown'], rationale: 'Business owner must resolve or explicitly pause the run.' }, maxAttempts: 1, contextBudgetChars: 12_000, approvalRequired: true, idempotencyKey: 'run:{runId}:business:{profileHash}:{platformPolicyHash}:{portfolioHash}',
  },
  TARGET_PLATFORM_QA: {
    stage: 'TARGET_PLATFORM_QA', purpose: 'Verify each domestic and optional overseas child independently on its target platform/device.', ownerRole: 'QAAgent', allowedModelTiers: ['reviewer'], mutationScope: 'qa-artifacts-only', inputs: [{ path: 'artifacts/platform-release-matrix.json', schema: 'PlatformReleaseMatrixSchema', required: true, trust: 'human-attested' }, { path: 'release-candidate/', schema: 'platform-builds', required: false, trust: 'generated' }], outputs: [{ path: 'artifacts/platform-release-matrix.json', schema: 'PlatformReleaseMatrixSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'platform:per-child', description: 'Every selected child has independent device/package evidence and hash.', verifier: 'independent-agent', required: true }], passCriteria: ['no child is implicitly treated as another platform', 'primary and selected optional children are ready'], failureRoute: { stage: 'TARGET_PLATFORM_QA', classes: ['platform', 'build', 'compliance'], rationale: 'Platform adapter/configuration owns target-specific failures.' }, maxAttempts: 2, contextBudgetChars: 24_000, approvalRequired: false, idempotencyKey: 'run:{runId}:platform:{coreHash}',
  },
  PLATFORM_ADAPTER_QA: {
    stage: 'PLATFORM_ADAPTER_QA', purpose: 'Verify that the shared platform spine is implemented without cross-child writes or inherited evidence.', ownerRole: 'QAAgent', allowedModelTiers: ['reviewer'], mutationScope: 'qa-artifacts-only', inputs: [{ path: 'artifacts/platform-spine.json', schema: 'PlatformSpineContractSchema', required: true, trust: 'human-attested' }, { path: 'artifacts/platform-release-matrix.json', schema: 'PlatformReleaseMatrixSchema', required: true, trust: 'human-attested' }], outputs: [{ path: 'artifacts/platform-spine.json', schema: 'PlatformSpineContractSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'platform-spine:per-child', description: 'Each adapter has independent package/device evidence.', verifier: 'independent-agent', required: true }], passCriteria: ['all child hashes are independent', 'reward grants require isEnded true'], failureRoute: { stage: 'PLATFORM_ADAPTER_QA', classes: ['platform', 'compliance'], rationale: 'Platform adapter defects must return to the platform spine, not the generic fixer.' }, maxAttempts: 2, contextBudgetChars: 20_000, approvalRequired: false, idempotencyKey: 'run:{runId}:platform-spine:{matrixHash}',
  },
  CERTIFICATION: {
    stage: 'CERTIFICATION', purpose: 'Track per-game software copyright, self-review, filing, privacy and anti-addiction evidence as asynchronous paperwork attached to GO_NO_GO.', ownerRole: 'HumanReviewer', allowedModelTiers: ['reviewer'], mutationScope: 'run-metadata', inputs: [{ path: 'artifacts/originality-declaration.json', schema: 'OriginalityDeclarationSchema', required: true, trust: 'human-attested' }], outputs: [{ path: 'artifacts/certification-checklist.json', schema: 'CertificationChecklistSchema', required: true, trust: 'human-attested' }], evidenceRequired: [{ id: 'certification:ready', description: 'Every required item has human evidence or a documented waiver.', verifier: 'human', required: true }], passCriteria: ['no required certification item is pending', 'platform naming rules are satisfied'], failureRoute: { stage: 'CERTIFICATION', classes: ['rights', 'compliance'], rationale: 'Paperwork and naming failures require human evidence.' }, maxAttempts: 1, contextBudgetChars: 12_000, approvalRequired: false, idempotencyKey: 'run:{runId}:certification:{checklistHash}',
  },
  RELEASE_CANDIDATE: {
    stage: 'RELEASE_CANDIDATE', purpose: 'Freeze the exact tested build into an immutable candidate before final human playtest.', ownerRole: 'ReleaseAgent', allowedModelTiers: ['reviewer', 'frontier'], mutationScope: 'release-artifacts-only', inputs: [{ path: 'artifacts/build-report.json', schema: 'BuildReportSchema', required: true, trust: 'generated' }, { path: 'artifacts/quality-gate-matrix.json', schema: 'QualityGateMatrixSchema', required: true, trust: 'generated' }, { path: 'artifacts/interaction-continuity-contract.json', schema: 'InteractionContinuityContractSchema', required: false, trust: 'trusted' }, { path: 'artifacts/interaction-continuity-report.json', schema: 'InteractionContinuityReportSchema', required: false, trust: 'generated' }, { path: 'workspace/game/dist/', schema: 'build-output', required: true, trust: 'generated' }], outputs: [{ path: 'artifacts/release-candidate.json', schema: 'ReleaseCandidateSchema', required: true, trust: 'generated' }, { path: 'artifacts/quality-gate-matrix.json', schema: 'QualityGateMatrixSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'candidate:hash-frozen', description: 'The candidate hash covers the exact files that will be played.', verifier: 'deterministic', required: true }, { id: 'candidate:quality-matrix-bound', description: 'The quality matrix carries the same SHA-256 candidate identity.', verifier: 'deterministic', required: true }, { id: 'candidate:interaction-continuity-when-declared', description: 'A declared interaction contract has a passing machine-verifiable report.', verifier: 'deterministic', required: false }], passCriteria: ['candidate is immutable after final human playtest', 'release does not rebuild the game', 'quality evidence is bound to the candidate hash', 'declared interactions have realizability and continuity evidence'], failureRoute: { stage: 'RELEASE_CANDIDATE', classes: ['build', 'qa'], rationale: 'Candidate integrity failures return to packaging.' }, maxAttempts: 2, contextBudgetChars: 16_000, approvalRequired: false, idempotencyKey: 'run:{runId}:candidate:{coreHash}',
  },
  FINAL_PROFILE_QA: {
    stage: 'FINAL_PROFILE_QA', purpose: 'Re-check the locked experience profile on the final build after content, UI and asset integration.', ownerRole: 'QAAgent', allowedModelTiers: ['reviewer', 'frontier'], mutationScope: 'qa-artifacts-only', inputs: [{ path: 'artifacts/game-blueprint.json', schema: 'GameBlueprintSchema', required: true, trust: 'trusted' }, { path: 'artifacts/build-report.json', schema: 'BuildReportSchema', required: true, trust: 'generated' }], outputs: [{ path: 'artifacts/final-profile-qa.json', schema: 'ExperienceReviewReportSchema', required: true, trust: 'generated' }, { path: 'artifacts/profile-qa-evidence.json', schema: 'ProfileQaReportSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'profile:final-build', description: 'The final build still satisfies the primary profile and has no oracle evidence.', verifier: 'independent-agent', required: true }], passCriteria: ['profile-specific acceptance dimensions pass after integration'], failureRoute: { stage: 'FINAL_PROFILE_QA', classes: ['core_experience', 'qa'], rationale: 'Final profile regressions return to content or Builder depending on attribution.' }, maxAttempts: 2, contextBudgetChars: 24_000, approvalRequired: false, idempotencyKey: 'run:{runId}:final-profile:{buildHash}',
  },
  FACTORY_EVAL: {
    stage: 'FACTORY_EVAL', purpose: 'Regress the factory itself when models, prompts, templates, routing or QA rules change.', ownerRole: 'QAAgent', allowedModelTiers: ['reviewer', 'fast'], mutationScope: 'qa-artifacts-only', inputs: [{ path: 'factory-eval/cases.json', schema: 'FactoryEvalCaseSchema', required: true, trust: 'trusted' }], outputs: [{ path: 'artifacts/factory-eval-report.json', schema: 'FactoryEvalReportSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'factory-eval:cases', description: 'All golden cases are executed and failures are retained.', verifier: 'deterministic', required: true }], passCriteria: ['no regression in routing, policy or artifact validation'], failureRoute: { stage: 'FACTORY_EVAL', classes: ['build', 'qa', 'unknown'], rationale: 'Factory changes must be fixed in the factory, not in a generated game.' }, maxAttempts: 1, contextBudgetChars: 24_000, approvalRequired: false, idempotencyKey: 'factory:{suiteHash}:{modelSignature}:{promptSignature}',
  },
  LIVE_VERIFIED: {
    stage: 'LIVE_VERIFIED', purpose: 'Record an explicit post-submission verification against the immutable release hash.', ownerRole: 'ReleaseAgent', allowedModelTiers: ['reviewer', 'frontier'], mutationScope: 'release-artifacts-only', inputs: [{ path: 'artifacts/release-candidate.json', schema: 'ReleaseCandidateSchema', required: true, trust: 'generated' }], outputs: [{ path: 'artifacts/live-verification/*', schema: 'LiveVerificationSchema', required: true, trust: 'human-attested' }, { path: 'artifacts/release-lifecycle.json', schema: 'ReleaseLifecycleSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'live:hash-bound', description: 'On-device verification is bound to the exact submitted release hash.', verifier: 'human', required: true }, { id: 'live:runtime-checks', description: 'Startup, core loop, terminal state, replay, ad and save checks are recorded.', verifier: 'independent-agent', required: true }], passCriteria: ['all required live checks pass', 'package hash matches the tested candidate'], failureRoute: { stage: 'LIVE_MONITORING', classes: ['platform', 'qa', 'growth'], rationale: 'Live verification failures pause monitoring and never rewrite the shipped candidate.' }, maxAttempts: 1, contextBudgetChars: 12_000, approvalRequired: true, idempotencyKey: 'run:{runId}:live:{platform}:{releaseHash}',
  },
  NORMAL_FLOW_QA: {
    stage: 'NORMAL_FLOW_QA', purpose: 'Verify a representative player flow from a clean reset using observable input.', ownerRole: 'QAAgent', allowedModelTiers: ['reviewer', 'fast'], mutationScope: 'qa-artifacts-only',
    inputs: [{ path: 'artifacts/build-report.json', schema: 'BuildReportSchema', required: true, trust: 'trusted' }, { path: 'artifacts/experience-contract.json', schema: 'ExperienceContractSchema', required: false, trust: 'trusted' }],
    // Screenshots are deliberately owned by VISUAL_EVIDENCE_QA.  Keeping
    // them optional here prevents a stub/diagnostic runner from claiming a
    // normal-flow contract solely because it emitted a placeholder path;
    // production still cannot pass the separate visual gate without real
    // files bound to the tested build.
    outputs: [{ path: 'artifacts/qa-report.json', schema: 'QaReportSchema', required: true, trust: 'generated' }, { path: 'artifacts/production-line-play-evidence.json', schema: 'ProductionLinePlayEvidenceSchema', required: false, trust: 'generated' }, { path: 'screenshots/*', schema: 'evidence-file', required: false, trust: 'generated' }],
    evidenceRequired: [{ id: 'qa:normal-flow', description: 'Reset, play, success/failure and retry are traced.', verifier: 'independent-agent', required: true }, { id: 'qa:no-console-errors', description: 'Browser console and page errors are absent.', verifier: 'deterministic', required: true }],
    passCriteria: ['normal flow starts from reset', 'all required actions are observable', 'no console or page errors'], failureRoute: { stage: 'FULL_BUILD', classes: ['build', 'qa', 'core_experience'], rationale: 'Implementation or experience contract owns normal-flow failures.' }, maxAttempts: 2, contextBudgetChars: 32_000, approvalRequired: false, idempotencyKey: 'run:{runId}:normal-flow:{buildHash}',
  },
  VISUAL_EVIDENCE_QA: {
    stage: 'VISUAL_EVIDENCE_QA', purpose: 'Verify that the final build has trustworthy visual evidence on the target viewport.', ownerRole: 'QAAgent', allowedModelTiers: ['reviewer', 'fast'], mutationScope: 'qa-artifacts-only',
    inputs: [{ path: 'artifacts/qa-report.json', schema: 'QaReportSchema', required: true, trust: 'generated' }],
    outputs: [{ path: 'screenshots/*', schema: 'evidence-file', required: true, trust: 'generated' }],
    evidenceRequired: [{ id: 'visual:at-least-two-screenshots', description: 'At least two screenshots come from the trusted QA runner.', verifier: 'independent-agent', required: true }, { id: 'visual:trusted-runner-evidence', description: 'Screenshot paths are bound to the tested build and viewport.', verifier: 'deterministic', required: true }],
    passCriteria: ['at least two screenshots exist', 'screenshots are produced by the same candidate QA run'], failureRoute: { stage: 'QA', classes: ['qa', 'core_experience'], rationale: 'Visual evidence failures return to the QA/build evidence owner.' }, maxAttempts: 2, contextBudgetChars: 16_000, approvalRequired: false, idempotencyKey: 'run:{runId}:visual:{buildHash}',
  },
  CONTENT_VARIATION_QA: {
    stage: 'CONTENT_VARIATION_QA', purpose: 'Prove that repeated runs expose meaningful structural or decision variation.', ownerRole: 'QAAgent', allowedModelTiers: ['reviewer', 'fast'], mutationScope: 'qa-artifacts-only',
    inputs: [{ path: 'artifacts/game-blueprint.json', schema: 'GameBlueprintSchema', required: true, trust: 'trusted' }, { path: 'artifacts/content-variation.json', schema: 'ContentVariationPlan', required: true, trust: 'trusted' }],
    outputs: [{ path: 'artifacts/content-variation.json', schema: 'ContentVariationReport', required: true, trust: 'generated' }],
    evidenceRequired: [{ id: 'variation:run-a-vs-b', description: 'Two deterministic runs differ in route, decision, structure or pacing.', verifier: 'independent-agent', required: true }],
    passCriteria: ['variation is not text-only or cosmetic-only', 'each variant remains playable'], failureRoute: { stage: 'CONTENT_EXPANSION', classes: ['core_experience', 'qa'], rationale: 'The content owner must repair missing meaningful variation.' }, maxAttempts: 2, contextBudgetChars: 24_000, approvalRequired: false, idempotencyKey: 'run:{runId}:variation:{contentHash}',
  },
  QUALITY_BASELINE_QA: {
    stage: 'QUALITY_BASELINE_QA', purpose: 'Verify the cross-game minimum shipping baseline before packaging.', ownerRole: 'QAAgent', allowedModelTiers: ['reviewer', 'fast'], mutationScope: 'qa-artifacts-only',
    inputs: [{ path: 'artifacts/build-report.json', schema: 'BuildReportSchema', required: true, trust: 'trusted' }, { path: 'artifacts/qa-report.json', schema: 'QaReportSchema', required: true, trust: 'generated' }],
    outputs: [{ path: 'artifacts/quality-baseline.json', schema: 'QualityBaselineReportSchema', required: true, trust: 'generated' }],
    evidenceRequired: [{ id: 'baseline:all-checks', description: 'Every cross-game baseline check has attributable evidence.', verifier: 'independent-agent', required: true }],
    passCriteria: ['all baseline checks pass', 'no missing evidence'], failureRoute: { stage: 'FULL_BUILD', classes: ['build', 'qa', 'core_experience'], rationale: 'A baseline failure belongs to the implementation or QA owner, not release packaging.' }, maxAttempts: 2, contextBudgetChars: 20_000, approvalRequired: false, idempotencyKey: 'run:{runId}:baseline:{buildHash}',
  },
  ORIGINALITY_REVIEW: {
    stage: 'ORIGINALITY_REVIEW', purpose: 'Confirm reference mechanics are separated from original expression and provenance.', ownerRole: 'HumanReviewer', allowedModelTiers: ['reviewer', 'frontier'], mutationScope: 'run-metadata',
    inputs: [{ path: 'artifacts/reference-mechanic-spec.json', schema: 'ReferenceMechanicSpecSchema', required: false, trust: 'human-attested' }, { path: 'artifacts/game-blueprint.json', schema: 'GameBlueprintSchema', required: true, trust: 'trusted' }],
    outputs: [{ path: 'artifacts/originality-declaration.json', schema: 'OriginalityDeclarationSchema', required: true, trust: 'human-attested' }],
    evidenceRequired: [{ id: 'originality:expression-isolated', description: 'Code, assets, names, text, UI, audio and tuning are original.', verifier: 'human', required: true }],
    passCriteria: ['only generic mechanics are reused', 'all expression fields are original', 'unknowns are zero'], failureRoute: { stage: 'ORIGINALITY_REVIEW', classes: ['rights', 'compliance', 'unknown'], rationale: 'Originality or licensing uncertainty must be resolved by the reviewer.' }, maxAttempts: 1, contextBudgetChars: 12_000, approvalRequired: false, idempotencyKey: 'run:{runId}:originality:{blueprintHash}',
  },
  FULL_BUILD: {
    stage: 'FULL_BUILD', purpose: 'Integrate the locked design, UI and assets into the isolated generated workspace.', ownerRole: 'BuilderAgent', allowedModelTiers: ['builder'], mutationScope: 'game-workspace',
    inputs: [{ path: 'artifacts/game-blueprint.json', schema: 'GameBlueprintSchema', required: true, trust: 'trusted' }, { path: 'artifacts/production-line-contract.json', schema: 'ProductionLineContractSchema', required: true, trust: 'human-attested' }, { path: 'artifacts/experience-hypothesis.json', schema: 'ExperienceHypothesisSchema', required: true, trust: 'generated' }, { path: 'artifacts/core-spec-lock.json', schema: 'CoreSpecLockSchema', required: true, trust: 'human-attested' }, { path: 'artifacts/experience-contract.json', schema: 'ExperienceContractSchema', required: true, trust: 'human-attested' }, { path: 'artifacts/product-experience-contract.json', schema: 'ProductExperienceContractSchema', required: true, trust: 'trusted' }, { path: 'artifacts/reference-fidelity-contract.json', schema: 'ReferenceFidelityContractSchema', required: false, trust: 'trusted' }, { path: 'artifacts/reference-research-resolution.json', schema: 'ReferenceResearchResolutionSchema', required: false, trust: 'trusted' }, { path: 'artifacts/reference-failure-pressure-contract.json', schema: 'FailurePressureContractSchema', required: false, trust: 'trusted' }, { path: 'artifacts/reference-level-implementation-contract.json', schema: 'ReferenceLevelImplementationContractSchema', required: false, trust: 'trusted' }, { path: 'artifacts/reference-level-runtime-data.json', schema: 'ReferenceLevelRuntimeDataSchema', required: false, trust: 'trusted' }, { path: 'artifacts/profile-experience-contract.json', schema: 'ProfileExperienceContractSchema', required: true, trust: 'generated' }, { path: 'artifacts/natural-play-plan.json', schema: 'NaturalPlayPlanSchema', required: true, trust: 'generated' }, { path: 'artifacts/content-expansion.json', schema: 'ContentExpansionPlanSchema', required: true, trust: 'generated' }, { path: 'artifacts/ui-skeleton.json', schema: 'UiSkeletonSchema', required: true, trust: 'generated' }, { path: 'artifacts/style-lock.json', schema: 'StyleLockSchema', required: true, trust: 'human-attested' }, { path: 'artifacts/asset-manifest.json', schema: 'AssetManifestSchema', required: true, trust: 'trusted' }],
    outputs: [{ path: 'artifacts/build-report.json', schema: 'BuildReportSchema', required: true, trust: 'generated' }, { path: 'artifacts/supply-chain.json', schema: 'SupplyChainManifestSchema', required: true, trust: 'generated' }, { path: 'artifacts/dependency-manifest.json', schema: 'DependencyManifestSchema', required: true, trust: 'generated' }, { path: 'artifacts/sbom.json', schema: 'SbomSchema', required: true, trust: 'generated' }, { path: 'artifacts/build-provenance.json', schema: 'BuildProvenanceSchema', required: true, trust: 'generated' }, { path: 'workspace/game/dist/', schema: 'build-output', required: true, trust: 'generated' }],
    // The test/typecheck evidence ids accept either strength via `|`:
    // full-mode providers produce build:tests / build:typecheck, while
    // contract-mode (mock/stub) providers only produce the lightweight
    // :contract variants. evaluateStageEvidence treats `|` as any-of.
    evidenceRequired: [{ id: 'build:tests|build:tests:contract', description: 'Core tests pass in the generated workspace (full mode), or the workspace passed contract-level checks (contract mode).', verifier: 'deterministic', required: true }, { id: 'build:typecheck|build:typecheck:contract', description: 'Generated workspace typecheck passes (full mode), or the workspace passed contract-level checks (contract mode).', verifier: 'deterministic', required: true }, { id: 'build:dist', description: 'Production web-lite build exists.', verifier: 'deterministic', required: true }],
    passCriteria: ['only current run workspace is mutated', 'tests, typecheck and build pass'], failureRoute: { stage: 'FULL_BUILD', classes: ['build', 'core_experience'], rationale: 'Builder owns integration failures.' }, maxAttempts: 2, contextBudgetChars: 48_000, approvalRequired: false, idempotencyKey: 'run:{runId}:build:{blueprintHash}:{styleHash}:{assetHash}',
  },
  RELEASE: {
    stage: 'RELEASE', purpose: 'Package exactly the tested immutable candidate after every configured quality and operating gate passes.', ownerRole: 'ReleaseAgent', allowedModelTiers: ['frontier', 'reviewer'], mutationScope: 'release-artifacts-only',
    inputs: [{ path: 'artifacts/qa-report.json', schema: 'QaReportSchema', required: true, trust: 'generated' }, { path: 'artifacts/quality-gate-matrix.json', schema: 'QualityGateMatrixSchema', required: true, trust: 'generated' }, { path: 'artifacts/runtime-product-gates.json', schema: 'RuntimeProductGateSchema', required: false, trust: 'generated' }, { path: 'artifacts/completion-gates.json', schema: 'CompletionGateReportSchema', required: false, trust: 'generated' }, { path: 'artifacts/quality-baseline.json', schema: 'QualityBaselineReportSchema', required: false, trust: 'generated' }, { path: 'artifacts/originality-declaration.json', schema: 'OriginalityDeclarationSchema', required: false, trust: 'human-attested' }, { path: 'artifacts/platform-release-matrix.json', schema: 'PlatformReleaseMatrixSchema', required: false, trust: 'human-attested' }, { path: 'artifacts/business-preflight.json', schema: 'BusinessPreflightSchema', required: false, trust: 'human-attested' }],
    outputs: [{ path: 'artifacts/release-candidate.json', schema: 'ReleaseCandidateSchema', required: true, trust: 'generated' }, { path: 'release-candidate/release-manifest.json', schema: 'ReleaseManifestSchema', required: true, trust: 'generated' }],
    evidenceRequired: [{ id: 'release:five-gates', description: 'Core, normal flow, visual, variation and human playtest gates pass.', verifier: 'human', required: true }, { id: 'release:platform-children', description: 'Every selected platform child is independently ready.', verifier: 'independent-agent', required: true }, { id: 'release:hashes', description: 'The candidate records hashes for all shipped files.', verifier: 'deterministic', required: true }],
    passCriteria: ['no blocking unknowns', 'all platform children ready or released', 'candidate hashes exactly tested files'], failureRoute: { stage: 'RELEASE', classes: ['rights', 'compliance', 'platform', 'qa'], rationale: 'Release must block and request the owning gate evidence; it must never silently patch the game.' }, maxAttempts: 2, contextBudgetChars: 24_000, approvalRequired: true, idempotencyKey: 'run:{runId}:release:{coreHash}:{platformHash}:{acceptanceHash}',
  },
};

/**
 * Contracts for orchestration-only gates and specialist lines.  These stages
 * do not all run in the default fast lane, but keeping their boundaries
 * explicit prevents a future line from silently inheriting the generic state
 * persistence contract.
 */
const supplementalContract = (input: {
  stage: string;
  purpose: string;
  ownerRole: ContractSeed['ownerRole'];
  allowedModelTiers: ContractSeed['allowedModelTiers'];
  mutationScope: ContractSeed['mutationScope'];
  inputs: ArtifactSeed[];
  outputs: ArtifactSeed[];
  evidenceRequired: ContractSeed['evidenceRequired'];
  passCriteria: string[];
  failureRoute: ContractSeed['failureRoute'];
  maxAttempts?: number;
  contextBudgetChars?: number;
  approvalRequired?: boolean;
  idempotencyKey?: string;
}): ContractSeed => ({
  ...input,
  maxAttempts: input.maxAttempts ?? 1,
  contextBudgetChars: input.contextBudgetChars ?? 12_000,
  approvalRequired: input.approvalRequired ?? false,
  idempotencyKey: input.idempotencyKey ?? `run:{runId}:stage:${input.stage}:attempt:{attempt}`,
});

Object.assign(definitions, {
  REFERENCE_MECHANIC_LOCK: supplementalContract({
    stage: 'REFERENCE_MECHANIC_LOCK', purpose: 'Lock generic mechanic relationships after research while isolating all expression.', ownerRole: 'HumanReviewer', allowedModelTiers: ['frontier', 'reviewer'], mutationScope: 'run-metadata',
    inputs: [{ path: 'input/seed.yaml', schema: 'SeedSchema', required: true, trust: 'trusted' }, { path: 'artifacts/reference-evidence-pack.json', schema: 'ReferenceEvidencePackSchema', required: false, trust: 'generated' }],
    outputs: [{ path: 'artifacts/reference-mechanic-spec.json', schema: 'ReferenceMechanicSpecSchema', required: true, trust: 'human-attested' }],
    evidenceRequired: [{ id: 'locked-by:human', description: 'The mechanic relationship is explicitly human locked.', verifier: 'human', required: true }, { id: 'expression-isolation:true', description: 'Expression fields remain original.', verifier: 'human', required: true }],
    passCriteria: ['only generic mechanic relationships are retained', 'expression is not copied'], failureRoute: { stage: 'REFERENCE_MECHANIC_LOCK', classes: ['rights', 'core_experience'], rationale: 'Reference lock ambiguity must be resolved before design.' }, approvalRequired: true, idempotencyKey: 'run:{runId}:reference-lock:{sourceHash}',
  }),
  WAITING_FOR_REFERENCE_APPROVAL: supplementalContract({
    stage: 'WAITING_FOR_REFERENCE_APPROVAL', purpose: 'Pause until the owner approves or rejects the researched mechanic lock.', ownerRole: 'HumanReviewer', allowedModelTiers: ['reviewer'], mutationScope: 'run-metadata',
    inputs: [{ path: 'artifacts/reference-mechanic-spec.json', schema: 'ReferenceMechanicSpecSchema', required: true, trust: 'human-attested' }], outputs: [{ path: 'human/reference-mechanic-review.json', schema: 'ReferenceMechanicReviewSchema', required: true, trust: 'generated' }, { path: 'human/reference-decision.yaml', schema: 'HumanReferenceDecisionSchema', required: true, trust: 'human-attested' }],
    evidenceRequired: [{ id: 'human/reference-decision.example.yaml', description: 'A machine-readable approval template is available.', verifier: 'deterministic', required: true }], passCriteria: ['the run cannot continue without an explicit decision'], failureRoute: { stage: 'REFERENCE_MECHANIC_LOCK', classes: ['core_experience', 'rights'], rationale: 'Human reference approval is the owner gate.' }, approvalRequired: true, idempotencyKey: 'run:{runId}:reference-approval:{mechanicHash}',
  }),
  IDEA_GENERATION: supplementalContract({ stage: 'IDEA_GENERATION', purpose: 'Generate bounded original ideas from validated observations and their provenance audit.', ownerRole: 'ProducerAgent', allowedModelTiers: ['frontier', 'reviewer'], mutationScope: 'design-artifacts-only', inputs: [{ path: 'input/seed.yaml', schema: 'SeedSchema', required: true, trust: 'trusted' }, { path: 'artifacts/competitor-research.json', schema: 'CompetitorResearchSchema', required: true, trust: 'generated' }, { path: 'artifacts/competitor-research-evidence.json', schema: 'CompetitorResearchEvidenceReportSchema', required: true, trust: 'generated' }], outputs: [{ path: 'artifacts/idea-generation.batch-{batch}.json', schema: 'IdeaGenerationSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'zod:IdeaGenerationSchema', description: 'The idea batch is schema-valid and original.', verifier: 'deterministic', required: true }, { id: 'research:evidence-consumed', description: 'The producer received the research boundary report rather than raw external content.', verifier: 'deterministic', required: true }], passCriteria: ['ideas remain bounded and original', 'only filtered research artifacts reach the producer'], failureRoute: { stage: 'COMPETITOR_RESEARCH', classes: ['core_experience', 'unknown'], rationale: 'Idea ambiguity returns to research/producer.' }, maxAttempts: 2, contextBudgetChars: 24_000, idempotencyKey: 'run:{runId}:ideas:{batch}:{inputHash}' }),
  LOW_COST_FILTER: supplementalContract({ stage: 'LOW_COST_FILTER', purpose: 'Filter ideas against the one-person prototype budget.', ownerRole: 'ProducerAgent', allowedModelTiers: ['reviewer', 'fast'], mutationScope: 'design-artifacts-only', inputs: [{ path: 'artifacts/idea-generation.batch-{batch}.json', schema: 'IdeaGenerationSchema', required: true, trust: 'generated' }], outputs: [{ path: 'artifacts/low-cost-filter.batch-{batch}.json', schema: 'LowCostFilterSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'zod:LowCostFilterSchema', description: 'Cost verdicts are explicit for every idea.', verifier: 'deterministic', required: true }], passCriteria: ['only bounded ideas proceed'], failureRoute: { stage: 'LOW_COST_FILTER', classes: ['build', 'core_experience'], rationale: 'Cost scope belongs to the production reviewer.' }, maxAttempts: 2, contextBudgetChars: 16_000, idempotencyKey: 'run:{runId}:cost-filter:{batch}:{inputHash}' }),
  PROTOTYPE_SELECTION: supplementalContract({ stage: 'PROTOTYPE_SELECTION', purpose: 'Select exactly the ideas allowed into disposable prototypes.', ownerRole: 'ProducerAgent', allowedModelTiers: ['frontier', 'reviewer'], mutationScope: 'design-artifacts-only', inputs: [{ path: 'artifacts/idea-generation.batch-{batch}.json', schema: 'IdeaGenerationSchema', required: true, trust: 'generated' }, { path: 'artifacts/low-cost-filter.batch-{batch}.json', schema: 'LowCostFilterSchema', required: true, trust: 'generated' }], outputs: [{ path: 'artifacts/prototype-selection.batch-{batch}.json', schema: 'PrototypeSelectionSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'zod:PrototypeSelectionSchema', description: 'Prototype scope is explicit and disposable.', verifier: 'deterministic', required: true }], passCriteria: ['selection does not imply production approval'], failureRoute: { stage: 'PROTOTYPE_SELECTION', classes: ['core_experience', 'build'], rationale: 'Prototype scope is a producer decision.' }, maxAttempts: 2, contextBudgetChars: 16_000, idempotencyKey: 'run:{runId}:prototype-selection:{batch}:{inputHash}' }),
  PLAYTEST_TOURNAMENT: supplementalContract({ stage: 'PLAYTEST_TOURNAMENT', purpose: 'Compare disposable prototypes using independent play evidence.', ownerRole: 'QAAgent', allowedModelTiers: ['reviewer'], mutationScope: 'qa-artifacts-only', inputs: [{ path: 'artifacts/prototype-build-report.batch-{batch}.json', schema: 'PrototypeBuildReportSchema', required: true, trust: 'generated' }], outputs: [{ path: 'artifacts/playtest-tournament.batch-{batch}.json', schema: 'PlaytestTournamentSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'zod:PlaytestTournamentSchema', description: 'All selected prototypes have comparable play evidence.', verifier: 'independent-agent', required: true }], passCriteria: ['the author is not the sole evaluator'], failureRoute: { stage: 'BUILD_3_PROTOTYPES', classes: ['qa', 'core_experience'], rationale: 'Tournament failures return to prototype build or QA.' }, maxAttempts: 2, contextBudgetChars: 24_000, idempotencyKey: 'run:{runId}:tournament:{batch}:{inputHash}' }),
  WINNER_SELECTION: supplementalContract({ stage: 'WINNER_SELECTION', purpose: 'Select a prototype only when independent evidence supports it.', ownerRole: 'ProducerAgent', allowedModelTiers: ['frontier', 'reviewer'], mutationScope: 'design-artifacts-only', inputs: [{ path: 'artifacts/playtest-tournament.batch-{batch}.json', schema: 'PlaytestTournamentSchema', required: true, trust: 'generated' }], outputs: [{ path: 'artifacts/winner-selection.batch-{batch}.json', schema: 'WinnerSelectionSchema', required: true, trust: 'generated' }], evidenceRequired: [{ id: 'zod:WinnerSelectionSchema', description: 'Winner or no-winner decision is explicit.', verifier: 'deterministic', required: true }], passCriteria: ['no winner is forced when evidence is insufficient'], failureRoute: { stage: 'PLAYTEST_TOURNAMENT', classes: ['core_experience', 'qa'], rationale: 'Winner decisions return to the independent tournament.' }, maxAttempts: 2, contextBudgetChars: 16_000, idempotencyKey: 'run:{runId}:winner:{batch}:{inputHash}' }),
  WAITING_FOR_PROTOTYPE_APPROVAL: supplementalContract({ stage: 'WAITING_FOR_PROTOTYPE_APPROVAL', purpose: 'Pause until the owner approves a prototype for production.', ownerRole: 'HumanReviewer', allowedModelTiers: ['reviewer'], mutationScope: 'run-metadata', inputs: [{ path: 'artifacts/winner-selection.batch-{batch}.json', schema: 'WinnerSelectionSchema', required: true, trust: 'generated' }], outputs: [{ path: 'human/prototype-review.json', schema: 'PrototypeHumanReviewSchema', required: true, trust: 'generated' }, { path: 'human/prototype-decision.yaml', schema: 'HumanPrototypeDecisionSchema', required: true, trust: 'human-attested' }], evidenceRequired: [{ id: 'human/prototype-decision.example.yaml', description: 'An explicit production decision is requested.', verifier: 'human', required: true }], passCriteria: ['prototype approval cannot be inferred from a model recommendation'], failureRoute: { stage: 'WINNER_SELECTION', classes: ['core_experience'], rationale: 'Prototype approval belongs to the owner.' }, approvalRequired: true, idempotencyKey: 'run:{runId}:prototype-approval:{batch}:{winnerHash}' }),
  WAITING_FOR_ART_APPROVAL: supplementalContract({ stage: 'WAITING_FOR_ART_APPROVAL', purpose: 'Pause until the owner selects one visual direction.', ownerRole: 'HumanReviewer', allowedModelTiers: ['reviewer'], mutationScope: 'run-metadata', inputs: [{ path: 'artifacts/art-directions.json', schema: 'ArtDirectionsSchema', required: true, trust: 'generated' }, { path: 'art-review/index.html', schema: 'review-page', required: true, trust: 'generated' }], outputs: [{ path: 'human/art-approval.yaml', schema: 'ArtApprovalSchema', required: true, trust: 'human-attested' }], evidenceRequired: [{ id: 'human/art-approval.example.yaml', description: 'A visual approval template is available.', verifier: 'human', required: true }], passCriteria: ['the selected direction is explicit'], failureRoute: { stage: 'ART_DIRECTIONS', classes: ['rights', 'core_experience'], rationale: 'Visual selection belongs to the owner.' }, approvalRequired: true, idempotencyKey: 'run:{runId}:art-approval:{directionsHash}' }),
  STYLE_LOCK: supplementalContract({ stage: 'STYLE_LOCK', purpose: 'Merge one human visual approval into an immutable style lock.', ownerRole: 'ProducerAgent', allowedModelTiers: ['frontier', 'reviewer'], mutationScope: 'design-artifacts-only', inputs: [{ path: 'artifacts/game-blueprint.json', schema: 'GameBlueprintSchema', required: true, trust: 'trusted' }, { path: 'artifacts/art-directions.json', schema: 'ArtDirectionsSchema', required: true, trust: 'generated' }, { path: 'human/art-approval.yaml', schema: 'ArtApprovalSchema', required: true, trust: 'human-attested' }], outputs: [{ path: 'artifacts/style-lock.json', schema: 'StyleLockSchema', required: true, trust: 'human-attested' }], evidenceRequired: [{ id: 'zod:StyleLockSchema', description: 'The selected direction and changes are schema-valid.', verifier: 'deterministic', required: true }], passCriteria: ['style lock cannot be changed by downstream Builder'], failureRoute: { stage: 'STYLE_LOCK', classes: ['rights', 'build'], rationale: 'Style provenance belongs to the style-lock stage.' }, maxAttempts: 2, contextBudgetChars: 20_000, idempotencyKey: 'run:{runId}:style-lock:{approvalHash}' }),
  WAITING_FOR_HUMAN_PLAYTEST: supplementalContract({ stage: 'WAITING_FOR_HUMAN_PLAYTEST', purpose: 'Pause until the owner plays the immutable candidate from a clean reset.', ownerRole: 'HumanReviewer', allowedModelTiers: ['reviewer'], mutationScope: 'run-metadata', inputs: [{ path: 'artifacts/release-candidate.json', schema: 'ReleaseCandidateSchema', required: false, trust: 'generated' }, { path: 'artifacts/build-report.json', schema: 'BuildReportSchema', required: false, trust: 'generated' }, { path: 'artifacts/reference-fidelity-gate.json', schema: 'ReferenceFidelityGateSchema', required: false, trust: 'generated' }], outputs: [{ path: 'human/playtest-acceptance.json', schema: 'HumanPlaytestAcceptanceSchema', required: true, trust: 'human-attested' }], evidenceRequired: [{ id: 'human:final-playtest-required|human:core-demo-playtest-required', description: 'The release candidate or bounded core demo needs an explicit human playtest.', verifier: 'human', required: true }], passCriteria: ['acceptance is bound to the exact candidate or core-demo build hash'], failureRoute: { stage: 'RELEASE_CANDIDATE', classes: ['core_experience', 'qa'], rationale: 'Final playtest is a human gate.' }, approvalRequired: true, idempotencyKey: 'run:{runId}:human-playtest:{candidateHash}:{buildHash}' }),
  ACCEPTANCE_REVIEW: supplementalContract({ stage: 'ACCEPTANCE_REVIEW', purpose: 'Review unresolved quality gates before release is retried.', ownerRole: 'HumanReviewer', allowedModelTiers: ['reviewer'], mutationScope: 'run-metadata', inputs: [{ path: 'artifacts/completion-gates.json', schema: 'CompletionGateReportSchema', required: true, trust: 'generated' }, { path: 'artifacts/quality-gate-matrix.json', schema: 'QualityGateMatrixSchema', required: true, trust: 'generated' }, { path: 'artifacts/constitution-evaluation.json', schema: 'ConstitutionEvaluationSchema', required: false, trust: 'generated' }], outputs: [{ path: 'artifacts/acceptance-review.json', schema: 'AcceptanceReviewSchema', required: false, trust: 'human-attested' }], evidenceRequired: [{ id: 'acceptance:review-required', description: 'The owner sees the exact blocked dimensions.', verifier: 'human', required: true }], passCriteria: ['blocked dimensions are not waived implicitly'], failureRoute: { stage: 'ACCEPTANCE_REVIEW', classes: ['qa', 'unknown'], rationale: 'Acceptance exceptions require the owner.' }, approvalRequired: true, idempotencyKey: 'run:{runId}:acceptance-review:{completionHash}' }),
});

const specialistContract = (stage: string, ownerRole: ContractSeed['ownerRole'], purpose: string, inputPath: string, outputPath: string, evidenceId: string, failureStage: string): ContractSeed => supplementalContract({ stage, purpose, ownerRole, allowedModelTiers: ownerRole === 'BuilderAgent' ? ['builder'] : ownerRole === 'QAAgent' ? ['reviewer'] : ['frontier', 'reviewer'], mutationScope: ownerRole === 'BuilderAgent' ? 'game-workspace' : ownerRole === 'QAAgent' ? 'qa-artifacts-only' : 'design-artifacts-only', inputs: [{ path: inputPath, schema: 'profile-contract', required: true, trust: 'trusted' }], outputs: [{ path: outputPath, schema: 'profile-stage-artifact', required: true, trust: 'generated' }], evidenceRequired: [{ id: evidenceId, description: `Evidence for ${stage} is attributable to its owner.`, verifier: ownerRole === 'QAAgent' ? 'independent-agent' : 'deterministic', required: true }], passCriteria: ['the profile-specific dimension is explicit', 'the stage cannot silently fall back to a generic idle oracle'], failureRoute: { stage: failureStage, classes: ['core_experience', 'qa'], rationale: `Profile-specific failures return to ${failureStage}.` }, maxAttempts: 2, contextBudgetChars: ownerRole === 'BuilderAgent' ? 32_000 : 20_000, idempotencyKey: `run:{runId}:${stage.toLowerCase()}:{inputHash}` });

Object.assign(definitions, {
  FEEL_PROTOTYPE: specialistContract('FEEL_PROTOTYPE', 'BuilderAgent', 'Build the smallest action-feel slice.', 'artifacts/core-spec-lock.json', 'artifacts/feel-prototype-report.json', 'feel:prototype-playable', 'FULL_BUILD'),
  NATURAL_PLAY_QA: specialistContract('NATURAL_PLAY_QA', 'QAAgent', 'Verify action-feel with natural input.', 'artifacts/feel-prototype-report.json', 'artifacts/natural-play-qa.json', 'feel:natural-input', 'FEEL_PROTOTYPE'),
  EXPERIENCE_REVIEW: specialistContract('EXPERIENCE_REVIEW', 'QAAgent', 'Review action-feel evidence against the frozen contract.', 'artifacts/natural-play-qa.json', 'artifacts/experience-review.json', 'experience:profile-review', 'FEEL_PROTOTYPE'),
  NARRATIVE_CONTRACT: specialistContract('NARRATIVE_CONTRACT', 'ProducerAgent', 'Define the narrative agency contract.', 'artifacts/core-spec-lock.json', 'artifacts/narrative-contract.json', 'narrative:contract', 'BLUEPRINT'),
  STORY_VERTICAL_SLICE: specialistContract('STORY_VERTICAL_SLICE', 'BuilderAgent', 'Build a representative branching story slice.', 'artifacts/narrative-contract.json', 'artifacts/story-vertical-slice.json', 'narrative:vertical-slice', 'NARRATIVE_CONTRACT'),
  CHOICE_CONSEQUENCE_QA: specialistContract('CHOICE_CONSEQUENCE_QA', 'QAAgent', 'Verify immediate and delayed choice consequences.', 'artifacts/story-vertical-slice.json', 'artifacts/choice-consequence-qa.json', 'narrative:consequence', 'STORY_VERTICAL_SLICE'),
  NARRATIVE_REVIEW: specialistContract('NARRATIVE_REVIEW', 'QAAgent', 'Review narrative agency evidence.', 'artifacts/choice-consequence-qa.json', 'artifacts/narrative-review.json', 'narrative:review', 'NARRATIVE_CONTRACT'),
  REPLAY_VALUE_QA: specialistContract('REPLAY_VALUE_QA', 'QAAgent', 'Verify alternate replay value.', 'artifacts/narrative-review.json', 'artifacts/replay-value-qa.json', 'narrative:replay', 'NARRATIVE_REVIEW'),
  SYSTEMS_CONTRACT: specialistContract('SYSTEMS_CONTRACT', 'ProducerAgent', 'Define strategic resource and progression rules.', 'artifacts/core-spec-lock.json', 'artifacts/systems-contract.json', 'systems:contract', 'BLUEPRINT'),
  SYSTEMS_PROTOTYPE: specialistContract('SYSTEMS_PROTOTYPE', 'BuilderAgent', 'Build a representative systems slice.', 'artifacts/systems-contract.json', 'artifacts/systems-prototype.json', 'systems:prototype', 'SYSTEMS_CONTRACT'),
  STRATEGY_QA: specialistContract('STRATEGY_QA', 'QAAgent', 'Verify resource trade-offs and attribution.', 'artifacts/systems-prototype.json', 'artifacts/strategy-qa.json', 'systems:tradeoff', 'SYSTEMS_PROTOTYPE'),
  PROGRESSION_REVIEW: specialistContract('PROGRESSION_REVIEW', 'QAAgent', 'Review progression pacing and recovery.', 'artifacts/strategy-qa.json', 'artifacts/progression-review.json', 'systems:progression', 'SYSTEMS_CONTRACT'),
  PUZZLE_CONTRACT: specialistContract('PUZZLE_CONTRACT', 'ProducerAgent', 'Define rule discovery and fairness.', 'artifacts/core-spec-lock.json', 'artifacts/puzzle-contract.json', 'puzzle:contract', 'BLUEPRINT'),
  PUZZLE_PROTOTYPE: specialistContract('PUZZLE_PROTOTYPE', 'BuilderAgent', 'Build a representative puzzle slice.', 'artifacts/puzzle-contract.json', 'artifacts/puzzle-prototype.json', 'puzzle:prototype', 'PUZZLE_CONTRACT'),
  PUZZLE_FAIRNESS_QA: specialistContract('PUZZLE_FAIRNESS_QA', 'QAAgent', 'Verify observable rules and fair errors.', 'artifacts/puzzle-prototype.json', 'artifacts/puzzle-fairness-qa.json', 'puzzle:fairness', 'PUZZLE_PROTOTYPE'),
  PUZZLE_REVIEW: specialistContract('PUZZLE_REVIEW', 'QAAgent', 'Review puzzle clarity and variant validity.', 'artifacts/puzzle-fairness-qa.json', 'artifacts/puzzle-review.json', 'puzzle:review', 'PUZZLE_CONTRACT'),
});

/** Lifecycle and terminal records are control-plane products too.  Keeping
 * them explicit prevents a launch/abandon/complete transition from becoming
 * an un-audited state mutation, while still allowing the fast lane to retain
 * the same durable evidence shape. */
Object.assign(definitions, {
  LAUNCH_METRICS: supplementalContract({
    stage: 'LAUNCH_METRICS',
    purpose: 'Record bounded launch metrics and a hash-bound market disposition.',
    ownerRole: 'ReleaseAgent',
    allowedModelTiers: ['reviewer', 'frontier'],
    mutationScope: 'release-artifacts-only',
    inputs: [{ path: 'artifacts/release-candidate.json', schema: 'ReleaseCandidateSchema', required: true, trust: 'generated' }],
    outputs: [{ path: 'artifacts/launch-metrics/*', schema: 'LaunchMetricSnapshotSchema', required: true, trust: 'generated' }, { path: 'artifacts/launch-decision-*.json', schema: 'LaunchDecisionSchema', required: true, trust: 'generated' }],
    evidenceRequired: [{ id: 'launch:decision', description: 'The market decision is derived from observed metrics and the tested release hash.', verifier: 'deterministic', required: true }],
    passCriteria: ['metrics are hash-bound', 'paid traffic remains capped', 'a kill decision is terminal'],
    failureRoute: { stage: 'LIVE_MONITORING', classes: ['growth', 'platform', 'unknown'], rationale: 'Market evidence belongs to the launch loop and must not patch gameplay silently.' },
    maxAttempts: 1,
    contextBudgetChars: 12_000,
    idempotencyKey: 'run:{runId}:launch:{platform}:{releaseHash}',
  }),
  LIVE_MONITORING: supplementalContract({
    stage: 'LIVE_MONITORING',
    purpose: 'Pause or continue a shipped candidate while live verification evidence is collected.',
    ownerRole: 'ReleaseAgent',
    allowedModelTiers: ['reviewer', 'frontier'],
    mutationScope: 'release-artifacts-only',
    inputs: [{ path: 'artifacts/release-candidate.json', schema: 'ReleaseCandidateSchema', required: true, trust: 'generated' }, { path: 'artifacts/launch-metrics/*', schema: 'LaunchMetricSnapshotSchema', required: false, trust: 'generated' }],
    outputs: [{ path: 'artifacts/live-verification/*', schema: 'LiveVerificationSchema', required: false, trust: 'human-attested' }],
    evidenceRequired: [{ id: 'live:monitoring', description: 'The candidate remains bound to its submitted hash while blockers are tracked.', verifier: 'deterministic', required: true }],
    passCriteria: ['monitoring never rewrites the submitted candidate', 'unverified live state remains visible'],
    failureRoute: { stage: 'LIVE_MONITORING', classes: ['platform', 'qa', 'growth'], rationale: 'Live monitoring owns post-submission uncertainty.' },
    maxAttempts: 1,
    contextBudgetChars: 12_000,
    idempotencyKey: 'run:{runId}:monitor:{platform}:{releaseHash}',
  }),
  ABANDONED: supplementalContract({
    stage: 'ABANDONED',
    purpose: 'Record an explicit, bounded decision to stop a run.',
    ownerRole: 'HumanReviewer',
    allowedModelTiers: ['reviewer'],
    mutationScope: 'run-metadata',
    inputs: [{ path: 'state.json', schema: 'RunStateSchema', required: true, trust: 'trusted' }],
    outputs: [{ path: 'artifacts/abandonment-decision.json', schema: 'AbandonmentDecisionSchema', required: true, trust: 'human-attested' }],
    evidenceRequired: [{ id: 'abandonment:decision', description: 'The stop reason and cost/quality evidence are recorded.', verifier: 'human', required: true }],
    passCriteria: ['the run is terminal and cannot resume as a release', 'the reason is attributable'],
    failureRoute: { stage: 'ABANDONED', classes: ['unknown'], rationale: 'Abandonment is a terminal control-plane decision.' },
    maxAttempts: 1,
    contextBudgetChars: 8_000,
    idempotencyKey: 'run:{runId}:abandon:{reason}',
  }),
  COMPLETED: supplementalContract({
    stage: 'COMPLETED',
    purpose: 'Record that an immutable candidate passed every configured release gate.',
    ownerRole: 'ReleaseAgent',
    allowedModelTiers: ['reviewer', 'frontier'],
    mutationScope: 'run-metadata',
    inputs: [{ path: 'release-candidate/release-manifest.json', schema: 'ReleaseManifestSchema', required: true, trust: 'generated' }],
    outputs: [{ path: 'release-candidate/release-manifest.json', schema: 'ReleaseManifestSchema', required: true, trust: 'generated' }],
    evidenceRequired: [{ id: 'pipeline:complete', description: 'The immutable release candidate is the final run output.', verifier: 'deterministic', required: true }],
    passCriteria: ['no release gate remains unknown', 'the final output is hash-addressable'],
    failureRoute: { stage: 'RELEASE', classes: ['qa', 'rights', 'platform'], rationale: 'Completion cannot mask a release failure.' },
    maxAttempts: 1,
    contextBudgetChars: 8_000,
    idempotencyKey: 'run:{runId}:complete:{releaseHash}',
  }),
  NOT_GREENLIT: supplementalContract({
    stage: 'NOT_GREENLIT',
    purpose: 'Record a bounded decision not to spend further production resources.',
    ownerRole: 'HumanReviewer',
    allowedModelTiers: ['reviewer'],
    mutationScope: 'run-metadata',
    inputs: [{ path: 'artifacts/business-preflight.json', schema: 'BusinessPreflightSchema', required: false, trust: 'human-attested' }, { path: 'artifacts/cost-gate.json', schema: 'CostGateReportSchema', required: false, trust: 'generated' }],
    outputs: [{ path: 'state.json', schema: 'RunStateSchema', required: true, trust: 'trusted' }],
    evidenceRequired: [{ id: 'business:not-greenlit', description: 'The reason for stopping before production is explicit.', verifier: 'human', required: true }],
    passCriteria: ['no downstream build or release is attempted'],
    failureRoute: { stage: 'BUSINESS_PREFLIGHT', classes: ['compliance', 'unknown'], rationale: 'Greenlight decisions belong to the business gate.' },
    maxAttempts: 1,
    contextBudgetChars: 8_000,
    idempotencyKey: 'run:{runId}:not-greenlit:{reason}',
  }),
  NO_PROTOTYPE_WINNER: supplementalContract({
    stage: 'NO_PROTOTYPE_WINNER',
    purpose: 'Record that bounded prototype batches produced no viable winner.',
    ownerRole: 'QAAgent',
    allowedModelTiers: ['reviewer'],
    mutationScope: 'qa-artifacts-only',
    inputs: [{ path: 'artifacts/winner-selection.batch-{batch}.json', schema: 'WinnerSelectionSchema', required: true, trust: 'generated' }],
    outputs: [{ path: 'state.json', schema: 'RunStateSchema', required: true, trust: 'trusted' }],
    evidenceRequired: [{ id: 'winner:none', description: 'The final bounded tournament explicitly found no winner.', verifier: 'independent-agent', required: true }],
    passCriteria: ['the factory stops instead of forcing a weak concept'],
    failureRoute: { stage: 'PLAYTEST_TOURNAMENT', classes: ['core_experience', 'qa'], rationale: 'No-winner outcomes return to research or a new run.' },
    maxAttempts: 1,
    contextBudgetChars: 8_000,
    idempotencyKey: 'run:{runId}:no-winner:{batch}',
  }),
  DESIGN_REJECTED: supplementalContract({
    stage: 'DESIGN_REJECTED',
    purpose: 'Record a human rejection before mutating production work.',
    ownerRole: 'HumanReviewer',
    allowedModelTiers: ['reviewer'],
    mutationScope: 'run-metadata',
    inputs: [{ path: 'human/reference-decision.yaml', schema: 'HumanReferenceDecisionSchema', required: false, trust: 'human-attested' }, { path: 'human/prototype-decision.yaml', schema: 'HumanPrototypeDecisionSchema', required: false, trust: 'human-attested' }],
    outputs: [{ path: 'state.json', schema: 'RunStateSchema', required: true, trust: 'trusted' }],
    evidenceRequired: [{ id: 'design:rejected', description: 'The owner explicitly rejected the design.', verifier: 'human', required: true }],
    passCriteria: ['rejected concepts do not enter Builder'],
    failureRoute: { stage: 'DESIGN_REJECTED', classes: ['core_experience'], rationale: 'The owner owns a design rejection.' },
    maxAttempts: 1,
    contextBudgetChars: 8_000,
    idempotencyKey: 'run:{runId}:design-rejected:{decisionHash}',
  }),
  PROTOTYPE_REVISION_REQUESTED: supplementalContract({
    stage: 'PROTOTYPE_REVISION_REQUESTED',
    purpose: 'Record a bounded request to revise a disposable prototype.',
    ownerRole: 'HumanReviewer',
    allowedModelTiers: ['reviewer'],
    mutationScope: 'run-metadata',
    inputs: [{ path: 'human/prototype-decision.yaml', schema: 'HumanPrototypeDecisionSchema', required: true, trust: 'human-attested' }],
    outputs: [{ path: 'state.json', schema: 'RunStateSchema', required: true, trust: 'trusted' }],
    evidenceRequired: [{ id: 'prototype:revision-requested', description: 'Required changes are explicit and remain within prototype scope.', verifier: 'human', required: true }],
    passCriteria: ['revision does not imply production approval'],
    failureRoute: { stage: 'WINNER_SELECTION', classes: ['core_experience'], rationale: 'Prototype revision belongs to the owner/tournament loop.' },
    maxAttempts: 1,
    contextBudgetChars: 8_000,
    idempotencyKey: 'run:{runId}:prototype-revision:{decisionHash}',
  }),
  WAITING_FOR_ACTION_APPROVAL: supplementalContract({
    stage: 'WAITING_FOR_ACTION_APPROVAL',
    purpose: 'Pause until the owner selects or rejects an action-feel experiment.',
    ownerRole: 'HumanReviewer',
    allowedModelTiers: ['reviewer'],
    mutationScope: 'run-metadata',
    inputs: [{ path: 'artifacts/action-playtest-report.json', schema: 'ActionPlaytestReportSchema', required: true, trust: 'generated' }],
    outputs: [{ path: 'human/action-mechanic-review.json', schema: 'ActionMechanicReviewSchema', required: true, trust: 'generated' }, { path: 'human/action-mechanic-decision.yaml', schema: 'HumanActionMechanicDecisionSchema', required: true, trust: 'human-attested' }],
    evidenceRequired: [{ id: 'human/action-mechanic-decision.example.yaml', description: 'A machine-readable action experiment decision is requested.', verifier: 'human', required: true }],
    passCriteria: ['the decision is explicit and bounded'],
    failureRoute: { stage: 'PLAYTEST_ACTION_PROTOTYPES', classes: ['core_experience'], rationale: 'Action experiment approval belongs to the owner.' },
    maxAttempts: 1,
    contextBudgetChars: 8_000,
    idempotencyKey: 'run:{runId}:action-approval:{experimentId}',
  }),
  WAITING_FOR_CODEX_IMAGEGEN: supplementalContract({
    stage: 'WAITING_FOR_CODEX_IMAGEGEN',
    purpose: 'Pause while an external image-generation task is completed without widening factory permissions.',
    ownerRole: 'ProducerAgent',
    allowedModelTiers: ['reviewer', 'frontier'],
    mutationScope: 'design-artifacts-only',
    inputs: [{ path: 'artifacts/art-directions.json', schema: 'ArtDirectionsSchema', required: true, trust: 'generated' }],
    outputs: [{ path: 'art-review/previews/*', schema: 'image-preview', required: false, trust: 'generated' }],
    evidenceRequired: [{ id: 'imagegen:task-pending', description: 'The pending task and missing files are explicit.', verifier: 'deterministic', required: true }],
    passCriteria: ['image generation never grants game-workspace write access'],
    failureRoute: { stage: 'ART_DIRECTIONS', classes: ['build', 'rights'], rationale: 'Image task failures return to art direction.' },
    maxAttempts: 2,
    contextBudgetChars: 8_000,
    idempotencyKey: 'run:{runId}:imagegen:{directionsHash}',
  }),
  ACTION_EXPERIMENT_APPROVED: supplementalContract({
    stage: 'ACTION_EXPERIMENT_APPROVED',
    purpose: 'Record a selected action-feel variant for a later formal prototype.',
    ownerRole: 'HumanReviewer',
    allowedModelTiers: ['reviewer'],
    mutationScope: 'run-metadata',
    inputs: [{ path: 'human/action-mechanic-decision.yaml', schema: 'HumanActionMechanicDecisionSchema', required: true, trust: 'human-attested' }],
    outputs: [{ path: 'state.json', schema: 'RunStateSchema', required: true, trust: 'trusted' }],
    evidenceRequired: [{ id: 'decision:KEEP', description: 'The owner selected a variant to carry forward.', verifier: 'human', required: true }],
    passCriteria: ['the selected slot is explicit'],
    failureRoute: { stage: 'PLAYTEST_ACTION_PROTOTYPES', classes: ['core_experience'], rationale: 'Selection remains a human experiment decision.' },
    maxAttempts: 1,
    contextBudgetChars: 8_000,
    idempotencyKey: 'run:{runId}:action-approved:{experimentId}',
  }),
  ACTION_EXPERIMENT_REFACTOR: supplementalContract({
    stage: 'ACTION_EXPERIMENT_REFACTOR',
    purpose: 'Record that an action-feel experiment needs bounded changes before selection.',
    ownerRole: 'HumanReviewer',
    allowedModelTiers: ['reviewer'],
    mutationScope: 'run-metadata',
    inputs: [{ path: 'human/action-mechanic-decision.yaml', schema: 'HumanActionMechanicDecisionSchema', required: true, trust: 'human-attested' }],
    outputs: [{ path: 'state.json', schema: 'RunStateSchema', required: true, trust: 'trusted' }],
    evidenceRequired: [{ id: 'decision:REFACTOR', description: 'The owner requested explicit bounded changes.', verifier: 'human', required: true }],
    passCriteria: ['refactor does not silently alter the production workspace'],
    failureRoute: { stage: 'PLAYTEST_ACTION_PROTOTYPES', classes: ['core_experience'], rationale: 'Action experiment changes remain disposable.' },
    maxAttempts: 1,
    contextBudgetChars: 8_000,
    idempotencyKey: 'run:{runId}:action-refactor:{experimentId}',
  }),
  ACTION_EXPERIMENT_KILLED: supplementalContract({
    stage: 'ACTION_EXPERIMENT_KILLED',
    purpose: 'Record that an action-feel experiment was rejected.',
    ownerRole: 'HumanReviewer',
    allowedModelTiers: ['reviewer'],
    mutationScope: 'run-metadata',
    inputs: [{ path: 'human/action-mechanic-decision.yaml', schema: 'HumanActionMechanicDecisionSchema', required: true, trust: 'human-attested' }],
    outputs: [{ path: 'state.json', schema: 'RunStateSchema', required: true, trust: 'trusted' }],
    evidenceRequired: [{ id: 'decision:KILL', description: 'The owner explicitly killed the experiment.', verifier: 'human', required: true }],
    passCriteria: ['a killed experiment cannot be treated as production approval'],
    failureRoute: { stage: 'PLAYTEST_ACTION_PROTOTYPES', classes: ['core_experience'], rationale: 'The owner owns the experiment kill decision.' },
    maxAttempts: 1,
    contextBudgetChars: 8_000,
    idempotencyKey: 'run:{runId}:action-killed:{experimentId}',
  }),
});

// A tournament may run at most two bounded batches when no candidate wins.
// Keep this explicit even for legacy stages that still use the generic
// state-persistence contract so the second batch is not mistaken for an
// unbounded retry.
const TOURNAMENT_BATCH_STAGES = new Set(['IDEA_GENERATION', 'LOW_COST_FILTER', 'PROTOTYPE_SELECTION', 'PLAYTEST_TOURNAMENT', 'WINNER_SELECTION']);
const RETRYABLE_LEGACY_STAGES = new Set(['STYLE_LOCK']);

/** Match a recorded artifact/input path against a contract path.  Contracts
 * may use `*` for a bounded child directory and `{name}` for a run-local
 * template value (batch, hash, etc.). */
export function contractPathMatches(pattern: string, actual: string): boolean {
  const escaped = pattern.split(/(\*|\{[^}]+\})/gu).map((part) => {
    if (part === '*') return '[^/]+';
    if (/^\{[^}]+\}$/u.test(part)) return '[^/]+';
    return part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  }).join('');
  return new RegExp(`^${escaped}$`, 'u').test(actual);
}

export function getStageContract(stage: StageName | string): StageContract {
  const value = definitions[stage] ?? governanceContracts[stage] ?? (TOURNAMENT_BATCH_STAGES.has(stage) || RETRYABLE_LEGACY_STAGES.has(stage)
    ? { ...generic, stage, maxAttempts: 2, retryPolicy: { maxAttempts: 2, retryableClasses: ['capability', 'transient'], preserveOutputs: true, backoffSeconds: 0 } }
    : { ...generic, stage });
  return base(value);
}

/** True only when a stage has a bespoke contract in the registry. */
export function isStageContractExplicit(stageValue: string): boolean {
  const stage = StageNameSchema.safeParse(stageValue);
  if (!stage.success) return false;
  return Object.prototype.hasOwnProperty.call(definitions, stage.data) || Object.prototype.hasOwnProperty.call(governanceContracts, stage.data);
}

/**
 * Report contract coverage for a concrete plan. Fallback contracts remain
 * available for legacy recovery, but production can require this report to
 * have no fallback stages before any mutating work begins.
 */
export function evaluateStageContractRegistry(stages: readonly string[] = StageNameSchema.options): StageContractRegistryReport {
  const checkedStages = [...new Set(stages.map((stage) => StageNameSchema.parse(stage)))];
  const explicitStages = checkedStages.filter((stage) => isStageContractExplicit(stage));
  const fallbackStages = checkedStages.filter((stage) => !isStageContractExplicit(stage));
  return StageContractRegistryReportSchema.parse({ schemaVersion: 1, checkedStages, explicitStages, fallbackStages, passed: fallbackStages.length === 0, checkedAt: new Date().toISOString() });
}

/** Ensure the model selected for a stage is one of the tiers the contract
 * explicitly permits.  This catches drift between routing tables and stage
 * ownership before a provider call is made. */
export function validateStageModelTier(contractValue: StageContract, tier: StageContract['allowedModelTiers'][number]) {
  const contract = StageContractSchema.parse(contractValue);
  const passed = contract.allowedModelTiers.includes(tier);
  return { passed, blockers: passed ? [] : [`model-tier-not-allowed:${contract.stage}:${tier}`] };
}

/**
 * Check the separation-of-duties declaration for a stage.  The control plane
 * may verify its own deterministic state bookkeeping, but a role that creates
 * gameplay, QA, release, or research evidence may never also be the declared
 * verifier for that same stage.  Callers can provide the actual verifier role
 * when a human or a separate agent performed the check; otherwise the
 * contract's declared verifier is used for backwards-compatible audits.
 */
export function evaluateVerifierSeparation(contractValue: StageContract, verifiedByRoleValue?: StageRole | string) {
  const contract = StageContractSchema.parse(contractValue);
  const parsedActual = verifiedByRoleValue === undefined
    ? contract.verifierRole
    : StageRoleSchema.safeParse(verifiedByRoleValue).success
      ? StageRoleSchema.parse(verifiedByRoleValue)
      : undefined;
  const blockers: string[] = [];
  if (!parsedActual) blockers.push('verifier-role-invalid');
  if (contract.ownerRole !== 'FactoryControlPlane' && contract.ownerRole === contract.verifierRole) {
    blockers.push(`self-acceptance:${contract.ownerRole}`);
  }
  if (parsedActual && contract.ownerRole !== 'FactoryControlPlane' && parsedActual === contract.ownerRole) {
    blockers.push(`self-acceptance:${parsedActual}`);
  }
  if (parsedActual && parsedActual !== contract.verifierRole) blockers.push('verifier-role-mismatch');
  return {
    passed: blockers.length === 0,
    blockers: [...new Set(blockers)],
    ownerRole: contract.ownerRole,
    verifierRole: contract.verifierRole,
    verifiedByRole: parsedActual,
    independent: Boolean(parsedActual && (contract.ownerRole === 'FactoryControlPlane' || parsedActual !== contract.ownerRole)),
  };
}

export function evaluateStageEvidence(contractValue: StageContract, observed: { artifacts: string[]; evidence: string[]; inputs?: string[]; artifactVersions?: Record<string, number> }): StageEvidenceResult {
  const contract = StageContractSchema.parse(contractValue);
  const requiredArtifacts = contract.outputs.filter((item) => item.required).map((item) => item.path);
  const requiredEvidence = contract.evidenceRequired.filter((item) => item.required).map((item) => item.id);
  // Input checks are opt-in for backwards compatibility with older stage
  // records that only persisted outputs. New callers should provide inputs so
  // a contract cannot be considered complete with a missing prerequisite.
  const requiredInputs = contract.inputs.filter((item) => item.required).map((item) => item.path);
  const missingInputs = observed.inputs ? requiredInputs.filter((item) => !observed.inputs!.some((actual) => contractPathMatches(item, actual))) : [];
  const versions = observed.artifactVersions ?? {};
  const missingVersions = Object.entries(versions).filter(([, version]) => !Number.isInteger(version) || version < 1).map(([name]) => `artifact-version:${name}`);
  // Evidence ids may declare alternatives with `|` (e.g.
  // 'build:tests|build:tests:contract'); any single alternative satisfies the
  // contract so a full-mode and a contract-mode run both get honest
  // accounting instead of fabricated full-evidence.
  const evidenceMatches = (id: string) => id.split('|').some((part) => observed.evidence.includes(part));
  const missing = [...missingInputs, ...requiredArtifacts.filter((item) => !observed.artifacts.some((actual) => contractPathMatches(item, actual))), ...requiredEvidence.filter((item) => !evidenceMatches(item)), ...missingVersions];
  return StageEvidenceResultSchema.parse({ stage: contract.stage, passed: missing.length === 0, missing, observedArtifacts: observed.artifacts, observedEvidence: observed.evidence, artifactVersions: versions, failureRoute: contract.failureRoute });
}

/**
 * Evaluate a stage and return a durable audit shape. This function is pure so
 * the control plane can run it before writing any state transition.
 */
export function evaluateStageContract(contractValue: StageContract, observed: { inputs?: string[]; artifacts: string[]; evidence: string[]; artifactVersions?: Record<string, number>; strictVersions?: boolean; verifiedByRole?: StageRole | string }): StageContractAudit {
  const contract = StageContractSchema.parse(contractValue);
  const result = evaluateStageEvidence(contract, observed);
  const missing = [...result.missing];
  const versions = observed.artifactVersions ?? {};
  const observedInputs = observed.inputs ?? [];
  // In a strict run, an input is not trustworthy merely because its path was
  // listed.  Require the producer's schema version as well, so a stale
  // upstream artifact cannot silently satisfy a downstream stage.  This is
  // deliberately opt-in for legacy callers that only persisted output paths.
  if (observed.strictVersions === true) {
    for (const input of contract.inputs.filter((item) => item.required)) {
      const matchingInputs = observedInputs.filter((actual) => contractPathMatches(input.path, actual));
      if (matchingInputs.length === 0) {
        missing.push(`input:${input.path}:missing`);
        continue;
      }
      // Version evidence is bound to the concrete path observed at this
      // boundary.  Do not search the whole version map with a wildcard: an
      // unrelated sibling (for example prototype-b when prototype-a was
      // consumed) must never satisfy or invalidate this input.
      for (const actualPath of matchingInputs) {
        const actualVersion = versions[actualPath];
        if (actualVersion === undefined) {
          missing.push(`artifact-version:${actualPath}:missing`);
        } else if (actualVersion !== input.artifactVersion) {
          missing.push(`artifact-version:${actualPath}:expected-${input.artifactVersion}`);
        }
      }
    }
  }
  for (const output of contract.outputs.filter((item) => item.required)) {
    const matchingOutputs = observed.artifacts.filter((actual) => contractPathMatches(output.path, actual));
    if (observed.strictVersions === true && matchingOutputs.length === 0) missing.push(`artifact-version:${output.path}:missing`);
    for (const actualPath of matchingOutputs) {
      const actualVersion = versions[actualPath];
      if (observed.strictVersions === true && actualVersion === undefined) missing.push(`artifact-version:${actualPath}:missing`);
      else if (actualVersion !== undefined && actualVersion !== output.artifactVersion) missing.push(`artifact-version:${actualPath}:expected-${output.artifactVersion}`);
    }
  }
  if (contract.retryPolicy.maxAttempts !== null && contract.maxAttempts !== null && contract.retryPolicy.maxAttempts > contract.maxAttempts) missing.push('retry-policy-exceeds-max-attempts');
  if (contract.sideEffects.publish && contract.ownerRole !== 'ReleaseAgent') missing.push('publish-side-effect-owner-mismatch');
  if (contract.sideEffects.externalNetwork && contract.mutationScope !== 'research-artifacts-only') missing.push('external-network-not-isolated');
  const verifier = evaluateVerifierSeparation(contract, observed.verifiedByRole);
  missing.push(...verifier.blockers);
  return StageContractAuditSchema.parse({
    schemaVersion: 1,
    stage: contract.stage,
    passed: missing.length === 0,
    ownerRole: verifier.ownerRole,
    verifierRole: verifier.verifierRole,
    ...(verifier.verifiedByRole ? { verifiedByRole: verifier.verifiedByRole } : {}),
    independent: verifier.independent,
    checkedAt: new Date().toISOString(),
    missing: [...new Set(missing)],
    observedInputs,
    observedArtifacts: observed.artifacts,
    observedEvidence: observed.evidence,
    artifactVersions: versions,
    failureRoute: contract.failureRoute,
  });
}

export function assertStageContract(contractValue: StageContract, observed: { inputs?: string[]; artifacts: string[]; evidence: string[]; artifactVersions?: Record<string, number> }): StageContractAudit {
  const audit = evaluateStageContract(contractValue, observed);
  if (!audit.passed) throw new Error(`Stage ${audit.stage} contract is incomplete: ${audit.missing.join(', ')}`);
  return audit;
}

/** Validate that the declared side-effect boundary matches the actual output
 * pointers. This is intentionally lexical; filesystem/symlink checks remain
 * the run-store's responsibility. */
export function evaluateStageSideEffects(contractValue: StageContract, outputs: string[]) {
  const contract = StageContractSchema.parse(contractValue);
  const blockers: string[] = [];
  // Generated assets live in a staging workspace owned by the asset
  // producer; the protected game/prototype workspaces are the ones that
  // require a Builder/Fixer write capability.
  const writesWorkspace = outputs.some((output) => /(?:^|\/)workspace\/(?:game|prototype-[^/]+|action-[^/]+)(?:\/|$)/u.test(output.replaceAll('\\', '/')));
  if (writesWorkspace !== contract.sideEffects.workspaceWrite) blockers.push('workspace-write-declaration-mismatch');
  if (contract.sideEffects.externalNetwork && contract.ownerRole !== 'ResearchAgent') blockers.push('external-network-owner-mismatch');
  if (contract.sideEffects.externalUpload && contract.ownerRole !== 'ReleaseAgent') blockers.push('external-upload-owner-mismatch');
  if (contract.sideEffects.publish && contract.stage !== 'RELEASE') blockers.push('publish-only-release');
  if (outputs.some((output) => output.includes('..') || output.startsWith('/'))) blockers.push('unsafe-output-path');
  return { passed: blockers.length === 0, blockers: [...new Set(blockers)] };
}

export function listStageContracts(): StageContract[] {
  return [...new Set([...Object.keys(definitions), ...Object.keys(governanceContracts)])].map((stage) => getStageContract(stage));
}
