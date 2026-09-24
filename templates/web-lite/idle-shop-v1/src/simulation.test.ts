import { describe, expect, it } from 'vitest';
import {
  completeOrder,
  createInitialState,
  getUpgradeCost,
  grantCurrency,
  produce,
  setRandomSeed,
  upgradeStation,
} from './simulation.js';

const economy = { startingCurrency: 0, orderReward: 5, baseUpgradeCost: 10 };

describe('idle shop deterministic economy', () => {
  it('runs production, delivery, reward, and upgrade as observable transitions', () => {
    let state = createInitialState(economy);
    state = produce(state);
    state = completeOrder(economy, state);
    expect(state).toMatchObject({ inventory: 0, customerWaiting: false, currency: 5, level: 1 });
    state = grantCurrency(state, 5);
    expect(getUpgradeCost(economy, state)).toBe(10);
    state = upgradeStation(economy, state);
    expect(state).toMatchObject({ currency: 0, level: 2 });
  });

  it('is immutable and deterministic for equal inputs', () => {
    const initial = createInitialState(economy);
    const next = setRandomSeed(initial, 42);
    expect(initial.randomSeed).toBe(1);
    expect(next).toEqual(setRandomSeed(initial, 42));
    expect(completeOrder(economy, initial)).toEqual(initial);
  });
});
