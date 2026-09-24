import { QualityBaselineCheckIdSchema, QualityBaselineReportSchema, type QualityBaselineCheckId, type QualityBaselineReport } from '../schemas/quality-baseline.js';

export const QUALITY_BASELINE_CHECKS: QualityBaselineCheckId[] = [...QualityBaselineCheckIdSchema.options];
const HUMAN_CHECKS = new Set<QualityBaselineCheckId>(['ad-contract', 'anti-addiction', 'natural-play']);

export type QualityBaselineInput = Partial<Record<QualityBaselineCheckId, { passed: boolean; evidence: string[]; notes?: string; owner?: 'deterministic' | 'QAAgent' | 'HumanReviewer' }>>;

export function evaluateQualityBaseline(input: QualityBaselineInput): QualityBaselineReport {
  const checks = QUALITY_BASELINE_CHECKS.map((id) => {
    const item = input[id];
    return {
      id,
      passed: item?.passed === true,
      evidence: item?.evidence?.filter((e) => e.trim().length > 0) ?? [`baseline:${id}:missing`],
      owner: item?.owner ?? (HUMAN_CHECKS.has(id) ? 'HumanReviewer' as const : 'deterministic' as const),
      ...(item?.notes ? { notes: item.notes } : {}),
    };
  });
  const blockers = QUALITY_BASELINE_CHECKS.filter((id) => !checks.find((check) => check.id === id)?.passed);
  return QualityBaselineReportSchema.parse({ schemaVersion: 1, checks, passed: blockers.length === 0, blockers, artifactHashes: {}, checkedAt: new Date().toISOString() });
}

