import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createFactory, type FactoryOptions } from '../../src/factory.js';
import { parse } from 'yaml';
import { MockAgentProvider } from '../../src/providers/mock.js';
import { ingestReferenceMedia, reviewReferenceMediaIdentity } from '../../src/core/evidence-provenance.js';
import { ReferenceMechanicSpecSchema } from '../../src/schemas/reference-mechanic.js';
import type { ReferenceIntakeEvidence } from '../../src/schemas/reference-intake.js';
import type { AgentExecutionContext } from '../../src/providers/interfaces.js';
import { referenceBehaviorChecks, referenceFailurePressureContract } from '../fixtures/reference-behavior.js';
import { syntheticComparisonChecks } from '../fixtures/reference-comparison.js';

class IntakeFixtureProvider extends MockAgentProvider {
  calls = 0;
  researchMediaPaths: string[] = [];
  blocked = false;
  measurementBasis: 'runtime-observed' | 'inferred' = 'runtime-observed';
  async draftReference(input: ReferenceIntakeEvidence, context?: AgentExecutionContext) {
    this.calls++;
    this.researchMediaPaths = context?.mediaInputs?.map(({ path }) => path) ?? [];
    const seed = parse(await readFile('examples/seeds/relic-revival-workshop.yaml', 'utf8'));
    const source = input.sources[0]!;
    return {
      value: {
        schemaVersion: 1, targetRunId: input.targetRunId, inputHash: input.inputHash,
        suggestedTemplate: 'idle-shop-v1',
        mechanics: ReferenceMechanicSpecSchema.omit({ lockedBy: true, source: true }).parse(seed.referenceMechanics),
        analysis: { schemaVersion: 1, targetRunId: input.targetRunId,
          behaviorChecks: syntheticComparisonChecks(referenceBehaviorChecks(source)).map(check => ({
            ...check, comparison: { ...check.comparison, evidenceBasis: this.measurementBasis },
          })),
          observations: ['Synthetic first-party engineering fixture, not player evidence.'], inferences: [],
          unknowns: this.blocked ? ['failure branch is not observed'] : [],
          status: this.blocked ? 'BLOCKED' : 'READY', failurePressureContract: referenceFailurePressureContract(source) },
      },
      metrics: { provider: 'fixture', model: 'fixture', calls: 1 },
    };
  }
}

async function fixture(provider = new IntakeFixtureProvider(), options: Partial<FactoryOptions> = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'reference-intake-'));
  roots.push(root);
  const brief = path.join(root, 'brief.json');
  await writeFile(brief, JSON.stringify({ schemaVersion: 1, title: 'Lantern Trial', theme: 'Original lantern course', source: { name: 'First-party fixture', url: 'https://example.com/fixture' } }));
  const factory = createFactory({ root, mode: 'mock', qaMode: 'stub', agentProvider: provider, ...options });
  const runId = await factory.newReference(brief);
  const runRoot = path.join(root, 'runs', runId);
  const source = path.join(root, 'source.txt');
  await writeFile(source, 'Synthetic first-party engineering fixture. Observe, act, resolve, retry.');
  const ingested = await ingestReferenceMedia({ runRoot, sourcePath: source, targetGame: 'lantern-trial', purpose: 'design-document' });
  const review = () => reviewReferenceMediaIdentity({ runRoot, targetGame: 'lantern-trial', workspace: path.join(runRoot, 'workspace/game'), id: ingested.id, expectedSha256: ingested.sha256, reviewer: 'test-fixture', basis: 'Explicit first-party synthetic fixture identity, not a player study.' });
  return { factory, runId, runRoot, provider, review };
}

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

it('starts reference discovery from a brief without inventing a human mechanic lock', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'reference-intake-'));
  roots.push(root);
  const brief = path.join(root, 'brief.json');
  await writeFile(brief, JSON.stringify({ schemaVersion: 1, title: 'Lantern Trial', theme: 'Original lantern course', source: { name: 'Authorized reference', url: 'https://example.com/game' } }));
  const factory = createFactory({ root, mode: 'mock', qaMode: 'stub' });
  expect(factory).toHaveProperty('newReference');
  const runId = await factory.newReference(brief);
  const state = await factory.run(runId);
  expect(state).toMatchObject({ canonicalGameId: 'lantern-trial', runKind: 'reference-intake', stage: 'REFERENCE_DEEP_RESEARCH', status: 'waiting' });
  expect(state.stages.REFERENCE_DEEP_RESEARCH?.providerCalls.agent).toBe(0);
  await expect(readFile(path.join(root, 'runs', runId, 'input/seed.yaml'))).rejects.toThrow();
  expect((await factory.resume(runId)).stages.REFERENCE_DEEP_RESEARCH?.attempts).toBe(0);
});

it('analyzes only reviewed material once and hands the approved draft to the existing build lane', async () => {
  const { factory, runId, runRoot, provider, review } = await fixture();
  expect((await factory.run(runId)).stage).toBe('REFERENCE_DEEP_RESEARCH');
  expect(provider.calls).toBe(0);
  await review();
  expect((await factory.resume(runId)).stage).toBe('WAITING_FOR_REFERENCE_APPROVAL');
  expect(provider.calls).toBe(1);
  await factory.resume(runId);
  expect(provider.calls).toBe(1);
  await factory.approveReference(runId, { decision: 'APPROVE', notes: 'Engineering fixture approval only.' });
  expect((await factory.status(runId)).runKind).toBe('game');
  const seed = parse(await readFile(path.join(runRoot, 'input/seed.yaml'), 'utf8'));
  expect(seed.referenceMechanics.lockedBy).toBe('human');
  expect(seed.referenceMechanics.source.name).toBe('First-party fixture');
  await factory.resume(runId);
  expect(provider.calls).toBe(1);
  expect(JSON.parse(await readFile(path.join(runRoot, 'artifacts/build-report.json'), 'utf8')).success).toBe(true);
  const research = JSON.parse(await readFile(path.join(runRoot, 'artifacts/open-source-research.json'), 'utf8'));
  expect(research.outcome).toBe('REUSE_APPROVED');
  expect(research.selectedCandidateIds).toEqual(expect.arrayContaining(['vite', 'phaser']));
  expect(research.observations.join(' ')).toMatch(/license.*sha256/);
});

it('keeps an unchanged unknown blocked without spending another model call', async () => {
  const provider = new IntakeFixtureProvider(); provider.blocked = true;
  const { factory, runId, review } = await fixture(provider);
  await review();
  expect((await factory.run(runId)).stage).toBe('REFERENCE_DEEP_RESEARCH');
  expect((await factory.resume(runId)).stage).toBe('REFERENCE_DEEP_RESEARCH');
  expect(provider.calls).toBe(1);
  await expect(factory.approveReference(runId, { decision: 'APPROVE', notes: '' })).rejects.toThrow(/not waiting/);
});

it('does not authorize Builder from inferred mechanisms even if Research labels the draft READY', async () => {
  const provider = new IntakeFixtureProvider(); provider.measurementBasis = 'inferred';
  const { factory, runId, runRoot, review } = await fixture(provider);
  await review();
  const state = await factory.run(runId);
  expect(state).toMatchObject({ stage: 'REFERENCE_DEEP_RESEARCH', status: 'waiting' });
  expect(state.stages.FULL_BUILD).toBeUndefined();
  await expect(readFile(path.join(runRoot, 'input/seed.yaml'))).rejects.toThrow();
  await factory.resume(runId);
  expect(provider.calls).toBe(1);
});

it('rejects approval if source bytes changed since research', async () => {
  const { factory, runId, runRoot, review } = await fixture();
  await review(); await factory.run(runId);
  const manifest = JSON.parse(await readFile(path.join(runRoot, 'reference-evidence/manifest.json'), 'utf8'));
  await writeFile(path.join(runRoot, manifest.entries[0].storedPath), 'Changed source after analysis');
  await expect(factory.approveReference(runId, { decision: 'APPROVE', notes: '' })).rejects.toThrow(/evidence|hash/);
  await expect(readFile(path.join(runRoot, 'input/seed.yaml'))).rejects.toThrow();
});

it('never treats the default mock as an observer of supplied material', async () => {
  const { runId, runRoot, review } = await fixture();
  await review();
  const factory = createFactory({ root: path.dirname(path.dirname(runRoot)), mode: 'mock', qaMode: 'stub' });
  const state = await factory.run(runId);
  expect(state.stage).toBe('REFERENCE_DEEP_RESEARCH');
  expect(state.stages.REFERENCE_DEEP_RESEARCH?.evidence.join(' ')).toMatch(/Mock provider cannot observe/);
});

it('rejects non-public or credential-bearing reference URLs at intake', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'reference-intake-url-')); roots.push(root);
  const brief = path.join(root, 'brief.json');
  const factory = createFactory({ root, mode: 'mock', qaMode: 'stub' });
  for (const url of ['http://localhost/game', 'https://user:secret@example.com/game', 'file:///tmp/game.html']) {
    await writeFile(brief, JSON.stringify({ schemaVersion: 1, title: 'Test', theme: 'Original', source: { name: 'Reference', url } }));
    await expect(factory.newReference(brief)).rejects.toThrow(/public HTTPS/);
  }
});


it('activates discovery under the same strict stage contracts as production', async () => {
  const { factory, runId, runRoot, review } = await fixture(new IntakeFixtureProvider(), { enforceStageContracts: true, enforceExplicitStageContracts: true });
  await review(); await factory.run(runId);
  await factory.approveReference(runId, { decision: 'APPROVE', notes: 'Fixture gate, not player acceptance.' });
  const audit = JSON.parse(await readFile(path.join(runRoot, 'artifacts/stage-contracts/REFERENCE_DEEP_RESEARCH.json'), 'utf8'));
  expect(audit.passed).toBe(true);
});

it('does not accept an unbound, pre-existing decision as intake approval', async () => {
  const { factory, runId, runRoot, review } = await fixture();
  await review(); await factory.run(runId);
  await writeFile(path.join(runRoot, 'human/reference-decision.yaml'), 'decision: APPROVE\nnotes: []\n');
  await expect(factory.resume(runId)).rejects.toThrow(/intakeInputHash|intakeDraftSha256/);
  await expect(readFile(path.join(runRoot, 'input/seed.yaml'))).rejects.toThrow();
});

it('keeps recording discovery blocked when a textual draft omits event-level reconstruction', async () => {
  const { factory, runId, runRoot, review } = await fixture(new IntakeFixtureProvider(), {
    referenceFrameExtractor: async ({ outputDir }) => {
      await (await import('node:fs/promises')).mkdir(outputDir, { recursive: true });
      await writeFile(path.join(outputDir, 'frame.png'), 'synthetic frame');
      await writeFile(path.join(outputDir, 'frame2.png'), 'synthetic second frame');
      return { durationMs: 250, width: 390, height: 844,
        frames: [{ index: 0, requestedMs: 0, actualMs: 0, fileName: 'frame.png' }, { index: 1, requestedMs: 125, actualMs: 125, fileName: 'frame2.png' }], contactSheets: [] };
    },
  });
  await review();
  const sourcePath = path.join(path.dirname(runRoot), 'fixture.mp4');
  await writeFile(sourcePath, 'Synthetic recording transport fixture');
  const video = await ingestReferenceMedia({ runRoot, sourcePath, targetGame: 'lantern-trial', purpose: 'gameplay-reference' });
  await reviewReferenceMediaIdentity({ runRoot, targetGame: 'lantern-trial', workspace: path.join(runRoot, 'workspace/game'), id: video.id, expectedSha256: video.sha256, reviewer: 'test-fixture', basis: 'Synthetic transport, not real video evidence.' });
  const state = await factory.run(runId);
  expect(state.stage).toBe('REFERENCE_DEEP_RESEARCH');
  expect(state.stages.REFERENCE_DEEP_RESEARCH?.evidence.join(' ')).toMatch(/recording-level/);
});

it('accepts a recording/document identity without requiring an invented web URL', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'reference-intake-no-url-')); roots.push(root);
  const brief = path.join(root, 'brief.json');
  await writeFile(brief, JSON.stringify({ schemaVersion: 1, title: 'Recording Trial', theme: 'Original course', source: { name: 'Authorized recording supplied by the owner' } }));
  const factory = createFactory({ root, mode: 'mock', qaMode: 'stub' });
  const runId = await factory.newReference(brief);
  expect((await factory.run(runId)).stage).toBe('REFERENCE_DEEP_RESEARCH');
});


it('honors the existing detail-frame limit in fresh reference discovery', async () => {
  const provider = new IntakeFixtureProvider();
  const { factory, runId, runRoot, review } = await fixture(provider, {
    referenceFrameExtractor: async ({ outputDir }) => {
      await (await import('node:fs/promises')).mkdir(outputDir, { recursive: true });
      const frames = [];
      for (let index = 0; index < 6; index += 1) {
        const fileName = `frame-${index}.png`;
        await writeFile(path.join(outputDir, fileName), `frame ${index}`);
        frames.push({ index, requestedMs: index * 125, actualMs: index * 125, fileName });
      }
      return { durationMs: 750, width: 390, height: 844, frames, contactSheets: [] };
    },
  });
  await review();
  const sourcePath = path.join(path.dirname(runRoot), 'fixture.mp4');
  await writeFile(sourcePath, 'Synthetic recording transport fixture');
  const video = await ingestReferenceMedia({ runRoot, sourcePath, targetGame: 'lantern-trial', purpose: 'gameplay-reference' });
  await reviewReferenceMediaIdentity({ runRoot, targetGame: 'lantern-trial', workspace: path.join(runRoot, 'workspace/game'), id: video.id, expectedSha256: video.sha256, reviewer: 'test-fixture', basis: 'Synthetic transport, not real video evidence.' });
  const previous = process.env.FACTORY_REFERENCE_RESEARCH_DETAIL_FRAMES;
  process.env.FACTORY_REFERENCE_RESEARCH_DETAIL_FRAMES = '2';
  try { await factory.run(runId); }
  finally {
    if (previous === undefined) delete process.env.FACTORY_REFERENCE_RESEARCH_DETAIL_FRAMES;
    else process.env.FACTORY_REFERENCE_RESEARCH_DETAIL_FRAMES = previous;
  }
  expect(provider.researchMediaPaths).toHaveLength(2);
});

it('bounds an actual long-recording intake to a sampled visual packet and persists omitted coverage', async () => {
  const provider = new IntakeFixtureProvider();
  const { factory, runId, runRoot, review } = await fixture(provider, {
    referenceFrameExtractor: async ({ outputDir }) => {
      await (await import('node:fs/promises')).mkdir(outputDir, { recursive: true });
      const frames = [];
      const contactSheets = [];
      for (let index = 0; index < 292; index += 1) {
        const fileName = 'frame-' + index + '.png';
        await writeFile(path.join(outputDir, fileName), 'frame ' + index);
        frames.push({ index, requestedMs: index * 125, actualMs: index * 125, fileName });
      }
      for (let index = 0; index < 19; index += 1) {
        const fileName = 'contact-' + index + '.png';
        await writeFile(path.join(outputDir, fileName), 'sheet ' + index);
        contactSheets.push({ index, firstFrameIndex: index * 16, lastFrameIndex: Math.min(291, index * 16 + 15), fileName });
      }
      return { durationMs: 36_500, width: 1100, height: 720, frames, contactSheets };
    },
  });
  await review();
  const sourcePath = path.join(path.dirname(runRoot), 'fixture-long.mp4');
  await writeFile(sourcePath, 'Synthetic source, no real gameplay observations');
  const video = await ingestReferenceMedia({ runRoot, sourcePath, targetGame: 'lantern-trial', purpose: 'gameplay-reference' });
  await reviewReferenceMediaIdentity({ runRoot, targetGame: 'lantern-trial', workspace: path.join(runRoot, 'workspace/game'),
    id: video.id, expectedSha256: video.sha256, reviewer: 'test-fixture', basis: 'Synthetic media transport' });
  const oldDetails = process.env.FACTORY_REFERENCE_RESEARCH_DETAIL_FRAMES;
  const oldSheets = process.env.FACTORY_REFERENCE_RESEARCH_CONTACT_SHEETS;
  process.env.FACTORY_REFERENCE_RESEARCH_DETAIL_FRAMES = '4';
  process.env.FACTORY_REFERENCE_RESEARCH_CONTACT_SHEETS = '3';
  try { await factory.run(runId); }
  finally {
    if (oldDetails === undefined) delete process.env.FACTORY_REFERENCE_RESEARCH_DETAIL_FRAMES;
    else process.env.FACTORY_REFERENCE_RESEARCH_DETAIL_FRAMES = oldDetails;
    if (oldSheets === undefined) delete process.env.FACTORY_REFERENCE_RESEARCH_CONTACT_SHEETS;
    else process.env.FACTORY_REFERENCE_RESEARCH_CONTACT_SHEETS = oldSheets;
  }
  const plan = JSON.parse(await readFile(path.join(runRoot, 'artifacts/reference-intake-media-plan.json'), 'utf8'));
  expect(provider.calls).toBe(1);
  expect(provider.researchMediaPaths).toHaveLength(7);
  expect(plan).toMatchObject({
    purpose: 'reference-intake', coverage: 'BOUNDED_SAMPLE_NOT_FULL_VISUAL_COVERAGE',
    available: { contactSheets: 19, frames: 292, directImages: 0 }, omittedVisualFiles: 304,
  });
  expect(plan.selectedContactSheetIds).toEqual(['contact-000', 'contact-009', 'contact-018']);
  expect(plan.selectedDetailFrameIds).toHaveLength(4);
  expect(new Set(provider.researchMediaPaths).size).toBe(7);
});

it('rejects unsafe Research media override before any provider invocation', async () => {
  const provider = new IntakeFixtureProvider();
  const { factory, runId, review } = await fixture(provider);
  await review();
  const previous = process.env.FACTORY_REFERENCE_RESEARCH_DETAIL_FRAMES;
  process.env.FACTORY_REFERENCE_RESEARCH_DETAIL_FRAMES = '64';
  try {
    await expect(factory.run(runId)).rejects.toThrow(/DETAIL_FRAMES must be 2\.\.6/);
  } finally {
    if (previous === undefined) delete process.env.FACTORY_REFERENCE_RESEARCH_DETAIL_FRAMES;
    else process.env.FACTORY_REFERENCE_RESEARCH_DETAIL_FRAMES = previous;
  }
  expect(provider.calls).toBe(0);
});
