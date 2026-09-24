import { z } from 'zod';

const Text = z.string().trim().min(1);
export const HumanApprovalClassSchema = z.enum(['scheduled', 'conditional', 'async']);
export type HumanApprovalClass = z.infer<typeof HumanApprovalClassSchema>;
export const HumanApprovalSessionIdSchema = z.enum(['GO_NO_GO', 'CORE_DEMO', 'FINAL_RELEASE']);
export type HumanApprovalSessionId = z.infer<typeof HumanApprovalSessionIdSchema>;
const OwnerSchema = z.enum(['HumanReviewer', 'FactoryControlPlane', 'ReleaseAgent']);
const SessionPlanSchema = z.object({
  id: HumanApprovalSessionIdSchema,
  purpose: Text,
  requiredArtifacts: z.array(Text).min(1),
  allowedDecisions: z.array(z.enum(['APPROVE', 'REVISE', 'KILL'])).min(2),
  approvalClass: z.literal('scheduled').default('scheduled'),
  owner: OwnerSchema.default('HumanReviewer'),
  countsTowardScheduledSession: z.literal(true).default(true),
}).strict();
const ExceptionGateSchema = z.object({
  id: z.enum(['reference-conflict', 'rights-unknown', 'platform-unknown', 'differentiation-review', 'waiver', 'manual-dispute']),
  trigger: Text,
  owner: OwnerSchema,
  blocking: z.literal(true),
  requiredEvidence: z.array(Text).min(1),
  approvalClass: z.literal('conditional'),
  countsTowardScheduledSession: z.literal(false),
}).strict();
const AsyncRecordSchema = z.object({
  id: Text,
  purpose: Text,
  owner: OwnerSchema,
  requiredEvidence: z.array(Text).min(1),
  approvalClass: z.literal('async'),
  countsTowardScheduledSession: z.literal(false),
}).strict();
const DEFAULT_CONDITIONAL_GATES = [
  { id: 'reference-conflict' as const, trigger: 'reference conflict requires a human decision', owner: 'HumanReviewer' as const, blocking: true as const, requiredEvidence: ['human/reference-decision.yaml'], approvalClass: 'conditional' as const, countsTowardScheduledSession: false as const },
];
const DEFAULT_ASYNC_RECORDS = [
  { id: 'release-promotion', purpose: 'record an external release event', owner: 'ReleaseAgent' as const, requiredEvidence: ['artifacts/release-manifest.json'], approvalClass: 'async' as const, countsTowardScheduledSession: false as const },
];
const HumanApprovalPlanBaseSchema = z.object({
  schemaVersion: z.literal(1),
  designMode: z.enum(['reference_reskin', 'prototype_tournament']),
  // `sessions` is retained as the compatibility field used by existing runs.
  sessions: z.array(SessionPlanSchema).length(3),
  /** Exactly three approvals are scheduled by default. */
  scheduledSessions: z.array(SessionPlanSchema).length(3),
  exceptionGates: z.array(z.enum(['reference-conflict', 'rights-unknown', 'platform-unknown', 'differentiation-review', 'waiver', 'manual-dispute'])).min(1),
  /** Conditional gates are blocking when triggered, but never extra scheduled sessions. */
  conditionalGates: z.array(ExceptionGateSchema).min(1).default(DEFAULT_CONDITIONAL_GATES),
  /** Paperwork, promotion and other records may be completed asynchronously. */
  asyncRecords: z.array(AsyncRecordSchema).min(1).default(DEFAULT_ASYNC_RECORDS),
  rule: z.literal('three-scheduled-sessions-plus-exceptions'),
}).strict();

/** Populate the explicit matrix for legacy plans that only stored `sessions`. */
export const HumanApprovalPlanSchema = z.preprocess((value) => {
  if (value && typeof value === 'object' && !Array.isArray(value) && !('scheduledSessions' in value)) {
    const record = value as Record<string, unknown>;
    return { ...record, scheduledSessions: record.sessions };
  }
  return value;
}, HumanApprovalPlanBaseSchema).superRefine((plan, context) => {
  const ids = plan.sessions.map((session) => session.id);
  if (new Set(ids).size !== ids.length || !['GO_NO_GO', 'CORE_DEMO', 'FINAL_RELEASE'].every((id) => ids.includes(id as never))) context.addIssue({ code: 'custom', path: ['sessions'], message: 'approval plan must contain each of the three canonical sessions exactly once' });
  const scheduled = plan.scheduledSessions;
  const scheduledIds = scheduled.map((session) => session.id);
  if (new Set(scheduledIds).size !== scheduledIds.length || JSON.stringify(scheduledIds) !== JSON.stringify(ids)) context.addIssue({ code: 'custom', path: ['scheduledSessions'], message: 'scheduledSessions must mirror the three canonical sessions in order' });
  if (scheduled.some((session) => session.approvalClass !== 'scheduled' || !session.countsTowardScheduledSession)) context.addIssue({ code: 'custom', path: ['scheduledSessions'], message: 'scheduled sessions must count toward the scheduled-session total' });
  if (plan.conditionalGates.some((gate) => gate.countsTowardScheduledSession || gate.approvalClass !== 'conditional')) context.addIssue({ code: 'custom', path: ['conditionalGates'], message: 'conditional gates are not scheduled sessions' });
  if (plan.asyncRecords.some((record) => record.countsTowardScheduledSession || record.approvalClass !== 'async')) context.addIssue({ code: 'custom', path: ['asyncRecords'], message: 'async records are not scheduled sessions' });
  const exceptionIds = new Set(plan.exceptionGates);
  for (const gate of plan.conditionalGates) if (!exceptionIds.has(gate.id)) context.addIssue({ code: 'custom', path: ['conditionalGates'], message: `conditional gate ${gate.id} must be listed in exceptionGates` });
});
export type HumanApprovalPlan = z.infer<typeof HumanApprovalPlanSchema>;

/**
 * A durable record of an actual human decision.  The plan above describes
 * what should happen; this record describes what did happen.  Keeping the two
 * separate prevents a generated plan or an agent assertion from counting as
 * an approval.
 */
export const HumanApprovalDecisionSchema = z.enum(['APPROVE', 'REVISE', 'KILL', 'ACK']);
export type HumanApprovalDecision = z.infer<typeof HumanApprovalDecisionSchema>;

export const HumanApprovalRecordSchema = z.object({
  schemaVersion: z.literal(1),
  recordId: Text,
  sessionId: Text,
  approvalClass: HumanApprovalClassSchema,
  decision: HumanApprovalDecisionSchema,
  reviewer: Text,
  /** Paths or immutable evidence identifiers inspected by the reviewer. */
  artifactRefs: z.array(Text).min(1),
  candidateHash: z.string().regex(/^[a-f0-9]{64}$/iu).optional(),
  notes: z.array(Text).default([]),
  recordedAt: z.string().datetime(),
}).strict().superRefine((record, context) => {
  if (record.approvalClass === 'scheduled' && !HumanApprovalSessionIdSchema.safeParse(record.sessionId).success) {
    context.addIssue({ code: 'custom', path: ['sessionId'], message: 'scheduled approval records must use a canonical session id' });
  }
  if (record.approvalClass === 'scheduled' && record.decision === 'ACK') {
    context.addIssue({ code: 'custom', path: ['decision'], message: 'scheduled approvals require APPROVE, REVISE or KILL' });
  }
  if (record.approvalClass === 'conditional' && record.decision === 'ACK') {
    context.addIssue({ code: 'custom', path: ['decision'], message: 'conditional gates require an explicit decision' });
  }
});
export type HumanApprovalRecord = z.infer<typeof HumanApprovalRecordSchema>;

export const HumanApprovalLedgerSchema = z.object({
  schemaVersion: z.literal(1),
  runId: Text,
  records: z.array(HumanApprovalRecordSchema),
  updatedAt: z.string().datetime(),
}).strict();
export type HumanApprovalLedger = z.infer<typeof HumanApprovalLedgerSchema>;

export const HumanApprovalEvaluationSchema = z.object({
  schemaVersion: z.literal(1),
  runId: Text.optional(),
  candidateHash: z.string().regex(/^[a-f0-9]{64}$/iu).optional(),
  passed: z.boolean(),
  blockers: z.array(Text),
  scheduled: z.array(z.object({
    id: HumanApprovalSessionIdSchema,
    status: z.enum(['APPROVED', 'MISSING', 'REJECTED', 'DUPLICATE', 'HASH_MISMATCH']),
    recordId: Text.optional(),
  }).strict()).length(3),
  conditional: z.array(z.object({ id: Text, status: z.enum(['NOT_TRIGGERED', 'APPROVED', 'MISSING', 'REJECTED', 'DUPLICATE']) }).strict()),
  asyncRecords: z.array(z.object({ id: Text, status: z.enum(['RECORDED', 'MISSING', 'DUPLICATE']) }).strict()),
  evaluatedAt: z.string().datetime(),
}).strict();
export type HumanApprovalEvaluation = z.infer<typeof HumanApprovalEvaluationSchema>;
