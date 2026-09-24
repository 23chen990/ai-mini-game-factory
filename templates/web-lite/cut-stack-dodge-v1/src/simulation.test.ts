import { describe, expect, it } from 'vitest';
import { advanceFrame, createInitialState, tap, type CutStackLevelConfig } from './simulation.js';

const config: CutStackLevelConfig = {
  fixedStepSeconds: 1 / 60,
  gravity: 600,
  tapImpulse: -300,
  forwardSpeed: 240,
  angularImpulse: Math.PI * 2,
  failY: 700,
  finishX: 600,
  player: { x: 40, y: 300, radius: 14, angle: Math.PI / 2 },
  objects: [{ id: 'target', role: 'cuttable', x: 80, y: 250, width: 20, height: 100 }],
};

describe('cut-stack fixed-step core', () => {
  it('turns one tap into motion and a sharp-edge cut', () => {
    let state = tap(createInitialState(config));
    for (let index = 0; index < 20; index += 1) state = advanceFrame(config, state, 1 / 60);
    expect(state.player.x).toBeGreaterThan(config.player.x);
    expect(state.events.some((event) => event.type === 'cut')).toBe(true);
  });

  it('does not advance on a zero host-frame delta', () => {
    const state = tap(createInitialState(config));
    expect(advanceFrame(config, state, 0)).toEqual(state);
  });
});
