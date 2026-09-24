import { z } from 'zod';

const Text = z.string().trim().min(1);

export const ExperienceContractSchema = z.object({
  schemaVersion: z.literal(1),
  contractId: Text,
  targetGame: Text,
  targetWorkspace: Text,
  lockedBy: z.literal('human'),
  pillars: z.array(z.object({ id: Text, name: Text, observable: Text }).strict()).min(3),
  feedbackTiming: z.object({
    impactMs: z.number().int().nonnegative().max(500),
    settleMs: z.number().int().positive().max(5000),
    inputNeverBlocked: z.literal(true),
  }).strict(),
  motionInvariants: z.array(Text).min(3),
  causalRules: z.array(Text).min(3),
  antiPatterns: z.array(Text).min(3),
  acceptanceIds: z.array(Text).min(4),
}).strict().superRefine((value, context) => {
  if (new Set(value.pillars.map(({ id }) => id)).size !== value.pillars.length) {
    context.addIssue({ code: 'custom', path: ['pillars'], message: 'experience pillar ids must be unique' });
  }
  if (value.feedbackTiming.impactMs > value.feedbackTiming.settleMs) {
    context.addIssue({ code: 'custom', path: ['feedbackTiming'], message: 'impact feedback must resolve before settle feedback' });
  }
});
export type ExperienceContract = z.infer<typeof ExperienceContractSchema>;

export const NaturalPlayPlanSchema = z.object({
  schemaVersion: z.literal(1),
  contractId: Text,
  startCommand: z.literal('resetGame'),
  inputMode: z.enum(['mouse_and_touch', 'keyboard_and_touch', 'touch_only']),
  forbiddenApis: z.array(Text).min(1),
  scenarios: z.array(z.object({ id: Text, goal: Text }).strict()).min(3),
  successCriteria: z.array(Text).min(3),
  evidenceCheckpoints: z.array(Text).min(2),
  oracleFree: z.literal(true),
}).strict().superRefine((value, context) => {
  if (new Set(value.scenarios.map(({ id }) => id)).size !== value.scenarios.length) {
    context.addIssue({ code: 'custom', path: ['scenarios'], message: 'natural-play scenario ids must be unique' });
  }
  if (!value.forbiddenApis.some((api) => /debug|loadScenario|setVelocity|setPose/i.test(api))) {
    context.addIssue({ code: 'custom', path: ['forbiddenApis'], message: 'natural-play plans must forbid debug or scenario shortcuts' });
  }
});
export type NaturalPlayPlan = z.infer<typeof NaturalPlayPlanSchema>;

export const ExperienceReviewReportSchema = z.object({
  schemaVersion: z.literal(1),
  contractId: Text,
  statuses: z.object({ mechanics: z.enum(['PASS', 'FAIL']), feel: z.enum(['PASS', 'FAIL']), naturalPlay: z.enum(['PASS', 'FAIL']), presentation: z.enum(['PASS', 'PARTIAL', 'FAIL']) }).strict(),
  oracleDetected: z.boolean(),
  issues: z.array(z.object({ id: Text, severity: z.enum(['blocker', 'major', 'minor']), category: z.enum(['motion', 'feedback', 'readability', 'natural-play', 'oracle']), evidence: Text }).strict()),
  decision: z.enum(['APPROVED', 'FEEL_REPAIR_REQUIRED', 'REJECTED']),
}).strict().superRefine((value, context) => {
  const failed = value.statuses.feel === 'FAIL' || value.statuses.naturalPlay === 'FAIL' || value.oracleDetected;
  if (failed && value.decision === 'APPROVED') context.addIssue({ code: 'custom', message: 'experience cannot be approved with failed feel/natural-play or oracle evidence' });
  if (value.decision === 'FEEL_REPAIR_REQUIRED' && value.issues.length === 0) context.addIssue({ code: 'custom', path: ['issues'], message: 'feel repair requires actionable issues' });
});
export type ExperienceReviewReport = z.infer<typeof ExperienceReviewReportSchema>;
