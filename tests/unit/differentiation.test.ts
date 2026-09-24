import { describe, expect, it } from 'vitest';
import { buildDifferentiationContract, evaluateDifferentiationContract } from '../../src/core/differentiation.js';

describe('positive differentiation contract', () => {
  it('requires concrete player-facing twists beyond a reskin', () => {
    const contract = buildDifferentiationContract({ gameId: 'g', title: '灯市', concept: '经营与选择', referenceInsight: '短局目标清晰' });
    expect(contract.twists.length).toBeGreaterThanOrEqual(2);
    expect(evaluateDifferentiationContract(contract).passed).toBe(true);
  });

  it('rejects cosmetic-only differentiation', () => {
    const result = evaluateDifferentiationContract({
      schemaVersion: 1, gameId: 'g', playerPromise: 'same', referenceInsight: 'same', twists: ['换颜色', '换文案'],
      forbiddenCopyFields: ['name'], status: 'BLOCKED', blockers: ['cosmetic'], evidence: ['human-review'], createdAt: new Date().toISOString(),
    });
    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('twists-are-cosmetic-only');
  });
});
