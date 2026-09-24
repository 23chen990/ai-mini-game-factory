import type { RequestType, StageName } from '../schemas/index.js';

export type FeedbackRepairRoute = 'direct-builder' | 'formal-fixer';

export interface FeedbackRouteInput {
  requestType: RequestType;
  issueCount?: number;
  affectedSystems?: readonly string[];
  rootCauseClear?: boolean;
  validatedQaIssue?: boolean;
  failedRepairAttempts?: number;
}

export interface FeedbackRouteDecision {
  route: FeedbackRepairRoute;
  stages: StageName[];
  reasons: string[];
  omittedContext: string[];
}

const FORMAL_SYSTEMS = new Set(['core-loop', 'state-machine', 'economy', 'save', 'platform', 'artifact', 'build', 'release', 'advertising', 'collision', 'level-design']);

/** Centralized escalation policy for reported experience defects. A localized
 * defect may use the direct builder route; any cross-system, repeated, unclear,
 * or QA-validated issue is forced through an independent QA → FIX → QA loop. */
export function decideFeedbackRepairRoute(input: FeedbackRouteInput): FeedbackRouteDecision {
  const systems = new Set(input.affectedSystems ?? []);
  const reasons: string[] = [];
  if ((input.issueCount ?? 1) > 1) reasons.push('multiple-related-symptoms');
  if ([...systems].some((system) => FORMAL_SYSTEMS.has(system))) reasons.push('core-or-cross-module-impact');
  if (input.rootCauseClear === false) reasons.push('unclear-root-cause');
  if (input.validatedQaIssue) reasons.push('validated-qa-issue');
  if ((input.failedRepairAttempts ?? 0) > 0) reasons.push('repair-attempt-already-failed');
  const formal = reasons.length > 0;
  return {
    route: formal ? 'formal-fixer' : 'direct-builder',
    stages: formal ? ['QA', 'FIX', 'QA'] : ['FULL_BUILD', 'QA'],
    reasons: reasons.length ? reasons : ['localized-change-at-most-two-causal-files'],
    omittedContext: ['unrelated conversation history', 'unrelated screenshots', 'unrelated logs', 'repository history'],
  };
}
