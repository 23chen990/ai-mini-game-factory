import { describe, expect, it } from 'vitest';
import {
  advanceGame,
  createInitialState,
  getCustomerSpawnInterval,
  getProductionMultiplier,
  grantCurrency,
  setPlayerPosition,
  spawnCustomer,
} from '../../templates/web-lite/spatial-shop-v1/src/simulation.js';
import { airportSpatialShop, beachSpatialShop } from '../fixtures/spatial-shop.js';

describe('spatial shop deterministic simulation', () => {
  it('provides one reusable simulation module for independent shop configurations', () => {
    expect(createInitialState).toBeTypeOf('function');
    expect(advanceGame).toBeTypeOf('function');
    expect(spawnCustomer).toBeTypeOf('function');
  });

  it('derives products, stations, and demand rhythm from configuration', () => {
    const beach = createInitialState(beachSpatialShop);
    const airport = createInitialState(airportSpatialShop);
    expect(Object.keys(beach.stations)).toContain('net');
    expect(Object.keys(airport.stations)).toContain('kitchen');
    expect(airport.stations).not.toHaveProperty('net');
    expect(getCustomerSpawnInterval(airportSpatialShop, { ...airport, elapsedMs: 11_000 })).toBe(1_750);
    expect(getCustomerSpawnInterval(beachSpatialShop, { ...beach, elapsedMs: 11_000 })).toBe(3_500);
  });

  it('runs the configured collect, stock, customer, checkout, and upgrade loop', () => {
    let state = createInitialState(beachSpatialShop);
    state = setPlayerPosition(state, { x: 120, y: 180 });
    state = advanceGame(beachSpatialShop, state, 150);
    expect(state.player.inventory['fresh-fish']).toBe(1);

    state = setPlayerPosition(state, { x: 270, y: 420 });
    state = advanceGame(beachSpatialShop, state, 130);
    expect(state.player.inventory['fresh-fish']).toBe(0);
    expect(state.stations['fish-shelf']?.stock['fresh-fish']).toBe(1);

    state = spawnCustomer(beachSpatialShop, state);
    state = advanceGame(beachSpatialShop, state, 3_000);
    expect(state.checkout.queue).toBe(1);
    state = setPlayerPosition(state, { x: 270, y: 640 });
    state = advanceGame(beachSpatialShop, state, 750);
    expect(state.currency).toBe(2);

    state = grantCurrency(state, 2);
    state = setPlayerPosition(state, { x: 410, y: 720 });
    state = advanceGame(beachSpatialShop, state, 800);
    expect(state.unlockedStationIds).toEqual(expect.arrayContaining(['kelp-pool', 'kelp-shelf']));

    state = grantCurrency(state, 4);
    state = setPlayerPosition(state, { x: 120, y: 720 });
    state = advanceGame(beachSpatialShop, state, 550);
    expect(state.player.capacity).toBe(6);
  });

  it('applies production windows without embedding theme-specific names in the engine', async () => {
    const initial = createInitialState(beachSpatialShop);
    const normal = getProductionMultiplier(beachSpatialShop, initial, 'net');
    const boosted = getProductionMultiplier(beachSpatialShop, { ...initial, elapsedMs: 16_000 }, 'net');
    expect(normal).toBe(1);
    expect(boosted).toBe(1.5);

    const source = await import('node:fs/promises').then(({ readFile }) => readFile('templates/web-lite/spatial-shop-v1/src/simulation.ts', 'utf8'));
    expect(source).not.toMatch(/鲜鱼|海带|航餐|汉堡/);
  });
});
