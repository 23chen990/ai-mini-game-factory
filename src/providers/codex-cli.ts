import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, exists, writeJsonAtomic } from '../core/files.js';
import { redactText, redactValue } from '../core/redaction.js';
import { assertExecutionContext } from '../core/execution-boundary.js';
import { executionPolicyForStage } from '../core/model-policy.js';
import { StageNameSchema } from '../schemas/index.js';
import type { TokenUsage } from './interfaces.js';

export type CodexSandbox = 'read-only' | 'workspace-write';
export type SpawnFunction = (command: string, args: readonly string[], options: { cwd?: string; stdio: ['pipe', 'pipe', 'pipe']; shell: false; env?: NodeJS.ProcessEnv }) => ChildProcessWithoutNullStreams;

export type CodexExecRequest = {
  label: string;
  prompt: string;
  cwd: string;
  sandbox: CodexSandbox;
  outputPath: string;
  logDir: string;
  outputSchema?: Record<string, unknown>;
  resumeThreadId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
  /** Remaining hard token allowance for this invocation, including automatic retries. */
  maxTotalTokens?: number;
  /** Optional per-stage override; absent means the provider default. */
  model?: string;
  /** Optional stage metadata enables the same role/sandbox guard used by the factory. */
  stage?: string;
  role?: 'research' | 'producer' | 'builder' | 'fixer' | 'reviewer' | 'evidence-helper' | 'release';
  networkAccessEnabled?: boolean;
  /** Parent run root when cwd is a nested generated workspace. */
  runRoot?: string;
  /** Research must run from a stage-scoped, sanitized filesystem view. */
  researchIsolation?: { mode: 'sanitized-read-only'; root: string; manifestPath?: string };
};

export type CodexJsonlResult = {
  events: Record<string, unknown>[];
  threadId?: string;
  completed: boolean;
  failed: boolean;
  usage: TokenUsage;
  errors: string[];
};

export type CodexExecResult = CodexJsonlResult & { output: unknown; attempts: number; stdout: string; stderr: string };

/**
 * Environment variables that are safe and useful for a Codex child process.
 *
 * The factory deliberately does not forward `process.env` wholesale.  A
 * prompt that came from a web page, README or generated asset must never be
 * able to influence an inherited API key, cloud credential, package-manager
 * hook or `NODE_OPTIONS` value.  Authentication for codex-account is still
 * provided by the user's normal HOME/Codex login in trusted stages; Research
 * receives the smaller set below and therefore cannot discover that session.
 */
const TRUSTED_ENV_KEYS = [
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL',
  'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM',
  'NO_COLOR', 'CI', 'FORCE_COLOR', 'TZ', 'PATHEXT', 'SystemRoot',
] as const;

const RESEARCH_ENV_KEYS = [
  'PATH', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'NO_COLOR',
] as const;

export function buildCodexProcessEnv(mode: 'trusted' | 'research' = 'trusted'): NodeJS.ProcessEnv {
  const keys = mode === 'research' ? RESEARCH_ENV_KEYS : TRUSTED_ENV_KEYS;
  const environment: NodeJS.ProcessEnv = {};
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

export function buildCodexExecArgs(input: { cwd: string; sandbox: CodexSandbox; schemaPath?: string; outputPath: string; resumeThreadId?: string; model?: string }) {
  const args = input.resumeThreadId
    ? ['exec', 'resume', input.resumeThreadId, '--json', '-c', `sandbox_mode="${input.sandbox}"`]
    : ['exec', '--json', '--sandbox', input.sandbox, '--cd', input.cwd];
  if (input.model) args.push('--model', input.model);
  if (input.schemaPath) args.push('--output-schema', input.schemaPath);
  args.push('--output-last-message', input.outputPath, '-');
  return args;
}

function eventError(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.message === 'string') return record.message;
  }
  return undefined;
}

/** A turn.completed event reports one turn, not the lifetime cost of the CLI task.
 * cached_input_tokens is already part of input_tokens and must not be added twice. */
function readTurnUsage(value: Record<string, unknown>): TokenUsage {
  const field = (...keys: string[]) => {
    const found = keys.map((key) => value[key]).find((item) => item !== undefined);
    const number = Number(found ?? 0);
    if (!Number.isSafeInteger(number) || number < 0) throw new Error('Codex emitted invalid token usage');
    return number;
  };
  const inputTokens = field('input_tokens', 'inputTokens');
  const outputTokens = field('output_tokens', 'outputTokens');
  return { inputTokens, outputTokens, totalTokens: Math.max(inputTokens + outputTokens, field('total_tokens', 'totalTokens')) };
}

export function parseCodexJsonl(stdout: string): CodexJsonlResult {
  const events: Record<string, unknown>[] = [];
  const errors: string[] = [];
  let threadId: string | undefined;
  let completed = false;
  let failed = false;
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
    let event: Record<string, unknown>;
    try { event = JSON.parse(line) as Record<string, unknown>; } catch { errors.push('Codex emitted invalid JSONL'); continue; }
    events.push(event);
    if (event.type === 'thread.started') threadId = typeof event.thread_id === 'string' ? event.thread_id : typeof event.threadId === 'string' ? event.threadId : threadId;
    if (event.type === 'turn.completed') {
      completed = true;
      const rawUsage = event.usage && typeof event.usage === 'object' ? event.usage as Record<string, unknown> : {};
      const snapshot = readTurnUsage(rawUsage);
      usage.inputTokens += snapshot.inputTokens;
      usage.outputTokens += snapshot.outputTokens;
      usage.totalTokens += snapshot.totalTokens;
    }
    if (event.type === 'turn.failed') { failed = true; const message = eventError(event.error) ?? eventError(event.message); if (message) errors.push(redactText(message)); }
    if (event.type === 'error') { failed = true; const message = eventError(event.error) ?? eventError(event.message); if (message) errors.push(redactText(message)); }
  }
  return { events, threadId, completed, failed, usage, errors };
}

type ProcessStopReason = 'token-budget' | 'usage-unavailable' | 'timeout' | 'cancelled';
type ProcessResult = { code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; stopReason?: ProcessStopReason };

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function absoluteNonRoot(value: string, label: string): string {
  if (!path.isAbsolute(value) || path.resolve(value) === path.parse(value).root) throw new Error(`Codex ${label} must be an absolute non-root path`);
  return path.resolve(value);
}

/**
 * Validate the process working directory before spawning an external model.
 * `assertExecutionContext` protects artifact pointers, but a provider can
 * still escape by choosing a different cwd when a caller omits stage
 * metadata. Keep this check at the last boundary and fail closed.
 */
export function assertCodexWorkingDirectory(request: Pick<CodexExecRequest, 'cwd' | 'runRoot' | 'stage' | 'sandbox' | 'outputPath' | 'logDir' | 'researchIsolation'>): { cwd: string; runRoot: string } {
  const cwd = absoluteNonRoot(request.cwd, 'cwd');
  const runRoot = absoluteNonRoot(request.runRoot ?? request.cwd, 'runRoot');
  if (!isWithin(runRoot, cwd)) throw new Error('Codex cwd must remain inside the current run root');
  const outputPath = absoluteNonRoot(request.outputPath, 'outputPath');
  const logDir = absoluteNonRoot(request.logDir, 'logDir');
  if (!isWithin(runRoot, outputPath)) throw new Error('Codex outputPath must remain inside the current run root');
  if (!isWithin(runRoot, logDir)) throw new Error('Codex logDir must remain inside the current run root');
  if (request.stage !== undefined) {
    const stage = StageNameSchema.parse(request.stage);
    const policy = executionPolicyForStage(stage);
    if (request.sandbox !== policy.sandbox) throw new Error(`Codex ${stage} cwd request has an invalid sandbox`);
    if (policy.role === 'research') {
      const isolation = request.researchIsolation;
      if (!isolation || isolation.mode !== 'sanitized-read-only') throw new Error(`Codex ${stage} requires a sanitized research sandbox`);
      const isolationRoot = absoluteNonRoot(isolation.root, 'research sandbox root');
      if (!isWithin(runRoot, isolationRoot) || isWithin(path.join(runRoot, 'workspace'), isolationRoot) || path.resolve(cwd) !== isolationRoot) {
        throw new Error(`Codex ${stage} cwd must be the isolated research sandbox`);
      }
      if (isolation.manifestPath !== undefined) {
        const manifestPath = absoluteNonRoot(isolation.manifestPath, 'research sandbox manifest');
        if (!isWithin(isolationRoot, manifestPath)) throw new Error(`Codex ${stage} research manifest must remain inside the sandbox`);
      }
    } else if (request.researchIsolation) {
      throw new Error(`Codex ${stage} cannot use a research sandbox`);
    }
    if (policy.role === 'builder' || policy.role === 'fixer') {
      if (request.runRoot === undefined) throw new Error(`Codex ${stage} requires an explicit runRoot for workspace writes`);
      if (!isWithin(path.join(runRoot, 'workspace'), cwd)) throw new Error(`Codex ${stage} cwd must remain inside the run workspace`);
    } else if (isWithin(path.join(runRoot, 'workspace'), cwd)) {
      throw new Error(`Codex ${policy.role} cwd cannot target a generated workspace`);
    }
  }
  return { cwd, runRoot };
}

export class CodexCliProvider {
  private readonly spawn: SpawnFunction;
  private readonly command: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly model?: string;

  constructor(options: { spawn?: SpawnFunction; command?: string; timeoutMs?: number; maxRetries?: number; model?: string } = {}) {
    this.spawn = options.spawn ?? ((command, args, spawnOptions) => nodeSpawn(command, [...args], spawnOptions));
    this.command = options.command ?? 'codex';
    this.timeoutMs = Math.max(1, options.timeoutMs ?? Number(process.env.CODEX_EXEC_TIMEOUT_MS ?? 300_000));
    this.maxRetries = Math.min(1, Math.max(0, options.maxRetries ?? Number(process.env.CODEX_EXEC_MAX_RETRIES ?? 1)));
    this.model = options.model ?? process.env.CODEX_MODEL;
  }

  private runProcess(args: string[], options: { cwd?: string; stdin?: string; signal?: AbortSignal; timeoutMs?: number; env?: NodeJS.ProcessEnv; maxTotalTokens?: number }) {
    return new Promise<ProcessResult>((resolve, reject) => {
      const child = this.spawn(this.command, args, { cwd: options.cwd, stdio: ['pipe', 'pipe', 'pipe'], shell: false, env: options.env });
      let stdout = ''; let stderr = ''; let settled = false;
      let pendingLine = ''; let observedTokens = 0; let stopReason: ProcessStopReason | undefined;
      let hardKillTimer: ReturnType<typeof setTimeout> | undefined;
      const timeout = options.timeoutMs ?? this.timeoutMs;
      const cleanup = () => { clearTimeout(timer); if (hardKillTimer) clearTimeout(hardKillTimer); options.signal?.removeEventListener('abort', abort); };
      const terminate = (reason: ProcessStopReason) => {
        if (settled || stopReason) return;
        stopReason = reason;
        child.kill('SIGTERM');
        // A child can ignore TERM. Never release this stage while it is running.
        hardKillTimer = setTimeout(() => { if (!settled) child.kill('SIGKILL'); }, 1_000);
      };
      const abort = () => terminate('cancelled');
      const timer = setTimeout(() => terminate('timeout'), timeout);
      child.stdout.on('data', (chunk) => {
        const text = String(chunk); stdout += text; pendingLine += text;
        let newline = pendingLine.indexOf('\n');
        while (newline >= 0) {
          const line = pendingLine.slice(0, newline).trim();
          pendingLine = pendingLine.slice(newline + 1);
          if (line) {
            try {
              const event = JSON.parse(line) as Record<string, unknown>;
              if (event.type === 'turn.completed' && options.maxTotalTokens !== undefined) {
                const raw = event.usage as Record<string, unknown> | undefined;
                if (!raw || (raw.total_tokens === undefined && raw.totalTokens === undefined && raw.input_tokens === undefined && raw.inputTokens === undefined)) terminate('usage-unavailable');
                else {
                  observedTokens += readTurnUsage(raw).totalTokens;
                  if (observedTokens >= options.maxTotalTokens) terminate('token-budget');
                }
              }
            } catch { if (options.maxTotalTokens !== undefined) terminate('usage-unavailable'); }
          }
          newline = pendingLine.indexOf('\n');
        }
      });
      child.stderr.on('data', (chunk) => { stderr += String(chunk); });
      child.on('error', (error) => { if (!settled) { settled = true; cleanup(); reject(error); } });
      child.on('close', (code, signal) => { if (!settled) { settled = true; cleanup(); resolve({ code, signal, stdout, stderr, ...(stopReason ? { stopReason } : {}) }); } });
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) terminate('cancelled');
      child.stdin.end(options.stdin ?? '');
    });
  }

  async assertChatGptLogin() {
    let result: ProcessResult;
    try { result = await this.runProcess(['login', 'status'], { timeoutMs: Math.min(this.timeoutMs, 10_000), env: buildCodexProcessEnv('trusted') }); } catch { throw new Error('Codex CLI is not available; install Codex CLI and run codex login'); }
    if (result.code !== 0 || !`${result.stdout}\n${result.stderr}`.includes('Logged in using ChatGPT')) throw new Error('Codex CLI is not logged in with ChatGPT; run codex login');
    return { method: 'chatgpt' as const, message: 'Logged in using ChatGPT' };
  }

  async execute(request: CodexExecRequest): Promise<CodexExecResult> {
    if (request.networkAccessEnabled === true) throw new Error('Codex execution boundary forbids network access');
    if (request.model !== undefined && request.model.trim().length === 0) throw new Error('Codex model override cannot be empty');
    const workingDirectory = assertCodexWorkingDirectory(request);
    if (request.stage) {
      const checked = assertExecutionContext({ runRoot: workingDirectory.runRoot, outputPath: request.outputPath, logDir: request.logDir, inputPaths: [], stage: request.stage, model: request.model, sandbox: request.sandbox, enforceBoundary: true });
      if (request.role && request.role !== checked.role) throw new Error(`Codex execution role ${request.role} does not match stage ${request.stage}`);
    }
    let processEnv: NodeJS.ProcessEnv;
    if (request.researchIsolation) {
      const manifestPath = request.researchIsolation.manifestPath ?? path.join(request.researchIsolation.root, 'SANDBOX_MANIFEST.json');
      if (!(await exists(manifestPath))) throw new Error('Codex research sandbox manifest is missing');
      // Do not inherit arbitrary host environment variables into an
      // untrusted-content reader. In particular this excludes API keys,
      // cloud credentials and custom command hooks. The CLI still receives a
      // normal executable search path and harmless locale/temp settings.
      processEnv = buildCodexProcessEnv('research');
    } else processEnv = buildCodexProcessEnv('trusted');
    await ensureDir(request.logDir);
    const schemaPath = request.outputSchema ? path.join(request.logDir, `${request.label}.schema.json`) : undefined;
    if (schemaPath) await writeJsonAtomic(schemaPath, request.outputSchema);
    let lastError: Error | undefined;
    let chargedCompletedTokens = 0;
    const configuredBudget = request.stage === 'REFERENCE_DEEP_RESEARCH'
      ? process.env.CODEX_RESEARCH_MAX_TOTAL_TOKENS ?? process.env.CODEX_EXEC_MAX_TOTAL_TOKENS ?? '200000'
      : process.env.CODEX_EXEC_MAX_TOTAL_TOKENS;
    const maxTotalTokens = request.maxTotalTokens ?? (configuredBudget !== undefined ? Number(configuredBudget) : undefined);
    if (maxTotalTokens !== undefined && (!Number.isSafeInteger(maxTotalTokens) || maxTotalTokens <= 0)) throw new Error('Codex token budget must be a positive safe integer');
    const maxRetries = Math.min(1, Math.max(0, request.maxRetries ?? this.maxRetries));
    for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
      const args = buildCodexExecArgs({ cwd: workingDirectory.cwd, sandbox: request.sandbox, schemaPath, outputPath: request.outputPath, resumeThreadId: request.resumeThreadId, model: request.model?.trim() || this.model });
      try {
        const remainingTokens = maxTotalTokens === undefined ? undefined : maxTotalTokens - chargedCompletedTokens;
        if (remainingTokens !== undefined && remainingTokens <= 0) throw new Error('codex exec token budget exhausted');
        const processResult = await this.runProcess(args, { cwd: workingDirectory.cwd, stdin: request.prompt, signal: request.signal, timeoutMs: request.timeoutMs, env: processEnv, maxTotalTokens: remainingTokens });
        const stdout = redactText(processResult.stdout); const stderr = redactText(processResult.stderr);
        const parsed = parseCodexJsonl(stdout);
        await writeFile(path.join(request.logDir, `${request.label}.attempt-${attempt}.stdout.jsonl`), stdout);
        await writeFile(path.join(request.logDir, `${request.label}.attempt-${attempt}.stderr.log`), stderr);
        await writeJsonAtomic(path.join(request.logDir, `${request.label}.attempt-${attempt}.events.json`), redactValue(parsed.events));
        chargedCompletedTokens += parsed.usage.totalTokens;
        await writeJsonAtomic(path.join(request.logDir, `${request.label}.attempt-${attempt}.usage.json`), {
          schemaVersion: 1, stage: request.stage ?? request.label, attempt,
          observedCompletedTurnUsage: parsed.usage, cumulativeObservedTokens: chargedCompletedTokens,
          maxTotalTokens: maxTotalTokens ?? null, stopReason: processResult.stopReason ?? null,
          lowerBoundOnly: Boolean(processResult.stopReason || processResult.code !== 0 || parsed.failed || !parsed.completed),
          reportedAt: new Date().toISOString(),
        });
        if (processResult.stopReason) throw new Error(processResult.stopReason === 'timeout' ? `codex exec timed out after ${request.timeoutMs ?? this.timeoutMs}ms; observed completed-turn tokens ${chargedCompletedTokens}` : `codex exec stopped: ${processResult.stopReason}; observed completed-turn tokens ${chargedCompletedTokens}`);
        if (processResult.code !== 0 || parsed.failed || !parsed.completed) throw new Error(parsed.errors.at(-1) ?? (stderr.trim() || `codex exec exited with code ${processResult.code}`));
        const rawOutputText = await readFile(request.outputPath, 'utf8');
        const outputText = redactText(rawOutputText);
        if (outputText !== rawOutputText) await writeFile(request.outputPath, outputText);
        let output: unknown = outputText;
        try { output = JSON.parse(outputText); } catch { /* unstructured Builder/Fixer summary */ }
        return { ...parsed, output, attempts: attempt, stdout, stderr };
      } catch (error) {
        lastError = new Error(redactText(error instanceof Error ? error.message : String(error)));
        if (request.signal?.aborted) throw new Error('codex exec was cancelled');
        if (/codex exec stopped:|codex exec token budget exhausted/u.test(lastError.message)) throw lastError;
        if (maxTotalTokens !== undefined && chargedCompletedTokens >= maxTotalTokens) throw new Error('codex exec token budget exhausted');
      }
    }
    if (await exists(request.outputPath)) {
      const unsafeOutput = await readFile(request.outputPath, 'utf8');
      await writeFile(request.outputPath, redactText(unsafeOutput));
    }
    throw lastError ?? new Error('codex exec failed');
  }
}
