import { z } from 'zod';

const GateIdSchema = z.enum(['core', 'normalFlow', 'visualEvidence', 'levelDifference', 'humanPlaytest']);
export type CompletionGateId = z.infer<typeof GateIdSchema>;
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u, 'expected a SHA-256 hex digest');

/** Evidence that the player-facing acceptance record was checked against the
 * immutable candidate.  It is kept separate from the five product gates so a
 * report can explain a binding failure without inventing a sixth gameplay
 * dimension. */
export const CandidateBindingSchema = z.object({
  passed: z.boolean(),
  evidence: z.array(z.string().trim().min(1)).min(1),
  blockers: z.array(z.string().trim().min(1)),
}).strict().superRefine((value, context) => {
  if (value.passed && value.blockers.length > 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'a passed candidate binding cannot retain blockers' });
  if (!value.passed && value.blockers.length === 0) context.addIssue({ code: 'custom', path: ['blockers'], message: 'a failed candidate binding requires a blocker' });
});
export type CandidateBinding = z.infer<typeof CandidateBindingSchema>;

const GateSchema = z.object({
  id: GateIdSchema,
  passed: z.boolean(),
  evidence: z.array(z.string().trim().min(1)).min(1),
  owner: z.enum(['BuilderAgent', 'QAAgent', 'HumanReviewer']),
}).strict();

export const CompletionGateReportSchema = z.object({
  schemaVersion: z.literal(1),
  gates: z.array(GateSchema).length(5),
  implementationReady: z.boolean(),
  candidateReady: z.boolean(),
  releaseReady: z.boolean(),
  blockers: z.array(GateIdSchema),
  /** Present once a candidate has been frozen.  Legacy/demo reports may omit
   * it, but a present hash must always carry an explicit binding result. */
  candidateHash: Sha256Schema.optional(),
  candidateBinding: CandidateBindingSchema.optional(),
}).strict().superRefine((value, context) => {
  const byId = new Map(value.gates.map((gate) => [gate.id, gate]));
  const required: CompletionGateId[] = ['core', 'normalFlow', 'visualEvidence', 'levelDifference', 'humanPlaytest'];
  if (required.some((id) => !byId.has(id))) context.addIssue({ code: 'custom', path: ['gates'], message: 'all five completion gates are required' });
  const core = byId.get('core')?.passed === true;
  const candidateIds: CompletionGateId[] = ['normalFlow', 'visualEvidence', 'levelDifference'];
  const candidate = core && candidateIds.every((id) => byId.get(id)?.passed === true);
  if (value.candidateHash && !value.candidateBinding) context.addIssue({ code: 'custom', path: ['candidateBinding'], message: 'candidateHash requires an explicit candidateBinding result' });
  if (value.candidateBinding && !value.candidateHash) context.addIssue({ code: 'custom', path: ['candidateHash'], message: 'candidateBinding requires candidateHash' });
  const release = candidate && byId.get('humanPlaytest')?.passed === true && (value.candidateBinding?.passed ?? true);
  if (value.implementationReady !== core) context.addIssue({ code: 'custom', path: ['implementationReady'], message: 'implementationReady must equal core gate' });
  if (value.candidateReady !== candidate) context.addIssue({ code: 'custom', path: ['candidateReady'], message: 'candidateReady must equal core, normal flow, visual, and level-difference gates' });
  if (value.releaseReady !== release) context.addIssue({ code: 'custom', path: ['releaseReady'], message: 'releaseReady must equal all five gates' });
  const blockers = required.filter((id) => byId.get(id)?.passed !== true);
  if (JSON.stringify(value.blockers) !== JSON.stringify(blockers)) context.addIssue({ code: 'custom', path: ['blockers'], message: 'blockers must list every failed gate in canonical order' });
});

export type CompletionGateReport = z.infer<typeof CompletionGateReportSchema>;
export type CompletionGateInput = Record<CompletionGateId, { passed: boolean; evidence: string[] }>;

export type CompletionGateOptions = {
  candidateHash?: string;
  candidateBinding?: CandidateBinding;
};

export function evaluateCompletionGates(input: CompletionGateInput, options: CompletionGateOptions = {}): CompletionGateReport {
  const ids: CompletionGateId[] = ['core', 'normalFlow', 'visualEvidence', 'levelDifference', 'humanPlaytest'];
  const gates = ids.map((id) => ({
    id,
    passed: input[id].passed,
    evidence: input[id].evidence,
    owner: id === 'core' ? 'BuilderAgent' as const : id === 'humanPlaytest' ? 'HumanReviewer' as const : 'QAAgent' as const,
  }));
  const implementationReady = input.core.passed;
  const candidateReady = implementationReady && input.normalFlow.passed && input.visualEvidence.passed && input.levelDifference.passed;
  return CompletionGateReportSchema.parse({
    schemaVersion: 1,
    gates,
    implementationReady,
    candidateReady,
    releaseReady: candidateReady && input.humanPlaytest.passed && (options.candidateBinding?.passed ?? true),
    blockers: ids.filter((id) => !input[id].passed),
    ...(options.candidateHash ? { candidateHash: options.candidateHash } : {}),
    ...(options.candidateBinding ? { candidateBinding: options.candidateBinding } : {}),
  });
}
