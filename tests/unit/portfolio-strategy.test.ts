import { describe, expect, it } from 'vitest';
import { buildPortfolioStrategy, evaluatePortfolioGate, updatePortfolioStrategy } from '../../src/core/portfolio-strategy.js';

describe('first-game portfolio gate', () => {
  it('allows the first title but caps parallel work', () => {
    const strategy = buildPortfolioStrategy({ maxTitlesInFlight: 1 });
    expect(evaluatePortfolioGate(strategy, { requestedGameId: 'first' })).toMatchObject({ passed: true, decision: 'START_FIRST_GAME' });
    expect(evaluatePortfolioGate({ ...strategy, activeGameIds: ['already-in-flight'] }, { requestedGameId: 'second' })).toMatchObject({ passed: false, decision: 'BLOCK', blockers: ['portfolio:in-flight-capacity'] });
  });

  it('blocks a second title until first-game validation has real evidence', () => {
    const validating = updatePortfolioStrategy(buildPortfolioStrategy(), { gameId: 'first', status: 'VALIDATING', evidence: ['candidate-live'] });
    const blocked = evaluatePortfolioGate(validating, { requestedGameId: 'second' });
    expect(blocked.passed).toBe(false);
    expect(blocked.blockers).toContain('portfolio:first-game-validation-required');
  });

  it('opens the portfolio only after a measured first-game result is recorded', () => {
    const verified = updatePortfolioStrategy(buildPortfolioStrategy(), { gameId: 'first', status: 'REVENUE_VERIFIED', evidence: ['launch-metrics/first.json'], validation: { users: 250, observedDays: 7, netRevenueCents: 1200, evidence: ['launch-metrics/first.json'], source: 'launch-metrics' } });
    expect(evaluatePortfolioGate(verified, { requestedGameId: 'second' })).toMatchObject({ passed: true, decision: 'ALLOW_PORTFOLIO' });
  });

  it('does not allow a failed first game to silently expand the matrix', () => {
    const failed = updatePortfolioStrategy(buildPortfolioStrategy(), { gameId: 'first', status: 'FAILED', evidence: ['kill-decision.json'], blockers: ['market-kill'] });
    expect(evaluatePortfolioGate(failed, { requestedGameId: 'second' }).blockers).toContain('portfolio:first-game-failed');
  });

  it('keeps a first-game binding immutable across strategy ids unless explicitly replaced', () => {
    const strategy = updatePortfolioStrategy(buildPortfolioStrategy({ strategyId: 'strategy-a' }), { gameId: 'first', status: 'VALIDATING', evidence: ['candidate-live'] });
    expect(strategy.firstGameId).toBe('first');
    // The control-plane persistence API must not silently replace this record
    // with a different policy merely because the incoming strategy id changed.
    expect(strategy.strategyId).toBe('strategy-a');
  });
});
