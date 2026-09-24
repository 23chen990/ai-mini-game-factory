import { z } from 'zod';

const Text = z.string().trim().min(1);
const ActionId = z.string().trim().min(1).regex(/^[a-zA-Z0-9._:-]+$/u);

export const InteractionConstraintSchema = z.object({
  id: Text,
  measure: Text,
  operator: z.enum(['<=', '>=', '=', 'within']),
  target: z.number().finite(),
}).strict();
export type InteractionConstraint = z.infer<typeof InteractionConstraintSchema>;

export const InteractionRecoverySchema = z.object({
  required: z.boolean(),
  description: Text,
  mechanism: Text.optional(),
  maxSteps: z.number().int().positive().optional(),
}).strict();
export type InteractionRecovery = z.infer<typeof InteractionRecoverySchema>;

export const InteractionRepetitionSchema = z.object({
  attempts: z.number().int().positive(),
  minimumSuccesses: z.number().int().nonnegative(),
}).strict().superRefine((value, context) => {
  if (value.minimumSuccesses > value.attempts) context.addIssue({ code: 'custom', path: ['minimumSuccesses'], message: 'minimumSuccesses cannot exceed attempts' });
});
export type InteractionRepetition = z.infer<typeof InteractionRepetitionSchema>;

export const InteractionEvidenceSchema = z.object({
  flow: z.array(Text).min(1),
  state: z.array(Text).min(1),
  visual: z.array(Text).min(1),
}).strict();
export type InteractionEvidence = z.infer<typeof InteractionEvidenceSchema>;

export const InteractionActionSchema = z.object({
  actionId: ActionId,
  feedbackSignal: Text,
  successCondition: Text,
  constraints: z.array(InteractionConstraintSchema).min(1),
  recovery: InteractionRecoverySchema,
  repetition: InteractionRepetitionSchema,
  /** A terminal success is forbidden by default. If a line uses settlement,
   * it must explicitly prove that the player can replay after it. */
  successTerminalMode: z.enum(['forbidden', 'replayable', 'settlement']).default('forbidden'),
  replayableAfterSuccess: z.boolean().default(false),
  evidence: InteractionEvidenceSchema,
}).strict();
export type InteractionAction = z.infer<typeof InteractionActionSchema>;

/** Builder-produced node facts. These are intentionally semantic and do not
 * mention hooks, ropes, jumps, cards, weapons or any other mechanic. */
export const InteractionNodeSchema = z.object({
  nodeId: Text,
  actionId: ActionId,
  feedbackVisible: z.boolean(),
  highlightedActionId: ActionId.nullable(),
  actionCandidates: z.array(ActionId),
  selectedActionId: ActionId.nullable(),
  success: z.boolean(),
  successState: Text,
  terminal: z.boolean(),
  recoverable: z.boolean(),
  successorIds: z.array(Text),
  failure: z.boolean(),
  recoverySuccessorIds: z.array(Text),
  physicalResult: Text,
  candidateVerified: z.boolean(),
  stateTransitionVerified: z.boolean(),
  physicalResultVerified: z.boolean(),
  fixedStepTick: z.number().int().nonnegative().optional(),
}).strict();
export type InteractionNode = z.infer<typeof InteractionNodeSchema>;

export const InteractionScenarioSchema = z.object({
  id: z.enum(['normal', 'edge', 'rescue']),
  path: z.array(Text).optional(),
  simulated: z.boolean(),
  passed: z.boolean(),
  fixedStepTicks: z.number().int().positive(),
  evidence: z.array(Text).min(1),
}).strict();
export type InteractionScenario = z.infer<typeof InteractionScenarioSchema>;

export const InteractionContinuityContractSchema = z.object({
  schemaVersion: z.literal(1),
  contractId: Text,
  gameId: Text,
  targetWorkspace: Text,
  fixedStepMs: z.number().int().positive(),
  actions: z.array(InteractionActionSchema).min(1),
  nodes: z.array(InteractionNodeSchema).min(1),
  scenarios: z.array(InteractionScenarioSchema).min(3),
}).strict().superRefine((value, context) => {
  if (new Set(value.actions.map(({ actionId }) => actionId)).size !== value.actions.length) context.addIssue({ code: 'custom', path: ['actions'], message: 'action ids must be unique' });
  if (new Set(value.nodes.map(({ nodeId }) => nodeId)).size !== value.nodes.length) context.addIssue({ code: 'custom', path: ['nodes'], message: 'node ids must be unique' });
  if (new Set(value.scenarios.map(({ id }) => id)).size !== value.scenarios.length || !(['normal', 'edge', 'rescue'] as const).every((id) => value.scenarios.some((scenario) => scenario.id === id))) context.addIssue({ code: 'custom', path: ['scenarios'], message: 'normal, edge and rescue scenarios are each required exactly once' });
  const actionIds = new Set(value.actions.map(({ actionId }) => actionId));
  for (const node of value.nodes) if (!actionIds.has(node.actionId)) context.addIssue({ code: 'custom', path: ['nodes'], message: `node ${node.nodeId} references unknown action ${node.actionId}` });
});
export type InteractionContinuityContract = z.infer<typeof InteractionContinuityContractSchema>;

export const InteractionContinuityObservationNodeSchema = InteractionNodeSchema.omit({ successState: true, physicalResult: true, fixedStepTick: true }).extend({
  physicalResult: Text.optional(),
}).strict();
export type InteractionContinuityObservationNode = z.infer<typeof InteractionContinuityObservationNodeSchema>;

export const InteractionRepetitionObservationSchema = z.object({ actionId: ActionId, attempts: z.number().int().nonnegative(), successes: z.number().int().nonnegative() }).strict();
export const InteractionContinuityObservationSchema = z.object({
  nodes: z.array(InteractionContinuityObservationNodeSchema),
  scenarios: z.array(InteractionScenarioSchema).optional(),
  repetitions: z.array(InteractionRepetitionObservationSchema),
}).strict();
export type InteractionContinuityObservation = z.infer<typeof InteractionContinuityObservationSchema>;

export const InteractionContinuityReportSchema = z.object({
  schemaVersion: z.literal(1),
  contractId: Text,
  passed: z.boolean(),
  blockers: z.array(Text),
  failureKinds: z.array(z.enum(['NO_FOLLOWUPS', 'UNVERIFIABLE_SUCCESS', 'RECOVERY_MISSING', 'CANDIDATE_FEEDBACK_MISMATCH', 'UNVERIFIABLE_PHYSICAL_RESULT', 'SCENARIO_MISSING', 'REPETITION_FAILED'])).default([]),
  evidence: z.array(Text),
  actionEvidenceMap: z.record(z.string(), z.record(z.enum(['normal', 'edge', 'rescue']), z.array(Text).min(1))).optional(),
  checkedNodes: z.number().int().nonnegative(),
  checkedScenarios: z.number().int().nonnegative(),
  checkedRepetitions: z.number().int().nonnegative(),
  evaluatedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((value, context) => {
  if (value.passed && value.blockers.length > 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'passed reports cannot retain blockers' });
  if (!value.passed && value.blockers.length === 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'failed reports require blockers' });
});
export type InteractionContinuityReport = z.infer<typeof InteractionContinuityReportSchema>;

export const InteractionContinuitySummarySchema = z.object({
  schemaVersion: z.literal(1),
  contractId: Text,
  continuityPass: z.boolean(),
  checkedActionCount: z.number().int().nonnegative(),
  checkedNodeCount: z.number().int().nonnegative(),
  checkedScenarioCount: z.number().int().nonnegative(),
  failedNodeCount: z.number().int().nonnegative(),
  missingEvidenceCount: z.number().int().nonnegative(),
}).strict();
export type InteractionContinuitySummary = z.infer<typeof InteractionContinuitySummarySchema>;
