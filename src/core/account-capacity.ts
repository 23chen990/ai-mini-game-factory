import { AccountCapacityPlanSchema, AccountCapacityReportSchema, AccountPortfolioSchema, type AccountCapacityPlan, type AccountCapacityReport, type AccountPortfolio } from '../schemas/account-capacity.js';
import { sha256Text } from './files.js';

/** Return a stable representation for comparisons and audit hashes. */
export function canonicalAccountPortfolio(value: AccountPortfolio | unknown): AccountPortfolio {
  const portfolio = AccountPortfolioSchema.parse(value);
  return AccountPortfolioSchema.parse({
    ...portfolio,
    entries: [...portfolio.entries].sort((left, right) => `${left.gameId}:${left.platform}`.localeCompare(`${right.gameId}:${right.platform}`)),
  });
}

/** Hash only validated portfolio data; no credentials or free-form secrets are
 * accepted by the schema or included in the operation ledger. */
export function accountPortfolioHash(value: AccountPortfolio | unknown): string {
  return sha256Text(JSON.stringify(canonicalAccountPortfolio(value)));
}

export function buildAccountCapacityPlan(input: { entity: AccountCapacityPlan['entity']; capacities: AccountCapacityPlan['capacities']; activeCounts: AccountCapacityPlan['activeCounts']; blockers?: string[]; source?: AccountCapacityPlan['source']; portfolioSnapshotHash?: string; portfolioUpdatedAt?: string }): AccountCapacityPlan {
  return AccountCapacityPlanSchema.parse({
    schemaVersion: 1,
    entity: input.entity,
    capacities: input.capacities,
    activeCounts: input.activeCounts,
    blockers: input.blockers ?? [],
    source: input.source ?? 'default-zero',
    ...(input.portfolioSnapshotHash !== undefined ? { portfolioSnapshotHash: input.portfolioSnapshotHash } : {}),
    ...(input.portfolioUpdatedAt !== undefined ? { portfolioUpdatedAt: input.portfolioUpdatedAt } : {}),
    generatedAt: new Date().toISOString(),
  });
}

/** Convert the operator-maintained portfolio into counts for a plan. Retired
 * titles consume no active capacity; reserved titles still reserve a slot. */
export function deriveActiveCountsFromPortfolio(value: AccountPortfolio | unknown, platforms?: readonly AccountCapacityPlan['activeCounts'][number]['platform'][]): AccountCapacityPlan['activeCounts'] {
  const portfolio = AccountPortfolioSchema.parse(value);
  const selected = platforms ? [...new Set(platforms)] : [...new Set(portfolio.entries.map((entry) => entry.platform))];
  const all = selected.length > 0 ? selected : ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'] as const;
  return all.map((platform) => ({
    platform,
    activeGames: portfolio.entries.filter((entry) => entry.platform === platform && entry.status === 'active').length,
    reservedGames: portfolio.entries.filter((entry) => entry.platform === platform && entry.status === 'reserved').length,
  }));
}

export function evaluateAccountCapacity(value: unknown): AccountCapacityReport {
  const plan = AccountCapacityPlanSchema.parse(value);
  const counts = new Map(plan.activeCounts.map((item) => [item.platform, item]));
  const blockers: string[] = [];
  blockers.push(...plan.blockers);
  const utilization = plan.capacities.map((capacity) => {
    const count = counts.get(capacity.platform);
    const used = (count?.activeGames ?? 0) + (count?.reservedGames ?? 0);
    const remaining = capacity.maxGames - used;
    if (remaining < 0) blockers.push(`${capacity.platform}:capacity-exceeded`);
    else if (remaining === 0) blockers.push(`${capacity.platform}:capacity-exhausted`);
    return { platform: capacity.platform, used, capacity: capacity.maxGames, remaining };
  });
  for (const count of plan.activeCounts) if (!plan.capacities.some((capacity) => capacity.platform === count.platform)) blockers.push(`${count.platform}:capacity-undefined`);
  return AccountCapacityReportSchema.parse({
    schemaVersion: 1,
    entity: plan.entity,
    passed: blockers.length === 0,
    blockers: [...new Set(blockers)],
    utilization,
    ...(plan.portfolioSnapshotHash !== undefined ? { portfolioSnapshotHash: plan.portfolioSnapshotHash } : {}),
    ...(plan.portfolioUpdatedAt !== undefined ? { portfolioUpdatedAt: plan.portfolioUpdatedAt } : {}),
    generatedAt: new Date().toISOString(),
  });
}

export type AccountCapacityPortfolioBinding = {
  passed: boolean;
  blockers: string[];
  expectedHash?: string;
  expectedUpdatedAt?: string;
  expectedActiveCounts?: AccountCapacityPlan['activeCounts'];
};

/**
 * Compare a run-local capacity plan with the exact operator portfolio snapshot
 * that was used to derive it.  Capacity is a cross-run fact, so comparing only
 * the numeric counts is insufficient: a replacement portfolio with the same
 * counts must still invalidate the old evidence.  This function is deliberately
 * read-only and returns diagnostic blockers suitable for a stage gate.
 */
export function evaluateAccountCapacityPortfolioBinding(planValue: unknown, portfolioValue: unknown): AccountCapacityPortfolioBinding {
  const plan = AccountCapacityPlanSchema.parse(planValue);
  const portfolio = AccountPortfolioSchema.parse(portfolioValue);
  const expectedHash = accountPortfolioHash(portfolio);
  const expectedUpdatedAt = portfolio.updatedAt;
  const expectedActiveCounts = deriveActiveCountsFromPortfolio(portfolio, plan.capacities.map((item) => item.platform));
  const blockers: string[] = [];
  if (plan.source !== 'portfolio') blockers.push('portfolio-source-mismatch');
  if (!plan.portfolioSnapshotHash) blockers.push('portfolio-snapshot-hash-missing');
  else if (plan.portfolioSnapshotHash !== expectedHash) blockers.push('portfolio-snapshot-hash-mismatch');
  if (!plan.portfolioUpdatedAt) blockers.push('portfolio-updated-at-missing');
  else if (plan.portfolioUpdatedAt !== expectedUpdatedAt) blockers.push('portfolio-updated-at-mismatch');
  const actual = new Map(plan.activeCounts.map((item) => [item.platform, `${item.activeGames}:${item.reservedGames}`]));
  const expected = new Map(expectedActiveCounts.map((item) => [item.platform, `${item.activeGames}:${item.reservedGames}`]));
  const platforms = new Set([...actual.keys(), ...expected.keys()]);
  for (const platform of platforms) if (actual.get(platform) !== expected.get(platform)) blockers.push('active-counts-mismatch');
  return { passed: blockers.length === 0, blockers: [...new Set(blockers)], expectedHash, expectedUpdatedAt, expectedActiveCounts };
}

/** Boolean convenience for callers that only need the gate result. */
export function accountCapacityPlanMatchesPortfolio(planValue: unknown, portfolioValue: unknown): boolean {
  try { return evaluateAccountCapacityPortfolioBinding(planValue, portfolioValue).passed; } catch { return false; }
}
