/* global URLSearchParams */
/**
 * INTERNAL QA ONLY — comparison controllers inspired by official published
 * GRID Autosport Wheel Touch / Arrow Touch and QQ Speed Mobile's steering
 * layout descriptions. These are purpose-built approximations, not copies
 * of the games' source or measured handling.
 *
 * Explicit query param + preview/local host is mandatory. Production gameplay
 * still uses the one existing mobile steering wheel; do not ship a mode picker.
 */
import { RacingJoystick } from './joystick.mjs';

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const sensitivity = Object.freeze({ calm: .84, normal: 1, sharp: 1.18 });
const allowed = new Set(['float', 'arrows', 'wheel']);
const qaHosts = new Set(['127.0.0.1', 'localhost', 'raw.githack.com']);

export function selectInternalRaceController(locationLike) {
  if (!locationLike || !qaHosts.has(String(locationLike.hostname || '').toLowerCase())) return null;
  const mode = new URLSearchParams(String(locationLike.search || '')).get('racing_qa_control');
  return allowed.has(mode) ? mode : null;
}

class QAController {
  constructor() { this.sensitivity = 'normal'; this.floating = false; this.rimPressed = false; this.clear(); }
  get active() { return this.pointerId !== null; }
  snapshot() { return this.axis; }
  setSensitivity(value) { this.sensitivity = Object.hasOwn(sensitivity, value) ? value : 'normal'; }
  release(id) { if (this.pointerId !== id) return false; this.clear(); return true; }
  clear() {
    this.pointerId = null; this.axis = 0; this.knobX = 0;
    this.anchorX = 0; this.visualDegrees = 0; this.lastX = 0;
  }
}

/** QQ Speed / GRID Arrow Touch analogue: discrete, immediate left/right
 * on a single left control zone. Manual drift and boost remain unchanged. */
export class RaceQAArrowSteering extends QAController {
  press(id, x, centerX, radius) {
    if (this.active || !Number.isFinite(x) || !Number.isFinite(centerX) ||
        !Number.isFinite(radius) || radius <= 0) return false;
    this.pointerId = id; this.centerX = centerX; this.radius = radius;
    return this.update(id, x);
  }
  update(id, x) {
    if (id !== this.pointerId || !Number.isFinite(x)) return false;
    this.lastX = x;
    const offset = x - this.centerX;
    this.axis = Math.abs(offset) < 3 ? 0 : offset < 0 ? 1 : -1;
    this.knobX = -this.axis * this.radius * .48;
    return true;
  }
}

/** GRID-style Wheel Touch analogue: steering is an actual ANGULAR motion
 * of the thumb around the hub, not left/right dragging of a circular slider.
 * A thumb starting near the centre is neutral until it reaches the rim. */
export class RaceQAWheelSteering extends QAController {
  constructor({ fullTurnDegrees = 65 } = {}) {
    super();
    this.maxAngle = clamp(fullTurnDegrees, 30, 135) * Math.PI / 180;
  }
  press(id, x, centerX, radius, y, centerY) {
    if (this.active || ![x,centerX,radius,y,centerY].every(Number.isFinite) || radius <= 0) return false;
    this.pointerId = id; this.centerX = centerX; this.centerY = centerY;
    this.radius = radius; this.turn = 0; this.lastAngle = null;
    this.update(id,x,y);
    return true;
  }
  update(id, x, y) {
    if (id !== this.pointerId || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    const dx=x-this.centerX,dy=y-this.centerY;
    this.lastX=x;
    if (Math.hypot(dx,dy)<this.radius*.24) {
      this.lastAngle=null; // don't inject a bogus half-turn across the hub
      return true;
    }
    const next=Math.atan2(dy,dx);
    if (this.lastAngle !== null) {
      const delta=Math.atan2(Math.sin(next-this.lastAngle),Math.cos(next-this.lastAngle));
      this.turn=clamp(this.turn+delta,-this.maxAngle,this.maxAngle);
    }
    this.lastAngle=next;
    this.visualDegrees=this.turn*180/Math.PI;
    this.axis=Math.abs(this.turn)<1e-9 ? 0 : clamp(-this.turn/this.maxAngle*sensitivity[this.sensitivity],-1,1);
    return true;
  }
  setSensitivity(value) {
    super.setSensitivity(value);
    if (this.active) this.axis=Math.abs(this.turn)<1e-9 ? 0 : clamp(-this.turn/this.maxAngle*sensitivity[this.sensitivity],-1,1);
  }
}

/** All three send the SAME signed native steerAxis to ManualRaceDriver.
 * This function must only be called for a URL-selected internal QA session. */
export function createInternalRaceController(mode) {
  if (mode==='float') return new RacingJoystick({
    floating:true,rimTap:true,deadzone:.055,fullThrow:.58
  });
  if (mode==='arrows') return new RaceQAArrowSteering();
  if (mode==='wheel') return new RaceQAWheelSteering();
  throw Error('Unknown internal racing QA controller: '+mode);
}

export const INTERNAL_RACE_CONTROL_LABELS=Object.freeze({
  float:'原浮动轮盘',arrows:'方向按键',wheel:'旋转方向盘'
});
