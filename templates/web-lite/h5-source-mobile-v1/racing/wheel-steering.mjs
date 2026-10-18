/**
 * Single production mobile steering control: rotate a visible wheel around its
 * centre. Angle deltas, not horizontal touch distance, determine native steering.
 * This intentionally has no auto-steer, hidden traction, or free drift assistance.
 */
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const SENSITIVITY = Object.freeze({ calm: 0.86, normal: 1, sharp: 1.18 });
const DEG = Math.PI / 180;

export class RaceWheelSteering {
  constructor({ fullTurnDegrees = 58, hubDeadzone = 0.24, sensitivity = 'normal' } = {}) {
    this.maxTurn = clamp(fullTurnDegrees, 38, 100) * DEG;
    this.hubDeadzone = clamp(hubDeadzone, 0.12, 0.4);
    this.sensitivity = Object.hasOwn(SENSITIVITY, sensitivity) ? sensitivity : 'normal';
    this.clear();
  }

  get active() { return this.pointerId !== null; }
  snapshot() { return this.axis; }

  setSensitivity(value) {
    this.sensitivity = Object.hasOwn(SENSITIVITY, value) ? value : 'normal';
    this.sync();
  }

  press(pointerId, x, y, centerX, centerY, radius) {
    if (this.active || ![x, y, centerX, centerY, radius].every(Number.isFinite) || radius <= 0) return false;
    this.pointerId = pointerId;
    this.centerX = centerX;
    this.centerY = centerY;
    this.radius = radius;
    this.lastAngle = null;
    this.turn = 0;
    this.sync();
    this.update(pointerId, x, y);
    return true;
  }

  update(pointerId, x, y) {
    if (this.pointerId !== pointerId || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    const dx = x - this.centerX, dy = y - this.centerY;
    // A swipe over the hub cannot cause a phantom 180-degree wheel rotation.
    if (Math.hypot(dx, dy) < this.radius * this.hubDeadzone) {
      this.lastAngle = null;
      return true;
    }
    const nextAngle = Math.atan2(dy, dx);
    if (this.lastAngle !== null) {
      // Shortest signed arc also handles crossing the -PI / PI seam.
      const difference = Math.atan2(Math.sin(nextAngle - this.lastAngle), Math.cos(nextAngle - this.lastAngle));
      this.turn = clamp(this.turn + difference, -this.maxTurn, this.maxTurn);
    }
    this.lastAngle = nextAngle;
    this.sync();
    return true;
  }

  release(pointerId) {
    if (this.pointerId !== pointerId) return false;
    this.clear(); // Native steering is zero immediately; only the ART springs back.
    return true;
  }

  sync() {
    // Tiny thumb tremors should not keep the car turning after real centring.
    const target = Math.abs(this.turn) < 2 * DEG ? 0 : this.turn;
    this.axis = target === 0 ? 0 : clamp(-target / this.maxTurn * SENSITIVITY[this.sensitivity], -1, 1);
    this.visualDegrees = this.turn / DEG;
  }

  clear() {
    this.pointerId = null;
    this.centerX = 0;
    this.centerY = 0;
    this.radius = 1;
    this.lastAngle = null;
    this.turn = 0;
    this.axis = 0;
    this.visualDegrees = 0;
  }
}
