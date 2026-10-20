// Opt-in natural QA policy. Inputs are rendered minimap observations and the
// visible speed/button treatments, never native inventory, track or car state.
// The original steering-only baseline remains the default comparison policy.
export function visibleSteering(road) {
  if (road.direction === null || road.box || road.reason?.includes('recovery')) return road.direction;
  return Math.sign(road.angle) * Math.min(1, Math.abs(road.angle) * 3);
}

export class VisibleActionPolicy {
  constructor() {
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
    const ready = { small: hud.smallReady, nitro: hud.nitroReady && angle < .14 && hud.speedKmh > 120,
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
