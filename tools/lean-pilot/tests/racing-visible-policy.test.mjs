import test from 'node:test';
import assert from 'node:assert/strict';
import { itemBoxPolicy, earnedResumeOrigin, warningVisible, recoverVisibleHeading, qualifiedVisibleFinish, needsVisibleItemPickup, visibleItemSteer } from '../racing-visible-policy.mjs';
import * as visiblePolicy from '../racing-visible-policy.mjs';
function image(rectangles) {
  const width = 400, height = 200, data = new Uint8Array(width * height * 4);
  for (const [x0, y0, w, h, color] of rectangles) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) data.set(color, (y * width + x) * 4);
  return { width, height, data };
}
const question = (x, y) => [[x + 4, y + 2, 4, 4, [245, 245, 245, 255]], [x + 5, y + 9, 2, 2, [245, 245, 245, 255]]];
test('sparse blue window frames with detached white details are not a solid question cube', () => {
  const blue=[38,148,227,255];
  const sample=image([[250,85,20,1,blue],[250,96,20,1,blue],[250,85,1,12,blue],[269,85,1,12,blue],...question(255,85)]);
  assert.equal(itemBoxPolicy(sample),null);
});
test('visible cube lane changes tolerate modest road angle while sharp corners and recovery retain priority',()=>{
  const p={direction:'right',angle:.22},box={direction:'left',source:'visible-blue-question-cube-pixels'};
  assert.equal(visibleItemSteer(p,box).direction,'left');
  assert.equal(visibleItemSteer({...p,angle:.5},box).direction,'right');
  assert.equal(visibleItemSteer({...p,reason:'visible-arrow-spin-recovery'},box).direction,'right');
  assert.equal(visibleItemSteer(p,null).direction,'right');
});
test('box pursuit stops at the visible objective count without reading hidden pickup state', () => {
  assert.equal(needsVisibleItemPickup('已拾取道具 0/3'), true);
  assert.equal(needsVisibleItemPickup('已拾取道具 2/3'), true);
  assert.equal(needsVisibleItemPickup('已拾取道具 3/3'), false);
  assert.equal(needsVisibleItemPickup('已拾取道具 4/3'), false);
  assert.equal(needsVisibleItemPickup('弯道超车 2/2'), false);
});
test('visible cyan cube chooses an ordinary steering direction; sky and HUD are excluded', () => {
  const sample = image([[250, 85, 12, 12, [90, 205, 255, 255]], ...question(250,85), [290, 5, 25, 25, [90, 205, 255, 255]], [80, 70, 50, 30, [211, 233, 252, 255]]]);
  assert.equal(itemBoxPolicy(sample).direction, 'right');
  assert.equal(itemBoxPolicy(image([[130, 85, 12, 12, [90, 205, 255, 255]], ...question(130,85)])).direction, 'left');
});
test('long blue rails and the car boost behind the player cannot act as boxes', () => {
  assert.equal(itemBoxPolicy(image([[80, 85, 180, 5, [90, 205, 255, 255]], [190, 120, 15, 30, [90, 205, 255, 255]]])), null);
});
test('the shaded blue cube color remains visible without mistaking pale sky for an item', () => {
  assert.equal(itemBoxPolicy(image([[260, 92, 12, 12, [38, 148, 227, 255]], ...question(260,92)])).direction, 'right');
  assert.equal(itemBoxPolicy(image([[130, 92, 12, 12, [39, 118, 204, 255]], ...question(130,92)])).direction, 'left');
  assert.equal(itemBoxPolicy(image([[130, 92, 12, 12, [185, 215, 244, 255]]])), null);
});
test('blue windows or car panels without the actual white question hook and dot do not steer toward scenery', () => {
  assert.equal(itemBoxPolicy(image([[260, 92, 12, 12, [38, 148, 227, 255]]])), null);
  assert.equal(itemBoxPolicy(image([[260, 92, 12, 12, [38, 148, 227, 255]], [261, 96, 10, 2, [245,245,245,255]]])), null);
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
const currentFinish = () => ({
  stage: '01', course: 'race-01', phase: 'finished', map: 'city', laps: 2, diff: 1, mode: 'speed',
  finished: true, finishTime: 142.34, progress: 6363.81, place: 1, heading: '第 1 名',
  result: '第 1 名 · 02:22.34 · 最佳 02:22.34 · 累计 3 星',
  saved: JSON.stringify({ version: 1, rounds: 1, stars: { '01': 3 }, times: { '01': 142.34 } }),
});
const dailyStartWindow = (before = '2026-10-18T12:00:00Z', after = '2026-10-18T12:00:04Z', config = {}) => {
  const wallMs = Date.parse(before), afterMs = Date.parse(after), timeOrigin = wallMs - 1000;
  return { before: { wallMs, monotonicMs: 1000, timeOrigin, timezoneOffsetMinutes: 0 },
    after: { wallMs: afterMs, monotonicMs: 1000 + afterMs - wallMs, timeOrigin, timezoneOffsetMinutes: 0,
      nativeState: 'race', course: 'race-05', map: 'egypt', laps: 2, diff: 0, mode: 'item', ...config } };
};
test('current V11.5 first, second and third place titles require a real matching podium result and save', () => {
  for (const [place, stars] of [[1, 3], [2, 2], [3, 1]]) {
    const finish = { ...currentFinish(), place, heading: `第 ${place} 名`,
      result: `第 ${place} 名 · 02:22.34 · 最佳 02:22.34 · 累计 ${stars} 星`,
      saved: JSON.stringify({ version: 1, rounds: 1, stars: { '01': stars }, times: { '01': 142.34 } }) };
    assert.equal(qualifiedVisibleFinish(finish, stars), true, `place ${place}`);
  }
});
test('a genuine podium replay may retain a better historical medal and best time', () => {
  const finish = { ...currentFinish(), place: 2, heading: '第 2 名',
    result: '第 2 名 · 02:22.34 · 最佳 02:00.00 · 累计 3 星',
    saved: JSON.stringify({ version: 1, rounds: 2, stars: { '01': 3 }, times: { '01': 120 } }) };
  assert.equal(qualifiedVisibleFinish(finish, 3), true);
});
test('product result card binds the visible dedicated time and CURRENT stars to native finish',()=>{
  const finish={...currentFinish(),result:'进入前三 · 下一关已解锁',
    resultCard:{time:'02:22.34',stars:'本场 3 星 · 历史最高 3 星'}};
  assert.equal(qualifiedVisibleFinish(finish,3),true);
  assert.equal(qualifiedVisibleFinish({...finish,resultCard:{...finish.resultCard,time:'02:21.00'}},3),false);
  assert.equal(qualifiedVisibleFinish({...finish,resultCard:{...finish.resultCard,stars:'本场 0 星 · 历史最高 3 星'}},3),false);
  assert.equal(qualifiedVisibleFinish({...finish,place:5,heading:'第 5 名'},3),false);
});
test('old saved medals do not turn an unfinished player, fourth place or an active race into a victory', () => {
  const finish = currentFinish();
  assert.equal(qualifiedVisibleFinish({ ...finish, finished: false }, 3), false);
  assert.equal(qualifiedVisibleFinish({ ...finish, place: 4, heading: '第 4 名',
    result: '本次未进前三 · 第4名，要求前三名' }, 3), false);
  assert.equal(qualifiedVisibleFinish({ ...finish, phase: 'race' }, 3), false);
  assert.equal(qualifiedVisibleFinish({ ...finish, finishTime: 0 }, 3), false);
  assert.equal(qualifiedVisibleFinish({ ...finish, progress: 0 }, 3), false);
});
test('a current-looking title cannot pass with zero medals or inconsistent persisted medals', () => {
  const finish = currentFinish();
  assert.equal(qualifiedVisibleFinish(finish, 0), false);
  assert.equal(qualifiedVisibleFinish(finish, 2), false);
  assert.equal(qualifiedVisibleFinish({ ...finish, saved: JSON.stringify({ version: 1, rounds: 1,
    stars: { '01': 0 }, times: { '01': 142.34 } }) }, 3), false);
  assert.equal(qualifiedVisibleFinish({ ...finish, saved: JSON.stringify({ version: 1, rounds: 1,
    stars: { '01': 2 }, times: { '01': 142.34 } }) }, 2), false);
});
test('old or mismatched result text is not a current native podium settlement', () => {
  const finish = currentFinish();
  assert.equal(qualifiedVisibleFinish({ ...finish, heading: '挑战成功！★★★' }, 3), false);
  assert.equal(qualifiedVisibleFinish({ ...finish, heading: '第 2 名' }, 3), false);
  assert.equal(qualifiedVisibleFinish({ ...finish, result: '第 1 名 · 02:00.00 · 最佳 02:00.00 · 累计 3 星' }, 3), false);
  assert.equal(qualifiedVisibleFinish({ ...finish, result: '未完赛 · 尚未完成比赛（进度 46%）' }, 3), false);
});
test('another stage save or same-biome course cannot qualify the current race', () => {
  const finish = currentFinish();
  assert.equal(qualifiedVisibleFinish({ ...finish, saved: JSON.stringify({ version: 1, rounds: 1,
    stars: { '03': 3 }, times: { '03': 142.34 } }) }, 3), false);
  assert.equal(qualifiedVisibleFinish({ ...finish, course: 'race-03' }, 3), false);
  assert.equal(qualifiedVisibleFinish({ ...finish, stage: '03' }, 3), false);
  assert.equal(qualifiedVisibleFinish({ ...finish, laps: 1 }, 3), false);
  assert.equal(qualifiedVisibleFinish({ ...finish, mode: 'item' }, 3), false);
});
test('missing or malformed save evidence and unknown stages remain unqualified', () => {
  const finish = currentFinish();
  for (const saved of [undefined, '{', 'null', '{}', JSON.stringify({ version: 1, rounds: 0,
    stars: { '01': 3 }, times: { '01': 142.34 } })])
    assert.equal(qualifiedVisibleFinish({ ...finish, saved }, 3), false);
  assert.equal(qualifiedVisibleFinish({ ...finish, stage: 'unknown' }, 3), false);
  assert.equal(qualifiedVisibleFinish({ ...finish, saved: JSON.stringify({ version: 1, rounds: 1,
    stars: { '01': 3 }, times: { '01': 160 } }) }, 3), false);
});
test('daily podium evidence binds the played date, actual course and daily save independently of campaign stars', () => {
  const finish = { ...currentFinish(), stage: 'daily', raceDay: '2026-10-18', dailyStart: dailyStartWindow(), course: 'race-05',
    map: 'egypt', diff: 0, mode: 'item',
    result: '每日挑战成功 · 第 1 名 · 02:22.34 · 当日最佳 02:22.34 · 连续挑战 1 天',
    saved: JSON.stringify({ version: 1, rounds: 1, stars: {}, times: {},
      daily: { date: '2026-10-18', lastWonDate: '2026-10-18', stars: 3, best: 142.34 } }) };
  assert.equal(qualifiedVisibleFinish(finish, 3), true);
  assert.equal(qualifiedVisibleFinish({ ...finish, dailyStart: undefined }, 3), false);
  assert.equal(qualifiedVisibleFinish({ ...finish, raceDay: '2026-10-19' }, 3), false);
  assert.equal(qualifiedVisibleFinish({ ...finish, course: 'race-01' }, 3), false);
  assert.equal(qualifiedVisibleFinish({ ...finish, saved: currentFinish().saved }, 3), false);
  assert.equal(qualifiedVisibleFinish({ ...finish, saved: JSON.stringify({ version: 1, rounds: 1,
    daily: { date: '2026-10-18', lastWonDate: '2026-10-17', stars: 3, best: 142.34 } }) }, 3), false);
});
test('daily start dates come from the bounded start interval and actual course on either side of midnight', () => {
  const resolve = visiblePolicy.dailyRaceDayFromStart;
  assert.equal(resolve(dailyStartWindow()), '2026-10-18');
  const before = '2026-10-18T23:59:59.990Z', after = '2026-10-19T00:00:00.010Z';
  assert.equal(resolve(dailyStartWindow(before, after)), '2026-10-18');
  assert.equal(resolve(dailyStartWindow(before, after, { course: 'race-07', map: 'aegean', laps: 1, diff: 1, mode: 'speed' })), '2026-10-19');
  const local = dailyStartWindow('2026-10-17T16:00:01Z', '2026-10-17T16:00:05Z');
  local.before.timezoneOffsetMinutes = local.after.timezoneOffsetMinutes = -480;
  assert.equal(resolve(local), '2026-10-18', 'use the browser local date instead of the Node timezone');
});
test('a month boundary with the same daily course on both dates is ambiguous and must remain blocked', () => {
  const range = dailyStartWindow('2026-10-31T23:59:59.990Z', '2026-11-01T00:00:00.010Z',
    { course: 'race-03', map: 'city', laps: 2, diff: 1, mode: 'speed' });
  assert.equal(visiblePolicy.dailyRaceDayFromStart(range), null);
});
test('daily date evidence rejects wide intervals, clock jumps, changed documents or timezones and unmatched courses', () => {
  const resolve = visiblePolicy.dailyRaceDayFromStart, range = dailyStartWindow();
  assert.equal(resolve(dailyStartWindow('2026-10-18T12:00:00Z', '2026-10-18T12:03:00.001Z')), null);
  assert.equal(resolve({ ...range, after: { ...range.after, wallMs: range.after.wallMs + 5000 } }), null);
  assert.equal(resolve({ ...range, after: { ...range.after, timeOrigin: range.after.timeOrigin + 1 } }), null);
  assert.equal(resolve({ ...range, after: { ...range.after, timezoneOffsetMinutes: 60 } }), null);
  assert.equal(resolve({ ...range, after: { ...range.after, nativeState: 'menu' } }), null);
  assert.equal(resolve({ ...range, after: { ...range.after, course: 'race-01' } }), null);
  assert.equal(resolve(null), null);
});
test('a reversed arrow turns into the visible road rather than the outside barrier', () => {
  const memory = {};
  recoverVisibleHeading({ direction: null, heading: [1, 0], target: [21, 0], wrongWay: false }, memory, 1000);
  const recover = recoverVisibleHeading({ direction: null, heading: [-1, 0], wrongWay: true,
    roadPoints: [[-20, -4], [-20, -5], [20, -4], [20, -5]] }, memory, 1300);
  assert.equal(recover.direction, 'left');
  assert.ok(recover.recoveryTarget[0] > 0 && recover.recoveryTarget[1] < 0);
});
test('a late visible wrong-way warning overrides a stale backward route after an unseen spin', () => {
  const memory = {};
  recoverVisibleHeading({ direction: null, heading: [1, 0], target: [21, 0], wrongWay: false }, memory, 1000);
  recoverVisibleHeading({ direction: null, heading: [-1, 0], target: [-21, 0], wrongWay: false }, memory, 1600);
  const warning = recoverVisibleHeading({ direction: null, heading: [-1, 0], target: [-21, 0], wrongWay: true }, memory, 1800);
  assert.ok(warning.recoveryTarget[0] > 0);
  assert.ok(warning.direction);
});
test('if a recovery turn cannot leave the visible outside rail, normal input can try the opposite key', () => {
  const memory = {};
  const first = recoverVisibleHeading({ direction: null, heading: [-1, 0], wrongWay: true }, memory, 1000);
  const stalled = recoverVisibleHeading({ direction: null, heading: [-1, 0], wrongWay: true }, memory, 3800);
  assert.notEqual(stalled.direction, first.direction);
});
