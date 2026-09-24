import { describe, expect, it } from 'vitest';
import { SeedSchema, SpatialShopSpecSchema } from '../../src/schemas/index.js';
import { airportSpatialShop, beachSpatialShop } from '../fixtures/spatial-shop.js';

describe('spatial shop seed contract', () => {
  it('accepts a reusable spatial-shop-v1 configuration', () => {
    const result = SeedSchema.safeParse({
      title: '海滩渔货铺',
      theme: '原创海滩物流经营',
      template: 'spatial-shop-v1',
      designMode: 'prototype_tournament',
      spatialShop: beachSpatialShop,
    });

    expect(result.success).toBe(true);
  });

  it('accepts a second theme without changing the spatial rule shape', () => {
    expect(SpatialShopSpecSchema.safeParse(airportSpatialShop).success).toBe(true);
  });

  it('accepts the reusable Cocos 3D spatial-shop template', () => {
    const result = SeedSchema.safeParse({
      title: '玩具工厂直营店',
      theme: '原创玩具工厂混合 3D 经营',
      runtime: 'cocos-3d',
      template: 'spatial-shop-3d-v1',
      designMode: 'prototype_tournament',
      spatialShop: beachSpatialShop,
    });

    expect(result.success).toBe(true);
  });

  it('defaults existing templates to the web-lite runtime', () => {
    const seed = SeedSchema.parse({
      title: '海滩渔货铺',
      theme: '原创海滩物流经营',
      template: 'spatial-shop-v1',
      designMode: 'prototype_tournament',
      spatialShop: beachSpatialShop,
    });

    expect(seed.runtime).toBe('web-lite');
  });

  it('rejects runtime and template mismatches', () => {
    const cocosWithWebTemplate = SeedSchema.safeParse({
      title: 'x',
      theme: 'x',
      runtime: 'cocos-3d',
      template: 'spatial-shop-v1',
      designMode: 'prototype_tournament',
      spatialShop: beachSpatialShop,
    });
    const webWithCocosTemplate = SeedSchema.safeParse({
      title: 'x',
      theme: 'x',
      runtime: 'web-lite',
      template: 'spatial-shop-3d-v1',
      designMode: 'prototype_tournament',
      spatialShop: beachSpatialShop,
    });

    expect(cocosWithWebTemplate.success).toBe(false);
    expect(webWithCocosTemplate.success).toBe(false);
  });

  it('rejects references to products that do not exist', () => {
    const invalid = structuredClone(beachSpatialShop);
    const producer = invalid.stations.find((station) => station.kind === 'producer');
    if (producer?.kind === 'producer') producer.outputProductId = 'missing-product';
    const result = SpatialShopSpecSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.message.includes('unknown product'))).toBe(true);
  });

  it('requires the spatial configuration only for spatial templates', () => {
    const missing = SeedSchema.safeParse({ title: 'x', theme: 'x', template: 'spatial-shop-v1', designMode: 'prototype_tournament' });
    const missing3d = SeedSchema.safeParse({ title: 'x', theme: 'x', runtime: 'cocos-3d', template: 'spatial-shop-3d-v1', designMode: 'prototype_tournament' });
    const misplaced = SeedSchema.safeParse({ title: 'x', theme: 'x', template: 'idle-shop-v1', designMode: 'prototype_tournament', spatialShop: beachSpatialShop });
    expect(missing.success).toBe(false);
    expect(missing3d.success).toBe(false);
    expect(misplaced.success).toBe(false);
  });
});
