import test from 'node:test';
import assert from 'node:assert/strict';
import { itemBoxPolicy, earnedResumeOrigin, warningVisible } from '../racing-visible-policy.mjs';
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
