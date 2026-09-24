import { describe, expect, it } from 'vitest';
import { ContentVariationReportSchema, HumanPlaytestAcceptanceSchema } from '../../src/schemas/factory-operating.js';

describe('operating acceptance artifacts', () => {
  it('requires attributable human playtest evidence', () => {
    expect(() => HumanPlaytestAcceptanceSchema.parse({ schemaVersion: 1, passed: true, sessionId: 's', inputMode: 'touch', notes: [], evidence: ['video.mp4'], approvedAt: new Date().toISOString() })).toThrow();
  });

  it('rejects cosmetic-only variation claims', () => {
    expect(() => ContentVariationReportSchema.parse({ schemaVersion: 1, passed: true, variants: [{ id: 'a', differences: ['text changed'], evidence: ['a.png'] }, { id: 'b', differences: ['palette changed'], evidence: ['b.png'] }], rationale: 'different' })).toThrow();
    expect(ContentVariationReportSchema.parse({ schemaVersion: 1, passed: true, variants: [{ id: 'a', differences: ['route choice changes obstacle order'], evidence: ['a.json'] }, { id: 'b', differences: ['resource trade-off changes'], evidence: ['b.json'] }], rationale: 'structural variation' }).passed).toBe(true);
  });
});
