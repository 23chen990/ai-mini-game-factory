import { prepareFrozenQaInput, frozenQaLaunch, frozenQaToolArgs } from '../qa/frozen-review.js';
import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { ensureDir, exists, sha256File, writeJsonAtomic } from '../core/files.js';
import { redactText, redactValue } from '../core/redaction.js';
import { assertExecutionContext, assertSafeContextInputPath } from '../core/execution-boundary.js';
import { classifyModelFailure, executionPolicyForStage, normalizeModelId } from '../core/model-policy.js';
import { StageNameSchema } from '../schemas/index.js';
import type { TokenUsage } from './interfaces.js';
import { beginCodexExecution } from '../core/codex-budget.js';
import { ResearchSandboxManifestSchema } from '../schemas/research-sandbox.js';
import { assertQaBrowserPreflight, runQaBrowserPreflight, verifyQaObservation, type QaBrowserPreflightReport, type QaObservationInput } from '../qa/browser-preflight.js';

export type CodexSandbox = 'read-only' | 'workspace-write';
export type SpawnFunction = (command: string, args: readonly string[], options: { cwd?: string; stdio: ['pipe', 'pipe', 'pipe']; shell: false; env?: NodeJS.ProcessEnv; detached?: boolean }) => ChildProcessWithoutNullStreams;

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
  /** Observed-token allowance across attempts, NOT a vendor billing hard cap. */
  maxTotalTokens?: number;
  /** Optional per-stage override; absent means the provider default. */
  model?: string;
  /** Optional stage metadata enables the same role/sandbox guard used by the factory. */
  stage?: string;
  role?: 'research' | 'producer' | 'builder' | 'fixer' | 'reviewer' | 'evidence-helper' | 'release';
  networkAccessEnabled?: boolean;
  /** Frozen normal-input handoff; a host browser smoke is not a reviewer tool grant. */
  qaObservation?: QaObservationInput;
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
  usageIncomplete?: boolean;
};

export type CodexExecResult = CodexJsonlResult & { output: unknown; attempts: number; stdout: string; stderr: string; executionId?: string; model?: string };

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
  'PATH', 'HOME', 'CODEX_HOME', 'USER', 'LOGNAME', 'SHELL',
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

export function buildCodexExecArgs(input: { cwd: string; sandbox: CodexSandbox; schemaPath?: string; outputPath: string; resumeThreadId?: string; model?: string; imagePaths?: string[] }) {
  const args = input.resumeThreadId
    ? ['exec', 'resume', input.resumeThreadId, '--json', '-c', `sandbox_mode="${input.sandbox}"`]
    : ['exec', '--json', '--sandbox', input.sandbox, '--cd', input.cwd];
  args.push('--ignore-user-config', '--disable', 'multi_agent', '-c', 'model_provider="openai"', '-c', 'forced_login_method="chatgpt"');
  const model = normalizeModelId(input.model);
  if (model !== 'account-default') args.push('--model', model);
  if (input.schemaPath) args.push('--output-schema', input.schemaPath);
  if (input.imagePaths?.length) args.push('--image', ...input.imagePaths);
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
    const number = found === undefined ? 0 : found;
    if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 0) throw new Error('Codex emitted invalid token usage');
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
  let usageIncomplete = false;
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
    let event: Record<string, unknown>;
    // JSONL is an external process boundary; reject non-object records.
    try { event = z.record(z.string(), z.unknown()).parse(JSON.parse(line)); } catch { errors.push('Codex emitted invalid JSONL'); continue; }
    events.push(event);
    if (event.type === 'thread.started') threadId = typeof event.thread_id === 'string' ? event.thread_id : typeof event.threadId === 'string' ? event.threadId : threadId;
    // The last turn must finish. A prior completed turn cannot stand in for a
    // new turn that began but never emitted a completion event.
    if (event.type === 'turn.started') completed = false;
    if (event.type === 'turn.completed') {
      completed = true;
      const rawUsage = event.usage as Record<string, unknown> | undefined;
      if (!rawUsage || (rawUsage.input_tokens === undefined && rawUsage.inputTokens === undefined) || (rawUsage.output_tokens === undefined && rawUsage.outputTokens === undefined)) usageIncomplete = true;
      try {
        const snapshot = readTurnUsage(rawUsage ?? {});
        usage.inputTokens += snapshot.inputTokens;
        usage.outputTokens += snapshot.outputTokens;
        usage.totalTokens += snapshot.totalTokens;
      } catch (error) { usageIncomplete = true; errors.push((error as Error).message); }
    }
    if (event.type === 'turn.failed') { failed = true; const message = eventError(event.error) ?? eventError(event.message); if (message) errors.push(redactText(message)); }
    if (event.type === 'error') { failed = true; const message = eventError(event.error) ?? eventError(event.message); if (message) errors.push(redactText(message)); }
  }
  return { events, threadId, completed, failed, usage, errors, usageIncomplete };
}

type ProcessStopReason = 'failed' | 'token-budget' | 'usage-unavailable' | 'timeout' | 'cancelled' | 'termination-failed';
type ProcessResult = { code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; stopReason?: ProcessStopReason };

async function redactAttemptOutput(outputPath: string): Promise<void> {
  // The external CLI can fail before writing a message or leave a non-file.
  if (!await exists(outputPath)) return;
  const stat = await lstat(outputPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Codex attempt output must be a regular file');
  await writeFile(outputPath, redactText(await readFile(outputPath, 'utf8')));
}

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
  private readonly qaBrowserPreflight: () => Promise<QaBrowserPreflightReport>;

  constructor(options: {
    spawn?: SpawnFunction; command?: string; timeoutMs?: number; maxRetries?: number; model?: string;
    qaBrowserPreflight?: () => Promise<QaBrowserPreflightReport>;
  } = {}) {
    this.spawn = options.spawn ?? ((command, args, spawnOptions) => nodeSpawn(command, [...args], spawnOptions));
    this.command = options.command ?? 'codex';
    this.timeoutMs = Math.max(1, options.timeoutMs ?? Number(process.env.CODEX_EXEC_TIMEOUT_MS ?? 300_000));
    this.maxRetries = Math.min(1, Math.max(0, options.maxRetries ?? Number(process.env.CODEX_EXEC_MAX_RETRIES ?? 1)));
    this.model = normalizeModelId(options.model ?? process.env.CODEX_MODEL);
    this.qaBrowserPreflight = options.qaBrowserPreflight ?? runQaBrowserPreflight;
  }

  private runProcess(args: string[], options: { command?: string; cwd?: string; stdin?: string; signal?: AbortSignal; timeoutMs?: number; env?: NodeJS.ProcessEnv; maxTotalTokens?: number }) {
    return new Promise<ProcessResult>((resolve) => {
      const detached = process.platform !== 'win32';
      const child = this.spawn(options.command ?? this.command, args, { cwd: options.cwd, stdio: ['pipe', 'pipe', 'pipe'], shell: false, env: options.env, detached });
      let stdout = ''; let stderr = ''; let settled = false;
      let pendingLine = ''; let observedTokens = 0; let stopReason: ProcessStopReason | undefined;
      let hardKillTimer: ReturnType<typeof setTimeout> | undefined;
      const timeout = options.timeoutMs ?? this.timeoutMs;
      const cleanup = () => { clearTimeout(timer); clearTimeout(hardKillTimer); options.signal?.removeEventListener('abort', abort); };
      const settle = (code: number | null, signal: NodeJS.Signals | null) => {
        if (settled) return;
        settled = true; cleanup(); resolve({ code, signal, stdout, stderr, ...(stopReason ? { stopReason } : {}) });
      };
      const kill = (signal: NodeJS.Signals) => {
        // POSIX group termination also covers tool processes spawned by Codex.
        // Injected test children have no pid; Windows can terminate only the CLI.
        if (detached && child.pid !== undefined) {
          try { process.kill(-child.pid, signal); }
          catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ESRCH') return;
            // Signal delivery is an external boundary. Return the failure and
            // buffered usage, never throw out of a stream/timer callback.
            stderr += `\nCodex process group ${child.pid} termination failed: ${(error as Error).message}; process may still be running`;
            stopReason = 'termination-failed'; settle(null, null);
          }
        } else child.kill(signal);
      };
      const terminate = (reason: ProcessStopReason) => {
        if (settled || stopReason) return;
        stopReason = reason;
        kill('SIGTERM');
        if (!settled) hardKillTimer = setTimeout(() => kill('SIGKILL'), 1_000);
      };
      const inspectLine = (line: string) => {
        if (!line.trim() || options.maxTotalTokens === undefined) return;
        const parsed = parseCodexJsonl(line);
        observedTokens += parsed.usage.totalTokens;
        if (parsed.failed) terminate('failed');
        else if (parsed.errors.length > 0 || parsed.usageIncomplete) terminate('usage-unavailable');
        else if (observedTokens >= options.maxTotalTokens) terminate('token-budget');
      };
      const abort = () => terminate('cancelled');
      const timer = setTimeout(() => terminate('timeout'), timeout);
      child.stdout.on('data', (chunk) => {
        const text = String(chunk); stdout += text; pendingLine += text;
        let newline = pendingLine.indexOf('\n');
        while (newline >= 0) {
          inspectLine(pendingLine.slice(0, newline));
          pendingLine = pendingLine.slice(newline + 1);
          newline = pendingLine.indexOf('\n');
        }
      });
      child.stderr.on('data', (chunk) => { stderr += String(chunk); });
      // Spawn and pipe failures are real external failures. Preserve buffered
      // telemetry and settle on close instead of rejecting and losing usage.
      child.on('error', (error) => { stderr += `\n${error.message}`; });
      child.stdin.on('error', (error) => { stderr += `\n${error.message}`; });
      child.on('close', (code, signal) => {
        if (settled) return;
        inspectLine(pendingLine);
        if (!settled && stopReason && detached && child.pid !== undefined) kill('SIGKILL');
        settle(code, signal);
      });
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
    const selectedModel = normalizeModelId(request.model ?? this.model);
    const workingDirectory = assertCodexWorkingDirectory(request);
    if (request.stage) {
      const checked = assertExecutionContext({ runRoot: workingDirectory.runRoot, outputPath: request.outputPath, logDir: request.logDir, inputPaths: [], stage: request.stage, model: request.model, sandbox: request.sandbox, enforceBoundary: true });
      if (request.role && request.role !== checked.role) throw new Error(`Codex execution role ${request.role} does not match stage ${request.stage}`);
    }
    let processEnv: NodeJS.ProcessEnv;
    let imagePaths: string[] = [];
    let frozenQa: Awaited<ReturnType<typeof prepareFrozenQaInput>> | undefined;
    let prompt = request.prompt;
    if (request.researchIsolation) {
      const manifestPath = request.researchIsolation.manifestPath ?? path.join(request.researchIsolation.root, 'SANDBOX_MANIFEST.json');
      if (!(await exists(manifestPath))) throw new Error('Codex research sandbox manifest is missing');
      if (request.stage === 'REFERENCE_DEEP_RESEARCH') {
        const manifest = ResearchSandboxManifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
        const sandboxRoot = request.researchIsolation.root;
        if (manifest.stage !== request.stage || path.resolve(workingDirectory.runRoot, manifest.rootRelative) !== sandboxRoot) throw new Error('Codex research media manifest does not match this sandbox');
        const realSandboxRoot = await realpath(sandboxRoot);
        imagePaths = await Promise.all(manifest.mediaFiles.map(async (media) => {
          const relative = assertSafeContextInputPath(media.path);
          if (!manifest.allowedFiles.includes(relative)) throw new Error(`Codex research image is absent from the sandbox allowlist: ${relative}`);
          const imagePath = path.resolve(sandboxRoot, relative);
          if (!isWithin(sandboxRoot, imagePath) || !isWithin(realSandboxRoot, await realpath(imagePath))) throw new Error(`Codex research image path escapes the sandbox: ${relative}`);
          const stat = await lstat(imagePath);
          if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Codex research image must be a regular file: ${relative}`);
          if (await sha256File(imagePath) !== media.sha256) throw new Error(`Codex research image hash mismatch: ${relative}`);
          return imagePath;
        }));
      }
      // Do not inherit arbitrary host environment variables into an
      // untrusted-content reader. In particular this excludes API keys,
      // cloud credentials and custom command hooks. The CLI still receives a
      // normal executable search path and harmless locale/temp settings.
      processEnv = buildCodexProcessEnv('research');
    } else processEnv = buildCodexProcessEnv('trusted');
    await ensureDir(request.logDir);
    if (request.signal?.aborted) throw new Error('codex exec was cancelled before launch');
    // A failed browser is an infrastructure blocker, NOT a reason to spend
    // tokens asking a blind QA model to retry the same unavailable tool.
    // This gate precedes the metered Codex execution/lease entirely.
    if (request.stage === 'BLIND_PLAYTEST_QA' || request.stage === 'NATURAL_PLAY_QA' || request.stage === 'QA') {
      const readiness = await this.qaBrowserPreflight();
      await writeJsonAtomic(path.join(request.logDir, `${request.label}.qa-browser-preflight.json`), readiness);
      assertQaBrowserPreflight(readiness);
      try {
        if (!request.qaObservation) throw new Error('QA_OBSERVATIONS_REQUIRED: capture build-bound normal input and PNGs before spending model tokens; host browser readiness is insufficient');
        if (request.resumeThreadId !== undefined) throw new Error('QA_ISOLATION_UNAVAILABLE: independent review cannot resume an author thread');
        const observations = await verifyQaObservation(workingDirectory.runRoot, request.qaObservation);
        frozenQa = await prepareFrozenQaInput(workingDirectory.runRoot, [...observations.images, ...observations.referenceImages]);
        imagePaths = frozenQa.imagePaths;
        const trace = observations.trace;
        prompt += `\nFrozen normal-input timeline (capture facts, not QA acceptance): ${JSON.stringify({actions:trace.actions,device:trace.device,transitionIds:trace.transitions.map(transition=>transition.name),screenshots:trace.screenshots,buildHash:request.qaObservation.buildSha256,traceSha256:request.qaObservation.traceSha256})}`;
        await writeJsonAtomic(path.join(request.logDir, `${request.label}.qa-observations.json`), observations);
        prompt += `\nAttached image order (candidate then reference): ${JSON.stringify({candidate:observations.images,reference:observations.referenceImages})}\nQA observation mode: inspect the attached frozen gameplay PNGs and normal-input trace ${request.qaObservation.tracePath}. Do not inspect game source, gold labels, other reports or known answers. This handoff is not a browser tool grant. Do not claim to have operated a browser or watched uncaptured video. Unobserved branches and temporally incomplete absence claims remain BLOCKED. Use a neutral transitionId from the timeline as the discovery id so evidence can be mechanically joined; it is not a supplied defect list. Return independent findings, evidence and uncertainty, not capture-runner acceptance.`;
      } catch (error) {
        await writeJsonAtomic(path.join(request.logDir, `${request.label}.qa-observations.json`), { scope: 'FROZEN_NATURAL_OBSERVATIONS_ONLY', status: 'BLOCKED', modelCalls: 0, reason: redactText(error instanceof Error ? error.message : String(error)) });
        throw error;
      }
    }
    const configuredBudget = request.stage === 'REFERENCE_DEEP_RESEARCH'
      ? process.env.CODEX_RESEARCH_MAX_TOTAL_TOKENS ?? process.env.CODEX_EXEC_MAX_TOTAL_TOKENS ?? '200000'
      : process.env.CODEX_EXEC_MAX_TOTAL_TOKENS;
    const limits = [request.maxTotalTokens, configuredBudget === undefined ? undefined : Number(configuredBudget), process.env.CODEX_EXEC_MAX_TOTAL_TOKENS === undefined ? undefined : Number(process.env.CODEX_EXEC_MAX_TOTAL_TOKENS)].filter((value): value is number => value !== undefined);
    if (limits.some((value) => !Number.isSafeInteger(value) || value <= 0)) throw new Error('Codex token budget must be a positive safe integer');
    const model = selectedModel;
    const execution = await beginCodexExecution(workingDirectory.runRoot, { stage: request.stage ?? request.label, model,
      maxTotalTokens: limits.length > 0 ? Math.min(...limits) : undefined,
      requireRunBudget: request.stage !== undefined && ['FULL_BUILD', 'FIX', 'BUILD_3_PROTOTYPES', 'BUILD_ACTION_PROTOTYPES'].includes(request.stage) });
    const schemaPath = request.outputSchema ? path.join(execution.logDir, `${request.label}.schema.json`) : undefined;
    const maxTotalTokens = execution.maxTotalTokens;
    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let attempts = 0;
    let uncertain = false;
    let lastError: unknown;
    const maxRetries = frozenQa === undefined ? Math.min(1, Math.max(0, request.maxRetries ?? this.maxRetries)) : 0;
    try {
      if (schemaPath) {
        await writeJsonAtomic(schemaPath, request.outputSchema);
        const legacySchema = path.join(request.logDir, `${request.label}.schema.json`);
        if (!await exists(legacySchema)) await writeJsonAtomic(legacySchema, request.outputSchema);
      }
      for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
        if (request.signal?.aborted) throw new Error('codex exec was cancelled before launch');
        // Output-last-message is per-attempt, never a shared old stage artifact.
        // Without this isolation a successful exit without a new output file
        // could accidentally publish the previous attempt's result.
        const attemptOutputPath = path.join(execution.logDir, `${request.label}.attempt-${attempt}.last-message.txt`);
        const args = buildCodexExecArgs({ cwd: frozenQa?.root ?? workingDirectory.cwd, sandbox: request.sandbox, schemaPath, outputPath: attemptOutputPath, resumeThreadId: request.resumeThreadId, model, imagePaths });
        let stopReason: ProcessStopReason | undefined;
        try {
          const isolated = frozenQa === undefined ? undefined : await frozenQaLaunch({root:frozenQa.root,logDir:execution.logDir,command:this.command,env:processEnv});
          if (frozenQa) args.splice(args.length - 1, 0, ...frozenQaToolArgs());
          const launchArgs = isolated === undefined ? args : [...isolated.prefix, ...args];
          attempts = attempt;
          await execution.save(usage, attempts, 'running');
          const remainingTokens = maxTotalTokens === undefined ? undefined : maxTotalTokens - usage.totalTokens;
          if (remainingTokens !== undefined && remainingTokens <= 0) throw new Error('codex exec token budget exhausted');
          await writeJsonAtomic(path.join(execution.logDir, `${request.label}.attempt-${attempt}.request.json`), redactValue({
            executionId:execution.executionId, stage:request.stage, role:request.role, model, cwd:workingDirectory.cwd,
            sandbox:request.sandbox, command:isolated?.command ?? this.command, args:launchArgs, prompt, imagePaths, qaObservation:request.qaObservation,
            effectiveCwd:frozenQa?.root ?? workingDirectory.cwd, isolationProfile:isolated?.profilePath, tools:frozenQa ? [] : undefined,
            timeoutMs:request.timeoutMs ?? this.timeoutMs, maxTotalTokens:remainingTokens,
          }));
          const processResult = await this.runProcess(launchArgs, { command: isolated?.command, cwd: frozenQa?.root ?? workingDirectory.cwd, stdin: prompt, signal: request.signal, timeoutMs: request.timeoutMs, env: isolated?.env ?? processEnv, maxTotalTokens: remainingTokens });
          stopReason = processResult.stopReason;
          const stdout = redactText(processResult.stdout); const stderr = redactText(processResult.stderr);
          const parsed = parseCodexJsonl(stdout);
          usage.inputTokens += parsed.usage.inputTokens;
          usage.outputTokens += parsed.usage.outputTokens;
          usage.totalTokens += parsed.usage.totalTokens;
          const failed = processResult.code !== 0 || processResult.signal !== null || parsed.failed || !parsed.completed || parsed.errors.length > 0;
          const lowerBoundOnly = Boolean(processResult.stopReason || failed || parsed.usageIncomplete);
          uncertain ||= lowerBoundOnly;
          const artifacts: Array<[string, string]> = [
            [`${request.label}.attempt-${attempt}.stdout.jsonl`, stdout],
            [`${request.label}.attempt-${attempt}.stderr.log`, stderr],
            [`${request.label}.attempt-${attempt}.events.json`, JSON.stringify(redactValue(parsed.events), null, 2)],
            [`${request.label}.attempt-${attempt}.usage.json`, JSON.stringify({
              schemaVersion: 1, executionId: execution.executionId, stage: request.stage ?? request.label, attempt,
              observedCompletedTurnUsage: parsed.usage, cumulativeObservedTokens: usage.totalTokens,
              maxTotalTokens: maxTotalTokens ?? null, stopReason: processResult.stopReason ?? null,
              lowerBoundOnly, reportedAt: new Date().toISOString(),
            }, null, 2)],
          ];
          for (const [name, content] of artifacts) {
            await writeFile(path.join(execution.logDir, name), content);
            // Preserve legacy first-call pointers, never overwrite prior evidence.
            const legacyPath = path.join(request.logDir, name);
            if (!await exists(legacyPath)) await writeFile(legacyPath, content);
          }
          await execution.save(usage, attempts, uncertain ? 'uncertain' : 'complete');
          if (processResult.stopReason && (processResult.stopReason !== 'failed' || parsed.errors.length === 0)) throw new Error(processResult.stopReason === 'timeout'
            ? `codex exec timed out after ${request.timeoutMs ?? this.timeoutMs}ms; observed completed-turn tokens ${usage.totalTokens}`
            : `codex exec stopped: ${processResult.stopReason}; observed completed-turn tokens ${usage.totalTokens}${processResult.stopReason === 'termination-failed' ? `; ${stderr.trim()}` : ''}`);
          if (failed || (maxTotalTokens !== undefined && parsed.usageIncomplete)) throw new Error(parsed.errors.at(-1) ?? (stderr.trim() || `codex exec exited with code ${processResult.code}`));
          const outputStat = await lstat(attemptOutputPath);
          if (!outputStat.isFile() || outputStat.isSymbolicLink()) throw new Error('Codex current attempt output must be a regular file');
          const outputText = redactText(await readFile(attemptOutputPath, 'utf8'));
          // Publish only a confirmed *current-attempt* output. Prior formal
          // artifacts remain untouched on provider error or missing output.
          await writeFile(attemptOutputPath, outputText);
          await writeFile(path.join(execution.logDir, `${request.label}.last-message.txt`), outputText);
          await writeFile(request.outputPath, outputText);
          let output: unknown = outputText;
          try { output = JSON.parse(outputText); } catch { /* unstructured Builder/Fixer summary */ }
          return { ...parsed, usage, output, attempts, stdout, stderr, executionId: execution.executionId, model };
        } catch (error) {
          lastError = error;
          // A failed budgeted process can have an unreported in-flight turn.
          // No retry is safe merely because its observed lower bound is small.
          if (maxTotalTokens !== undefined || request.signal?.aborted || stopReason === 'termination-failed') throw error;
          const kind = classifyModelFailure(error instanceof Error ? error.message : String(error));
          if (kind === 'SPEC_ERROR' || kind === 'POLICY_BLOCK') throw error;
        } finally {
          // A later successful retry must not leave an earlier partial message
          // unredacted, even though the outer error handler will not run.
          await redactAttemptOutput(attemptOutputPath);
        }
      }
      throw lastError;
    } catch (error) {
      await execution.save(usage, attempts, uncertain || attempts > 0 ? 'uncertain' : 'complete');
      throw new CodexExecutionError(redactText(error instanceof Error ? error.message : String(error)), usage, attempts, execution.executionId, model);
    } finally { await execution.release(); }
  }
}

export class CodexExecutionError extends Error {
  constructor(message: string, readonly usage: TokenUsage, readonly attempts: number, readonly executionId: string, readonly model: string) {
    super(message); this.name = 'CodexExecutionError';
  }
}
