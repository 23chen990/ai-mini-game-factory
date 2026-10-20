import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { requestRewardedVideo } from '../themes.mjs';

// External SDK fixtures only. None of these results represents a live TapTap ad.
const config = { status: 1, source: 'check_ads_status', appId: 'fixture-only', screenOrientation: 1, spaceId: 'fixture-only' };
function host(behavior) {
  const listeners = { close: new Set(), error: new Set() }; let shows = 0;
  const ad = {
    onClose: f => listeners.close.add(f), offClose: f => listeners.close.delete(f),
    onError: f => listeners.error.add(f), offError: f => listeners.error.delete(f),
    load: async () => { if (behavior === 'load-fail') throw Error('no-fill'); },
    show: async () => {
      shows++; if (behavior === 'show-fail') throw Error('show rejected');
      if (behavior === 'never-close') return;
      for (const f of [...listeners.close]) { f({ isEnded: behavior === 'complete' }); f({ isEnded: true }); }
    },
  };
  return { tap: { createRewardedVideoAd: () => ad }, listeners, shows: () => shows };
}
test('unverified H5 permission never creates an ad instance', async () => {
  let called = false;
  const result = await requestRewardedVideo({ tap: { createRewardedVideoAd: () => { called = true; } }, config: { status: 'PENDING' } });
  assert.equal(result.status, 'unavailable'); assert.equal(called, false);
});
test('isEnded true completes exactly once and removes handlers', async () => {
  const h = host('complete'); const r = await requestRewardedVideo({ ...h, config });
  assert.equal(r.status, 'completed'); assert.equal(h.shows(), 1);
  assert.equal(h.listeners.close.size, 0); assert.equal(h.listeners.error.size, 0);
});
test('cancel followed by a stale complete callback remains cancelled', async () => {
  const h = host('cancel'); const r = await requestRewardedVideo({ ...h, config });
  assert.equal(r.status, 'cancelled');
});
test('load or show failure restores play without a reward', async () => {
  for (const kind of ['load-fail', 'show-fail']) {
    const h = host(kind), r = await requestRewardedVideo({ ...h, config });
    assert.equal(r.status, 'failed'); assert.equal(h.listeners.close.size, 0);
  }
});
test('missing close is bounded and late completion is ignored', async () => {
  const h = host('never-close'); const r = await requestRewardedVideo({ ...h, config, closeTimeoutMs: 10 });
  assert.equal(r.status, 'timed-out'); assert.equal(h.listeners.close.size, 0);
});
test('double tap cannot start two concurrent ad shows', async () => {
  const h = host('never-close'); const first = requestRewardedVideo({ ...h, config, closeTimeoutMs: 20 });
  const second = await requestRewardedVideo({ ...h, config });
  assert.equal(second.status, 'busy'); await first; assert.equal(h.shows(), 1);
});

test('a timed-out singleton cannot attribute its late close to a second reward request', async () => {
  const h=host('never-close');
  assert.equal((await requestRewardedVideo({...h,config,closeTimeoutMs:5})).status,'timed-out');
  const second=requestRewardedVideo({...h,config,closeTimeoutMs:20});
  await delay(1);
  // TapTap documents a singleton. This is the old video closing through
  // the CURRENT listeners, not a saved pointer to the removed old handler.
  for(const callback of [...h.listeners.close])callback({isEnded:true});
  assert.equal((await second).status,'unavailable');
  assert.equal(h.shows(),1,'a provider with an uncorrelated timeout stays quarantined until reload');
});

test('verified TapTap H5 landscape metadata can request a rewarded video',async()=>{
  const h=host('complete');
  const result=await requestRewardedVideo({...h,config:{...config,screenOrientation:0}});
  assert.equal(result.status,'completed');assert.equal(h.shows(),1);
});
