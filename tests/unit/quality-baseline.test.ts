import { describe, expect, it } from 'vitest';
import { evaluateQualityBaseline, QUALITY_BASELINE_CHECKS } from '../../src/core/quality-baseline.js';
import { QualityBaselineReportSchema } from '../../src/schemas/quality-baseline.js';

describe('minimum shipping quality baseline', () => {
  it('requires every cross-game baseline check and blocks incomplete evidence', () => {
    const report = evaluateQualityBaseline({});
    expect(report.passed).toBe(false);
    expect(report.blockers).toEqual(expect.arrayContaining(QUALITY_BASELINE_CHECKS));
    expect(QualityBaselineReportSchema.parse(report).checks).toHaveLength(QUALITY_BASELINE_CHECKS.length);
  });

  it('passes only when every check has attributable evidence', () => {
    const report = evaluateQualityBaseline(Object.fromEntries(QUALITY_BASELINE_CHECKS.map((id) => [id, { passed: true, evidence: [`evidence/${id}.json`] }])));
    expect(report.passed).toBe(true);
    expect(report.blockers).toHaveLength(0);
  });
});
