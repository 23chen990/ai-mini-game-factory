import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFactory } from '../../src/factory.js';
import { MockAgentProvider } from '../../src/providers/mock.js';
import { verifyHandoffPacketIntegrity } from '../../src/core/context-budget.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('stage contract enforcement', () => {
  it('does not reject the normal prototype path when hard contracts are enabled', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'factory-contracts-'));
    roots.push(root);
    const seed = path.join(root, 'seed.yaml');
    await writeFile(seed, 'title: Contract Test\ntheme: spirits\ntemplate: idle-shop-v1\ndesignMode: prototype_tournament\n');
    const factory = createFactory({ root, mode: 'mock', qaMode: 'stub', enforceStageContracts: true });
    const runId = await factory.newRun(seed);
    const state = await factory.run(runId);
    expect(state.stage).toBe('WAITING_FOR_PROTOTYPE_APPROVAL');
    expect(state.readiness).toBe('WAITING');
    const handoffFiles = await readdir(path.join(root, 'runs', runId, 'logs/handoffs'));
    expect(handoffFiles.length).toBeGreaterThan(0);
    const handoff = JSON.parse(await readFile(path.join(root, 'runs', runId, 'logs/handoffs', handoffFiles[0]!), 'utf8')) as Record<string, unknown>;
    expect(verifyHandoffPacketIntegrity(handoff)).toEqual({ passed: true, blockers: [] });
    expect(handoff).not.toHaveProperty('transcript');
    expect(state.stages.COMPETITOR_RESEARCH?.status).toBe('completed');
  });

  it('keeps the full mock path contract-clean through release', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'factory-contracts-full-'));
    roots.push(root);
    const seed = path.join(root, 'seed.yaml');
    await writeFile(seed, 'title: Contract Full\ntheme: spirits\ntemplate: idle-shop-v1\ndesignMode: prototype_tournament\n');
    const factory = createFactory({ root, mode: 'mock', qaMode: 'stub', enforceStageContracts: true });
    const runId = await factory.newRun(seed);
    await factory.run(runId);
    await factory.approvePrototype(runId, { decision: 'APPROVE', notes: 'contract test' });
    await factory.resume(runId);
    await factory.approve(runId, { direction: 'direction_a', notes: 'contract test' });
    const done = await factory.resume(runId);
    expect(done.stage).toBe('COMPLETED');
    expect(done.readiness).toBe('CANDIDATE_READY');
    expect(done.stages.FINAL_PROFILE_QA?.status).toBe('completed');
    expect(done.stages.RELEASE_CANDIDATE?.status).toBe('completed');
    await expect(readFile(path.join(root, 'runs', runId, 'artifacts/final-profile-qa.json'), 'utf8')).resolves.toContain('APPROVED');
    await expect(readFile(path.join(root, 'runs', runId, 'artifacts/release-candidate.json'), 'utf8')).resolves.toContain('coreHash');
    const evalAudit = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/stage-contracts/FACTORY_EVAL.json'), 'utf8')) as { passed?: boolean; observedInputs?: string[]; observedArtifacts?: string[]; observedEvidence?: string[] };
    expect(evalAudit.passed).toBe(true);
    expect(evalAudit.observedInputs).toContain('factory-eval/cases.json');
    expect(evalAudit.observedArtifacts).toContain('artifacts/factory-eval-report.json');
    expect(evalAudit.observedEvidence).toContain('factory-eval:cases');
    const normalAudit = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/stage-contracts/NORMAL_FLOW_QA.json'), 'utf8')) as { passed?: boolean; observedInputs?: string[]; observedArtifacts?: string[]; observedEvidence?: string[] };
    expect(normalAudit.passed).toBe(true);
    expect(normalAudit.observedInputs).toContain('artifacts/build-report.json');
    expect(normalAudit.observedArtifacts).toContain('artifacts/qa-report.json');
    expect(normalAudit.observedEvidence).toEqual(expect.arrayContaining(['qa:normal-flow', 'qa:no-console-errors']));
  });

  it('blocks legacy competitor research in production while preserving a durable evidence report', async () => {
    class LegacyResearchProvider extends MockAgentProvider {
      override async generateCompetitorResearch(seed: Parameters<MockAgentProvider['generateCompetitorResearch']>[0]) {
        const result = await super.generateCompetitorResearch(seed);
        return { ...result, value: { ...(result.value as Record<string, unknown>), sourceRecords: [] } };
      }
    }
    const root = await mkdtemp(path.join(tmpdir(), 'factory-research-boundary-'));
    roots.push(root);
    const seed = path.join(root, 'seed.yaml');
    await writeFile(seed, 'title: Research Boundary\ntheme: spirits\ntemplate: idle-shop-v1\ndesignMode: prototype_tournament\n');
    const factory = createFactory({ root, mode: 'mock', qaMode: 'stub', validationMode: 'fast', enforceOperatingGates: true, enforceStageContracts: false, operatingProfile: { pipelineMode: 'full-validation' }, agentProvider: new LegacyResearchProvider() });
    const runId = await factory.newRun(seed);
    await factory.run(runId);
    const preflightPath = path.join(root, 'runs', runId, 'artifacts/business-preflight.json');
    const preflight = JSON.parse(await readFile(preflightPath, 'utf8')) as { accountChecks: Array<{ status: string }>; rightsStatus: string; payoutStatus: string; decision: string; blockers: string[]; unknowns: string[] };
    preflight.accountChecks = preflight.accountChecks.map((check) => ({ ...check, status: 'pass' }));
    preflight.rightsStatus = 'pass';
    preflight.payoutStatus = 'pass';
    preflight.decision = 'GO';
    preflight.blockers = [];
    preflight.unknowns = [];
    await writeFile(preflightPath, `${JSON.stringify(preflight, null, 2)}\n`);
    const paused = await factory.resume(runId);
    expect(paused.stage).toBe('COMPETITOR_RESEARCH');
    expect(paused.status).toBe('waiting');
    const evidence = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/competitor-research-evidence.json'), 'utf8')) as { passed?: boolean; legacy?: boolean; blockers?: string[] };
    expect(evidence).toMatchObject({ passed: false, legacy: true });
    expect(evidence.blockers).toContain('research:sources-missing');
  });

  it('fails closed when a stage permission manifest is missing instead of calling the provider', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'factory-permission-manifest-missing-'));
    roots.push(root);
    const seed = path.join(root, 'seed.yaml');
    await writeFile(seed, 'title: Missing Manifest\ntheme: spirits\ntemplate: idle-shop-v1\ndesignMode: prototype_tournament\n');
    const factory = createFactory({ root, mode: 'mock', qaMode: 'stub', enforceStageContracts: true });
    const runId = await factory.newRun(seed);
    const first = await factory.run(runId);
    expect(first.stage).toBe('WAITING_FOR_PROTOTYPE_APPROVAL');
    await factory.approvePrototype(runId, { decision: 'APPROVE', notes: 'continue' });
    const artWait = await factory.resume(runId);
    expect(artWait.stage).toBe('WAITING_FOR_ART_APPROVAL');
    // Leave the file present so bootstrap does not recreate it; an empty
    // manifest is a realistic partial/corrupt write from an interrupted run.
    await writeFile(path.join(root, 'runs', runId, 'artifacts/permission-manifest.json'), JSON.stringify({ schemaVersion: 1, manifests: [] }));
    await factory.approve(runId, { direction: 'direction_a', notes: 'continue' });
    await expect(factory.resume(runId)).rejects.toThrow(/permission manifest/i);
  });
});
