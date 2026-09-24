import { ContentExpansionPlanSchema, type ContentExpansionPlan } from '../schemas/content-expansion.js';
import { UiSkeletonSchema, type UiSkeleton } from '../schemas/ui-skeleton.js';

export function buildContentExpansionPlan(input: { gameId: string; productionLine: string; experienceProfile: string; representativeFlow?: string[] }): ContentExpansionPlan {
  const flow = input.representativeFlow?.length ? input.representativeFlow : ['reset', 'perform the primary verb', 'observe consequence', 'resolve or fail', 'retry with a variant'];
  return ContentExpansionPlanSchema.parse({
    schemaVersion: 1,
    gameId: input.gameId,
    productionLine: input.productionLine,
    experienceProfile: input.experienceProfile,
    representativeFlow: flow,
    variants: [
      { id: 'variant-a', structuralChange: 'intro pacing and first decision are telegraphed earlier', playerDecision: 'choose the safe readable option', difficultyBand: 'intro', acceptanceEvidence: ['first-time player can state the goal'] },
      { id: 'variant-b', structuralChange: 'pressure timing and route/order trade-off change', playerDecision: 'trade immediate safety for a stronger payoff', difficultyBand: 'pressure', acceptanceEvidence: ['second run requires a different decision'] },
    ],
    difficultyRules: ['increase one pressure variable at a time', 'never hide the next goal or make failure unrecoverable'],
    replayHook: 'A second run changes a meaningful route, decision or pacing outcome while preserving the core verb.',
    createdAt: new Date().toISOString(),
  });
}

export function buildUiSkeleton(input: { gameId: string; experienceProfile: string; primaryAction?: string }): UiSkeleton {
  const action = input.primaryAction?.trim() || 'perform the primary game action';
  return UiSkeletonSchema.parse({
    schemaVersion: 1,
    gameId: input.gameId,
    experienceProfile: input.experienceProfile,
    screens: [
      { id: 'gameplay', purpose: 'show the current goal and immediate consequence', primaryAction: action, feedbackElements: ['current goal', 'state/reward feedback', 'safe failure signal'], safeAreaAnchors: ['top status band', 'bottom primary action zone'] },
      { id: 'result', purpose: 'explain success/failure and invite a retry', primaryAction: 'retry or continue', feedbackElements: ['outcome explanation', 'earned reward', 'next goal'], safeAreaAnchors: ['center result card', 'bottom retry zone'] },
    ],
    firstViewportPriority: ['primary action', 'current goal', 'visible state change', 'retry affordance'],
    retryFlow: ['one tap returns to a clean reset', 'retry preserves no hidden state-forcing shortcut'],
    adPolicy: { rewardedOptional: true, neverBlocksCore: true, frequencyCap: 'at most one rewarded placement per short session' },
    accessibility: ['touch targets are at least 44 CSS px', 'critical state is not conveyed by color alone'],
    createdAt: new Date().toISOString(),
  });
}
