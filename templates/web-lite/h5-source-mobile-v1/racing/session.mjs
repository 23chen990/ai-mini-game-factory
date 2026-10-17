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
/** V6.2 handset-first GPU budget; an explicit saved preference still wins. */
export const initialRaceQuality = (saved, touch) =>
  ['low','mid','high'].includes(saved) ? saved : touch ? 'low' : 'mid';
/** A narrow keyboard-controlled desktop window must not become a phone HUD. */
export function raceScreenProfile(width, height, {coarse = false, anyCoarse = false, touchPoints = 0} = {}) {
  const shortSide=Math.min(width,height);
  const naturalTouch=Boolean(coarse)||(Boolean(anyCoarse)&&touchPoints>0&&shortSide<=820);
  return naturalTouch?'touch':'desktop';
}
// Mobile-only chase composition: larger car, readable bend entry, stable boosts.
const PHONE_CAMERA=Object.freeze({dist:9.45,h:3.45,look:7.8,lookH:1.45});
const WIDE_PHONE_CAMERA=Object.freeze({dist:9.1,h:3.3,look:7.5,lookH:1.45});
export function racePhoneCamera(width,height) {
  return width/Math.max(1,height)>=2.17?WIDE_PHONE_CAMERA:PHONE_CAMERA;
}
/** Aim slightly into the actual road elevation on steep V9 descents/crests.
 * The road is read-only: never edit racing geometry, steering or checkpoints.
 * Off-road/airborne/fork-ambiguous states use the stable native camera. */
export function racePhoneLookOffset(track, player, lookMeters) {
  const proj=player?.proj;
  if(player?.airborne || typeof track?.sample!=='function' ||
     !Number.isFinite(player?.y) || !Number.isFinite(proj?.d) ||
     !Number.isFinite(lookMeters) || lookMeters<=0) return 0;
  if(Number.isFinite(proj.lat) && Math.abs(proj.lat) >
     (Number.isFinite(track.halfW) ? track.halfW+7 : 25)) return 0;
  const ahead=track.sample(proj.d+Math.max(12,lookMeters*2.5),{});
  const delta=ahead?.y-player.y;
  return Number.isFinite(delta) ? Math.max(-2.2,Math.min(2.2,delta*.35)) : 0;
}
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
export const raceCameraFov = (speed, nitro, small) => Math.min(69, 61.5 + Math.abs(speed) * .046 + (nitro ? 1.8 : 0) + (small ? .8 : 0));
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
    this.severeManualLag = 0;
  }
  frame(dt, quality) {
    if (!Number.isFinite(dt) || dt <= 0) return null;
    // A background-resume gap is not evidence of slow graphics. Repeated
    // >=250ms *visible* frames are: don't leave very slow phones on high.
    if (dt > .25) {
      this.fps = Math.max(1, Math.round(1 / dt));
      if (quality === 'low') return null;
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
    if (quality === 'low') return null;
    // Respect normal manual preference. Repeated near-14-FPS frames are a
    // safety exception: a still-picture racing game cannot steer reliably.
    // Only the CURRENT session is downgraded, never the stored preference.
    if (this.manual) {
      this.severeManualLag = dt>.06 ?
        this.severeManualLag + Math.min(dt,.12) :
        Math.max(0,this.severeManualLag-dt*2);
      if(this.severeManualLag<1.3)return null;
      this.severeManualLag=0;
      const lower=quality==='high'?'mid':'low';
      this.currentQuality=lower;this.dropped=true;
      return lower;
    }
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

/** UI paint is intentionally separate from the native simulation / input loop.
 * A 30 Hz readout is readable on phones without running heavy DOM work at 120 Hz.
 * Always redraw after tab clock discontinuities and on the first live frame. */
export function shouldRefreshRaceHud(nowMs, lastMs, intervalMs = 33) {
  return Number.isFinite(nowMs) &&
    (!Number.isFinite(lastMs) || nowMs < lastMs || nowMs - lastMs >= intervalMs);
}
