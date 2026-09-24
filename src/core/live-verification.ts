import { LiveVerificationChecksSchema, LiveVerificationSchema, type LiveVerification, type LiveVerificationChecks, type LiveVerificationChecksInput } from '../schemas/live-verification.js';

const checkLabels: Array<[keyof LiveVerificationChecks, string]> = [
  ['startup', 'startup'],
  ['coreLoop', 'core-loop'],
  ['terminalState', 'terminal-state'],
  ['replay', 'replay'],
  ['adFallback', 'ad-fallback'],
  ['rewardIdempotency', 'reward-idempotency'],
  ['saveRestore', 'save-restore'],
  ['telemetry', 'telemetry'],
  ['noConsoleErrors', 'console-errors'],
  ['packageHashMatch', 'package-hash'],
];

export function evaluateLiveVerification(value: unknown) {
  const parsed = LiveVerificationSchema.safeParse(value);
  if (!parsed.success) return { passed: false, blockers: ['schema-invalid'] as string[], report: value };
  const report = parsed.data;
  const blockers = [...report.blockers];
  for (const [key, label] of checkLabels) if (!report.checks[key]) blockers.push(label);
  if (report.evidence.length === 0) blockers.push('evidence-missing');
  const unique = [...new Set(blockers)];
  return { passed: unique.length === 0 && report.status === 'LIVE_VERIFIED', blockers: unique, report };
}

export function buildLiveVerification(input: {
  gameId: string;
  platform: LiveVerification['platform'];
  releaseHash: string;
  packageHash?: string;
  checks: LiveVerificationChecksInput;
  evidence: string[];
  verifier?: string;
}): LiveVerification {
  const checks = LiveVerificationChecksSchema.parse(input.checks);
  const blockers = checkLabels.filter(([key]) => !checks[key]).map(([, label]) => label);
  if (input.evidence.length === 0) blockers.push('evidence-missing');
  if (input.packageHash && input.packageHash !== input.releaseHash) blockers.push('package-hash');
  const unique = [...new Set(blockers)];
  return LiveVerificationSchema.parse({
    schemaVersion: 1,
    gameId: input.gameId,
    platform: input.platform,
    releaseHash: input.releaseHash,
    packageHash: input.packageHash,
    checks,
    evidence: input.evidence,
    blockers: unique,
    status: unique.length === 0 ? 'LIVE_VERIFIED' : 'BLOCKED',
    verifiedAt: new Date().toISOString(),
    verifier: input.verifier ?? 'HumanReviewer',
  });
}
