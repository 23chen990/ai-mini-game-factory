/**
 * Reimplemented V11 physical rivals. The later original source was unavailable.
 * This module chooses ordinary PlayerCar inputs; it never advances a spline,
 * writes a car position/speed, forces fork projection or grants race progress.
 * Native PlayerCar owns movement, grip, walls, air time and earned boosts.
 * Native World owns the same half-lap/finish accounting used for the player.
 */
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const mod = (value, length) => ((value % length) + length) % length;
const relative = (value, origin, length) => {
  const d = mod(value - origin, length);
  return d > length / 2 ? d - length : d;
};
const finite = Number.isFinite;
const DEFAULT_TUNE = Object.freeze({ vmax: 55, turnRate: 1.9, brake: 45, driftYaw: 1.5, driftYawAlign: .85 });
const emptyInput = () => ({
  up: false, down: false, left: false, right: false, shift: false,
  upPressed: false, wPressed: false, nitroPressed: false,
  manualNitroPressed: false, steerAxis: 0,
});

function forkPoint(road, arc) {
  const samples = road.samples;
  let low = 0, high = samples.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (samples[middle].arc < arc) low = middle;
    else high = middle;
  }
  const a = samples[low], b = samples[high];
  const ratio = clamp((arc - a.arc) / Math.max(.0001, b.arc - a.arc), 0, 1);
  const hd = a.hd + wrap(b.hd - a.hd) * ratio;
  return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio,
    z: a.z + (b.z - a.z) * ratio, hd, rx: -Math.cos(hd), rz: Math.sin(hd) };
}

function nearestFork(road, x, z) {
  let best = null;
  for (let i = 1; i < road.samples.length; i++) {
    const a = road.samples[i - 1], b = road.samples[i];
    const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz;
    if (length2 < .00001) continue;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / length2, 0, 1);
    const distance = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (!best || distance < best.distance) best = {
      arc: a.arc + (b.arc - a.arc) * t, distance,
    };
  }
  return best;
}

function updateRoute(ai, track) {
  const road = track.__RACE_SHORTCUT__;
  if (!road?.samples?.length || !finite(road.start) || !finite(road.end) ||
      !finite(road.length) || !finite(ai.d)) return null;
  const lap = Number.isInteger(ai.lapsDone) ? ai.lapsDone : 0;
  const approach = relative(ai.d, road.start, track.length);
  const physicallyEntered = ai.proj?.__RACE_SHORTCUT_ACTIVE === true;
  let route = ai.__V11_AI_ROUTE__;
  if (!route || route.lap !== lap || route.course !== road.course) {
    if (!physicallyEntered && (approach < -180 || approach > 18)) return null;
    const probability = clamp(.32 + ((ai.skill ?? 1) - 1) * .31, .19, .9);
    route = { lap, course: road.course, wants: physicallyEntered || (typeof ai.rnd === 'function' ? ai.rnd() : .5) < probability,
      phase: 'approach', entered: false, arc: 0 };
    ai.__V11_AI_ROUTE__ = route;
  }
  if (physicallyEntered) {
    // Contact may push a driver who originally chose the main road through
    // the real portal. Follow the road actually under its wheels, rather
    // than steering across a guardrail to honour an obsolete intention.
    route.wants = true;
    route.phase = 'branch';
  }
  if (!route.wants || route.phase === 'missed' || route.phase === 'done') return null;
  const near = nearestFork(road, ai.x, ai.z);
  if (!near) return null;
  if (physicallyEntered) {
    route.phase = 'branch';
    route.entered = true;
    route.arc = finite(ai.proj.__RACE_SHORTCUT_ARC) ? ai.proj.__RACE_SHORTCUT_ARC : near.arc;
  } else if (route.entered) {
    const exit = relative(ai.d, road.end, track.length);
    if (near.arc > road.length - 22 && exit > -24 && exit < 100) {
      route.phase = exit > 25 ? 'done' : 'exit';
      route.arc = exit > 0 ? road.length + exit : near.arc;
    } else if (near.distance <= Math.max(road.width ?? 11.5, track.halfW) + 8) {
      // Projection may momentarily choose the overlapping main surface after
      // a wall impact. A reachable committed branch remains the target.
      route.phase = 'branch';
      route.arc = near.arc;
    } else {
      route.phase = 'missed';
    }
  } else if (approach > 105 || (approach > 70 && near.arc > Math.min(75, road.length * .48))) {
    // A genuine miss is a physical location beyond the entry opening, never
    // just a negative modulo distance, impact flag or low recovery speed.
    route.phase = 'missed';
  } else {
    route.phase = approach < -6 ? 'approach' : 'entry';
    route.arc = approach < 0 ? approach : near.arc;
  }
  return route.phase === 'done' || route.phase === 'missed' ? null : route;
}

function routeSampler(ai, track, route) {
  const road = track.__RACE_SHORTCUT__;
  const personal = clamp(finite(ai.personal) ? ai.personal : 0, -.86, .86);
  if (!route) return ahead => {
    const d = ai.d + ahead, point = track.sample(d, {});
    const half = track.v9WidthAt?.(d) ?? track.halfW;
    const lane = personal * Math.max(1, half - 3) * .70;
    return { ...point, x: point.x + point.rx * lane, z: point.z + point.rz * lane };
  };
  return ahead => {
    const arc = route.arc + ahead;
    if (arc < 0) {
      const point = track.sample(road.start + arc, {});
      const fade = clamp((-arc - 25) / 85, 0, 1);
      const lane = personal * Math.max(1, track.halfW - 3) * .70 * fade;
      return { ...point, x: point.x + point.rx * lane, z: point.z + point.rz * lane };
    }
    if (arc > road.length) return track.sample(road.end + arc - road.length, {});
    return forkPoint(road, arc);
  };
}

/** Pure input controller: only its own route/decision state is updated. */
export function v11AiInput(ai, track, dt, tune = DEFAULT_TUNE) {
  const input = emptyInput();
  if (!ai || !track?.sample || !(track.length > 0) ||
      ![ai.x, ai.z, ai.h, ai.m, ai.s, ai.d, dt].every(finite) || dt <= 0) return input;
  const route = updateRoute(ai, track);
  const at = routeSampler(ai, track, route);
  const ability = clamp(finite(ai.skill) ? ai.skill : 1, .65, 2.2);
  const speed = Math.max(0, ai.s);
  const look = clamp(7 + speed * (route ? .28 : .34), 10, route ? 21 : 27);
  // After contact on the far side, a long lookahead cuts diagonally toward
  // the already-separated middle of a fork. Intercept its early portal at
  // low speed first; only the native road projection can confirm entry.
  const entryRecovery = route?.phase === 'entry' && !route.entered &&
    speed < 29 && Math.abs(ai.lat ?? 0) > (track.v9WidthAt?.(ai.d) ?? track.halfW) * .38;
  const target = entryRecovery
    ? forkPoint(track.__RACE_SHORTCUT__, Math.min(18, Math.max(8, route.arc + 3)))
    : at(look);
  const targetDistance = Math.max(5, Math.hypot(target.x - ai.x, target.z - ai.z));
  const aim = Math.atan2(target.x - ai.x, target.z - ai.z);
  const headingError = wrap(aim - ai.m);
  const gripLag = wrap(ai.h - ai.m);
  const yaw = speed > 5 ? 2 * speed * Math.sin(headingError) / targetDistance : wrap(aim - ai.h) * 2.5;
  const normalTurn = (tune.turnRate ?? 1.9) * Math.max(.25, clamp(speed / 9, 0, 1)) *
    (1 - .42 * clamp(speed / (tune.vmax ?? 55), 0, 1.3));
  input.steerAxis = clamp((yaw - gripLag * .8) / Math.max(.4, normalTurn), -1, 1);

  let desired = Math.min(tune.vmax ?? 55, 48 + ability * 4);
  let largestCurve = 0;
  let nearCurve = 0;
  for (let ahead = 0; ahead <= 105; ahead += 10) {
    const a = at(Math.max(0, ahead - 5)), b = at(ahead + 7);
    const curvature = wrap(b.hd - a.hd) / Math.max(5, ahead === 0 ? 7 : 12);
    const absolute = Math.abs(curvature);
    if (ahead <= 20 && absolute > Math.abs(nearCurve)) nearCurve = curvature;
    largestCurve = Math.max(largestCurve, absolute);
    const gripBudget = 25 + ability * 10;
    const cornerLimit = Math.sqrt(gripBudget / Math.max(.0001, absolute));
    // Respect the native wheel's available yaw, including its high-speed
    // reduction. This is a braking decision, never a change to TUNE or speed.
    const yawLimit = (tune.turnRate ?? 1.9) * .87 /
      Math.max(.0001, absolute + (tune.turnRate ?? 1.9) * .87 * .42 / (tune.vmax ?? 55));
    const limit = Math.max(10, Math.min(cornerLimit, yawLimit));
    const braking = (tune.brake ?? 45) * .66;
    desired = Math.min(desired, Math.sqrt(limit * limit + 2 * braking * Math.max(0, ahead - 9)));
  }
  if (Math.abs(headingError) > .70) desired = Math.min(desired, Math.max(9, 25 * Math.cos(Math.min(1.12, Math.abs(headingError)))));
  if ((ai.impact ?? 0) > 4 && route) desired = Math.min(desired, 20);

  // The inherited drift state must be released with a real input edge after
  // collision. Holding Shift through a crash may not silently start a drift.
  if (ai.drifting) {
    input.shift = false;
    const correction = wrap(aim - ai.h);
    input.steerAxis = clamp(correction * 2.4, -1, 1);
  }
  input.up = ai.s < desired - .35;
  input.down = ai.s > desired + .9;
  input.left = input.steerAxis > .04;
  input.right = input.steerAxis < -.04;
  const safeBoost = !route && largestCurve < .0055 && Math.abs(headingError) < .10 &&
    !ai.airborne && !ai.drifting && (ai.spin ?? 0) <= 0 && (ai.impact ?? 0) <= 0 && speed > 24;
  input.wPressed = safeBoost && (ai.smallWindow ?? 0) > 0;
  if (safeBoost && (ai.nitroCount ?? 0) > 0 && (ai.nitroTime ?? 0) <= 0) {
    input.nitroPressed = !ai.__V11_ITEM_MODE__;
    input.manualNitroPressed = !!ai.__V11_ITEM_MODE__;
  }
  ai.__V11_AI_DECISION__ = { route: route?.phase ?? 'main', targetSpeed: desired,
    steerAxis: input.steerAxis, nearCurve, headingError };
  return input;
}

/** Constructor adapter used by the generated native ai.js entrypoint. */
export function createV11PhysicalAiClass(PlayerCar, tune = DEFAULT_TUNE) {
  if (typeof PlayerCar !== 'function') throw Error('Physical AI requires the native PlayerCar constructor');
  return class V11PhysicalAICar extends PlayerCar {
    constructor(track, model, name, skill, rnd) {
      super(track, model, name);
      this.isPlayer = false;
      this.__V11_PHYSICAL_AI__ = true;
      this.skill = finite(skill) ? skill : 1;
      this.rnd = typeof rnd === 'function' ? rnd : () => .5;
      this.personal = (this.rnd() - .5) * .6;
      this.reset(0, 0);
    }

    reset(d, lat) {
      super.reset(d, lat);
      const random = typeof this.rnd === 'function' ? this.rnd : () => .5;
      this.lapsDone = Math.floor(d / this.track.length);
      this.owed = d < 0;
      this.half = false;
      this.lastD = this.d;
      this.startDelay = .05 + random() * .25;
      this.nitroCd = 6 + random() * 6;
      this.itemTimer = 2 + random() * 3;
      this.__V11_AI_ROUTE__ = null;
      this.__V11_AI_DECISION__ = null;
      this.__V11_AI_INPUT__ = emptyInput();
    }

    get dist() { return this.lapsDone * this.track.length + this.d; }

    update(dt, active, raceTime) {
      const allowed = !!active && raceTime >= this.startDelay;
      const input = allowed ? v11AiInput(this, this.track, dt, tune) : emptyInput();
      this.__V11_AI_INPUT__ = input;
      this.events.length = 0;
      super.update(dt, input, allowed, !!this.__V11_ITEM_MODE__);
    }
  };
}
