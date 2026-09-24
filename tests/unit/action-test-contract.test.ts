import { describe, expect, it, vi } from 'vitest';
import {
  validateActionTestApiShape,
  validateActionTrace,
  type ActionTestApi,
  type ActionTrace,
} from '../../src/qa/action-test-contract.js';

const snapshot = {
  tick: 12,
  status: 'playing' as const,
  inputHeld: true,
  player: { x: 120, y: 320, vx: 8, vy: -3 },
  anchors: [{ id: 'anchor-1', x: 160, y: 180 }],
  attachedAnchorId: 'anchor-1',
  ropeLength: 150,
  maxSpeed: 16,
  finishX: 1_200,
  failY: 900,
  eventSeq: 2,
};

function validApi(): ActionTestApi {
  return {
    contractVersion: 1,
    getManifest: () => ({
      slot: 'B',
      fixedStepSeconds: 1 / 60,
      courseFixtureHash: 'sha256:fixture-123',
      anchorPolicy: 'direction-weighted-nearest',
    }),
    resetGame: () => snapshot,
    getState: () => snapshot,
    act: () => undefined,
    advanceTicks: () => snapshot,
    loadScenario: () => snapshot,
    getEvents: () => [],
  };
}

describe('action prototype browser test contract', () => {
  it('accepts a version 1 API exposing the deterministic action-test surface', () => {
    const api = validApi();

    expect(validateActionTestApiShape(api)).toBe(api);
  });

  it('rejects an unsupported contract version', () => {
    const api = { ...validApi(), contractVersion: 2 };

    expect(() => validateActionTestApiShape(api)).toThrow(/contractVersion/i);
  });

  it('rejects a missing required command', () => {
    const api: Partial<ActionTestApi> = { ...validApi() };
    delete api.advanceTicks;

    expect(() => validateActionTestApiShape(api)).toThrow(/advanceTicks/i);
  });

  it('validates the manifest returned by getManifest', () => {
    const api = validApi();
    api.getManifest = vi.fn(() => ({
      slot: 'D' as 'A',
      fixedStepSeconds: 0,
      courseFixtureHash: '',
      anchorPolicy: '',
    }));

    expect(() => validateActionTestApiShape(api)).toThrow();
    expect(api.getManifest).toHaveBeenCalledOnce();
  });
});

describe('validateActionTrace', () => {
  const validTrace: ActionTrace = {
    snapshots: [snapshot, { ...snapshot, tick: 13, eventSeq: 4 }],
    events: [
      { seq: 3, tick: 12, type: 'input-held', source: 'test' },
      { seq: 4, tick: 12, type: 'anchor-attached', source: 'simulation' },
      { seq: 5, tick: 13, type: 'input-released', source: 'test' },
    ],
  };

  it('accepts valid snapshots and an ordered event stream', () => {
    expect(validateActionTrace(validTrace)).toEqual(validTrace);
  });

  it('rejects event sequence numbers that do not strictly increase', () => {
    const trace = {
      ...validTrace,
      events: [
        { seq: 3, tick: 12, type: 'input-held', source: 'test' },
        { seq: 3, tick: 13, type: 'input-released', source: 'test' },
      ],
    };

    expect(() => validateActionTrace(trace)).toThrow(/sequence.*increase/i);
  });

  it('rejects event ticks that move backwards', () => {
    const trace = {
      ...validTrace,
      events: [
        { seq: 3, tick: 12, type: 'input-held', source: 'test' },
        { seq: 4, tick: 11, type: 'input-released', source: 'test' },
      ],
    };

    expect(() => validateActionTrace(trace)).toThrow(/tick.*backwards/i);
  });

  it('rejects snapshots missing required deterministic physics fields', () => {
    const incompleteSnapshot: Partial<typeof snapshot> = { ...snapshot };
    delete incompleteSnapshot.maxSpeed;

    expect(() => validateActionTrace({ snapshots: [incompleteSnapshot], events: [] })).toThrow(/maxSpeed/i);
  });
});
