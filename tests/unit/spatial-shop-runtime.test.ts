import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { WebLiteRuntimeAdapter } from '../../src/adapters/web-lite.js';
import type { GameBlueprint, StyleLock } from '../../src/schemas/index.js';
import { beachSpatialShop } from '../fixtures/spatial-shop.js';

const blueprint: GameBlueprint = {
  schemaVersion: 1,
  gameId: 'beach-shop-template-test',
  title: '海滩渔货铺',
  theme: '原创海滩物流经营',
  runtime: 'web-lite',
  template: 'spatial-shop-v1',
  designMode: 'prototype_tournament',
  spatialShop: beachSpatialShop,
  targetPlatforms: ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'],
  concept: '配置驱动的空间物流经营测试',
  coreLoop: ['采集', '搬运', '补货', '服务', '收益', '扩建'],
  content: { productName: '渔货', customerName: '岛民', currencyName: '贝币' },
  balance: { startingCurrency: 0, orderReward: 2, baseUpgradeCost: 4 },
  preferences: {},
};

const direction = {
  id: 'direction_a' as const,
  name: '海风木刻',
  summary: '原创的清爽海岛经营视觉',
  visualKeywords: ['海风', '木刻'],
  palette: ['#16324F', '#62B6CB', '#F4D35E'],
  characterStyle: '简洁圆润',
  environmentStyle: '竖屏分层沙滩',
  uiStyle: '木牌标签',
  iconConcept: '原创贝壳轮廓',
  forbiddenElements: ['第三方标识'],
  productionComplexity: 'low' as const,
  previewPrompt: '原创竖屏海滩经营界面',
};
const styleLock: StyleLock = { schemaVersion: 1, directionId: direction.id, direction, kept: [], changes: [], notes: [], lockedAt: '2026-08-31T00:00:00.000Z' };

describe('spatial-shop-v1 runtime template', () => {
  it('copies the selected template and writes its validated spatial configuration', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'spatial-shop-runtime-'));
    const workspace = path.join(root, 'game');
    const adapter = new WebLiteRuntimeAdapter(process.cwd());

    await adapter.createProject(workspace, 'spatial-shop-v1');
    await adapter.applyBlueprint(workspace, blueprint, styleLock);

    const config = JSON.parse(await readFile(path.join(workspace, 'src/generated/game-config.json'), 'utf8'));
    const packageJson = JSON.parse(await readFile(path.join(workspace, 'package.json'), 'utf8'));
    expect(config.spatialShop).toEqual(beachSpatialShop);
    expect(config.palette).toEqual(direction.palette);
    expect(packageJson.scripts).toMatchObject({ build: 'vite build', test: 'vitest run', typecheck: 'tsc --noEmit' });
    expect(await readFile(path.join(workspace, 'src/simulation.ts'), 'utf8')).toContain('SpatialShopConfig');

    const verification = await adapter.verifyProject(workspace, { requireScripts: true });
    expect(verification).toEqual(['contract:test-api-7', 'save:versioned', 'test:passed', 'typecheck:passed']);
    const output = await adapter.buildWeb(workspace);
    expect(await readFile(path.join(output, 'index.html'), 'utf8')).toContain('<script>');
  });

  it('keeps the legacy template selectable', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'idle-shop-runtime-'));
    const workspace = path.join(root, 'game');
    const adapter = new WebLiteRuntimeAdapter(process.cwd());
    await expect(adapter.createProject(workspace, 'idle-shop-v1')).resolves.toBeUndefined();
  });
});
