import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodexCliProvider, parseCodexJsonl, type SpawnFunction } from '../../src/providers/codex-cli.js';

// Real credential-free OS processes, not EventEmitter kill acknowledgements.
async function fixture(bodies: string[]) {
  const root = await mkdtemp(path.join(tmpdir(), 'codex-budget-process-'));
  const scripts = await Promise.all(bodies.map(async (body, index) => {
    const file = path.join(root, `process-${index}.cjs`);
    await writeFile(file, `const fs = require('node:fs');\nconst output = process.argv[2];\n${body}`);
    return file;
  }));
  let calls = 0;
  const outputSignals: Promise<void>[] = [];
  const controlled: SpawnFunction = (_command, args, options) => {
    const script = scripts[calls];
    calls += 1;
    const child = spawn(process.execPath, [script!, args[args.indexOf('--output-last-message') + 1]!], options);
    outputSignals.push(new Promise<void>((resolve) => child.stdout.once('data', () => resolve())));
    return child;
  };
  const request = { label: 'BLUEPRINT', prompt: 'local fixture only', cwd: root, runRoot: root,
    sandbox: 'read-only' as const, outputPath: path.join(root, 'output.txt'), logDir: path.join(root, 'logs') };
  return { root, request, provider: () => new CodexCliProvider({ spawn: controlled, timeoutMs: 2000, maxRetries: 1 }), calls: () => calls, waitForOutput: async () => { while (outputSignals.length === 0) await new Promise((resolve) => setTimeout(resolve, 5)); await outputSignals[0]; } };
}
const turn = (tokens: number, newline = true) => `process.stdout.write(${JSON.stringify(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: tokens - 1, output_tokens: 1 } }) + (newline ? '\n' : ''))});`;
const success = (tokens: number) => `${turn(tokens)} fs.writeFileSync(output, 'ok');`;
async function cap(root: string, maxAgentTokens: number, priorTokens = 0) {
  await mkdir(path.join(root, 'artifacts'));
  await writeFile(path.join(root, 'artifacts/codex-run-budget.json'), JSON.stringify({ schemaVersion: 1, maxAgentTokens }));
  await writeFile(path.join(root, 'state.json'), JSON.stringify({ stages: { BLUEPRINT: { evidence: [], tokenUsage: { inputTokens: priorTokens, outputTokens: 0, totalTokens: priorTokens } } } }));
}

describe('Codex observed-token stop with real controlled processes', () => {
  it('does not retry a budgeted timeout and exposes/persists its observed lower bound', async () => {
    const f = await fixture([`${turn(40)} setInterval(() => {}, 1000);`, success(10)]);
    const error = await f.provider().execute({ ...f.request, maxTotalTokens: 100, timeoutMs: 1000 }).catch((error: unknown) => error);
    expect(f.calls()).toBe(1);
    expect(error).toMatchObject({ usage: { inputTokens: 39, outputTokens: 1, totalTokens: 40 }, attempts: 1 });
    const receipt = JSON.parse(await readFile(path.join(f.request.logDir, 'BLUEPRINT.attempt-1.usage.json'), 'utf8'));
    expect(receipt).toMatchObject({ cumulativeObservedTokens: 40, stopReason: 'timeout', lowerBoundOnly: true });
  });

  it('retains earlier valid usage when a later usage event is invalid', async () => {
    const f = await fixture([`${turn(40)} process.stdout.write('{"type":"turn.completed","usage":{"input_tokens":-1,"output_tokens":1}}\\n'); setInterval(() => {}, 1000);`]);
    const error = await f.provider().execute({ ...f.request, maxTotalTokens: 100 }).catch((error: unknown) => error);
    expect(error).toMatchObject({ usage: { totalTokens: 40 }, attempts: 1 });
    expect(f.calls()).toBe(1);
    expect(JSON.parse(await readFile(path.join(f.request.logDir, 'BLUEPRINT.attempt-1.usage.json'), 'utf8')))
      .toMatchObject({ cumulativeObservedTokens: 40, stopReason: 'usage-unavailable', lowerBoundOnly: true });
  });

  it('returns the sum of all observed attempts on a legacy unbudgeted retry', async () => {
    const f = await fixture([`${turn(40)} process.exitCode = 1;`, success(10)]);
    const result = await f.provider().execute(f.request);
    expect(result.attempts).toBe(2);
    expect(result.usage).toEqual({ inputTokens: 48, outputTokens: 2, totalTokens: 50 });
  });

  it('does not launch an already cancelled request', async () => {
    const f = await fixture([success(10)]);
    await expect(f.provider().execute({ ...f.request, signal: AbortSignal.abort() })).rejects.toThrow(/cancelled/u);
    expect(f.calls()).toBe(0);
  });

  it('shares historical and new usage across clients/stages and prevents resumed budget reuse', async () => {
    const f = await fixture([success(15), `${turn(10)} setInterval(() => {}, 1000);`, success(1)]);
    await cap(f.root, 100, 80);
    await f.provider().execute(f.request);
    await expect(f.provider().execute({ ...f.request, label: 'REVIEW' })).rejects.toThrow(/token-budget/u);
    await expect(f.provider().execute({ ...f.request, label: 'RESUME' })).rejects.toThrow(/budget|unresolved/u);
    expect(f.calls()).toBe(2);
    const dirs = await readdir(path.join(f.root, 'logs/codex/executions'));
    expect(dirs).toHaveLength(2);
    expect(JSON.parse(await readFile(path.join(f.request.logDir, 'BLUEPRINT.attempt-1.usage.json'), 'utf8')))
      .toMatchObject({ cumulativeObservedTokens: 15 });
  });

  it('rejects a concurrent same-run launch before it can spend the shared remainder', async () => {
    const f = await fixture([`${turn(10)} setInterval(() => {}, 1000);`, success(10)]);
    await cap(f.root, 100);
    const controller = new AbortController();
    const first = f.provider().execute({ ...f.request, signal: controller.signal }).catch((error: unknown) => error);
    // Wait for an actual spawn, not an estimated model completion time.
    while (f.calls() === 0) await new Promise((resolve) => setTimeout(resolve, 5));
    try {
      await expect(f.provider().execute({ ...f.request, label: 'SECOND' })).rejects.toThrow(/active|locked/u);
      expect(f.calls()).toBe(1);
    } finally { controller.abort(); await first; }
    await expect(f.provider().execute({ ...f.request, label: 'RESUME' })).rejects.toThrow(/unresolved/u);
    expect(f.calls()).toBe(1);
  });

  it('validates the final unterminated JSONL event before accepting success', async () => {
    const f = await fixture([`${turn(15, false)} fs.writeFileSync(output, 'ok');`]);
    await expect(f.provider().execute({ ...f.request, maxTotalTokens: 10 })).rejects.toThrow(/token-budget/u);
    expect(f.calls()).toBe(1);
  });

  it('fails closed on truncated trailing JSONL without discarding known usage', async () => {
    const f = await fixture([`${turn(15)} process.stdout.write('{"type":"turn.completed","usage":'); fs.writeFileSync(output, 'ok');`]);
    const error = await f.provider().execute({ ...f.request, maxTotalTokens: 100 }).catch((error: unknown) => error);
    expect(error).toMatchObject({ usage: { totalTokens: 15 } });
    expect(String(error)).toMatch(/usage-unavailable/u);
    expect(f.calls()).toBe(1);
  });
});

it('preserves known tokens when an external JSONL record is null', () => {
  const parsed = parseCodexJsonl('{"type":"turn.completed","usage":{"input_tokens":39,"output_tokens":1}}\nnull');
  expect(parsed.usage.totalTokens).toBe(40);
  expect(parsed.errors).toHaveLength(1);
});

it.skipIf(process.platform === 'win32')('kills TERM-ignoring CLI and tool descendants as one POSIX process group', async () => {
  const f = await fixture(['']);
  const heartbeat = path.join(f.root, 'heartbeat');
  const descendant = `const fs = require('node:fs'); process.on('SIGTERM', () => {}); fs.writeFileSync(${JSON.stringify(heartbeat)}, 'ready'); setInterval(() => fs.appendFileSync(${JSON.stringify(heartbeat)}, '.'), 20);`;
  await writeFile(path.join(f.root, 'process-0.cjs'), `const fs = require('node:fs'); const { spawn } = require('node:child_process');
    process.on('SIGTERM', () => {}); spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: 'ignore' });
    const wait = setInterval(() => { if (fs.existsSync(${JSON.stringify(heartbeat)})) { clearInterval(wait); ${turn(55)} } }, 5);
    setInterval(() => {}, 1000);`);
  await expect(f.provider().execute({ ...f.request, maxTotalTokens: 50 })).rejects.toThrow('token-budget');
  const stopped = await readFile(heartbeat, 'utf8');
  await new Promise((resolve) => setTimeout(resolve, 150));
  expect(await readFile(heartbeat, 'utf8')).toBe(stopped);
  expect(f.calls()).toBe(1);
});

it('never overwrites the response schema preserved for an earlier execution', async () => {
  const f = await fixture([success(10), success(10)]);
  const schema = { type: 'object', properties: { first: { type: 'string' } } };
  await f.provider().execute({ ...f.request, outputSchema: schema });
  await f.provider().execute({ ...f.request, outputSchema: { type: 'string' } });
  expect(JSON.parse(await readFile(path.join(f.request.logDir, 'BLUEPRINT.schema.json'), 'utf8'))).toEqual(schema);
});

it('stops a terminal failure event even when it has no diagnostic text', async () => {
  const f = await fixture([`${turn(40)} process.stdout.write('{"type":"turn.failed"}\\n'); setInterval(() => {}, 1000);`]);
  const error = await f.provider().execute({ ...f.request, maxTotalTokens: 100 }).catch((error: unknown) => error);
  expect(String(error)).toMatch(/stopped: failed/u);
  expect(error).toMatchObject({ usage: { totalTokens: 40 } });
  expect(f.calls()).toBe(1);
});

it('does not silently reuse budget from pre-ledger failure receipts', async () => {
  const f = await fixture([success(10)]);
  await cap(f.root, 100);
  await mkdir(path.join(f.root, 'logs/codex'), { recursive: true });
  await writeFile(path.join(f.root, 'logs/codex/BUILD.attempt-1.usage.json'), JSON.stringify({ schemaVersion: 1, observedCompletedTurnUsage: { inputTokens: 39, outputTokens: 1, totalTokens: 40 }, lowerBoundOnly: true }));
  await expect(f.provider().execute(f.request)).rejects.toThrow(/historical.*binding/u);
  expect(f.calls()).toBe(0);
});

it('preserves observed usage on a real mid-flight cancellation without retry', async () => {
  const f = await fixture([`${turn(40)} setInterval(() => {}, 1000);`]);
  const controller = new AbortController();
  const pending = f.provider().execute({ ...f.request, maxTotalTokens: 100, signal: controller.signal }).catch((error: unknown) => error);
  await f.waitForOutput(); controller.abort();
  expect(await pending).toMatchObject({ usage: { inputTokens: 39, outputTokens: 1, totalTokens: 40 }, attempts: 1 });
  const receipt = JSON.parse(await readFile(path.join(f.request.logDir, 'BLUEPRINT.attempt-1.usage.json'), 'utf8'));
  expect(receipt).toMatchObject({ stopReason: 'cancelled', cumulativeObservedTokens: 40, lowerBoundOnly: true });
  expect(f.calls()).toBe(1);
});

it('applies the stricter environment allowance instead of allowing a request to raise it', async () => {
  const f = await fixture([success(15)]);
  const previous = process.env.CODEX_EXEC_MAX_TOTAL_TOKENS;
  process.env.CODEX_EXEC_MAX_TOTAL_TOKENS = '10';
  try { await expect(f.provider().execute({ ...f.request, maxTotalTokens: 100 })).rejects.toThrow('token-budget'); }
  finally { if (previous === undefined) delete process.env.CODEX_EXEC_MAX_TOTAL_TOKENS; else process.env.CODEX_EXEC_MAX_TOTAL_TOKENS = previous; }
  expect(f.calls()).toBe(1);
});

it.each(['FULL_BUILD', 'FIX', 'BUILD_3_PROTOTYPES', 'BUILD_ACTION_PROTOTYPES'])('rejects an unbudgeted %s side entrypoint before launch', async (stage) => {
  const f = await fixture([success(10)]);
  const workspace = path.join(f.root, 'workspace/game');
  await mkdir(workspace, { recursive: true });
  await expect(f.provider().execute({ ...f.request, cwd: workspace, sandbox: 'workspace-write', stage,
    role: stage === 'FIX' ? 'fixer' : 'builder' })).rejects.toThrow(/requires.*run.*budget/u);
  expect(f.calls()).toBe(0);
});
