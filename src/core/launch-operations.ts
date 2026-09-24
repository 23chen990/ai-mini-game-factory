import {
  AbandonmentDecisionSchema,
  CertificationChecklistSchema,
  CertificationItemSchema,
  LaunchDecisionSchema,
  LaunchMetricSnapshotSchema,
  LaunchThresholdsSchema,
  type AbandonmentDecision,
  type CertificationChecklist,
  type CertificationItem,
  type LaunchDecision,
  type LaunchMetricSnapshot,
  type LaunchThresholds,
} from '../schemas/launch-operations.js';
import { CostBudgetSchema, CostUsageSchema, DistributionPlatformSchema, type CostBudget, type CostUsage, type DistributionPlatform } from '../schemas/factory-operating.js';

const CERTIFICATION_DEFINITIONS: Array<{ kind: CertificationItem['kind']; platform: DistributionPlatform | null; owner: CertificationItem['owner']; required?: boolean }> = [
  { kind: 'SOFTWARE_COPYRIGHT', platform: null, owner: 'human', required: true },
  { kind: 'SELF_REVIEW_REPORT', platform: null, owner: 'human', required: true },
  { kind: 'ICP_FILING', platform: null, owner: 'human', required: true },
  { kind: 'PRIVACY_POLICY', platform: null, owner: 'human', required: true },
  { kind: 'ANTI_ADDICTION', platform: null, owner: 'human', required: true },
];

export function buildCertificationChecklist(input: {
  gameId: string;
  title: string;
  entity: CertificationChecklist['entity'];
  /** Legacy `targets` means all selected platforms are required. */
  targets?: DistributionPlatform[];
  requiredTargets?: DistributionPlatform[];
  optionalTargets?: DistributionPlatform[];
}): CertificationChecklist {
  const requiredTargets = [...new Set((input.requiredTargets ?? input.targets ?? []).map((target) => DistributionPlatformSchema.parse(target)))];
  const optionalTargets = [...new Set((input.optionalTargets ?? []).map((target) => DistributionPlatformSchema.parse(target)))].filter((target) => !requiredTargets.includes(target));
  const targets = [...requiredTargets, ...optionalTargets];
  const definitions = [
    ...CERTIFICATION_DEFINITIONS,
    ...targets.flatMap((platform) => {
      const required = requiredTargets.includes(platform);
      return [
        { kind: 'MINIGAME_FILING' as const, platform, owner: 'human' as const, required },
        { kind: 'PLATFORM_REVIEW' as const, platform, owner: 'human' as const, required },
      ];
    }),
  ];
  const now = new Date().toISOString();
  const items = definitions.map((definition, index) => CertificationItemSchema.parse({
    id: `${definition.kind.toLowerCase()}${definition.platform ? `-${definition.platform}` : ''}-${index + 1}`,
    kind: definition.kind,
    platform: definition.platform,
    required: definition.required ?? true,
    status: 'pending',
    owner: definition.owner,
    evidence: ['human-evidence-required'],
    notes: [],
    updatedAt: now,
  }));
  return CertificationChecklistSchema.parse({
    schemaVersion: 1,
    gameId: input.gameId,
    title: input.title,
    entity: input.entity,
    items,
    naming: { gameName: input.title, softwareCopyrightName: input.title, exactMatchPlatforms: targets.filter((platform) => platform === 'douyin-minigame') },
    blockers: items.map((item) => `certification:${item.kind}:${item.status}`),
    unknowns: ['account ownership and filing dates require human confirmation'],
    ready: false,
    updatedAt: now,
  });
}

/** Normalize a human-edited checklist and derive blockers/ready from item state. */
export function evaluateCertificationChecklist(value: unknown): CertificationChecklist {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return CertificationChecklistSchema.parse(value);
  }
  const raw = value as Record<string, unknown>;
  const rawNaming = raw.naming && typeof raw.naming === 'object' && !Array.isArray(raw.naming)
    ? raw.naming as Record<string, unknown>
    : undefined;
  const namingMismatch = typeof rawNaming?.gameName === 'string'
    && typeof rawNaming.softwareCopyrightName === 'string'
    && rawNaming.gameName !== rawNaming.softwareCopyrightName
    && Array.isArray(rawNaming.exactMatchPlatforms)
    && rawNaming.exactMatchPlatforms.length > 0;
  const structuralReady = Array.isArray(raw.items)
    && raw.items.length > 0
    && (raw.items as unknown[]).every((item) => item && typeof item === 'object' && ['ready', 'waived'].includes((item as { status?: unknown }).status as string));
  // `blockers`, `unknowns` and `ready` are derived fields. Ignore stale values
  // supplied by a human spreadsheet/editor while retaining strict validation
  // for all structural fields and certification items. Temporarily normalise
  // a name mismatch so it can be reported as a blocker rather than crashing
  // the control plane before the checklist is persisted.
  const candidate = {
    ...raw,
    blockers: [],
    unknowns: [],
    ready: structuralReady,
    naming: namingMismatch ? { ...rawNaming, softwareCopyrightName: rawNaming!.gameName } : raw.naming,
  };
  const parsed = CertificationChecklistSchema.parse(candidate);
  const blockers: string[] = [];
  const unknowns: string[] = [];
  for (const item of parsed.items) {
    if (!item.required || ['ready', 'waived'].includes(item.status)) continue;
    const reason = item.status === 'blocked' ? 'blocked' : 'pending';
    blockers.push(`certification:${item.kind}:${reason}${item.platform ? `:${item.platform}` : ''}`);
  }
  if (namingMismatch || (parsed.naming.exactMatchPlatforms.length > 0 && parsed.naming.gameName !== parsed.naming.softwareCopyrightName)) blockers.push('naming:software-copyright-mismatch');
  // A checklist that still contains the template marker has not supplied real
  // evidence. Keep this as an unknown rather than silently treating the marker
  // as proof; a human can replace it with a URL, receipt or signed document.
  if (parsed.items.some((item) => item.evidence.some((evidence) => evidence === 'human-evidence-required'))) unknowns.push('certification:evidence-template-remains');
  const ready = blockers.length === 0 && unknowns.length === 0;
  return CertificationChecklistSchema.parse({ ...parsed, blockers, unknowns, ready, updatedAt: new Date().toISOString() });
}

export const DEFAULT_LAUNCH_THRESHOLDS: LaunchThresholds = LaunchThresholdsSchema.parse({
  minimumUsers: 100,
  minimumObservedDays: 3,
  maxCrashRate: 0.05,
  minSessionCompletionRate: 0.25,
  minAdShowRate: 0.2,
  minEcpmCents: 1,
  minD1Retention: null,
  minOrganicShare: null,
  marketKill: { enabled: false, minimumUsers: 100, minimumObservedDays: 3, maxCrashRate: 0.2, minD1Retention: null, minEcpmCents: null },
});

export function decideLaunchDisposition(snapshotValue: LaunchMetricSnapshot, thresholdsValue: LaunchThresholds = DEFAULT_LAUNCH_THRESHOLDS): LaunchDecision {
  const snapshot = LaunchMetricSnapshotSchema.parse(snapshotValue);
  const thresholds = LaunchThresholdsSchema.parse(thresholdsValue);
  const cpiCents = snapshot.users > 0 ? snapshot.spendCents / snapshot.users : 0;
  const netLtvCents = snapshot.users > 0 ? snapshot.netRevenueCents / snapshot.users : 0;
  const blockers: string[] = [];
  let decision: LaunchDecision['decision'];
  if (snapshot.crashRate > thresholds.maxCrashRate) {
    blockers.push('crash-rate');
    decision = 'KILL';
  } else if (snapshot.spendCents > 0 && netLtvCents < cpiCents && snapshot.observedDays >= 1) {
    blockers.push('paid-cac-not-recovered');
    decision = 'KILL';
  } else if (snapshot.users < thresholds.minimumUsers || snapshot.observedDays < thresholds.minimumObservedDays || snapshot.dataQuality !== 'observed') {
    decision = 'COLLECTING';
  } else if (thresholds.marketKill.enabled && snapshot.users >= thresholds.marketKill.minimumUsers && snapshot.observedDays >= thresholds.marketKill.minimumObservedDays && (snapshot.crashRate > thresholds.marketKill.maxCrashRate || (thresholds.marketKill.minD1Retention !== null && (snapshot.d1Retention === null || snapshot.d1Retention < thresholds.marketKill.minD1Retention)) || (thresholds.marketKill.minEcpmCents !== null && snapshot.eCPMCents < thresholds.marketKill.minEcpmCents))) {
    if (snapshot.crashRate > thresholds.marketKill.maxCrashRate) blockers.push('market-crash-rate');
    if (thresholds.marketKill.minD1Retention !== null && (snapshot.d1Retention === null || snapshot.d1Retention < thresholds.marketKill.minD1Retention)) blockers.push('d1-retention');
    if (thresholds.marketKill.minEcpmCents !== null && snapshot.eCPMCents < thresholds.marketKill.minEcpmCents) blockers.push('market-ecpm');
    decision = 'KILL';
  } else if (thresholds.minD1Retention !== null && (snapshot.d1Retention === null || snapshot.d1Retention < thresholds.minD1Retention)) {
    blockers.push('d1-retention');
    decision = 'KILL';
  } else if (thresholds.minOrganicShare !== null && snapshot.organicShare < thresholds.minOrganicShare) {
    blockers.push('organic-share');
    decision = 'ITERATE_ONCE';
  } else if (snapshot.sessionCompletionRate < thresholds.minSessionCompletionRate || snapshot.adShowRate < thresholds.minAdShowRate || snapshot.eCPMCents < thresholds.minEcpmCents) {
    blockers.push('experience-or-monetization-threshold');
    decision = 'ITERATE_ONCE';
  } else {
    decision = 'SCALE';
  }
  const rationale = decision === 'KILL'
    ? 'Stop this release or campaign at the configured safety threshold; do not spend more to rescue weak evidence.'
    : decision === 'SCALE'
      ? 'Observed cohort clears the configured quality and unit-economics thresholds.'
      : decision === 'ITERATE_ONCE'
        ? 'Allow one bounded creative/onboarding/content iteration, then re-measure.'
        : 'Collect a minimum observed cohort before making a market decision.';
  return LaunchDecisionSchema.parse({ schemaVersion: 1, gameId: snapshot.gameId, platform: snapshot.platform, releaseHash: snapshot.releaseHash, decision, users: snapshot.users, spendCents: snapshot.spendCents, netRevenueCents: snapshot.netRevenueCents, cpiCents, netLtvCents, blockers, rationale, decidedAt: new Date().toISOString() });
}

export function evaluateAbandonment(input: { runId: string; stage: string; budget: CostBudget; usage: CostUsage; manual?: boolean; reason?: AbandonmentDecision['reason'] }): AbandonmentDecision {
  const budget = CostBudgetSchema.parse(input.budget);
  const usage = CostUsageSchema.parse(input.usage);
  const fixCeilingExceeded = budget.maxFixAttempts !== undefined && usage.fixAttempts > budget.maxFixAttempts;
  const exceeded = usage.totalCents > budget.maxTotalCents || usage.paidTrafficCents > budget.maxPaidTrafficCents || usage.agentTokens > budget.maxAgentTokens || usage.humanMinutes > budget.maxHumanMinutes || fixCeilingExceeded || (usage.wallClockMinutes ?? 0) > (budget.maxWallClockMinutes ?? Number.POSITIVE_INFINITY) || (usage.assetBatches ?? 0) > (budget.maxAssetBatches ?? Number.POSITIVE_INFINITY) || (usage.buildAttempts ?? 0) > (budget.maxBuildAttempts ?? Number.POSITIVE_INFINITY) || (usage.repairLoops ?? 0) > (budget.maxRepairLoops ?? Number.POSITIVE_INFINITY);
  const reason = input.manual ? 'manual' : input.reason ?? (exceeded ? (fixCeilingExceeded || (usage.repairLoops ?? 0) > (budget.maxRepairLoops ?? Number.POSITIVE_INFINITY) ? 'fix-cap' : 'cost-cap') : 'within-budget');
  const explicitTerminalReason = reason === 'fix-cap' || reason === 'platform-blocked' || reason === 'market-kill' || (reason === 'cost-cap' && exceeded);
  const decision: AbandonmentDecision['decision'] = input.manual || exceeded || explicitTerminalReason ? 'ABANDON' : 'CONTINUE';
  const evidence = input.manual
    ? ['human-requested-abandonment']
    : explicitTerminalReason || exceeded
      ? ['cost-or-fix-cap-exceeded']
      : ['within-configured-ceiling'];
  return AbandonmentDecisionSchema.parse({ schemaVersion: 1, runId: input.runId, stage: input.stage, decision, reason, budget, usage, evidence, decidedAt: new Date().toISOString() });
}
