import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFactory } from '../../src/factory.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('launch lifecycle control-plane APIs', () => {
  it('records a hash-bound platform policy snapshot and evaluates current evidence', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'factory-platform-policy-'));
    roots.push(root);
    const factory = createFactory({ root, mode: 'mock', qaMode: 'stub' });
    const seed = path.join(root, 'seed.yaml');
    await writeFile(seed, 'title: Platform Policy\ntheme: spirits\ntemplate: idle-shop-v1\ndesignMode: prototype_tournament\n');
    const runId = await factory.newRun(seed);
    const current = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/platform-policy.json'), 'utf8')) as { entries: Array<Record<string, unknown>>; targets: string[]; optionalTargets: string[] };
    const now = new Date().toISOString();
    const verified = { ...current, sourceKind: 'operator', updatedAt: now, entries: current.entries.map((entry) => ({ ...entry, status: 'VERIFIED', policyVersion: '2026-09', sourceRefs: ['https://developers.example.test/rules'], verifiedAt: now, verifiedBy: 'human:operator', requiredActions: [], assumptions: ['checked before release'] })) };
    const result = await factory.recordPlatformPolicy(runId, verified);
    expect(result.evaluation.passed).toBe(true);
    expect(result.policyHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/platform-policy-evaluation.json'), 'utf8')).passed).toBe(true);
  });

  it('records an atomic, hash-addressed account portfolio snapshot and is idempotent', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'factory-account-portfolio-'));
    roots.push(root);
    const factory = createFactory({ root, mode: 'mock', qaMode: 'stub' });
    const updatedAt = new Date().toISOString();
    const portfolio = {
      schemaVersion: 1 as const,
      updatedAt,
      entries: [{ gameId: 'existing-game', platform: 'wechat-minigame' as const, status: 'active' as const, updatedAt }],
    };
    const first = await factory.recordAccountPortfolio(portfolio);
    expect(first.idempotent).toBe(false);
    expect(first.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(await readFile(path.join(root, 'account-portfolio.json'), 'utf8'))).toEqual(portfolio);
    const second = await factory.recordAccountPortfolio(portfolio);
    expect(second.idempotent).toBe(true);
    const operations = (await readFile(path.join(root, 'factory-operations.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    expect(operations.at(-1)).toMatchObject({ event: 'account-portfolio.updated', snapshotHash: first.snapshotHash, idempotent: true });
  });

  it('records certification, bounded launch metrics and an explicit abandonment decision per run', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'factory-launch-lifecycle-'));
    roots.push(root);
    const seed = path.join(root, 'seed.yaml');
    await writeFile(seed, 'title: Launch Ledger\ntheme: spirits\ntemplate: idle-shop-v1\ndesignMode: prototype_tournament\n');
    const factory = createFactory({ root, mode: 'mock', qaMode: 'stub' });
    const runId = await factory.newRun(seed);
    const runRoot = path.join(root, 'runs', runId);
    const checklist = JSON.parse(await readFile(path.join(runRoot, 'artifacts/certification-checklist.json'), 'utf8')) as Record<string, unknown> & { items: Array<Record<string, unknown>> };
    const readyChecklist = { ...checklist, items: checklist.items.map((item) => ({ ...item, status: 'ready', evidence: ['human://verified'] })), blockers: [], unknowns: [], ready: true };
    const certification = await factory.recordCertification(runId, readyChecklist);
    expect(certification.checklist.ready).toBe(true);
    expect(JSON.parse(await readFile(path.join(runRoot, 'artifacts/certification-checklist.json'), 'utf8')).ready).toBe(true);

    const metrics = await factory.recordLaunchMetrics(runId, {
      schemaVersion: 1,
      gameId: 'launch-ledger',
      platform: 'douyin-minigame',
      releaseHash: 'a'.repeat(64),
      starts: 10,
      users: 10,
      observedDays: 1,
      d1Retention: null,
      sessionCompletionRate: 0.5,
      crashRate: 0,
      adShowRate: 0.5,
      adCompletionRate: 0.8,
      eCPMCents: 100,
      netRevenueCents: 100,
      spendCents: 0,
      organicShare: 1,
      dataQuality: 'observed',
      notes: ['small initial cohort'],
      observedAt: new Date().toISOString(),
    });
    expect(metrics.decision.decision).toBe('COLLECTING');
    await expect(readFile(path.join(runRoot, 'artifacts/launch-metrics/douyin-minigame.json'), 'utf8')).resolves.toBeTruthy();

    const abandoned = await factory.abandon(runId, 'manual');
    expect(abandoned.decision.decision).toBe('ABANDON');
    expect((await factory.status(runId)).stage).toBe('ABANDONED');
  });
});
