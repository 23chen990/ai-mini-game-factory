// Frame-rate independent critically damped lane motion and soft chase-camera targets.
// Input changes the destination lane; this module restores physical follow-through.
export const FEEL = Object.freeze({
  laneFrequency: 14.5,
  leanRate: 9.5,
  steerRate: 12,
  yawRate: 13,
  cameraPositionRate: 3.8,
  cameraLookRate: 6.2,
  cameraHeightRate: 4,
});
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const smooth = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));

// Exact solution of x'' + 2*w*x' + w*w*(x - target) = 0 for fixed target.
// Keeps velocity continuous under rapid alternating taps, unlike positional easing.
export function springLane(position, velocity, target, dt, frequency = FEEL.laneFrequency) {
  if (!Number.isFinite(dt) || dt <= 0) return { position, velocity };
  const x = position - target;
  const k = velocity + frequency * x;
  const e = Math.exp(-frequency * dt);
  return {
    position: target + (x + k * dt) * e,
    velocity: (velocity - frequency * k * dt) * e,
  };
}

export function riderFeel(state, oldVelocity, dt) {
  // Use genuine acceleration, not a position derivative mislabeled as acceleration.
  const acc = clamp((state.laneV - oldVelocity) / Math.max(dt, 1 / 240), -38, 38);
  state.latAcc = smooth(state.latAcc ?? 0, acc, 10, dt);
  const wobble = Math.sin(state.elapsed * 2.2) * 0.007;
  const leanTarget = clamp(Math.atan(state.latAcc / 12) * 0.44 + state.laneV * 0.012, -0.22, 0.22) + wobble;
  const steerTarget = -clamp(state.latAcc * 0.008 + state.laneV * 0.014, -0.25, 0.25);
  const yawTarget = -clamp(Math.atan2(state.laneV, Math.max(state.speed, 6)), -0.20, 0.20);
  state.lean = smooth(state.lean ?? 0, leanTarget, FEEL.leanRate, dt);
  state.steer = smooth(state.steer ?? 0, steerTarget, FEEL.steerRate, dt);
  state.yaw = smooth(state.yaw ?? 0, yawTarget, FEEL.yawRate, dt);
}

// Camera position follows the *actual* lane, not the button's instantaneous laneIndex.
// Deliberately small anticipation: obstacles must remain readable on narrow screens.
export function cameraTarget(lane, lateralVelocity, jumpHeight, aspect, speed = 8) {
  const landscape = aspect > 1;
  const velocityBias = clamp(lateralVelocity * 0.032, -0.17, 0.17);
  const height = Math.min(0.16, Math.max(0, jumpHeight) * 0.16);
  return {
    position: [landscape ? -6.5 : -6.75, (landscape ? 3.55 : 3.62) + height, 0.2 + lane * 0.6 - velocityBias],
    look: [landscape ? 9.2 : 9.4, 0.92 + height * .42, lane * 0.56 + velocityBias],
    fov: clamp((landscape ? 51 : 52) + (speed - 8) * .22, 50, 54),
  };
}