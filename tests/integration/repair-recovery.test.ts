import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFactory } from '../../src/factory.js';
import { MockCodexProvider } from '../../src/providers/mock.js';
import { MockQAProvider } from '../../src/providers/runtime-qa.js';
import type { CodexProvider } from '../../src/providers/interfaces.js';
import { RepairHistorySchema } from '../../src/schemas/repair-policy.js';
import { defaultOperatingProfile } from '../../src/core/operating-profile.js';

const roots: string[] = [];

class RepairingCodexProvider extends MockCodexProvider {
  fixes = 0;
  readonly inputThreads: Array<string | undefined> = [];

  constructor(private readonly mutateBuild = true, private readonly failFirst = false) { super(); }

  override async build() {
    return { threadId: 'builder-thread', verificationMode: 'contract' as const, metrics: { provider: 'test', model: 'fixture', calls: 0 } };
  }

  override async fix({ workspace, threadId }: Parameters<CodexProvider['fix']>[0]) {
    this.fixes += 1;
    this.inputThreads.push(threadId);
    if (this.failFirst && this.fixes === 1) throw new Error('simulated interrupted repair');
    if (this.mutateBuild) {
      await mkdir(path.join(workspace, 'public'), { recursive: true });
      await writeFile(path.join(workspace, 'public', `repair-${this.fixes}.txt`), `repair ${this.fixes}`);
    }
    return {
      threadId: `fix-thread-${this.fixes}`,
      summary: `Applied repair ${this.fixes}`,
      verificationMode: 'contract' as const,
      metrics: { provider: 'test', model: 'fixture', calls: 1 },
    };
  }
}

async function fixture() {
  const root = await mkdtemp(path.join('/tmp', 'factory-repair-recovery-'));
  roots.push(root);
  const seed = path.join(root, 'seed.yaml');
  await writeFile(seed, 'title: Repair Recovery\ntheme: a cozy market\ntemplate: idle-shop-v1\ndesignMode: prototype_tournament\n');
  return { root, seed };
}

async function approveDesign(factory: ReturnType<typeof createFactory>, root: string, seed: string) {
  const runId = await factory.newRun(seed);
  await factory.run(runId);
  await factory.approvePrototype(runId, { decision: 'APPROVE', notes: 'recovery fixture' });
  await factory.resume(runId);
  await writeFile(path.join(root, 'runs', runId, 'human/art-approval.yaml'), 'selected_direction: direction_a\n');
  return runId;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('formal repair recovery', () => {
  it('refuses QA evidence reached through a symlink to another run before calling the Fixer', async () => {
    const { root, seed } = await fixture();
    const codex = new RepairingCodexProvider();
    vi.spyOn(MockQAProvider.prototype, 'playtest').mockImplementation(async () => ({
      schemaVersion: 1, passed: false,
      checks: [{ name: 'foreign-capture', passed: false, evidence: 'foreign-captures/foreign.png' }],
      issues: [], screenshots: ['foreign-captures/foreign.png'], consoleLog: 'logs/console.log', testedAt: new Date().toISOString(),
    }));
    const factory = createFactory({ root, mode: 'mock', qaMode: 'stub', codexProvider: codex });
    const runId = await approveDesign(factory, root, seed);
    const foreign = path.join(root, 'runs/another-game/screenshots');
    await mkdir(foreign, { recursive: true });
    await writeFile(path.join(foreign, 'foreign.png'), 'not this game');
    await symlink(foreign, path.join(root, 'runs', runId, 'foreign-captures'));
    await expect(factory.resume(runId)).rejects.toThrow(/symlink/);
    expect(codex.fixes).toBe(0);
    expect((await factory.status(runId)).fixAttempts).toBe(0);
  });
  it('stops after five distinct evidenced repairs and resumes without duplicating the count or provider call', async () => {
    const { root, seed } = await fixture();
    const codex = new RepairingCodexProvider();
    let qaCalls = 0;
    vi.spyOn(MockQAProvider.prototype, 'playtest').mockImplementation(async () => {
      qaCalls += 1;
      const issue = qaCalls <= 6 ? `issue-${qaCalls}` : 'issue-6';
      return {
        schemaVersion: 1,
        passed: false,
        checks: [{ name: `check-${issue}`, passed: false, evidence: `observed ${issue}` }],
        issues: [],
        screenshots: [],
        consoleLog: 'logs/console.log',
        testedAt: new Date().toISOString(),
      };
    });
    const factory = createFactory({ root, mode: 'mock', qaMode: 'stub', codexProvider: codex });
    const runId = await approveDesign(factory, root, seed);

    const waiting = await factory.resume(runId);
    const runRoot = path.join(root, 'runs', runId);
    const history = RepairHistorySchema.parse(JSON.parse(await readFile(path.join(runRoot, 'artifacts/repair-history.json'), 'utf8')));
    expect(waiting).toMatchObject({ stage: 'FIX', status: 'waiting', fixAttempts: 5, codexThreadId: 'fix-thread-5' });
    expect(waiting.stages.FIX?.attempts).toBe(5);
    expect(codex.fixes).toBe(5);
    expect(codex.inputThreads).toEqual(['builder-thread', 'fix-thread-1', 'fix-thread-2', 'fix-thread-3', 'fix-thread-4']);
    expect(history.attempts).toHaveLength(5);
    expect(history.qaReports).toHaveLength(6);
    expect(history.attempts.every((attempt) => attempt.status === 'completed' && attempt.inputBuildHash !== attempt.outputBuildHash)).toBe(true);
    expect(history.qaReports[0]?.evidenceFiles.map((file) => file.sourcePath)).toContain('logs/console.log');
    await expect(readFile(path.join(runRoot, history.qaReports[0]!.evidenceFiles.find((file) => file.sourcePath === 'logs/console.log')!.artifactPath), 'utf8')).resolves.toBe('stub QA\n');
    expect(JSON.parse(await readFile(path.join(runRoot, 'artifacts/repair-policy-decision.json'), 'utf8'))).toMatchObject({ allowed: false, reason: 'configured-fix-attempt-ceiling' });

    const resumed = await factory.resume(runId);
    const resumedHistory = RepairHistorySchema.parse(JSON.parse(await readFile(path.join(runRoot, 'artifacts/repair-history.json'), 'utf8')));
    expect(resumed).toMatchObject({ stage: 'FIX', status: 'waiting', fixAttempts: 5, codexThreadId: 'fix-thread-5' });
    expect(resumed.stages.FIX?.attempts).toBe(5);
    expect(codex.fixes).toBe(5);
    expect(resumedHistory.attempts).toHaveLength(5);
    expect(resumedHistory.qaReports).toHaveLength(7);
    await expect(readFile(path.join(runRoot, resumedHistory.qaReports[0]!.artifactPath), 'utf8')).resolves.toContain('issue-1');
    await expect(readFile(path.join(runRoot, resumedHistory.qaReports[6]!.artifactPath), 'utf8')).resolves.toContain('issue-6');
  });

  it('does not call the fixer beyond an explicitly configured attempt ceiling', async () => {
    const { root, seed } = await fixture();
    const codex = new RepairingCodexProvider();
    let qaCalls = 0;
    vi.spyOn(MockQAProvider.prototype, 'playtest').mockImplementation(async () => {
      qaCalls += 1;
      return {
        schemaVersion: 1,
        passed: false,
        checks: [{ name: `check-${qaCalls}`, passed: false, evidence: `observed issue ${qaCalls}` }],
        issues: [],
        screenshots: [],
        consoleLog: 'logs/console.log',
        testedAt: new Date().toISOString(),
      };
    });
    const defaults = defaultOperatingProfile();
    const factory = createFactory({
      root,
      mode: 'mock',
      qaMode: 'stub',
      codexProvider: codex,
      operatingProfile: { budget: { ...defaults.budget, maxFixAttempts: 1 } },
    });
    const runId = await approveDesign(factory, root, seed);

    const waiting = await factory.resume(runId);
    expect(waiting).toMatchObject({ stage: 'FIX', status: 'waiting', fixAttempts: 1 });
    expect(waiting.stages.FIX?.attempts).toBe(1);
    expect(qaCalls).toBe(2);
    expect(codex.fixes).toBe(1);
    expect(JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/repair-policy-decision.json'), 'utf8'))).toMatchObject({ allowed: false, reason: 'configured-fix-attempt-ceiling' });
  });

  it('does not call the fixer again when its previous attempt left the build unchanged', async () => {
    const { root, seed } = await fixture();
    const codex = new RepairingCodexProvider(false);
    let qaCalls = 0;
    vi.spyOn(MockQAProvider.prototype, 'playtest').mockImplementation(async () => {
      qaCalls += 1;
      return {
        schemaVersion: 1,
        passed: false,
        checks: [{ name: `check-${qaCalls}`, passed: false, evidence: `observed issue ${qaCalls}` }],
        issues: [],
        screenshots: [],
        consoleLog: 'logs/console.log',
        testedAt: new Date().toISOString(),
      };
    });
    const factory = createFactory({ root, mode: 'mock', qaMode: 'stub', codexProvider: codex });
    const runId = await approveDesign(factory, root, seed);

    const waiting = await factory.resume(runId);
    expect(waiting).toMatchObject({ stage: 'FIX', status: 'waiting', fixAttempts: 1 });
    expect(waiting.stages.FIX?.attempts).toBe(1);
    expect(qaCalls).toBe(2);
    expect(codex.fixes).toBe(1);
    expect(JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/repair-policy-decision.json'), 'utf8'))).toMatchObject({ allowed: false, reason: 'unchanged-build' });
  });

  it('preserves an interrupted repair attempt and waits even if later runtime QA passes', async () => {
    const { root, seed } = await fixture();
    const codex = new RepairingCodexProvider(true, true);
    let qaCalls = 0;
    vi.spyOn(MockQAProvider.prototype, 'playtest').mockImplementation(async () => {
      qaCalls += 1;
      return {
        schemaVersion: 1,
        passed: qaCalls > 1,
        checks: [{ name: qaCalls === 1 ? 'failed-core-check' : 'passed-core-check', passed: qaCalls > 1, evidence: 'runtime QA observation' }],
        issues: [],
        screenshots: [],
        consoleLog: 'logs/console.log',
        testedAt: new Date().toISOString(),
      };
    });
    const factory = createFactory({ root, mode: 'mock', qaMode: 'stub', codexProvider: codex });
    const runId = await approveDesign(factory, root, seed);
    await expect(factory.resume(runId)).rejects.toThrow('simulated interrupted repair');

    const failed = await factory.status(runId);
    expect(failed).toMatchObject({ stage: 'FAILED', fixAttempts: 1, codexThreadId: 'builder-thread' });
    expect(failed.stages.FIX?.attempts).toBe(1);
    const runRoot = path.join(root, 'runs', runId);
    const waiting = await factory.resume(runId);
    const history = RepairHistorySchema.parse(JSON.parse(await readFile(path.join(runRoot, 'artifacts/repair-history.json'), 'utf8')));
    expect(waiting).toMatchObject({ stage: 'FIX', status: 'waiting', fixAttempts: 1, codexThreadId: 'builder-thread' });
    expect(waiting.stages.FIX?.attempts).toBe(1);
    expect(codex.fixes).toBe(1);
    expect(codex.inputThreads).toEqual(['builder-thread']);
    expect(history.attempts).toHaveLength(1);
    expect(history.attempts[0]).toMatchObject({ status: 'started', inputThreadId: 'builder-thread' });
    expect(history.qaReports).toHaveLength(2);
    expect(JSON.parse(await readFile(path.join(runRoot, 'artifacts/repair-policy-decision.json'), 'utf8'))).toMatchObject({ allowed: false, reason: 'incomplete-prior-attempt' });
  });
});
