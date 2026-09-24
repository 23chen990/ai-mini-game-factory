import { ProfileVariationSchema, type ProfileVariation } from '../schemas/content-variation.js';

const requiredDimension: Record<ProfileVariation['profile'], keyof ProfileVariation['variants'][number]> = {
  ACTION_FEEL: 'behaviorSignature',
  NARRATIVE_AGENCY: 'behaviorSignature',
  STRATEGIC_SYSTEM: 'behaviorSignature',
  PUZZLE_CLARITY: 'structuralSignature',
};

export function evaluateProfileVariation(value: unknown) {
  const report = ProfileVariationSchema.parse(value);
  const dimension = requiredDimension[report.profile];
  const values = new Set(report.variants.map((variant) => variant[dimension]));
  const blockers = values.size < 2 ? [`${report.profile}:required-${dimension}-variation-missing`] : [];
  return { passed: report.passed && blockers.length === 0, blockers, report };
}
