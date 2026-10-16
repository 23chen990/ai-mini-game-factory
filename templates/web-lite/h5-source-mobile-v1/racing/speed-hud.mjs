/** Read-only, frame-safe HUD. Native physics is authoritative. */
export function raceSpeedHUD(player) {
  const native = player?.speedKmh;
  const fallback = Math.abs(player?.s ?? 0)*3.6;
  const speed = Number.isFinite(native) ? native : Number.isFinite(fallback) ? fallback : 0;
  const slow = (player?.slowTime ?? 0) > 0;
  const label = (player?.nitroTime ?? 0) > 0 ? '氮气' :
    (player?.padTime ?? 0) > 0 ? '加速带' :
    (player?.smallBoost ?? 0) > 0 ? '小喷' :
    slow ? '减速中' : '';
  return {value:String(Math.round(Math.max(0,Math.min(999,Math.abs(speed))))),
    label,boost:!!label && !slow,slow};
}
