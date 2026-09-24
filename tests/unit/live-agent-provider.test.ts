import { describe, expect, it } from 'vitest';
import { OpenAIAgentProvider, ProviderOutputError, parseAgentPayload, type StructuredAgentRunner } from '../../src/providers/real.js';
import { TARGET_MINIGAME_PLATFORMS } from '../../src/schemas/index.js';

const seed = { title: '妖怪夜市', theme: '夜市妖怪', runtime: 'web-lite' as const, template: 'idle-shop-v1' as const, designMode: 'prototype_tournament' as const, targetPlatforms: [...TARGET_MINIGAME_PLATFORMS], preferences: { tone: 'cozy' } };
const blueprint = {
  schemaVersion: 1 as const,
  gameId: 'yokai-night-market',
  title: '妖怪夜市',
  theme: '夜市妖怪',
  runtime: 'web-lite' as const,
  template: 'idle-shop-v1' as const,
  designMode: 'prototype_tournament' as const,
  targetPlatforms: [...TARGET_MINIGAME_PLATFORMS],
  concept: '为夜行客制作月光团子',
  coreLoop: ['顾客出现', '制作团子', '交付订单', '获得灯币', '升级摊位'],
  content: { productName: '月光团子', customerName: '夜行客', currencyName: '灯币' },
  balance: { startingCurrency: 0, orderReward: 5, baseUpgradeCost: 10 },
  preferences: { tone: 'cozy' },
};
const direction = (id: 'direction_a' | 'direction_b' | 'direction_c' | 'direction_d') => ({
  id, name: id, summary: `${id} is visibly distinct`, visualKeywords: [id, 'original'], palette: ['#112233', '#DDEEFF'],
  characterStyle: `${id} character silhouette`, environmentStyle: `${id} scene construction`, uiStyle: `${id} UI geometry`, iconConcept: `${id} icon`,
  forbiddenElements: ['known characters', 'logos'], productionComplexity: 'low' as const, previewPrompt: `${id} original preview, no text`,
});

class FakeRunner implements StructuredAgentRunner {
  readonly inputs: Array<{ name: string; instructions: string; input: unknown }> = [];
  constructor(private readonly outputs: unknown[]) {}
  async run(request: { name: string; instructions: string; input: unknown }) {
    this.inputs.push(request);
    const output = this.outputs.shift();
    return { output, rawResponse: output, usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } };
  }
}

describe('OpenAIAgentProvider', () => {
  it('parses the fixed structured-output envelope payload as JSON', () => {
    expect(parseAgentPayload('{"schemaVersion":1}')).toEqual({ schemaVersion: 1 });
    expect(parseAgentPayload('not-json')).toBe('not-json');
  });

  it('returns a Zod-validated Producer structured artifact and usage', async () => {
    const runner = new FakeRunner([blueprint]);
    const provider = new OpenAIAgentProvider({ runner, apiKey: 'test-key', model: 'test-model', timeoutMs: 100 });

    const result = await provider.generateBlueprint(seed);

    expect(result.value).toEqual(blueprint);
    expect(result.metrics).toMatchObject({ calls: 1, model: 'test-model', usage: { totalTokens: 30 } });
    expect(runner.inputs[0]?.instructions).toMatch(/reference_reskin.*maximum(?:-| )fidelity core-mechanic reproduction/i);
    expect(runner.inputs[0]?.instructions).toMatch(/input-to-state transitions.*core-loop order.*progression topology.*unlock dependencies.*failure and recovery rules.*feedback timing bands/i);
  });

  it('uses the routed model and bounded context packet for a stage call', async () => {
    const runner = new FakeRunner([blueprint]);
    const provider = new OpenAIAgentProvider({ runner, apiKey: 'test-key', model: 'default-model', timeoutMs: 100 });
    await provider.generateBlueprint(seed, { runRoot: '/tmp/run', outputPath: '/tmp/out.json', logDir: '/tmp/logs', inputPaths: ['artifacts/seed.yaml'], stage: 'BLUEPRINT', model: 'routed-model', reasoning: 'max', sandbox: 'read-only', contextPacket: { schemaVersion: 1, stage: 'BLUEPRINT', summary: 'locked inputs', inputs: [], omitted: [], totalChars: 13 } });
    expect(runner.inputs[0]).toMatchObject({ model: 'routed-model' });
    expect(runner.inputs[0]?.input).toMatchObject({ seed: expect.anything() });
    expect(runner.inputs[0]?.input).toMatchObject({ contextPacket: { stage: 'BLUEPRINT' }, execution: { sandbox: 'read-only' } });
  });

  it('repairs one invalid response with exactly one additional model call', async () => {
    const runner = new FakeRunner([{ schemaVersion: 1 }, blueprint]);
    const provider = new OpenAIAgentProvider({ runner, apiKey: 'test-key', model: 'test-model', timeoutMs: 100 });

    const result = await provider.generateBlueprint(seed);

    expect(result.value).toEqual(blueprint);
    expect(result.metrics.calls).toBe(2);
    expect(runner.inputs[1]?.input).toMatchObject({ repair: true });
  });

  it('stops after the second invalid response and preserves raw responses', async () => {
    const runner = new FakeRunner([{ broken: 1 }, { stillBroken: 2 }]);
    const provider = new OpenAIAgentProvider({ runner, apiKey: 'test-key', model: 'test-model', timeoutMs: 100 });

    const error = await provider.generateBlueprint(seed).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ProviderOutputError);
    if (!(error instanceof ProviderOutputError)) throw new Error('Expected ProviderOutputError');
    expect(error.metrics.calls).toBe(2);
    expect(error.rawResponses).toEqual([{ broken: 1 }, { stillBroken: 2 }]);
    expect(runner.inputs).toHaveLength(2);
  });

  it('requires ArtDirector to return exactly four directions', async () => {
    const runner = new FakeRunner([{ directions: [direction('direction_a'), direction('direction_b'), direction('direction_c')] }, { directions: [direction('direction_a'), direction('direction_b'), direction('direction_c'), direction('direction_d')] }]);
    const provider = new OpenAIAgentProvider({ runner, apiKey: 'test-key', model: 'test-model', timeoutMs: 100 });

    const result = await provider.generateArtDirections(blueprint);

    expect((result.value as { directions: unknown[] }).directions).toHaveLength(4);
    expect(result.metrics.calls).toBe(2);
  });

  it('fails immediately with a clear error when live-art has no API key', () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      expect(() => new OpenAIAgentProvider({ model: 'test-model' })).toThrow('live-art mode requires OPENAI_API_KEY');
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    }
  });

  it('repairs a style lock that does not preserve the human selection', async () => {
    const allDirections = { directions: [direction('direction_a'), direction('direction_b'), direction('direction_c'), direction('direction_d')] };
    const wrong = { schemaVersion: 1, directionId: 'direction_a', direction: allDirections.directions[0], kept: [], changes: [], notes: [], lockedAt: new Date().toISOString() };
    const correct = { schemaVersion: 1, directionId: 'direction_b', direction: allDirections.directions[1], kept: ['palette'], changes: ['less saturation'], notes: ['keep mature'], lockedAt: new Date().toISOString() };
    const runner = new FakeRunner([wrong, correct]);
    const provider = new OpenAIAgentProvider({ runner, apiKey: 'test-key', model: 'test-model', timeoutMs: 100 });

    const result = await provider.generateStyleLock(blueprint, allDirections, { selected_direction: 'direction_b', keep: ['palette'], change: ['less saturation'], notes: ['keep mature'] });

    expect(result.value).toEqual(correct);
    expect(result.metrics.calls).toBe(2);
  });
});
