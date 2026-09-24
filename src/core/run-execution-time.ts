/** A persisted run status subset needed to close an unfinished execution interval. */
export type RunExecutionState = {
  status: string;
  updatedAt: string;
};

export type RunExecutionInterval = {
  startMs: number;
  endMs: number;
};

export type RunExecutionTime = {
  wallClockMinutes: number;
  activeMs: number;
  intervals: RunExecutionInterval[];
  source: 'factory-jsonl';
};

type ParsedEvent = {
  atMs: number;
  event: string;
  stage?: string;
  order: number;
};

function timestamp(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stageFrom(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const stage = (value as Record<string, unknown>).stage;
  return typeof stage === 'string' && stage.trim().length > 0 ? stage.trim() : undefined;
}

function parseEvents(logContents: string, upperBoundMs: number | undefined): ParsedEvent[] {
  if (typeof logContents !== 'string' || logContents.length === 0) return [];
  const parsed: ParsedEvent[] = [];
  for (const [order, line] of logContents.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    let value: unknown;
    try { value = JSON.parse(line) as unknown; } catch { continue; }
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    const atMs = timestamp(entry.at);
    if (atMs === undefined || (upperBoundMs !== undefined && atMs > upperBoundMs)) continue;
    const event = typeof entry.event === 'string' ? entry.event.trim() : '';
    if (!event) continue;
    const stage = stageFrom(entry.data);
    if (event === 'stage.started' && !stage) continue;
    if ((event === 'stage.completed' || event === 'stage.failed') && !stage) continue;
    if (event !== 'stage.started' && event !== 'stage.completed' && event !== 'stage.failed' && event !== 'run.waiting') continue;
    parsed.push({ atMs, event, ...(stage ? { stage } : {}), order });
  }
  return parsed.sort((left, right) => left.atMs - right.atMs || left.order - right.order);
}

function unionIntervals(intervals: RunExecutionInterval[]): RunExecutionInterval[] {
  const ordered = intervals
    .filter((interval) => Number.isFinite(interval.startMs) && Number.isFinite(interval.endMs) && interval.endMs >= interval.startMs)
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
  const merged: RunExecutionInterval[] = [];
  for (const interval of ordered) {
    const previous = merged.at(-1);
    if (!previous || interval.startMs > previous.endMs) merged.push({ ...interval });
    else previous.endMs = Math.max(previous.endMs, interval.endMs);
  }
  return merged;
}

/**
 * Measure only intervals proved by the factory event journal. Stage starts
 * open intervals; stage completion/failure and run waiting close them. Event
 * order is repaired by timestamp, duplicate starts are harmless because the
 * final intervals are unioned, and malformed records are ignored.
 */
export function measureRunExecutionTime(
  logContents: string,
  state: RunExecutionState,
  now: number,
): RunExecutionTime | undefined {
  const running = state.status === 'running';
  const nowMs = Number.isFinite(now) ? now : undefined;
  const persistedUpdatedAtMs = timestamp(state.updatedAt);
  const upperBoundMs = running ? nowMs : persistedUpdatedAtMs;
  const events = parseEvents(logContents, upperBoundMs);
  const open = new Map<string, number[]>();
  const intervals: RunExecutionInterval[] = [];
  let trustworthyStart = false;

  const close = (stage: string | undefined, endMs: number) => {
    const stages = stage ? [stage] : [...open.keys()];
    for (const name of stages) {
      const starts = open.get(name);
      if (!starts) continue;
      for (const startMs of starts) if (endMs >= startMs) intervals.push({ startMs, endMs });
      open.delete(name);
    }
  };

  for (const entry of events) {
    if (entry.event === 'stage.started') {
      trustworthyStart = true;
      const starts = open.get(entry.stage!) ?? [];
      starts.push(entry.atMs);
      open.set(entry.stage!, starts);
    } else if (entry.event === 'stage.completed' || entry.event === 'stage.failed') {
      close(entry.stage, entry.atMs);
    } else if (entry.event === 'run.waiting') {
      close(undefined, entry.atMs);
    }
  }

  if (!trustworthyStart) return undefined;
  const openEndMs = running ? nowMs : persistedUpdatedAtMs;
  if (openEndMs !== undefined) {
    for (const starts of open.values()) {
      for (const startMs of starts) if (openEndMs >= startMs) intervals.push({ startMs, endMs: openEndMs });
    }
  }

  const union = unionIntervals(intervals);
  if (union.length === 0) return undefined;
  const activeMs = union.reduce((total, interval) => total + interval.endMs - interval.startMs, 0);
  return {
    wallClockMinutes: Math.max(0, Math.ceil(activeMs / 60_000)),
    activeMs,
    intervals: union,
    source: 'factory-jsonl',
  };
}
