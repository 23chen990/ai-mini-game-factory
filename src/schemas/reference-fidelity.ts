import { z } from 'zod';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);

export const REFERENCE_BEHAVIOR_DIMENSIONS = ['input_state', 'spatial_relation', 'failure_recovery', 'feedback_sequence', 'terminal_replay'] as const;
export const ReferenceBehaviorCheckSchema = z.object({
  id: Text,
  dimension: z.enum(REFERENCE_BEHAVIOR_DIMENSIONS),
  sourceRefs: z.array(z.object({ path: Text, sha256: Sha256, locator: Text }).strict()).min(1),
  objectType: Text,
  stateBranch: Text,
  playerInput: Text,
  expectedStateChange: Text,
  /** Causal support, reachability and attachment relationships; not copied coordinates or UI. */
  spatialRelationship: Text,
  visibleFeedback: z.object({ anchor: Text, eventOrder: z.array(Text).min(2) }).strict(),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict(),
}).strict();
export type ReferenceBehaviorCheck = z.infer<typeof ReferenceBehaviorCheckSchema>;

/** The minimum behavior contract a reference-preview Builder must receive. */
export const ReferenceFidelityContractSchema = z.object({
  schemaVersion: z.literal(1),
  targetRunId: Text,
  referenceName: Text,
  provenance: z.array(z.object({ path: Text, sha256: Sha256 }).strict()),
  coreLoopOrder: z.array(Text).min(4),
  inputStateTransitions: z.array(Text),
  failureRecoveryRules: z.array(Text),
  mustPreserveMechanics: z.array(Text).default([]),
  progressionSystems: z.array(Text).default([]),
  unlockRules: z.array(Text).default([]),
  /** Legacy artifacts remain readable; the preview gate blocks missing behavioral analysis. */
  behaviorChecks: z.array(ReferenceBehaviorCheckSchema).default([]),
  feedbackTimingBands: z.object({
    immediateSeconds: z.number().positive().max(10),
    microGoalMinSeconds: z.number().positive().max(600),
    microGoalMaxSeconds: z.number().positive().max(600),
  }).strict(),
  status: z.enum(['READY', 'BLOCKED']),
  blockers: z.array(Text),
}).strict().superRefine((value, context) => {
  if (value.status === 'READY' && value.blockers.length > 0) context.addIssue({ code: 'custom', path: ['status'], message: 'READY fidelity contracts cannot retain blockers' });
  if (value.status === 'BLOCKED' && value.blockers.length === 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'BLOCKED fidelity contracts require blockers' });
});

export type ReferenceFidelityContract = z.infer<typeof ReferenceFidelityContractSchema>;

const EvidenceFile = z.object({ path: Text, sha256: Sha256 }).strict();
/** Authored by an independent QA reviewer after inspecting natural input and pixels. */
export const ReferenceFidelityReviewSchema = z.object({
  schemaVersion: z.literal(1),
  targetRunId: Text,
  workspace: Text,
  contractHash: Sha256,
  buildHash: Sha256,
  reviewer: z.enum(['QAAgent', 'HumanReviewer']),
  authorIndependent: z.literal(true),
  cases: z.array(z.object({
    checkId: Text,
    objectType: Text,
    stateBranch: Text,
    viewport: ReferenceBehaviorCheckSchema.shape.viewport,
    passed: z.boolean(),
    perceptualPassed: z.boolean(),
    observedStateChange: Text,
    observedFeedback: Text,
    screenshots: z.array(EvidenceFile).min(1),
    trace: EvidenceFile,
  }).strict()),
}).strict();

export const ReferenceFidelityGateSchema = z.object({
  schemaVersion: z.literal(1),
  targetRunId: Text,
  contractHash: Sha256.nullable(),
  buildHash: Sha256,
  passed: z.boolean(),
  blockers: z.array(Text),
  requiredCheckIds: z.array(Text),
  checkedIds: z.array(Text),
}).strict().superRefine((gate, ctx) => {
  if (gate.passed !== (gate.blockers.length === 0)) ctx.addIssue({ code: 'custom', message: 'fidelity gate status must match its blockers' });
});
