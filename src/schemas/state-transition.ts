import { z } from 'zod';
import { StageNameSchema } from './stage-name.js';

const Text = z.string().trim().min(1);

/** One durable state change. This is an audit record, not an instruction to a
 * provider; the state machine remains the authority for legality. */
export const StateTransitionRecordSchema = z.object({
  from: StageNameSchema,
  to: StageNameSchema,
  reason: Text,
  at: z.string().datetime(),
  runId: Text.optional(),
}).strict();
export type StateTransitionRecord = z.infer<typeof StateTransitionRecordSchema>;

export const StateTransitionAuditSchema = z.object({
  passed: z.boolean(),
  blockers: z.array(Text),
}).strict();
export type StateTransitionAudit = z.infer<typeof StateTransitionAuditSchema>;

/** Durable report written by the control plane after checking the history. */
export const StateTransitionReportSchema = z.object({
  schemaVersion: z.literal(1),
  passed: z.boolean(),
  blockers: z.array(Text),
  checkedAt: z.string().datetime(),
  transitionCount: z.number().int().nonnegative(),
}).strict();
export type StateTransitionReport = z.infer<typeof StateTransitionReportSchema>;
