import { describe, expect, it } from 'vitest';
import {
  buildPlatformSpineContract,
  evaluatePlatformSpine,
} from '../../src/core/platform-spine.js';
import { PlatformSpineContractSchema } from '../../src/schemas/platform-spine.js';

const hash = 'a'.repeat(64);

describe('platform spine contract', () => {
  it('creates isolated adapters for every selected platform and freezes shared invariants', () => {
    const contract = buildPlatformSpineContract({
      gameId: 'lantern-game',
      runtime: 'web-lite',
      targets: ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'],
    });
    expect(PlatformSpineContractSchema.parse(contract).adapters).toHaveLength(3);
    expect(contract.sharedInterfaces.ads.rewardCloseRequiresEnded).toBe(true);
    expect(contract.invariants).toEqual(expect.arrayContaining([
      'rewarded-ad-grant-only-when-isEnded-true',
      'platform-child-hash-must-match-tested-package',
      'no-production-test-ad-units',
    ]));
  });

  it('blocks a spine until each child has independent package evidence', () => {
    const contract = buildPlatformSpineContract({ gameId: 'g', runtime: 'web-lite', targets: ['douyin-minigame'] });
    expect(evaluatePlatformSpine(contract, {})).toMatchObject({ passed: false, blockers: ['douyin-minigame'] });
    const passed = evaluatePlatformSpine(contract, { 'douyin-minigame': { artifactHash: hash, evidence: ['device:390x844', 'package:smoke'] } });
    expect(passed.passed).toBe(true);
  });
});
