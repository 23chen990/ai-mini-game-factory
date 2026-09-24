import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { createFactory } from '../../src/factory.js';
import { ArtApprovalSchema } from '../../src/schemas/index.js';

const exec = promisify(execFile);
const roots: string[] = [];
async function waitingRun() {
  const root = await mkdtemp(path.join(tmpdir(), 'factory-approval-'));
  roots.push(root);
  const seed = path.join(root, 'seed.yaml');
  await writeFile(seed, 'title: 妖怪夜市\ntheme: 夜市妖怪\ntemplate: idle-shop-v1\ndesignMode: prototype_tournament\n');
  const factory = createFactory({ root, repositoryRoot: process.cwd(), mode: 'mock', qaMode: 'stub' });
  const runId = await factory.newRun(seed);
  await factory.run(runId);
  await factory.approvePrototype(runId, { decision: 'APPROVE', notes: '' });
  await factory.resume(runId);
  return { root, runId, factory };
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('art approval', () => {
  it('approve CLI validates and writes approval without auto-resume', async () => {
    const { root, runId } = await waitingRun();

    const result = await exec('pnpm', ['factory', 'approve', runId, '--direction', 'direction_b', '--notes', '降低饱和度'], { cwd: process.cwd(), env: { ...process.env, FACTORY_ROOT: root, FACTORY_MODE: 'mock' } });

    expect(result.stdout).toContain(`pnpm factory resume ${runId}`);
    const approval = ArtApprovalSchema.parse(parse(await readFile(path.join(root, 'runs', runId, 'human/art-approval.yaml'), 'utf8')));
    expect(approval).toEqual({ selected_direction: 'direction_b', keep: [], change: [], notes: ['降低饱和度'] });
    expect(JSON.parse(await readFile(path.join(root, 'runs', runId, 'state.json'), 'utf8')).stage).toBe('WAITING_FOR_ART_APPROVAL');
  });

  it('projects the combined art/core-demo gate into the canonical CORE_DEMO ledger session', async () => {
    const { root, runId, factory } = await waitingRun();
    const before = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/human-approval-ledger.json'), 'utf8')) as { records: Array<{ sessionId: string }> };
    expect(before.records.some((record) => record.sessionId === 'CORE_DEMO')).toBe(false);
    await factory.approve(runId, { direction: 'direction_a', notes: 'core demo and presentation approved' });
    const ledger = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/human-approval-ledger.json'), 'utf8')) as { records: Array<{ sessionId: string; approvalClass: string; decision: string; artifactRefs: string[] }> };
    const core = ledger.records.find((record) => record.sessionId === 'CORE_DEMO');
    expect(core).toMatchObject({ sessionId: 'CORE_DEMO', approvalClass: 'scheduled', decision: 'APPROVE' });
    expect(core?.artifactRefs).toEqual(expect.arrayContaining(['artifacts/game-blueprint.json', 'artifacts/experience-contract.json', 'artifacts/art-directions.json', 'human/art-approval.yaml', 'human/prototype-review.json', 'human/prototype-decision.yaml']));
    expect(ledger.records.filter((record) => record.sessionId === 'CORE_DEMO')).toHaveLength(1);
  });

  it('projects GO business approval and exposes the evaluation in operating status', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'factory-business-approval-'));
    roots.push(root);
    const seed = path.join(root, 'seed.yaml');
    await writeFile(seed, 'title: Business Gate\ntheme: spirits\ntemplate: idle-shop-v1\ndesignMode: prototype_tournament\n');
    const factory = createFactory({ root, repositoryRoot: process.cwd(), mode: 'mock', qaMode: 'stub', enforceOperatingGates: true });
    const runId = await factory.newRun(seed);
    const waiting = await factory.run(runId);
    expect(waiting.stage).toBe('BUSINESS_PREFLIGHT');
    const preflightPath = path.join(root, 'runs', runId, 'artifacts/business-preflight.json');
    const preflight = JSON.parse(await readFile(preflightPath, 'utf8')) as { accountChecks: Array<Record<string, unknown>>; rightsStatus: string; payoutStatus: string; decision: string; blockers: string[]; unknowns: string[] };
    preflight.accountChecks = preflight.accountChecks.map((check) => ({ ...check, status: 'pass', evidence: ['human:account-confirmed'] }));
    preflight.rightsStatus = 'pass';
    preflight.payoutStatus = 'pass';
    preflight.decision = 'GO';
    preflight.blockers = [];
    preflight.unknowns = [];
    await factory.approveBusinessPreflight(runId, preflight);
    const ledger = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/human-approval-ledger.json'), 'utf8')) as { records: Array<{ sessionId: string; decision: string }> };
    expect(ledger.records).toEqual(expect.arrayContaining([expect.objectContaining({ sessionId: 'GO_NO_GO', decision: 'APPROVE' })]));
    const status = await factory.operatingStatus(runId);
    expect(status.humanApprovals).toMatchObject({ scheduled: expect.arrayContaining([expect.objectContaining({ id: 'GO_NO_GO', status: 'APPROVED' })]) });
  });

  it('projects a candidate-bound passing playtest into FINAL_RELEASE', async () => {
    const { root, runId, factory } = await waitingRun();
    await factory.approve(runId, { direction: 'direction_a', notes: 'finish fast fixture' });
    const done = await factory.resume(runId);
    expect(done.stage).toBe('COMPLETED');
    const candidate = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/release-candidate.json'), 'utf8')) as { coreHash: string };
    await factory.approveHumanPlaytest(runId, { schemaVersion: 1, passed: true, sessionId: 'approval-test', buildHash: candidate.coreHash, inputMode: 'touch', notes: ['candidate replayed'], evidence: ['screenshots/final.png'], approvedAt: new Date().toISOString() });
    const ledger = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/human-approval-ledger.json'), 'utf8')) as { records: Array<{ sessionId: string; decision: string; candidateHash?: string }> };
    expect(ledger.records).toEqual(expect.arrayContaining([expect.objectContaining({ sessionId: 'FINAL_RELEASE', decision: 'APPROVE', candidateHash: candidate.coreHash })]));
  });

  it('rejects an unknown direction', async () => {
    const { factory, runId } = await waitingRun();
    await expect(factory.approve(runId, { direction: 'direction_z', notes: '' })).rejects.toThrow(/direction.*does not exist/i);
  });

  it('does not overwrite an existing approval unless force is true', async () => {
    const { factory, runId, root } = await waitingRun();
    const file = path.join(root, 'runs', runId, 'human/art-approval.yaml');
    await factory.approve(runId, { direction: 'direction_a', notes: 'first' });

    await expect(factory.approve(runId, { direction: 'direction_b', notes: 'second' })).rejects.toThrow(/already exists/i);
    expect(await readFile(file, 'utf8')).toContain('direction_a');
    await factory.approve(runId, { direction: 'direction_b', notes: 'second', force: true });
    expect(await readFile(file, 'utf8')).toContain('direction_b');
  });
});
