/**
 * Evidence of actual fork-driving choices in the native mobile race.
 * Does not modify car position, checkpoint progress, speed, AI, rewards or UI.
 * Native Track.project owns __RACE_SHORTCUT_ACTIVE; this class only reads it.
 */
const finite = value => typeof value === 'number' && Number.isFinite(value);
const validFork = branch => branch && typeof branch.course === 'string' &&
  finite(branch.length) && branch.length >= 75 &&
  finite(branch.gain) && branch.gain > 0 &&
  finite(branch.end) && finite(branch.start) &&
  branch.end > branch.start;
const mod = (n,base) => ((n % base) + base) % base;
const arcDistance = (a,b,length) => {
  if (!finite(a) || !finite(length) || length <= 0) return Infinity;
  return Math.abs(mod(a - b + length / 2,length) - length / 2);
};
export class ShortcutDecisionTracker {
  constructor() { this.reset(); }
  reset() {
    this.course = null;
    this.entries = 0;
    this.completed = 0;
    this.aborted = 0;
    this.geometricSavingMeters = 0;
    this.active = null;
    this.lastExitProgress = null;
    this.lastTime = null;
  }
  frame(game) {
    if (game?.state !== 'race' || !game.player ||
      !finite(game.raceTime)) return null;
    const route = game.track?.__RACE_SHORTCUT__;
    const p = game.player;
    if (!validFork(route) || !finite(game.track?.length) ||
      game.track.length <= route.end || !finite(p.progress) || !finite(p.d))
      return null;
    if (this.course === null) this.course = route.course;
    if (this.course !== route.course) return null;
    if (this.lastTime !== null && game.raceTime <= this.lastTime) return null;
    this.lastTime = game.raceTime;
    const projected = p.proj;
    const arc = projected?.__RACE_SHORTCUT_ARC;
    const onFork = projected?.__RACE_SHORTCUT_ACTIVE === true &&
      finite(arc) && arc >= 0 && arc <= route.length + 1;
    if (onFork) {
      if (!this.active) {
        // Native physics sometimes jitters at the main-road merge. Do not
        // count rapid re-projections as new intentional route choices.
        if (this.lastExitProgress !== null &&
          p.progress - this.lastExitProgress < 40) return null;
        this.active = { maxArc:arc, atProgress:p.progress };
        this.entries++;
        return { kind:'entered', course:route.course };
      }
      this.active.maxArc = Math.max(this.active.maxArc,arc);
      return null;
    }
    if (!this.active) return null;
    const completed = this.active.maxArc >= route.length - 28 &&
      arcDistance(p.d,route.end,game.track.length) <= 75 &&
      p.progress >= this.active.atProgress - 10;
    this.active = null;
    this.lastExitProgress = p.progress;
    if (completed) {
      this.completed++;
      // This is saved ROAD LENGTH, not net race seconds or an inferred win.
      this.geometricSavingMeters += route.gain;
    } else this.aborted++;
    return { kind:completed ? 'completed' : 'aborted',course:route.course };
  }
  finish() {
    if (this.active) { this.active = null; this.aborted++; }
    return this.snapshot();
  }
  snapshot() {
    return {
      available:this.course!==null,
      entries:this.entries,
      completed:this.completed,
      aborted:this.aborted,
      geometricSavingMeters:Math.round(this.geometricSavingMeters)
    };
  }
}
