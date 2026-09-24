import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RuntimeAdapter } from '../../src/adapters/runtime.js';
import { BuilderAgent } from '../../src/agents/index.js';
import { CodexAccountProvider, type CodexExecutor } from '../../src/providers/codex-account.js';
import { MockCodexProvider } from '../../src/providers/mock.js';
import type { CodexExecRequest, CodexExecResult } from '../../src/providers/codex-cli.js';
import type { CodexProvider } from '../../src/providers/interfaces.js';
import type { ActionMechanicExperimentSpec } from '../../src/schemas/action-mechanic-experiment.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const geometryHash = `sha256:${'1'.repeat(64)}`;
const treatmentHashes = {
  A: `sha256:${'a'.repeat(64)}`,
  B: `sha256:${'b'.repeat(64)}`,
  C: `sha256:${'c'.repeat(64)}`,
} as const;

function experimentSpec(): ActionMechanicExperimentSpec {
  return {
    schemaVersion: 1,
    experimentId: 'lantern-ferry-action-v1',
    question: 'Which hold/release treatment makes swinging legible and satisfying?',
    coreAction: 'Hold to attach and release to preserve momentum.',
    decisionIntervalMs: 900,
    sourceWorkspace: 'runs/lantern-ferry/workspace/prototype-a',
    sharedGeometryFixture: 'fixtures/action-course-v1.json',
    constraints: { greyboxOnly: true, chaseIncluded: false, formalUiIncluded: false, iaaIncluded: false },
    prototypes: (['A', 'B', 'C'] as const).map((slot) => ({
      slot,
      name: `Treatment ${slot}`,
      workspace: `workspace/action-prototype-${slot.toLowerCase()}`,
      geometryFixtureHash: geometryHash,
      treatmentHash: treatmentHashes[slot],
      hypothesis: `${slot} reveals release timing.`,
      treatment: [`Treatment ${slot}`],
    })),
    automaticQaThresholds: {
      inputResponseMs: { max: 100 },
      releaseVelocityRetentionRatio: { min: 0.9 },
      wrongHookAttachments: { max: 0 },
      maxEventGapMs: { max: 1_000 },
      retryFrictionMs: { max: 500 },
      missedFinishDetections: { max: 0 },
    },
  };
}

function actionContract(slot: 'A' | 'B' | 'C') {
  return `<!doctype html><!-- input-response release-kinematics hook-selection event-gap retry-friction finish-crossing --><script>window.__ACTION_TEST__={"contractVersion":1,getManifest(){return {"slot":'${slot}',fixedStepSeconds:1/60,courseFixtureHash:'${geometryHash}',anchorPolicy:'test'}},resetGame(){},getState(){},act(){},advanceTicks(){},loadScenario(){},getEvents(){return []}}</script>`;
}

describe('BuilderAgent action prototypes', () => {
  it('copies one clean source into three isolated specified workspaces and preserves experiment hashes', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'action-builder-run-'));
    const source = await mkdtemp(path.join(tmpdir(), 'action-builder-source-'));
    roots.push(runRoot, source);
    await mkdir(path.join(source, 'src'), { recursive: true });
    await mkdir(path.join(source, 'node_modules/pkg'), { recursive: true });
    await mkdir(path.join(source, 'dist'), { recursive: true });
    await mkdir(path.join(source, 'screenshots'), { recursive: true });
    await writeFile(path.join(source, 'src/game.ts'), 'export const sourceMarker = true;');
    await writeFile(path.join(source, 'node_modules/pkg/index.js'), 'excluded dependency');
    await writeFile(path.join(source, 'dist/index.html'), 'excluded stale build');
    await writeFile(path.join(source, 'screenshots/qa.png'), 'excluded QA evidence');
    await writeFile(path.join(source, 'qa-report.json'), '{"excluded":true}');
    await writeFile(path.join(source, 'QA-EVIDENCE.md'), 'excluded QA evidence summary');

    const calls: Array<{ workspace: string; spec: ActionMechanicExperimentSpec; slot: string }> = [];
    const provider: CodexProvider = {
      async actionPrototype(input) {
        calls.push({ workspace: input.workspace, spec: input.spec, slot: input.variant.slot });
        await mkdir(path.join(input.workspace, 'dist'), { recursive: true });
        await writeFile(path.join(input.workspace, 'dist/index.html'), actionContract(input.variant.slot));
        return { verificationMode: 'full', metrics: { provider: 'test', model: 'test', calls: 1 } };
      },
      async build() { throw new Error('not used'); },
      async fix() { throw new Error('not used'); },
    };
    const spec = experimentSpec();
    const builder = new BuilderAgent(provider, {} as RuntimeAdapter);

    const result = await builder.buildActionPrototypes(runRoot, source, spec);

    expect(calls).toHaveLength(3);
    expect(calls.map(({ workspace }) => workspace)).toEqual(spec.prototypes.map(({ workspace }) => path.join(runRoot, workspace)));
    expect(calls.map(({ slot }) => slot)).toEqual(['A', 'B', 'C']);
    expect(calls.every(({ spec: received }) => JSON.stringify(received) === JSON.stringify(spec))).toBe(true);
    expect(result.metrics.calls).toBe(3);
    expect(result.report.prototypes.map(({ geometryFixtureHash, treatmentHash }) => ({ geometryFixtureHash, treatmentHash }))).toEqual(
      spec.prototypes.map(({ geometryFixtureHash, treatmentHash }) => ({ geometryFixtureHash, treatmentHash })),
    );
    for (const variant of spec.prototypes) {
      const workspace = path.join(runRoot, variant.workspace);
      expect(await readFile(path.join(workspace, 'src/game.ts'), 'utf8')).toContain('sourceMarker');
      await expect(readFile(path.join(workspace, 'node_modules/pkg/index.js'))).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(path.join(workspace, 'screenshots/qa.png'))).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(path.join(workspace, 'qa-report.json'))).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(path.join(workspace, 'QA-EVIDENCE.md'))).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readFile(path.join(workspace, 'dist/index.html'), 'utf8')).toContain('__ACTION_TEST__');
    }
  });

  it('rejects before creating a workspace when the provider has no action prototype capability', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'action-builder-fallback-run-'));
    const source = await mkdtemp(path.join(tmpdir(), 'action-builder-fallback-source-'));
    roots.push(runRoot, source);
    await writeFile(path.join(source, 'README.md'), 'source');
    const provider: CodexProvider = {
      async build() { throw new Error('not used'); },
      async fix() { throw new Error('not used'); },
    };

    const spec = experimentSpec();
    await expect(new BuilderAgent(provider, {} as RuntimeAdapter).buildActionPrototypes(runRoot, source, spec)).rejects.toThrow(/action prototype.*capability/i);
    await expect(readFile(path.join(runRoot, spec.prototypes[0]!.workspace, 'dist/index.html'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('propagates provider capacity failures without creating a fallback success', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'action-builder-capacity-run-'));
    const source = await mkdtemp(path.join(tmpdir(), 'action-builder-capacity-source-'));
    roots.push(runRoot, source);
    await writeFile(path.join(source, 'README.md'), 'source');
    let calls = 0;
    const provider: CodexProvider = {
      async actionPrototype({ workspace }) {
        calls += 1;
        await writeFile(path.join(workspace, 'provider-failure.log'), 'capacity diagnostics');
        throw new Error('provider at capacity; try again later');
      },
      async build() { throw new Error('not used'); },
      async fix() { throw new Error('not used'); },
    };

    await expect(new BuilderAgent(provider, {} as RuntimeAdapter).buildActionPrototypes(runRoot, source, experimentSpec())).rejects.toThrow(/capacity/i);
    expect(calls).toBe(1);
    await expect(readFile(path.join(runRoot, experimentSpec().prototypes[0]!.workspace, 'dist/index.html'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(path.join(runRoot, experimentSpec().prototypes[0]!.workspace, 'provider-failure.log'), 'utf8')).toContain('capacity diagnostics');
  });

  it('does not let a mock fixture resume as real provider output', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'action-builder-provenance-run-'));
    const source = await mkdtemp(path.join(tmpdir(), 'action-builder-provenance-source-'));
    roots.push(runRoot, source);
    await writeFile(path.join(source, 'README.md'), 'source');
    const spec = experimentSpec();
    const mockProvider = new MockCodexProvider();
    const first = await new BuilderAgent(mockProvider, {} as RuntimeAdapter).buildActionPrototypes(runRoot, source, spec);
    expect(first.report.prototypes.every((prototype) => prototype.verification.includes('provider-mock-fixture'))).toBe(true);

    let calls = 0;
    const realProvider: CodexProvider = {
      async actionPrototype({ workspace, variant }) {
        calls += 1;
        await mkdir(path.join(workspace, 'dist'), { recursive: true });
        await writeFile(path.join(workspace, 'dist/index.html'), actionContract(variant.slot));
        return { verificationMode: 'full', metrics: { provider: 'test', model: 'test', calls: 1 } };
      },
      async build() { throw new Error('not used'); },
      async fix() { throw new Error('not used'); },
    };

    const second = await new BuilderAgent(realProvider, {} as RuntimeAdapter).buildActionPrototypes(runRoot, source, spec);
    expect(calls).toBe(3);
    expect(second.report.prototypes.every((prototype) => prototype.verification.includes('source:isolated-copy'))).toBe(true);
    expect(second.report.prototypes.some((prototype) => prototype.verification.includes('resume:existing-output'))).toBe(false);
    const provenance = JSON.parse(await readFile(path.join(runRoot, spec.prototypes[0]!.workspace, 'dist/action-prototype-provenance.json'), 'utf8')) as Record<string, unknown>;
    expect(provenance).toMatchObject({ mode: 'provider', provider: 'test', slot: 'A', geometryFixtureHash: geometryHash, treatmentHash: treatmentHashes.A });
  });

  it('resumes a hash-bound provider output without a duplicate call', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'action-builder-resume-run-'));
    const source = await mkdtemp(path.join(tmpdir(), 'action-builder-resume-source-'));
    roots.push(runRoot, source);
    await writeFile(path.join(source, 'README.md'), 'source');
    const calls: string[] = [];
    const provider: CodexProvider = {
      async actionPrototype({ workspace, variant }) {
        calls.push(variant.slot);
        await mkdir(path.join(workspace, 'dist'), { recursive: true });
        await writeFile(path.join(workspace, 'dist/index.html'), actionContract(variant.slot));
        await writeFile(path.join(workspace, 'dist/served.js'), 'asset-v1');
        return { verificationMode: 'full', metrics: { provider: 'test', model: 'test', calls: 1 } };
      },
      async build() { throw new Error('not used'); },
      async fix() { throw new Error('not used'); },
    };
    const builder = new BuilderAgent(provider, {} as RuntimeAdapter);
    const first = await builder.buildActionPrototypes(runRoot, source, experimentSpec());
    const firstHtml = await readFile(path.join(runRoot, first.report.prototypes[0]!.entrypoint), 'utf8');
    const second = await builder.buildActionPrototypes(runRoot, source, experimentSpec());

    expect(calls).toEqual(['A', 'B', 'C']);
    expect(second.report.prototypes.every((prototype) => prototype.verification.includes('resume:existing-output'))).toBe(true);
    expect(await readFile(path.join(runRoot, second.report.prototypes[0]!.entrypoint), 'utf8')).toBe(firstHtml);
  });

  it('archives stale output and user files when treatment changes', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'action-builder-archive-run-'));
    const source = await mkdtemp(path.join(tmpdir(), 'action-builder-archive-source-'));
    roots.push(runRoot, source);
    await writeFile(path.join(source, 'README.md'), 'source');
    const calls: string[] = [];
    const provider: CodexProvider = {
      async actionPrototype({ workspace, variant }) {
        calls.push(variant.slot);
        await mkdir(path.join(workspace, 'dist'), { recursive: true });
        await writeFile(path.join(workspace, 'dist/index.html'), actionContract(variant.slot));
        return { verificationMode: 'full', metrics: { provider: 'test', model: 'test', calls: 1 } };
      },
      async build() { throw new Error('not used'); },
      async fix() { throw new Error('not used'); },
    };
    const builder = new BuilderAgent(provider, {} as RuntimeAdapter);
    const spec = experimentSpec();
    await builder.buildActionPrototypes(runRoot, source, spec);
    await writeFile(path.join(runRoot, spec.prototypes[0]!.workspace, 'user-sentinel.txt'), 'keep this file');
    const changedSpec = {
      ...spec,
      prototypes: spec.prototypes.map((prototype) => prototype.slot === 'A' ? { ...prototype, treatmentHash: `sha256:${'d'.repeat(64)}` } : prototype),
    };

    await builder.buildActionPrototypes(runRoot, source, changedSpec);

    expect(calls).toEqual(['A', 'B', 'C', 'A']);
    const archiveEntries = await readdir(path.join(runRoot, 'history/factory-migrations'), { withFileTypes: true });
    const actionArchive = archiveEntries.find((entry) => entry.name.startsWith('action-prototype-a-'));
    expect(actionArchive).toBeDefined();
    expect(await readFile(path.join(runRoot, 'history/factory-migrations', actionArchive!.name, 'files', spec.prototypes[0]!.workspace, 'user-sentinel.txt'), 'utf8')).toBe('keep this file');
    expect(await readFile(path.join(runRoot, 'history/factory-migrations', actionArchive!.name, 'files', spec.prototypes[0]!.workspace, 'dist/index.html'), 'utf8')).toContain('__ACTION_TEST__');
  });

  it('rebuilds when output bytes or provenance binding changes', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'action-builder-integrity-run-'));
    const source = await mkdtemp(path.join(tmpdir(), 'action-builder-integrity-source-'));
    roots.push(runRoot, source);
    await writeFile(path.join(source, 'README.md'), 'source');
    const calls: string[] = [];
    const provider: CodexProvider = {
      async actionPrototype({ workspace, variant }) {
        calls.push(variant.slot);
        await mkdir(path.join(workspace, 'dist'), { recursive: true });
        await writeFile(path.join(workspace, 'dist/index.html'), actionContract(variant.slot));
        return { verificationMode: 'full', metrics: { provider: 'test', model: 'test', calls: 1 } };
      },
      async build() { throw new Error('not used'); },
      async fix() { throw new Error('not used'); },
    };
    const builder = new BuilderAgent(provider, {} as RuntimeAdapter);
    const spec = experimentSpec();
    await builder.buildActionPrototypes(runRoot, source, spec);
    const indexPath = path.join(runRoot, spec.prototypes[0]!.workspace, 'dist/index.html');
    const provenancePath = path.join(runRoot, spec.prototypes[0]!.workspace, 'dist/action-prototype-provenance.json');
    const servedAssetPath = path.join(runRoot, spec.prototypes[0]!.workspace, 'dist/served.js');
    await writeFile(servedAssetPath, 'asset-v2');
    await builder.buildActionPrototypes(runRoot, source, spec);
    await writeFile(indexPath, `${await readFile(indexPath, 'utf8')}<!-- changed output -->`);
    await builder.buildActionPrototypes(runRoot, source, spec);
    const provenance = JSON.parse(await readFile(provenancePath, 'utf8')) as Record<string, unknown>;
    await writeFile(provenancePath, JSON.stringify({ ...provenance, provider: 'tampered-provider' }));
    await builder.buildActionPrototypes(runRoot, source, spec);

    expect(calls).toEqual(['A', 'B', 'C', 'A', 'A', 'A']);
  });

  it('does not resume a candidate copied from another run', async () => {
    const source = await mkdtemp(path.join(tmpdir(), 'action-builder-cross-run-source-'));
    const firstRunRoot = await mkdtemp(path.join(tmpdir(), 'action-builder-cross-run-first-'));
    const secondRunRoot = await mkdtemp(path.join(tmpdir(), 'action-builder-cross-run-second-'));
    roots.push(source, firstRunRoot, secondRunRoot);
    await writeFile(path.join(source, 'README.md'), 'source');
    const calls: string[] = [];
    const provider: CodexProvider = {
      async actionPrototype({ workspace, variant }) {
        calls.push(variant.slot);
        await mkdir(path.join(workspace, 'dist'), { recursive: true });
        await writeFile(path.join(workspace, 'dist/index.html'), actionContract(variant.slot));
        await writeFile(path.join(workspace, 'dist/served.js'), `asset-${variant.slot}`);
        return { verificationMode: 'full', metrics: { provider: 'test', model: 'test', calls: 1 } };
      },
      async build() { throw new Error('not used'); },
      async fix() { throw new Error('not used'); },
    };
    const builder = new BuilderAgent(provider, {} as RuntimeAdapter);
    const spec = experimentSpec();
    await builder.buildActionPrototypes(firstRunRoot, source, spec);
    await Promise.all(spec.prototypes.map(async (prototype) => {
      const destination = path.join(secondRunRoot, prototype.workspace);
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(path.join(firstRunRoot, prototype.workspace), destination, { recursive: true });
    }));

    const result = await builder.buildActionPrototypes(secondRunRoot, source, spec);

    expect(calls).toEqual(['A', 'B', 'C', 'A', 'B', 'C']);
    expect(result.report.prototypes.every((prototype) => prototype.verification.includes('source:isolated-copy'))).toBe(true);
  });
});

class FakeExecutor implements CodexExecutor {
  readonly requests: CodexExecRequest[] = [];
  async assertChatGptLogin() { return { method: 'chatgpt' as const, message: 'logged in' }; }
  async execute(request: CodexExecRequest): Promise<CodexExecResult> {
    this.requests.push(request);
    return { events: [], threadId: 'action-thread', completed: true, failed: false, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, errors: [], output: 'done', attempts: 1, stdout: '', stderr: '' };
  }
}

it('instructs the Codex account Builder to preserve the isolated action experiment contract', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'action-builder-codex-'));
  roots.push(workspace);
  const client = new FakeExecutor();
  const provider = new CodexAccountProvider(client);
  const spec = experimentSpec();

  await provider.actionPrototype({ workspace, spec, variant: spec.prototypes[1]! });

  expect(client.requests[0]).toMatchObject({ label: 'ACTION_PROTOTYPE_B', cwd: workspace, sandbox: 'workspace-write', maxRetries: 0 });
  const prompt = client.requests[0]?.prompt ?? '';
  expect(prompt).toContain('BuilderAgent');
  expect(prompt).toMatch(/only.*isolated.*workspace/i);
  expect(prompt).toMatch(/same geometry/i);
  expect(prompt).toMatch(/no chase/i);
  expect(prompt).toMatch(/no.*art/i);
  expect(prompt).toMatch(/no formal UI/i);
  expect(prompt).toMatch(/no IAA/i);
  expect(prompt).toMatch(/do not add.*dependenc/i);
  expect(prompt).toMatch(/web-lite.*QA.*not.*(?:WeChat|Douyin|TapTap).*publish/i);
  expect(prompt).toMatch(/window\.__ACTION_TEST__/);
  expect(prompt).toMatch(/contractVersion.*1/i);
  for (const scenario of ['input-response', 'release-kinematics', 'hook-selection', 'event-gap', 'retry-friction', 'finish-crossing']) {
    expect(prompt).toContain(scenario);
  }
  expect(prompt).toMatch(/attachedAnchorId.*ropeLength.*eventSeq/s);
  expect(prompt).toMatch(/tests.*typecheck.*build/i);
});
