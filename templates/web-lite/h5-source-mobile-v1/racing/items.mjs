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
    case 'shield': return game.missileWarn > 0 || game.racers.some(r => !r.isPlayer && r.progress < p.progress && p.progress - r.progress < 60);
    case 'banana': return game.racers.some(r => !r.isPlayer && r.progress < p.progress && p.progress - r.progress < 55);
    default: return false;
  }
}
export class AutoItems {
  constructor() { this.nextAt = 0; }
  reset() { this.nextAt = 0; }
  frame(game, canStep = true) {
    if (!canStep || !game || game.state !== 'race' || game.raceTime < this.nextAt) return false;
    if (!itemDecision(game)) return false;
    this.nextAt = game.raceTime + 1.25;
    return true;
  }
}
/** Resolve clean overtakes from real ranking, curvature, distance and collisions. */
export class OvertakeTracker {
  constructor() { this.reset(); }
  reset() { this.previous = null; this.lastAt = -1e5; this.lastCrashes = 0; this.passes = 0; }
  frame(game) {
    if (!game?.player || game.state !== 'race') return false;
    const p = game.player, rank = game.standings.indexOf(p) + 1;
    const crash = p.stats?.crash ?? 0;
    const valid = this.previous !== null && this.previous > rank && rank >= 1 &&
      game.raceTime > 3 && game.raceTime - this.lastAt > 7 && crash === this.lastCrashes &&
      p.impact <= 4 && !p.airborne && p.s >= 24 &&
      Math.abs(game.track.curvAhead(p.d, 60)) >= .0025;
    this.previous = rank; this.lastCrashes = crash;
    if (valid) { this.lastAt = game.raceTime; this.passes++; }
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
