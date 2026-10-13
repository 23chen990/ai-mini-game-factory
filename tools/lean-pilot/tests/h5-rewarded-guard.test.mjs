import test from 'node:test';
import assert from 'node:assert/strict';
import { createRewardedGuard, firstSessionAdEligible } from '../h5-rewarded-guard.mjs';
const newGuard = (show, grant, eligible = () => true) => createRewardedGuard({ show, grant, eligible });
const offer = (requestId = 'run-1:double') => ({ requestId, reward: { coins: 20 } });

test('no ad in the first 60 seconds or before the first stage ends', () => {
  assert.equal(firstSessionAdEligible({ elapsedMs: 59_999, firstStageCompleted: true }), false);
  assert.equal(firstSessionAdEligible({ elapsedMs: 70_000, firstStageCompleted: false }), false);
  assert.equal(firstSessionAdEligible({ elapsedMs: 60_000, firstStageCompleted: true }), true);
  assert.equal(firstSessionAdEligible({ elapsedMs: NaN, firstStageCompleted: true }), false);
});
test('completed real ad grants exactly once', async () => {
  let grants = 0, views = 0;
  const guard = newGuard(async () => { views++; return true; }, async () => { grants++; });
  assert.deepEqual(await guard.offer(offer()), { status: 'GRANTED' });
  assert.deepEqual(await guard.offer(offer()), { status: 'ALREADY_CONSUMED' });
  assert.equal(grants, 1); assert.equal(views, 1);
});
test('cancelled and incomplete videos give no reward and can later retry', async () => {
  let grants = 0, count = 0;
  const guard = newGuard(async () => (++count === 1 ? false : true), async () => { grants++; });
  assert.equal((await guard.offer(offer())).status, 'NOT_COMPLETED');
  assert.equal(grants, 0);
  assert.equal((await guard.offer(offer())).status, 'GRANTED');
  assert.equal(grants, 1);
});
test('SDK rejection never locks gameplay or grants reward', async () => {
  let grants = 0;
  const guard = newGuard(async () => { throw new Error('no fill'); }, async () => { grants++; });
  assert.equal((await guard.offer(offer())).status, 'AD_UNAVAILABLE');
  assert.equal((await guard.offer(offer())).status, 'AD_UNAVAILABLE');
  assert.equal(grants, 0);
});
test('NOT_ELIGIBLE never calls the ad SDK', async () => {
  let views = 0;
  const guard = newGuard(async () => { views++; return true; }, async () => {}, () => false);
  assert.equal((await guard.offer(offer())).status, 'NOT_ELIGIBLE');
  assert.equal(views, 0);
});
test('SDK close result object is never mistaken for full completion', async () => {
  let grants = 0;
  const guard = newGuard(async () => ({ isEnded: true }), async () => { grants++; });
  assert.equal((await guard.offer(offer())).status, 'NOT_COMPLETED');
  assert.equal(grants, 0);
});
test('repeated taps while an ad is pending cannot open a second one', async () => {
  let resolve, views = 0, grants = 0;
  const guard = newGuard(() => { views++; return new Promise(r => { resolve = r; }); }, async () => { grants++; });
  const first = guard.offer(offer());
  assert.equal((await guard.offer(offer('run-1:revive'))).status, 'BUSY');
  resolve(true);
  assert.equal((await first).status, 'GRANTED');
  assert.equal(grants, 1); assert.equal(views, 1);
});
test('uncertain grant result never silently double-grants', async () => {
  let attempts = 0;
  const guard = newGuard(async () => true, async () => { attempts++; throw new Error('timeout after grant'); });
  assert.equal((await guard.offer(offer())).status, 'GRANT_UNCERTAIN_NEEDS_RECONCILIATION');
  assert.equal((await guard.offer(offer())).status, 'ALREADY_CONSUMED');
  assert.equal(attempts, 1);
});
test('invalid request ids are rejected', async () => {
  const guard = newGuard(async () => true, async () => {});
  assert.equal((await guard.offer({ requestId: '', reward: {} })).status, 'INVALID_REQUEST');
  assert.equal((await guard.offer({ requestId: 'x'.repeat(129), reward: {} })).status, 'INVALID_REQUEST');
});
