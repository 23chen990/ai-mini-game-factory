import { describe, expect, it } from 'vitest';
import { bindQaEvidence } from '../../src/core/qa-evidence.js';

describe('trusted QA evidence binding', () => {
  it('binds evidence to the tested build, runtime, device and seed', () => {
    const result = bindQaEvidence([
      { schemaVersion: 1, mode: 'NATURAL_E2E', actions: ['reset', 'tap'], artifacts: ['screenshots/start.png'], forbiddenOperations: [] },
    ], { buildHash: 'a'.repeat(64), runtime: 'web-lite', device: { width: 390, height: 844, label: 'baseline-phone' }, seed: 42 });
    expect(result[0]).toMatchObject({ buildHash: 'a'.repeat(64), runtime: 'web-lite', seed: 42, device: { width: 390 } });
  });
});
