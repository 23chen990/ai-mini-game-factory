import { z } from 'zod';
import { ProductionLineDecisionLineSchema } from './production-line.js';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/u, 'expected a SHA-256 hex digest');

/** A single observable state transition captured while using player input. */
export const NaturalFlowTransitionSchema = z.object({
  name: Text,
  changed: z.boolean(),
  evidence: Text,
}).strict();
export type NaturalFlowTransition = z.infer<typeof NaturalFlowTransitionSchema>;

/**
 * Evidence for the representative flow.  This is intentionally separate from
 * STATE_COVERAGE evidence: a test API may observe state, but it cannot create
 * a natural input trace or silently turn a screenshot into a completed loop.
 * `automatic-progress` is retained for legitimate auto-running products in
 * the fast lane; strict release gates require an explicit settlement/terminal
 * outcome.
 */
export const NaturalFlowEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  line: ProductionLineDecisionLineSchema.optional(),
  startedFromReset: z.boolean(),
  actions: z.array(Text).default([]),
  transitions: z.array(NaturalFlowTransitionSchema).default([]),
  completion: z.enum(['settlement', 'terminal', 'automatic-progress', 'none']),
  replayObserved: z.boolean(),
  forbiddenOperations: z.array(Text).default([]),
  screenshots: z.array(Text).default([]),
  passed: z.boolean(),
  blockers: z.array(Text).default([]),
  runner: Text.default('trusted-qa-runner'),
  /** Trusted-runner provenance; optional for legacy local traces, required by
   * strict release evaluation. */
  buildHash: Sha256.optional(),
  runtime: Text.optional(),
  device: z.object({ width: z.number().int().positive(), height: z.number().int().positive(), label: Text }).strict().optional(),
  seed: z.union([z.number().int(), Text]).optional(),
  observedAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  if (value.passed && value.blockers.length > 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'a passed natural-flow report cannot retain blockers' });
  if (value.passed && value.forbiddenOperations.length > 0) context.addIssue({ code: 'custom', path: ['forbiddenOperations'], message: 'a passed natural-flow report cannot contain state-forcing operations' });
});
export type NaturalFlowEvidence = z.infer<typeof NaturalFlowEvidenceSchema>;
