import { ArtifactLedgerSchema, type ArtifactLedger } from '../schemas/artifact-ledger.js';
import { CompletionGateReportSchema, type CompletionGateReport } from './completion-gates.js';
import { FactoryConstitutionSchema, ConstitutionEvaluationSchema, type FactoryConstitution, type ConstitutionEvaluation } from '../schemas/factory-constitution.js';
import { PlatformPackageSetSchema } from '../schemas/platform-package.js';
import { UnknownRegisterSchema } from '../schemas/unknowns.js';
import { evaluateArtifactLedger } from './artifact-ledger.js';
import { evaluatePlatformPackageSet } from './platform-packaging.js';
import { evaluateUnknownRegister } from './unknowns.js';
import { QualityGateMatrixSchema } from '../schemas/quality-gates.js';
import { StateTransitionRecordSchema } from '../schemas/state-transition.js';
import { evaluateTransitionHistory } from './state-machine.js';
import { evaluateSideEffectJournal } from './side-effect-journal.js';

export { FactoryConstitutionSchema, ConstitutionEvaluationSchema } from '../schemas/factory-constitution.js';

export const FACTORY_CONSTITUTION: FactoryConstitution = FactoryConstitutionSchema.parse({
  schemaVersion: 1,
  constitutionId: 'FACTORY_CONSTITUTION',
  version: 'v1',
  requiredCompletionGates: ['core', 'normalFlow', 'visualEvidence', 'levelDifference', 'humanPlaytest'],
  rules: [
    'REQUIRED_STAGE_CONTRACT',
    'UNKNOWN_ZERO_AT_RELEASE',
    'NO_SELF_ACCEPTANCE',
    'REGRESSION_TEST_FOR_FIX',
    'FAIL_TO_EARLIEST_OWNER',
    'LICENSE_ALLOWLIST_ONLY',
    'BOUNDED_AUTOMATIC_REPAIR',
    'PLATFORM_CHILD_ISOLATION',
  'IMMUTABLE_CANDIDATE',
  'FINAL_HUMAN_PLAYTEST',
  'THREE_HUMAN_APPROVALS',
  'QUALITY_STATUS_MATRIX',
  'STATE_TRANSITION_AUDIT',
  'SIDE_EFFECT_JOURNAL',
  ],
  maxAutomaticRepairAttempts: 5,
  frozenAfterStage: 'CORE_SPEC_FROZEN',
  generatedAt: new Date(0).toISOString(),
});

type GateInput = {
  completion: CompletionGateReport | unknown;
  unknowns?: unknown;
  /** In production, every unknown must be resolved or explicitly human-waived. */
  requireAllUnknowns?: boolean;
  /** In strict production, a waiver must be bound to the exact reviewed
   * artifact/scope and an expiring human signer. */
  requireBoundWaivers?: boolean;
  waiverArtifactHashes?: Record<string, string>;
  ledger?: ArtifactLedger | unknown;
  platformPackages?: unknown;
  requirePlatformPackages?: boolean;
  requirePlatformIsolation?: boolean;
  presentation?: { passed?: boolean; blockers?: string[] };
  requirePresentation?: boolean;
  supplyChain?: { passed?: boolean; blockers?: string[] };
  requireSupplyChain?: boolean;
  accountCapacity?: { passed?: boolean; blockers?: string[] };
  requireAccountCapacity?: boolean;
  runtimeProduct?: { passed?: boolean };
  requireRuntimeProduct?: boolean;
  certificationReady?: boolean;
  requireCertification?: boolean;
  /** Strict production runs must prove every planned quality stage was audited. */
  requireStageContracts?: boolean;
  stageContracts?: Array<{
    stage: string;
    passed: boolean;
    ownerRole?: string;
    verifierRole?: string;
    verifiedByRole?: string;
    independent?: boolean;
  }>;
  requiredStageContracts?: string[];
  humanApprovals?: { passed?: boolean; blockers?: string[] };
  requireHumanApprovals?: boolean;
  selfAcceptance?: { builder?: boolean; fixer?: boolean; producer?: boolean; qa?: boolean; release?: boolean };
  qualityMatrix?: unknown;
  requireQualityMatrix?: boolean;
  stateTransitions?: unknown;
  plannedStages?: string[];
  requireStateTransitions?: boolean;
  sideEffects?: unknown;
  requireSideEffects?: boolean;
};

/**
 * Aggregate the non-negotiable release rules. Optional evidence families are
 * only checked when their corresponding `require*` flag is set, preserving a
 * cheap local fast lane while making production profiles explicit.
 */
export function evaluateFactoryConstitution(input: GateInput): ConstitutionEvaluation {
  const blockers: string[] = [];
  const unknowns: string[] = [];
  const waived: string[] = [];
  let completion: CompletionGateReport;
  try { completion = CompletionGateReportSchema.parse(input.completion); } catch { blockers.push('completion-gates'); completion = undefined as never; }
  if (completion && !completion.releaseReady) blockers.push('completion-gates');

  if (input.unknowns !== undefined) {
    const parsed = UnknownRegisterSchema.safeParse(input.unknowns);
    if (!parsed.success) blockers.push('unknown-register-schema');
    else {
      const result = evaluateUnknownRegister(parsed.data, { requireAllResolved: input.requireAllUnknowns === true, requireBoundWaivers: input.requireBoundWaivers === true, artifactHashes: input.waiverArtifactHashes });
      unknowns.push(...result.blocking);
      waived.push(...parsed.data.items.filter((item) => item.status === 'WAIVED').map((item) => item.id));
      if (!result.passed) blockers.push('unknowns');
    }
  }

  if (input.ledger !== undefined) {
    const parsed = ArtifactLedgerSchema.safeParse(input.ledger);
    if (!parsed.success || !evaluateArtifactLedger(parsed.data).passed) blockers.push('artifact-ledger');
  }

  if (input.requirePlatformPackages) {
    const parsed = PlatformPackageSetSchema.safeParse(input.platformPackages);
    if (!parsed.success || !evaluatePlatformPackageSet(parsed.data, { strict: input.requirePlatformIsolation === true }).passed) blockers.push('platform-packages');
  }
  if (input.requirePresentation && input.presentation?.passed !== true) blockers.push('presentation');
  if (input.requireSupplyChain && input.supplyChain?.passed !== true) blockers.push('supply-chain');
  if (input.requireAccountCapacity && input.accountCapacity?.passed !== true) blockers.push('account-capacity');
  if (input.requireRuntimeProduct && input.runtimeProduct?.passed !== true) blockers.push('runtime-product');
  if (input.requireCertification && input.certificationReady !== true) blockers.push('certification');
  if (input.requireHumanApprovals && input.humanApprovals?.passed !== true) blockers.push('human-approvals');

  if (input.requireQualityMatrix) {
    const matrix = QualityGateMatrixSchema.safeParse(input.qualityMatrix);
    if (!matrix.success || !matrix.data.passed) blockers.push('quality-matrix');
  }

  if (input.requireStateTransitions) {
    // Treat transition history as untrusted run data. A malformed entry must
    // produce a durable failed gate, never escape as a parser exception that
    // bypasses the constitution report and obscures the recovery route.
    const parseResults = Array.isArray(input.stateTransitions)
      ? input.stateTransitions.map((item) => StateTransitionRecordSchema.safeParse(item))
      : [];
    const malformed = parseResults.some((result) => !result.success);
    const parsed = parseResults.flatMap((result) => result.success ? [result.data] : []);
    const audit = !malformed && parsed.length > 0
      ? evaluateTransitionHistory(parsed, { plannedStages: input.plannedStages as never[] | undefined })
      : { passed: false, blockers: [malformed ? 'transition-history-schema-invalid' : 'transition-history-missing'] };
    if (!audit.passed) blockers.push('state-transitions');
  }

  if (input.requireSideEffects) {
    const result = evaluateSideEffectJournal(input.sideEffects, { requireAllSucceeded: true });
    if (!result.passed) blockers.push('side-effect-journal');
  }

  if (input.requireStageContracts) {
    const audits = Array.isArray(input.stageContracts) ? input.stageContracts : [];
    const byStage = new Map(audits.filter((item) => item && typeof item.stage === 'string').map((item) => [item.stage, item]));
    const requiredStages = input.requiredStageContracts?.length ? input.requiredStageContracts : ['QA', 'FINAL_PROFILE_QA', 'NORMAL_FLOW_QA', 'PERCEPTUAL_QA', 'VISUAL_EVIDENCE_QA', 'CONTENT_VARIATION_QA', 'RELEASE_CANDIDATE', 'RELEASE'];
    if (requiredStages.some((stage) => byStage.get(stage)?.passed !== true)) blockers.push('stage-contracts');
    const protectedOwners = new Set(['ResearchAgent', 'ProducerAgent', 'BuilderAgent', 'FixerAgent', 'QAAgent', 'ReleaseAgent', 'HumanReviewer']);
    const verifierIdentityMissing = requiredStages.some((stage) => {
      const audit = byStage.get(stage);
      if (!audit || audit.passed !== true) return false;
      if (typeof audit.ownerRole !== 'string' || typeof audit.verifierRole !== 'string' || typeof audit.verifiedByRole !== 'string' || audit.independent !== true) return true;
      if (audit.ownerRole !== 'FactoryControlPlane' && protectedOwners.has(audit.ownerRole) && (audit.ownerRole === audit.verifierRole || audit.ownerRole === audit.verifiedByRole)) return true;
      return false;
    });
    if (verifierIdentityMissing) blockers.push('stage-contract-verifier');
  }

  const selfAcceptance = input.selfAcceptance;
  if (selfAcceptance && (selfAcceptance.builder || selfAcceptance.fixer || selfAcceptance.producer || selfAcceptance.qa || selfAcceptance.release)) blockers.push('self-acceptance');
  return ConstitutionEvaluationSchema.parse({ schemaVersion: 1, passed: blockers.length === 0, blockers: [...new Set(blockers)], unknowns: [...new Set(unknowns)], waived: [...new Set(waived)], checkedAt: new Date().toISOString() });
}

export type { ConstitutionEvaluation };
