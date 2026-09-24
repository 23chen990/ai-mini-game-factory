import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ContextPacketSchema } from './context-budget.js';
import { assertSafeContextInputPath } from './execution-boundary.js';
import { executionPolicyForStage } from './model-policy.js';
import { sanitizeUntrustedText } from './security-boundary.js';
import { sha256Text } from './files.js';
import type { AgentExecutionContext } from '../providers/interfaces.js';
import { ResearchSandboxManifestSchema } from '../schemas/research-sandbox.js';

const RESEARCH_STAGES = new Set(['REFERENCE_DEEP_RESEARCH', 'COMPETITOR_RESEARCH', 'OPEN_SOURCE_RESEARCH']);

export type ResearchIsolationDescriptor = {
  mode: 'sanitized-read-only';
  root: string;
  manifestPath: string;
  allowedFiles: string[];
};

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function safeSandboxFile(inputPath: string, index: number): string {
  const normalized = assertSafeContextInputPath(inputPath);
  const hasWildcard = normalized.includes('*') || /\{[^}]+\}/u.test(normalized);
  const withoutTrailingSlash = normalized.replace(/\/+$/u, '');
  const safe = withoutTrailingSlash
    .replace(/[{}*]/gu, '_')
    .replace(/[^a-zA-Z0-9._/-]/gu, '_');
  if (!safe || safe === '.' || safe.startsWith('/') || safe.split('/').some((part) => part === '..')) return `__pointers__/input-${index}.txt`;
  if (hasWildcard || normalized.endsWith('/')) return `${safe.replace(/\/+$/u, '')}/__context-${index}.txt`;
  return safe;
}

/**
 * Create the only filesystem view a research Codex process is allowed to
 * inspect.  We deliberately materialize sanitized context excerpts instead
 * of exposing the run root: read-only OS sandboxes still permit a process to
 * read sibling files, dotfiles, credentials, or stale artifacts when its cwd
 * is the full run.  The returned descriptor is passed to the last provider
 * boundary and is independently auditable.
 */
export async function prepareResearchSandbox(context: AgentExecutionContext): Promise<ResearchIsolationDescriptor> {
  const stage = String(context.stage ?? '');
  if (!RESEARCH_STAGES.has(stage) || executionPolicyForStage(stage as never).role !== 'research') throw new Error(`research sandbox requires a research stage, got ${stage || 'unknown'}`);
  if (context.sandbox !== undefined && context.sandbox !== 'read-only') throw new Error('research sandbox requires read-only execution');
  const runRoot = path.resolve(context.runRoot);
  if (!path.isAbsolute(context.runRoot) || runRoot === path.parse(runRoot).root) throw new Error('research sandbox runRoot must be an absolute non-root path');
  const root = path.resolve(runRoot, 'research-sandbox', stage.toLowerCase());
  if (!isWithin(runRoot, root) || isWithin(path.join(runRoot, 'workspace'), root)) throw new Error('research sandbox cannot target the generated workspace');

  // This is a run-owned, stage-specific directory. Recreating it makes a
  // retry deterministic and prevents stale source excerpts from leaking into
  // the next attempt.
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true, mode: 0o700 });

  const packet = ContextPacketSchema.safeParse(context.contextPacket);
  const packetInputs = packet.success ? packet.data.inputs : [];
  const excerptByPath = new Map(packetInputs.map((item) => [item.path, item.excerpt]));
  const requested = [...new Set(context.inputPaths.map((item) => assertSafeContextInputPath(item)))];
  const allowedFiles: string[] = [];
  const inputHashes: Record<string, string> = {};
  for (const [index, inputPath] of requested.entries()) {
    const relative = safeSandboxFile(inputPath, index);
    const target = path.resolve(root, relative);
    if (!isWithin(root, target)) throw new Error(`research sandbox input escapes root: ${inputPath}`);
    const content = sanitizeUntrustedText(excerptByPath.get(inputPath) ?? `[artifact pointer only: ${inputPath}]`, 12_000);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, content, { encoding: 'utf8', mode: 0o600 });
    allowedFiles.push(relative.replaceAll(path.sep, '/'));
    inputHashes[inputPath] = sha256Text(content);
  }

  const mediaFiles: Array<{ path: string; sha256: string }> = [];
  for (const [index, media] of (context.mediaInputs ?? []).entries()) {
    const relative = assertSafeContextInputPath(media.path);
    if (!relative.startsWith('reference-evidence/derived/') || !/\.(?:png|jpe?g|webp)$/iu.test(relative)) throw new Error(`research media must stay inside derived reference evidence: ${relative}`);
    if (!/^[a-f0-9]{64}$/iu.test(media.sha256)) throw new Error(`research media requires a SHA-256 hash: ${relative}`);
    const source = path.resolve(runRoot, relative);
    if (!isWithin(runRoot, source)) throw new Error(`research media escapes run root: ${relative}`);
    const sourceStat = await lstat(source);
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new Error(`research media must be a regular file: ${relative}`);
    const [realRunRoot, realSource] = await Promise.all([realpath(runRoot), realpath(source)]);
    if (!isWithin(realRunRoot, realSource)) throw new Error(`research media resolves outside run root: ${relative}`);
    const actualHash = createHash('sha256').update(await readFile(realSource)).digest('hex');
    if (actualHash !== media.sha256.toLowerCase()) throw new Error(`research media hash mismatch: ${relative}`);
    const target = path.resolve(root, relative);
    if (!isWithin(root, target)) throw new Error(`research media target escapes sandbox: ${relative}`);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await copyFile(realSource, target);
    allowedFiles.push(relative);
    inputHashes[`media:${index}:${relative}`] = actualHash;
    mediaFiles.push({ path: relative, sha256: actualHash });
  }

  // Keep a small human/machine-readable manifest inside the isolated root;
  // it contains no raw source text and makes the boundary inspectable after a
  // failed or resumed run.
  const manifestPath = path.join(root, 'SANDBOX_MANIFEST.json');
  const manifest = ResearchSandboxManifestSchema.parse({
    schemaVersion: 1,
    stage,
    mode: 'sanitized-read-only' as const,
    rootRelative: path.relative(runRoot, root).replaceAll(path.sep, '/'),
    allowedFiles,
    inputHashes,
    mediaFiles,
    createdAt: new Date().toISOString(),
  });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return { mode: 'sanitized-read-only', root, manifestPath, allowedFiles };
}

export function isResearchExecutionStage(stage: string): boolean {
  return RESEARCH_STAGES.has(stage);
}
