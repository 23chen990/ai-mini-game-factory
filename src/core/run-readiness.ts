import { RunReadinessSchema, type ExecutionStatus, type RunReadiness, type StageName } from '../schemas/index.js';

type StageStatus = { status?: string };

export type RunReadinessInput = {
  stage: StageName;
  status: ExecutionStatus;
  readiness?: RunReadiness;
  stages?: Record<string, StageStatus>;
};

/**
 * Derive the operator-facing state without conflating execution status and
 * product readiness. The explicit readiness value is preserved only for
 * states that can carry a stronger approval (for example RELEASE_READY after
 * the release stage); active/waiting transitions otherwise reset it so stale
 * approvals cannot make a resumed run look shippable.
 */
export function deriveRunReadiness(input: RunReadinessInput): RunReadiness {
  const parsedCurrent = input.readiness ? RunReadinessSchema.safeParse(input.readiness) : undefined;
  const current = parsedCurrent?.success ? parsedCurrent.data : undefined;

  if (input.status === 'failed' || input.stage === 'FAILED') return 'FAILED';
  if (input.stage === 'ABANDONED') return 'ABANDONED';
  if (input.stage === 'NOT_GREENLIT') return 'NOT_GREENLIT';
  if (input.stage === 'DESIGN_REJECTED') return 'DESIGN_REJECTED';
  if (input.stage === 'NO_PROTOTYPE_WINNER') return 'NO_PROTOTYPE_WINNER';
  if (input.stage === 'ACTION_EXPERIMENT_APPROVED') return 'EXPERIMENT_APPROVED';
  if (input.stage === 'ACTION_EXPERIMENT_REFACTOR') return 'EXPERIMENT_REFACTOR';
  if (input.stage === 'ACTION_EXPERIMENT_KILLED') return 'EXPERIMENT_KILLED';
  if (input.stage === 'LIVE_VERIFIED') return 'LIVE_VERIFIED';
  if (input.stage === 'LIVE_MONITORING') return input.status === 'waiting' ? 'LIVE_MONITORING' : 'IN_PROGRESS';
  if (input.stage === 'LAUNCH_METRICS') return 'LAUNCH_METRICS';

  const stageRecord = input.stages?.[input.stage];
  const stageCompleted = stageRecord?.status === 'completed';
  if (input.stage === 'FULL_BUILD' && stageCompleted) return 'IMPLEMENTATION_READY';
  if (input.stage === 'RELEASE_CANDIDATE' && stageCompleted) return 'CANDIDATE_READY';

  if (input.stage === 'RELEASE' && stageCompleted) {
    return current === 'RELEASE_READY' ? 'RELEASE_READY' : 'CANDIDATE_READY';
  }
  if (input.stage === 'COMPLETED') {
    if (current === 'RELEASE_READY' || current === 'CANDIDATE_READY') return current;
    return 'CANDIDATE_READY';
  }
  if (input.status === 'waiting') return 'WAITING';
  return 'IN_PROGRESS';
}

/** Mutate a run-state-like object immediately before persistence. */
export function normalizeRunReadiness<T extends RunReadinessInput>(state: T): T {
  state.readiness = deriveRunReadiness(state);
  return state;
}
