/** The original ItemSystem remains authoritative: only decide when to press use. */
export const ITEM_LABELS = Object.freeze({ nitro: '氮气加速', shield: '防护盾', missile: '追踪导弹', magnet: '追击磁铁', banana: '香蕉皮' });
export function thinItemBoxes(system) {
  if (!system?.boxes || system.boxes.length < 15) return 0;
  const rows = [[0, 3], [1, 4], [0, 2], [1, 3]];
  const before = system.boxes.length;
  system.boxes = system.boxes.filter((box, index) => {
    const keep = rows[Math.floor(index / 5) % rows.length].includes(index % 5);
    if (!keep) system.group.remove(box.g);
    return keep;
  });
  return before - system.boxes.length;
}
export function itemDecision(game) {
  if (!game?.itemMode || game.state !== 'race' || !game.items || !game.player || game.player.finished) return false;
  const p = game.player, it = p.items?.[0], track = game.track;
  if (!it || p.spin > 0 || !track || p.s < 12) return false;
  const bend = Math.abs(track.curvAhead(p.d, 95));
  const ahead = game.racerAhead(p), gap = ahead?.progress - p.progress;
  switch (it) {
    case 'nitro': return p.s > 30 && bend < .006 && !p.drifting;
    case 'missile': return ahead && gap > 3 && gap < 180;
    case 'magnet': return ahead && gap > 4 && gap < 125;
    case 'shield': return game.missileWarn > 0 || game.racers.some(r => !r.isPlayer && r.progress < p.progress && p.progress - r.progress < 18 && r.items?.includes('missile'));
    case 'banana': return game.racers.some(r => !r.isPlayer && r.progress < p.progress && p.progress - r.progress < 55);
    default: return false;
  }
}
export class AutoItems {
  constructor() { this.reset(); }
  reset() { this.nextAt = 0; this.held = null; this.heldSince = 0; }
  frame(game, canStep = true) {
    if (!game || game.state !== 'race' || !game.player) return false;
    const p = game.player, item = p.items?.[0] ?? null;
    if (item !== this.held) { this.held = item; this.heldSince = game.raceTime; }
    if (!canStep || game.raceTime < this.nextAt || !item) return false;
    let useful = itemDecision(game);
    if (!useful && p.items.length > 1 && typeof game.items?.swap === 'function') {
      game.items.swap(p);
      useful = itemDecision(game);
      if (!useful) game.items.swap(p);
    }
    // Avoid permanent full-inventory deadlocks on later item challenges.
    if (!useful && p.items.length >= 2 && game.raceTime - this.heldSince >= 12) useful = true;
    if (!useful) return false;
    this.nextAt = game.raceTime + 1.25;this.held = null;
    return true;
  }
}
/** Resolve clean overtakes from real ranking, curvature, distance and collisions. */
export class OvertakeTracker {
  constructor() { this.reset(); }
  reset() {
    this.previous = null;this.lastAt = -1e5;this.lastCrashes = 0;this.passes = 0;
    this.gaps = new Map();this.lastCornerAt = -1e5;
  }
  frame(game) {
    if (!game?.player || game.state !== 'race' || !game.track) return false;
    const p = game.player, rank = game.standings.indexOf(p) + 1;
    const crash = p.stats?.crash ?? 0;
    // Overtakes on the short corner exit still count; straight-line pass minutes later does not.
    if (p.s >= 20 && Math.abs(game.track.curvAhead(p.d, 60)) >= .0025) this.lastCornerAt = game.raceTime;
    // Actual player-vs-rival distance crossing, not rank-only drops, AI removals, or teleportation.
    let crossed = false;
    for (const rival of game.racers ?? game.standings) {
      if (rival.isPlayer || !Number.isFinite(rival.progress) || !Number.isFinite(p.progress)) continue;
      const gap = rival.progress - p.progress;
      const previousGap = this.gaps.get(rival);
      if (previousGap > 0 && previousGap < 70 && gap <= 0 && gap >= -35) crossed = true;
      this.gaps.set(rival, gap);
    }
    const valid = crossed && this.previous !== null && this.previous > rank && rank >= 1 &&
      game.raceTime > 3 && game.raceTime - this.lastAt > 7 && crash === this.lastCrashes &&
      p.impact <= 4 && !p.airborne && p.s >= 24 &&
      game.raceTime - this.lastCornerAt <= 1.8;
    this.previous = rank;this.lastCrashes = crash;
    if (valid) { this.lastAt = game.raceTime;this.passes++; }
    return valid;
  }
}
export function awardCornerPass(game) {
  if (!game?.player || game.state !== 'race') return 'none';
  const p = game.player;
  if (game.itemMode && game.items && p.items.length < 2) {
    game.items.giveRandom(p, game.standings.indexOf(p) + 1, game.racers.length);
    return 'item';
  }
  if (!game.itemMode && p.slowTime <= 0 && p.spin <= 0 && p.smallBoost <= 0) {
    p.smallBoost = .45;
    p.smallBoostPower = Math.max(p.smallBoostPower, 11);
    return 'boost';
  }
  return 'none';
}
export function removeEliminatedAi(game, ai) {
  if (!ai || ai.isPlayer || !game.racers.includes(ai)) return false;
  const index = game.racers.indexOf(ai);
  game.racers.splice(index, 1);
  game.standings = game.standings.filter(r => r !== ai);
  game.scene.remove(ai.model);
  ai.model?.traverse?.(object => { if (object.material && !object.isSprite) object.material.dispose(); });
  return true;
}
