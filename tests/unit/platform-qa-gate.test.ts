import { describe, expect, it } from 'vitest';
import { buildPlatformReleaseMatrix, evaluatePlatformQa } from '../../src/core/factory-operating.js';
import { PlatformQaSubmissionSchema } from '../../src/schemas/factory-operating.js';

const hash = 'b'.repeat(64);

describe('platform QA gate', () => {
  it('marks only the independently evidenced platform child ready', () => {
    const matrix = buildPlatformReleaseMatrix({ gameId: 'game-2', coreHash: hash, primaryPlatform: 'douyin-minigame', targets: ['douyin-minigame', 'wechat-minigame'] });
    const reviewed = evaluatePlatformQa(matrix, [{ platform: 'douyin-minigame', passed: true, evidence: ['device/android.png', 'ad-fallback.json'], artifactHash: hash }]);
    expect(reviewed.matrix.children.find((child) => child.platform === 'douyin-minigame')?.status).toBe('ready');
    expect(reviewed.matrix.children.find((child) => child.platform === 'wechat-minigame')?.status).toBe('blocked');
    expect(reviewed.passed).toBe(false);
    expect(reviewed.blockers).toEqual(['wechat-minigame']);
  });

  it('requires a hash for a passed platform submission', () => {
    expect(() => PlatformQaSubmissionSchema.parse({ schemaVersion: 1, submittedAt: new Date().toISOString(), results: [{ platform: 'douyin-minigame', passed: true, evidence: ['device.png'] }] })).toThrow();
  });

  it('requires a verifiable package path in strict production QA', () => {
    const matrix = buildPlatformReleaseMatrix({ gameId: 'game-3', coreHash: hash, primaryPlatform: 'douyin-minigame', targets: ['douyin-minigame'] });
    const reviewed = evaluatePlatformQa(matrix, [{
      platform: 'douyin-minigame', passed: true, evidence: ['device.png'], artifactHash: hash,
      normalFlowEvidence: ['flow'], visualEvidence: ['visual'], runtimeEvidence: ['runtime'],
    }], { strict: true });
    expect(reviewed.passed).toBe(false);
    expect(reviewed.blockers).toContain('douyin-minigame:platform-qa-package-path-missing');
  });
});
