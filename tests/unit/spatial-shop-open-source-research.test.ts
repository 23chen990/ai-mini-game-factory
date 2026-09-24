import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { OpenSourceResearchSchema } from '../../src/schemas/index.js';

describe('spatial shop open-source research artifact', () => {
  it('is machine-valid and permits reuse only for explicitly approved infrastructure', async () => {
    const artifactPath = path.join(process.cwd(), 'docs/research/spatial-shop-v1-open-source-research.json');
    const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
    const research = OpenSourceResearchSchema.parse(artifact);
    expect(research.outcome).toBe('REUSE_APPROVED');
    expect(research.selectedCandidateIds).toEqual(['phaser-3.90.0']);
    expect(research.candidates.filter((candidate) => candidate.decision === 'REUSE').map((candidate) => candidate.id)).toEqual(research.selectedCandidateIds);
    expect(research.candidates.every((candidate) => /^[0-9a-f]{40}$/.test(candidate.revision))).toBe(true);
  });
});
