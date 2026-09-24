import { sha256Text } from './files.js';
import { RandomnessPolicySchema, type RandomnessPolicy } from '../schemas/randomness.js';

function deterministicSeed(gameId: string, label: string, index: number) {
  return Number.parseInt(sha256Text(`${gameId}:${label}:${index}`).slice(0, 8), 16) >>> 0;
}

export function buildRandomnessPolicy(gameId: string): RandomnessPolicy {
  const modes = [
    { name: 'golden' as const, seeds: [deterministicSeed(gameId, 'golden', 0)] },
    { name: 'fuzz' as const, seeds: Array.from({ length: 8 }, (_, index) => deterministicSeed(gameId, 'fuzz', index)) },
    { name: 'production' as const, seeds: Array.from({ length: 4 }, (_, index) => deterministicSeed(gameId, 'production', index)) },
  ];
  return RandomnessPolicySchema.parse({ schemaVersion: 1, gameId, injectable: true, modes, evidenceFields: ['seed', 'buildHash', 'inputTrace'] });
}

export function seedForRun(policyValue: RandomnessPolicy, mode: RandomnessPolicy['modes'][number]['name'], index: number) {
  const policy = RandomnessPolicySchema.parse(policyValue); const selected = policy.modes.find((item) => item.name === mode); if (!selected) throw new Error(`unknown randomness mode: ${mode}`); return selected.seeds[((Math.trunc(index) % selected.seeds.length) + selected.seeds.length) % selected.seeds.length]!;
}
