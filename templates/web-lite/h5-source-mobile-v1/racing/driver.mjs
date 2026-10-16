// Only translates two-button intent into the existing vehicle's input contract.
import { cornerSpeedIntent } from './corner-speed.mjs';
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const empty = () => ({ up: false, down: false, left: false, right: false, shift: false, upPressed: false, wPressed: false, nitroPressed: false, swapPressed: false, resetPressed: false });

export class TouchSteering {
  constructor() { this.pointers = new Map(); this.pulses = new Map(); this.sequence = 0; }
  press(id, direction, now) {
    if (direction !== 'left' && direction !== 'right') return;
    // A fresh opposite press immediately overrides any lingering short tap.
    for (const [key, pulse] of this.pulses) if (pulse.direction !== direction) this.pulses.delete(key);
    this.pointers.set(id, { direction, started: now, order: ++this.sequence });
    this.pulses.delete(id);
  }
  move(id, direction) {
    const pointer = this.pointers.get(id);
    if (!pointer || !['left', 'right'].includes(direction) || pointer.direction === direction) return false;
    for (const [key, pulse] of this.pulses) if (pulse.direction !== direction) this.pulses.delete(key);
    this.pointers.set(id, { ...pointer, direction, order: ++this.sequence });
    return true;
  }
  release(id, now) {
    const pointer = this.pointers.get(id);
    if (!pointer) return;
    this.pointers.delete(id);
    if (now >= pointer.started && now - pointer.started < 80)
      this.pulses.set(id, { direction: pointer.direction, until: pointer.started + 80, order: pointer.order });
  }
  cancel(id) {
    // pointercancel / unexpected capture loss is NOT a short steering tap.
    // A normal pointerup already removed the active pointer: preserve its pulse.
    if (!this.pointers.has(id)) return;
    this.pointers.delete(id);
    this.pulses.delete(id);
  }
  activeDirection() {
    let newest = null;
    for (const pointer of this.pointers.values())
      if (!newest || pointer.order > newest.order) newest = pointer;
    return newest?.direction ?? null;
  }
  snapshot(now) {
    let newest = null;
    for (const pointer of this.pointers.values())
      if (!newest || pointer.order > newest.order) newest = pointer;
    for (const [id, pulse] of this.pulses) {
      if (now >= pulse.until) this.pulses.delete(id);
      // A held finger beats a past tap; otherwise use the latest short tap.
      else if (!this.pointers.size && (!newest || pulse.order > newest.order)) newest = pulse;
    }
    return { left: newest?.direction === 'left', right: newest?.direction === 'right' };
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
    this.wrongWayRecovery = false;this.cornerSpeed = null;
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
    // The two-key UI has no brake. Full auto-throttle after an item spin makes
    // the U-turn radius wider than the road and keeps the car pinned to a rail.
    // Use native brake/crawl inputs only; the player still owns all steering.
    if (!p.airborne && p.spin <= 0 && p.wrongWay > .2 && error > 1.65) this.wrongWayRecovery = true;
    if (error < .65) this.wrongWayRecovery = false;
    if (this.wrongWayRecovery && !p.airborne && p.spin <= 0) {
      input.up = p.s < 4;
      input.down = p.s > 6;
      this.boost = null; this.stableTime = 0;
    }
    const ahead = track.sample(p.d + Math.max(6, p.s * .3), {});
    const middle = track.sample(p.d + Math.max(3, p.s * .15), {});
    const bend = ((track.curv[p.hint] ?? 0) + (track.curv[middle.i] ?? 0) + (track.curv[ahead.i] ?? 0)) / 3;
    const upcoming = Math.max(Math.abs(track.curv[p.hint] ?? 0), Math.abs(track.curv[middle.i] ?? 0), Math.abs(track.curv[ahead.i] ?? 0));
    this.cornerSpeed = this.wrongWayRecovery ? null : cornerSpeedIntent(p, track);
    if (this.cornerSpeed) {
      // Two-button players have no separate brake: use native inputs, never
      // clamp speed, teleport, or choose a steering direction.
      input.up = false;
      input.down = this.cornerSpeed === 'brake';
      this.stableTime = 0;
      if (input.down) this.boost = null;
    }
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
    const straight = !this.cornerSpeed && safe && !p.drifting && !dir && p.s > 20 && error < .22 && Math.abs(p.lat) < track.halfW * .65 && upcoming < .0045;
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

/**
 * Classic control intents are separate from native keyboard edges. Pointer
 * release keeps a short tap queued until a real physics step consumes it;
 * pointercancel discards the pending action instead of synthesizing a tap.
 */
export class TouchActions {
  constructor() { this.pointers = new Map(); this.pending = new Set(); }
  press(id, action) {
    if (!['drift', 'small', 'nitro', 'item'].includes(action)) return;
    if (!this.isHeld(action)) this.pending.add(action);
    this.pointers.set(id, action);
  }
  release(id) { this.pointers.delete(id); }
  cancel(id) {
    const action = this.pointers.get(id);
    if (!action) return;
    this.pointers.delete(id);
    if (!this.isHeld(action)) this.pending.delete(action);
  }
  isHeld(action) { for (const held of this.pointers.values()) if (held === action) return true; return false; }
  consume(action, canStep = true) {
    if (!canStep || !this.pending.has(action)) return false;
    this.pending.delete(action);
    return true;
  }
  clear() { this.pointers.clear(); this.pending.clear(); }
}

/** Manual mode preserves full analog player steering; acceleration is automatic.
 * If a player spins backwards, apply native brake/crawl until steering is viable.
 * We never alter coordinates, yaw or give free boosts: only native control inputs. */
export class ManualRaceDriver {
  constructor(actions = new TouchActions()) { this.actions = actions; this.startedPlayers = new WeakSet(); }
  frame(raw, player, state, { canStep = true, itemMode = false, track = null } = {}) {
    if (state !== 'race' || !player || player.finished) { this.actions.clear(); return empty(); }
    const axis = Number.isFinite(raw.steerAxis) ? Math.max(-1, Math.min(1, raw.steerAxis)) : null;
    const input = {
      ...empty(), up: true,
      left: axis === null ? !!raw.left : axis > 0.12,
      right: axis === null ? !!raw.right : axis < -0.12,
      shift: this.actions.isHeld('drift'),
    };
    if (axis !== null) input.steerAxis = axis;
    // Spinning at full throttle is not meaningful difficulty when there is no
    // brake button. Slow down, let the player countersteer, then creep forward.
    if (track && !player.airborne && player.spin <= 0 && player.wrongWay > 0.35) {
      const heading = player.proj?.hd ?? track.hd?.[player.hint];
      const error = Number.isFinite(heading) ? Math.abs(wrap(player.h - heading)) : 0;
      if (error > 1.65) {
        input.up = player.s < 4;
        input.down = player.s > 6;
      }
    }
    if (canStep && !this.startedPlayers.has(player)) {
      input.upPressed = true; this.startedPlayers.add(player);
    }
    input.wPressed = this.actions.consume('small', canStep);
    input.nitroPressed = this.actions.consume(itemMode ? 'item' : 'nitro', canStep);
    // In item races the native nitroPressed is the item-use key. Do not steal
    // drift-earned nitro: a separate, one-shot edge consumes earned stock only.
    input.manualNitroPressed = itemMode && this.actions.consume('nitro', canStep);
    return input;
  }
}
