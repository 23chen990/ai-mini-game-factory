import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { CodexCliProvider, buildCodexExecArgs, parseCodexJsonl, type CodexExecRequest, type SpawnFunction } from '../../src/providers/codex-cli.js';
import { QA_BROWSER_TARGETS } from '../../src/qa/browser-preflight.js';

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

async function researchImageRequest(options: { listed?: boolean; tampered?: boolean; mediaPath?: string } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'codex-cli-bound-image-'));
  const sandbox = path.join(root, 'research-sandbox/reference_deep_research');
  const relative = options.mediaPath ?? 'reference-evidence/derived/recording/frame.png';
  const imagePath = path.join(sandbox, 'reference-evidence/derived/recording/frame.png');
  const bytes = Buffer.from('fixture image bytes');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  await mkdir(path.dirname(imagePath), { recursive: true });
  await mkdir(path.join(root, 'artifacts'));
  await writeFile(imagePath, options.tampered ? 'tampered bytes' : bytes);
  await writeFile(path.join(sandbox, 'SANDBOX_MANIFEST.json'), JSON.stringify({
    schemaVersion: 1, stage: 'REFERENCE_DEEP_RESEARCH', mode: 'sanitized-read-only',
    rootRelative: 'research-sandbox/reference_deep_research',
    allowedFiles: options.listed === false ? [] : [relative], inputHashes: {},
    mediaFiles: [{ path: relative, sha256 }], createdAt: new Date().toISOString(),
  }));
  const request: CodexExecRequest = {
    label: 'REFERENCE_DEEP_RESEARCH', prompt: 'inspect selected image', cwd: sandbox, runRoot: root,
    stage: 'REFERENCE_DEEP_RESEARCH', role: 'research', sandbox: 'read-only',
    researchIsolation: { mode: 'sanitized-read-only', root: sandbox },
    outputPath: path.join(root, 'artifacts/out.json'), logDir: path.join(root, 'logs'),
  };
  return { request, imagePath };
}

async function qaObservation(root: string) {
  await mkdir(path.join(root, 'qa'), { recursive: true });
  await mkdir(path.join(root, 'workspace/game/dist'), { recursive: true });
  const buildPath = 'workspace/game/dist/index.html';
  const tracePath = 'qa/natural.json';
  await writeFile(path.join(root, buildPath), '<html>controlled transport fixture, not Agent evidence</html>');
  await writeFile(path.join(root, 'qa/frame.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlWQAAAAASUVORK5CYII=', 'base64'));
  const buildSha256 = createHash('sha256').update(await readFile(path.join(root, buildPath))).digest('hex');
  await writeFile(path.join(root, tracePath), JSON.stringify({ schemaVersion: 1, startedFromReset: true,
    actions: ['touchscreen.tap at 120ms'], transitions: [{ name: 'primary-action', changed: true, evidence: 'fixture only' }],
    completion: 'none', replayObserved: false, forbiddenOperations: [], screenshots: ['qa/frame.png'],
    passed: false, blockers: ['fixture, not product acceptance'], buildHash: buildSha256, observedAt: new Date().toISOString() }));
  return { buildPath, buildSha256, tracePath, traceSha256: createHash('sha256').update(await readFile(path.join(root, tracePath))).digest('hex') };
}
const readyQaBrowser = async () => ({ schemaVersion: 1 as const, scope: 'HOST_BROWSER_SMOKE_ONLY' as const, ready: true,
  checkedAt: new Date().toISOString(), checks: QA_BROWSER_TARGETS.map((target) => ({ ...target, passed: true, screenshotBytes: 2048, blocker: null })) });

describe('CodexCliProvider', () => {
  it('does not launch a token-consuming blind QA Agent when the browser cannot launch/click/capture', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codex-qa-browser-block-'));
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    const provider = new CodexCliProvider({
      spawn: fakeSpawn([{ stdout: '{"type":"turn.completed","usage":{}}\\n', output: 'SHOULD NOT RUN' }], calls),
      qaBrowserPreflight: async () => ({
        schemaVersion: 1, scope: 'HOST_BROWSER_SMOKE_ONLY', ready: false, checkedAt: new Date().toISOString(),
        checks: [{ engine: 'chromium', label: 'mobile', viewport: { width: 390, height: 844 }, passed: false, screenshotBytes: null, blocker: 'browser unavailable' }],
      }),
      maxRetries: 1,
    });
    await expect(provider.execute({
      label: 'BLIND_PLAYTEST_QA', stage: 'BLIND_PLAYTEST_QA', role: 'reviewer', sandbox: 'read-only',
      prompt: 'play the game', cwd: root, runRoot: root,
      outputPath: path.join(root, 'out.json'), logDir: path.join(root, 'logs'),
    })).rejects.toThrow('QA_BROWSER_UNAVAILABLE');
    expect(calls).toHaveLength(0);
    expect(JSON.parse(await readFile(path.join(root, 'logs/BLIND_PLAYTEST_QA.qa-browser-preflight.json'), 'utf8')))
      .toMatchObject({ ready: false, scope: 'HOST_BROWSER_SMOKE_ONLY' });
  });

  it('allows a budgeted blind QA call only after all four browser checks pass', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codex-qa-browser-ready-'));
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    let preflights = 0;
    const provider = new CodexCliProvider({
      spawn: fakeSpawn([{
        stdout: '{"type":"turn.completed","usage":{"input_tokens":3,"output_tokens":2}}\n',
        output: '{"qa":"requires independent evidence"}',
      }], calls),
      qaBrowserPreflight: async () => {
        preflights += 1;
        return {
          schemaVersion: 1, scope: 'HOST_BROWSER_SMOKE_ONLY', ready: true,
          checkedAt: new Date().toISOString(),
          checks: QA_BROWSER_TARGETS.map((target) => ({ ...target, passed: true, screenshotBytes: 2_048, blocker: null })),
        };
      },
      maxRetries: 0, timeoutMs: 500,
    });
    const result = await provider.execute({
      label: 'BLIND_PLAYTEST_QA', stage: 'BLIND_PLAYTEST_QA', role: 'reviewer', sandbox: 'read-only',
      prompt: 'evaluate independent evidence', cwd: root, runRoot: root, qaObservation: await qaObservation(root),
      outputPath: path.join(root, 'out.json'), logDir: path.join(root, 'logs'),
    });
    expect(calls[0]!.args).toContain('--image');
    expect(calls[0]!.args).toContain(path.join(root, 'qa/frame.png'));
    expect(preflights).toBe(1);
    expect(calls).toHaveLength(1);
    expect(result.usage.totalTokens).toBe(5);
    expect(JSON.parse(await readFile(path.join(root, 'logs/BLIND_PLAYTEST_QA.qa-browser-preflight.json'), 'utf8')))
      .toMatchObject({ ready: true, scope: 'HOST_BROWSER_SMOKE_ONLY' });
  });

  it('blocks a seeing-host but observation-less QA before any model spawn or usage lease', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'qa-no-observation-'));
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    const provider = new CodexCliProvider({ spawn: fakeSpawn([], calls), qaBrowserPreflight: readyQaBrowser });
    await expect(provider.execute({ label: 'QA', stage: 'QA', cwd: root, runRoot: root, sandbox: 'read-only',
      prompt: 'inspect', outputPath: path.join(root, 'out.json'), logDir: path.join(root, 'logs') })).rejects.toThrow('QA_OBSERVATIONS_REQUIRED');
    expect(calls).toHaveLength(0);
  });

  it.each(['build', 'trace', 'escape'])('rejects %s identity failure before QA model spawn', async (fault) => {
    const root = await mkdtemp(path.join(tmpdir(), 'qa-bad-observation-'));
    const observation = await qaObservation(root);
    if (fault === 'build') await writeFile(path.join(root, observation.buildPath), 'changed build');
    if (fault === 'trace') await writeFile(path.join(root, observation.tracePath), '{}');
    if (fault === 'escape') observation.tracePath = '../foreign.json';
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    const provider = new CodexCliProvider({ spawn: fakeSpawn([], calls), qaBrowserPreflight: readyQaBrowser });
    await expect(provider.execute({ label: 'QA', stage: 'QA', cwd: root, runRoot: root, sandbox: 'read-only',
      qaObservation: observation, prompt: 'inspect', outputPath: path.join(root, 'out.json'), logDir: path.join(root, 'logs') })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

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

  it('attaches a verified Research image to the Codex prompt instead of only copying it into the sandbox', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codex-cli-research-image-'));
    const sandbox = path.join(root, 'research-sandbox/reference_deep_research');
    const relative = 'reference-evidence/derived/recording/frame.png';
    const imagePath = path.join(sandbox, relative);
    const bytes = Buffer.from('fixture image bytes');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await mkdir(path.dirname(imagePath), { recursive: true });
    await mkdir(path.join(root, 'artifacts'));
    await writeFile(imagePath, bytes);
    await writeFile(path.join(sandbox, 'SANDBOX_MANIFEST.json'), JSON.stringify({
      schemaVersion: 1, stage: 'REFERENCE_DEEP_RESEARCH', mode: 'sanitized-read-only',
      rootRelative: 'research-sandbox/reference_deep_research', allowedFiles: [relative], inputHashes: {},
      mediaFiles: [{ path: relative, sha256 }], createdAt: new Date().toISOString(),
    }));
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    const provider = new CodexCliProvider({ spawn: fakeSpawn([{ stdout: '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}\n', output: '{}' }], calls), timeoutMs: 100 });
    await provider.execute({ label: 'REFERENCE_DEEP_RESEARCH', prompt: 'inspect selected image', cwd: sandbox, runRoot: root,
      stage: 'REFERENCE_DEEP_RESEARCH', role: 'research', sandbox: 'read-only',
      researchIsolation: { mode: 'sanitized-read-only', root: sandbox }, outputPath: path.join(root, 'artifacts/out.json'), logDir: path.join(root, 'logs') });
    expect(calls[0]?.args.slice(calls[0].args.indexOf('--image'), calls[0].args.indexOf('--image') + 2)).toEqual(['--image', imagePath]);
  });

  it('rejects a Research image absent from the sandbox allowlist before model launch', async () => {
    const { request } = await researchImageRequest({ listed: false });
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    const provider = new CodexCliProvider({ spawn: fakeSpawn([], calls), timeoutMs: 100 });
    await expect(provider.execute(request)).rejects.toThrow(/allowlist/i);
    expect(calls).toHaveLength(0);
  });

  it('rejects a Research image changed after evidence binding before model launch', async () => {
    const { request } = await researchImageRequest({ tampered: true });
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    const provider = new CodexCliProvider({ spawn: fakeSpawn([], calls), timeoutMs: 100 });
    await expect(provider.execute(request)).rejects.toThrow(/hash mismatch/i);
    expect(calls).toHaveLength(0);
  });

  it('rejects a Research image path that escapes the sandbox before model launch', async () => {
    const { request } = await researchImageRequest({ mediaPath: '../../outside.png' });
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    const provider = new CodexCliProvider({ spawn: fakeSpawn([], calls), timeoutMs: 100 });
    await expect(provider.execute(request)).rejects.toThrow(/path|sandbox/i);
    expect(calls).toHaveLength(0);
  });

  it('uses a per-stage model override while preserving the provider default', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codex-cli-model-'));
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    const provider = new CodexCliProvider({ model: 'default-model', spawn: fakeSpawn([{ stdout: '{"type":"thread.started","thread_id":"thread-model"}\n{"type":"turn.completed","usage":{}}\n', output: 'ok' }], calls), timeoutMs: 100 });
    await provider.execute({ label: 'UI_SKELETON', prompt: 'extract', cwd: root, sandbox: 'read-only', model: 'gpt-5.3-codex-spark', outputPath: path.join(root, 'out.txt'), logDir: path.join(root, 'logs') });
    expect(calls[0]?.args).toContain('gpt-5.3-codex-spark');
  });

  it.each(['provider-default', 'request-override'])('keeps the display-only model sentinel out of CLI args: %s', async (source) => {
    const root = await mkdtemp(path.join(tmpdir(), 'codex-cli-default-sentinel-'));
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    const provider = new CodexCliProvider({
      model: source === 'provider-default' ? 'account-default' : 'configured-model',
      spawn: fakeSpawn([{ stdout: '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}\n', output: 'ok' }], calls),
      timeoutMs: 100,
    });
    await provider.execute({ label: 'BLUEPRINT', prompt: 'transport test only', cwd: root, sandbox: 'read-only',
      model: source === 'request-override' ? 'account-default' : undefined,
      outputPath: path.join(root, 'out.txt'), logDir: path.join(root, 'logs') });
    expect(calls[0]!.args).not.toContain('--model');
    expect(calls[0]!.args).not.toContain('account-default');
    expect(calls[0]!.args).toContain('forced_login_method="chatgpt"');
  });

  it('constructs safe read-only args with JSON, output schema and output file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codex-cli-provider-'));
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    const provider = new CodexCliProvider({ spawn: fakeSpawn([{ stdout: '{"type":"thread.started","thread_id":"thread-1"}\n{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":2}}\n', output: '{"schemaVersion":1}' }], calls), timeoutMs: 100 });

    const result = await provider.execute({ label: 'BLUEPRINT', prompt: 'Read input/seed.yaml', cwd: root, sandbox: 'read-only', outputSchema: { type: 'object', additionalProperties: false }, outputPath: path.join(root, 'game-blueprint.json'), logDir: path.join(root, 'logs') });

    expect(calls[0]?.command).toBe('codex');
    expect(calls[0]?.args).toEqual(buildCodexExecArgs({ cwd: root, sandbox: 'read-only', schemaPath: path.join(root, `logs/codex/executions/${result.executionId}/BLUEPRINT.schema.json`), outputPath: path.join(root, `logs/codex/executions/${result.executionId}/BLUEPRINT.attempt-1.last-message.txt`) }));
    expect(calls[0]?.args).not.toContain('danger-full-access');
    expect(calls[0]?.stdin).toBe('Read input/seed.yaml');
    expect(JSON.parse(await readFile(path.join(root, 'logs/BLUEPRINT.schema.json'), 'utf8'))).toMatchObject({ type: 'object' });
    expect(result).toMatchObject({ threadId: 'thread-1', output: { schemaVersion: 1 }, usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } });
  });

  it('never accepts a stale shared result when the current Codex attempt produces no last message', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codex-cli-stale-output-'));
    const outputPath = path.join(root, 'out.json');
    await writeFile(outputPath, '{"old":true}');
    const calls: Array<{ command: string; args: string[]; cwd?: string; stdin: string }> = [];
    const provider = new CodexCliProvider({
      spawn: fakeSpawn([{ stdout: '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}\n' }], calls),
      timeoutMs: 100, maxRetries: 0,
    });
    await expect(provider.execute({
      label: 'BLUEPRINT', prompt: 'fresh', cwd: root, sandbox: 'read-only',
      outputPath, logDir: path.join(root, 'logs'),
    })).rejects.toThrow();
    expect(await readFile(outputPath, 'utf8')).toBe('{"old":true}');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[calls[0].args.indexOf('--output-last-message') + 1]).not.toBe(outputPath);
  });

  it('retains and redacts the failed attempt output without overwriting an earlier successful artifact', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codex-cli-failed-output-'));
    const outputPath = path.join(root, 'out.json');
    const secret = 'account-token-123456789';
    await writeFile(outputPath, 'previous approved artifact');
    const provider = new CodexCliProvider({
      spawn: fakeSpawn([{ code: 1, stdout: '{"type":"turn.failed","error":{"message":"failed"}}\n',
        output: 'failed text Authorization: Bearer ' + secret }], []),
      timeoutMs: 100, maxRetries: 0,
    });
    await expect(provider.execute({
      label: 'BLUEPRINT', prompt: 'fresh', cwd: root, sandbox: 'read-only',
      outputPath, logDir: path.join(root, 'logs'),
    })).rejects.toThrow();
    expect(await readFile(outputPath, 'utf8')).toBe('previous approved artifact');
    const { readdir } = await import('node:fs/promises');
    const executions = await readdir(path.join(root, 'logs/codex/executions'));
    expect(executions).toHaveLength(1);
    const retained = await readFile(path.join(root, 'logs/codex/executions', executions[0]!, 'BLUEPRINT.attempt-1.last-message.txt'), 'utf8');
    expect(retained).not.toContain(secret);
  });

  it('rejects a final unfinished turn even when an earlier turn completed', async () => {
    const sequence = [
      '{"type":"turn.started"}',
      '{"type":"turn.completed","usage":{"input_tokens":6,"output_tokens":3}}',
      '{"type":"turn.started"}',
    ].join('\n');
    const parsed = parseCodexJsonl(sequence);
    expect(parsed.completed).toBe(false);
    expect(parsed.usage).toEqual({ inputTokens: 6, outputTokens: 3, totalTokens: 9 });

    const root = await mkdtemp(path.join(tmpdir(), 'codex-cli-unfinished-turn-'));
    const outputPath = path.join(root, 'out.txt');
    await writeFile(outputPath, 'previous approved artifact');
    const provider = new CodexCliProvider({
      spawn: fakeSpawn([{ stdout: sequence + '\n', output: 'partial output' }], []),
      timeoutMs: 100, maxRetries: 0,
    });
    await expect(provider.execute({
      label: 'BLUEPRINT', prompt: 'complete the task', cwd: root, sandbox: 'read-only',
      outputPath, logDir: path.join(root, 'logs'),
    })).rejects.toThrow(/exited|failed/i);
    expect(await readFile(outputPath, 'utf8')).toBe('previous approved artifact');
  });

  it('redacts a failed attempt even when the next unbudgeted attempt succeeds', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codex-cli-retry-redaction-'));
    const outputPath = path.join(root, 'out.txt');
    const secret = 'account-token-123456789';
    const provider = new CodexCliProvider({
      spawn: fakeSpawn([
        { code: 1, stdout: '{"type":"turn.completed","usage":{"input_tokens":2,"output_tokens":1}}\n', output: `partial Authorization: Bearer ${secret}` },
        { stdout: '{"type":"turn.completed","usage":{"input_tokens":3,"output_tokens":1}}\n', output: 'fresh output' },
      ], []),
      timeoutMs: 100, maxRetries: 1,
    });
    const result = await provider.execute({ label: 'BLUEPRINT', prompt: 'fresh', cwd: root,
      sandbox: 'read-only', outputPath, logDir: path.join(root, 'logs') });
    const retained = await readFile(path.join(root, `logs/codex/executions/${result.executionId}/BLUEPRINT.attempt-1.last-message.txt`), 'utf8');
    expect(retained).toContain('partial');
    expect(retained).not.toContain(secret);
    expect(await readFile(outputPath, 'utf8')).toBe('fresh output');
    expect(result).toMatchObject({ attempts: 2, usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 } });
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

  it('sums completed-turn usage instead of silently keeping only the final turn', () => {
    const parsed = parseCodexJsonl([
      '{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":80,"output_tokens":20}}',
      '{"type":"turn.completed","usage":{"input_tokens":70,"cached_input_tokens":50,"output_tokens":10}}',
    ].join('\n'));
    expect(parsed.usage).toEqual({ inputTokens: 170, outputTokens: 30, totalTokens: 200 });
  });

  it('kills a still-running Codex process when its completed-turn usage reaches budget', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'codex-cli-live-budget-'));
    const calls: string[] = [];
    let killed = false;
    const controlledSpawn = (() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: PassThrough; stderr: PassThrough; stdin: PassThrough; kill: (signal?: string) => boolean;
      };
      child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
      child.kill = (signal) => { killed = true; calls.push(String(signal)); queueMicrotask(() => child.emit('close', null, 'SIGTERM')); return true; };
      queueMicrotask(() => {
        child.stdout.write('{"type":"turn.completed","usage":{"input_tokens":35,"output_tokens":20}}\n');
      });
      return child as never;
    }) as SpawnFunction;
    const provider = new CodexCliProvider({ spawn: controlledSpawn, timeoutMs: 1000, maxRetries: 1 });
    await expect(provider.execute({ label: 'BLUEPRINT', prompt: 'read', cwd: root, sandbox: 'read-only',
      outputPath: path.join(root, 'out.json'), logDir: path.join(root, 'logs'), maxTotalTokens: 50 })).rejects.toThrow('token-budget');
    expect(killed).toBe(true);
    expect(calls).toEqual(['SIGTERM']);
    const receipt = JSON.parse(await readFile(path.join(root, 'logs/BLUEPRINT.attempt-1.usage.json'), 'utf8'));
    expect(receipt).toMatchObject({ cumulativeObservedTokens: 55, maxTotalTokens: 50, stopReason: 'token-budget', lowerBoundOnly: true });
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

it('pins the subscription provider and ChatGPT authentication rather than inheriting a paid project provider', () => {
 const args = buildCodexExecArgs({cwd:'/tmp/run',sandbox:'read-only',outputPath:'/tmp/run/out.json'});
 expect(args).toContain('model_provider="openai"');
 expect(args).toContain('forced_login_method="chatgpt"');
});

it('retains the exact sanitized invocation and resolved model in the unique execution directory', async () => {
 const root=await mkdtemp(path.join(tmpdir(),'codex-request-evidence-'));
 const calls:Array<{command:string;args:string[];cwd?:string;stdin:string}>=[];
 const provider=new CodexCliProvider({model:'gpt-6.1-sol',spawn:fakeSpawn([{stdout:'{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}\n',output:'observed'}],calls),maxRetries:0});
 const result=await provider.execute({label:'PROBE',prompt:'Frozen evidence only',cwd:root,sandbox:'read-only',outputPath:path.join(root,'out.txt'),logDir:path.join(root,'logs')});
 const request=JSON.parse(await readFile(path.join(root,`logs/codex/executions/${result.executionId}/PROBE.attempt-1.request.json`),'utf8'));
 expect(request).toMatchObject({prompt:'Frozen evidence only',model:'gpt-6.1-sol',cwd:root,sandbox:'read-only'});
 expect(request.args).toContain('forced_login_method="chatgpt"');
 expect(result.model).toBe('gpt-6.1-sol');
});
