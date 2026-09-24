import { describe, expect, it } from 'vitest';
import { buildRandomnessPolicy, seedForRun } from '../../src/core/randomness-policy.js';
import { RandomnessPolicySchema } from '../../src/schemas/randomness.js';

describe('reproducible randomness policy', () => {
  it('separates golden, fuzz and production seeds while keeping injection explicit', () => {
    const policy = buildRandomnessPolicy('game-1');
    expect(RandomnessPolicySchema.parse(policy).injectable).toBe(true);
    expect(policy.modes.map((mode) => mode.name)).toEqual(['golden', 'fuzz', 'production']);
    expect(seedForRun(policy, 'golden', 0)).toBe(policy.modes[0]?.seeds[0]);
    expect(seedForRun(policy, 'fuzz', 4)).toBe(policy.modes[1]?.seeds[4]);
  });

  it('rejects a policy that reuses the same seed across modes', () => {
    expect(() => RandomnessPolicySchema.parse({ schemaVersion: 1, gameId: 'g', injectable: true, modes: [
      { name: 'golden', seeds: [1] }, { name: 'fuzz', seeds: [1] }, { name: 'production', seeds: [2] },
    ], evidenceFields: ['seed', 'buildHash', 'inputTrace'] })).toThrow(/unique|seed/i);
  });
});
