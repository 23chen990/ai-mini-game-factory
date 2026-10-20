import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { VisibleActionPolicy, reconcileTouchContacts } from '../racing-visible-actions.mjs';

const hud = (extra = {}) => ({ speedKmh: 180, drifting: false, smallReady: false,
  nitroReady: false, itemReady: false, ...extra });
const bend = { angle: .25, direction: 'left', wrongWay: false };
test('opt-in QA driver chooses a finite drift from visible bend and speed, then releases without telemetry or free rewards', () => {
  const p = new VisibleActionPolicy();
  assert.deepEqual(p.frame(bend, hud(), 10000), ['drift']);
  assert.deepEqual(p.frame(bend, hud({ drifting: true }), 10200), ['drift']);
  assert.deepEqual(p.frame(bend, hud({ drifting: true }), 10300), []);
  assert.deepEqual(p.frame(bend, hud(), 10500), [], 'cooldown, not auto repeated Shift');
  assert.deepEqual(p.frame({ ...bend, wrongWay: true }, hud(), 13000), []);
});
test('only visibly ready separate resource buttons produce taps, never assumed inventory', () => {
  const p = new VisibleActionPolicy(), straight = { angle: 0, direction: null, wrongWay: false };
  assert.deepEqual(p.frame(straight, hud(), 10000), []);
  assert.deepEqual(p.frame(straight, hud({ smallReady: true, nitroReady: true, itemReady: true }), 10040), ['small', 'nitro', 'item']);
  assert.deepEqual(p.frame(straight, hud({ smallReady: true, nitroReady: true, itemReady: true }), 10100), [], 'each tap releases before another edge');
});
test('countersteering releases held drift immediately instead of keeping the old turn alive', () => {
  const p = new VisibleActionPolicy();
  p.frame(bend, hud(), 10000);
  assert.deepEqual(p.frame({ ...bend, angle: -.3, direction: 'right' }, hud({ drifting: true }), 10090), []);
});
test('multitouch reconciliation lifts obsolete actions before adding new fingers and never lifts the wheel', () => {
  const wheel = { id: 1, x: 60, y: 150 }, drift = { id: 2, x: 300, y: 150 }, spray = { id: 3, x: 250, y: 150 };
  assert.deepEqual(reconcileTouchContacts([wheel, drift], [wheel, spray]), [
    { type: 'touchEnd', touchPoints: [wheel] },
    { type: 'touchStart', touchPoints: [wheel, spray] },
  ]);
  assert.deepEqual(reconcileTouchContacts([wheel], [wheel]), []);
  assert.deepEqual(reconcileTouchContacts([], [spray]), [{ type: 'touchStart', touchPoints: [spray] }]);
});
test('long natural campaigns wait explicitly for displayed real-time fuel recovery without modifying clocks or storage', async () => {
  const source = await readFile(new URL('../racing-career-qa.mjs', import.meta.url), 'utf8');
  assert.match(source, /RACE_QA_WAIT_FUEL === '1'/);
  assert.match(source, /fuelWaits\.push/);
  assert.match(source, /#race-fuel-box/);
  assert.match(source, /timeout: 310000/);
  assert.doesNotMatch(source, /page\.clock|Date\.now\s*=|fuel\.amount\s*=/);
});
test('lifecycle observer disables automation focus emulation before testing real window loss', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../../docs/lean-pilot/racing-internal-20261020/touch-lifecycle.mjs', import.meta.url), 'utf8');
  assert.match(source, /Emulation\.setFocusEmulationEnabled', \{ enabled: false \}/);
  assert.doesNotMatch(source, /dispatchEvent\(/);
});
test('analogue QA steering scales rendered road angle but preserves visible recovery and item decisions', async () => {
  const { visibleSteering } = await import('../racing-visible-actions.mjs');
  assert.equal(visibleSteering({ direction: 'left', angle: .12 }), .36);
  assert.equal(visibleSteering({ direction: 'right', angle: -.7 }), -1);
  assert.equal(visibleSteering({ direction: null, angle: .03 }), null);
  assert.equal(visibleSteering({ direction: 'right', angle: .15, box: {} }), 'right');
  assert.equal(visibleSteering({ direction: 'left', angle: -.9, reason: 'visible-arrow-spin-recovery' }), 'left');
});
