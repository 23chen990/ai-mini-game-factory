import {
  BusinessPreflightSchema,
  CostBudgetSchema,
  CostGateReportSchema,
  CostUsageSchema,
  DistributionPlatformSchema,
  FailureReportSchema,
  GrowthDecisionSchema,
  GrowthExperimentSchema,
  PlatformReleaseMatrixSchema,
  type BusinessPreflight,
  type CostBudget,
  type CostUsage,
  type FailureReport,
  type GrowthExperiment,
  type PlatformReleaseMatrix,
  type DistributionPlatform,
} from '../schemas/factory-operating.js';
import { validatePlatformChildPath } from './platform-packaging.js';

const defaultAdapterPath: Record<DistributionPlatform, string> = {
  'wechat-minigame': 'src/platform/wechat',
  'douyin-minigame': 'src/platform/douyin',
  'taptap-minigame': 'src/platform/taptap',
  'poki-web': 'src/platform/poki',
  'crazygames-web': 'src/platform/crazygames',
};

export function buildPlatformReleaseMatrix(input: {
  gameId: string;
  coreHash: string;
  primaryPlatform: DistributionPlatform;
  /** Legacy all-required target list. */
  targets?: DistributionPlatform[];
  requiredTargets?: DistributionPlatform[];
  optionalTargets?: DistributionPlatform[];
}): PlatformReleaseMatrix {
  const required = [...new Set((input.requiredTargets ?? input.targets ?? []).map((target) => DistributionPlatformSchema.parse(target)))];
  const optional = [...new Set((input.optionalTargets ?? []).map((target) => DistributionPlatformSchema.parse(target)))].filter((target) => !required.includes(target));
  const targets = [...required, ...optional];
  if (targets.length === 0) targets.push(DistributionPlatformSchema.parse(input.primaryPlatform));
  if (!targets.includes(input.primaryPlatform)) targets.unshift(input.primaryPlatform);
  return PlatformReleaseMatrixSchema.parse({
    schemaVersion: 1,
    gameId: input.gameId,
    coreHash: input.coreHash,
    primaryPlatform: input.primaryPlatform,
    generatedAt: new Date().toISOString(),
    requiredPlatforms: required.includes(input.primaryPlatform) ? required : [input.primaryPlatform, ...required],
    optionalPlatforms: optional,
    children: targets.map((platform) => ({
      platform,
      required: required.includes(platform) || platform === input.primaryPlatform,
      status: 'planned' as const,
      adapterPath: defaultAdapterPath[platform],
      buildPath: `platform-builds/${platform}`,
      configPath: `platform-config/${platform}.json`,
      childRoot: `platform-builds/${platform}`,
      evidence: [],
      normalFlowEvidence: [],
      visualEvidence: [],
      runtimeEvidence: [],
      blockers: [],
      artifactHash: null,
    })),
  });
}

export function evaluatePlatformReleaseMatrix(matrixValue: PlatformReleaseMatrix, options: { strict?: boolean } = {}) {
  const matrix = PlatformReleaseMatrixSchema.parse(matrixValue);
  const required = new Set(matrix.requiredPlatforms ?? matrix.children.filter((child) => child.required).map((child) => child.platform));
  const blockers: string[] = matrix.children.filter((child) => required.has(child.platform) && !['ready', 'released'].includes(child.status)).map((child) => child.platform);
  if (options.strict) {
    for (const child of matrix.children.filter((item) => required.has(item.platform) && ['ready', 'released'].includes(item.status))) {
      try { validatePlatformChildPath(child.platform, child.childRoot ?? ''); } catch { blockers.push(`${child.platform}:child-root`); }
      if (child.normalFlowEvidence.length === 0) blockers.push(`${child.platform}:normal-flow`);
      if (child.visualEvidence.length === 0) blockers.push(`${child.platform}:visual-evidence`);
      if (child.runtimeEvidence.length === 0) blockers.push(`${child.platform}:runtime-evidence`);
    }
  }
  return { passed: blockers.length === 0, blockers, matrix };
}

export function evaluatePlatformQa(
  matrixValue: PlatformReleaseMatrix,
  results: Array<{ platform: DistributionPlatform; passed: boolean; evidence: string[]; artifactHash?: string; packagePath?: string; normalFlowEvidence?: string[]; visualEvidence?: string[]; runtimeEvidence?: string[] }>,
  options: { strict?: boolean } = {},
) {
  const matrix = PlatformReleaseMatrixSchema.parse(matrixValue);
  const byPlatform = new Map(results.map((result) => [DistributionPlatformSchema.parse(result.platform), result]));
  const children = matrix.children.map((child) => {
    const result = byPlatform.get(child.platform);
    if (!result) return child.required
      ? { ...child, status: 'blocked' as const, blockers: ['platform-qa-missing'], evidence: [], normalFlowEvidence: [], visualEvidence: [], runtimeEvidence: [], artifactHash: null }
      : child;
    const evidence = result.evidence.filter((item) => item.trim().length > 0);
    const normalFlowEvidence = (result.normalFlowEvidence ?? []).filter((item) => item.trim().length > 0);
    const visualEvidence = (result.visualEvidence ?? []).filter((item) => item.trim().length > 0);
    const runtimeEvidence = (result.runtimeEvidence ?? []).filter((item) => item.trim().length > 0);
    const strictBlockers = options.strict
      ? [
        ...(result.packagePath && result.packagePath.trim().length > 0 ? [] : ['platform-qa-package-path-missing']),
        ...(normalFlowEvidence.length > 0 ? [] : ['platform-qa-normal-flow-missing', 'normal-flow']),
        ...(visualEvidence.length > 0 ? [] : ['platform-qa-visual-evidence-missing', 'visual-evidence']),
        ...(runtimeEvidence.length > 0 ? [] : ['platform-qa-runtime-evidence-missing', 'runtime-evidence']),
      ]
      : [];
    const ready = result.passed && evidence.length > 0 && /^[a-f0-9]{64}$/iu.test(result.artifactHash ?? '') && strictBlockers.length === 0;
    return {
      ...child,
      status: ready ? 'ready' as const : 'blocked' as const,
      evidence,
      childRoot: result.packagePath ?? child.childRoot ?? child.buildPath,
      normalFlowEvidence,
      visualEvidence,
      runtimeEvidence,
      blockers: ready ? [] : [...new Set(['platform-qa-failed-or-unhashed', ...strictBlockers])],
      artifactHash: ready ? result.artifactHash! : null,
    };
  });
  const reviewed = PlatformReleaseMatrixSchema.parse({ ...matrix, children });
  const result = evaluatePlatformReleaseMatrix(reviewed, options);
  // Preserve the high-level child name for dashboards, but also surface the
  // exact missing evidence so a strict gate can be repaired without opening
  // the run and guessing which proof is absent.
  const childBlockers = options.strict
    ? reviewed.children.filter((child) => child.required).flatMap((child) => child.blockers.map((blocker) => `${child.platform}:${blocker}`))
    : [];
  return {
    ...result,
    blockers: [...new Set([...result.blockers, ...childBlockers])],
    matrix: reviewed,
  };
}

export function evaluateBusinessPreflight(input: {
  entity: BusinessPreflight['entity'];
  monetization: 'IAA';
  targets: DistributionPlatform[];
  optionalTargets?: DistributionPlatform[];
  accountChecks: BusinessPreflight['accountChecks'];
  rightsStatus: BusinessPreflight['rightsStatus'];
  payoutStatus: BusinessPreflight['payoutStatus'];
  budget: CostBudget;
}) : BusinessPreflight {
  const targets = [...new Set(input.targets.map((target) => DistributionPlatformSchema.parse(target)))];
  const optionalTargets = [...new Set((input.optionalTargets ?? []).map((target) => DistributionPlatformSchema.parse(target)))].filter((target) => !targets.includes(target));
  const blockers: string[] = [];
  const unknowns: string[] = [];
  const checksByPlatform = new Map(input.accountChecks.map((check) => [check.platform, check]));
  for (const platform of targets) {
    const check = checksByPlatform.get(platform);
    if (!check || check.status === 'unknown') unknowns.push(platform);
    else if (check.status === 'blocked') blockers.push(platform);
  }
  if (input.rightsStatus === 'unknown') unknowns.push('rights');
  else if (input.rightsStatus === 'blocked') blockers.push('rights');
  if (input.payoutStatus === 'unknown') unknowns.push('payout');
  else if (input.payoutStatus === 'blocked') blockers.push('payout');
  const uniqueBlockers = [...new Set(blockers)];
  const uniqueUnknowns = [...new Set(unknowns)];
  // Unknowns are retained separately for auditability, but they are also
  // blocking reasons: an unresolved account/rights/payout question must not
  // silently allow a release or paid-growth decision.
  for (const unknown of uniqueUnknowns) {
    if (!uniqueBlockers.includes(unknown)) uniqueBlockers.push(unknown);
  }
  const decision: BusinessPreflight['decision'] = blockers.length > 0 ? 'KILL' : uniqueUnknowns.length > 0 ? 'PAUSE' : 'GO';
  return BusinessPreflightSchema.parse({
    schemaVersion: 1,
    ...input,
    targets,
    optionalTargets,
    blockers: uniqueBlockers,
    unknowns: uniqueUnknowns,
    decision,
    checkedAt: new Date().toISOString(),
  });
}

export function evaluateCostGate(budgetValue: CostBudget, usageValue: CostUsage) {
  const budget = CostBudgetSchema.parse(budgetValue);
  const usage = CostUsageSchema.parse(usageValue);
  const blockers: Array<'total-cost' | 'paid-traffic' | 'agent-tokens' | 'human-time' | 'fix-attempts' | 'wall-clock' | 'asset-batches' | 'build-attempts' | 'repair-loops'> = [];
  if (usage.totalCents > budget.maxTotalCents) blockers.push('total-cost');
  if (usage.paidTrafficCents > budget.maxPaidTrafficCents) blockers.push('paid-traffic');
  if (usage.agentTokens > budget.maxAgentTokens) blockers.push('agent-tokens');
  if (usage.humanMinutes > budget.maxHumanMinutes) blockers.push('human-time');
  if (budget.maxFixAttempts !== undefined && usage.fixAttempts > budget.maxFixAttempts) blockers.push('fix-attempts');
  if ((usage.wallClockMinutes ?? 0) > (budget.maxWallClockMinutes ?? Number.POSITIVE_INFINITY)) blockers.push('wall-clock');
  if ((usage.assetBatches ?? 0) > (budget.maxAssetBatches ?? Number.POSITIVE_INFINITY)) blockers.push('asset-batches');
  if ((usage.buildAttempts ?? 0) > (budget.maxBuildAttempts ?? Number.POSITIVE_INFINITY)) blockers.push('build-attempts');
  if ((usage.repairLoops ?? 0) > (budget.maxRepairLoops ?? Number.POSITIVE_INFINITY)) blockers.push('repair-loops');
  return CostGateReportSchema.parse({ schemaVersion: 1, passed: blockers.length === 0, blockers, budget, usage });
}

export function makeGrowthExperiment(input: { gameId: string; platform: DistributionPlatform; maxBudgetCents: number }): GrowthExperiment {
  const maxBudgetCents = Math.max(0, Math.trunc(input.maxBudgetCents));
  const channels: GrowthExperiment['channels'] = [
    { kind: 'organic', platform: input.platform, campaignId: null, creativePaths: ['growth/organic/short-clips/', 'growth/organic/store-copy.json'], stopRules: ['pause if platform rejects the listing', 'refresh one creative batch before changing core gameplay'] },
  ];
  // A disabled paid budget must produce no paid campaign placeholder.  A
  // placeholder was previously enough to make the artifact invalid (and could
  // accidentally be interpreted as authorization to spend).
  if (maxBudgetCents > 0) channels.push({ kind: 'paid', platform: input.platform, campaignId: 'pending-human-approval', creativePaths: ['growth/paid/creative-a/', 'growth/paid/creative-b/'], stopRules: ['stop at the approved budget cap', 'stop when conservative net LTV is below CPI', 'never buy or simulate ad clicks'] });
  return GrowthExperimentSchema.parse({
    schemaVersion: 1,
    gameId: input.gameId,
    maxBudgetCents,
    channels,
    createdAt: new Date().toISOString(),
  });
}

export function decideGrowthExperiment(input: {
  platform: DistributionPlatform;
  channel: 'organic' | 'paid';
  users: number;
  spendCents: number;
  netRevenueCents: number;
  observedDays: number;
  minimumUsers: number;
  paybackWindowDays: number;
}) {
  const users = Math.max(0, Math.trunc(input.users));
  const spendCents = Math.max(0, Math.trunc(input.spendCents));
  const netRevenueCents = Math.max(0, Math.trunc(input.netRevenueCents));
  const cpiCents = users > 0 ? spendCents / users : 0;
  const netLtvCents = users > 0 ? netRevenueCents / users : 0;
  const blockers: string[] = [];
  let decision: 'COLLECTING' | 'SCALE' | 'ITERATE_ONCE' | 'KILL' = 'COLLECTING';
  if (input.channel === 'paid' && users >= input.minimumUsers && input.observedDays >= 1 && netLtvCents < cpiCents) {
    decision = 'KILL';
    blockers.push('cpi-above-conservative-ltv');
  } else if (users < input.minimumUsers || input.observedDays < Math.min(input.paybackWindowDays, 3)) {
    decision = 'COLLECTING';
  } else if (netLtvCents >= cpiCents && (input.channel === 'organic' || spendCents === 0 || netRevenueCents >= spendCents)) {
    decision = 'SCALE';
  } else {
    decision = 'ITERATE_ONCE';
  }
  return GrowthDecisionSchema.parse({
    schemaVersion: 1,
    platform: DistributionPlatformSchema.parse(input.platform),
    channel: input.channel,
    decision,
    users,
    spendCents,
    netRevenueCents,
    cpiCents,
    netLtvCents,
    observedDays: Math.max(0, Math.trunc(input.observedDays)),
    blockers,
    rationale: decision === 'KILL' ? 'Paid acquisition does not conservatively recover its CPI.' : decision === 'SCALE' ? 'Observed net LTV covers CPI under the configured gate.' : decision === 'ITERATE_ONCE' ? 'One bounded creative or onboarding iteration is allowed before another decision.' : 'Collect more cohort evidence before making a market decision.',
    decidedAt: new Date().toISOString(),
  });
}

export function makeFailureReport(input: {
  stage: string;
  failureClass: FailureReport['failureClass'];
  routeTo: string;
  message: string;
  hypotheses: FailureReport['hypotheses'];
  attempts?: number;
  symptom?: string;
  reproduction?: string;
  suspectedRootCauses?: FailureReport['suspectedRootCauses'];
  secondaryRoutes?: string[];
  owner?: FailureReport['owner'];
  regressionTest?: string | null;
  failureKind?: FailureReport['failureKind'];
  retryable?: boolean;
}) {
  return FailureReportSchema.parse({ schemaVersion: 1, ...input, symptom: input.symptom ?? input.message, reproduction: input.reproduction ?? `stage:${input.stage}`, suspectedRootCauses: input.suspectedRootCauses ?? input.hypotheses.map((hypothesis) => ({ artifact: input.routeTo, confidence: hypothesis.confidence, reason: hypothesis.cause })), primaryRoute: input.routeTo, secondaryRoutes: input.secondaryRoutes ?? [], owner: input.owner, regressionTest: input.regressionTest ?? null, failureKind: input.failureKind ?? 'CAPABILITY_ERROR', retryable: input.retryable ?? true, status: 'OPEN', attempts: input.attempts ?? 0, createdAt: new Date().toISOString() });
}
