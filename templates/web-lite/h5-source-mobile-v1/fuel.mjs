/**
 * Small, dependency-free race fuel ledger. Inspired by observed racing-game
 * fuel loops; this is a fresh implementation, not extracted commercial code.
 */
export const FUEL_RULES = Object.freeze({
  max: 30,
  regenMs: 60_000,
  raceCost: 5,
  // Preserve the old incentive: a fully completed video funds two races.
  adGrant: 10,
  adCooldownMs: 30_000,
  firstAdAfterMs: 60_000,
  firstAdAfterRounds: 1,
  offerAtOrBelow: 15,
});

export const FUEL_KEY = 'h5-mobile:qq-speed:fuel:v1';
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const clock = (now) => integer(now) ? now : 0;

export function newFuelState(now = Date.now()) {
  return { version: 2, amount: FUEL_RULES.max, updatedAt: clock(now), lastAdAt: 0, lastAdId: '' };
}

/** No time-based catch-up at full capacity, no regeneration in a backward clock. */
export function syncFuel(state, now = Date.now()) {
  const t = clock(now);
  // A clock rollback never earns fuel or shifts the original recharge/cooldown anchors.
  // Otherwise moving the clock backwards and forwards would grant free refills.
  if (t < state.updatedAt || (state.lastAdAt > 0 && t < state.lastAdAt))
    return state;
  if (state.amount >= FUEL_RULES.max) return state;
  const earned = Math.floor((t - state.updatedAt) / FUEL_RULES.regenMs);
  if (earned < 1) return state;
  const amount = Math.min(FUEL_RULES.max, state.amount + earned);
  return { ...state, amount, updatedAt: amount === FUEL_RULES.max ? t : state.updatedAt + earned * FUEL_RULES.regenMs };
}

/** Spend only after the native race has successfully entered its start path. */
export function spendRaceFuel(state, now = Date.now()) {
  const t = clock(now), s = syncFuel(state, t);
  if (s.amount < FUEL_RULES.raceCost) return { ok: false, state: s };
  return {
    ok: true,
    state: { ...s, amount: s.amount - FUEL_RULES.raceCost,
      // Spending from a full tank starts a recharge window, but never in the past.
      updatedAt: s.amount === FUEL_RULES.max ? Math.max(t, s.updatedAt) : s.updatedAt },
  };
}

export function fuelTimeLeft(state, now = Date.now()) {
  const s = syncFuel(state, now);
  if (s.amount >= FUEL_RULES.max) return 0;
  return Math.max(0, Math.min(FUEL_RULES.regenMs, FUEL_RULES.regenMs - (clock(now) - s.updatedAt)));
}

/** Ad reward is opt-in and once per completed attempt. No ad receipt is trusted. */
export function grantAdvertFuel(state, resultStatus, attemptId, now = Date.now()) {
  const t = clock(now), s = syncFuel(state, t);
  if (resultStatus !== 'completed' || typeof attemptId !== 'string' || attemptId.length < 8 || attemptId.length > 128 ||
    attemptId === s.lastAdId || s.amount >= FUEL_RULES.max ||
    (s.lastAdAt > 0 && t - s.lastAdAt < FUEL_RULES.adCooldownMs)) return { ok: false, state: s };
  const amount = Math.min(FUEL_RULES.max, s.amount + FUEL_RULES.adGrant);
  return { ok: true, state: { ...s, amount, lastAdAt: t, lastAdId: attemptId,
    updatedAt: amount === FUEL_RULES.max ? t : s.updatedAt } };
}

/** Prevent first-session ads, excessive offers and offers without an ad slot. */
export function fuelAdEligible(state, { rounds = 0, sessionMs = 0, adReady = false, now = Date.now() } = {}) {
  const s = syncFuel(state, now);
  return adReady === true && rounds >= FUEL_RULES.firstAdAfterRounds &&
    sessionMs >= FUEL_RULES.firstAdAfterMs &&
    s.amount < FUEL_RULES.max && s.amount <= FUEL_RULES.offerAtOrBelow &&
    (s.lastAdAt === 0 || clock(now) - s.lastAdAt >= FUEL_RULES.adCooldownMs);
}

export function fuelPlatformReady(config, tap) {
  return config?.status === 1 && config?.source === 'check_ads_status' && !!config.appId &&
    [0, 1].includes(config.screenOrientation) && typeof config.spaceId === 'string' && !!config.spaceId &&
    typeof tap?.createRewardedVideoAd === 'function';
}

export function loadFuel(raw, now = Date.now()) {
  try {
    if (typeof raw !== 'string' || raw.length > 700) return null;
    const s = JSON.parse(raw);
    const legacy=s?.version===1,modern=s?.version===2;
    if ((!legacy && !modern) || !integer(s.amount) ||
      s.amount > (legacy ? 10 : FUEL_RULES.max) ||
      !integer(s.updatedAt) || !integer(s.lastAdAt) ||
      typeof s.lastAdId !== 'string' || s.lastAdId.length > 128) return null;
    // Existing fuel is not wiped by an update: 10/10 becomes 30/30;
    // an old 4/10 becomes 12/30. Keep recharge/ad cooldown timestamps.
    const upgraded=legacy?{...s,version:2,amount:s.amount*3}:s;
    return syncFuel(upgraded,now);
  } catch { return null; }
}

export function saveFuel(state) { return JSON.stringify(state); }
