import { PresentationQualityEvaluationSchema, PresentationQualityReportSchema, type PresentationQualityReport } from '../schemas/presentation-evidence.js';

const profileNeedsHaptics = new Set(['ACTION_FEEL']);

export function evaluatePresentationQuality(value: unknown, options: { requireHaptics?: boolean; maxP95FrameMs?: number; maxMemoryMb?: number } = {}) {
  const report = PresentationQualityReportSchema.parse(value);
  const blockers: string[] = [];
  const dimensions: Array<[string, { status: string; evidence: string[] }]> = [
    ['audio', report.audio],
    ['animation', report.animation],
    ['readability', report.readability],
    ['performance', report.performance],
  ];
  if (options.requireHaptics ?? profileNeedsHaptics.has(report.profile)) dimensions.push(['haptics', report.haptics]);
  for (const [name, dimension] of dimensions) {
    if (dimension.status !== 'PASS') blockers.push(`${name}:${dimension.status.toLowerCase()}`);
    if (dimension.status === 'PASS' && dimension.evidence.length === 0) blockers.push(`${name}:evidence-missing`);
  }
  if (report.consoleErrors.length > 0) blockers.push('console-errors');
  if (report.pageErrors.length > 0) blockers.push('page-errors');
  if (options.maxP95FrameMs !== undefined && (report.performance.p95FrameMs === undefined || report.performance.p95FrameMs > options.maxP95FrameMs)) blockers.push('performance:p95-frame-budget');
  if (options.maxMemoryMb !== undefined && (report.performance.memoryMb === undefined || report.performance.memoryMb > options.maxMemoryMb)) blockers.push('performance:memory-budget');
  return PresentationQualityEvaluationSchema.parse({ passed: blockers.length === 0, blockers: [...new Set(blockers)], report });
}

export function buildPresentationQualityTemplate(input: { gameId: string; buildHash: string; profile: PresentationQualityReport['profile'] }): PresentationQualityReport {
  const now = new Date().toISOString();
  const pending = { status: 'UNKNOWN' as const, evidence: [] };
  return PresentationQualityReportSchema.parse({ schemaVersion: 1, gameId: input.gameId, buildHash: input.buildHash, profile: input.profile, audio: pending, haptics: pending, animation: pending, readability: pending, performance: pending, consoleErrors: [], pageErrors: [], checkedAt: now });
}
