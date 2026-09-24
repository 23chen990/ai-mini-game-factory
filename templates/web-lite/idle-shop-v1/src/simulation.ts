/*
 * The idle line keeps its economy in a small, pure module.  The browser shell
 * is responsible for persistence, rendering, and timers; this module owns the
 * state transitions that can be replayed by tests and by an independent QA
 * runner.  Keeping the two concerns separate prevents a visual fix from
 * silently changing the economy.
 */
export type IdleEconomyConfig = {
  startingCurrency: number;
  orderReward: number;
  baseUpgradeCost: number;
};

export type IdleState = {
  version: 1;
  currency: number;
  level: number;
  inventory: number;
  customerWaiting: boolean;
  randomSeed: number;
};

const clone = (state: IdleState): IdleState => structuredClone(state);

export function createInitialState(config: IdleEconomyConfig): IdleState {
  return {
    version: 1,
    currency: Math.max(0, Math.floor(config.startingCurrency)),
    level: 1,
    inventory: 0,
    customerWaiting: true,
    randomSeed: 1,
  };
}

export function getUpgradeCost(config: IdleEconomyConfig, state: Pick<IdleState, 'level'>): number {
  return Math.max(0, Math.ceil(config.baseUpgradeCost * state.level));
}

export function produce(state: IdleState): IdleState {
  const next = clone(state);
  next.inventory += 1;
  return next;
}

export function spawnCustomer(state: IdleState): IdleState {
  const next = clone(state);
  next.customerWaiting = true;
  return next;
}

export function completeOrder(config: IdleEconomyConfig, state: IdleState): IdleState {
  if (!state.customerWaiting || state.inventory < 1) return clone(state);
  const next = clone(state);
  next.inventory -= 1;
  next.customerWaiting = false;
  next.currency += Math.max(0, Math.floor(config.orderReward * next.level));
  return next;
}

export function grantCurrency(state: IdleState, amount = 10): IdleState {
  const next = clone(state);
  next.currency += Math.max(0, Math.floor(amount));
  return next;
}

export function upgradeStation(config: IdleEconomyConfig, state: IdleState): IdleState {
  const cost = getUpgradeCost(config, state);
  if (state.currency < cost) return clone(state);
  const next = clone(state);
  next.currency -= cost;
  next.level += 1;
  return next;
}

export function setRandomSeed(state: IdleState, seed: number): IdleState {
  const next = clone(state);
  next.randomSeed = (Number.isFinite(seed) ? Math.trunc(seed) : 0) >>> 0;
  return next;
}
