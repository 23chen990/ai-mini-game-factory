import { describe, expect, it } from 'vitest';
import { evaluateProfileQa } from '../../src/core/profile-qa.js';

describe('profile-specific final QA', () => {
  it('uses action-feel dimensions instead of narrative/system checks', () => {
    const report = evaluateProfileQa({
      gameId: 'g', buildHash: 'a'.repeat(64), profile: 'ACTION_FEEL',
      qaPassed: true,
      checks: [
        { id: 'input-response', passed: true, evidence: 'input-response-ms:12' },
        { id: 'motion-continuity', passed: true, evidence: 'motion-trace:ok' },
        { id: 'collision-credibility', passed: true, evidence: 'collision-trace:ok' },
        { id: 'contact-feedback', passed: true, evidence: 'impact-frame:ok' },
        { id: 'retry-friction', passed: true, evidence: 'retry-ms:40' },
        { id: 'drop-trajectory', passed: true, evidence: 'drop-trajectory:ok' },
      ],
    });
    expect(report.passed).toBe(true);
    expect(report.requiredDimensions).toEqual(expect.arrayContaining(['drop trajectory', 'input response']));
    expect(report.requiredDimensions).not.toContain('choice distinction');
  });

  it('blocks a narrative report when consequence/replay evidence is missing', () => {
    const report = evaluateProfileQa({
      gameId: 'g', buildHash: 'a'.repeat(64), profile: 'NARRATIVE_AGENCY', qaPassed: true,
      checks: [{ id: 'choice-distinction', passed: true, evidence: 'choice-a-vs-b' }],
    });
    expect(report.passed).toBe(false);
    expect(report.blockers).toEqual(expect.arrayContaining(['missing:consequence-readability', 'missing:replay-reason']));
  });
});
