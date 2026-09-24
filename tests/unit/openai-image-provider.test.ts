import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { OpenAIImageProvider, type ImageGenerationClient } from '../../src/providers/real.js';
import type { ArtDirections } from '../../src/schemas/index.js';

function directions(count = 4): ArtDirections {
  return {
    directions: Array.from({ length: count }, (_, index) => ({
      id: `direction_${String.fromCharCode(97 + index)}` as 'direction_a',
      name: `Direction ${index + 1}`,
      summary: `Distinct direction ${index + 1}`,
      visualKeywords: ['original', `shape-${index + 1}`],
      palette: ['#112233', '#DDEEFF'],
      characterStyle: `character style ${index + 1}`,
      environmentStyle: `environment style ${index + 1}`,
      uiStyle: `ui style ${index + 1}`,
      iconConcept: `icon concept ${index + 1}`,
      forbiddenElements: ['known characters', 'logos'],
      productionComplexity: 'low',
      previewPrompt: `Original preview ${index + 1}`,
    })),
  };
}

class FakeImageClient implements ImageGenerationClient {
  calls = 0;
  constructor(private readonly failures = 0) {}
  async generate() {
    this.calls += 1;
    if (this.calls <= this.failures) throw new Error('temporary image failure');
    return {
      data: [{ b64_json: Buffer.from(`png-${this.calls}`).toString('base64') }],
      usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
    };
  }
}

class SecretFailingImageClient implements ImageGenerationClient {
  async generate(): Promise<never> { throw new Error('request failed with sk-test-secret-1234567890'); }
}

describe('OpenAIImageProvider', () => {
  it('writes four stable preview files and complete metadata', async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'factory-images-'));
    const client = new FakeImageClient();
    const provider = new OpenAIImageProvider({ client, apiKey: 'test-key', model: 'test-image', size: '1024x1024', quality: 'low', timeoutMs: 100 });

    const manifest = await provider.producePreviews({ outputDir, directions: directions() });

    expect(manifest.previews).toHaveLength(4);
    expect(manifest.callCount).toBe(4);
    expect(manifest.previews[0]).toMatchObject({
      directionId: 'direction_a', provider: 'openai', model: 'test-image', size: '1024x1024', quality: 'low',
      outputPath: 'previews/direction_a.png', attempts: 1, status: 'generated', error: null,
    });
    expect(await readFile(path.join(outputDir, 'direction_a.png'), 'utf8')).toBe('png-1');
  });

  it('retries one failed image once and then succeeds', async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'factory-images-'));
    const client = new FakeImageClient(1);
    const provider = new OpenAIImageProvider({ client, apiKey: 'test-key', model: 'test-image', size: '1024x1024', quality: 'low', timeoutMs: 100 });

    const manifest = await provider.producePreviews({ outputDir, directions: directions(1) });

    expect(manifest.previews[0]).toMatchObject({ attempts: 2, status: 'generated', error: null });
    expect(client.calls).toBe(2);
  });

  it('records failure after one retry without creating a mock preview', async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'factory-images-'));
    const client = new FakeImageClient(2);
    const provider = new OpenAIImageProvider({ client, apiKey: 'test-key', model: 'test-image', size: '1024x1024', quality: 'low', timeoutMs: 100 });

    const manifest = await provider.producePreviews({ outputDir, directions: directions(1) });

    expect(manifest.previews[0]).toMatchObject({ attempts: 2, status: 'failed', outputPath: 'previews/direction_a.png' });
    await expect(readFile(path.join(outputDir, 'direction_a.png'))).rejects.toThrow();
  });

  it('rejects more than four previews before making a paid call', async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'factory-images-'));
    const client = new FakeImageClient();
    const provider = new OpenAIImageProvider({ client, apiKey: 'test-key', model: 'test-image', size: '1024x1024', quality: 'low', timeoutMs: 100 });

    await expect(provider.producePreviews({ outputDir, directions: directions(5) as ArtDirections })).rejects.toThrow(/maximum.*4/i);
    expect(client.calls).toBe(0);
  });

  it('redacts API-key-shaped values from preview error metadata', async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'factory-images-'));
    const provider = new OpenAIImageProvider({ client: new SecretFailingImageClient(), apiKey: 'test-key', model: 'test-image', size: '1024x1024', quality: 'low', timeoutMs: 100 });

    const manifest = await provider.producePreviews({ outputDir, directions: directions(1) });

    expect(manifest.previews[0]?.error).toContain('[REDACTED]');
    expect(manifest.previews[0]?.error).not.toContain('sk-test-secret-1234567890');
  });
});
