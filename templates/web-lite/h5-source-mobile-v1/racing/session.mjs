export function setRaceSound(audio, enabled) {
  if (!audio?.master?.gain) return false;
  const gain = audio.master.gain;
  const volume = enabled ? .8 : 0;
  if (typeof gain.setTargetAtTime === 'function' && Number.isFinite(audio.ctx?.currentTime)) {
    gain.setTargetAtTime(volume, audio.ctx.currentTime, .035);
  } else gain.value = volume;
  return true;
}
export const normalizeRaceQuality = value => ['low', 'mid', 'high'].includes(value) ? value : 'mid';
export const raceReady = game => !!(game?.track && game.input && !game.loading);
/** Never begin or charge fuel for a stage if its physical track failed to load. */
export const stageTrackReady = (game, stage) => !!(game?.track && !game.loading && game.map?.id === stage?.map && stage?.course && game.track.__RACE_COURSE_ID === stage.course && game.settings?.course === stage.course);
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
// Keep scene luminance stable across the frequent automatic boost cycles.
export const raceBloomStrength = () => .3;
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
/** Adaptive phone graphics: persistent 40-45 FPS is not smooth racing.
 * A short burst or a tab-resume gap must not downgrade quality. User-selected
 * quality remains authoritative; automatic quality can step high -> mid -> low. */
export class QualityMonitor {
  constructor() {
    this.slow = 0; this.samples = 0; this.dropped = false; this.manual = false;
    this.windowTime = 0; this.currentQuality = null; this.averageDt = 1 / 60; this.fps = 60;
    this.consecutiveStalls = 0;
  }
  frame(dt, quality) {
    if (!Number.isFinite(dt) || dt <= 0) return null;
    // A background-resume gap is not evidence of slow graphics. Repeated
    // >=250ms *visible* frames are: don't leave very slow phones on high.
    if (dt > .25) {
      this.fps = Math.max(1, Math.round(1 / dt));
      if (this.manual || quality === 'low') return null;
      this.consecutiveStalls++;
      if (this.consecutiveStalls < 4) return null;
      this.consecutiveStalls = 0;
      this.slow = 0; this.samples = 0; this.windowTime = 0;
      const lower = quality === 'high' ? 'mid' : 'low';
      this.currentQuality = lower; this.dropped = true;
      return lower;
    }
    this.consecutiveStalls = 0;
    this.averageDt = this.averageDt * .9 + dt * .1;
    this.fps = Math.round(Math.min(120, Math.max(1, 1 / this.averageDt)));
    if (this.manual || quality === 'low') return null;
    if (this.currentQuality !== quality) {
      this.currentQuality = quality;
      this.slow = 0; this.samples = 0; this.windowTime = 0;
    }
    this.samples++;
    this.windowTime += dt;
    // A genuinely sustained <~46 FPS trend, not an occasional dropped frame.
    this.slow = Math.max(0, this.slow + (dt > .0218 ? Math.min(.05, dt) : -dt * .85));
    if (this.samples < 55 || this.windowTime < 1.25 || this.slow < 1.10) return null;
    const lower = quality === 'high' ? 'mid' : 'low';
    this.currentQuality = lower;
    this.slow = 0; this.samples = 0; this.windowTime = 0; this.dropped = true;
    return lower;
  }
}
