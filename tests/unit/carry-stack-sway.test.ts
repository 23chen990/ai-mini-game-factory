import { describe, expect, it } from 'vitest';
import { createCarrySwayState, stepCarrySway } from '../../templates/cocos/spatial-shop-3d-v1/assets/scripts/core/carry-sway.js';

describe('hybrid 3D carry-stack sway', () => {
  it('lets higher product cutouts lag and sway more than lower ones', () => {
    const bottom = stepCarrySway(createCarrySwayState(), { deltaSeconds: 1 / 60, lateralAcceleration: 8, turnRate: 2, stackIndex: 0, stackSize: 4 });
    const top = stepCarrySway(createCarrySwayState(), { deltaSeconds: 1 / 60, lateralAcceleration: 8, turnRate: 2, stackIndex: 3, stackSize: 4 });

    expect(Math.abs(top.angleDegrees)).toBeGreaterThan(Math.abs(bottom.angleDegrees));
    expect(Math.abs(top.offset)).toBeGreaterThan(Math.abs(bottom.offset));
  });

  it('settles toward rest and never rotates far enough to reveal the billboard plane', () => {
    let state = createCarrySwayState({ angleDegrees: 8, angularVelocity: 2, offset: 0.15, offsetVelocity: 1 });
    for (let frame = 0; frame < 240; frame += 1) {
      state = stepCarrySway(state, { deltaSeconds: 1 / 60, lateralAcceleration: 0, turnRate: 0, stackIndex: 3, stackSize: 4 });
      expect(Math.abs(state.angleDegrees)).toBeLessThanOrEqual(8);
    }

    expect(Math.abs(state.angleDegrees)).toBeLessThan(0.1);
    expect(Math.abs(state.offset)).toBeLessThan(0.01);
  });
});
