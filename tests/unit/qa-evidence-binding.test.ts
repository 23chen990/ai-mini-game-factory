import { describe, expect, it } from 'vitest';
import { bindNaturalFlowEvidence, bindQaEvidence, evaluateNaturalFlow } from '../../src/core/qa-evidence.js';

describe('trusted QA evidence binding', () => {
  it('preserves runner-observed devices and natural seeds rather than relabeling them with profile defaults', () => {
    const actual = { device: { width: 1280, height: 900, label: 'actual-browser' }, seed: 1 };
    const profile = { buildHash: 'a'.repeat(64), runtime: 'web-lite', device: { width: 390, height: 844, label: 'profile' }, seed: 42 };
    const result = bindQaEvidence([{ schemaVersion: 1, mode: 'NATURAL_E2E', actions: ['tap'], artifacts: ['capture.png'], forbiddenOperations: [], ...actual }], profile);
    expect(result[0]).toMatchObject(actual);
    const flow = { ...evaluateNaturalFlow({ startedFromReset: true, actions: ['tap'], transitions: [], completion: 'terminal', replayObserved: true, forbiddenOperations: [], screenshots: ['capture.png'] }), ...actual };
    expect(bindNaturalFlowEvidence(flow, profile)).toMatchObject(actual);
  });
  it('binds evidence to the tested build, runtime, device and seed', () => {
    const result = bindQaEvidence([
      { schemaVersion: 1, mode: 'NATURAL_E2E', actions: ['reset', 'tap'], artifacts: ['screenshots/start.png'], forbiddenOperations: [] },
    ], { buildHash: 'a'.repeat(64), runtime: 'web-lite', device: { width: 390, height: 844, label: 'baseline-phone' }, seed: 42 });
    expect(result[0]).toMatchObject({ buildHash: 'a'.repeat(64), runtime: 'web-lite', seed: 42, device: { width: 390 } });
  });
});
