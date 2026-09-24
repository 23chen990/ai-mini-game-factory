/* global structuredClone */
export type Position = { x: number; y: number };
export type MoveInput = { x: number; y: number };

export type ProductDefinition = {
  id: string;
  name: string;
  color: string;
  saleValue: number;
};

type StationBase = { id: string; label: string; position: Position; initiallyUnlocked: boolean };
export type ProducerStation = StationBase & { kind: 'producer'; outputProductId: string; cycleMs: number; capacity: number };
export type ShelfStation = StationBase & { kind: 'shelf'; acceptsProductIds: string[]; capacity: number };
export type CheckoutStation = StationBase & { kind: 'checkout'; serviceMs: number };
export type ConstructionStation = StationBase & { kind: 'construction'; cost: number; contributionIntervalMs: number; unlockStationIds: string[] };
export type UpgradeStation = StationBase & {
  kind: 'upgrade';
  target: 'player-capacity' | 'player-speed' | 'checkout-speed';
  amount: number;
  baseCost: number;
  costMultiplier: number;
  maxPurchases: number;
  purchaseIntervalMs: number;
};
export type StationDefinition = ProducerStation | ShelfStation | CheckoutStation | ConstructionStation | UpgradeStation;

export type SpatialShopConfig = {
  schemaVersion: 1;
  world: { width: number; height: number };
  player: {
    start: Position;
    speed: number;
    capacity: number;
    interactionRadius: number;
    pickupIntervalMs: number;
    depositIntervalMs: number;
  };
  economy: { startingCurrency: number };
  products: ProductDefinition[];
  stations: StationDefinition[];
  customers: {
    entrance: Position;
    exit: Position;
    spawnIntervalMs: number;
    moveSpeed: number;
    patienceMs: number;
    demand: Array<{ productId: string; weight: number }>;
  };
  flowEvents: Array<{
    id: string;
    label: string;
    kind: 'production-boost' | 'demand-rush';
    stationIds: string[];
    startsAtMs: number;
    durationMs: number;
    repeatEveryMs: number;
    multiplier: number;
  }>;
};

export type CustomerPhase = 'to-shelf' | 'waiting-shelf' | 'to-checkout' | 'queued' | 'leaving' | 'left';
export type CustomerState = Position & {
  id: number;
  phase: CustomerPhase;
  productId: string;
  targetShelfId: string;
  patienceRemainingMs: number;
  basketValue: number;
};

export type StationRuntimeState = {
  ready: number;
  cycleProgressMs: number;
  stock: Record<string, number>;
  contributed: number;
  completed: boolean;
  purchases: number;
};

export type GameState = {
  version: 1;
  elapsedMs: number;
  randomSeed: number;
  currency: number;
  level: number;
  player: Position & {
    inventory: Record<string, number>;
    capacity: number;
    speed: number;
    interactionStationId: string | null;
    interactionProgressMs: number;
  };
  stations: Record<string, StationRuntimeState>;
  unlockedStationIds: string[];
  checkout: { queue: number; serviceProgressMs: number; speedBonusMs: number };
  customers: CustomerState[];
  nextCustomerId: number;
  feedbackEvents: number;
};

const FIXED_STEP_MS = 50;

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function emptyInventory(config: SpatialShopConfig): Record<string, number> {
  return Object.fromEntries(config.products.map((product) => [product.id, 0]));
}

function stationRuntime(station: StationDefinition): StationRuntimeState {
  return {
    ready: station.kind === 'producer' ? station.capacity : 0,
    cycleProgressMs: 0,
    stock: {},
    contributed: 0,
    completed: false,
    purchases: 0,
  };
}

export function createInitialState(config: SpatialShopConfig): GameState {
  return {
    version: 1,
    elapsedMs: 0,
    randomSeed: 1,
    currency: config.economy.startingCurrency,
    level: 1,
    player: {
      ...config.player.start,
      inventory: emptyInventory(config),
      capacity: config.player.capacity,
      speed: config.player.speed,
      interactionStationId: null,
      interactionProgressMs: 0,
    },
    stations: Object.fromEntries(config.stations.map((station) => [station.id, stationRuntime(station)])),
    unlockedStationIds: config.stations.filter((station) => station.initiallyUnlocked).map((station) => station.id),
    checkout: { queue: 0, serviceProgressMs: 0, speedBonusMs: 0 },
    customers: [],
    nextCustomerId: 1,
    feedbackEvents: 0,
  };
}

function distance(left: Position, right: Position): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function isNear(config: SpatialShopConfig, left: Position, right: Position): boolean {
  return distance(left, right) <= config.player.interactionRadius;
}

function isUnlocked(state: GameState, stationId: string): boolean {
  return state.unlockedStationIds.includes(stationId);
}

function isFlowEventActive(state: Pick<GameState, 'elapsedMs'>, event: SpatialShopConfig['flowEvents'][number]): boolean {
  if (state.elapsedMs < event.startsAtMs) return false;
  return (state.elapsedMs - event.startsAtMs) % event.repeatEveryMs < event.durationMs;
}

export function getProductionMultiplier(config: SpatialShopConfig, state: Pick<GameState, 'elapsedMs'>, stationId: string): number {
  return config.flowEvents
    .filter((event) => event.kind === 'production-boost' && event.stationIds.includes(stationId) && isFlowEventActive(state, event))
    .reduce((multiplier, event) => multiplier * event.multiplier, 1);
}

export function getCustomerSpawnInterval(config: SpatialShopConfig, state: Pick<GameState, 'elapsedMs'>): number {
  const multiplier = config.flowEvents
    .filter((event) => event.kind === 'demand-rush' && isFlowEventActive(state, event))
    .reduce((value, event) => value * event.multiplier, 1);
  return config.customers.spawnIntervalMs / multiplier;
}

function updatePlayerMovement(config: SpatialShopConfig, state: GameState, input: MoveInput, deltaMs: number): void {
  const magnitude = Math.hypot(input.x, input.y);
  if (magnitude > 0) {
    const travel = state.player.speed * deltaMs / 1_000;
    state.player.x += input.x / magnitude * travel;
    state.player.y += input.y / magnitude * travel;
  }
  state.player.x = Math.min(config.world.width, Math.max(0, state.player.x));
  state.player.y = Math.min(config.world.height, Math.max(0, state.player.y));
}

function updateProducers(config: SpatialShopConfig, state: GameState, deltaMs: number): void {
  for (const station of config.stations) {
    if (station.kind !== 'producer' || !isUnlocked(state, station.id)) continue;
    const runtime = state.stations[station.id];
    if (!runtime) continue;
    if (runtime.ready >= station.capacity) {
      runtime.cycleProgressMs = 0;
      continue;
    }
    runtime.cycleProgressMs += deltaMs * getProductionMultiplier(config, state, station.id);
    while (runtime.cycleProgressMs >= station.cycleMs && runtime.ready < station.capacity) {
      runtime.cycleProgressMs -= station.cycleMs;
      runtime.ready += 1;
      state.feedbackEvents += 1;
    }
  }
}

function carriedCount(state: GameState): number {
  return Object.values(state.player.inventory).reduce((sum, count) => sum + count, 0);
}

function firstCarriedProduct(config: SpatialShopConfig, state: GameState, accepted: string[]): string | undefined {
  return config.products.find((product) => accepted.includes(product.id) && (state.player.inventory[product.id] ?? 0) > 0)?.id;
}

function upgradeCost(station: UpgradeStation, runtime: StationRuntimeState): number {
  return Math.ceil(station.baseCost * station.costMultiplier ** runtime.purchases);
}

function interactionPriority(config: SpatialShopConfig, state: GameState, station: StationDefinition): number | null {
  const runtime = state.stations[station.id];
  if (!runtime || !isUnlocked(state, station.id) || !isNear(config, state.player, station.position)) return null;
  if (station.kind === 'shelf' && firstCarriedProduct(config, state, station.acceptsProductIds) && Object.values(runtime.stock).reduce((sum, count) => sum + count, 0) < station.capacity) return 0;
  if (station.kind === 'producer' && runtime.ready > 0 && carriedCount(state) < state.player.capacity) return 1;
  if (station.kind === 'checkout' && state.checkout.queue > 0) return 2;
  if (station.kind === 'construction' && !runtime.completed && runtime.contributed < station.cost && state.currency > 0) return 3;
  if (station.kind === 'upgrade' && runtime.purchases < station.maxPurchases && state.currency >= upgradeCost(station, runtime)) return 4;
  return null;
}

function activeInteraction(config: SpatialShopConfig, state: GameState): StationDefinition | undefined {
  return config.stations
    .map((station) => ({ station, priority: interactionPriority(config, state, station) }))
    .filter((candidate): candidate is { station: StationDefinition; priority: number } => candidate.priority !== null)
    .sort((left, right) => left.priority - right.priority || left.station.id.localeCompare(right.station.id))[0]?.station;
}

function applyUpgrade(state: GameState, station: UpgradeStation, runtime: StationRuntimeState): void {
  const cost = upgradeCost(station, runtime);
  state.currency -= cost;
  runtime.purchases += 1;
  state.level += 1;
  if (station.target === 'player-capacity') state.player.capacity += Math.floor(station.amount);
  if (station.target === 'player-speed') state.player.speed += station.amount;
  if (station.target === 'checkout-speed') state.checkout.speedBonusMs += station.amount;
  state.feedbackEvents += 1;
}

function updatePlayerInteraction(config: SpatialShopConfig, state: GameState, deltaMs: number): void {
  const station = activeInteraction(config, state);
  if (!station) {
    state.player.interactionStationId = null;
    state.player.interactionProgressMs = 0;
    return;
  }
  if (state.player.interactionStationId !== station.id) {
    state.player.interactionStationId = station.id;
    state.player.interactionProgressMs = 0;
  }
  const runtime = state.stations[station.id];
  if (!runtime) return;
  state.player.interactionProgressMs += deltaMs;

  const interval = station.kind === 'producer'
    ? config.player.pickupIntervalMs
    : station.kind === 'shelf'
      ? config.player.depositIntervalMs
      : station.kind === 'construction'
        ? station.contributionIntervalMs
        : station.kind === 'upgrade'
          ? station.purchaseIntervalMs
          : Number.POSITIVE_INFINITY;

  while (state.player.interactionProgressMs >= interval) {
    state.player.interactionProgressMs -= interval;
    if (station.kind === 'producer' && runtime.ready > 0 && carriedCount(state) < state.player.capacity) {
      runtime.ready -= 1;
      state.player.inventory[station.outputProductId] = (state.player.inventory[station.outputProductId] ?? 0) + 1;
      state.feedbackEvents += 1;
      continue;
    }
    if (station.kind === 'shelf') {
      const productId = firstCarriedProduct(config, state, station.acceptsProductIds);
      const shelfCount = Object.values(runtime.stock).reduce((sum, count) => sum + count, 0);
      if (productId && shelfCount < station.capacity) {
        state.player.inventory[productId] = (state.player.inventory[productId] ?? 0) - 1;
        runtime.stock[productId] = (runtime.stock[productId] ?? 0) + 1;
        state.feedbackEvents += 1;
        continue;
      }
    }
    if (station.kind === 'construction' && state.currency > 0 && runtime.contributed < station.cost) {
      state.currency -= 1;
      runtime.contributed += 1;
      state.feedbackEvents += 1;
      if (runtime.contributed >= station.cost) {
        runtime.completed = true;
        for (const stationId of station.unlockStationIds) {
          if (!state.unlockedStationIds.includes(stationId)) state.unlockedStationIds.push(stationId);
        }
        state.level += 1;
      }
      continue;
    }
    if (station.kind === 'upgrade' && runtime.purchases < station.maxPurchases && state.currency >= upgradeCost(station, runtime)) {
      applyUpgrade(state, station, runtime);
      continue;
    }
    state.player.interactionProgressMs = 0;
    break;
  }
}

function moveToward(entity: Position, target: Position, speed: number, deltaMs: number): boolean {
  const dx = target.x - entity.x;
  const dy = target.y - entity.y;
  const remaining = Math.hypot(dx, dy);
  const travel = speed * deltaMs / 1_000;
  if (remaining === 0 || remaining <= travel) {
    entity.x = target.x;
    entity.y = target.y;
    return true;
  }
  entity.x += dx / remaining * travel;
  entity.y += dy / remaining * travel;
  return false;
}

function stationById(config: SpatialShopConfig, stationId: string): StationDefinition | undefined {
  return config.stations.find((station) => station.id === stationId);
}

function productById(config: SpatialShopConfig, productId: string): ProductDefinition | undefined {
  return config.products.find((product) => product.id === productId);
}

function updateCustomers(config: SpatialShopConfig, state: GameState, deltaMs: number): void {
  const checkout = config.stations.find((station): station is CheckoutStation => station.kind === 'checkout');
  if (!checkout) return;
  for (const customer of state.customers) {
    const shelf = stationById(config, customer.targetShelfId);
    if (customer.phase === 'to-shelf' && shelf && moveToward(customer, shelf.position, config.customers.moveSpeed, deltaMs)) customer.phase = 'waiting-shelf';
    if (customer.phase === 'waiting-shelf') {
      const runtime = state.stations[customer.targetShelfId];
      if (runtime && (runtime.stock[customer.productId] ?? 0) > 0) {
        runtime.stock[customer.productId] = (runtime.stock[customer.productId] ?? 0) - 1;
        customer.basketValue = productById(config, customer.productId)?.saleValue ?? 0;
        customer.phase = 'to-checkout';
        state.feedbackEvents += 1;
      } else {
        customer.patienceRemainingMs -= deltaMs;
        if (customer.patienceRemainingMs <= 0) customer.phase = 'leaving';
      }
    }
    if (customer.phase === 'to-checkout' && moveToward(customer, checkout.position, config.customers.moveSpeed, deltaMs)) {
      customer.phase = 'queued';
      state.checkout.queue += 1;
      state.feedbackEvents += 1;
    }
    if (customer.phase === 'leaving' && moveToward(customer, config.customers.exit, config.customers.moveSpeed, deltaMs)) customer.phase = 'left';
  }
}

function updateCheckout(config: SpatialShopConfig, state: GameState, deltaMs: number): void {
  const checkout = config.stations.find((station): station is CheckoutStation => station.kind === 'checkout');
  if (!checkout || state.checkout.queue === 0 || !isNear(config, state.player, checkout.position)) {
    state.checkout.serviceProgressMs = 0;
    return;
  }
  const serviceMs = Math.max(100, checkout.serviceMs - state.checkout.speedBonusMs);
  state.checkout.serviceProgressMs += deltaMs;
  while (state.checkout.serviceProgressMs >= serviceMs && state.checkout.queue > 0) {
    state.checkout.serviceProgressMs -= serviceMs;
    const customer = state.customers.find((candidate) => candidate.phase === 'queued');
    if (!customer) {
      state.checkout.queue = 0;
      break;
    }
    customer.phase = 'leaving';
    state.checkout.queue -= 1;
    state.currency += customer.basketValue;
    state.feedbackEvents += 1;
  }
}

function nextRandom(state: GameState): number {
  state.randomSeed = (Math.imul(state.randomSeed, 1_664_525) + 1_013_904_223) >>> 0;
  return state.randomSeed / 0x1_0000_0000;
}

function chooseDemand(config: SpatialShopConfig, state: GameState): { productId: string; shelfId: string } | undefined {
  const available = config.customers.demand.flatMap((demand) => {
    const shelf = config.stations.find((station): station is ShelfStation => station.kind === 'shelf' && isUnlocked(state, station.id) && station.acceptsProductIds.includes(demand.productId));
    return shelf ? [{ ...demand, shelfId: shelf.id }] : [];
  });
  const totalWeight = available.reduce((sum, demand) => sum + demand.weight, 0);
  let cursor = nextRandom(state) * totalWeight;
  for (const demand of available) {
    cursor -= demand.weight;
    if (cursor <= 0) return { productId: demand.productId, shelfId: demand.shelfId };
  }
  const fallback = available.at(-1);
  return fallback ? { productId: fallback.productId, shelfId: fallback.shelfId } : undefined;
}

export function spawnCustomer(config: SpatialShopConfig, stateValue: GameState): GameState {
  const state = cloneState(stateValue);
  const demand = chooseDemand(config, state);
  if (!demand) return state;
  state.customers.push({
    id: state.nextCustomerId,
    phase: 'to-shelf',
    productId: demand.productId,
    targetShelfId: demand.shelfId,
    patienceRemainingMs: config.customers.patienceMs,
    basketValue: 0,
    ...config.customers.entrance,
  });
  state.nextCustomerId += 1;
  return state;
}

export function stepGame(config: SpatialShopConfig, stateValue: GameState, input: MoveInput, deltaMs: number): GameState {
  const state = cloneState(stateValue);
  const safeDeltaMs = Math.max(0, Math.min(deltaMs, 1_000));
  state.elapsedMs += safeDeltaMs;
  updatePlayerMovement(config, state, input, safeDeltaMs);
  updateProducers(config, state, safeDeltaMs);
  updatePlayerInteraction(config, state, safeDeltaMs);
  updateCustomers(config, state, safeDeltaMs);
  updateCheckout(config, state, safeDeltaMs);
  return state;
}

export function advanceGame(config: SpatialShopConfig, stateValue: GameState, durationMs: number, input: MoveInput = { x: 0, y: 0 }): GameState {
  let state = cloneState(stateValue);
  let remaining = Math.max(0, durationMs);
  while (remaining > 0) {
    const step = Math.min(FIXED_STEP_MS, remaining);
    state = stepGame(config, state, input, step);
    remaining -= step;
  }
  return state;
}

export function setPlayerPosition(stateValue: GameState, position: Position): GameState {
  const state = cloneState(stateValue);
  state.player.x = position.x;
  state.player.y = position.y;
  state.player.interactionStationId = null;
  state.player.interactionProgressMs = 0;
  return state;
}

export function grantCurrency(stateValue: GameState, amount: number): GameState {
  const state = cloneState(stateValue);
  state.currency += Math.max(0, Math.floor(amount));
  return state;
}

export function setRandomSeed(stateValue: GameState, seed: number): GameState {
  const state = cloneState(stateValue);
  state.randomSeed = seed >>> 0;
  return state;
}
