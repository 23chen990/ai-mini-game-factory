import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { SeedSchema } from '../../src/schemas/index.js';

describe('spatial shop example seed', () => {
  it('is a valid factory input with a human mechanic lock and isolated theme configuration', async () => {
    const source = await readFile(path.join(process.cwd(), 'examples/seeds/spatial-beach-shop.yaml'), 'utf8');
    const seed = SeedSchema.parse(parse(source));
    expect(seed.template).toBe('spatial-shop-v1');
    expect(seed.referenceMechanics?.lockedBy).toBe('human');
    expect(seed.spatialShop?.products.map((product) => product.id)).toEqual(['fresh-fish', 'kelp']);
    expect(seed.targetPlatforms).toEqual(['wechat-minigame', 'douyin-minigame', 'taptap-minigame']);
  });
});
