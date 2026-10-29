import { z } from 'zod';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/iu);

export const RepairHypothesisSchema = z.object({
  id: Sha256,
  qaReportPath: Text,
  qaReportSha256: Sha256,
  summary: Text,
  failedChecks: z.array(z.object({ name: Text, evidence: Text }).strict()),
  issues: z.array(z.object({ id: Text, severity: z.enum(['error', 'warning']), message: Text, evidence: Text }).strict()),
  evidence: z.array(Text).min(1),
}).strict();
export type RepairHypothesis = z.infer<typeof RepairHypothesisSchema>;

export const RepairQaEvidenceSchema = z.object({
  sequence: z.number().int().positive(),
  artifactPath: Text,
  reportSha256: Sha256,
  buildHash: Sha256,
  screenshots: z.array(Text),
  evidenceFiles: z.array(z.object({ sourcePath: Text, artifactPath: Text, sha256: Sha256 }).strict()),
}).strict();

export const RepairAttemptSchema = z.object({
  attempt: z.number().int().positive(),
  status: z.enum(['started', 'completed']),
  inputBuildHash: Sha256,
  outputBuildHash: Sha256.optional(),
  hypothesis: RepairHypothesisSchema,
  qaReportPath: Text,
  inputThreadId: Text.optional(),
  outputThreadId: Text.optional(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
  summary: Text.optional(),
  verification: z.array(Text).default([]),
}).strict().superRefine((attempt, context) => {
  if (attempt.status === 'completed' && (!attempt.outputBuildHash || !attempt.finishedAt || !attempt.summary)) {
    context.addIssue({ code: 'custom', message: 'completed repair attempts require output build, completion time and summary' });
  }
});
export type RepairAttempt = z.infer<typeof RepairAttemptSchema>;

export const RepairHistorySchema = z.object({
  schemaVersion: z.literal(1),
  qaReports: z.array(RepairQaEvidenceSchema),
  attempts: z.array(RepairAttemptSchema),
}).strict().superRefine((history, context) => {
  const attemptNumbers = history.attempts.map((attempt) => attempt.attempt);
  if (new Set(attemptNumbers).size !== attemptNumbers.length) context.addIssue({ code: 'custom', path: ['attempts'], message: 'repair attempt numbers must be unique' });
  if (attemptNumbers.some((attempt, index) => attempt !== index + 1)) context.addIssue({ code: 'custom', path: ['attempts'], message: 'repair attempts must be contiguous and append-only' });
  const qaSequences = history.qaReports.map((report) => report.sequence);
  if (new Set(qaSequences).size !== qaSequences.length) context.addIssue({ code: 'custom', path: ['qaReports'], message: 'QA report sequence numbers must be unique' });
  if (qaSequences.some((sequence, index) => sequence !== index + 1)) context.addIssue({ code: 'custom', path: ['qaReports'], message: 'QA reports must be contiguous and append-only' });
});
export type RepairHistory = z.infer<typeof RepairHistorySchema>;

export const RepairAdmissionRecordSchema = z.object({
  schemaVersion: z.literal(1),
  attempt: z.number().int().positive(),
  currentBuildHash: Sha256,
  allowed: z.boolean(),
  reason: z.enum([
    'distinct-evidence-backed-hypothesis',
    'configured-fix-attempt-ceiling',
    'configured-repair-loop-ceiling',
    'incomplete-prior-attempt',
    'unchanged-build',
    'unchanged-hypothesis',
    'attempt-history-mismatch',
    'stage-attempt-mismatch',
  ]),
  hypothesis: RepairHypothesisSchema,
  checkedAt: z.string().datetime(),
}).strict();
