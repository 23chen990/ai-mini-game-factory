export const normalizeRaceQuality = value => ['low', 'mid', 'high'].includes(value) ? value : 'mid';
export const raceReady = game => !!(game?.track && game.input && !game.loading);
/** Never begin or charge fuel for a stage if its physical track failed to load. */
export const stageTrackReady = (game, stage) => !!(game?.track && !game.loading && game.map?.id === stage?.map);
export function clearNativeInput(input) {
  input.down.clear(); input.pressed.clear(); input.touchPressed.clear();
  for (const key of Object.keys(input.touch)) input.touch[key] = false;
}
export function resultSummary(game) {
  const p = game.player, distance = game.track.length * game.settings.laps;
  return {
    finished: !!p.finished, place: game.standings.indexOf(p) + 1,
    time: p.finished ? p.finishTime : null, map: game.settings.map,
    completion: Math.min(1, Math.max(0, p.progress / distance)),
    stats: { ...p.stats },
    rows: game.standings.map((r, i) => ({ place: i + 1, name: r.name, me: r === p, time: r.finished ? r.finishTime : null })),
  };
}
export function settleNative(game) {
  const result = resultSummary(game);
  if (game.state === 'race' || game.state === 'finish') game.togglePause();
  clearNativeInput(game.input ?? { down: new Set(), pressed: new Set(), touchPressed: new Set(), touch: {} });
  return result;
}
export const raceCameraFov = (speed, nitro, small) => Math.min(78, 66 + Math.abs(speed) * .055 + (nitro ? 4 : 0) + (small ? 2 : 0));
export const raceBloomStrength = nitro => nitro ? .4 : .3;
const tunedFx = new WeakSet();
export function tuneRaceFx(game) {
  if (!game.fx || tunedFx.has(game.fx)) return;
  tunedFx.add(game.fx);
  for (const kind of ['smoke', 'glow']) {
    const pool = game.fx[kind], nativeEmit = pool.emit.bind(pool);
    pool.emit = (...args) => {
      if (game.mobileMode) {
        args[7] *= .55;args[8] *= .55;
        args[12] *= kind === 'glow' ? .35 : .55;
      }
      return nativeEmit(...args);
    };
  }
}
export class QualityMonitor {
  constructor() { this.slow = 0; this.samples = 0; this.dropped = false; this.manual = false; }
  frame(dt, quality) {
    if (this.manual || this.dropped || quality === 'low') return null;
    this.samples++;
    this.slow = dt > .036 ? this.slow + Math.min(.05, dt) : Math.max(0, this.slow - dt * 2);
    if (this.samples >= 90 && this.slow >= 3) { this.dropped = true; return quality === 'high' ? 'mid' : 'low'; }
    return null;
  }
}
