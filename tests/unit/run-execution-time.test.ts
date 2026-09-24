import { describe, expect, it } from 'vitest';
import { measureRunExecutionTime } from '../../src/core/run-execution-time.js';

const minute = 60_000;
const day = 24 * 60 * minute;
const origin = Date.parse('2026-09-01T00:00:00.000Z');

function iso(at: number): string {
  return new Date(at).toISOString();
}

function event(at: number, name: string, data: Record<string, unknown> = {}): string {
  return JSON.stringify({ at: iso(at), event: name, data });
}

function log(...lines: string[]): string {
  return `${lines.join('\n')}\n`;
}

describe('run execution time from authoritative factory events', () => {
  it('charges active intervals across a week-long pause without charging the pause', () => {
    const contents = log(
      event(origin, 'stage.started', { stage: 'BLUEPRINT' }),
      event(origin + 5 * minute, 'run.waiting', { stage: 'BLUEPRINT' }),
      event(origin + 7 * day, 'stage.started', { stage: 'FULL_BUILD' }),
      event(origin + 7 * day + 10 * minute, 'stage.completed', { stage: 'FULL_BUILD' }),
    );
    const measured = measureRunExecutionTime(contents, { status: 'completed', updatedAt: iso(origin + 7 * day + 11 * minute) }, origin + 7 * day + 11 * minute);
    expect(measured).toEqual({
      wallClockMinutes: 15,
      activeMs: 15 * minute,
      intervals: [
        { startMs: origin, endMs: origin + 5 * minute },
        { startMs: origin + 7 * day, endMs: origin + 7 * day + 10 * minute },
      ],
      source: 'factory-jsonl',
    });
  });

  it('closes a failed capacity stage and includes repeated stages without double-counting', () => {
    const contents = log(
      event(origin + 1 * minute, 'stage.started', { stage: 'FULL_BUILD', attempt: 1 }),
      event(origin + 3 * minute, 'stage.failed', { stage: 'FULL_BUILD' }),
      event(origin + 5 * minute, 'stage.started', { stage: 'FULL_BUILD', attempt: 2 }),
      event(origin + 8 * minute, 'stage.failed', { stage: 'FULL_BUILD' }),
    );
    const measured = measureRunExecutionTime(contents, { status: 'failed', updatedAt: iso(origin + 9 * minute) }, origin + 9 * minute);
    expect(measured?.activeMs).toBe(5 * minute);
    expect(measured?.intervals).toEqual([
      { startMs: origin + minute, endMs: origin + 3 * minute },
      { startMs: origin + 5 * minute, endMs: origin + 8 * minute },
    ]);
  });

  it('unions overlapping stage intervals and handles out-of-order records', () => {
    const contents = log(
      event(origin + 8 * minute, 'stage.completed', { stage: 'B' }),
      event(origin + 6 * minute, 'stage.started', { stage: 'B' }),
      event(origin + 1 * minute, 'stage.started', { stage: 'A' }),
      event(origin + 10 * minute, 'stage.completed', { stage: 'A' }),
    );
    const measured = measureRunExecutionTime(contents, { status: 'completed', updatedAt: iso(origin + 11 * minute) }, origin + 11 * minute);
    expect(measured?.intervals).toEqual([{ startMs: origin + minute, endMs: origin + 10 * minute }]);
    expect(measured?.activeMs).toBe(9 * minute);
  });

  it('bounds an open interval by now only while running', () => {
    const contents = log(event(origin + 2 * minute, 'stage.started', { stage: 'QA' }));
    expect(measureRunExecutionTime(contents, { status: 'running', updatedAt: iso(origin + 3 * minute) }, origin + 9 * minute)).toMatchObject({
      wallClockMinutes: 7,
      activeMs: 7 * minute,
      intervals: [{ startMs: origin + 2 * minute, endMs: origin + 9 * minute }],
    });
    expect(measureRunExecutionTime(contents, { status: 'waiting', updatedAt: iso(origin + 4 * minute) }, origin + 9 * minute)).toMatchObject({
      wallClockMinutes: 2,
      activeMs: 2 * minute,
      intervals: [{ startMs: origin + 2 * minute, endMs: origin + 4 * minute }],
    });
  });

  it('keeps completed intervals during later recovery/reprojection', () => {
    const contents = log(
      event(origin, 'stage.started', { stage: 'BLUEPRINT' }),
      event(origin + 4 * minute, 'stage.completed', { stage: 'BLUEPRINT' }),
      event(origin + 7 * day, 'run.reprojected', { stage: 'BLUEPRINT' }),
    );
    const measured = measureRunExecutionTime(contents, { status: 'completed', updatedAt: iso(origin + 7 * day + 2 * minute) }, origin + 7 * day + 2 * minute);
    expect(measured?.activeMs).toBe(4 * minute);
    expect(measured?.intervals).toEqual([{ startMs: origin, endMs: origin + 4 * minute }]);
  });

  it('ignores corrupt or non-authoritative records and returns undefined without a trustworthy start', () => {
    const contents = log(
      '{not-json',
      JSON.stringify({ at: 'not-a-time', event: 'stage.started', data: { stage: 'QA' } }),
      JSON.stringify({ at: iso(origin), event: 'run.created', data: {} }),
      JSON.stringify({ at: iso(origin + minute), event: 'stage.completed', data: { stage: 'QA' } }),
    );
    expect(measureRunExecutionTime(contents, { status: 'completed', updatedAt: iso(origin + 2 * minute) }, origin + 2 * minute)).toBeUndefined();
    expect(measureRunExecutionTime('', { status: 'completed', updatedAt: iso(origin) }, origin)).toBeUndefined();
  });
});
