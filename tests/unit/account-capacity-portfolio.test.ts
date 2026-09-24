import { describe, expect, it } from 'vitest';
import { accountCapacityPlanMatchesPortfolio, accountPortfolioHash, buildAccountCapacityPlan, deriveActiveCountsFromPortfolio, evaluateAccountCapacity, evaluateAccountCapacityPortfolioBinding } from '../../src/core/account-capacity.js';
import { AccountPortfolioSchema } from '../../src/schemas/account-capacity.js';

describe('operator account portfolio snapshot', () => {
  it('derives active and reserved counts without trusting a run-local guess', () => {
    const portfolio = AccountPortfolioSchema.parse({
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      entries: [
        { gameId: 'a', platform: 'wechat-minigame', status: 'active', updatedAt: new Date().toISOString() },
        { gameId: 'b', platform: 'wechat-minigame', status: 'reserved', updatedAt: new Date().toISOString() },
        { gameId: 'c', platform: 'douyin-minigame', status: 'retired', updatedAt: new Date().toISOString() },
      ],
    });
    expect(deriveActiveCountsFromPortfolio(portfolio)).toEqual(expect.arrayContaining([
      { platform: 'wechat-minigame', activeGames: 1, reservedGames: 1 },
      { platform: 'douyin-minigame', activeGames: 0, reservedGames: 0 },
    ]));
    const plan = buildAccountCapacityPlan({ entity: 'personal', capacities: [{ platform: 'wechat-minigame', maxGames: 3 }], activeCounts: deriveActiveCountsFromPortfolio(portfolio, ['wechat-minigame']), portfolioSnapshotHash: accountPortfolioHash(portfolio), portfolioUpdatedAt: portfolio.updatedAt, source: 'portfolio' });
    expect(evaluateAccountCapacity(plan).passed).toBe(true);
    expect(accountCapacityPlanMatchesPortfolio(plan, portfolio)).toBe(true);
    expect(evaluateAccountCapacityPortfolioBinding(plan, portfolio)).toMatchObject({ passed: true, blockers: [] });
  });

  it('rejects a capacity plan when the operator portfolio changes or the binding is missing', () => {
    const updatedAt = new Date().toISOString();
    const portfolio = AccountPortfolioSchema.parse({ schemaVersion: 1, updatedAt, entries: [{ gameId: 'a', platform: 'wechat-minigame', status: 'active', updatedAt }] });
    const plan = buildAccountCapacityPlan({ entity: 'personal', capacities: [{ platform: 'wechat-minigame', maxGames: 3 }], activeCounts: deriveActiveCountsFromPortfolio(portfolio, ['wechat-minigame']), source: 'portfolio' });
    expect(accountCapacityPlanMatchesPortfolio(plan, portfolio)).toBe(false);
    expect(evaluateAccountCapacityPortfolioBinding(plan, portfolio).blockers).toEqual(expect.arrayContaining(['portfolio-snapshot-hash-missing']));

    const changed = AccountPortfolioSchema.parse({ ...portfolio, updatedAt: new Date(Date.parse(updatedAt) + 1_000).toISOString(), entries: [...portfolio.entries, { gameId: 'b', platform: 'wechat-minigame', status: 'reserved', updatedAt: new Date(Date.parse(updatedAt) + 1_000).toISOString() }] });
    const bound = buildAccountCapacityPlan({ entity: 'personal', capacities: [{ platform: 'wechat-minigame', maxGames: 3 }], activeCounts: deriveActiveCountsFromPortfolio(portfolio, ['wechat-minigame']), portfolioSnapshotHash: accountPortfolioHash(portfolio), portfolioUpdatedAt: portfolio.updatedAt, source: 'portfolio' });
    const result = evaluateAccountCapacityPortfolioBinding(bound, changed);
    expect(result.passed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining(['portfolio-snapshot-hash-mismatch', 'active-counts-mismatch', 'portfolio-updated-at-mismatch']));
  });
});
