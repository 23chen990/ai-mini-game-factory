/** One-thumb, horizontal-only analog steering for landscape racing.
 * x left of centre = positive native steering; y does not accelerate or brake.
 * No auto-steer or hidden map knowledge: only the player's touch position.
 */
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const SENSITIVITIES = Object.freeze({ calm: 0.84, normal: 1, sharp: 1.18 });

export class RacingJoystick {
  constructor({ deadzone = 0.075, fullThrow = 0.66, sensitivity = 'normal', floating = false, rimTap = false } = {}) {
    this.deadzone = clamp(deadzone, 0, 0.3);
    this.fullThrow = clamp(fullThrow, this.deadzone + 0.15, 1);
    this.sensitivity = Object.hasOwn(SENSITIVITIES, sensitivity) ? sensitivity : 'normal';
    this.floating = !!floating;
    this.rimTap = !!rimTap && this.floating;
    this.clear();
  }
  setSensitivity(value) {
    this.sensitivity = Object.hasOwn(SENSITIVITIES, value) ? value : 'normal';
    if (this.pointerId !== null) this.update(this.pointerId, this.lastX);
  }
  press(id, clientX, centreX, radius) {
    if (this.pointerId !== null || !Number.isFinite(clientX) ||
        !Number.isFinite(centreX) || !Number.isFinite(radius) || radius <= 0) return false;
    this.pointerId = id;
    this.surfaceCentreX = centreX;
    // The visible wheel has LEFT/RIGHT arrows: a rim tap must turn now, not
    // silently do nothing until the thumb drags. A central thumb touch stays
    // neutral and uses the existing relative/floating motion for precision.
    // Touches outside the visible ring also stay relative (no surprise turn).
    const rimOffset = clientX - centreX;
    this.rimPressed = this.rimTap && Math.abs(rimOffset) >= radius * .34 &&
      Math.abs(rimOffset) <= radius * 1.05;
    this.centreX = this.floating && !this.rimPressed ? clientX : centreX;
    this.radius = radius;
    this.update(id, clientX);
    return true;
  }
  update(id, clientX) {
    if (id !== this.pointerId || !Number.isFinite(clientX)) return false;
    this.lastX = clientX;
    // Positive x is rightward on screen, negative axis is native right steering.
    // When the finger travels beyond full lock, re-base the virtual centre.
    // Otherwise an over-pulled thumb can need 100+ px of travel just to
    // countersteer -- precisely the "cannot steer back" mobile failure.
    let dx = clientX - this.centreX;
    const maxThrow = this.radius * this.fullThrow;
    if (this.floating && Math.abs(dx) > maxThrow) {
      this.centreX = clientX - Math.sign(dx) * maxThrow;
      dx = clientX - this.centreX;
    }
    const horizontal = clamp(dx / this.radius, -1, 1);
    const distance = Math.abs(horizontal);
    const travel = distance <= this.deadzone ? 0 :
      clamp((distance - this.deadzone) / (this.fullThrow - this.deadzone), 0, 1);
    // Faster initial response on real thumbs; small steering remains analogue.
    const response = this.floating ? 1 - Math.pow(1 - travel, 1.55) : travel;
    this.axis = travel === 0 ? 0 : -Math.sign(horizontal) * clamp(response * SENSITIVITIES[this.sensitivity], 0, 1);
    this.knobX = Math.sign(horizontal) * Math.min(distance / this.fullThrow, 1) * .55 * this.radius;
    this.anchorX = this.floating ?
      clamp(this.centreX - this.surfaceCentreX, -this.radius * .42, this.radius * .42) : 0;
    return true;
  }
  release(id) {
    if (id !== this.pointerId) return false;
    this.clear();
    return true;
  }
  clear() {
    this.pointerId = null;
    this.rimPressed = false;
    this.centreX = 0;
    this.surfaceCentreX = 0;
    this.anchorX = 0;
    this.radius = 1;
    this.lastX = 0;
    this.axis = 0;
    this.knobX = 0;
  }
  snapshot() { return this.axis; }
  get active() { return this.pointerId !== null; }
}
