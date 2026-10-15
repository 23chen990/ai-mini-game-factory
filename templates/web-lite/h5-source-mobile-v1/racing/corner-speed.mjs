/** Native two-button forward-speed assistance; returns an input intent only.
 * Pinned PlayerCar has no manual brake key on touch: its normal yaw ceiling is
 * TUNE.turnRate * (1 - .55 * speed / TUNE.vmax) at racing speed.
 * We never modify player state, invent a turn, or override a recovery U-turn.
 */
const TURN_RATE = 1.9;
const TURN_LOSS_PER_SPEED = TURN_RATE * .55 / 55;

export function speedForCurvature(curvature) {
  if (!Number.isFinite(curvature) || Math.abs(curvature) < .018) return 55;
  return Math.max(27, Math.min(53, TURN_RATE / (Math.abs(curvature) + TURN_LOSS_PER_SPEED)));
}

export function cornerSpeedIntent(player, track) {
  if (!player || !track || !Number.isFinite(player.s) || player.s < 27 ||
      !Number.isFinite(player.d) || player.drifting || player.airborne ||
      player.spin > 0 || player.wrongWay > .4 ||
      (player.impact ?? 0) > 5 || typeof track.curvAhead !== 'function') return null;
  const roadNow = Math.abs(track.curv?.[player.hint] ?? 0);
  const scout = track.curvAhead(player.d + Math.max(8, player.s * .22),
    Math.max(30, player.s * 1.15));
  if (!Number.isFinite(scout)) return null;
  const curvature = Math.max(roadNow, Math.abs(scout));
  if (curvature < .020) return null;
  const target = speedForCurvature(curvature);
  // Native engine handles real down/coast. No velocity or position edits.
  if (player.s > target + 5) return 'brake';
  if (player.s > target + .7) return 'coast';
  return null;
}
