import { IaaContractSchema, IaaMonetizationReviewSchema, type IaaContract, type IaaMonetizationReview } from '../schemas/index.js';

export function evaluateIaaContract(value: IaaContract) {
  const contract = IaaContractSchema.parse(value);
  const blockers: string[] = [];
  if (contract.placements.some((placement) => placement.frequencyCapSeconds <= 0 || placement.frequencyCapSeconds < contract.delivery.minSecondsBetweenAds)) blockers.push('frequency-cap-too-low');
  if (contract.placements.some((placement) => /every|each|每(?:次|个)|click|tap/iu.test(placement.trigger) && placement.format !== 'banner')) blockers.push('unbounded-interruption');
  if (contract.placements.some((placement) => placement.format === 'interstitial' && placement.optional === false && placement.playerValue.toLowerCase() === 'none')) blockers.push('non-optional-interstitial');
  if (contract.delivery.maxAdsPerSession > 10) blockers.push('session-ad-cap-too-high');
  if (!contract.analyticsEvents.some((event) => /show|impression/iu.test(event)) || !contract.analyticsEvents.some((event) => /complete|reward/iu.test(event))) blockers.push('ad-analytics-incomplete');
  // These checks are deliberately independent from the model's placement
  // rationale.  A placement can look player-friendly while the runtime still
  // grants twice, shows before consent, or ships test ad units.
  if (!contract.safety.consent) blockers.push('consent-missing');
  if (!contract.safety.ageGate) blockers.push('age-gate-missing');
  if (!contract.safety.testUnitsExcluded) blockers.push('test-ad-units-not-excluded');
  if (!contract.safety.rewardGrantTerminalOnly) blockers.push('reward-not-terminal-only');
  if (!contract.safety.rewardIdempotent) blockers.push('reward-not-idempotent');
  if (contract.placements.some((placement) => placement.format === 'rewarded') && contract.safety.forbiddenContexts.length === 0) blockers.push('forbidden-ad-contexts-missing');
  return { passed: blockers.length === 0 && contract.status === 'PASS', blockers };
}

export function buildIaaContract(input: { gameId: string; review: IaaMonetizationReview; sourceReview?: string }): IaaContract {
  const review = IaaMonetizationReviewSchema.parse(input.review);
  const placements = review.placements.map((placement, index) => ({
    id: `placement-${index + 1}`,
    format: placement.format,
    trigger: placement.trigger,
    playerValue: placement.playerValue,
    frequencyCapSeconds: Math.max(60, review.deliveryRules?.minMinutesBetweenAds ? review.deliveryRules.minMinutesBetweenAds * 60 : 180),
    maxPerSession: Math.max(1, review.deliveryRules?.maxAdsPerSession ?? 1),
    optional: placement.format === 'rewarded' || /optional|可选/iu.test(placement.trigger),
  }));
  const raw = {
    schemaVersion: 1 as const,
    gameId: input.gameId,
    monetization: 'IAA' as const,
    placements,
    delivery: {
      firstRun: 'ENDING_ONLY' as const,
      minSecondsBetweenAds: Math.max(60, review.deliveryRules?.minMinutesBetweenAds ? review.deliveryRules.minMinutesBetweenAds * 60 : 180),
      maxAdsPerSession: Math.max(1, review.deliveryRules?.maxAdsPerSession ?? 1),
      rewardRequiredForRewarded: true as const,
      noFill: 'continue-without-ad' as const,
      closeBehavior: 'after-reward' as const,
      backgroundBehavior: 'pause-and-resume' as const,
    },
    analyticsEvents: ['ad_show', 'ad_complete', 'ad_no_fill'],
    safety: {
      consent: true,
      ageGate: true,
      testUnitsExcluded: true,
      rewardGrantTerminalOnly: true,
      rewardIdempotent: true,
      forbiddenContexts: ['first-run', 'mid-action', 'before-terminal-state'],
    },
    status: 'PASS' as const,
    blockers: [] as string[],
    sourceReview: input.sourceReview ?? 'artifacts/iaa-monetization-review.json',
    createdAt: new Date().toISOString(),
  };
  const parsed = IaaContractSchema.parse(raw);
  const evaluated = evaluateIaaContract(parsed);
  return IaaContractSchema.parse({ ...parsed, status: evaluated.passed ? 'PASS' : 'BLOCKED', blockers: evaluated.blockers });
}
