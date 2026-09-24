import { describe, expect, it } from 'vitest';
import { buildPlatformPolicyTemplate, evaluatePlatformPolicy, platformPolicyHash } from '../../src/core/platform-policy.js';
import { PlatformPolicySnapshotSchema } from '../../src/schemas/platform-policy.js';

describe('platform policy snapshot', () => {
  it('creates an explicit human-verification template for required and optional targets', () => {
    const template = buildPlatformPolicyTemplate({
      targets: ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'],
      optionalTargets: ['poki-web'],
    });
    expect(template.entries).toHaveLength(4);
    expect(template.entries.every((entry) => entry.status === 'UNVERIFIED')).toBe(true);
    expect(template.entries[0]?.sourceRefs).toContain('human:verify-current-official-platform-rules');
    expect(PlatformPolicySnapshotSchema.parse(template)).toEqual(template);
  });

  it('blocks production use until every required platform has current human evidence', () => {
    const template = buildPlatformPolicyTemplate({ targets: ['wechat-minigame', 'douyin-minigame'], optionalTargets: [] });
    const initial = evaluatePlatformPolicy(template, { requiredPlatforms: ['wechat-minigame', 'douyin-minigame'], requireVerified: true });
    expect(initial.passed).toBe(false);
    expect(initial.blockers).toEqual(expect.arrayContaining(['wechat-minigame:policy-unverified', 'douyin-minigame:policy-unverified']));

    const verified = {
      ...template,
      entries: template.entries.map((entry) => ({
        ...entry,
        status: 'VERIFIED' as const,
        policyVersion: '2026-09-official-rules',
        sourceRefs: ['https://developers.example.test/platform-rules'],
        verifiedAt: new Date().toISOString(),
        verifiedBy: 'human:operator',
        assumptions: ['current rules were checked before this run'],
      })),
    };
    const result = evaluatePlatformPolicy(verified, { requiredPlatforms: ['wechat-minigame', 'douyin-minigame'], requireVerified: true });
    expect(result.passed).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(platformPolicyHash(verified)).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('does not let an optional target block domestic release, but reports its warning', () => {
    const template = buildPlatformPolicyTemplate({ targets: ['wechat-minigame'], optionalTargets: ['poki-web'] });
    const result = evaluatePlatformPolicy(template, { requiredPlatforms: ['wechat-minigame'], optionalPlatforms: ['poki-web'], requireVerified: true });
    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('wechat-minigame:policy-unverified');
    expect(result.warnings).toContain('poki-web:policy-unverified');
  });

  it('rejects a verified entry that still contains the placeholder source', () => {
    const template = buildPlatformPolicyTemplate({ targets: ['wechat-minigame'], optionalTargets: [] });
    const verified = {
      ...template,
      entries: [{ ...template.entries[0]!, status: 'VERIFIED' as const, policyVersion: '2026-09', verifiedAt: new Date().toISOString(), verifiedBy: 'human:operator' }],
    };
    const result = evaluatePlatformPolicy(verified, { requiredPlatforms: ['wechat-minigame'], requireVerified: true });
    expect(result.passed).toBe(false);
    expect(result.blockers).toContain('wechat-minigame:direct-source-required');
  });
});
