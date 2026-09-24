import { z } from 'zod';

const SpatialIdSchema = z.string().trim().regex(/^[a-z][a-z0-9-]*$/);
const PositionSchema = z.object({ x: z.number().nonnegative(), y: z.number().nonnegative() });
const StationBaseSchema = z.object({
  id: SpatialIdSchema,
  label: z.string().trim().min(1),
  position: PositionSchema,
  initiallyUnlocked: z.boolean(),
});

const ProducerStationSchema = StationBaseSchema.extend({
  kind: z.literal('producer'),
  outputProductId: SpatialIdSchema,
  cycleMs: z.number().int().positive(),
  capacity: z.number().int().positive(),
});

const ShelfStationSchema = StationBaseSchema.extend({
  kind: z.literal('shelf'),
  acceptsProductIds: z.array(SpatialIdSchema).min(1),
  capacity: z.number().int().positive(),
});

const CheckoutStationSchema = StationBaseSchema.extend({
  kind: z.literal('checkout'),
  serviceMs: z.number().int().positive(),
});

const ConstructionStationSchema = StationBaseSchema.extend({
  kind: z.literal('construction'),
  cost: z.number().int().positive(),
  contributionIntervalMs: z.number().int().positive(),
  unlockStationIds: z.array(SpatialIdSchema).min(1),
});

const UpgradeStationSchema = StationBaseSchema.extend({
  kind: z.literal('upgrade'),
  target: z.enum(['player-capacity', 'player-speed', 'checkout-speed']),
  amount: z.number().positive(),
  baseCost: z.number().int().positive(),
  costMultiplier: z.number().min(1),
  maxPurchases: z.number().int().positive(),
  purchaseIntervalMs: z.number().int().positive(),
});

export const SpatialShopStationSchema = z.discriminatedUnion('kind', [
  ProducerStationSchema,
  ShelfStationSchema,
  CheckoutStationSchema,
  ConstructionStationSchema,
  UpgradeStationSchema,
]);

export const SpatialShopSpecSchema = z.object({
  schemaVersion: z.literal(1),
  world: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  player: z.object({
    start: PositionSchema,
    speed: z.number().positive(),
    capacity: z.number().int().positive(),
    interactionRadius: z.number().positive(),
    pickupIntervalMs: z.number().int().positive(),
    depositIntervalMs: z.number().int().positive(),
  }),
  economy: z.object({ startingCurrency: z.number().int().nonnegative() }),
  products: z.array(z.object({
    id: SpatialIdSchema,
    name: z.string().trim().min(1),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    saleValue: z.number().int().positive(),
  })).min(1),
  stations: z.array(SpatialShopStationSchema).min(3),
  customers: z.object({
    entrance: PositionSchema,
    exit: PositionSchema,
    spawnIntervalMs: z.number().int().positive(),
    moveSpeed: z.number().positive(),
    patienceMs: z.number().int().positive(),
    demand: z.array(z.object({ productId: SpatialIdSchema, weight: z.number().positive() })).min(1),
  }),
  flowEvents: z.array(z.object({
    id: SpatialIdSchema,
    label: z.string().trim().min(1),
    kind: z.enum(['production-boost', 'demand-rush']),
    stationIds: z.array(SpatialIdSchema).default([]),
    startsAtMs: z.number().int().nonnegative(),
    durationMs: z.number().int().positive(),
    repeatEveryMs: z.number().int().positive(),
    multiplier: z.number().positive(),
  })).default([]),
}).superRefine((spec, context) => {
  const productIds = new Set(spec.products.map((product) => product.id));
  const stationById = new Map(spec.stations.map((station) => [station.id, station]));
  const duplicate = <T>(values: T[]) => values.find((value, index) => values.indexOf(value) !== index);
  const duplicateProduct = duplicate(spec.products.map((product) => product.id));
  const duplicateStation = duplicate(spec.stations.map((station) => station.id));
  const duplicateEvent = duplicate(spec.flowEvents.map((event) => event.id));
  if (duplicateProduct) context.addIssue({ code: 'custom', path: ['products'], message: `duplicate product id: ${duplicateProduct}` });
  if (duplicateStation) context.addIssue({ code: 'custom', path: ['stations'], message: `duplicate station id: ${duplicateStation}` });
  if (duplicateEvent) context.addIssue({ code: 'custom', path: ['flowEvents'], message: `duplicate flow event id: ${duplicateEvent}` });

  const inWorld = (position: z.infer<typeof PositionSchema>) => position.x <= spec.world.width && position.y <= spec.world.height;
  if (!inWorld(spec.player.start)) context.addIssue({ code: 'custom', path: ['player', 'start'], message: 'player start must be inside the world' });
  if (!inWorld(spec.customers.entrance)) context.addIssue({ code: 'custom', path: ['customers', 'entrance'], message: 'customer entrance must be inside the world' });
  if (!inWorld(spec.customers.exit)) context.addIssue({ code: 'custom', path: ['customers', 'exit'], message: 'customer exit must be inside the world' });

  const checkouts = spec.stations.filter((station) => station.kind === 'checkout');
  if (checkouts.length !== 1) context.addIssue({ code: 'custom', path: ['stations'], message: 'spatial shops require exactly one checkout' });

  for (const [index, station] of spec.stations.entries()) {
    if (!inWorld(station.position)) context.addIssue({ code: 'custom', path: ['stations', index, 'position'], message: 'station must be inside the world' });
    if (station.kind === 'producer' && !productIds.has(station.outputProductId)) {
      context.addIssue({ code: 'custom', path: ['stations', index, 'outputProductId'], message: `unknown product: ${station.outputProductId}` });
    }
    if (station.kind === 'shelf') {
      for (const productId of station.acceptsProductIds) {
        if (!productIds.has(productId)) context.addIssue({ code: 'custom', path: ['stations', index, 'acceptsProductIds'], message: `unknown product: ${productId}` });
      }
    }
    if (station.kind === 'construction') {
      for (const stationId of station.unlockStationIds) {
        if (!stationById.has(stationId)) context.addIssue({ code: 'custom', path: ['stations', index, 'unlockStationIds'], message: `unknown station: ${stationId}` });
        if (stationId === station.id) context.addIssue({ code: 'custom', path: ['stations', index, 'unlockStationIds'], message: 'construction cannot unlock itself' });
      }
    }
  }

  for (const [index, demand] of spec.customers.demand.entries()) {
    if (!productIds.has(demand.productId)) context.addIssue({ code: 'custom', path: ['customers', 'demand', index, 'productId'], message: `unknown product: ${demand.productId}` });
    const hasShelf = spec.stations.some((station) => station.kind === 'shelf' && station.acceptsProductIds.includes(demand.productId));
    if (!hasShelf) context.addIssue({ code: 'custom', path: ['customers', 'demand', index, 'productId'], message: `product has no shelf: ${demand.productId}` });
  }

  const initialProducerProducts = new Set(spec.stations.flatMap((station) => station.kind === 'producer' && station.initiallyUnlocked ? [station.outputProductId] : []));
  const hasInitialLoop = spec.stations.some((station) => station.kind === 'shelf' && station.initiallyUnlocked && station.acceptsProductIds.some((id) => initialProducerProducts.has(id)));
  if (!hasInitialLoop || !checkouts[0]?.initiallyUnlocked) context.addIssue({ code: 'custom', path: ['stations'], message: 'initial stations must contain an unlocked producer-to-shelf-to-checkout loop' });

  for (const [index, event] of spec.flowEvents.entries()) {
    if (event.durationMs > event.repeatEveryMs) context.addIssue({ code: 'custom', path: ['flowEvents', index, 'durationMs'], message: 'flow event duration must not exceed its repeat interval' });
    if (event.kind === 'production-boost') {
      if (event.stationIds.length === 0) context.addIssue({ code: 'custom', path: ['flowEvents', index, 'stationIds'], message: 'production boosts require producer station ids' });
      for (const stationId of event.stationIds) {
        if (stationById.get(stationId)?.kind !== 'producer') context.addIssue({ code: 'custom', path: ['flowEvents', index, 'stationIds'], message: `production boost target is not a producer: ${stationId}` });
      }
    }
  }
});

export type SpatialShopStation = z.infer<typeof SpatialShopStationSchema>;
export type SpatialShopSpec = z.infer<typeof SpatialShopSpecSchema>;
