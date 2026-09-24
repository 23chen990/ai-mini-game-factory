import { describe, expect, it } from 'vitest';
import { QaReportSchema } from '../../src/schemas/index.js';

describe('QA evidence modes', () => {
  it('keeps oracle-assisted coverage distinct from natural player evidence', () => {
    const report = QaReportSchema.parse({
      schemaVersion: 1,
      passed: true,
      checks: [],
      issues: [],
      screenshots: [],
      consoleLog: 'logs/console.log',
      testedAt: new Date().toISOString(),
      evidence: [
        { schemaVersion: 1, mode: 'STATE_COVERAGE', actions: ['loadScenario:late-game'], artifacts: ['logs/state.json'], forbiddenOperations: ['loadScenario'] },
        { schemaVersion: 1, mode: 'NATURAL_E2E', actions: ['click:#produce'], artifacts: ['screenshots/natural.png'], forbiddenOperations: [] },
      ],
    });
    expect(report.evidence?.some((item) => item.mode === 'NATURAL_E2E')).toBe(true);
  });
});
