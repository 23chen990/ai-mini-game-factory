import { describe, expect, it } from 'vitest';
import generatedConfig from './generated/game-config.json';
import { advanceGame, createInitialState, setPlayerPosition, type SpatialShopConfig } from './simulation.js';

const shop = generatedConfig.spatialShop as SpatialShopConfig;

describe('generated spatial shop core', () => {
  it('collects and deposits the configured product', () => {
    const producer = shop.stations.find((station) => station.kind === 'producer' && station.initiallyUnlocked);
    const shelf = shop.stations.find((station) => station.kind === 'shelf' && station.initiallyUnlocked);
    expect(producer?.kind).toBe('producer');
    expect(shelf?.kind).toBe('shelf');
    if (producer?.kind !== 'producer' || shelf?.kind !== 'shelf') return;

    let state = createInitialState(shop);
    state = setPlayerPosition(state, producer.position);
    state = advanceGame(shop, state, shop.player.pickupIntervalMs + 10);
    expect(state.player.inventory[producer.outputProductId]).toBe(1);

    state = setPlayerPosition(state, shelf.position);
    state = advanceGame(shop, state, shop.player.depositIntervalMs + 10);
    expect(state.stations[shelf.id]?.stock[producer.outputProductId]).toBe(1);
  });

  it('is deterministic for equal state, input, and duration', () => {
    const initial = createInitialState(shop);
    expect(advanceGame(shop, initial, 1_000, { x: 1, y: 0 })).toEqual(advanceGame(shop, initial, 1_000, { x: 1, y: 0 }));
  });
});
