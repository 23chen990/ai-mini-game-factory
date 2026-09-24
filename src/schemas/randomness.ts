import { z } from 'zod';

export const RandomnessModeSchema = z.object({ name: z.enum(['golden', 'fuzz', 'production']), seeds: z.array(z.number().int().nonnegative()).min(1) }).strict();
export const RandomnessPolicySchema = z.object({ schemaVersion: z.literal(1), gameId: z.string().trim().min(1), injectable: z.literal(true), modes: z.array(RandomnessModeSchema).length(3), evidenceFields: z.array(z.enum(['seed', 'buildHash', 'inputTrace'])).min(3) }).strict().superRefine((policy, context) => {
  if (new Set(policy.modes.map((mode) => mode.name)).size !== 3) context.addIssue({ code: 'custom', path: ['modes'], message: 'randomness modes must be unique' });
  const seen = new Set<number>();
  for (const mode of policy.modes) for (const seed of mode.seeds) { if (seen.has(seed)) context.addIssue({ code: 'custom', path: ['modes'], message: `seed ${seed} must not be reused across modes` }); seen.add(seed); }
});
export type RandomnessPolicy = z.infer<typeof RandomnessPolicySchema>;
