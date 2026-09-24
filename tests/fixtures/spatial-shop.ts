import type { SpatialShopSpec } from '../../src/schemas/index.js';

export const beachSpatialShop: SpatialShopSpec = {
  schemaVersion: 1,
  world: { width: 540, height: 960 },
  player: {
    start: { x: 270, y: 760 },
    speed: 220,
    capacity: 4,
    interactionRadius: 64,
    pickupIntervalMs: 140,
    depositIntervalMs: 120,
  },
  economy: { startingCurrency: 0 },
  products: [
    { id: 'fresh-fish', name: '鲜鱼', color: '#4BA3C7', saleValue: 2 },
    { id: 'kelp', name: '海带', color: '#4F8A5B', saleValue: 3 },
  ],
  stations: [
    { id: 'net', kind: 'producer', label: '近岸渔网', position: { x: 120, y: 180 }, initiallyUnlocked: true, outputProductId: 'fresh-fish', cycleMs: 900, capacity: 6 },
    { id: 'fish-shelf', kind: 'shelf', label: '鲜鱼冰盘', position: { x: 270, y: 420 }, initiallyUnlocked: true, acceptsProductIds: ['fresh-fish'], capacity: 8 },
    { id: 'checkout', kind: 'checkout', label: '收银桌', position: { x: 270, y: 640 }, initiallyUnlocked: true, serviceMs: 700 },
    { id: 'kelp-pool', kind: 'producer', label: '潮池', position: { x: 420, y: 180 }, initiallyUnlocked: false, outputProductId: 'kelp', cycleMs: 1_200, capacity: 5 },
    { id: 'kelp-shelf', kind: 'shelf', label: '海带篮', position: { x: 410, y: 420 }, initiallyUnlocked: false, acceptsProductIds: ['kelp'], capacity: 6 },
    { id: 'kelp-build', kind: 'construction', label: '扩建潮池', position: { x: 410, y: 720 }, initiallyUnlocked: true, cost: 4, contributionIntervalMs: 180, unlockStationIds: ['kelp-pool', 'kelp-shelf'] },
    { id: 'capacity-upgrade', kind: 'upgrade', label: '扩容', position: { x: 120, y: 720 }, initiallyUnlocked: true, target: 'player-capacity', amount: 2, baseCost: 4, costMultiplier: 2, maxPurchases: 3, purchaseIntervalMs: 500 },
  ],
  customers: {
    entrance: { x: 32, y: 520 },
    exit: { x: 508, y: 520 },
    spawnIntervalMs: 3_500,
    moveSpeed: 180,
    patienceMs: 8_000,
    demand: [
      { productId: 'fresh-fish', weight: 3 },
      { productId: 'kelp', weight: 1 },
    ],
  },
  flowEvents: [
    { id: 'high-tide', label: '涨潮', kind: 'production-boost', stationIds: ['net'], startsAtMs: 15_000, durationMs: 5_000, repeatEveryMs: 30_000, multiplier: 1.5 },
  ],
};

export const airportSpatialShop: SpatialShopSpec = {
  ...beachSpatialShop,
  products: [
    { id: 'meal-box', name: '航餐', color: '#E98A3F', saleValue: 5 },
    { id: 'drink', name: '饮料', color: '#67B7DC', saleValue: 3 },
  ],
  stations: [
    { id: 'kitchen', kind: 'producer', label: '航餐厨房', position: { x: 110, y: 180 }, initiallyUnlocked: true, outputProductId: 'meal-box', cycleMs: 1_000, capacity: 5 },
    { id: 'meal-cart', kind: 'shelf', label: '餐车', position: { x: 270, y: 420 }, initiallyUnlocked: true, acceptsProductIds: ['meal-box'], capacity: 7 },
    { id: 'checkout', kind: 'checkout', label: '舱内服务', position: { x: 270, y: 640 }, initiallyUnlocked: true, serviceMs: 600 },
    { id: 'drink-station', kind: 'producer', label: '饮料台', position: { x: 420, y: 180 }, initiallyUnlocked: false, outputProductId: 'drink', cycleMs: 800, capacity: 6 },
    { id: 'drink-cart', kind: 'shelf', label: '饮料车', position: { x: 410, y: 420 }, initiallyUnlocked: false, acceptsProductIds: ['drink'], capacity: 8 },
    { id: 'drink-build', kind: 'construction', label: '加装饮料台', position: { x: 410, y: 720 }, initiallyUnlocked: true, cost: 5, contributionIntervalMs: 180, unlockStationIds: ['drink-station', 'drink-cart'] },
    { id: 'capacity-upgrade', kind: 'upgrade', label: '餐车扩容', position: { x: 120, y: 720 }, initiallyUnlocked: true, target: 'player-capacity', amount: 2, baseCost: 5, costMultiplier: 2, maxPurchases: 3, purchaseIntervalMs: 500 },
  ],
  customers: {
    ...beachSpatialShop.customers,
    demand: [
      { productId: 'meal-box', weight: 4 },
      { productId: 'drink', weight: 1 },
    ],
  },
  flowEvents: [
    { id: 'boarding-rush', label: '登机高峰', kind: 'demand-rush', stationIds: [], startsAtMs: 10_000, durationMs: 6_000, repeatEveryMs: 25_000, multiplier: 2 },
  ],
};
