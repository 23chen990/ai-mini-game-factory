import { describe, expect, it } from 'vitest';
import {
  countMissedFinishDetections,
  evaluateHookAttachments,
  hashActionTrace,
  measureMaxEventGap,
  measureReleaseKinematics,
  measureRetryFriction,
  type ActionTrace,
} from '../../src/qa/action-metrics.js';

const trace = (frames: ActionTrace['frames'], fixedStepMs = 16): ActionTrace => ({
  fixedStepMs,
  frames,
});

describe('action feel trace metrics', () => {
  it('reports worst velocity retention and largest wrapped angle change at release', () => {
    const result = measureReleaseKinematics(trace([
      { tick: 0, position: { x: 0, y: 0 }, velocity: { x: 3, y: 4 } },
      { tick: 1, position: { x: 3, y: 4 }, velocity: { x: 0, y: 5 }, input: 'release' },
      { tick: 2, position: { x: 3, y: 9 }, velocity: { x: -1, y: 0 } },
      { tick: 3, position: { x: 2, y: 9 }, velocity: { x: 0, y: -0.5 }, input: 'release' },
    ]));

    expect(result).toEqual({
      releaseCount: 2,
      minimumRetentionRatio: 0.5,
      maximumAngleChangeDegrees: 90,
    });
  });

  it('uses the shortest wrapped angle across the -180/180 boundary', () => {
    const degrees = (value: number) => value * Math.PI / 180;
    const result = measureReleaseKinematics(trace([
      { tick: 0, position: { x: 0, y: 0 }, velocity: { x: Math.cos(degrees(179)), y: Math.sin(degrees(179)) } },
      { tick: 1, position: { x: 1, y: 0 }, velocity: { x: Math.cos(degrees(-179)), y: Math.sin(degrees(-179)) }, input: 'release' },
    ]));

    expect(result.minimumRetentionRatio).toBeCloseTo(1);
    expect(result.maximumAngleChangeDegrees).toBeCloseTo(2);
  });

  it('does not invent a passing release measurement when no usable release exists', () => {
    expect(measureReleaseKinematics(trace([
      { tick: 0, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } },
      { tick: 1, position: { x: 0, y: 0 }, velocity: { x: 1, y: 0 }, input: 'release' },
    ]))).toEqual({ releaseCount: 0, minimumRetentionRatio: 0, maximumAngleChangeDegrees: 0 });
  });

  it('scores attachments against the declared policy and rejects a behind decoy', () => {
    const result = evaluateHookAttachments(trace([
      {
        tick: 0,
        position: { x: 0, y: 0 },
        velocity: { x: 10, y: 0 },
        hookAttachment: {
          selectedHookId: 'forward-intent',
          declaredPolicy: { eligibleHookIds: ['forward-intent'], intendedHookId: 'forward-intent' },
          candidates: [
            { hookId: 'forward-intent', behind: false },
            { hookId: 'near-decoy', behind: true },
          ],
        },
      },
      {
        tick: 1,
        position: { x: 1, y: 0 },
        velocity: { x: 10, y: 0 },
        hookAttachment: {
          selectedHookId: 'near-decoy',
          declaredPolicy: { eligibleHookIds: ['forward-intent'], intendedHookId: 'forward-intent' },
          candidates: [
            { hookId: 'forward-intent', behind: false },
            { hookId: 'near-decoy', behind: true },
          ],
        },
      },
      {
        tick: 2,
        position: { x: 2, y: 0 },
        velocity: { x: 10, y: 0 },
        hookAttachment: {
          selectedHookId: 'safe-alternate',
          declaredPolicy: { eligibleHookIds: ['safe-alternate'], intendedHookId: 'forward-intent' },
          candidates: [{ hookId: 'safe-alternate', behind: false }],
        },
      },
    ]));

    expect(result).toEqual({
      attachmentCount: 3,
      intentionalAttachments: 1,
      wrongAttachments: 1,
      behindDecoyAttachments: 1,
    });
  });

  it('measures the longest quiet interval from ticks and fixed step', () => {
    const result = measureMaxEventGap(trace([
      { tick: 0, position: { x: 0, y: 0 }, velocity: { x: 10, y: 0 }, riskBand: 'safe' },
      { tick: 1, position: { x: 1, y: 0 }, velocity: { x: 10.2, y: 0 }, input: 'press', riskBand: 'safe' },
      { tick: 4, position: { x: 4, y: 0 }, velocity: { x: 10.6, y: 0 }, riskBand: 'safe' },
      { tick: 7, position: { x: 7, y: 0 }, velocity: { x: 13, y: 0 }, riskBand: 'safe' },
      { tick: 9, position: { x: 9, y: 0 }, velocity: { x: 13, y: 0 }, riskBand: 'danger' },
      { tick: 10, position: { x: 10, y: 0 }, velocity: { x: 13, y: 0 }, terminal: 'won' },
    ], 20), { significantSpeedDelta: 2 });

    expect(result).toEqual({ ticks: 6, milliseconds: 120 });
  });

  it('treats hook, release, terminal and risk changes as events while including trace boundaries', () => {
    const result = measureMaxEventGap(trace([
      { tick: 2, position: { x: 0, y: 0 }, velocity: { x: 1, y: 0 }, riskBand: 0 },
      { tick: 5, position: { x: 1, y: 0 }, velocity: { x: 1, y: 0 }, hookAttachment: {
        selectedHookId: 'h1',
        declaredPolicy: { eligibleHookIds: ['h1'], intendedHookId: 'h1' },
        candidates: [{ hookId: 'h1', behind: false }],
      }, riskBand: 0 },
      { tick: 8, position: { x: 2, y: 0 }, velocity: { x: 1, y: 0 }, input: 'release', riskBand: 0 },
      { tick: 12, position: { x: 3, y: 0 }, velocity: { x: 1, y: 0 }, riskBand: 1 },
      { tick: 15, position: { x: 4, y: 0 }, velocity: { x: 1, y: 0 }, terminal: 'failed', riskBand: 1 },
      { tick: 20, position: { x: 5, y: 0 }, velocity: { x: 1, y: 0 }, riskBand: 1 },
    ], 10));

    expect(result).toEqual({ ticks: 5, milliseconds: 50 });
  });

  it('measures retry friction from each failure to the next retry input', () => {
    const result = measureRetryFriction(trace([
      { tick: 0, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } },
      { tick: 10, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, terminal: 'failed' },
      { tick: 12, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, input: 'press' },
      { tick: 14, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, input: 'retry' },
      { tick: 30, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, terminal: 'failed' },
      { tick: 33, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, input: 'retry' },
    ], 25));

    expect(result).toEqual({ attempts: 2, maximumTicks: 4, maximumMilliseconds: 100 });
  });

  it('does not report missing retry evidence as zero friction', () => {
    expect(measureRetryFriction(trace([
      { tick: 5, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, terminal: 'failed' },
    ]))).toEqual({ attempts: 0, maximumTicks: null, maximumMilliseconds: null });
  });

  it('counts an undetected high-speed finish crossing but not a detected or slow crossing', () => {
    const result = countMissedFinishDetections(trace([
      { tick: 0, position: { x: 5, y: 0 }, velocity: { x: 30, y: 0 } },
      { tick: 1, position: { x: 15, y: 0 }, velocity: { x: 30, y: 0 } },
      { tick: 2, position: { x: 5, y: 0 }, velocity: { x: 30, y: 0 } },
      { tick: 3, position: { x: 15, y: 0 }, velocity: { x: 30, y: 0 }, finishDetected: true },
      { tick: 4, position: { x: 5, y: 0 }, velocity: { x: 2, y: 0 } },
      { tick: 5, position: { x: 15, y: 0 }, velocity: { x: 2, y: 0 } },
    ]), { axis: 'x', coordinate: 10, direction: 'positive', minimumSpeed: 20 });

    expect(result).toEqual({ highSpeedCrossings: 2, missedDetections: 1 });
  });

  it('supports a negative-direction finish boundary exactly on the line', () => {
    const result = countMissedFinishDetections(trace([
      { tick: 0, position: { x: 0, y: 12 }, velocity: { x: 0, y: -25 } },
      { tick: 1, position: { x: 0, y: 10 }, velocity: { x: 0, y: -25 }, terminal: 'won' },
    ]), { axis: 'y', coordinate: 10, direction: 'negative', minimumSpeed: 20 });

    expect(result).toEqual({ highSpeedCrossings: 1, missedDetections: 0 });
  });

  it('creates a stable deterministic hash independent of object key insertion order', () => {
    const first = { fixedStepMs: 16, frames: [{ tick: 0, velocity: { x: 1, y: 2 }, position: { x: 3, y: 4 } }] } as ActionTrace;
    const reordered = { frames: [{ position: { y: 4, x: 3 }, velocity: { y: 2, x: 1 }, tick: 0 }], fixedStepMs: 16 } as ActionTrace;
    const changed = trace([{ tick: 0, position: { x: 3, y: 4 }, velocity: { x: 1, y: 2.01 } }]);

    expect(hashActionTrace(first)).toMatch(/^[0-9a-f]{16}$/);
    expect(hashActionTrace(first)).toBe(hashActionTrace(reordered));
    expect(hashActionTrace(changed)).not.toBe(hashActionTrace(first));
  });
});
