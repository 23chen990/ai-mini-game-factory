import { CostBlockerSchema, CostBudgetSchema, CostUsageSchema, type CostBlocker, type CostBudget, type CostUsage } from '../schemas/factory-operating.js';
import { CostAdjustmentLedgerSchema, CostPreflightReportSchema, CostRateCardSchema, CostStageReserveSchema, type CostAdjustmentLedger, type CostRateCard, type CostStageReserve, type CostStageUsage } from '../schemas/cost-accounting.js';

const ceilCents = (value: number) => Math.max(0, Math.ceil(value));

/** Conservative local defaults. They are accounting assumptions, not claims
 * about a vendor's current price; production operators can replace them with
 * a versioned artifact or environment overrides. */
export function defaultCostRateCard(): CostRateCard {
  return CostRateCardSchema.parse({
    schemaVersion: 1,
    currency: 'CNY',
    agentInputCentsPer1k: 0,
    agentOutputCentsPer1k: 0,
    imageCallCents: 0,
    humanMinuteCents: 0,
    source: 'factory-default:local-accounting',
    effectiveAt: new Date(0).toISOString(),
  });
}

export function costRateCardFromEnv(env: NodeJS.ProcessEnv = process.env): CostRateCard {
  const numberOr = (name: string, fallback: number) => {
    const parsed = Number(env[name]);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  const base = defaultCostRateCard();
  return CostRateCardSchema.parse({
    ...base,
    agentInputCentsPer1k: numberOr('FACTORY_COST_AGENT_INPUT_CENTS_PER_1K', base.agentInputCentsPer1k),
    agentOutputCentsPer1k: numberOr('FACTORY_COST_AGENT_OUTPUT_CENTS_PER_1K', base.agentOutputCentsPer1k),
    imageCallCents: numberOr('FACTORY_COST_IMAGE_CALL_CENTS', base.imageCallCents),
    humanMinuteCents: numberOr('FACTORY_COST_HUMAN_MINUTE_CENTS', base.humanMinuteCents),
    source: env.FACTORY_COST_RATE_SOURCE?.trim() || base.source,
    effectiveAt: env.FACTORY_COST_RATE_EFFECTIVE_AT?.trim() || base.effectiveAt,
  });
}

function sumAdjustments(ledger?: CostAdjustmentLedger) {
  const entries = ledger?.entries ?? [];
  return {
    paidTrafficCents: entries.filter((entry) => entry.kind === 'paid-traffic').reduce((sum, entry) => sum + entry.cents, 0),
    adjustmentCents: entries.reduce((sum, entry) => sum + entry.cents, 0),
    humanMinutes: entries.filter((entry) => entry.kind === 'human-time').reduce((sum, entry) => sum + (entry.minutes ?? 0), 0),
  };
}

/** Derive usage from stage records plus explicit operator entries. The
 * function ignores model names and free-form logs: only measured counters and
 * append-only adjustments affect money. */
export function deriveCostUsage(stages: readonly CostStageUsage[], options: {
  rateCard?: CostRateCard;
  adjustments?: CostAdjustmentLedger;
  humanMinutes?: number;
  wallClockMinutes?: number;
  assetBatches?: number;
  buildAttempts?: number;
  repairLoops?: number;
} = {}): CostUsage {
  const rateCard = CostRateCardSchema.parse(options.rateCard ?? defaultCostRateCard());
  const totals = stages.reduce((sum, stage) => {
    const inputTokens = Math.max(0, Math.trunc(stage.tokenUsage?.inputTokens ?? 0));
    const outputTokens = Math.max(0, Math.trunc(stage.tokenUsage?.outputTokens ?? 0));
    const totalTokens = Math.max(inputTokens + outputTokens, Math.trunc(stage.tokenUsage?.totalTokens ?? 0));
    const agentCents = ceilCents(inputTokens / 1_000 * rateCard.agentInputCentsPer1k + outputTokens / 1_000 * rateCard.agentOutputCentsPer1k);
    const imageCalls = Math.max(0, Math.trunc(stage.providerCalls?.image ?? 0));
    const imageCents = ceilCents(imageCalls * rateCard.imageCallCents);
    const repairLoops = /^(?:FIX|FEEL_REPAIR)$/u.test(stage.stage) ? Math.max(0, Math.trunc(stage.attempts ?? 0)) : 0;
    const fixAttempts = stage.stage === 'FIX' ? Math.max(0, Math.trunc(stage.attempts ?? 0)) : 0;
    const assetBatches = stage.stage === 'ASSETS' ? Math.max(0, Math.trunc(stage.attempts ?? 0)) : 0;
    const buildAttempts = /^(?:FULL_BUILD|BUILD)$/u.test(stage.stage) ? Math.max(0, Math.trunc(stage.attempts ?? 0)) : 0;
    return {
      inputTokens: sum.inputTokens + inputTokens,
      outputTokens: sum.outputTokens + outputTokens,
      agentTokens: sum.agentTokens + totalTokens,
      agentCents: sum.agentCents + agentCents,
      imageCents: sum.imageCents + imageCents,
      fixAttempts: Math.max(sum.fixAttempts, fixAttempts),
      assetBatches: sum.assetBatches + assetBatches,
      buildAttempts: sum.buildAttempts + buildAttempts,
      repairLoops: sum.repairLoops + repairLoops,
    };
  }, { inputTokens: 0, outputTokens: 0, agentTokens: 0, agentCents: 0, imageCents: 0, fixAttempts: 0, assetBatches: 0, buildAttempts: 0, repairLoops: 0 });
  const adjustments = sumAdjustments(options.adjustments);
  const humanMinutes = Math.max(0, Math.trunc(options.humanMinutes ?? 0)) + adjustments.humanMinutes;
  const humanCents = ceilCents(humanMinutes * rateCard.humanMinuteCents);
  const totalCents = totals.agentCents + totals.imageCents + humanCents + adjustments.adjustmentCents;
  return CostUsageSchema.parse({
    totalCents,
    paidTrafficCents: adjustments.paidTrafficCents,
    agentTokens: totals.agentTokens,
    humanMinutes,
    fixAttempts: totals.fixAttempts,
    wallClockMinutes: Math.max(0, Math.trunc(options.wallClockMinutes ?? 0)),
    assetBatches: totals.assetBatches + Math.max(0, Math.trunc(options.assetBatches ?? 0)),
    buildAttempts: totals.buildAttempts + Math.max(0, Math.trunc(options.buildAttempts ?? 0)),
    repairLoops: totals.repairLoops + Math.max(0, Math.trunc(options.repairLoops ?? 0)),
    breakdown: {
      agentCents: totals.agentCents,
      imageCents: totals.imageCents,
      humanCents,
      paidTrafficCents: adjustments.paidTrafficCents,
      adjustmentCents: adjustments.adjustmentCents,
    },
  });
}

const DEFAULT_STAGE_RESERVES: Record<string, Partial<CostStageReserve>> = {
  REFERENCE_DEEP_RESEARCH: { agentTokens: 12_000 },
  COMPETITOR_RESEARCH: { agentTokens: 16_000 },
  OPEN_SOURCE_RESEARCH: { agentTokens: 12_000 },
  ART_DIRECTIONS: { agentTokens: 8_000, imageCalls: 4 },
  ASSETS: { agentTokens: 8_000, imageCalls: 5, assetBatches: 1 },
  FULL_BUILD: { agentTokens: 30_000, buildAttempts: 1 },
  BUILD: { agentTokens: 30_000, buildAttempts: 1 },
  FIX: { agentTokens: 24_000, repairLoops: 1 },
  FEEL_REPAIR: { agentTokens: 24_000, repairLoops: 1 },
};

export function reserveForStage(stage: string, override?: Partial<CostStageReserve>): CostStageReserve {
  const base = DEFAULT_STAGE_RESERVES[stage] ?? {};
  return CostStageReserveSchema.parse({ ...base, ...(override ?? {}) });
}

export function projectStageUsage(currentValue: CostUsage, stage: string, reserveOverride?: Partial<CostStageReserve>, rateCardValue?: CostRateCard): CostUsage {
  const current = CostUsageSchema.parse(currentValue);
  const reserve = reserveForStage(stage, reserveOverride);
  const rateCard = rateCardValue ? CostRateCardSchema.parse(rateCardValue) : undefined;
  // Legacy reserves specify one aggregate token count. Treat that count as
  // output (the more expensive/conservative side in most cards). New reserves
  // can split input/output while any unallocated aggregate remainder is still
  // charged at the output rate, preventing underestimation.
  const splitTokens = reserve.agentInputTokens + reserve.agentOutputTokens;
  const effectiveInputTokens = splitTokens > 0 ? reserve.agentInputTokens : 0;
  const effectiveOutputTokens = splitTokens > 0
    ? reserve.agentOutputTokens + Math.max(0, reserve.agentTokens - splitTokens)
    : reserve.agentTokens;
  const effectiveAgentTokens = effectiveInputTokens + effectiveOutputTokens;
  const projectedAgentCents = rateCard ? ceilCents(effectiveInputTokens / 1_000 * rateCard.agentInputCentsPer1k + effectiveOutputTokens / 1_000 * rateCard.agentOutputCentsPer1k) : 0;
  const projectedImageCents = rateCard ? ceilCents(reserve.imageCalls * rateCard.imageCallCents) : 0;
  const projectedHumanCents = rateCard ? ceilCents(reserve.humanMinutes * rateCard.humanMinuteCents) : 0;
  const breakdown = current.breakdown ? {
    ...current.breakdown,
    agentCents: current.breakdown.agentCents + projectedAgentCents,
    imageCents: current.breakdown.imageCents + projectedImageCents,
    humanCents: current.breakdown.humanCents + projectedHumanCents,
  } : current.breakdown;
  return CostUsageSchema.parse({
    ...current,
    agentTokens: current.agentTokens + effectiveAgentTokens,
    humanMinutes: current.humanMinutes + reserve.humanMinutes,
    wallClockMinutes: (current.wallClockMinutes ?? 0) + reserve.wallClockMinutes,
    assetBatches: (current.assetBatches ?? 0) + reserve.assetBatches,
    buildAttempts: (current.buildAttempts ?? 0) + reserve.buildAttempts,
    repairLoops: (current.repairLoops ?? 0) + reserve.repairLoops,
    totalCents: current.totalCents + projectedAgentCents + projectedImageCents + projectedHumanCents,
    ...(breakdown ? { breakdown } : {}),
  });
}

function exceeded(budget: CostBudget, usage: CostUsage): CostBlocker[] {
  const result: CostBlocker[] = [];
  if (usage.totalCents > budget.maxTotalCents) result.push('total-cost');
  if (usage.paidTrafficCents > budget.maxPaidTrafficCents) result.push('paid-traffic');
  if (usage.agentTokens > budget.maxAgentTokens) result.push('agent-tokens');
  if (usage.humanMinutes > budget.maxHumanMinutes) result.push('human-time');
  if (budget.maxFixAttempts !== undefined && usage.fixAttempts > budget.maxFixAttempts) result.push('fix-attempts');
  if ((usage.wallClockMinutes ?? 0) > (budget.maxWallClockMinutes ?? Number.POSITIVE_INFINITY)) result.push('wall-clock');
  if ((usage.assetBatches ?? 0) > (budget.maxAssetBatches ?? Number.POSITIVE_INFINITY)) result.push('asset-batches');
  if ((usage.buildAttempts ?? 0) > (budget.maxBuildAttempts ?? Number.POSITIVE_INFINITY)) result.push('build-attempts');
  if ((usage.repairLoops ?? 0) > (budget.maxRepairLoops ?? Number.POSITIVE_INFINITY)) result.push('repair-loops');
  return result;
}

export function evaluateCostPreflight(input: { budget: CostBudget; current: CostUsage; projected: CostUsage; stage: string; reserve?: Partial<CostStageReserve> }): ReturnType<typeof CostPreflightReportSchema.parse> {
  const budget = CostBudgetSchema.parse(input.budget);
  const current = CostUsageSchema.parse(input.current);
  const projected = CostUsageSchema.parse(input.projected);
  const currentBlockers = exceeded(budget, current);
  const projectedBlockers = [...new Set([...currentBlockers, ...exceeded(budget, projected)])].map((item) => CostBlockerSchema.parse(item));
  const reserve = reserveForStage(input.stage, input.reserve);
  return CostPreflightReportSchema.parse({ schemaVersion: 1, stage: input.stage, current, projected, passed: projectedBlockers.length === 0, currentBlockers, projectedBlockers, reserve, checkedAt: new Date().toISOString() });
}

export function costUsageFromArtifacts(stages: readonly CostStageUsage[], options: { rateCard?: CostRateCard; adjustments?: unknown; humanMinutes?: number; wallClockMinutes?: number; assetBatches?: number; buildAttempts?: number; repairLoops?: number } = {}) {
  const adjustments = options.adjustments === undefined ? undefined : CostAdjustmentLedgerSchema.parse(options.adjustments);
  return deriveCostUsage(stages, { ...options, adjustments });
}
