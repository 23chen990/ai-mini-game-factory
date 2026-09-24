import { describe, expect, it } from 'vitest';
import { buildVariationCoveragePlan, evaluateVariationCoverage } from '../../src/core/variation-coverage.js';

describe('production-line variation coverage', () => {
  it('defines representative runs for every stable production line', () => {
    for (const line of ['single-finger-action', 'cut-stack-dodge', 'idle-management', 'choice-life', 'rule-puzzle'] as const) {
      const plan = buildVariationCoveragePlan(line);
      expect(plan.minimumRuns).toBeGreaterThanOrEqual(2);
      expect(plan.requiredDimensions.length).toBeGreaterThanOrEqual(2);
      expect(plan.seedModes).toEqual(expect.arrayContaining(['golden', 'fuzz', 'production']));
    }
  });

  it('does not pass on cosmetic-only or under-sampled variation', () => {
    const plan = buildVariationCoveragePlan('choice-life');
    expect(evaluateVariationCoverage(plan, { runs: 1, dimensions: ['text'] })).toMatchObject({ passed: false });
    expect(evaluateVariationCoverage(plan, { runs: 3, dimensions: ['route', 'consequence'] })).toMatchObject({ passed: true });
  });
});
