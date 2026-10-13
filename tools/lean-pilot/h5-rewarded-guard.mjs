/**
 * Small browser-compatible IAA safety guard for direct H5 adaptations.
 * Not a TapTap SDK. The game must inject the actual H5 ad adapter.
 */
const validKey = value => typeof value === 'string' && value.length > 0 && value.length <= 128;

/** Conservative first-session ad policy: no ads in first 60 seconds OR first stage. */
export function firstSessionAdEligible({ elapsedMs, firstStageCompleted }) {
  return Number.isFinite(elapsedMs) && elapsedMs >= 60_000 && firstStageCompleted === true;
}

/**
 * The adapter's show() must resolve to true ONLY when the real SDK confirms
 * the full reward video completed. It must NOT resolve true on show/start/close.
 * grant() must apply rewards idempotently by the passed requestId where possible.
 */
export function createRewardedGuard({ show, grant, eligible }) {
  if (typeof show !== 'function' || typeof grant !== 'function' || typeof eligible !== 'function') {
    throw new TypeError('show, grant and eligible must be functions');
  }
  const consumed = new Set();
  let busy = false;

  async function offer({ requestId, reward }) {
    if (!validKey(requestId)) return { status: 'INVALID_REQUEST' };
    if (consumed.has(requestId)) return { status: 'ALREADY_CONSUMED' };
    if (busy) return { status: 'BUSY' };
    let allowed = false;
    try { allowed = eligible() === true; } catch { /* remain blocked */ }
    if (!allowed) return { status: 'NOT_ELIGIBLE' };
    busy = true;
    try {
      let completed;
      try { completed = await show(); }
      catch { return { status: 'AD_UNAVAILABLE' }; }
      if (completed !== true) return { status: 'NOT_COMPLETED' };
      // Lock before granting: even if grant partially succeeds and throws,
      // a second click cannot award the same request twice.
      consumed.add(requestId);
      try { await grant({ requestId, reward }); }
      catch { return { status: 'GRANT_UNCERTAIN_NEEDS_RECONCILIATION' }; }
      return { status: 'GRANTED' };
    } finally { busy = false; }
  }
  return { offer };
}
