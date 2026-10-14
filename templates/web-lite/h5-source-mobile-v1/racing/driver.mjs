// Only translates two-button intent into the existing vehicle's input contract.
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const empty = () => ({ up: false, down: false, left: false, right: false, shift: false, upPressed: false, wPressed: false, nitroPressed: false, swapPressed: false, resetPressed: false });

export class TouchSteering {
  constructor() { this.pointers = new Map(); this.pulses = new Map(); }
  press(id, direction, now) {
    if (direction !== 'left' && direction !== 'right') return;
    for (const [key, pulse] of this.pulses) if (pulse.direction !== direction) this.pulses.delete(key);
    this.pointers.set(id, { direction, started: now });
    this.pulses.delete(id);
  }
  release(id, now) {
    const pointer = this.pointers.get(id);
    if (!pointer) return;
    this.pointers.delete(id);
    if (now - pointer.started < 80) this.pulses.set(id, { direction: pointer.direction, until: pointer.started + 80 });
  }
  snapshot(now) {
    const result = { left: false, right: false };
    for (const pointer of this.pointers.values()) result[pointer.direction] = true;
    for (const [id, pulse] of this.pulses) {
      if (now >= pulse.until) this.pulses.delete(id);
      else result[pulse.direction] = true;
    }
    return result;
  }
  clear() { this.pointers.clear(); this.pulses.clear(); }
}

export class RaceDriver {
  constructor() { this.enabled = true; this.startedPlayers = new WeakSet(); this.suspend(); }
  suspend() {
    this.holdTime = 0; this.direction = 0; this.wasDrifting = false;
    this.session = null; this.boost = null; this.cooldown = .28;
    this.recovery = 0; this.stableTime = 0; this.crashes = null;
    this.nitroLocked = false; this.lastNitroCount = null;
  }
  frame(dt, raw, p, track, state, { canStep = true } = {}) {
    if (!this.enabled) return raw;
    if (state !== 'race' || !p || !track || p.finished) { this.suspend(); return empty(); }
    dt = Math.min(.05, Math.max(0, dt));
    const input = { ...empty(), up: true, left: !!raw.left, right: !!raw.right };
    if (canStep && !this.startedPlayers.has(p)) { input.upPressed = true; this.startedPlayers.add(p); }
    const dir = Number(input.left) - Number(input.right);
    const roadHeading = p.proj?.hd ?? track.hd[p.hint];
    const error = Math.abs(wrap(p.h - roadHeading));
    const ahead = track.sample(p.d + Math.max(6, p.s * .3), {});
    const middle = track.sample(p.d + Math.max(3, p.s * .15), {});
    const bend = ((track.curv[p.hint] ?? 0) + (track.curv[middle.i] ?? 0) + (track.curv[ahead.i] ?? 0)) / 3;
    const upcoming = Math.max(Math.abs(track.curv[p.hint] ?? 0), Math.abs(track.curv[middle.i] ?? 0), Math.abs(track.curv[ahead.i] ?? 0));
    this.recovery = Math.max(0, this.recovery - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    const crashes = p.stats?.crash ?? 0;
    const impact = p.impact > 5 || (this.crashes !== null && crashes > this.crashes);
    this.crashes = crashes;
    if (impact || p.spin > 0 || p.slowTime > 0) {
      this.recovery = .7; this.boost = null;
      if (this.session) this.session.clean = false;
    }
    const safe = !p.airborne && p.spin <= 0 && p.slowTime <= 0 && p.wrongWay < .5 && this.recovery === 0 && error < .65 && Math.abs(p.lat) < track.halfW - 2;
    if (dir !== this.direction) {
      this.holdTime = 0;
      if (this.direction && dir && dir !== this.direction) this.cooldown = .28;
    }
    this.holdTime = dir ? this.holdTime + dt : 0;
    if (p.drifting && !this.wasDrifting) {
      this.session = { clean: true, release: false, maxError: error, duration: p.driftTime };
      this.boost = null;
    }
    if (p.drifting && this.session) {
      this.session.duration = p.driftTime;
      this.session.maxError = Math.max(this.session.maxError, error);
      if (!dir && this.direction === p.driftDir) this.session.release = true;
      if (dir && dir !== p.driftDir) this.session.release = false;
      const lead = wrap(p.h - ahead.hd) * p.driftDir;
      input.shift = safe && dir === p.driftDir && Math.abs(p.driftAngle) < .55 && lead < .18 && p.driftTime < 1.4 && dir * bend > .001;
    } else if (!p.drifting) {
      input.shift = safe && p.s >= 21 && this.holdTime >= .28 && this.cooldown === 0 && Math.abs(p.steer) >= .35 && dir * bend > .0032 && !this.boost;
    }
    if (this.wasDrifting && !p.drifting) {
      const session = this.session;
      if (session?.clean && safe && p.smallWindow > 0 && p.windowKind === 'drift') {
        const perfect = session.release && session.duration >= .32 && session.duration <= 1.6 && session.maxError < .5 && error < .22 && Math.abs(p.steer) < .45;
        this.boost = { delay: perfect ? 0 : .22, issued: false };
      }
      this.session = null;
      // Prevent multiple automatic micro-drifts inside one gentle corner.
      this.cooldown = .82;
      input.shift = false;
    }
    if (this.boost && !this.boost.issued) {
      if (!safe || p.smallWindow <= 0 || p.windowKind !== 'drift') this.boost = null;
      else if (canStep && .5 - p.smallWindow >= this.boost.delay) { input.wPressed = true; this.boost.issued = true; }
    }
    if (this.boost?.issued && p.smallWindow <= 0) this.boost = null;
    const straight = safe && !p.drifting && !dir && p.s > 20 && error < .22 && Math.abs(p.lat) < track.halfW * .65 && upcoming < .0045;
    this.stableTime = straight ? this.stableTime + dt : 0;
    if (this.lastNitroCount !== null && p.nitroCount < this.lastNitroCount) this.nitroLocked = false;
    if (canStep && this.stableTime >= .3 && p.nitroCount > 0 && p.nitroTime <= 0 && !this.nitroLocked && (!this.boost || this.boost.issued)) {
      input.nitroPressed = true; this.nitroLocked = true; this.stableTime = 0;
    }
    this.lastNitroCount = p.nitroCount;
    this.wasDrifting = p.drifting; this.direction = dir;
    return input;
  }
}
