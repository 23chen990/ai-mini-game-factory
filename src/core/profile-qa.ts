import { ProfileQaReportSchema, type ProfileQaCheck, type ProfileQaReport } from '../schemas/profile-qa.js';

const dimensions: Record<ProfileQaReport['profile'], string[]> = {
  ACTION_FEEL: ['input response', 'motion continuity', 'collision credibility', 'contact feedback', 'retry friction', 'drop trajectory'],
  NARRATIVE_AGENCY: ['choice distinction', 'consequence readability', 'character response', 'delayed consequence', 'replay reason'],
  STRATEGIC_SYSTEM: ['goal clarity', 'resource trade-off', 'reward readability', 'growth pacing', 'refresh recovery'],
  PUZZLE_CLARITY: ['rule clarity', 'information fairness', 'error recovery', 'solution feedback', 'variant validity'],
  SOCIAL_EMOTION: ['relationship response', 'emotional consequence', 'interaction meaning', 'repeat motivation'],
  EXPLORATION_DISCOVERY: ['spatial guidance', 'discovery density', 'route readability', 'return motivation'],
};

/** Domain-specific aliases let a production line use precise language (for
 * example "causal readability") while the profile gate still records one
 * canonical dimension.  Matching remains evidence-based; aliases never add a
 * pass without a check/evidence string. */
const dimensionAliases: Record<ProfileQaReport['profile'], Record<string, string[]>> = {
  ACTION_FEEL: {
    'input response': ['cut timing', 'input-response', 'input response'],
    'motion continuity': ['rhythm', 'motion continuity', 'motion-trace'],
    'collision credibility': ['collision', 'obstacle', 'contact boundary'],
    'contact feedback': ['impact', 'contact feedback', 'feedback frame'],
    'retry friction': ['retry friction', 'retry-ms', 'failure-to-retry'],
    'drop trajectory': ['drop trajectory', 'drop-trajectory', 'settle'],
  },
  NARRATIVE_AGENCY: {
    'choice distinction': ['choice distinction', 'choice-distinction', 'branch trace'],
    'consequence readability': ['consequence readability', 'causal readability', 'consequence comparison', 'consequence'],
    'character response': ['character response', 'relationship response', 'character/relationship'],
    'delayed consequence': ['delayed consequence', 'delayed echo', 'echo'],
    'replay reason': ['replay reason', 'replay', 'alternate replay'],
  },
  STRATEGIC_SYSTEM: {
    'goal clarity': ['goal clarity', 'next goal', 'goal-comprehension'],
    'resource trade-off': ['resource trade-off', 'resource ledger', 'trade-off'],
    'reward readability': ['reward readability', 'reward', 'currency'],
    'growth pacing': ['growth pacing', 'upgrade', 'progression'],
    'refresh recovery': ['refresh recovery', 'refresh', 'recovery'],
  },
  PUZZLE_CLARITY: {
    'rule clarity': ['rule clarity', 'rule-discovery', 'rule'],
    'information fairness': ['information fairness', 'fairness', 'hint'],
    'error recovery': ['error recovery', 'wrong-attempt', 'wrong move'],
    'solution feedback': ['solution feedback', 'solution frame', 'solve'],
    'variant validity': ['variant validity', 'variant', 'solvable'],
  },
  SOCIAL_EMOTION: {
    'relationship response': ['relationship response', 'character response'],
    'emotional consequence': ['emotional consequence', 'consequence'],
    'interaction meaning': ['interaction meaning', 'interaction'],
    'repeat motivation': ['repeat motivation', 'replay'],
  },
  EXPLORATION_DISCOVERY: {
    'spatial guidance': ['spatial guidance', 'route readability', 'navigation'],
    'discovery density': ['discovery density', 'discovery'],
    'route readability': ['route readability', 'route'],
    'return motivation': ['return motivation', 'return', 'revisit'],
  },
};

function normalizedEvidence(value: string) {
  return value.toLowerCase().replaceAll(/[_-]+/gu, ' ');
}

export function profileDimensionForEvidence(profile: ProfileQaReport['profile'], value: string): string | undefined {
  const text = normalizedEvidence(value);
  // Choose the most specific phrase when aliases overlap.  For example,
  // “delayed consequence” also contains the broad “consequence” alias; a
  // first-match scan would silently assign that evidence to the wrong
  // dimension and make a complete narrative QA report fail.
  const matches = dimensions[profile].flatMap((dimension) => {
    const aliases = [dimension, ...(dimensionAliases[profile][dimension] ?? [])];
    return aliases
      .map((alias) => normalizedEvidence(alias))
      .filter((alias) => alias.length > 0 && text.includes(alias))
      .map((alias) => ({ dimension, specificity: alias.length }));
  });
  return matches.sort((left, right) => right.specificity - left.specificity || right.dimension.length - left.dimension.length)[0]?.dimension;
}

export function canonicalProfileDimension(profile: ProfileQaReport['profile'], value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = normalizedEvidence(value);
  return dimensions[profile].find((dimension) => normalized === normalizedEvidence(dimension))
    ?? profileDimensionForEvidence(profile, value);
}

export function evaluateProfileQa(input: { gameId: string; buildHash: string; profile: ProfileQaReport['profile']; qaPassed: boolean; checks: ProfileQaCheck[]; productionLine?: ProfileQaReport['productionLine']; linePlanPath?: string; lineEvaluationPath?: string }, options: { requireExplicitDimensions?: boolean } = {}): ProfileQaReport {
  const requiredDimensions = dimensions[input.profile];
  const checks = input.checks.map((check) => ({ ...check }));
  const normalized = new Set<string>();
  for (const check of checks) {
    const dimension = profileDimensionForEvidence(input.profile, `${check.id} ${check.evidence}`);
    if (dimension) normalized.add(dimension);
  }
  const blockers: string[] = [];
  if (!input.qaPassed) blockers.push('qa-report-failed');
  for (const dimension of requiredDimensions) if (!normalized.has(dimension)) blockers.push(`missing:${dimension.replaceAll(' ', '-')}`);
  if (options.requireExplicitDimensions) {
    const explicit = new Set<string>();
    for (const check of checks) {
      const dimensionId = (check as ProfileQaCheck & { dimensionId?: unknown }).dimensionId;
      if (typeof dimensionId !== 'string' || !requiredDimensions.includes(dimensionId)) blockers.push(`explicit-dimension-missing:${check.id}`);
      else if (explicit.has(dimensionId)) blockers.push(`duplicate-dimension:${dimensionId.replaceAll(' ', '-')}`);
      else explicit.add(dimensionId);
    }
    for (const dimension of requiredDimensions) if (!explicit.has(dimension)) blockers.push(`explicit-dimension:${dimension.replaceAll(' ', '-')}`);
  }
  for (const check of checks) if (!check.passed) blockers.push(`failed:${check.id}`);
  return ProfileQaReportSchema.parse({ schemaVersion: 1, gameId: input.gameId, buildHash: input.buildHash, profile: input.profile, ...(input.productionLine ? { productionLine: input.productionLine } : {}), ...(input.linePlanPath ? { linePlanPath: input.linePlanPath } : {}), ...(input.lineEvaluationPath ? { lineEvaluationPath: input.lineEvaluationPath } : {}), requiredDimensions, checks, passed: blockers.length === 0, blockers: [...new Set(blockers)], testedAt: new Date().toISOString() });
}

/**
 * Public constructor used by the factory's final gate.  Keeping construction
 * in this module prevents the control plane from silently treating every
 * title as an ACTION_FEEL game.  The generic QA result is still accepted as an
 * input, but profile evidence is evaluated against the locked production
 * line's dimensions before a report can pass.
 */
export function buildProfileQaReport(input: {
  gameId: string;
  buildHash: string;
  profile: ProfileQaReport['profile'];
  qaPassed: boolean;
  checks: ProfileQaCheck[];
  productionLine?: ProfileQaReport['productionLine'];
  linePlanPath?: string;
  lineEvaluationPath?: string;
  requireExplicitDimensions?: boolean;
}): ProfileQaReport {
  return evaluateProfileQa(input, { requireExplicitDimensions: input.requireExplicitDimensions });
}

export function profileForBlueprint(value: unknown, fallback: ProfileQaReport['profile'] = 'STRATEGIC_SYSTEM'): ProfileQaReport['profile'] {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const preferences = (value as { preferences?: unknown }).preferences;
    if (preferences && typeof preferences === 'object' && !Array.isArray(preferences)) {
      const primary = (preferences as { experienceProfile?: unknown }).experienceProfile;
      if (primary && typeof primary === 'object' && !Array.isArray(primary)) {
        const candidate = (primary as { primary?: unknown }).primary;
        if (typeof candidate === 'string' && ['ACTION_FEEL', 'NARRATIVE_AGENCY', 'STRATEGIC_SYSTEM', 'PUZZLE_CLARITY', 'SOCIAL_EMOTION', 'EXPLORATION_DISCOVERY'].includes(candidate)) return candidate as ProfileQaReport['profile'];
      }
    }
  }
  return fallback;
}
