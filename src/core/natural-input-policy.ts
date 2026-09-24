import { NaturalFlowEvidenceSchema, type NaturalFlowEvidence } from '../schemas/natural-flow.js';
import { NaturalInputPolicySchema, type NaturalInputPolicy } from '../schemas/natural-input-policy.js';
import { getProductionLineContract, type ProductionLine } from './production-lines.js';

const lineProfiles: Record<ProductionLine, NaturalInputPolicy['profile']> = {
  'single-finger-action': 'ACTION_FEEL',
  'cut-stack-dodge': 'ACTION_FEEL',
  'idle-management': 'STRATEGIC_SYSTEM',
  'choice-life': 'NARRATIVE_AGENCY',
  'rule-puzzle': 'PUZZLE_CLARITY',
};

const forbiddenOperations = [
  'resetGame', 'setRandomSeed', 'spawnCustomer', 'completeOrder', 'grantCurrency',
  'upgradeStation', 'setState', 'loadScenario', 'teleport', 'setPlayerPosition',
  'advanceTime', 'advanceTicks', 'act', 'direct-state-mutation',
];

const lineRequirements: Record<ProductionLine, { minimumActions: number; requiredTransitions: string[]; acceptedCompletions: NaturalInputPolicy['acceptedCompletions'] }> = {
  'single-finger-action': { minimumActions: 4, requiredTransitions: ['primary-action', 'failure', 'retry'], acceptedCompletions: ['terminal', 'settlement'] },
  'cut-stack-dodge': { minimumActions: 5, requiredTransitions: ['cut', 'drop', 'obstacle', 'retry'], acceptedCompletions: ['terminal', 'settlement'] },
  'idle-management': { minimumActions: 5, requiredTransitions: ['produce', 'deliver', 'upgrade', 'refresh'], acceptedCompletions: ['settlement', 'terminal'] },
  'choice-life': { minimumActions: 5, requiredTransitions: ['choice', 'consequence', 'delayed', 'replay'], acceptedCompletions: ['terminal', 'settlement'] },
  'rule-puzzle': { minimumActions: 5, requiredTransitions: ['rule', 'wrong', 'hint', 'solve', 'reset'], acceptedCompletions: ['terminal', 'settlement'] },
};

/** Build the immutable minimum natural-play contract for a production line. */
export function buildNaturalInputPolicy(lineValue: ProductionLine): NaturalInputPolicy {
  const line = lineValue;
  const contract = getProductionLineContract(line);
  const requirements = lineRequirements[line];
  return NaturalInputPolicySchema.parse({
    schemaVersion: 1,
    line,
    profile: lineProfiles[line] ?? contract.primaryProfile,
    minimumActions: requirements.minimumActions,
    requiredTransitions: requirements.requiredTransitions,
    acceptedCompletions: requirements.acceptedCompletions,
    requireReplay: true,
    minimumScreenshots: 2,
    forbiddenOperations: [...forbiddenOperations],
  });
}

function normalized(value: string): string {
  return value.toLowerCase().replaceAll(/[_\-:/.]+/gu, ' ');
}

function hasToken(value: string, token: string): boolean {
  const text = normalized(value);
  const target = normalized(token);
  if (text.includes(target)) return true;
  const aliases: Record<string, string[]> = {
    'primary action': ['primary', 'tap', 'hold', 'release', 'move', 'action'],
    cut: ['cut', 'slice', 'swipe', 'drag'],
    drop: ['drop', 'settle', 'trajectory', 'fall'],
    obstacle: ['obstacle', 'hazard', 'dodge', 'collision'],
    retry: ['retry', 'restart', 'reopen', '重开'],
    produce: ['produce', 'production', '制作', '生产'],
    deliver: ['deliver', 'delivery', 'settlement', '交付', '结算'],
    upgrade: ['upgrade', 'growth', '升级'],
    // A browser reload is a legitimate player-visible recovery action in the
    // idle line. Keep it in the alias set so the policy does not require a
    // synthetic transition name just because the runner uses Playwright's
    // page.reload primitive.
    refresh: ['refresh', 'reload', 'recover', 'recovery', 'restore', '刷新', '恢复'],
    choice: ['choice', 'select', 'decision', '选择'],
    consequence: ['consequence', 'result', 'impact', '后果'],
    delayed: ['delayed', 'echo', 'later', '延迟', '回响'],
    replay: ['replay', 'alternate', 'again', '重玩'],
    rule: ['rule', 'discover', '规则'],
    wrong: ['wrong', 'error', 'illegal', '错误'],
    hint: ['hint', 'clue', '提示'],
    solve: ['solve', 'success', 'solution', '解题', '解决'],
    reset: ['reset', 'restart', '重置', '重开'],
    failure: ['failure', 'failed', 'lose', 'death', '失败'],
  };
  return (aliases[target] ?? []).some((alias) => text.includes(normalized(alias)));
}

export type NaturalInputPolicyEvaluation = {
  passed: boolean;
  blockers: string[];
  evidence: NaturalFlowEvidence;
  policy: NaturalInputPolicy;
};

/**
 * Apply a line-specific policy to a trusted natural trace.  This evaluator is
 * intentionally independent of the browser runner: a different runner can
 * produce the same schema, while the release gate still enforces the same
 * experience contract.
 */
export function evaluateNaturalFlowAgainstPolicy(
  evidenceValue: unknown,
  policyValue: unknown,
  options: { expectedBuildHash?: string; expectedRuntime?: string } = {},
): NaturalInputPolicyEvaluation {
  const policy = NaturalInputPolicySchema.parse(policyValue);
  const parsed = NaturalFlowEvidenceSchema.safeParse(evidenceValue);
  if (!parsed.success) return { passed: false, blockers: ['natural-flow-schema-invalid'], evidence: evidenceValue as NaturalFlowEvidence, policy };
  const evidence = parsed.data;
  const blockers: string[] = [];
  if (evidence.line !== undefined && evidence.line !== policy.line) blockers.push('natural-line-mismatch');
  if (evidence.actions.length < policy.minimumActions) blockers.push('natural-action-trace-too-short');
  if (!evidence.transitions.some((transition) => transition.changed)) blockers.push('natural-state-transition-missing');
  if (evidence.completion === 'none' || !policy.acceptedCompletions.includes(evidence.completion)) blockers.push('natural-completion-policy-mismatch');
  if (policy.requireReplay && !evidence.replayObserved) blockers.push('natural-replay-missing');
  if (evidence.screenshots.length < policy.minimumScreenshots) blockers.push('natural-screenshot-count-insufficient');
  const forbidden = new Set(policy.forbiddenOperations.map(normalized));
  const used = evidence.forbiddenOperations.filter((operation) => forbidden.has(normalized(operation)));
  if (used.length > 0) blockers.push('natural-forbidden-operation-used');
  for (const required of policy.requiredTransitions) {
    const found = evidence.transitions.some((transition) => hasToken(`${transition.name} ${transition.evidence}`, required))
      || evidence.actions.some((action) => hasToken(action, required));
    if (!found) blockers.push(`natural-required-transition-missing:${required.replaceAll(' ', '-')}`);
  }
  if (options.expectedBuildHash !== undefined && evidence.buildHash !== options.expectedBuildHash) blockers.push('natural-build-hash-mismatch');
  if (options.expectedRuntime !== undefined && evidence.runtime !== options.expectedRuntime) blockers.push('natural-runtime-mismatch');
  return { passed: blockers.length === 0 && evidence.passed, blockers: [...new Set(blockers)], evidence, policy };
}
