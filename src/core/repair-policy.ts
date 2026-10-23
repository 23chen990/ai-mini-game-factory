import type { QaReport } from '../schemas/index.js';
import { RepairHypothesisSchema, type RepairAttempt, type RepairHypothesis } from '../schemas/repair-policy.js';
import { sha256Text } from './files.js';

export type { RepairAttempt, RepairHypothesis };

export function buildRepairHypothesis(report: QaReport, qaReportPath: string): RepairHypothesis {
  if (report.passed) throw new Error('repair hypothesis requires failed QA evidence');

  const failedChecks = report.checks
    .filter((check) => !check.passed)
    .map(({ name, evidence }) => ({ name: name.trim(), evidence: evidence.trim() }))
    .filter((check) => check.name && check.evidence)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const issues = report.issues
    .map(({ id, severity, message, evidence }) => ({ id: id.trim(), severity, message: message.trim(), evidence: evidence.trim() }))
    .filter((issue) => issue.severity === 'error' && issue.id && issue.message && issue.evidence)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const evidence = [...new Set([
    ...failedChecks.map((check) => check.evidence),
    ...issues.map((issue) => issue.evidence),
  ])];
  if (evidence.length === 0) throw new Error('repair hypothesis requires failed QA evidence');

  // New captures and noisy measurements are evidence, not a new diagnosis.
  // Retry admission changes only when the failed behavior/issue changes.
  const signature = {
    failedChecks: failedChecks.map(({ name }) => name).sort(),
    issues: issues.map(({ id, severity, message }) => ({ id, severity, message })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  };
  const summary = [
    failedChecks.length ? `Failed checks: ${failedChecks.map((check) => check.name).join(', ')}` : '',
    issues.length ? `QA issues: ${issues.map((issue) => `${issue.id} (${issue.message})`).join('; ')}` : '',
  ].filter(Boolean).join('. ');
  return RepairHypothesisSchema.parse({
    id: sha256Text(JSON.stringify(signature)),
    qaReportPath,
    qaReportSha256: sha256Text(JSON.stringify(report)),
    summary,
    failedChecks,
    issues,
    evidence: [qaReportPath, ...evidence],
  });
}

export type RepairAdmission =
  | { allowed: true; reason: 'distinct-evidence-backed-hypothesis' }
  | { allowed: false; reason: 'configured-fix-attempt-ceiling' | 'configured-repair-loop-ceiling' | 'incomplete-prior-attempt' | 'unchanged-build' | 'unchanged-hypothesis' | 'attempt-history-mismatch' | 'stage-attempt-mismatch' };

export function decideRepairAttempt(input: {
  attempt: number;
  maxFixAttempts?: number;
  maxRepairLoops?: number;
  currentBuildHash: string;
  hypothesis: RepairHypothesis;
  previous?: RepairAttempt;
}): RepairAdmission {
  if (input.attempt > Math.min(5, input.maxFixAttempts ?? 5)) return { allowed: false, reason: 'configured-fix-attempt-ceiling' };
  if (input.maxRepairLoops !== undefined && input.attempt > input.maxRepairLoops) return { allowed: false, reason: 'configured-repair-loop-ceiling' };
  if (input.previous?.status === 'started') return { allowed: false, reason: 'incomplete-prior-attempt' };
  if (input.previous && input.previous.inputBuildHash === input.previous.outputBuildHash) return { allowed: false, reason: 'unchanged-build' };
  if (input.previous?.hypothesis.id === input.hypothesis.id) return { allowed: false, reason: 'unchanged-hypothesis' };
  return { allowed: true, reason: 'distinct-evidence-backed-hypothesis' };
}
