import { expect, it } from 'vitest';
import { OpenAIAgentProvider } from '../../src/providers/real.js';
import { ReferenceIntakeEvidenceSchema, ReferenceIntakeDraftSchema } from '../../src/schemas/reference-intake.js';

it('blocks visual intake on the text-only API provider without spending a model call', async () => {
  let calls = 0;
  const provider = new OpenAIAgentProvider({ apiKey: 'test-placeholder', model: 'fixture', runner: { async run() { calls++; throw new Error('Visual source is not available to this text-only transport'); } } });
  const input = ReferenceIntakeEvidenceSchema.parse({ schemaVersion: 1, targetRunId: 'fixture-run', inputHash: 'a'.repeat(64), brief: { schemaVersion: 1, title: 'Fixture', theme: 'Original', source: { name: 'Screenshot', url: 'https://example.com/game' } }, sources: [{ path: 'reference-evidence/verified/frame.png', sha256: 'b'.repeat(64), excerpt: '' }] });
  const result = await provider.draftReference(input);
  expect(ReferenceIntakeDraftSchema.parse(result.value)).toMatchObject({ suggestedTemplate: null, mechanics: null, analysis: { status: 'BLOCKED', unknowns: expect.arrayContaining([expect.stringMatching(/text-only.*pixels/)]) } });
  expect(calls).toBe(0);
});
