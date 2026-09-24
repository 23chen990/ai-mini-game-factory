import { z } from 'zod';

export const AcceptanceStepSchema = z.object({
  action: z.string().trim().min(1),
  expect: z.string().trim().min(1),
  failIf: z.string().trim().min(1),
});

export const AcceptanceHandoffSchema = z.object({
  schemaVersion: z.literal(1),
  targetGame: z.string().trim().min(1),
  targetWorkspace: z.string().trim().min(1),
  entrypoint: z.string().trim().min(1),
  launchCommand: z.string().trim().min(1),
  steps: z.array(AcceptanceStepSchema).min(1),
  passCriteria: z.array(z.string().trim().min(1)).min(1),
  blockers: z.array(z.string().trim().min(1)),
});

export type AcceptanceHandoff = z.infer<typeof AcceptanceHandoffSchema>;

/** Build the player-facing handoff. Acceptance actions and expected visuals
 * intentionally precede any implementation/evidence metadata. */
export function buildAcceptanceHandoff(input: Omit<AcceptanceHandoff, 'schemaVersion'>): AcceptanceHandoff {
  return AcceptanceHandoffSchema.parse({ schemaVersion: 1, ...input });
}
