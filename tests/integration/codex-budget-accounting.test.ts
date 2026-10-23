import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { createFactory } from '../../src/factory.js';
import { MockAgentProvider } from '../../src/providers/mock.js';
import { CodexExecutionError } from '../../src/providers/codex-cli.js';

it('persists the effective run ceiling and records failed Codex usage exactly once', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'factory-codex-budget-'));
  const executionId = 'c7034409-23b3-48b8-955f-2b900a202a60';
  class StoppedProvider extends MockAgentProvider {
    override async generateCompetitorResearch(): Promise<never> {
      throw new CodexExecutionError('codex exec stopped: token-budget', { inputTokens: 350, outputTokens: 50, totalTokens: 400 }, 1, executionId, 'controlled-no-model');
    }
  }
  try {
    const seed = path.join(root, 'seed.yaml');
    await writeFile(seed, 'title: Budget fixture\ntheme: original fixture\ntemplate: idle-shop-v1\ndesignMode: prototype_tournament\n');
    const factory = createFactory({ root, repositoryRoot: process.cwd(), mode: 'mock', qaMode: 'stub', agentProvider: new StoppedProvider() });
    const runId = await factory.newRun(seed);
    await expect(factory.run(runId)).rejects.toThrow('token-budget');
    const state = await factory.status(runId);
    expect(state.stages.COMPETITOR_RESEARCH).toMatchObject({ tokenUsage: { totalTokens: 400 }, providerCalls: { agent: 1 } });
    expect(state.stages.COMPETITOR_RESEARCH?.evidence).toContain(`codex-execution:${executionId}`);
    const artifacts = path.join(root, 'runs', runId, 'artifacts');
    expect(JSON.parse(await readFile(path.join(artifacts, 'codex-run-budget.json'), 'utf8'))).toMatchObject({ maxAgentTokens: expect.any(Number) });
    expect(JSON.parse(await readFile(path.join(artifacts, 'cost-usage.json'), 'utf8'))).toMatchObject({ agentTokens: 400 });
  } finally { await rm(root, { recursive: true, force: true }); }
});
