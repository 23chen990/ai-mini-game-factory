import { describe, expect, it } from 'vitest';
import type { QaReport } from '../../src/schemas/index.js';
import { sha256Text } from '../../src/core/files.js';
import { buildRepairHypothesis, decideRepairAttempt, type RepairAttempt } from '../../src/core/repair-policy.js';

function qaReport(id: string, evidence = `screenshots/${id}.png`): QaReport {
  return {
    schemaVersion: 1,
    passed: false,
    checks: [{ name: `check-${id}`, passed: false, evidence }],
    issues: [{ id, severity: 'error', message: `Observed failure ${id}`, evidence }],
    screenshots: [evidence],
    consoleLog: 'logs/console.log',
    testedAt: '2026-10-19T00:00:00.000Z',
  };
}

function completedAttempt(attempt: number, inputBuild: string, outputBuild: string, hypothesis: ReturnType<typeof buildRepairHypothesis>): RepairAttempt {
  return {
    attempt,
    status: 'completed',
    inputBuildHash: sha256Text(inputBuild),
    outputBuildHash: sha256Text(outputBuild),
    hypothesis,
    qaReportPath: hypothesis.qaReportPath,
    startedAt: '2026-10-19T00:00:00.000Z',
    finishedAt: '2026-10-19T00:01:00.000Z',
    summary: `Repair ${attempt}`,
    verification: ['test:passed'],
  };
}

describe('formal repair admission', () => {
  it('allows five distinct evidenced repairs within the production ceiling', () => {
    let previous: RepairAttempt | undefined;

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const hypothesis = buildRepairHypothesis(qaReport(`issue-${attempt}`), `artifacts/repair-history/qa-${attempt}.json`);
      expect(hypothesis.evidence).not.toHaveLength(0);
      expect(decideRepairAttempt({
        attempt,
        currentBuildHash: sha256Text(`build-${attempt - 1}`),
        hypothesis,
        ...(previous ? { previous } : {}),
      })).toEqual({ allowed: true, reason: 'distinct-evidence-backed-hypothesis' });
      previous = completedAttempt(attempt, `build-${attempt - 1}`, `build-${attempt}`, hypothesis);
    }
  });

  it('stops at a configured fix ceiling before the next provider call', () => {
    const hypothesis = buildRepairHypothesis(qaReport('issue-6'), 'artifacts/qa-report.json');
    expect(decideRepairAttempt({
      attempt: 6,
      maxFixAttempts: 5,
      currentBuildHash: sha256Text('build-5'),
      hypothesis,
      previous: completedAttempt(5, 'build-4', 'build-5', buildRepairHypothesis(qaReport('issue-5'), 'artifacts/qa-report.json')),
    })).toEqual({ allowed: false, reason: 'configured-fix-attempt-ceiling' });
    expect(decideRepairAttempt({
      attempt: 3,
      maxRepairLoops: 2,
      currentBuildHash: sha256Text('build-2'),
      hypothesis,
    })).toEqual({ allowed: false, reason: 'configured-repair-loop-ceiling' });
  });

  it('stops unchanged builds and repeated hypotheses before another provider call', () => {
    const hypothesis = buildRepairHypothesis(qaReport('issue-1'), 'artifacts/qa-report.json');
    const prior = completedAttempt(1, 'same-build', 'same-build', hypothesis);
    expect(decideRepairAttempt({ attempt: 2, currentBuildHash: sha256Text('same-build'), hypothesis, previous: prior })).toEqual({ allowed: false, reason: 'unchanged-build' });
    expect(decideRepairAttempt({
      attempt: 2,
      currentBuildHash: sha256Text('changed-build'),
      hypothesis,
      previous: completedAttempt(1, 'old-build', 'changed-build', hypothesis),
    })).toEqual({ allowed: false, reason: 'unchanged-hypothesis' });
  });

  it('does not treat a new screenshot path, measured value or capture time as a new repair hypothesis', () => {
    const first = buildRepairHypothesis(qaReport('same-defect', 'screenshots/first.png; overlap=3 at 2026-10-19T00:00:00Z'), 'artifacts/qa-1.json');
    const recaptured = buildRepairHypothesis(qaReport('same-defect', 'screenshots/second.png; overlap=4 at 2026-10-19T00:02:00Z'), 'artifacts/qa-2.json');
    expect(recaptured.qaReportSha256).not.toBe(first.qaReportSha256);
    expect(recaptured.id).toBe(first.id);
    expect(decideRepairAttempt({ attempt: 2, currentBuildHash: sha256Text('changed'), hypothesis: recaptured, previous: completedAttempt(1, 'before', 'changed', first) }).allowed).toBe(false);
  });

  it('requires failed QA evidence before creating a repair hypothesis', () => {
    expect(() => buildRepairHypothesis({ ...qaReport('unused'), checks: [{ name: 'pass', passed: true, evidence: 'ok' }], issues: [] }, 'artifacts/qa-report.json')).toThrow(/failed QA evidence/iu);
  });
});


describe('five-attempt production ceiling', () => {
  it('does not admit a sixth repair even with a larger configured budget', () => {
    const hypothesis = buildRepairHypothesis({ schemaVersion: 1, passed: false, checks: [{ name: 'core', passed: false, evidence: 'qa trace' }], issues: [], screenshots: [], consoleLog: 'logs/console.log', testedAt: new Date(0).toISOString() }, 'qa.json');
    for (const maxFixAttempts of [undefined, 10]) {
      expect(decideRepairAttempt({ attempt: 6, maxFixAttempts, currentBuildHash: 'a'.repeat(64), hypothesis })).toEqual({ allowed: false, reason: 'configured-fix-attempt-ceiling' });
    }
  });
});
