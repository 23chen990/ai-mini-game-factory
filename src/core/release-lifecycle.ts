import { ReleaseLifecycleSchema, ReleaseLifecycleStatusSchema, type ReleaseLifecycle, type ReleaseLifecycleStatus } from '../schemas/release-lifecycle.js';

const allowed: Record<ReleaseLifecycleStatus, ReleaseLifecycleStatus[]> = {
  IMPLEMENTATION_READY: ['CANDIDATE_READY', 'KILLED'],
  CANDIDATE_READY: ['RELEASE_READY', 'PAUSED', 'KILLED'],
  RELEASE_READY: ['SUBMITTED', 'PAUSED', 'KILLED'],
  SUBMITTED: ['LIVE_VERIFIED', 'PAUSED', 'KILLED'],
  LIVE_VERIFIED: ['PAUSED', 'KILLED'],
  PAUSED: ['CANDIDATE_READY', 'RELEASE_READY', 'KILLED'],
  KILLED: [],
};

/**
 * Promote a release to a target status while materialising every legal
 * intermediate transition. Callers recording an external event (submission,
 * live verification, etc.) must not be able to skip the lifecycle graph.
 */
export function promoteReleaseLifecycleThrough(
  previousValue: ReleaseLifecycle | undefined,
  input: { gameId: string; releaseHash: string; to: ReleaseLifecycleStatus },
): ReleaseLifecycle {
  const to = ReleaseLifecycleStatusSchema.parse(input.to);
  const previous = previousValue ? ReleaseLifecycleSchema.parse(previousValue) : undefined;
  const current = previous?.status;
  if (previous && (previous.gameId !== input.gameId || previous.releaseHash !== input.releaseHash)) {
    throw new Error('release lifecycle cannot change game or tested release hash');
  }
  if (!current) {
    const initial = promoteReleaseLifecycle(undefined, { gameId: input.gameId, releaseHash: input.releaseHash, from: null, to: 'IMPLEMENTATION_READY' });
    if (to === 'IMPLEMENTATION_READY') return initial;
    return promoteReleaseLifecycleThrough(initial, input);
  }
  if (current === to) return previous!;
  // A target that is behind the current state is not a valid promotion. A
  // caller can explicitly pause/kill through promoteReleaseLifecycle instead.
  const queue: Array<{ status: ReleaseLifecycleStatus; path: ReleaseLifecycleStatus[] }> = [{ status: current, path: [] }];
  const visited = new Set<ReleaseLifecycleStatus>([current]);
  let path: ReleaseLifecycleStatus[] | undefined;
  while (queue.length > 0) {
    const item = queue.shift()!;
    for (const next of allowed[item.status] ?? []) {
      if (next === to) { path = [...item.path, next]; break; }
      if (!visited.has(next)) { visited.add(next); queue.push({ status: next, path: [...item.path, next] }); }
    }
    if (path) break;
  }
  if (!path) throw new Error(`invalid release lifecycle promotion ${current} -> ${to}`);
  let result = previous!;
  for (const next of path) result = promoteReleaseLifecycle(result, { gameId: input.gameId, releaseHash: input.releaseHash, from: result.status, to: next });
  return result;
}

export function promoteReleaseLifecycle(previousValue: ReleaseLifecycle | undefined, input: { gameId: string; releaseHash: string; from: ReleaseLifecycleStatus | null; to: ReleaseLifecycleStatus }): ReleaseLifecycle {
  const releaseHash = String(input.releaseHash); ReleaseLifecycleStatusSchema.parse(input.to);
  const previous = previousValue ? ReleaseLifecycleSchema.parse(previousValue) : undefined;
  if (previous && (previous.gameId !== input.gameId || previous.releaseHash !== releaseHash)) throw new Error('release lifecycle cannot change game or tested release hash');
  const from = previous?.status ?? input.from;
  if (from !== input.from) throw new Error(`release lifecycle expected from ${from}, received ${input.from}`);
  if (input.to === 'IMPLEMENTATION_READY') {
    if (previous || from !== null) throw new Error(`invalid release lifecycle transition ${from ?? 'null'} -> ${input.to}`);
  } else if (from === null || !(allowed[from] ?? []).includes(input.to)) {
    throw new Error(`invalid release lifecycle transition ${from ?? 'null'} -> ${input.to}`);
  }
  const now = new Date().toISOString();
  return ReleaseLifecycleSchema.parse({ schemaVersion: 1, gameId: input.gameId, releaseHash, status: input.to, history: [...(previous?.history ?? []), { from, to: input.to, releaseHash, at: now }], updatedAt: now });
}
