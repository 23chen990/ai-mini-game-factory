import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
const exec = promisify(execFile);

it('extends the existing eval command with an explicit unverified Agent evidence report', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'factory-agent-eval-cli-'));
  try {
    const observations = path.join(root, 'observations.json');
    await writeFile(observations, '[]');
    const { stdout } = await exec('pnpm', ['factory', 'eval', '--agent-results', observations], { cwd: process.cwd(), env: { ...process.env, FACTORY_ROOT: root, FACTORY_MODE: 'mock' } });
    const result = JSON.parse(stdout);
    expect(result.report.evaluationScope).toBe('CONTROL_PLANE');
    expect(result.report.productQuality).toBe('NOT_ASSESSED');
    expect(result.report.agentEvaluation).toMatchObject({ evaluationScope: 'AGENT_EVIDENCE', status: 'UNVERIFIED', coverage: { completed: 0 } });
    expect(result.report.agentEvaluation.coverage.total).toBeGreaterThan(0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('does not silently ignore an invalid Agent results file', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'factory-agent-eval-cli-invalid-'));
  try {
    const observations = path.join(root, 'observations.json'); await writeFile(observations, '{}');
    await expect(exec('pnpm', ['factory', 'eval', '--agent-results', observations], { cwd: process.cwd(), env: { ...process.env, FACTORY_ROOT: root, FACTORY_MODE: 'mock' } })).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});


it('rejects an explicit Agent-results flag without its required operand', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'factory-agent-eval-cli-bare-'));
  try {
    await expect(exec('pnpm', ['factory', 'eval', '--agent-results'], { cwd: process.cwd(), env: { ...process.env, FACTORY_ROOT: root, FACTORY_MODE: 'mock' } }))
      .rejects.toMatchObject({ stderr: expect.stringContaining('Missing --agent-results file') });
    await expect(readFile(path.join(root, 'factory-eval/latest.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
