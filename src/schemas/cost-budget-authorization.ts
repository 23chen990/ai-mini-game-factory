import { z } from 'zod';

const Sha256 = z.string().regex(/^[a-f0-9]{64}$/u);

/** Human authorization for reopening one run stopped only by its token cap.
 * It cannot relax money, time, asset, build, or repair ceilings. */
export const CostBudgetAuthorizationSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().trim().min(1),
  scope: z.literal('agent-token-cap'),
  abandonmentDecision: z.object({
    path: z.literal('artifacts/abandonment-decision.json'),
    sha256: Sha256,
  }).strict(),
  previousMaxAgentTokens: z.number().int().positive(),
  maxAgentTokens: z.number().int().positive(),
  authorizedBy: z.literal('human'),
  rationale: z.string().trim().min(1),
  authorizedAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  if (value.maxAgentTokens <= value.previousMaxAgentTokens) {
    context.addIssue({ code: 'custom', path: ['maxAgentTokens'], message: 'authorized token ceiling must increase the previous ceiling' });
  }
});

export type CostBudgetAuthorization = z.infer<typeof CostBudgetAuthorizationSchema>;
