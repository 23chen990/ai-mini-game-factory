import { describe, expect, it } from 'vitest';
import { QUALITY_DIMENSIONS, QualityGateMatrixSchema, QualityGateRecordSchema } from '../../src/schemas/quality-gates.js';
import { bindQualityGateMatrix, buildQualityGateMatrix, evaluateQualityGateMatrix, profileQaSignal } from '../../src/core/quality-gates.js';

const passing = Object.fromEntries(QUALITY_DIMENSIONS.map((id) => [id, { status: 'PASS' as const, evidence: [`evidence:${id}`] }]));

describe('unified quality gate matrix', () => {
  it('derives the core-experience signal from the final profile decision and evidence report', () => {
    expect(profileQaSignal(
      { decision: 'APPROVED' },
      { passed: true },
    )).toMatchObject({ passed: true });
    expect(profileQaSignal(
      { decision: 'FEEL_REPAIR_REQUIRED' },
      { passed: false, blockers: ['failed:choice distinction'] },
    )).toMatchObject({ passed: false, blockers: expect.arrayContaining(['profile-qa-failed']) });
  });

  it('keeps profile QA unknown when neither a decision nor a passed evidence field exists', () => {
    expect(profileQaSignal({ statuses: { mechanics: 'PARTIAL' } })).toMatchObject({
      passed: undefined,
      blockers: ['profile-qa-missing-or-invalid'],
    });
  });

  it('requires all seven reusable dimensions and derives a passing result', () => {
    const matrix = evaluateQualityGateMatrix({ gates: passing, candidateHash: 'a'.repeat(64), requireCandidateHash: true });
    expect(QualityGateMatrixSchema.parse(matrix).passed).toBe(true);
    expect(matrix.dimensions).toHaveLength(7);
    expect(matrix.blockers).toEqual([]);
  });

  it('turns missing or unknown dimensions into explicit blockers', () => {
    const partial = Object.fromEntries(Object.entries(passing).filter(([id]) => id !== 'functionality'));
    const matrix = evaluateQualityGateMatrix({ gates: { ...partial, visualUx: { status: 'UNKNOWN', blockers: ['screenshot-missing'] } } });
    expect(matrix.passed).toBe(false);
    expect(matrix.blockers).toEqual(expect.arrayContaining(['functionality', 'visualUx']));
    expect(matrix.dimensions.find((item) => item.id === 'functionality')?.status).toBe('UNKNOWN');
  });

  it('allows only a human-signed, unexpired waiver to clear a failed dimension', () => {
    const matrix = evaluateQualityGateMatrix({
      gates: {
        ...passing,
        performanceCompatibility: {
          status: 'WAIVED',
          evidence: ['known low-risk device gap'],
          blockers: ['legacy-device-not-in-scope'],
          waiver: { reviewer: 'owner', reason: 'device is outside the launch cohort', approvedAt: new Date().toISOString() },
        },
      },
    });
    expect(matrix.passed).toBe(true);
    expect(matrix.blockers).toEqual([]);
  });

  it('rejects a matrix that marks a failed or unknown dimension as passed', () => {
    expect(() => QualityGateMatrixSchema.parse({
      schemaVersion: 1,
      dimensions: QUALITY_DIMENSIONS.map((id) => ({ id, status: id === 'visualUx' ? 'UNKNOWN' : 'PASS', evidence: [`evidence:${id}`], blockers: id === 'visualUx' ? ['missing'] : [] })),
      passed: true,
      blockers: [],
      evaluatedAt: new Date().toISOString(),
    })).toThrow(/passed|blocker/i);
  });

  it('does not allow a PASS record to retain unresolved blockers', () => {
    expect(() => QualityGateRecordSchema.parse({ id: 'functionality', status: 'PASS', evidence: ['tests'], blockers: ['stale-failure'] })).toThrow(/blocker/i);
  });

  it('maps optional evidence signals to UNKNOWN instead of silently passing', () => {
    const matrix = buildQualityGateMatrix({
      functionality: { passed: true, evidence: ['core and normal flow'] },
      coreExperience: { passed: undefined, evidence: [] },
    });
    expect(matrix.dimensions.find((item) => item.id === 'functionality')?.status).toBe('PASS');
    expect(matrix.dimensions.find((item) => item.id === 'coreExperience')?.status).toBe('UNKNOWN');
    expect(matrix.blockers).toContain('coreExperience');
  });

  it('binds a passing matrix to the immutable candidate hash', () => {
    const matrix = buildQualityGateMatrix(Object.fromEntries(QUALITY_DIMENSIONS.map((id) => [id, { passed: true, evidence: [id] }])) as never);
    const bound = bindQualityGateMatrix(matrix, 'a'.repeat(64));
    expect(bound.passed).toBe(true);
    expect(bound.candidateHash).toBe('a'.repeat(64));
    expect(() => bindQualityGateMatrix(matrix, 'b'.repeat(63))).toThrow(/candidate/i);
  });
});
