import { describe, expect, it } from 'vitest';
import { buildReleaseIntegrity } from '../../src/core/release-integrity.js';

describe('release integrity', () => {
  it('derives stable platform and acceptance hashes from tested artifacts', () => {
    const first = buildReleaseIntegrity({
      coreHash: 'a'.repeat(64),
      platformChildren: [{ platform: 'wechat-minigame', status: 'ready', artifactHash: 'b'.repeat(64) }],
      acceptance: { schemaVersion: 1, gates: [], implementationReady: true, candidateReady: true, releaseReady: true, blockers: [] },
    });
    const second = buildReleaseIntegrity({
      coreHash: 'a'.repeat(64),
      platformChildren: [{ platform: 'wechat-minigame', status: 'ready', artifactHash: 'b'.repeat(64) }],
      acceptance: { schemaVersion: 1, gates: [], implementationReady: true, candidateReady: true, releaseReady: true, blockers: [] },
    });
    expect(first).toEqual(second);
    expect(first.platformHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.acceptanceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps the integrity calculation deterministic when optional acceptance evidence is absent', () => {
    const result = buildReleaseIntegrity({
      coreHash: 'a'.repeat(64),
      platformChildren: [],
      acceptance: undefined,
    });
    expect(result.acceptanceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.platformHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
