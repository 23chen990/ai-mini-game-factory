import { describe, expect, it } from 'vitest';
import { assetDefinitionIds, deriveAssetDefinitions } from '../../src/core/asset-definitions.js';

describe('asset definitions', () => {
  it('keeps cut-stack ids stable while describing generic runtime roles', () => {
    const blueprint = { template: 'cut-stack-dodge-v1' as const };
    const definitions = deriveAssetDefinitions(blueprint);
    const purposes = definitions.map(([, , purpose]) => purpose).join(' ');

    expect(assetDefinitionIds(blueprint)).toEqual(['blade', 'cuttable', 'support', 'hazard', 'finish', 'background']);
    expect(purposes).toContain('玩家操控');
    expect(purposes).toContain('可被');
    expect(purposes).toContain('安全支点');
    expect(purposes).toContain('危险');
    expect(purposes).toContain('终点');
    expect(purposes).not.toContain('侧视');
    expect(purposes).not.toContain('首关');
    expect(purposes).not.toContain('符刃');
    expect(purposes).not.toContain('雾夜');
  });
});
