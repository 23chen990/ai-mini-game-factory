import { AccountCheckSchema, BusinessPreflightSchema, CostBudgetSchema, type BusinessPreflight, type CostBudget, type PlatformReleaseMatrix, type QaEvidence } from '../schemas/factory-operating.js';
import type { CompletionGateReport } from './completion-gates.js';
import { evaluateQaEvidence } from './qa-evidence.js';

export function buildBusinessPreflightTemplate(input: { targets: BusinessPreflight['targets']; optionalTargets?: BusinessPreflight['optionalTargets']; budget: CostBudget; entity?: BusinessPreflight['entity'] }): BusinessPreflight {
  const targets = [...new Set(input.targets)];
  const optionalTargets = [...new Set((input.optionalTargets ?? []).filter((target) => !targets.includes(target)))];
  const now = new Date().toISOString();
  const accountChecks = targets.map((platform) => AccountCheckSchema.parse({ platform, status: 'unknown', evidence: ['human-account-check-required'], checkedAt: now }));
  return BusinessPreflightSchema.parse({ schemaVersion: 1, entity: input.entity ?? 'personal', monetization: 'IAA', targets, optionalTargets, accountChecks, rightsStatus: 'unknown', payoutStatus: 'unknown', budget: CostBudgetSchema.parse(input.budget), decision: 'PAUSE', blockers: [...targets, 'rights', 'payout'], unknowns: [...targets, 'rights', 'payout'], checkedAt: now });
}

export function evaluateOperatingGates(input: {
  completion: CompletionGateReport;
  qaEvidence: QaEvidence[] | undefined;
  /** Full natural-flow trace emitted by the trusted browser runner. */
  naturalFlow?: unknown;
  business: BusinessPreflight;
  platform: PlatformReleaseMatrix;
  costPassed?: boolean;
  /** Expected immutable build identity for strict QA evidence binding. */
  expectedBuildHash?: string;
  requireQaProvenance?: boolean;
  expectedRuntime?: string;
  expectedDevice?: { width: number; height: number; label: string };
  expectedSeed?: number | string;
  /** Optional locked production-line natural-play policy. */
  naturalPolicy?: unknown;
  /** Optional aggregate constitution result.  Fast/local callers can omit it;
   * production callers should pass the persisted control-plane evaluation. */
  constitution?: { passed: boolean; blockers?: string[]; unknowns?: string[] };
}) {
  const blockers: string[] = [];
  if (!input.completion.releaseReady) blockers.push('completion-gates');
  const evidence = evaluateQaEvidence(input.qaEvidence, {
    requireNatural: true,
    requireStateCoverage: true,
    requireNaturalComplete: true,
    naturalFlow: input.naturalFlow,
    expectedBuildHash: input.expectedBuildHash,
    requireProvenance: input.requireQaProvenance,
    expectedRuntime: input.expectedRuntime,
    expectedDevice: input.expectedDevice,
    expectedSeed: input.expectedSeed,
    naturalPolicy: input.naturalPolicy,
  });
  if (!evidence.passed) blockers.push(...evidence.blockers.map((item) => item === 'natural-e2e-missing' ? 'natural-e2e' : item));
  if (input.business.decision !== 'GO' || input.business.blockers.length > 0 || input.business.unknowns.length > 0) blockers.push('business-preflight');
  const requiredChildren = input.platform.children.filter((child) => child.required !== false);
  if (!requiredChildren.every((child) => child.status === 'ready' || child.status === 'released')) blockers.push('platform-release-matrix');
  if (input.costPassed === false) blockers.push('cost-gate');
  if (input.constitution && !input.constitution.passed) {
    const reasons = input.constitution.blockers?.length ? input.constitution.blockers : ['failed'];
    blockers.push(...reasons.map((reason) => `constitution:${reason}`));
  }
  return { passed: blockers.length === 0, blockers: [...new Set(blockers)], unknowns: [...input.business.unknowns], evidence };
}
