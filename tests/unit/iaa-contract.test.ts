import { describe, expect, it } from 'vitest';
import { buildIaaContract, evaluateIaaContract } from '../../src/core/iaa-contract.js';
import { IaaContractSchema } from '../../src/schemas/iaa-contract.js';

describe('IAA contract', () => {
  it('derives a bounded, player-respectful contract from the review', () => {
    const contract = buildIaaContract({
      gameId: 'demo-game',
      review: {
        schemaVersion: 1,
        audienceFit: 'casual',
        sessionFit: 'medium',
        placements: [{ format: 'rewarded', trigger: 'optional boost', playerValue: 'shorter wait', frequencyCap: 'once per session' }],
        retentionRisk: 'low',
        revenuePotential: 'medium',
        complianceRisks: ['consent'],
        recommendation: 'test_cautiously',
        rationale: 'bounded',
      },
    });
    expect(contract.status).toBe('PASS');
    expect(contract.placements[0]?.format).toBe('rewarded');
    expect(evaluateIaaContract(contract).passed).toBe(true);
  });

  it('blocks an interruptive or unbounded placement', () => {
    const result = evaluateIaaContract(IaaContractSchema.parse({
      schemaVersion: 1,
      gameId: 'unsafe',
      monetization: 'IAA',
      placements: [{ id: 'p1', format: 'interstitial', trigger: 'every click', playerValue: 'none', frequencyCapSeconds: 0, maxPerSession: 99, optional: false }],
      delivery: { firstRun: 'ENDING_ONLY', minSecondsBetweenAds: 0, maxAdsPerSession: 99, rewardRequiredForRewarded: true, noFill: 'continue-without-ad', closeBehavior: 'immediate', backgroundBehavior: 'pause-and-resume' },
      analyticsEvents: ['ad_show', 'ad_complete', 'ad_no_fill'],
      status: 'BLOCKED',
      blockers: ['seeded unsafe fixture'],
      sourceReview: 'review',
      createdAt: new Date().toISOString(),
    }));
    expect(result.passed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining(['frequency-cap-too-low', 'unbounded-interruption']));
  });
});
