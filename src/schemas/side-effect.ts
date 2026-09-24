import { z } from 'zod';

const Text = z.string().trim().min(1);

export const SideEffectContractSchema = z.object({
  schemaVersion: z.literal(1),
  operation: Text,
  idempotencyKey: Text,
  retryPolicy: z.object({ maxAttempts: z.number().int().positive().max(3), backoffMs: z.number().int().nonnegative(), retryableErrors: z.array(Text).default([]) }).strict(),
  compensation: z.object({ supported: z.boolean(), action: z.string().trim() }).strict(),
  queryBeforeRetry: z.boolean(),
  costCapCents: z.number().int().nonnegative(),
}).strict().superRefine((contract, context) => {
  if (contract.compensation.supported && contract.compensation.action.trim().length === 0) context.addIssue({ code: 'custom', path: ['compensation', 'action'], message: 'supported compensation requires an action' });
  if (!contract.queryBeforeRetry && contract.retryPolicy.maxAttempts > 1) context.addIssue({ code: 'custom', path: ['queryBeforeRetry'], message: 'retrying an external side effect requires a reconciliation query' });
});
export type SideEffectContract = z.infer<typeof SideEffectContractSchema>;
