import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { SeedSchema } from '../../src/schemas/index.js';

describe('toy factory direct store 3D seed', () => {
  it('locks the first hybrid-3D MVP without changing the 2D beach shop', async () => {
    const source = await readFile('examples/seeds/toy-factory-direct-store-3d.yaml', 'utf8');
    const seed = SeedSchema.parse(parse(source));

    expect(seed).toMatchObject({
      title: '玩具工厂直营店 3D',
      runtime: 'cocos-3d',
      template: 'spatial-shop-3d-v1',
    });
    expect(seed.spatialShop?.products.map(({ id }) => id)).toEqual(['toy-car', 'brick-box']);
    expect(seed.spatialShop?.stations.filter(({ kind }) => kind === 'producer')).toHaveLength(2);
    expect(seed.spatialShop?.stations.filter(({ kind }) => kind === 'shelf')).toHaveLength(2);
    expect(seed.spatialShop?.stations.filter(({ kind }) => kind === 'checkout')).toHaveLength(1);
    expect(seed.spatialShop?.flowEvents).toContainEqual(expect.objectContaining({ id: 'after-school-rush', kind: 'demand-rush' }));
    expect(seed.preferences.session_minutes).toBe(3);
  });
});
