import { describe, expect, it } from 'vitest';
import { FailurePressureContractSchema } from '../../src/schemas/index.js';

describe('failure-pressure contract', () => {
  const base = {
    schemaVersion: 1 as const,
    purpose: 'Compare finite and endless-run failure pressure.',
    evidence: [{
      id: 'ski-safari', competitor: '滑雪大冒险', sourceRefs: ['video-1'],
      observed: ['Speed and terrain changes create escalating timing pressure.'],
      inferred: ['The player accepts risk to extend a run.'], applicability: 'adapt' as const,
      applicabilityRationale: 'Use the run-length pressure, not the original presentation.',
      rejectExpression: ['Character, terrain and UI expression'], confidence: 'medium' as const,
    }],
    rules: [{
      id: 'run-pressure', pressureType: 'timing' as const, trigger: 'A missed timing window',
      playerSignal: 'Readable approaching obstacle cue', escalation: 'Shorter safe windows over distance',
      failureOutcome: 'Run ends and score is settled', attribution: 'The missed release is visible',
      recovery: 'Immediate restart preserves best score', sourceEvidenceRefs: ['ski-safari'],
      implementationImplications: ['Test at natural input without debug setters'],
    }],
    noCopyBoundary: ['Do not copy names, art, UI, text, tuning or assets.'],
  };

  it('accepts multiple comparator evidence and links rules to evidence', () => {
    expect(FailurePressureContractSchema.parse(base).evidence[0]?.competitor).toBe('滑雪大冒险');
  });

  it('rejects rules that cite unknown evidence', () => {
    expect(() => FailurePressureContractSchema.parse({ ...base, rules: [{ ...base.rules[0], sourceEvidenceRefs: ['missing'] }] })).toThrow(/unknown evidence/);
  });
});
