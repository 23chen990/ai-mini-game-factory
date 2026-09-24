import { describe, expect, it } from 'vitest';
import { ProductionLineResolutionSchema } from '../../src/schemas/production-line-resolution.js';
import { resolveProductionLine } from '../../src/core/production-line-resolution.js';

describe('production line resolution', () => {
  it('uses an explicit mother template as the final line authority', () => {
    const resolution = resolveProductionLine({
      title: 'Choice in the Fog',
      theme: 'A branching story with consequences',
      template: 'cut-stack-dodge-v1',
      runtime: 'web-lite',
    });

    expect(resolution.line).toBe('cut-stack-dodge');
    expect(resolution.templateLine).toBe('cut-stack-dodge');
    expect(resolution.inferredLine).toBe('choice-life');
    expect(resolution.sources).toEqual(['explicit-template']);
    expect(ProductionLineResolutionSchema.parse(resolution)).toEqual(resolution);
  });

  it('produces the same resolution hash for the same inputs', () => {
    const input = {
      title: '符刃夜行',
      theme: '单指点击驱动翻转并避开危险',
      template: 'cut-stack-dodge-v1' as const,
      runtime: 'web-lite' as const,
    };

    const first = resolveProductionLine(input);
    const second = resolveProductionLine(input);

    expect(first.resolutionHash).toBe(second.resolutionHash);
    expect(first.line).toBe('cut-stack-dodge');
    expect(first.profile).toBe('ACTION_FEEL');
  });

  it('blocks a request whose inferred profile is unsupported and has no known template', () => {
    const resolution = resolveProductionLine({
      title: 'Open World Social Hub',
      theme: '多人社交探索',
      template: 'idle-shop-v1',
      runtime: 'web-lite',
    });

    expect(resolution.status).toBe('BLOCKED');
    expect(resolution.line).toBeNull();
    expect(resolution.blockers).toContain('decision-template-support-mismatch');
  });
});
