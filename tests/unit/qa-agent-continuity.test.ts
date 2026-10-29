import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QAAgent } from '../../src/agents/index.js';
import type { RuntimeAdapter } from '../../src/adapters/runtime.js';
import type { QAProvider } from '../../src/providers/interfaces.js';
import { InteractionContinuityReportSchema } from '../../src/schemas/interaction-continuity.js';
import { continuityFixture } from '../helpers/interaction-continuity.js';

describe('QAAgent run-owned continuity contract', () => {
  let runRoot: string;

  beforeEach(async () => {
    runRoot = await mkdtemp(path.join(os.tmpdir(), 'factory-qa-continuity-'));
    await mkdir(path.join(runRoot, 'artifacts'));
  });
  afterEach(async () => { await rm(runRoot, { recursive: true, force: true }); });

  async function declareContract(contract: unknown) {
    await writeFile(path.join(runRoot, 'artifacts/interaction-continuity-contract.json'), JSON.stringify(contract));
  }

  function runQa(extra: Record<string, unknown> = {}) {
    const provider: QAProvider = {
      playtest: async () => ({
        schemaVersion: 1, passed: true, checks: [], issues: [], screenshots: [],
        consoleLog: 'logs/console.log', testedAt: new Date(0).toISOString(), ...extra,
      }),
      playtestTournament: async () => ({}),
      playtestActionMechanics: async () => ({}),
    };
    return new QAAgent(provider, {} as RuntimeAdapter).run(path.join(runRoot, 'workspace/game'), runRoot, true);
  }

  it('blocks a stored contract that the provider omits instead of skipping it', async () => {
    const { contract } = continuityFixture();
    await declareContract(contract);

    const report = await runQa();

    expect(report.passed).toBe(false);
    expect(report.interactionContinuity).toMatchObject({
      contractId: contract.contractId, passed: false, blockers: ['observation:missing'],
    });
    expect(report.issues).toContainEqual(expect.objectContaining({ id: 'interaction-continuity', severity: 'error' }));
    const saved = InteractionContinuityReportSchema.parse(JSON.parse(await readFile(path.join(runRoot, 'artifacts/interaction-continuity-report.json'), 'utf8')));
    expect(saved).toEqual(report.interactionContinuity);
  });

  it('evaluates an independent observation against the stored contract without needing an echo', async () => {
    const { contract, observation } = continuityFixture();
    await declareContract(contract);

    const report = await runQa({ interactionContinuityObservation: observation });

    expect(report.passed).toBe(true);
    expect(report.interactionContinuity).toMatchObject({
      contractId: contract.contractId, passed: true, checkedScenarios: 3, checkedRepetitions: 1,
    });
  });

  it('does not allow a provider echo to weaken the stored repetition obligation', async () => {
    const { contract, observation } = continuityFixture();
    await declareContract(contract);
    const weaker = {
      ...contract, contractId: 'provider-weakened-continuity',
      actions: contract.actions.map((action) => ({ ...action, repetition: { attempts: 1, minimumSuccesses: 1 } })),
    };
    const report = await runQa({
      interactionContinuityContract: weaker,
      interactionContinuityObservation: { ...observation, repetitions: [{ actionId: 'primary', attempts: 1, successes: 1 }] },
    });

    expect(report.passed).toBe(false);
    expect(report.interactionContinuity?.contractId).toBe(contract.contractId);
    expect(report.interactionContinuity?.blockers).toEqual(expect.arrayContaining([
      'repetition:primary:attempts-below-minimum',
      'repetition:primary:minimum-successes-not-met',
    ]));
  });

  it('keeps legacy provider-only contract and observation support', async () => {
    const { contract, observation } = continuityFixture();
    const report = await runQa({ interactionContinuityContract: contract, interactionContinuityObservation: observation });
    expect(report.passed).toBe(true);
    expect(report.interactionContinuity?.passed).toBe(true);
  });

  it('accepts nested legacy observation fields against the run-owned contract', async () => {
    const { contract, observation } = continuityFixture();
    await declareContract(contract);
    const report = await runQa({ interactionContinuity: { observation } });
    expect(report.passed).toBe(true);
    expect(report.interactionContinuity?.contractId).toBe(contract.contractId);
  });

  it('does not invent continuity obligations in an undeclared run', async () => {
    const report = await runQa();
    expect(report.passed).toBe(true);
    expect(report.interactionContinuity).toBeUndefined();
  });

  it('does not replace an invalid stored contract with a valid provider contract', async () => {
    const { contract, observation } = continuityFixture();
    await declareContract({ ...contract, actions: [] });
    await expect(runQa({ interactionContinuityContract: contract, interactionContinuityObservation: observation })).rejects.toThrow();
  });

  it('propagates malformed stored JSON instead of treating it as no contract', async () => {
    await writeFile(path.join(runRoot, 'artifacts/interaction-continuity-contract.json'), '{');
    await expect(runQa()).rejects.toThrow(SyntaxError);
  });

  it('propagates a filesystem read error instead of treating it as no contract', async () => {
    await mkdir(path.join(runRoot, 'artifacts/interaction-continuity-contract.json'));
    await expect(runQa()).rejects.toMatchObject({ code: 'EISDIR' });
  });

  it('retains a stored contract identity when provider observation is invalid', async () => {
    const { contract } = continuityFixture();
    await declareContract(contract);
    const report = await runQa({ interactionContinuityObservation: { nodes: 'invalid' } });
    expect(report.passed).toBe(false);
    expect(report.interactionContinuity?.contractId).toBe(contract.contractId);
    expect(report.interactionContinuity?.blockers[0]).toMatch(/^observation:invalid:/);
  });
});
