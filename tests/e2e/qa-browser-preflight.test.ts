import { describe, expect, it } from 'vitest';
import { assertQaBrowserPreflight, runQaBrowserPreflight } from '../../src/qa/browser-preflight.js';

describe('actual no-model QA host-browser capability', () => {
  it('launches, sends player-like input and captures pixels in Chromium/WebKit mobile and desktop', async () => {
    const report = await runQaBrowserPreflight();
    // This is only a tool readiness test, not a player-journey or defect-detection success.
    expect(report.scope).toBe('HOST_BROWSER_SMOKE_ONLY');
    expect(report.checks).toHaveLength(4);
    expect(report.checks.map((item) => ({ browser: item.engine, viewport: item.label, passed: item.passed, blocker: item.blocker })))
      .toEqual([
        { browser: 'chromium', viewport: 'mobile', passed: true, blocker: null },
        { browser: 'chromium', viewport: 'desktop', passed: true, blocker: null },
        { browser: 'webkit', viewport: 'mobile', passed: true, blocker: null },
        { browser: 'webkit', viewport: 'desktop', passed: true, blocker: null },
      ]);
    expect(() => assertQaBrowserPreflight(report)).not.toThrow();
  }, 60_000);
});
