/* global setTimeout, clearTimeout */
/** Small source-facing bridge, not a combat implementation. */
export function createFpsAdapter(game, doc) {
  return {
    start: () => { Object.assign(game.opts, { size: 4, goal: 30, diff: 'easy', quality: 'low' }); game.hud.syncControls(); doc.getElementById('btnStart').click(); },
    pause: () => { if (game.playing && !game.ended && !game.paused) game.pause(); },
    resume: () => game.resume(true),
    phase: () => game.ended ? 'finished' : game.paused ? 'paused' : game.playing ? 'running' : 'ready',
    score: () => game.player?.stats?.k || 0,
    clearInput: () => { const p = game.player; if (p) {
      p.keys.clear();
      p.pressed?.clear?.();
      p.mouse.l = false; p.mouse.r = false; p.mouse.lp = false; p.mouse.rp = false;
      p.mouse.dx = 0; p.mouse.dy = 0;
      p.touch.fire = false; p.touch.firePressed = false; p.touch.jump = false;
      p.touch.mx = 0; p.touch.mz = 0;
      if (p.touchLook) { p.touchLook.x = 0; p.touchLook.y = 0; }
    } }
  };
}
let adBusy = false;
/** Official H5 global tap only; no APK SDK, placeholder unit, or automatic activation. */
export function requestRewardedVideo({ tap, config, loadTimeoutMs = 8000, closeTimeoutMs = 180000 } = {}) {
  if (adBusy) return Promise.resolve({ status: 'busy' });
  if (config?.status !== 1 || config.source !== 'check_ads_status' || !config.appId ||
    config.screenOrientation !== 1 || typeof config.spaceId !== 'string' || !config.spaceId ||
    typeof tap?.createRewardedVideoAd !== 'function') return Promise.resolve({ status: 'unavailable' });
  adBusy = true;
  return new Promise(resolve => {
    let ad, finished = false, timer;
    const finish = status => {
      if (finished) return;
      finished = true; clearTimeout(timer); adBusy = false;
      ad?.offClose?.(closed); ad?.offError?.(errored);
      resolve({ status });
    };
    const closed = result => finish(result?.isEnded === true ? 'completed' : 'cancelled');
    const errored = () => finish('failed');
    try {
      ad = tap.createRewardedVideoAd({ adUnitId: config.spaceId });
      if (!ad || !['onClose', 'offClose', 'onError', 'offError', 'load', 'show'].every(k => typeof ad[k] === 'function')) { finish('failed'); return; }
      ad.onClose(closed); ad.onError(errored);
      timer = setTimeout(() => finish('timed-out'), loadTimeoutMs);
      Promise.resolve().then(() => ad.load()).then(() => {
        if (finished) return;
        clearTimeout(timer); timer = setTimeout(() => finish('timed-out'), closeTimeoutMs);
        return ad.show();
      }).catch(errored);
    } catch { finish('failed'); }
  });
}
