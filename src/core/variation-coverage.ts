import { VariationCoverageObservationSchema, VariationCoveragePlanSchema, type VariationCoverageObservation, type VariationCoveragePlan } from '../schemas/variation-coverage.js';
import { ContentVariationReportSchema } from '../schemas/factory-operating.js';

const dimensions: Record<VariationCoveragePlan['line'], { required: string[]; flows: string[] }> = {
  'single-finger-action': { required: ['hazardPattern', 'motionProfile'], flows: ['success after primary action', 'failure and immediate retry'] },
  'cut-stack-dodge': { required: ['cutGeometry', 'dropTrajectory'], flows: ['short stack with clean cut', 'obstacle beat with recovery'] },
  'idle-management': { required: ['orderMix', 'upgradeTradeoff'], flows: ['produce-deliver-upgrade', 'refresh and recover progress'] },
  'choice-life': { required: ['route', 'consequence'], flows: ['safe choice and delayed echo', 'alternate choice and replay ending'] },
  'rule-puzzle': { required: ['ruleStructure', 'solutionPath'], flows: ['first rule discovery', 'variant solution after reset'] },
};

export function buildVariationCoveragePlan(lineValue: VariationCoveragePlan['line']): VariationCoveragePlan {
  const line = String(lineValue) as VariationCoveragePlan['line'];
  const profile = dimensions[line];
  return VariationCoveragePlanSchema.parse({ schemaVersion: 1, line, minimumRuns: line === 'choice-life' || line === 'rule-puzzle' ? 3 : 2, requiredDimensions: [...profile.required], seedModes: ['golden', 'fuzz', 'production'], representativeFlows: [...profile.flows], generatedAt: new Date().toISOString() });
}

export function evaluateVariationCoverage(planValue: VariationCoveragePlan, observationValue: VariationCoverageObservation) {
  const plan = VariationCoveragePlanSchema.parse(planValue);
  const observation = VariationCoverageObservationSchema.parse(observationValue);
  const blockers: string[] = [];
  if (observation.runs < plan.minimumRuns) blockers.push(`runs<${plan.minimumRuns}`);
  const observed = new Set(observation.dimensions);
  for (const dimension of plan.requiredDimensions) if (!observed.has(dimension)) blockers.push(`dimension:${dimension}`);
  if (observation.dimensions.length > 0 && observation.dimensions.every((item) => /^(?:text|color|cosmetic|palette|文案|颜色|换皮)$/iu.test(item))) blockers.push('cosmetic-only');
  return { passed: blockers.length === 0, blockers: [...new Set(blockers)], plan, observation };
}

/** Convert the operator-facing variation report into deterministic coverage
 * dimensions.  Dimension names are intentionally extracted only from the
 * structured differences/evidence fields; prose outside the report is never
 * allowed to manufacture coverage. */
export function buildVariationCoverageObservation(lineValue: VariationCoveragePlan['line'], value: unknown): VariationCoverageObservation {
  const line = String(lineValue) as VariationCoveragePlan['line'];
  const report = ContentVariationReportSchema.parse(value);
  const plan = buildVariationCoveragePlan(line);
  const haystack = report.variants.flatMap((variant) => [...variant.differences, ...variant.evidence]).join(' ').toLowerCase();
  const dimensionsFound = plan.requiredDimensions.filter((dimension) => haystack.includes(dimension.toLowerCase()) || haystack.includes(dimension.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)));
  const dimensions = [...new Set([...dimensionsFound, ...report.variants.flatMap((variant) => variant.differences).filter((item) => item.trim().length > 0 && !/^(?:text|color|cosmetic|palette|文案|颜色|换皮)$/iu.test(item)).slice(0, 8)])];
  return VariationCoverageObservationSchema.parse({ runs: report.variants.length, dimensions });
}
