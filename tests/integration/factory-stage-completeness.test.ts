import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFactory } from '../../src/factory.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('factory stage completeness', () => {
  it('records the blueprint, experience hypothesis, content expansion and UI skeleton as real stages', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'factory-stage-complete-'));
    roots.push(root);
    const seed = path.join(root, 'seed.yaml');
    await writeFile(seed, 'title: Stage Completeness\ntheme: spirits\ntemplate: idle-shop-v1\ndesignMode: prototype_tournament\n');
    const factory = createFactory({ root, mode: 'mock', qaMode: 'stub', enforceStageContracts: true });
    const runId = await factory.newRun(seed);
    await factory.run(runId);
    await factory.approvePrototype(runId, { decision: 'APPROVE', notes: 'core demo approved' });
    await factory.resume(runId);
    await factory.approve(runId, { direction: 'direction_a', notes: 'visual direction approved' });
    const done = await factory.resume(runId);
    expect(done.stage).toBe('COMPLETED');
    for (const stage of ['PRODUCTION_LINE_REVIEW', 'IAA_REVIEW', 'BLUEPRINT', 'EXPERIENCE_HYPOTHESIS', 'CORE_SPEC_FROZEN', 'CONTENT_EXPANSION', 'UI_SKELETON']) {
      expect(done.stages[stage]?.status, stage).toBe('completed');
    }
    // The mock builder only runs contract checks, so the FULL_BUILD ledger must
    // record contract evidence instead of claiming a full test/typecheck run.
    expect(done.stages.FULL_BUILD?.status).toBe('completed');
    expect(done.stages.FULL_BUILD?.evidence).toContain('build:tests:contract');
    expect(done.stages.FULL_BUILD?.evidence).toContain('build:typecheck:contract');
    expect(done.stages.FULL_BUILD?.evidence).not.toContain('build:tests');
    for (const artifact of ['production-line-decision.json', 'iaa-contract.json', 'game-blueprint.json', 'experience-hypothesis.json', 'core-spec-lock.json', 'content-expansion.json', 'ui-skeleton.json']) {
      await expect(readFile(path.join(root, 'runs', runId, 'artifacts', artifact), 'utf8'), artifact).resolves.toBeTruthy();
    }
    const coreSpec = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts', 'core-spec-lock.json'), 'utf8')) as { frozenBy?: string; acceptanceDimensions?: string[] };
    expect(coreSpec.frozenBy).toBe('human');
    expect(coreSpec.acceptanceDimensions?.length).toBeGreaterThanOrEqual(3);
    await expect(readFile(path.join(root, 'runs', runId, 'artifacts', 'factory-constitution.json'), 'utf8')).resolves.toBeTruthy();
    await expect(readFile(path.join(root, 'runs', runId, 'artifacts', 'constitution-evaluation.json'), 'utf8')).resolves.toBeTruthy();
    const registry = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts', 'stage-contract-registry.json'), 'utf8')) as { passed?: boolean; fallbackStages?: string[] };
    expect(registry.passed).toBe(true);
    expect(registry.fallbackStages).toEqual([]);
  });

  it('pauses full validation at the first missing specialist profile stage', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'factory-full-validation-'));
    roots.push(root);
    const seed = path.join(root, 'seed.yaml');
    await writeFile(seed, 'title: Full Validation Guard\ntheme: spirits\ntemplate: idle-shop-v1\ndesignMode: prototype_tournament\n');
    const factory = createFactory({ root, mode: 'mock', qaMode: 'stub', operatingProfile: { pipelineMode: 'full-validation' } });
    const runId = await factory.newRun(seed);
    expect((await factory.run(runId)).stage).toBe('WAITING_FOR_PROTOTYPE_APPROVAL');
    await factory.approvePrototype(runId, { decision: 'APPROVE', notes: 'core demo approved' });
    const paused = await factory.resume(runId);
    expect(paused.stage).toBe('SYSTEMS_CONTRACT');
    expect(paused.status).toBe('waiting');
    expect(paused.stages.SYSTEMS_CONTRACT?.status).toBe('waiting');
    expect(paused.stages.ART_DIRECTIONS).toBeUndefined();
    const audit = JSON.parse(await readFile(path.join(root, 'runs', runId, 'artifacts/stage-contracts/SYSTEMS_CONTRACT.json'), 'utf8')) as { passed?: boolean; missing?: string[] };
    expect(audit.passed).toBe(false);
    expect(audit.missing).toEqual(expect.arrayContaining(['artifacts/systems-contract.json', 'systems:contract']));
  });

  it('records stage-plan policy for started stages', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'factory-stage-policy-'));
    roots.push(root);
    const seed = path.join(root, 'seed.yaml');
    await writeFile(seed, 'title: Policy Evidence\ntheme: spirits\ntemplate: idle-shop-v1\ndesignMode: prototype_tournament\n');
    const factory = createFactory({ root, mode: 'mock', qaMode: 'stub' });
    const runId = await factory.newRun(seed);
    const runRoot = path.join(root, 'runs', runId);
    await expect(factory.resume(runId)).resolves.toHaveProperty('stage');
    const policyFiles = await readdir(path.join(runRoot, 'artifacts/stage-plan-policy'));
    expect(policyFiles.length).toBeGreaterThan(0);
    const policyName = policyFiles[0];
    expect(policyName).toBeTypeOf('string');
    const policyFile = path.join(runRoot, 'artifacts/stage-plan-policy', policyName!);
    const policy = JSON.parse(await readFile(policyFile, 'utf8')) as {
      source?: string;
      classification?: string;
      allowed?: boolean;
    };
    expect(policy.source).toBe('pipeline-plan');
    expect(policy.classification).toBe('mandatory');
    expect(policy.allowed).toBe(true);
  });
});
