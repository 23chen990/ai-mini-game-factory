import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { OpenSourceResearchArtifactSchema } from '../../src/schemas/index.js';

describe('agent orchestration research', () => {
  it('keeps the GitHub reuse decision machine-validated', async () => {
    const raw = JSON.parse(await readFile('docs/research/agent-orchestration-open-source-research.json', 'utf8')) as unknown;
    const artifact = OpenSourceResearchArtifactSchema.parse(raw);
    expect(artifact.conclusion.approvedCandidateNames).toEqual(['OpenAI Agents SDK JS/TS']);
    expect(artifact.candidates).toHaveLength(4);
  });
});
