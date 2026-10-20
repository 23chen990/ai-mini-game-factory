// Opt-in natural QA policy. Inputs are rendered minimap observations and the
// visible speed/button treatments, never native inventory, track or car state.
// The original steering-only baseline remains the default comparison policy.
export function visibleSteering(road, gain = 3) {
  if (road.direction === null || road.box || road.reason?.includes('recovery')) return road.direction;
  return Math.sign(road.angle) * Math.min(1, Math.abs(road.angle) * gain);
}

// Optional QA thumb controller, not a game driving assist. Smooth only the
// measured visible angle derivative; no physics, track or opponent state input.
export class VisibleWheelPolicy {
  constructor(gain = 3) {
    this.gain = gain;
    this.previous = null;
    this.rate = 0;
  }
  frame(road, now) {
    if (road.reason || road.box) {
      this.previous = null;
      this.rate = 0;
      return road.direction;
    }
    if (this.previous) {
      const dt = (now - this.previous.at) / 1000;
      const rate = (road.angle - this.previous.angle) / dt;
      this.rate += (rate - this.rate) * (1 - Math.exp(-dt / .18));
    }
    this.previous = { at: now, angle: road.angle };
    if (Math.abs(road.angle) < .025) return null;
    return Math.max(-1, Math.min(1, road.angle * this.gain + this.rate * .22));
  }
}

export class VisibleActionPolicy {
  constructor(timing = 'immediate') {
    this.timing = timing;
    this.driftUntil = 0;
    this.nextDrift = 0;
    this.driftDirection = null;
    this.lastTap = { small: -Infinity, nitro: -Infinity, item: -Infinity };
  }
  frame(road, hud, now) {
    const actions = [];
    const angle = Math.abs(road.angle);
    if (road.wrongWay || road.direction !== this.driftDirection) this.driftUntil = 0;
    if (now >= this.nextDrift && !hud.drifting && !road.wrongWay &&
        road.direction !== null && angle > .18 && angle < .48 && hud.speedKmh > 100) {
      this.driftDirection = road.direction;
      this.driftUntil = now + 280;
      this.nextDrift = now + 2200;
    }
    if (now < this.driftUntil) actions.push('drift');
    const ready = { small: hud.smallReady && (this.timing !== 'exit' || (!road.wrongWay && angle < .16)), nitro: hud.nitroReady && angle < .14 && hud.speedKmh > 120,
      item: hud.itemReady };
    for (const action of ['small', 'nitro', 'item']) {
      if (ready[action] && now - this.lastTap[action] >= 400) {
        actions.push(action);
        this.lastTap[action] = now;
      }
    }
    return actions;
  }
}

/** CDP requires a real lift/add sequence, not a move that invents a finger.
 * Keep the physical wheel pointer intact while right-hand buttons change. */
export function reconcileTouchContacts(previous, desired) {
  const nextIds = new Set(desired.map(p => p.id));
  const oldIds = new Set(previous.map(p => p.id));
  const retained = previous.filter(p => nextIds.has(p.id));
  const events = [];
  if (retained.length !== previous.length) events.push({ type: 'touchEnd', touchPoints: retained });
  if (desired.some(p => !oldIds.has(p.id))) events.push({ type: 'touchStart', touchPoints: desired });
  return events;
}
