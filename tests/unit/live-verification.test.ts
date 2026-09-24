import { describe, expect, it } from 'vitest';
import { buildLiveVerification, evaluateLiveVerification } from '../../src/core/live-verification.js';
import { LiveVerificationSchema } from '../../src/schemas/live-verification.js';

const hash = 'a'.repeat(64);

describe('live verification gate', () => {
  it('requires release hash, platform checks and trusted evidence before LIVE_VERIFIED', () => {
    const report = buildLiveVerification({
      gameId: 'g', platform: 'douyin-minigame', releaseHash: hash,
      checks: { startup: true, coreLoop: true, terminalState: true, replay: true, adFallback: true, rewardIdempotency: true, saveRestore: true, telemetry: true },
      evidence: ['device://capture/1', 'platform://submission/1'],
    });
    expect(LiveVerificationSchema.parse(report).status).toBe('LIVE_VERIFIED');
    expect(evaluateLiveVerification(report)).toMatchObject({ passed: true, blockers: [] });
  });

  it('blocks a claimed live verification when a required check is false or evidence is empty', () => {
    const report = buildLiveVerification({
      gameId: 'g', platform: 'wechat-minigame', releaseHash: hash,
      checks: { startup: true, coreLoop: false, terminalState: true, replay: true, adFallback: true, rewardIdempotency: true, saveRestore: true, telemetry: true },
      evidence: [],
    });
    expect(report.status).toBe('BLOCKED');
    expect(evaluateLiveVerification(report).passed).toBe(false);
    expect(evaluateLiveVerification(report).blockers).toEqual(expect.arrayContaining(['core-loop', 'evidence-missing']));
  });
});
