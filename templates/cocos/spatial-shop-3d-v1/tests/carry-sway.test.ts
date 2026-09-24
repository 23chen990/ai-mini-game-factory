import { describe, expect, it } from 'vitest';
import { createCarrySwayState, stepCarrySway } from '../assets/scripts/core/carry-sway.js';

describe('carry sway', () => {
  it('keeps the camera-facing cutout inside the eight-degree presentation limit', () => {
    const state = stepCarrySway(createCarrySwayState(), { deltaSeconds: 1, lateralAcceleration: 100, turnRate: 100, stackIndex: 3, stackSize: 4 });
    expect(Math.abs(state.angleDegrees)).toBeLessThanOrEqual(8);
  });
});
