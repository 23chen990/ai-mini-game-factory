/** One-thumb, horizontal-only analog steering for landscape racing.
 * x left of centre = positive native steering; y does not accelerate or brake.
 * No auto-steer or hidden map knowledge: only the player's touch position.
 */
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const SENSITIVITIES = Object.freeze({ calm: 0.84, normal: 1, sharp: 1.18 });

export class RacingJoystick {
  constructor({ deadzone = 0.095, fullThrow = 0.76, sensitivity = 'normal' } = {}) {
    this.deadzone = clamp(deadzone, 0, 0.3);
    this.fullThrow = clamp(fullThrow, this.deadzone + 0.15, 1);
    this.sensitivity = sensitivity in SENSITIVITIES ? sensitivity : 'normal';
    this.clear();
  }
  setSensitivity(value) {
    this.sensitivity = value in SENSITIVITIES ? value : 'normal';
    if (this.pointerId !== null) this.update(this.pointerId, this.lastX);
  }
  press(id, clientX, centreX, radius) {
    if (this.pointerId !== null || !Number.isFinite(clientX) ||
        !Number.isFinite(centreX) || !Number.isFinite(radius) || radius <= 0) return false;
    this.pointerId = id;
    this.centreX = centreX;
    this.radius = radius;
    this.update(id, clientX);
    return true;
  }
  update(id, clientX) {
    if (id !== this.pointerId || !Number.isFinite(clientX)) return false;
    this.lastX = clientX;
    // Positive x is rightward on screen, negative axis is native right steering.
    const horizontal = clamp((clientX - this.centreX) / this.radius, -1, 1);
    const distance = Math.abs(horizontal);
    const travel = distance <= this.deadzone ? 0 :
      clamp((distance - this.deadzone) / (this.fullThrow - this.deadzone), 0, 1);
    this.axis = -Math.sign(horizontal) * clamp(travel * SENSITIVITIES[this.sensitivity], 0, 1);
    this.knobX = horizontal * 0.58 * this.radius;
    return true;
  }
  release(id) {
    if (id !== this.pointerId) return false;
    this.clear();
    return true;
  }
  clear() {
    this.pointerId = null;
    this.centreX = 0;
    this.radius = 1;
    this.lastX = 0;
    this.axis = 0;
    this.knobX = 0;
  }
  snapshot() { return this.axis; }
  get active() { return this.pointerId !== null; }
}
