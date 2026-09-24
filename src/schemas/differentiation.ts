import { z } from 'zod';
const Text = z.string().trim().min(1);
export const DifferentiationContractSchema = z.object({
  schemaVersion: z.literal(1), gameId: Text, playerPromise: Text, referenceInsight: Text,
  twists: z.array(Text).min(2), forbiddenCopyFields: z.array(Text).min(1), status: z.enum(['PASS', 'BLOCKED']), blockers: z.array(Text), evidence: z.array(Text).min(1), createdAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  if (value.status === 'PASS' && value.blockers.length > 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'PASS differentiation cannot retain blockers' });
  if (value.status === 'BLOCKED' && value.blockers.length === 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'BLOCKED differentiation requires blockers' });
});
export type DifferentiationContract = z.infer<typeof DifferentiationContractSchema>;
