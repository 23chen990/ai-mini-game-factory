import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QAAgent } from '../../src/agents/index.js';
import { WebLiteRuntimeAdapter } from '../../src/adapters/web-lite.js';
import { CompletionGateReportSchema } from '../../src/core/completion-gates.js';
import type { QAProvider } from '../../src/providers/interfaces.js';
import { QaReportSchema, type QaReport } from '../../src/schemas/index.js';

const validEvidence = {
  schemaVersion: 1, mode: 'STATE_COVERAGE', actions: ['observe-collision'],
  artifacts: ['logs/collision.json'], forbiddenOperations: ['provider-test-api-oracle'],
};
const baseReport = QaReportSchema.parse({
  schemaVersion: 1, passed: true,
  checks: [{ name: 'collision', passed: true, evidence: 'controlled collision observation' }],
  issues: [], screenshots: [], consoleLog: 'logs/console.log', testedAt: new Date(0).toISOString(),
  evidence: [validEvidence],
});
const issue = { id: 'collision', severity: 'error', message: 'collision observation failed', evidence: 'logs/collision.json' };

describe('QAAgent aggregate verdict', () => {
  let runRoot: string;
  beforeEach(async () => {
    runRoot = await mkdtemp(path.join(os.tmpdir(), 'factory-qa-aggregation-'));
    await mkdir(path.join(runRoot, 'artifacts'));
  });
  afterEach(async () => { await rm(runRoot, { recursive: true, force: true }); });

  async function runQa(raw: unknown) {
    const provider: QAProvider = {
      playtest: async () => raw,
      playtestTournament: async () => ({}),
      playtestActionMechanics: async () => ({}),
    };
    return new QAAgent(provider, new WebLiteRuntimeAdapter(process.cwd()))
      .run(path.join(runRoot, 'workspace/game'), runRoot, true);
  }

  async function expectNormalFlowVerdict(passed: boolean) {
    const completion = CompletionGateReportSchema.parse(JSON.parse(
      await readFile(path.join(runRoot, 'artifacts/completion-gates.json'), 'utf8'),
    ));
    expect(completion.gates.find((gate) => gate.id === 'normalFlow')).toMatchObject({ passed });
  }

  it.each([
    { name: 'a failed check', patch: { checks: [{ name: 'collision', passed: false, evidence: 'controlled collision observation' }] } },
    { name: 'an error issue', patch: { issues: [issue] } },
  ])('rejects provider success with $name and retains the failure details', async ({ patch }) => {
    // These contradictory inputs are accepted by the existing provider schema.
    const input = QaReportSchema.parse({ ...baseReport, ...patch });
    const report = await runQa(input);

    expect(report).toMatchObject({ ...input, passed: false });
    await expectNormalFlowVerdict(false);
  });

  it.each([false, true])('rejects evidence-normalization errors (also contains a valid row: %s)', async (includeValid) => {
    const malformed = { schemaVersion: 1, mode: 'NATURAL_E2E', actions: ['tap'], artifacts: [], forbiddenOperations: [] };
    const report = await runQa({
      ...baseReport, evidence: [...(includeValid ? [validEvidence] : []), malformed],
    });

    expect(report.passed).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ id: 'qa-evidence-normalization', severity: 'error' }));
    expect(report.evidence).toHaveLength(1);
    await expectNormalFlowVerdict(false);
  });

  it.each([
    { name: 'valid success', patch: {}, expected: true },
    { name: 'warning-only success', patch: { issues: [{ ...issue, severity: 'warning' }] }, expected: true },
    { name: 'provider failure without a failed detail', patch: { passed: false }, expected: false },
  ])('preserves $name', async ({ patch, expected }) => {
    const input: QaReport = QaReportSchema.parse({ ...baseReport, ...patch });
    const report = await runQa(input);

    expect(report).toEqual(input);
    await expectNormalFlowVerdict(expected);
  });
  it('does not let structural provider success override failed natural-player evidence', async () => {
    const report = await runQa({ ...baseReport, naturalFlow: {
      schemaVersion: 1, startedFromReset: true, actions: ['normal tap'], transitions: [], completion: 'none',
      replayObserved: false, forbiddenOperations: [], screenshots: [], passed: false,
      blockers: ['terminal-not-reached'], runner: 'trusted-qa-runner', observedAt: new Date(0).toISOString(),
    } });
    expect(report.passed).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ id: 'natural-flow', severity: 'error' }));
    await expectNormalFlowVerdict(false);
    const runtimeProduct = JSON.parse(await readFile(path.join(runRoot, 'artifacts/runtime-product-gates.json'), 'utf8'));
    expect(runtimeProduct.passed).toBe(false);
  });

});
