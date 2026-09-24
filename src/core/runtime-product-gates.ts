import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { exists } from './files.js';
import { NaturalFlowEvidenceSchema } from '../schemas/natural-flow.js';

const Text = z.string().trim().min(1);
const RuntimeFile = Text.refine((value) => !path.isAbsolute(value) && !path.win32.isAbsolute(value) && !value.split('/').some((part) => part === '..') && !/^(?:[a-z]+:)?\/\//iu.test(value), 'runtime wiring paths must be relative and local');

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function journeyFallbacks(journey: string[]) {
  const isTerminal = (value: string) => /死亡|结算|成功|完成|terminal|settlement|death|fail|lose|win|success|complete|finish|game.?over/iu.test(value);
  const isReplay = (value: string) => /再跑|重试|重开|replay|retry|restart|again/iu.test(value);
  const core = journey.filter((value) => !/启动|start|launch|reset/iu.test(value) && !isTerminal(value) && !isReplay(value));
  return {
    coreLoop: core.length > 0 ? core : journey.slice(0, 1),
    terminal: journey.filter(isTerminal),
    replay: journey.filter(isReplay),
  };
}

/** Evidence that the shipped entrypoint, not only isolated modules, implements the requested loop. */
const RuntimeProductGateBaseSchema = z.object({
  schemaVersion: z.literal(1),
  entrypoint: Text,
  defaultMode: Text,
  journey: z.array(Text).min(1),
  /** Explicit evidence categories prevent a generic "played" string from
   * masquerading as proof of the complete product journey.  They remain
   * optional on input for old artifacts; the preprocess below derives only
   * conservative values from the recorded journey. */
  coreLoop: z.array(Text).default([]),
  terminal: z.array(Text).default([]),
  replay: z.array(Text).default([]),
  runtimeWiredFiles: z.array(RuntimeFile).min(1),
  legacyBehavior: z.object({
    status: z.enum(['REMOVED_FROM_DEFAULT_PATH', 'COMPATIBILITY_ONLY', 'STILL_DEFAULT_PATH']),
    evidence: z.array(Text).min(1),
  }).strict(),
  browserEvidence: z.array(Text).min(1),
  passed: z.boolean(),
}).strict();

/**
 * Keep legacy false/diagnostic reports readable while ensuring a passed report
 * has the stronger, explicit journey categories.  The fallback never invents
 * a missing terminal or replay event: those arrays stay empty when the
 * journey does not contain an unambiguous marker and the gate then fails.
 */
export const RuntimeProductGateSchema = z.preprocess((raw) => {
  const record = asRecord(raw);
  if (!record) return raw;
  const journey = Array.isArray(record.journey) ? record.journey.filter((item): item is string => typeof item === 'string') : [];
  const fallbacks = journeyFallbacks(journey);
  return {
    ...record,
    coreLoop: record.coreLoop ?? fallbacks.coreLoop,
    terminal: record.terminal ?? fallbacks.terminal,
    replay: record.replay ?? fallbacks.replay,
  };
}, RuntimeProductGateBaseSchema).superRefine((value, context) => {
  const journeyText = value.journey.join('>');
  const includesAny = (values: string[]) => values.some((item) => journeyText.toLocaleLowerCase().includes(item.toLocaleLowerCase()));
  if (value.passed) {
    if (!/启动|start|launch|reset/iu.test(journeyText)) context.addIssue({ code: 'custom', path: ['journey'], message: 'journey must include startup' });
    if (value.coreLoop.length === 0 || !includesAny(value.coreLoop)) context.addIssue({ code: 'custom', path: ['coreLoop'], message: 'core loop evidence must be non-empty and appear in the journey' });
    if (value.terminal.length === 0 || !includesAny(value.terminal) || !/死亡|结算|成功|完成|terminal|settlement|death|fail|lose|win|success|complete|finish|game.?over/iu.test(journeyText)) context.addIssue({ code: 'custom', path: ['terminal'], message: 'terminal evidence must include an observed terminal outcome or settlement' });
    if (value.replay.length === 0 || !includesAny(value.replay) || !/再跑|重试|重开|replay|retry|restart|again/iu.test(journeyText)) context.addIssue({ code: 'custom', path: ['replay'], message: 'replay evidence must include a retry/replay action' });
    if (value.legacyBehavior.status === 'STILL_DEFAULT_PATH') context.addIssue({ code: 'custom', path: ['legacyBehavior', 'status'], message: 'legacy behavior cannot remain the default path' });
    if (value.browserEvidence.length === 0) context.addIssue({ code: 'custom', path: ['browserEvidence'], message: 'real browser evidence is required' });
  }
  for (const blocker of validateRuntimeWiredFiles(value.runtimeWiredFiles)) {
    context.addIssue({ code: 'custom', path: ['runtimeWiredFiles'], message: blocker });
  }
});

export type RuntimeProductGate = z.infer<typeof RuntimeProductGateSchema>;

export function validateRuntimeWiredFiles(files: string[]): string[] {
  const blockers: string[] = [];
  const seen = new Set<string>();
  for (const raw of files) {
    const value = String(raw).replaceAll('\\', '/').trim();
    if (!value || path.isAbsolute(value) || path.win32.isAbsolute(value) || value.split('/').some((part) => part === '..') || /^(?:[a-z]+:)?\/\//iu.test(value)) {
      blockers.push(`unsafe:${value || '<empty>'}`);
      continue;
    }
    if (seen.has(value)) blockers.push(`duplicate:${value}`);
    seen.add(value);
  }
  return [...new Set(blockers)];
}

function isChildPath(parent: string, candidate: string) {
  const relative = path.relative(parent, candidate);
  return relative.length > 0 && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Verify the declared runtime wiring against the actual run filesystem. */
export async function verifyRuntimeWiredFiles(input: { runRoot: string; files: string[] }) {
  const blockers = validateRuntimeWiredFiles(input.files);
  const checked: string[] = [];
  const root = path.resolve(input.runRoot);
  let realRoot: string;
  try { realRoot = await realpath(root); } catch { return { passed: false, blockers: [...new Set([...blockers, 'run-root:missing'])], checked }; }
  for (const raw of input.files) {
    const file = String(raw).replaceAll('\\', '/').trim();
    if (validateRuntimeWiredFiles([file]).length > 0) continue;
    const absolute = path.resolve(root, file);
    if (!isChildPath(root, absolute)) { blockers.push(`outside:${file}`); continue; }
    try {
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink()) { blockers.push(`symlink:${file}`); continue; }
      if (!stat.isFile()) { blockers.push(`not-file:${file}`); continue; }
      const resolved = await realpath(absolute);
      if (!isChildPath(realRoot, resolved)) { blockers.push(`outside-resolved:${file}`); continue; }
      checked.push(file);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : '';
      blockers.push(`${code === 'ENOENT' ? 'missing' : 'unreadable'}:${file}`);
    }
  }
  return { passed: blockers.length === 0 && checked.length === input.files.length, blockers: [...new Set(blockers)], checked };
}

export function evaluateRuntimeProductGate(input: Partial<Omit<RuntimeProductGate, 'passed'>> & { passed?: boolean }): RuntimeProductGate {
  return RuntimeProductGateSchema.parse({ ...input, passed: input.passed ?? true });
}

/**
 * Derive a runtime-product report from a trusted natural-play trace. This is
 * intentionally a small deterministic projection: it may classify an
 * observed settlement as the terminal outcome for management/narrative
 * products, but it never fabricates a state transition or a browser artifact.
 */
export function deriveRuntimeProductGate(input: {
  naturalFlow: unknown;
  runtimeWiredFiles: string[];
  browserEvidence: string[];
  entrypoint?: string;
  defaultMode?: string;
  legacyBehavior?: RuntimeProductGate['legacyBehavior'];
}): RuntimeProductGate {
  const rawNatural = asRecord(input.naturalFlow);
  const parsed = NaturalFlowEvidenceSchema.safeParse(rawNatural
    ? { ...rawNatural, observedAt: typeof rawNatural.observedAt === 'string' ? rawNatural.observedAt : new Date().toISOString() }
    : input.naturalFlow);
  const natural = parsed.success ? parsed.data : undefined;
  const changed = natural?.transitions.filter((transition) => transition.changed) ?? [];
  const hasTerminal = natural !== undefined && ['settlement', 'terminal'].includes(natural.completion);
  const journey = [
    '启动',
    ...changed.map((transition) => transition.name),
    ...(hasTerminal ? [natural!.completion, natural!.completion === 'settlement' ? '结算' : '终局'] : []),
    ...(natural?.replayObserved ? ['replay', '重试'] : []),
  ];
  const blockers: string[] = [];
  if (!parsed.success) blockers.push('natural-flow-schema-invalid');
  if (natural && !natural.startedFromReset) blockers.push('natural-reset-missing');
  if (changed.length === 0) blockers.push('natural-state-transition-missing');
  if (!hasTerminal) blockers.push('natural-terminal-missing');
  if (!natural?.replayObserved) blockers.push('natural-replay-missing');
  if ((natural?.forbiddenOperations.length ?? 0) > 0) blockers.push('natural-state-forcing-operation');
  if (input.browserEvidence.length === 0) blockers.push('browser-evidence-missing');
  const terminal = hasTerminal ? [natural!.completion === 'settlement' ? 'settlement' : 'terminal'] : [];
  return RuntimeProductGateSchema.parse({
    schemaVersion: 1,
    entrypoint: input.entrypoint ?? 'workspace/game/index.html',
    defaultMode: input.defaultMode ?? natural?.line ?? 'unknown',
    journey,
    coreLoop: changed.map((transition) => transition.name),
    terminal,
    replay: natural?.replayObserved ? ['replay'] : [],
    runtimeWiredFiles: input.runtimeWiredFiles,
    legacyBehavior: input.legacyBehavior ?? { status: 'COMPATIBILITY_ONLY', evidence: ['legacy compatibility is not the default route'] },
    browserEvidence: input.browserEvidence,
    passed: parsed.success && blockers.length === 0,
  });
}

/** Relative files the factory probes when a QA provider does not name a wiring set. */
export const RUNTIME_WIRED_CANDIDATES = [
  'workspace/game/index.html',
  'workspace/game/src/main.ts',
  'workspace/game/src/game.ts',
  'workspace/game/src/simulation.ts',
  'workspace/game/assets/resources/scenes/Main.scene',
] as const;

const PLACEHOLDER_WIRED_FILE = 'runtime-product-gates.json:provider-evidence-missing';
const PLACEHOLDER_BROWSER_EVIDENCE = 'runtime-product-journey:missing';

/** Fail-closed placeholder written when the QA provider emitted no usable journey. */
export function failClosedRuntimeProductPlaceholder(reason = 'QA provider must replace this placeholder'): RuntimeProductGate {
  return RuntimeProductGateSchema.parse({
    schemaVersion: 1,
    entrypoint: 'unknown',
    defaultMode: 'unknown',
    journey: ['reset', 'primary input', 'observe result', 'retry or finish'],
    coreLoop: [],
    terminal: [],
    replay: [],
    runtimeWiredFiles: [PLACEHOLDER_WIRED_FILE],
    legacyBehavior: { status: 'STILL_DEFAULT_PATH', evidence: [reason] },
    browserEvidence: [PLACEHOLDER_BROWSER_EVIDENCE],
    passed: false,
  });
}

export function isRuntimeProductPlaceholder(gate: RuntimeProductGate): boolean {
  return gate.runtimeWiredFiles.includes(PLACEHOLDER_WIRED_FILE) || gate.browserEvidence.includes(PLACEHOLDER_BROWSER_EVIDENCE);
}

export async function discoverRuntimeWiredFiles(runRoot: string): Promise<string[]> {
  const found: string[] = [];
  for (const relative of RUNTIME_WIRED_CANDIDATES) {
    if (await exists(path.join(runRoot, relative))) found.push(relative);
  }
  return found;
}

/**
 * Primary-path resolver: a passed gate is never rewritten (rescue lock).
 * Otherwise derive from a natural trace + real wired files, or keep/emit the
 * fail-closed placeholder. Derive failures stay fail-closed.
 */
export function resolveRuntimeProductGate(input: {
  existing?: RuntimeProductGate;
  naturalFlow?: unknown;
  runtimeWiredFiles: string[];
  browserEvidence: string[];
  entrypoint?: string;
  defaultMode?: string;
}): RuntimeProductGate {
  if (input.existing?.passed === true) return input.existing;
  if (input.runtimeWiredFiles.length > 0 && input.naturalFlow !== undefined) {
    try {
      const browserEvidence = input.browserEvidence.length > 0 ? input.browserEvidence : ['artifacts/runtime-product-journey.json'];
      return deriveRuntimeProductGate({
        naturalFlow: input.naturalFlow,
        runtimeWiredFiles: input.runtimeWiredFiles,
        browserEvidence,
        entrypoint: input.entrypoint ?? input.runtimeWiredFiles.find((file) => file.endsWith('index.html')) ?? input.runtimeWiredFiles[0],
        defaultMode: input.defaultMode,
      });
    } catch {
      // Keep the original report (or placeholder) rather than inventing a pass.
    }
  }
  return input.existing ?? failClosedRuntimeProductPlaceholder();
}
