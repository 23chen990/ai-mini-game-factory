// Racing has one touch scheme: analogue wheel steering, manual drifting,
// and explicit spray/nitro/item taps. The two-key auto-driver is deleted.
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const empty = () => ({
  up: false, down: false, left: false, right: false, shift: false,
  upPressed: false, wPressed: false, nitroPressed: false,
  swapPressed: false, resetPressed: false,
});

/**
 * Classic control intents are separate from native keyboard edges. Pointer
 * release keeps a short tap queued until a real physics step consumes it;
 * pointercancel discards the pending action instead of synthesizing a tap.
 */
export class TouchActions {
  constructor() { this.pointers = new Map(); this.pending = new Set(); this.pendingAt = new Map(); }
  // at is the native game-time in seconds, so a slow browser frame cannot
  // silently erase a player's tap before the corresponding physics step.
  press(id, action, at = 0) {
    if (!['drift', 'small', 'nitro', 'item'].includes(action)) return;
    if (!this.isHeld(action)) { this.pending.add(action); this.pendingAt.set(action, at); }
    this.pointers.set(id, action);
  }
  release(id) { this.pointers.delete(id); }
  cancel(id) {
    const action = this.pointers.get(id);
    if (!action) return;
    this.pointers.delete(id);
    if (!this.isHeld(action)) { this.pending.delete(action); this.pendingAt.delete(action); }
  }
  isHeld(action) { for (const held of this.pointers.values()) if (held === action) return true; return false; }
  expire(action, at, ttl = .26) {
    if (!this.pending.has(action)) return false;
    const since = this.pendingAt.get(action) ?? at;
    if (Number.isFinite(at) && at - since > ttl) {
      this.pending.delete(action); this.pendingAt.delete(action); return true;
    }
    return false;
  }
  consume(action, canStep = true) {
    if (!canStep || !this.pending.has(action)) return false;
    this.pending.delete(action); this.pendingAt.delete(action);
    return true;
  }
  clear() { this.pointers.clear(); this.pending.clear(); this.pendingAt.clear(); }
}

/** Desktop keeps native acceleration/steering; item races have distinct resource keys. */
export function keyboardRaceActions(raw,itemMode,nitro,item) {
  return itemMode?{...raw,nitroPressed:item,manualNitroPressed:nitro}:raw;
}

/** Manual mode preserves full analog player steering; acceleration is automatic.
 * If a player spins backwards, apply native brake/crawl until steering is viable.
 * We never alter coordinates, yaw or give free boosts: only native control inputs. */
export class ManualRaceDriver {
  constructor(actions = new TouchActions()) { this.actions = actions; this.startedPlayers = new WeakSet(); }
  frame(raw, player, state, { canStep = true, itemMode = false, track = null, now = 0 } = {}) {
    if (state !== 'race' || !player || player.finished) { this.actions.clear(); return empty(); }
    const axis = Number.isFinite(raw.steerAxis) ? Math.max(-1, Math.min(1, raw.steerAxis)) : null;
    // A <1-render-frame drift press can otherwise disappear: unlike spray/
    // nitro, drift used to read ONLY the currently held pointer. Consume the
    // pending real tap on the next PHYSICS step, never on a render-only frame.
    // A pointercancel removes the pending tap, and stale inputs expire.
    this.actions.expire('drift', now, .22);
    const driftEdge = this.actions.consume('drift', canStep);
    const input = {
      ...empty(), up: true,
      left: axis === null ? !!raw.left : axis > 0.12,
      right: axis === null ? !!raw.right : axis < -0.12,
      shift: this.actions.isHeld('drift') || driftEdge,
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
    // A spray tap just before the drift ends is buffered for at most 260ms of
    // game time. Too-early presses expire; do not give free automatic sprays.
    this.actions.expire('small', now);
    input.wPressed = player.drifting && !(player.smallWindow > 0) ? false : this.actions.consume('small', canStep);
    input.nitroPressed = this.actions.consume(itemMode ? 'item' : 'nitro', canStep);
    // In item races the native nitroPressed is the item-use key. Do not steal
    // drift-earned nitro: a separate, one-shot edge consumes earned stock only.
    input.manualNitroPressed = itemMode && this.actions.consume('nitro', canStep);
    return input;
  }
}
