import {
  InteractionContinuityContractSchema,
  InteractionContinuityObservationSchema,
  InteractionContinuityReportSchema,
  type InteractionContinuityContract,
  type InteractionContinuityObservation,
  type InteractionContinuityReport,
} from '../schemas/interaction-continuity.js';
import { ActionRealizabilitySchema, type ActionRealizability } from '../schemas/acceptance-artifacts.js';

export { InteractionContinuityContractSchema } from '../schemas/interaction-continuity.js';
export type { InteractionContinuityObservation } from '../schemas/interaction-continuity.js';

/** Validate semantic interaction continuity. Geometry alone is never enough:
 * the report requires candidate, state-transition and physical-result facts. */
export function evaluateInteractionContinuity(contractValue: unknown, observationValue: unknown): InteractionContinuityReport {
  const contract = InteractionContinuityContractSchema.parse(contractValue);
  const observation = InteractionContinuityObservationSchema.parse(observationValue);
  const blockers: string[] = [];
  const failureKinds = new Set<InteractionContinuityReport['failureKinds'][number]>();
  const evidence = new Set<string>();
  const actionEvidenceMap: Record<string, Record<'normal' | 'edge' | 'rescue', string[]>> = {};
  const actionById = new Map(contract.actions.map((action) => [action.actionId, action]));
  const observedByNode = new Map(observation.nodes.map((node) => [node.nodeId, node]));

  for (const node of observation.nodes) {
    const action = actionById.get(node.actionId);
    if (!action) { blockers.push(`node:${node.nodeId}:unknown-action`); continue; }
    if (node.feedbackVisible && node.actionCandidates.length === 0) { blockers.push(`node:${node.nodeId}:feedback-without-action-candidate`); failureKinds.add('CANDIDATE_FEEDBACK_MISMATCH'); }
    const highlightedMatches = node.highlightedActionId === null || node.actionCandidates.includes(node.highlightedActionId);
    const selectedMatches = node.selectedActionId === null || node.actionCandidates.includes(node.selectedActionId);
    if (!highlightedMatches || !selectedMatches || (node.highlightedActionId !== null && node.selectedActionId !== null && node.highlightedActionId !== node.selectedActionId)) { blockers.push(`node:${node.nodeId}:feedback-candidate-mismatch`); failureKinds.add('CANDIDATE_FEEDBACK_MISMATCH'); }
    if (node.success && (node.terminal || !node.recoverable) && !(node.terminal && action.successTerminalMode !== 'forbidden' && action.replayableAfterSuccess)) { blockers.push(`node:${node.nodeId}:success-is-terminal-or-irrecoverable`); failureKinds.add('NO_FOLLOWUPS'); }
    if (node.success && node.terminal && action.successTerminalMode !== 'forbidden' && !action.replayableAfterSuccess) { blockers.push(`node:${node.nodeId}:success-terminal-replay-evidence-missing`); failureKinds.add('UNVERIFIABLE_SUCCESS'); }
    if (node.success && node.successorIds.length === 0) { blockers.push(`node:${node.nodeId}:no-playable-successor`); failureKinds.add('NO_FOLLOWUPS'); }
    if (node.failure && action.recovery.required && (!node.recoverable || node.recoverySuccessorIds.length === 0)) { blockers.push(`node:${node.nodeId}:failure-recovery-missing`); failureKinds.add('RECOVERY_MISSING'); }
    if (!node.candidateVerified) { blockers.push(`node:${node.nodeId}:action-candidate-unverified`); failureKinds.add('CANDIDATE_FEEDBACK_MISMATCH'); }
    if (!node.stateTransitionVerified) { blockers.push(`node:${node.nodeId}:state-transition-unverified`); failureKinds.add('UNVERIFIABLE_SUCCESS'); }
    if (!node.physicalResultVerified || !node.physicalResult) { blockers.push(`node:${node.nodeId}:physical-result-unverified`); failureKinds.add('UNVERIFIABLE_PHYSICAL_RESULT'); }
  }

  // Contract scenarios describe the plan only. QA must submit its own
  // fixed-step observations; otherwise Builder claims would be mistaken for
  // independent play evidence.
  const scenarios = observation.scenarios ?? [];
  const scenarioIds = new Set(scenarios.map((scenario) => scenario.id));
  for (const id of ['normal', 'edge', 'rescue'] as const) {
    const scenario = scenarios.find((item) => item.id === id);
    if (!scenario) { blockers.push(`scenario:${id}:missing`); failureKinds.add('SCENARIO_MISSING'); continue; }
    if (!scenario.simulated) { blockers.push(`scenario:${id}:not-fixed-step-simulated`); failureKinds.add('SCENARIO_MISSING'); }
    if (!scenario.passed) { blockers.push(`scenario:${id}:failed`); failureKinds.add('SCENARIO_MISSING'); }
    if (scenario.fixedStepTicks <= 0) blockers.push(`scenario:${id}:invalid-fixed-step-count`);
    for (const item of scenario.evidence) evidence.add(item);
    for (const action of contract.actions) {
      const map = actionEvidenceMap[action.actionId] ?? (actionEvidenceMap[action.actionId] = { normal: [], edge: [], rescue: [] });
      map[id].push(...scenario.evidence);
    }
  }
  for (const id of scenarioIds) if (!['normal', 'edge', 'rescue'].includes(id)) blockers.push(`scenario:${id}:unknown`);

  const repetitions = new Map(observation.repetitions.map((item) => [item.actionId, item]));
  for (const action of contract.actions) {
    const repetition = repetitions.get(action.actionId);
    if (!repetition) { blockers.push(`repetition:${action.actionId}:missing`); failureKinds.add('REPETITION_FAILED'); continue; }
    if (repetition.attempts < action.repetition.attempts) { blockers.push(`repetition:${action.actionId}:attempts-below-minimum`); failureKinds.add('REPETITION_FAILED'); }
    if (repetition.successes < action.repetition.minimumSuccesses) { blockers.push(`repetition:${action.actionId}:minimum-successes-not-met`); failureKinds.add('REPETITION_FAILED'); }
    if (repetition.successes > repetition.attempts) { blockers.push(`repetition:${action.actionId}:successes-exceed-attempts`); failureKinds.add('REPETITION_FAILED'); }
    for (const ref of action.evidence.flow) evidence.add(ref);
    for (const ref of action.evidence.state) evidence.add(ref);
    for (const ref of action.evidence.visual) evidence.add(ref);
    const map = actionEvidenceMap[action.actionId] ?? (actionEvidenceMap[action.actionId] = { normal: [], edge: [], rescue: [] });
    map.normal.push(...action.evidence.flow, ...action.evidence.state, ...action.evidence.visual);
    map.edge.push(...action.evidence.flow, ...action.evidence.state, ...action.evidence.visual);
    map.rescue.push(...action.evidence.flow, ...action.evidence.state, ...action.evidence.visual);
  }
  for (const node of contract.nodes) {
    if (!observedByNode.has(node.nodeId)) blockers.push(`node:${node.nodeId}:observation-missing`);
  }

  return InteractionContinuityReportSchema.parse({
    schemaVersion: 1,
    contractId: contract.contractId,
    passed: blockers.length === 0,
    blockers: [...new Set(blockers)],
    failureKinds: [...failureKinds],
    evidence: [...evidence],
    actionEvidenceMap: Object.fromEntries(Object.entries(actionEvidenceMap).map(([actionId, map]) => [actionId, Object.fromEntries(Object.entries(map).map(([scenario, refs]) => [scenario, [...new Set(refs)]]))])),
    checkedNodes: observation.nodes.length,
    checkedScenarios: scenarios.length,
    checkedRepetitions: observation.repetitions.length,
    evaluatedAt: new Date().toISOString(),
  });
}

export function parseInteractionContinuityContract(value: unknown): InteractionContinuityContract {
  return InteractionContinuityContractSchema.parse(value);
}

export function parseInteractionContinuityObservation(value: unknown): InteractionContinuityObservation {
  return InteractionContinuityObservationSchema.parse(value);
}

/** Compatibility adapter for v1 acceptance artifacts. New builders should
 * write InteractionAction directly; legacy action rows remain readable but
 * cannot silently become continuity evidence without node observations. */
export function upgradeLegacyActionRealizability(value: unknown): InteractionContinuityContract['actions'][number] {
  const legacy: ActionRealizability = ActionRealizabilitySchema.parse(value);
  const evidence = legacy.evidence.length ? legacy.evidence : ['legacy:action-realizability'];
  return {
    actionId: legacy.actionId,
    feedbackSignal: legacy.feedbackSignal,
    successCondition: legacy.successCondition,
    constraints: legacy.constraints,
    recovery: legacy.recovery,
    repetition: legacy.repetition,
    successTerminalMode: 'forbidden',
    replayableAfterSuccess: false,
    evidence: { flow: evidence, state: evidence, visual: evidence },
  };
}
