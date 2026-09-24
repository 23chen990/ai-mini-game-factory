import { getProductionLineContract, type ProductionLine } from '../core/production-lines.js';
import {
  ProductionLinePlayEvidenceSchema,
  ProductionLinePlayEvaluationSchema,
  ProductionLinePlayPlanSchema,
  type ProductionLinePlayEvaluation,
  type ProductionLinePlayEvidence,
  type ProductionLinePlayPlan,
} from '../schemas/production-line-qa.js';
import { NaturalFlowEvidenceSchema, type NaturalFlowEvidence } from '../schemas/natural-flow.js';

export type ProductionLineQaMode = 'generic-idle' | 'cut-stack-dodge' | 'line-specific-required';

/**
 * The generic browser runner only knows the idle-shop verbs.  Returning an
 * explicit mode prevents it from producing convincing but irrelevant idle
 * evidence for action, narrative or puzzle products.
 */
export function qaModeForProductionLine(lineValue: unknown): ProductionLineQaMode {
  if (lineValue === 'idle-management') return 'generic-idle';
  if (lineValue === 'cut-stack-dodge') return 'cut-stack-dodge';
  return 'line-specific-required';
}

/** Build the smallest natural-play journey that is meaningful for a line. */
export function buildProductionLinePlayPlan(lineValue: ProductionLine): ProductionLinePlayPlan {
  const contract = getProductionLineContract(lineValue);
  return ProductionLinePlayPlanSchema.parse({
    schemaVersion: 1,
    line: contract.line,
    profile: contract.primaryProfile,
    steps: contract.representativeFlow.map((label, index) => ({
      id: `${contract.line}:${index + 1}`,
      label,
      requiredEvidence: [contract.requiredEvidence[Math.min(index, contract.requiredEvidence.length - 1)] ?? 'natural input trace'],
      dimensionId: contract.acceptanceDimensions[index % contract.acceptanceDimensions.length],
      order: index + 1,
    })),
    requiredEvidence: contract.requiredEvidence,
    forbiddenOperations: ['loadScenario', 'setState', 'grantCurrency', 'teleport', 'direct-state-mutation'],
    generatedAt: new Date().toISOString(),
  });
}

function naturalSignal(evidence: NaturalFlowEvidence, token: string): boolean {
  const normalized = token.toLowerCase();
  return evidence.transitions.some((transition) => transition.changed && `${transition.name} ${transition.evidence}`.toLowerCase().includes(normalized))
    || evidence.actions.some((action) => action.toLowerCase().includes(normalized));
}

function naturalTransition(evidence: NaturalFlowEvidence, token: string): boolean {
  const normalized = token.toLowerCase();
  return evidence.transitions.some((transition) => transition.changed && `${transition.name} ${transition.evidence}`.toLowerCase().includes(normalized));
}

/** Convert a trusted natural browser journey into the line-specific evidence
 * family used by FINAL_PROFILE_QA. This function never upgrades a missing
 * transition: each representative step is tied to an observed line signal. */
export function deriveProductionLinePlayEvidence(
  planValue: ProductionLinePlayPlan,
  naturalValue: NaturalFlowEvidence,
  buildHash: string,
): ProductionLinePlayEvidence {
  const plan = ProductionLinePlayPlanSchema.parse(planValue);
  const natural = NaturalFlowEvidenceSchema.parse(naturalValue);
  const observed = (index: number): { passed: boolean; detail: string } => {
    if (plan.line === 'idle-management') {
      if (index === 0) return { passed: natural.startedFromReset, detail: 'reset' };
      if (index === 1) return { passed: naturalSignal(natural, 'produce') || naturalSignal(natural, 'automatic-progress'), detail: 'produce' };
      if (index === 2) return { passed: natural.completion === 'settlement' || naturalSignal(natural, 'deliver'), detail: 'deliver-settlement' };
      if (index === 3) return { passed: naturalSignal(natural, 'upgrade'), detail: 'upgrade-trade-off' };
      return { passed: natural.replayObserved && (naturalSignal(natural, 'refresh') || naturalSignal(natural, 'reload')), detail: 'refresh-recovery' };
    }
    if (plan.line === 'cut-stack-dodge') {
      if (index === 0) return { passed: natural.startedFromReset, detail: 'reset' };
      if (index === 1) return { passed: naturalTransition(natural, 'cut'), detail: 'natural-cut-contact' };
      if (index === 2) return { passed: naturalTransition(natural, 'drop'), detail: 'drop-trajectory' };
      if (index === 3) return { passed: naturalTransition(natural, 'obstacle') || naturalTransition(natural, 'hazard'), detail: 'obstacle-failure' };
      return { passed: natural.completion === 'terminal' && natural.replayObserved && naturalTransition(natural, 'retry'), detail: 'failure-retry-settlement' };
    }
    return { passed: false, detail: 'dedicated-line-converter-required' };
  };
  return ProductionLinePlayEvidenceSchema.parse({
    schemaVersion: 1,
    line: plan.line,
    buildHash,
    naturalInput: natural.forbiddenOperations.length === 0,
    steps: plan.steps.map((step, index) => {
      const result = observed(index);
      return {
        id: step.id,
        passed: result.passed,
        evidence: [
          ...step.requiredEvidence,
          `natural-flow:${result.detail}`,
          `step:${step.id}`,
          ...natural.screenshots.slice(0, 3),
        ],
      };
    }),
    forbiddenOperations: natural.forbiddenOperations,
  });
}

export function evaluateProductionLinePlayEvidence(
  planValue: unknown,
  evidenceValue: unknown,
  options: { expectedBuildHash?: string } = {},
): ProductionLinePlayEvaluation {
  const plan = ProductionLinePlayPlanSchema.parse(planValue);
  const blockers: string[] = [];
  const parsed = ProductionLinePlayEvidenceSchema.safeParse(evidenceValue);
  if (!parsed.success) {
    return ProductionLinePlayEvaluationSchema.parse({
      schemaVersion: 1,
      line: plan.line,
      profile: plan.profile,
      passed: false,
      blockers: ['evidence-schema-invalid'],
      observedSteps: [],
      checkedAt: new Date().toISOString(),
    });
  }
  const evidence = parsed.data;
  if (evidence.line !== plan.line) blockers.push('line-mismatch');
  if (options.expectedBuildHash && evidence.buildHash !== options.expectedBuildHash) blockers.push('build-hash-mismatch');
  if (!evidence.naturalInput) blockers.push('natural-input-required');
  if (evidence.forbiddenOperations.length > 0) blockers.push('oracle-operation-used');

  const expectedIds = plan.steps.map((step) => step.id);
  const actualIds = evidence.steps.map((step) => step.id);
  if (new Set(actualIds).size !== actualIds.length) blockers.push('duplicate-step');
  for (const id of expectedIds) if (!actualIds.includes(id)) blockers.push(`missing-step:${id}`);
  for (const id of actualIds) if (!expectedIds.includes(id)) blockers.push(`unexpected-step:${id}`);
  for (const step of evidence.steps) {
    if (!step.passed) blockers.push(`failed-step:${step.id}`);
    const planStep = plan.steps.find((candidate) => candidate.id === step.id);
    if (planStep && planStep.requiredEvidence.some((required) => !step.evidence.some((item) => item.includes(required) || required.includes(item) || item.includes(step.id)))) {
      blockers.push(`missing-evidence:${step.id}`);
    }
  }

  return ProductionLinePlayEvaluationSchema.parse({
    schemaVersion: 1,
    line: plan.line,
    profile: plan.profile,
    buildHash: evidence.buildHash,
    passed: blockers.length === 0,
    blockers: [...new Set(blockers)],
    observedSteps: actualIds,
    checkedAt: new Date().toISOString(),
  });
}
