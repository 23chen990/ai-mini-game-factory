import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { CodexCliProvider, buildCodexExecArgs, parseCodexJsonl, type SpawnFunction } from '../../src/providers/codex-cli.js';

type FakeResult = { code?: number; stdout?: string; stderr?: string; output?: string; hang?: boolean; delayMs?: number };

function fakeSpawn(results: FakeResult[], calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string; env?: NodeJS.ProcessEnv }>, killed?: { value: boolean }): SpawnFunction {
  return ((command: string, args: readonly string[], options: { cwd?: string; env?: NodeJS.ProcessEnv }) => {
    const result = results.shift() ?? { code: 0 };
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; stdin: PassThrough; kill: () => boolean };
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    const call = { command, args: [...args], cwd: options.cwd, stdin: '', env: options.env }; calls.push(call);
    child.stdin.on('data', (chunk) => { call.stdin += String(chunk); });
    child.kill = () => { if (killed) killed.value = true; queueMicrotask(() => child.emit('close', null, 'SIGTERM')); return true; };
    if (!result.hang) setTimeout(async () => {
      const outputIndex = args.indexOf('--output-last-message');
      if (outputIndex >= 0 && args[outputIndex + 1] && result.output !== undefined) await writeFile(args[outputIndex + 1]!, result.output);
      if (result.stdout) child.stdout.end(result.stdout); else child.stdout.end();
      if (result.stderr) child.stderr.end(result.stderr); else child.stderr.end();
      child.emit('close', result.code ?? 0, null);
    }, result.delayMs ?? 0);
    return child as never;
  }) as SpawnFunction;
}

describe('CodexCliProvider', () => {
  it('passes only a safe environment to trusted Codex stages and strips credentials', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codex-cli-env-'));
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string; env?: NodeJS.ProcessEnv }> = [];
    const previous = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      CODEX_API_KEY: process.env.CODEX_API_KEY,
      HOME: process.env.HOME,
      PATH: process.env.PATH,
    };
    process.env.OPENAI_API_KEY = 'do-not-forward-openai';
    process.env.GITHUB_TOKEN = 'do-not-forward-github';
    process.env.CODEX_API_KEY = 'do-not-forward-codex';
    process.env.HOME = '/safe/home';
    process.env.PATH = '/safe/bin';
    try {
      const provider = new CodexCliProvider({ spawn: fakeSpawn([{ stdout: '{"type":"turn.completed","usage":{}}\n', output: 'ok' }], calls), timeoutMs: 100 });
      await provider.execute({ label: 'BLUEPRINT', prompt: 'read', cwd: root, sandbox: 'read-only', outputPath: path.join(root, 'out.txt'), logDir: path.join(root, 'logs') });
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
    expect(calls[0]?.env).toMatchObject({ PATH: '/safe/bin', HOME: '/safe/home' });
    expect(calls[0]?.env).not.toHaveProperty('OPENAI_API_KEY');
    expect(calls[0]?.env).not.toHaveProperty('GITHUB_TOKEN');
    expect(calls[0]?.env).not.toHaveProperty('CODEX_API_KEY');
  });

  it('uses an even smaller environment for the isolated Research stage', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codex-cli-research-env-'));
    const sandbox = path.join(root, 'research');
    await mkdir(sandbox);
    await mkdir(path.join(root, 'artifacts'));
    await writeFile(path.join(sandbox, 'SANDBOX_MANIFEST.json'), '{}');
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string; env?: NodeJS.ProcessEnv }> = [];
    const previous = { HOME: process.env.HOME, OPENAI_API_KEY: process.env.OPENAI_API_KEY };
    process.env.HOME = '/unsafe/home';
    process.env.OPENAI_API_KEY = 'do-not-forward';
    try {
      const provider = new CodexCliProvider({ spawn: fakeSpawn([{ stdout: '{"type":"turn.completed","usage":{}}\n', output: '{}' }], calls), timeoutMs: 100 });
      await provider.execute({ label: 'COMPETITOR_RESEARCH', prompt: 'observe', cwd: sandbox, runRoot: root, stage: 'COMPETITOR_RESEARCH', role: 'research', sandbox: 'read-only', researchIsolation: { mode: 'sanitized-read-only', root: sandbox }, outputPath: path.join(root, 'artifacts/out.json'), logDir: path.join(root, 'logs') });
    } finally {
      if (previous.HOME === undefined) delete process.env.HOME; else process.env.HOME = previous.HOME;
      if (previous.OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous.OPENAI_API_KEY;
    }
    expect(calls[0]?.env).toMatchObject({ PATH: process.env.PATH });
    expect(calls[0]?.env).not.toHaveProperty('HOME');
    expect(calls[0]?.env).not.toHaveProperty('OPENAI_API_KEY');
  });

  it('uses a per-stage model override while preserving the provider default', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codex-cli-model-'));
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    const provider = new CodexCliProvider({ model: 'default-model', spawn: fakeSpawn([{ stdout: '{"type":"thread.started","thread_id":"thread-model"}\n{"type":"turn.completed","usage":{}}\n', output: 'ok' }], calls), timeoutMs: 100 });
    await provider.execute({ label: 'UI_SKELETON', prompt: 'extract', cwd: root, sandbox: 'read-only', model: 'gpt-5.3-codex-spark', outputPath: path.join(root, 'out.txt'), logDir: path.join(root, 'logs') });
    expect(calls[0]?.args).toContain('gpt-5.3-codex-spark');
  });

  it('constructs safe read-only args with JSON, output schema and output file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codex-cli-provider-'));
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    const provider = new CodexCliProvider({ spawn: fakeSpawn([{ stdout: '{"type":"thread.started","thread_id":"thread-1"}\n{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":2}}\n', output: '{"schemaVersion":1}' }], calls), timeoutMs: 100 });

    const result = await provider.execute({ label: 'BLUEPRINT', prompt: 'Read input/seed.yaml', cwd: root, sandbox: 'read-only', outputSchema: { type: 'object', additionalProperties: false }, outputPath: path.join(root, 'game-blueprint.json'), logDir: path.join(root, 'logs') });

    expect(calls[0]?.command).toBe('codex');
    expect(calls[0]?.args).toEqual(buildCodexExecArgs({ cwd: root, sandbox: 'read-only', schemaPath: path.join(root, 'logs/BLUEPRINT.schema.json'), outputPath: path.join(root, 'game-blueprint.json') }));
    expect(calls[0]?.args).not.toContain('danger-full-access');
    expect(calls[0]?.stdin).toBe('Read input/seed.yaml');
    expect(JSON.parse(await readFile(path.join(root, 'logs/BLUEPRINT.schema.json'), 'utf8'))).toMatchObject({ type: 'object' });
    expect(result).toMatchObject({ threadId: 'thread-1', output: { schemaVersion: 1 }, usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } });
  });

  it('parses thread, completion, failure, usage and error JSONL events', () => {
    const parsed = parseCodexJsonl([
      '{"type":"thread.started","thread_id":"thread-42"}',
      '{"type":"turn.completed","usage":{"input_tokens":3,"cached_input_tokens":1,"output_tokens":4}}',
      '{"type":"error","message":"transient"}',
      '{"type":"turn.failed","error":{"message":"failed turn"}}',
    ].join('\n'));

    expect(parsed.threadId).toBe('thread-42');
    expect(parsed.completed).toBe(true);
    expect(parsed.failed).toBe(true);
    expect(parsed.usage).toEqual({ inputTokens: 3, outputTokens: 4, totalTokens: 7 });
    expect(parsed.errors).toEqual(['transient', 'failed turn']);
    expect(parsed.events).toHaveLength(4);
  });

  it('fails when JSONL reports an error even if completion and process exit succeed', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codex-cli-event-error-'));
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    const provider = new CodexCliProvider({
      spawn: fakeSpawn([{
        stdout: '{"type":"thread.started","thread_id":"thread-err"}\n{"type":"error","message":"provider failure"}\n{"type":"turn.completed","usage":{}}\n',
        output: '{"schemaVersion":1}',
      }], calls),
      timeoutMs: 100,
      maxRetries: 0,
    });

    await expect(provider.execute({
      label: 'BLUEPRINT',
      prompt: 'minimal',
      cwd: root,
      sandbox: 'read-only',
      outputPath: path.join(root, 'out.json'),
      logDir: path.join(root, 'logs'),
    })).rejects.toThrow('provider failure');
  });

  it('resumes the Builder thread in workspace-write without unsafe sandbox flags', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codex-cli-resume-'));
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    const provider = new CodexCliProvider({ spawn: fakeSpawn([{ stdout: '{"type":"thread.started","thread_id":"builder-thread"}\n{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}\n', output: 'fixed' }], calls), timeoutMs: 100 });

    const result = await provider.execute({ label: 'FIX', prompt: 'Fix only qa-report issues', cwd: root, sandbox: 'workspace-write', resumeThreadId: 'builder-thread', outputPath: path.join(root, 'summary.txt'), logDir: path.join(root, 'logs') });

    expect(calls[0]?.args.slice(0, 3)).toEqual(['exec', 'resume', 'builder-thread']);
    expect(calls[0]?.args).toContain('--json');
    expect(calls[0]?.args).not.toContain('danger-full-access');
    expect(calls[0]?.cwd).toBe(root);
    expect(result.threadId).toBe('builder-thread');
  });

  it('times out, kills the child and reports a bounded failure', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codex-cli-timeout-'));
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    const killed = { value: false };
    const provider = new CodexCliProvider({ spawn: fakeSpawn([{ hang: true }], calls, killed), timeoutMs: 5, maxRetries: 0 });

    await expect(provider.execute({ label: 'BLUEPRINT', prompt: 'minimal', cwd: root, sandbox: 'read-only', outputPath: path.join(root, 'out.json'), logDir: path.join(root, 'logs') })).rejects.toThrow(/timed out/i);
    expect(killed.value).toBe(true);
  });

  it('allows a long-running Builder request to override the text-stage timeout', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codex-cli-builder-timeout-'));
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    const provider = new CodexCliProvider({
      spawn: fakeSpawn([{
        delayMs: 20,
        stdout: '{"type":"thread.started","thread_id":"builder-thread"}\n{"type":"turn.completed","usage":{}}\n',
        output: 'built and verified',
      }], calls),
      timeoutMs: 5,
      maxRetries: 0,
    });

    const result = await provider.execute({
      label: 'BUILD',
      prompt: 'build',
      cwd: root,
      sandbox: 'workspace-write',
      outputPath: path.join(root, 'out.txt'),
      logDir: path.join(root, 'logs'),
      timeoutMs: 100,
    });

    expect(result.threadId).toBe('builder-thread');
  });

  it('allows a workspace-writing request to disable automatic process retries', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codex-cli-builder-retry-'));
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    const provider = new CodexCliProvider({
      spawn: fakeSpawn([{ code: 1, stderr: 'failed once' }, { code: 0 }], calls),
      timeoutMs: 100,
      maxRetries: 1,
    });

    await expect(provider.execute({
      label: 'BUILD',
      prompt: 'build',
      cwd: root,
      sandbox: 'workspace-write',
      outputPath: path.join(root, 'out.txt'),
      logDir: path.join(root, 'logs'),
      maxRetries: 0,
    })).rejects.toThrow('failed once');

    expect(calls).toHaveLength(1);
  });

  it('retries only up to the configured maximum', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codex-cli-retry-'));
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    const provider = new CodexCliProvider({ spawn: fakeSpawn([{ code: 1, stderr: 'one' }, { code: 1, stderr: 'two' }, { code: 0 }], calls), timeoutMs: 100, maxRetries: 1 });

    await expect(provider.execute({ label: 'BLUEPRINT', prompt: 'minimal', cwd: root, sandbox: 'read-only', outputPath: path.join(root, 'out.json'), logDir: path.join(root, 'logs') })).rejects.toThrow();
    expect(calls).toHaveLength(2);
  });

  it('rejects a missing ChatGPT login without exposing authentication text', async () => {
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    const provider = new CodexCliProvider({ spawn: fakeSpawn([{ code: 1, stderr: 'Not logged in. Authorization: Bearer secret-token-123' }], calls), timeoutMs: 100 });

    await expect(provider.assertChatGptLogin()).rejects.toThrow('Codex CLI is not logged in with ChatGPT; run codex login');
    expect(JSON.stringify(calls)).not.toContain('secret-token-123');
  });

  it('redacts authentication material from event logs and final output', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codex-cli-redaction-'));
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    const secret = 'account-token-123456789';
    const provider = new CodexCliProvider({ spawn: fakeSpawn([{ stdout: `{"type":"thread.started","thread_id":"thread-safe"}\n{"type":"turn.completed","message":"Authorization: Bearer ${secret}","usage":{}}\n`, output: `safe summary Bearer ${secret}` }], calls), timeoutMs: 100 });
    const outputPath = path.join(root, 'out.txt'); const logDir = path.join(root, 'logs');

    await provider.execute({ label: 'BUILD', prompt: 'build', cwd: root, sandbox: 'workspace-write', outputPath, logDir });

    expect(await readFile(outputPath, 'utf8')).not.toContain(secret);
    expect(await readFile(path.join(logDir, 'BUILD.attempt-1.stdout.jsonl'), 'utf8')).not.toContain(secret);
    expect(await readFile(path.join(logDir, 'BUILD.attempt-1.events.json'), 'utf8')).not.toContain(secret);
  });

  it('rejects a non-absolute or out-of-run working directory before spawning Codex', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codex-cli-cwd-boundary-'));
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    const provider = new CodexCliProvider({ spawn: fakeSpawn([{ code: 0 }], calls), timeoutMs: 100 });

    await expect(provider.execute({
      label: 'BLUEPRINT', prompt: 'minimal', cwd: 'relative/workspace', sandbox: 'read-only',
      runRoot: root, outputPath: path.join(root, 'out.json'), logDir: path.join(root, 'logs'),
    })).rejects.toThrow(/absolute|working directory|cwd/i);
    await expect(provider.execute({
      label: 'BLUEPRINT', prompt: 'minimal', cwd: path.join(root, '..', 'outside'), sandbox: 'read-only',
      runRoot: root, outputPath: path.join(root, 'out.json'), logDir: path.join(root, 'logs'),
    })).rejects.toThrow(/run root|working directory|cwd/i);
    await expect(provider.execute({
      label: 'BLUEPRINT', prompt: 'minimal', cwd: root, sandbox: 'read-only',
      runRoot: root, outputPath: path.join(root, '..', 'outside.json'), logDir: path.join(root, 'logs'),
    })).rejects.toThrow(/output|run root/i);
    expect(calls).toHaveLength(0);
  });

  it('requires mutating staged requests to run inside the current run workspace', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codex-cli-cwd-role-'));
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    const provider = new CodexCliProvider({ spawn: fakeSpawn([{ code: 0 }], calls), timeoutMs: 100 });

    await expect(provider.execute({
      label: 'BUILD', prompt: 'build', cwd: path.join(root, 'tmp'), sandbox: 'workspace-write',
      runRoot: root, stage: 'FULL_BUILD', role: 'builder', outputPath: path.join(root, 'artifacts/out.txt'), logDir: path.join(root, 'logs'),
    })).rejects.toThrow(/workspace|working directory|cwd/i);
    await expect(provider.execute({
      label: 'BLUEPRINT', prompt: 'read', cwd: path.join(root, 'workspace', 'game'), sandbox: 'read-only',
      runRoot: root, stage: 'BLUEPRINT', role: 'producer', outputPath: path.join(root, 'artifacts/out.txt'), logDir: path.join(root, 'logs'),
    })).rejects.toThrow(/workspace|working directory|cwd/i);
    expect(calls).toHaveLength(0);
  });

  it('fails closed for research unless an isolated sanitized sandbox is declared', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codex-cli-research-boundary-'));
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    const provider = new CodexCliProvider({ spawn: fakeSpawn([{ stdout: '{"type":"turn.completed","usage":{}}\n', output: '{}' }], calls), timeoutMs: 100 });
    await expect(provider.execute({
      label: 'COMPETITOR_RESEARCH', prompt: 'research', cwd: root, runRoot: root, stage: 'COMPETITOR_RESEARCH', role: 'research', sandbox: 'read-only',
      outputPath: path.join(root, 'artifacts/out.json'), logDir: path.join(root, 'logs'),
    })).rejects.toThrow(/research.*sandbox|isolation/i);
    expect(calls).toHaveLength(0);
  });
});
