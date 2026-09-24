import { z } from 'zod';

const Text = z.string().trim().min(1);
const ArtifactRefSchema = z.object({
  path: Text,
  sha256: z.string().regex(/^[a-f0-9]{64}$/iu),
}).strict();

const PrototypeSlotSchema = z.enum(['A', 'B', 'C']);
const EngineeringBuildHashSchema = z.object({
  slot: PrototypeSlotSchema,
  workspace: Text,
  buildHash: z.string().regex(/^[a-f0-9]{64}$/iu),
}).strict();

const EvidenceGateSchema = z.object({
  passed: z.boolean(),
  evidence: z.array(Text),
  blockers: z.array(Text).default([]),
  targetRunId: Text.optional(),
  targetGame: Text.optional(),
  targetWorkspace: Text.optional(),
  experimentId: Text.optional(),
  buildHash: z.string().regex(/^[a-f0-9]{64}$/iu).optional(),
  freshContext: z.boolean().optional(),
  naturalInput: z.boolean().optional(),
  replayObserved: z.boolean().optional(),
  completion: z.enum(['settlement', 'terminal', 'automatic-progress', 'none']).optional(),
  fixtureOnly: z.boolean().optional(),
  playerVisible: z.boolean().optional(),
  authorIndependent: z.boolean().optional(),
}).strict();

export const ProfileIndependentEvidenceSchema = EvidenceGateSchema;
export type ProfileIndependentEvidence = z.infer<typeof ProfileIndependentEvidenceSchema>;

/** The deterministic action report is valid only for the exact candidate
 * dist trees that were measured. Natural/perceptual evidence cannot refresh
 * a report after those bytes change. */
export const ActionFeelEngineeringBuildBindingSchema = z.object({
  schemaVersion: z.literal(1),
  targetRunId: Text,
  targetGame: Text,
  experimentId: Text,
  engineeringReport: ArtifactRefSchema.extend({
    path: z.literal('artifacts/action-feel-natural-play-qa.json'),
  }),
  candidates: z.array(EngineeringBuildHashSchema).length(3),
}).strict().superRefine((value, context) => {
  if (new Set(value.candidates.map((candidate) => candidate.slot)).size !== 3) context.addIssue({ code: 'custom', path: ['candidates'], message: 'engineering build bindings must contain A, B and C exactly once' });
  if (new Set(value.candidates.map((candidate) => candidate.workspace)).size !== 3) context.addIssue({ code: 'custom', path: ['candidates'], message: 'engineering build bindings must use isolated workspaces' });
});
export type ActionFeelEngineeringBuildBinding = z.infer<typeof ActionFeelEngineeringBuildBindingSchema>;

export const ProfileStageEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  stage: z.enum(['FEEL_PROTOTYPE', 'NATURAL_PLAY_QA', 'EXPERIENCE_REVIEW']),
  targetRunId: Text,
  targetGame: Text,
  targetWorkspace: Text,
  profile: z.literal('ACTION_FEEL'),
  productionLine: z.literal('cut-stack-dodge'),
  status: z.enum(['READY', 'BLOCKED']),
  sourceArtifacts: z.array(ArtifactRefSchema).min(1),
  checks: z.array(z.object({
    id: Text,
    passed: z.boolean(),
    evidence: Text,
  }).strict()).min(1),
  independentEvidence: z.object({
    naturalPlay: EvidenceGateSchema.optional(),
    visual: EvidenceGateSchema.optional(),
    perceptual: EvidenceGateSchema.optional(),
  }).strict().optional(),
  createdAt: z.string().datetime(),
}).strict();

export type ProfileStageEvidence = z.infer<typeof ProfileStageEvidenceSchema>;

export const ProfileRepairTriageSchema = z.object({
  schemaVersion: z.literal(1),
  stage: z.literal('FEEL_REPAIR'),
  targetRunId: Text,
  targetGame: Text,
  targetWorkspace: Text,
  issueId: Text,
  classification: z.enum(['contract', 'natural-play', 'threshold']),
  scope: z.array(Text).min(1),
  reproduction: z.object({
    objectType: Text,
    lifecycleBranch: Text,
    rendererPath: Text,
    viewport: Text,
  }).strict(),
  evidence: z.array(ArtifactRefSchema).min(1),
  repairHypothesis: Text,
  acceptanceCriteria: z.array(Text).min(1),
  createdAt: z.string().datetime(),
}).strict();

export type ProfileRepairTriage = z.infer<typeof ProfileRepairTriageSchema>;
