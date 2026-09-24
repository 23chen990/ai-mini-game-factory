export type Vector2 = Readonly<{ x: number; y: number }>;

export type HookAttachmentObservation = Readonly<{
  selectedHookId: string;
  declaredPolicy: Readonly<{
    eligibleHookIds: readonly string[];
    intendedHookId: string | null;
  }>;
  candidates: readonly Readonly<{
    hookId: string;
    behind: boolean;
  }>[];
}>;

export type ActionTraceFrame = Readonly<{
  tick: number;
  position: Vector2;
  velocity: Vector2;
  input?: 'press' | 'release' | 'retry';
  hookAttachment?: HookAttachmentObservation;
  terminal?: 'won' | 'failed';
  riskBand?: string | number;
  finishDetected?: boolean;
}>;

export type ActionTrace = Readonly<{
  fixedStepMs: number;
  frames: readonly ActionTraceFrame[];
}>;

const speed = ({ x, y }: Vector2) => Math.hypot(x, y);

const orderedFrames = (trace: ActionTrace) => [...trace.frames].sort((left, right) => left.tick - right.tick);

export function measureReleaseKinematics(trace: ActionTrace) {
  const frames = orderedFrames(trace);
  const samples: { retention: number; angleChange: number }[] = [];

  for (let index = 1; index < frames.length; index += 1) {
    const before = frames[index - 1]!;
    const after = frames[index]!;
    if (after.input !== 'release') continue;

    const beforeSpeed = speed(before.velocity);
    if (beforeSpeed === 0) continue;

    const beforeAngle = Math.atan2(before.velocity.y, before.velocity.x);
    const afterAngle = Math.atan2(after.velocity.y, after.velocity.x);
    const rawAngleDifference = Math.abs(afterAngle - beforeAngle);
    const wrappedAngleDifference = Math.min(rawAngleDifference, Math.PI * 2 - rawAngleDifference);
    samples.push({
      retention: speed(after.velocity) / beforeSpeed,
      angleChange: wrappedAngleDifference * 180 / Math.PI,
    });
  }

  return {
    releaseCount: samples.length,
    minimumRetentionRatio: samples.length === 0 ? 0 : Math.min(...samples.map(({ retention }) => retention)),
    maximumAngleChangeDegrees: samples.length === 0 ? 0 : Math.max(...samples.map(({ angleChange }) => angleChange)),
  };
}

export function evaluateHookAttachments(trace: ActionTrace) {
  let attachmentCount = 0;
  let intentionalAttachments = 0;
  let wrongAttachments = 0;
  let behindDecoyAttachments = 0;

  for (const { hookAttachment } of trace.frames) {
    if (!hookAttachment) continue;
    attachmentCount += 1;

    const { selectedHookId, declaredPolicy, candidates } = hookAttachment;
    const selectedCandidate = candidates.find(({ hookId }) => hookId === selectedHookId);
    const isBehind = selectedCandidate?.behind === true;
    const isEligible = declaredPolicy.eligibleHookIds.includes(selectedHookId);

    if (selectedHookId === declaredPolicy.intendedHookId && isEligible && !isBehind) {
      intentionalAttachments += 1;
    }
    if (!isEligible || isBehind) wrongAttachments += 1;
    if (isBehind) behindDecoyAttachments += 1;
  }

  return { attachmentCount, intentionalAttachments, wrongAttachments, behindDecoyAttachments };
}

function isMeaningfulEvent(
  frame: ActionTraceFrame,
  previous: ActionTraceFrame,
  significantSpeedDelta: number,
) {
  return frame.input !== undefined
    || frame.hookAttachment !== undefined
    || frame.terminal !== undefined
    || frame.riskBand !== previous.riskBand
    || Math.abs(speed(frame.velocity) - speed(previous.velocity)) >= significantSpeedDelta;
}

export function measureMaxEventGap(
  trace: ActionTrace,
  options: Readonly<{ significantSpeedDelta?: number }> = {},
) {
  const frames = orderedFrames(trace);
  if (frames.length < 2) return { ticks: 0, milliseconds: 0 };

  const significantSpeedDelta = options.significantSpeedDelta ?? 1;
  const eventTicks = [frames[0]!.tick];
  for (let index = 1; index < frames.length; index += 1) {
    const frame = frames[index]!;
    if (isMeaningfulEvent(frame, frames[index - 1]!, significantSpeedDelta)) eventTicks.push(frame.tick);
  }
  const finalTick = frames.at(-1)!.tick;
  if (eventTicks.at(-1) !== finalTick) eventTicks.push(finalTick);

  let ticks = 0;
  for (let index = 1; index < eventTicks.length; index += 1) {
    ticks = Math.max(ticks, eventTicks[index]! - eventTicks[index - 1]!);
  }
  return { ticks, milliseconds: ticks * trace.fixedStepMs };
}

export function measureRetryFriction(trace: ActionTrace) {
  const frames = orderedFrames(trace);
  const frictionTicks: number[] = [];
  let unmatchedFailureTick: number | null = null;

  for (const frame of frames) {
    if (frame.terminal === 'failed') unmatchedFailureTick = frame.tick;
    if (frame.input === 'retry' && unmatchedFailureTick !== null && frame.tick >= unmatchedFailureTick) {
      frictionTicks.push(frame.tick - unmatchedFailureTick);
      unmatchedFailureTick = null;
    }
  }

  if (frictionTicks.length === 0) {
    return { attempts: 0, maximumTicks: null, maximumMilliseconds: null };
  }
  const maximumTicks = Math.max(...frictionTicks);
  return {
    attempts: frictionTicks.length,
    maximumTicks,
    maximumMilliseconds: maximumTicks * trace.fixedStepMs,
  };
}

export type FinishBoundary = Readonly<{
  axis: 'x' | 'y';
  coordinate: number;
  direction: 'positive' | 'negative';
  minimumSpeed: number;
}>;

export function countMissedFinishDetections(trace: ActionTrace, finish: FinishBoundary) {
  const frames = orderedFrames(trace);
  const direction = finish.direction === 'positive' ? 1 : -1;
  let highSpeedCrossings = 0;
  let missedDetections = 0;

  for (let index = 1; index < frames.length; index += 1) {
    const before = frames[index - 1]!;
    const after = frames[index]!;
    const beforeDistance = direction * (before.position[finish.axis] - finish.coordinate);
    const afterDistance = direction * (after.position[finish.axis] - finish.coordinate);
    const crossed = beforeDistance < 0 && afterDistance >= 0;
    if (!crossed) continue;

    const projectedSpeed = Math.max(
      direction * before.velocity[finish.axis],
      direction * after.velocity[finish.axis],
    );
    if (projectedSpeed < finish.minimumSpeed) continue;

    highSpeedCrossings += 1;
    const detected = after.finishDetected === true || after.terminal === 'won';
    if (!detected) missedDetections += 1;
  }

  return { highSpeedCrossings, missedDetections };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${entries.join(',')}}`;
}

export function hashActionTrace(trace: ActionTrace) {
  const bytes = new TextEncoder().encode(canonicalJson(trace));
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}
