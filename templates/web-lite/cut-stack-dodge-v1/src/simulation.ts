export const MOTHER_TEMPLATE_ID = 'cut-stack-dodge-v1' as const;

export type CourseObjectRole = 'cuttable' | 'support' | 'hazard' | 'finish';
export type CourseObjectDefinition = {
  id: string;
  role: CourseObjectRole;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CutStackLevelConfig = {
  fixedStepSeconds: number;
  gravity: number;
  tapImpulse: number;
  forwardSpeed: number;
  angularImpulse: number;
  failY: number;
  finishX: number;
  player: { x: number; y: number; radius: number; angle: number };
  objects: CourseObjectDefinition[];
};

export type CourseObjectState = CourseObjectDefinition & {
  lifecycle: 'ready' | 'contact' | 'falling' | 'settled';
  fallOffset: number;
  fallVelocity: number;
};

export type CutStackEvent = {
  seq: number;
  tick: number;
  type: 'tap' | 'launch' | 'cut' | 'drop' | 'body-contact' | 'support' | 'hazard' | 'finish' | 'fall' | 'replay';
  objectId?: string;
};

export type CutStackState = {
  version: 1;
  phase: 'ready' | 'playing' | 'failed' | 'won';
  tick: number;
  accumulatorSeconds: number;
  player: {
    x: number;
    y: number;
    previousX: number;
    previousY: number;
    vx: number;
    vy: number;
    angle: number;
    angularVelocity: number;
    radius: number;
  };
  objects: CourseObjectState[];
  cuts: number;
  taps: number;
  attempt: number;
  randomSeed: number;
  failureCause: string | null;
  events: CutStackEvent[];
};

function clone(state: CutStackState): CutStackState {
  return structuredClone(state);
}

function normalizedAngle(angle: number): number {
  const full = Math.PI * 2;
  return ((angle % full) + full) % full;
}

function appendEvent(state: CutStackState, event: Omit<CutStackEvent, 'seq' | 'tick'>): void {
  state.events.push({ ...event, seq: (state.events.at(-1)?.seq ?? 0) + 1, tick: state.tick });
  if (state.events.length > 128) state.events.splice(0, state.events.length - 128);
}

export function createInitialState(config: CutStackLevelConfig, attempt = 1, randomSeed = 1): CutStackState {
  return {
    version: 1,
    phase: 'ready',
    tick: 0,
    accumulatorSeconds: 0,
    player: {
      x: config.player.x,
      y: config.player.y,
      previousX: config.player.x,
      previousY: config.player.y,
      vx: 0,
      vy: 0,
      angle: normalizedAngle(config.player.angle),
      angularVelocity: 0,
      radius: config.player.radius,
    },
    objects: config.objects.map((object) => ({ ...object, lifecycle: 'ready', fallOffset: 0, fallVelocity: 0 })),
    cuts: 0,
    taps: 0,
    attempt,
    randomSeed: randomSeed >>> 0,
    failureCause: null,
    events: [],
  };
}

export function tap(state: CutStackState): CutStackState {
  const next = clone(state);
  if (next.phase === 'failed' || next.phase === 'won') return next;
  const launching = next.phase === 'ready';
  next.phase = 'playing';
  next.taps += 1;
  next.player.vx = Math.max(next.player.vx, 0.000_001);
  next.player.vy = 0;
  appendEvent(next, { type: 'tap' });
  if (launching) appendEvent(next, { type: 'launch' });
  return next;
}

function segmentIntersectsExpandedBox(
  from: { x: number; y: number },
  to: { x: number; y: number },
  box: CourseObjectDefinition,
  radius: number,
): boolean {
  const minX = box.x - radius;
  const maxX = box.x + box.width + radius;
  const minY = box.y - radius;
  const maxY = box.y + box.height + radius;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let near = 0;
  let far = 1;
  for (const [origin, delta, minimum, maximum] of [[from.x, dx, minX, maxX], [from.y, dy, minY, maxY]] as const) {
    if (Math.abs(delta) < 1e-12) {
      if (origin < minimum || origin > maximum) return false;
      continue;
    }
    const first = (minimum - origin) / delta;
    const second = (maximum - origin) / delta;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
    if (near > far) return false;
  }
  return far >= 0 && near <= 1;
}

function sharpEdgeLeads(angle: number): boolean {
  return Math.abs(Math.sin(angle)) >= 0.6;
}

function step(config: CutStackLevelConfig, source: CutStackState): CutStackState {
  const state = clone(source);
  const dt = config.fixedStepSeconds;
  state.tick += 1;
  for (const object of state.objects) {
    if (object.lifecycle !== 'falling') continue;
    object.fallVelocity += config.gravity * 0.55 * dt;
    object.fallOffset += object.fallVelocity * dt;
    if (object.y + object.fallOffset > config.failY) object.lifecycle = 'settled';
  }
  if (state.phase !== 'playing') return state;

  const player = state.player;
  player.previousX = player.x;
  player.previousY = player.y;
  player.vx = config.forwardSpeed;
  if (state.taps > 0 && source.events.at(-1)?.type === 'launch' && source.events.at(-1)?.tick === source.tick) {
    player.vy = config.tapImpulse;
    player.angularVelocity = config.angularImpulse;
  } else if (source.events.at(-1)?.type === 'tap' && source.events.at(-1)?.tick === source.tick) {
    player.vy = config.tapImpulse;
    player.angularVelocity = config.angularImpulse;
  }
  player.vy += config.gravity * dt;
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.angle = normalizedAngle(player.angle + player.angularVelocity * dt);

  const from = { x: player.previousX, y: player.previousY };
  const to = { x: player.x, y: player.y };
  for (const object of state.objects) {
    if (object.lifecycle !== 'ready' || !segmentIntersectsExpandedBox(from, to, object, player.radius)) continue;
    if (object.role === 'hazard') {
      state.phase = 'failed';
      state.failureCause = object.id;
      object.lifecycle = 'contact';
      appendEvent(state, { type: 'hazard', objectId: object.id });
      break;
    }
    if (object.role === 'finish') {
      state.phase = 'won';
      object.lifecycle = 'contact';
      appendEvent(state, { type: 'finish', objectId: object.id });
      break;
    }
    if (object.role === 'support') {
      if (player.vy >= 0 && player.previousY + player.radius <= object.y + 2) {
        player.y = object.y - player.radius;
        player.vy = 0;
        player.vx = 0;
        player.angularVelocity = 0;
        state.phase = 'ready';
        object.lifecycle = 'contact';
        appendEvent(state, { type: 'support', objectId: object.id });
      }
      continue;
    }
    if (sharpEdgeLeads(player.angle)) {
      object.lifecycle = 'falling';
      object.fallVelocity = Math.max(80, Math.abs(player.vy) * 0.35);
      state.cuts += 1;
      appendEvent(state, { type: 'cut', objectId: object.id });
      appendEvent(state, { type: 'drop', objectId: object.id });
    } else {
      object.lifecycle = 'contact';
      player.vy = -Math.max(120, Math.abs(player.vy) * 0.45);
      player.angularVelocity = config.angularImpulse;
      appendEvent(state, { type: 'body-contact', objectId: object.id });
    }
  }

  if (state.phase === 'playing' && player.x >= config.finishX) {
    state.phase = 'won';
    appendEvent(state, { type: 'finish' });
  }
  if (state.phase === 'playing' && player.y - player.radius > config.failY) {
    state.phase = 'failed';
    state.failureCause = 'fall';
    appendEvent(state, { type: 'fall' });
  }
  return state;
}

export function advanceFrame(config: CutStackLevelConfig, source: CutStackState, frameSeconds: number): CutStackState {
  if (!Number.isFinite(frameSeconds) || frameSeconds <= 0) return clone(source);
  let state = clone(source);
  const capped = Math.min(frameSeconds, 0.25);
  const total = state.accumulatorSeconds + capped;
  const steps = Math.floor((total + 1e-10) / config.fixedStepSeconds);
  state.accumulatorSeconds = Number(Math.max(0, total - steps * config.fixedStepSeconds).toFixed(12));
  for (let index = 0; index < steps; index += 1) {
    const accumulator = state.accumulatorSeconds;
    state = step(config, state);
    state.accumulatorSeconds = accumulator;
  }
  return state;
}

export function advanceTicks(config: CutStackLevelConfig, source: CutStackState, count: number): CutStackState {
  let state = clone(source);
  for (let index = 0; index < Math.max(0, Math.floor(count)); index += 1) state = step(config, state);
  return state;
}

export function setRandomSeed(state: CutStackState, seed: number): CutStackState {
  const next = clone(state);
  next.randomSeed = (Number.isFinite(seed) ? Math.trunc(seed) : 0) >>> 0;
  return next;
}

export function replay(config: CutStackLevelConfig, state: CutStackState): CutStackState {
  return createInitialState(config, state.attempt + 1, state.randomSeed);
}
