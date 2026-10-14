import test from 'node:test';
import assert from 'node:assert/strict';
import { itemBoxPolicy, earnedResumeOrigin, warningVisible, recoverVisibleHeading, qualifiedVisibleFinish } from '../racing-visible-policy.mjs';
function image(rectangles) {
  const width = 400, height = 200, data = new Uint8Array(width * height * 4);
  for (const [x0, y0, w, h, color] of rectangles) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) data.set(color, (y * width + x) * 4);
  return { width, height, data };
}
test('visible cyan cube chooses an ordinary steering direction; sky and HUD are excluded', () => {
  const sample = image([[250, 85, 12, 12, [90, 205, 255, 255]], [290, 5, 25, 25, [90, 205, 255, 255]], [80, 70, 50, 30, [211, 233, 252, 255]]]);
  assert.equal(itemBoxPolicy(sample).direction, 'right');
  assert.equal(itemBoxPolicy(image([[130, 85, 12, 12, [90, 205, 255, 255]]])).direction, 'left');
});
test('long blue rails and the car boost behind the player cannot act as boxes', () => {
  assert.equal(itemBoxPolicy(image([[80, 85, 180, 5, [90, 205, 255, 255]], [190, 120, 15, 30, [90, 205, 255, 255]]])), null);
});
test('resume binds the earned report to its exact origin and rejects invented progress', () => {
  const buildHash = 'a'.repeat(64), saved = '{"stars":{"01":2,"02":3,"03":2,"04":2,"05":3}}';
  const report = { buildHash, races: [{ stage: '06', saved, status: 'BLOCKED' }] };
  const origins = [{ origin: 'http://127.0.0.1:51817', localStorage: [{ name: 'h5-mobile:qq-speed:career:v1', value: '{"stars":{"01":2}}' }] },
    { origin: 'http://127.0.0.1:49559', localStorage: [{ name: 'h5-mobile:qq-speed:career:v1', value: saved }] }];
  assert.equal(earnedResumeOrigin(report, { origins }, buildHash), 'http://127.0.0.1:49559');
  assert.throws(() => earnedResumeOrigin(report, { origins }, 'b'.repeat(64)), /build/);
  assert.throws(() => earnedResumeOrigin(report, { origins: origins.slice(0, 1) }, buildHash), /exact/);
  assert.throws(() => earnedResumeOrigin(report, { origins: [origins[1], origins[1]] }, buildHash), /exact/);
});
test('wrong-way recovery ignores the text retained after the native warning becomes hidden', () => {
  const el = { textContent: '⚠ 方向错误！', hidden: false, classList: { contains: () => false }, getClientRects: () => [{}] };
  assert.equal(warningVisible(el), true);
  assert.equal(warningVisible({ ...el, classList: { contains: () => true } }), false);
  assert.equal(warningVisible({ ...el, getClientRects: () => [] }), false);
  assert.equal(warningVisible(null), false);
});
test('visible sudden arrow rotation keeps the pre-spin route and does not flip it again during a lingering warning', () => {
  const memory = {};
  recoverVisibleHeading({ direction: null, heading: [1, 0], target: [21, 0], wrongWay: false }, memory, 1000);
  const spin = recoverVisibleHeading({ direction: null, heading: [-1, 0], target: [-21, 0], wrongWay: false }, memory, 1100);
  assert.equal(spin.reason, 'visible-arrow-spin-recovery');
  assert.deepEqual(spin.recoveryTarget, [1, 0]);
  const aligned = recoverVisibleHeading({ direction: null, heading: [1, 0], target: [21, 0], wrongWay: true }, memory, 2500);
  assert.equal(aligned.direction, null);
  const lingering = recoverVisibleHeading({ direction: null, heading: [1, 0], target: [21, 0], wrongWay: true }, memory, 2600);
  assert.equal(lingering.direction, null);
  assert.equal(memory.recovery, null);
});
test('ordinary corner rotation is followed normally and opposite-heading jitter does not alternate recovery keys', () => {
  const memory = {};
  recoverVisibleHeading({ direction: 'left', heading: [1, 0], target: [21, 0], wrongWay: false }, memory, 1000);
  const corner = recoverVisibleHeading({ direction: 'left', heading: [.8, .6], target: [17, 12], wrongWay: false }, memory, 1300);
  assert.equal(corner.direction, 'left'); assert.equal(corner.reason, undefined);
  const first = recoverVisibleHeading({ direction: null, heading: [-.8, -.6], wrongWay: true }, memory, 1400);
  const jitter = recoverVisibleHeading({ direction: null, heading: [-.81, -.59], wrongWay: true }, memory, 1450);
  assert.equal(jitter.direction, first.direction);
});
test('old saved stars cannot turn a failed replay or AI finish into a natural victory', () => {
  assert.equal(qualifiedVisibleFinish({ finished: true, heading: '再试一次，争取过关' }, 3), false);
  assert.equal(qualifiedVisibleFinish({ finished: false, heading: '挑战成功！★' }, 3), false);
  assert.equal(qualifiedVisibleFinish({ finished: true, heading: '挑战成功！★★' }, 2), true);
});
test('a reversed arrow turns into the visible road rather than the outside barrier', () => {
  const memory = {};
  recoverVisibleHeading({ direction: null, heading: [1, 0], target: [21, 0], wrongWay: false }, memory, 1000);
  const recover = recoverVisibleHeading({ direction: null, heading: [-1, 0], wrongWay: true,
    roadPoints: [[-20, -4], [-20, -5], [20, -4], [20, -5]] }, memory, 1300);
  assert.equal(recover.direction, 'left');
  assert.ok(recover.recoveryTarget[0] > 0 && recover.recoveryTarget[1] < 0);
});
