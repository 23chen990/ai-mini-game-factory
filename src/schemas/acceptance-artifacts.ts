import { z } from 'zod';
import { PrimaryExperienceProfileSchema, SecondaryExperienceProfileSchema } from './experience-profile.js';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu, 'expected a SHA-256 hex digest');
const ProfileRefSchema = z.object({ primary: PrimaryExperienceProfileSchema, secondary: SecondaryExperienceProfileSchema.nullable() }).strict();

const AcceptanceDimensionSchema = z.object({ passed: z.boolean(), evidence: Text }).strict();

/** Game-agnostic contract for verifying that player feedback corresponds to a viable action. */
export const ActionRealizabilitySchema = z.object({
  schemaVersion: z.literal(1),
  actionId: Text,
  feedbackSignal: Text,
  successCondition: Text,
  constraints: z.array(z.object({ id: Text, measure: Text, operator: z.enum(['<=', '>=', '=', 'within']), target: z.number().finite() }).strict()).min(1),
  recovery: z.object({ required: z.boolean(), description: Text }).strict(),
  repetition: z.object({ attempts: z.number().int().positive(), minimumSuccesses: z.number().int().nonnegative() }).strict(),
  evidence: z.array(Text).min(1),
}).strict().superRefine((value, context) => {
  if (value.repetition.minimumSuccesses > value.repetition.attempts) {
    context.addIssue({ code: 'custom', path: ['repetition', 'minimumSuccesses'], message: 'minimumSuccesses cannot exceed attempts' });
  }
});
export type ActionRealizability = z.infer<typeof ActionRealizabilitySchema>;

export const PlayerAcceptanceGateSchema = z.object({
  schemaVersion: z.literal(1),
  core: AcceptanceDimensionSchema,
  normalFlow: AcceptanceDimensionSchema,
  visualEvidence: AcceptanceDimensionSchema,
  levelDifference: AcceptanceDimensionSchema,
  humanPlaytest: AcceptanceDimensionSchema,
  releaseReady: z.boolean(),
  /** Hash of the immutable candidate whose final gates were evaluated. */
  candidateHash: Sha256.optional(),
}).strict().superRefine((value, context) => {
  const allPassed = [value.core, value.normalFlow, value.visualEvidence, value.levelDifference, value.humanPlaytest]
    .every((dimension) => dimension.passed);
  if (value.releaseReady !== allPassed) {
    context.addIssue({ code: 'custom', path: ['releaseReady'], message: 'releaseReady must be derived from all five acceptance dimensions' });
  }
});
export type PlayerAcceptanceGate = z.infer<typeof PlayerAcceptanceGateSchema>;

export function isPlayerAcceptanceReady(gate: PlayerAcceptanceGate): boolean {
  return PlayerAcceptanceGateSchema.parse(gate).releaseReady;
}

export const AcceptanceManifestSchema = z.object({
  schemaVersion: z.literal(1),
  manifestId: Text,
  targetGame: Text,
  targetWorkspace: Text,
  experienceProfile: ProfileRefSchema,
  primaryExperience: Text,
  playTasks: z.array(z.object({ id: Text, goal: Text, input: Text }).strict()).min(3),
  forbiddenShortcuts: z.array(Text).min(1),
  successMetrics: z.array(Text).min(2),
  failureMetrics: z.array(Text).min(2),
  evidenceRequired: z.array(Text).min(2),
}).strict().superRefine((value, context) => {
  if (new Set(value.playTasks.map(({ id }) => id)).size !== value.playTasks.length) {
    context.addIssue({ code: 'custom', path: ['playTasks'], message: 'play task ids must be unique' });
  }
  if (!value.forbiddenShortcuts.some((shortcut) => /debug|scenario|setState|setPose|coordinate|load/i.test(shortcut))) {
    context.addIssue({ code: 'custom', path: ['forbiddenShortcuts'], message: 'manifest must forbid test-oracle shortcuts' });
  }
});
export type AcceptanceManifest = z.infer<typeof AcceptanceManifestSchema>;

export const PlaytestTraceSchema = z.object({
  schemaVersion: z.literal(1),
  manifestId: Text,
  sessionId: Text,
  inputMode: z.enum(['mouse', 'touch', 'keyboard', 'mouse_and_touch']),
  naturalInput: z.literal(true),
  events: z.array(z.object({ atMs: z.number().int().nonnegative(), kind: z.enum(['reset', 'input', 'state', 'feedback', 'decision', 'failure', 'success']), detail: Text }).strict()).min(2),
  outcome: z.enum(['completed', 'failed', 'abandoned', 'blocked']),
  playerNotes: z.array(Text),
  evidence: z.array(Text).min(1),
}).strict().superRefine((value, context) => {
  for (let index = 1; index < value.events.length; index += 1) {
    if (value.events[index]!.atMs < value.events[index - 1]!.atMs) context.addIssue({ code: 'custom', path: ['events'], message: 'playtest events must be chronological' });
  }
  if (value.events[0]?.kind !== 'reset') context.addIssue({ code: 'custom', path: ['events'], message: 'natural play must begin with reset' });
});
export type PlaytestTrace = z.infer<typeof PlaytestTraceSchema>;

export const ProfileReviewReportSchema = z.object({
  schemaVersion: z.literal(1),
  manifestId: Text,
  profile: PrimaryExperienceProfileSchema,
  dimensions: z.object({ primaryExperience: z.enum(['PASS', 'PARTIAL', 'FAIL']), technical: z.enum(['PASS', 'FAIL']), naturalPlay: z.enum(['PASS', 'FAIL']), replayValue: z.enum(['PASS', 'PARTIAL', 'FAIL']) }).strict(),
  issues: z.array(z.object({ id: Text, severity: z.enum(['blocker', 'major', 'minor']), evidence: Text }).strict()),
  decision: z.enum(['APPROVED', 'REWORK', 'REJECTED']),
}).strict().superRefine((value, context) => {
  const blocked = value.dimensions.primaryExperience === 'FAIL' || value.dimensions.naturalPlay === 'FAIL' || value.issues.some(({ severity }) => severity === 'blocker');
  if (blocked && value.decision === 'APPROVED') context.addIssue({ code: 'custom', message: 'a failed primary dimension or blocker cannot be approved' });
  if (value.decision === 'REWORK' && value.issues.length === 0) context.addIssue({ code: 'custom', path: ['issues'], message: 'rework requires actionable issues' });
});
export type ProfileReviewReport = z.infer<typeof ProfileReviewReportSchema>;
