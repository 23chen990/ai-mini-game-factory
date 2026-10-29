import { describe, expect, it } from 'vitest';
import { QA_BROWSER_TARGETS, assertQaBrowserPreflight, runQaBrowserPreflight } from '../../src/qa/browser-preflight.js';

describe('QA live browser preflight is not Agent Eval', () => {
  it('requires a real click and screenshot probe in all four browser/viewport cells', async () => {
    const visited: string[] = [];
    const report = await runQaBrowserPreflight({ probe: async (target) => {
      visited.push(`${target.engine}:${target.label}`);
      return 2_048;
    } });
    expect(visited).toEqual(['chromium:mobile', 'chromium:desktop', 'webkit:mobile', 'webkit:desktop']);
    expect(report).toMatchObject({ schemaVersion: 1, ready: true, scope: 'HOST_BROWSER_SMOKE_ONLY' });
    expect(report.checks.every((item) => item.passed && item.screenshotBytes === 2_048)).toBe(true);
    expect(() => assertQaBrowserPreflight(report)).not.toThrow();
  });

  it('fails closed if a browser is missing, has no input, or returns no pixels', async () => {
    const report = await runQaBrowserPreflight({ probe: async (target) => {
      if (target.engine === 'webkit' && target.label === 'mobile') throw new Error('browser launch unavailable');
      if (target.engine === 'webkit' && target.label === 'desktop') return 0;
      return 1_024;
    } });
    expect(report.ready).toBe(false);
    expect(report.checks.filter((item) => !item.passed)).toHaveLength(2);
    expect(() => assertQaBrowserPreflight(report)).toThrow('QA_BROWSER_UNAVAILABLE');
  });

  it('does not treat a subset of passing viewports as full browser capability', async () => {
    const one = await runQaBrowserPreflight({ probe: async () => 4_096, targets: QA_BROWSER_TARGETS.slice(0, 1) });
    expect(one.ready).toBe(false);
    expect(() => assertQaBrowserPreflight(one)).toThrow('QA_BROWSER_UNAVAILABLE');
  });
});
