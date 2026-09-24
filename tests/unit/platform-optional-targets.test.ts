import { describe, expect, it } from 'vitest';
import { buildPlatformReleaseMatrix, evaluatePlatformQa, evaluatePlatformReleaseMatrix } from '../../src/core/factory-operating.js';
import { buildPlatformPackageSet, evaluatePlatformPackageSet } from '../../src/core/platform-packaging.js';

const hash = 'a'.repeat(64);

describe('optional platform targets', () => {
  it('does not block a strict release when an optional child is only planned', () => {
    const matrix = buildPlatformReleaseMatrix({
      gameId: 'optional-child', coreHash: hash, primaryPlatform: 'wechat-minigame',
      requiredTargets: ['wechat-minigame'], optionalTargets: ['poki-web'],
    });
    const ready = evaluatePlatformQa(matrix, [{
      platform: 'wechat-minigame', passed: true, evidence: ['device smoke'], artifactHash: hash,
      packagePath: 'platform-builds/wechat-minigame', normalFlowEvidence: ['flow'], visualEvidence: ['shot'], runtimeEvidence: ['runtime'],
    }], { strict: true });
    expect(ready.passed).toBe(true);
    expect(ready.matrix.children.find((child) => child.platform === 'poki-web')?.required).toBe(false);
  });

  it('keeps legacy targets-only calls backwards compatible as required', () => {
    const matrix = buildPlatformReleaseMatrix({ gameId: 'legacy', coreHash: hash, primaryPlatform: 'wechat-minigame', targets: ['wechat-minigame', 'poki-web'] });
    expect(evaluatePlatformReleaseMatrix(matrix).blockers).toEqual(expect.arrayContaining(['wechat-minigame', 'poki-web']));
    const packages = buildPlatformPackageSet({ gameId: 'legacy', coreHash: hash, targets: ['wechat-minigame', 'poki-web'] });
    expect(packages.requiredPlatforms).toEqual(['wechat-minigame', 'poki-web']);
    expect(evaluatePlatformPackageSet(packages).passed).toBe(false);
  });

  it('requires every explicitly selected optional child once it is promoted to required', () => {
    const matrix = buildPlatformReleaseMatrix({ gameId: 'selected', coreHash: hash, primaryPlatform: 'wechat-minigame', requiredTargets: ['wechat-minigame', 'poki-web'], optionalTargets: [] });
    expect(evaluatePlatformReleaseMatrix(matrix).passed).toBe(false);
    const packages = buildPlatformPackageSet({ gameId: 'selected', coreHash: hash, requiredTargets: ['wechat-minigame', 'poki-web'], optionalTargets: [] });
    expect(packages.requiredPlatforms).toEqual(['wechat-minigame', 'poki-web']);
  });
});
