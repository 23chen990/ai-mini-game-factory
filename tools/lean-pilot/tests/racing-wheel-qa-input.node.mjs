/* global URL */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { actionTouchPoints, planWheelGesture } from '../racing-wheel-qa-input.mjs';

const wheel = { x: 10, y: 20, width: 200, height: 200 };
const center = { x: wheel.x + wheel.width / 2, y: wheel.y + wheel.height / 2 };
const actionRects = Object.fromEntries(['drift', 'small', 'nitro', 'item'].map((name, index) => [name, {
  x: 300 + index * 60,
  y: 240,
  width: 44,
  height: 44,
}]));

function wheelAngles(events) {
  return events.flatMap(event => event.type === 'touchMove' ? event.touchPoints : [])
    .filter(point => point.id === 1)
    .map(point => Math.atan2(point.y - center.y, point.x - center.x));
}

function assertOnRim(events) {
  for (const event of events) {
    for (const point of event.touchPoints.filter(({ id }) => id === 1)) {
      assert.ok(Math.hypot(point.x - center.x, point.y - center.y) > wheel.width * 0.35);
    }
  }
}

test('wheel touch starts at top, then moves along the rim to create steering rotation', () => {
  const plan = planWheelGesture('left', wheel, [], null);
  const start = plan.events[0].touchPoints[0];
  const move = plan.events[1].touchPoints[0];

  assert.equal(plan.events[0].type, 'touchStart');
  assert.equal(start.id, 1);
  assert.equal(start.x, center.x);
  assert.ok(start.y < center.y);
  assert.equal(plan.events[1].type, 'touchMove');
  assert.ok(move.x < center.x);
  assert.notDeepEqual([move.x, move.y], [start.x, start.y]);
  assertOnRim(plan.events);
});

test('wheel direction reverses by rotating around the rim instead of crossing the hub', () => {
  const left = planWheelGesture('left', wheel, [], null);
  const right = planWheelGesture('right', wheel, [], left.angle);
  const leftAgain = planWheelGesture('left', wheel, [], right.angle);
  const rightAngles = wheelAngles(right.events);
  const leftAngles = wheelAngles(leftAgain.events);

  assert.ok(rightAngles.every((angle, index) => index === 0 || angle > rightAngles[index - 1]));
  assert.ok(leftAngles.every((angle, index) => index === 0 || angle < leftAngles[index - 1]));
  assertOnRim([...right.events, ...leftAgain.events]);
});

test('neutral release ends only the wheel finger and preserves other active action fingers', () => {
  const actions = actionTouchPoints(['drift', 'nitro'], actionRects);
  const left = planWheelGesture('left', wheel, actions, null);
  const release = planWheelGesture(null, wheel, actions, left.angle);

  assert.equal(release.events[0].type, 'touchEnd');
  assert.deepEqual(release.events[0].touchPoints, actions);
  assert.equal(release.events[0].touchPoints.some(({ id }) => id === 1), false);
  assert.equal(release.angle, null);
});

test('wheel start and rotation preserve visible drift, small, nitro, and item touch ids', () => {
  const actions = actionTouchPoints(['drift', 'small', 'nitro', 'item'], actionRects);
  const plan = planWheelGesture('right', wheel, actions, null);

  assert.deepEqual(actions.map(({ id }) => id), [2, 3, 4, 5]);
  for (const event of plan.events) {
    assert.deepEqual(event.touchPoints.map(({ id }) => id), [1, 2, 3, 4, 5]);
  }
});

test('fresh career driver uses the visible rotary wheel, not removed left/right controls', async () => {
  const source = await readFile(new URL('../racing-career-qa.mjs', import.meta.url), 'utf8');

  assert.match(source, /#race-joystick/);
  assert.match(source, /planWheelGesture/);
  assert.doesNotMatch(source, /race-left|race-right/);
});

test('natural trace records exact native car identity for the observed settlement and replay branch', async () => {
  const source = await readFile(new URL('../racing-career-qa.mjs', import.meta.url), 'utf8');
  assert.match(source, /assetIdentity: r\.model\.userData\.assetIdentity/u);
  assert.match(source, /wheelAngles: full \? r\.model\.userData\.wheels\.map/u);
});

test('natural observer reads the current visible compact objective, not removed coaching DOM', async () => {
  const source = await readFile(new URL('../racing-career-qa.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /#race-live-goal/u);
  assert.match(source, /document\.querySelector\('#race-compact-goal'\)\.textContent/u);
});

test('one-stage loss captures normal replay evidence without promoting a failed campaign result', async () => {
  const source = await readFile(new URL('../racing-career-qa.mjs', import.meta.url), 'utf8');
  assert.match(source, /if \(race\.status !== 'PASS'\) \{\s*if \(terminal && count === 1\)/u);
  assert.match(source, /loss-replay\.png/u);
  assert.match(source, /races\.every\(r => r\.status === 'PASS' && r\.actionsFit\)/u);
});
