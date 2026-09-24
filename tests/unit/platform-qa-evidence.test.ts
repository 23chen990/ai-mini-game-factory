import { describe, expect, it } from 'vitest';
import { PlatformQaSubmissionSchema } from '../../src/schemas/factory-operating.js';

const hash = 'd'.repeat(64);

describe('platform QA evidence', () => {
  it('requires clean device/package evidence for a passed child', () => {
    const submission = PlatformQaSubmissionSchema.parse({ schemaVersion: 1, submittedAt: new Date().toISOString(), results: [{
      platform: 'wechat-minigame', passed: true, evidence: ['device:390x844', 'natural-flow'], artifactHash: hash,
      packagePath: 'platform-builds/wechat-minigame', device: { name: 'simulator', width: 390, height: 844 }, consoleErrors: [], pageErrors: [], performance: { p95FrameMs: 16, memoryMb: 128 },
    }] });
    expect(submission.results[0]?.device?.width).toBe(390);
  });

  it('does not allow a platform to pass with console errors', () => {
    expect(() => PlatformQaSubmissionSchema.parse({ schemaVersion: 1, submittedAt: new Date().toISOString(), results: [{ platform: 'douyin-minigame', passed: true, evidence: ['device'], artifactHash: hash, consoleErrors: ['boom'] }] })).toThrow(/console|error/i);
  });
});
