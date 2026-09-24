import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { createArtReview } from '../../src/core/art-review.js';
import type { ArtDirections, ArtPreviewManifest, GameBlueprint } from '../../src/schemas/index.js';

it('renders a machine-visible failed status without a fake image', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'art-review-'));
  const blueprint = { schemaVersion: 1, gameId: 'test', title: 'Test', theme: 'spirits', runtime: 'web-lite', template: 'idle-shop-v1', concept: 'test concept', coreLoop: ['a', 'b', 'c', 'd'], content: { productName: 'tea', customerName: 'spirit', currencyName: 'coin' }, balance: { startingCurrency: 0, orderReward: 1, baseUpgradeCost: 2 }, preferences: {} } as GameBlueprint;
  const base = { summary: 'distinct', visualKeywords: ['original'], palette: ['#112233'], characterStyle: 'character', environmentStyle: 'environment', uiStyle: 'ui', iconConcept: 'icon', forbiddenElements: ['logos'], productionComplexity: 'low' as const, previewPrompt: 'original preview' };
  const directions = { directions: (['a', 'b', 'c', 'd'] as const).map((suffix) => ({ ...base, id: `direction_${suffix}` as const, name: `Direction ${suffix}` })) } satisfies ArtDirections;
  const now = new Date().toISOString();
  const manifest = { schemaVersion: 1, provider: 'openai', callCount: 5, previews: directions.directions.map((direction, index) => ({ directionId: direction.id, provider: 'openai', model: 'image-model', prompt: direction.previewPrompt, size: '1024x1024', quality: 'low', outputPath: `previews/${direction.id}.png`, startedAt: now, finishedAt: now, attempts: index === 0 ? 2 as const : 1 as const, status: index === 0 ? 'failed' as const : 'generated' as const, error: index === 0 ? 'request failed' : null })) } satisfies ArtPreviewManifest;

  await createArtReview(root, blueprint, directions, manifest);
  const html = await readFile(path.join(root, 'art-review/index.html'), 'utf8');

  expect(html).toContain('data-direction="direction_a" data-status="failed"');
  expect(html).not.toContain('<img src="previews/direction_a.png"');
});
