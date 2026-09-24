import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { ArtifactLedgerSchema, type ArtifactLedger, type ArtifactLedgerEntry } from '../schemas/artifact-ledger.js';
import { sha256File } from './files.js';

export function createArtifactLedger(): ArtifactLedger { return ArtifactLedgerSchema.parse({ schemaVersion: 1, entries: [], updatedAt: new Date().toISOString() }); }

type ArtifactRecordInput = Pick<ArtifactLedgerEntry, 'path' | 'sha256' | 'producerStage' | 'inputHashes'>;
type StageEmissionInput = {
  producerStage: string;
  outputs: Array<Pick<ArtifactLedgerEntry, 'path' | 'sha256' | 'inputHashes'>>;
};

function cloneLedgerEntries(ledger: ArtifactLedger): ArtifactLedgerEntry[] {
  return ledger.entries.map((entry) => ({ ...entry, inputHashes: { ...entry.inputHashes }, invalidatedBy: [...entry.invalidatedBy] }));
}

function invalidateDependents(entries: ArtifactLedgerEntry[], changedPath: string, changedHash: string) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of entries) {
      const expected = entry.inputHashes[changedPath];
      if (entry.status === 'VALID' && expected !== undefined && expected !== changedHash) {
        entry.status = 'INVALIDATED';
        if (!entry.invalidatedBy.includes(changedPath)) entry.invalidatedBy.push(changedPath);
        changed = true;
      }
      if (entry.status === 'INVALIDATED' && !entry.invalidatedBy.includes(changedPath) && entry.inputHashes[changedPath] !== undefined) entry.invalidatedBy.push(changedPath);
    }
    // An invalidated artifact is itself a changed dependency for its children.
    for (const entry of entries.filter((item) => item.status === 'INVALIDATED')) {
      for (const child of entries) {
        if (child.status === 'VALID' && child.inputHashes[entry.path] !== undefined) {
          child.status = 'INVALIDATED';
          if (!child.invalidatedBy.includes(entry.path)) child.invalidatedBy.push(entry.path);
          changed = true;
        }
      }
    }
  }
}

function applyArtifactRecord(entries: ArtifactLedgerEntry[], input: ArtifactRecordInput, now: string) {
  const existing = entries.find((entry) => entry.path === input.path);
  if (existing) {
    const changed = existing.sha256 !== input.sha256;
    const wasInvalidated = existing.status === 'INVALIDATED';
    existing.sha256 = input.sha256; existing.producerStage = input.producerStage; existing.inputHashes = { ...input.inputHashes }; existing.recordedAt = now;
    // Re-recording an unchanged producer does not prove that previously
    // invalidated dependents were rebuilt. Preserve the producer's invalid
    // state (and its reasons) until the owning stage emits a fresh graph.
    if (!changed && !wasInvalidated) { existing.status = 'VALID'; existing.invalidatedBy = []; }
    else if (!changed && wasInvalidated) { existing.status = 'INVALIDATED'; }
    else { existing.status = 'VALID'; existing.invalidatedBy = []; invalidateDependents(entries, input.path, input.sha256); }
  } else entries.push({ ...input, status: 'VALID', invalidatedBy: [], recordedAt: now });
}

export function recordArtifact(ledgerValue: ArtifactLedger, input: ArtifactRecordInput): ArtifactLedger {
  const ledger = ArtifactLedgerSchema.parse(ledgerValue); const entries = cloneLedgerEntries(ledger); const now = new Date().toISOString();
  applyArtifactRecord(entries, input, now);
  return ArtifactLedgerSchema.parse({ schemaVersion: 1, entries, updatedAt: now });
}

/**
 * Commit every output emitted by one successfully validated stage as one
 * ledger transaction.  `recordArtifact` intentionally keeps an unchanged,
 * invalidated entry invalid because a generic re-record does not prove that
 * its owning stage ran.  This operation is the explicit proof that the stage
 * did run: only the listed outputs have their invalidation cleared.  Any
 * dependents (or sibling outputs) invalidated while the batch is applied are
 * cleared only when they are also in this same emission set, so an output from
 * a stage that did not run remains stale.
 */
export function recordStageEmission(ledgerValue: ArtifactLedger, input: StageEmissionInput): ArtifactLedger {
  const ledger = ArtifactLedgerSchema.parse(ledgerValue);
  const entries = cloneLedgerEntries(ledger);
  const now = new Date().toISOString();
  const emittedPaths = new Set(input.outputs.map((output) => output.path));
  if (emittedPaths.size !== input.outputs.length) throw new Error('stage emission output paths must be unique');

  for (const output of input.outputs) applyArtifactRecord(entries, { ...output, producerStage: input.producerStage }, now);
  for (const entry of entries) {
    if (!emittedPaths.has(entry.path)) continue;
    entry.status = 'VALID';
    entry.invalidatedBy = [];
  }
  return ArtifactLedgerSchema.parse({ schemaVersion: 1, entries, updatedAt: now });
}

/**
 * Mark a set of outputs as stale before a stage is retried.  This is kept
 * separate from `recordArtifact`: deleting a file without updating the ledger
 * would let an old release candidate look valid during the next resume.  The
 * operation is deterministic, idempotent and propagates invalidation through
 * every dependent artifact.
 */
export function invalidateArtifacts(ledgerValue: ArtifactLedger, paths: string[], reason = 'retry'): ArtifactLedger {
  const ledger = ArtifactLedgerSchema.parse(ledgerValue);
  const entries = ledger.entries.map((entry) => ({
    ...entry,
    inputHashes: { ...entry.inputHashes },
    invalidatedBy: [...entry.invalidatedBy],
  }));
  const requested = [...new Set(paths.map((item) => String(item).trim()).filter(Boolean))];
  for (const pathValue of requested) {
    const entry = entries.find((item) => item.path === pathValue);
    if (!entry) continue;
    entry.status = 'INVALIDATED';
    if (!entry.invalidatedBy.includes(reason)) entry.invalidatedBy.push(reason);
  }

  // An invalidated node is a changed dependency for all of its children. Keep
  // walking until a fixed point so grandchildren are also blocked.
  let changed = true;
  while (changed) {
    changed = false;
    for (const parent of entries.filter((item) => item.status === 'INVALIDATED')) {
      for (const child of entries) {
        if (child.status !== 'VALID' || child.inputHashes[parent.path] === undefined) continue;
        child.status = 'INVALIDATED';
        if (!child.invalidatedBy.includes(parent.path)) child.invalidatedBy.push(parent.path);
        changed = true;
      }
    }
  }
  return ArtifactLedgerSchema.parse({ schemaVersion: 1, entries, updatedAt: new Date().toISOString() });
}

export type ArtifactLedgerReconciliation = {
  ledger: ArtifactLedger;
  changed: string[];
  missing: string[];
  blockers: string[];
  passed: boolean;
};

function isSafeLedgerPath(root: string, value: string): boolean {
  if (!value || path.isAbsolute(value)) return false;
  // Treat both separators as path separators so a ledger authored on another
  // platform cannot smuggle a traversal segment into a POSIX runner.
  if (value.split(/[\\/]+/u).some((segment) => segment === '..')) return false;
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, value);
  const relative = path.relative(resolvedRoot, resolved);
  return relative.length > 0 && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/**
 * Reconcile the durable ledger with the files currently on disk.
 *
 * A run can be resumed after a human edit, an interrupted write, or a tool
 * failure.  Merely trusting the hashes saved during the previous attempt
 * would let stale QA or release evidence look current.  This function is
 * deliberately read-only with respect to files: it only returns an updated
 * ledger, marking drift/missing/unsafe entries invalid and propagating that
 * invalidation to every dependent artifact.
 */
export async function reconcileArtifactLedger(
  ledgerValue: ArtifactLedger,
  root: string,
  options: { ignoreMissing?: string[]; ignoreDrift?: string[] } = {},
): Promise<ArtifactLedgerReconciliation> {
  const ledger = ArtifactLedgerSchema.parse(ledgerValue);
  const rootPath = path.resolve(root);
  const changed: string[] = [];
  const missing: string[] = [];
  const unsafe: string[] = [];
  const ignored = new Set((options.ignoreMissing ?? []).map((item) => String(item)));
  const ignoredDrift = new Set((options.ignoreDrift ?? []).map((item) => String(item)));
  let reconciled = ledger;

  try {
    const rootStat = await lstat(rootPath);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      return { ledger: invalidateArtifacts(reconciled, ledger.entries.map((entry) => entry.path), 'unsafe-root'), changed, missing, blockers: ['unsafe-root'], passed: false };
    }
  } catch {
    return { ledger: invalidateArtifacts(reconciled, ledger.entries.map((entry) => entry.path), 'missing-root'), changed, missing: ['.'], blockers: ['missing-root'], passed: false };
  }

  for (const entry of ledger.entries) {
    if (!isSafeLedgerPath(rootPath, entry.path)) {
      unsafe.push(entry.path);
      reconciled = invalidateArtifacts(reconciled, [entry.path], `unsafe:${entry.path}`);
      continue;
    }
    const file = path.resolve(rootPath, entry.path);
    try {
      const stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        unsafe.push(entry.path);
        reconciled = invalidateArtifacts(reconciled, [entry.path], `unsafe:${entry.path}`);
        continue;
      }
      // Resolve the file as well as the root.  A symlink race between lstat
      // and read is treated as an integrity failure rather than followed.
      const [realRoot, realFile] = await Promise.all([realpath(rootPath), realpath(file)]);
      if (!isSafeLedgerPath(realRoot, path.relative(realRoot, realFile))) {
        unsafe.push(entry.path);
        reconciled = invalidateArtifacts(reconciled, [entry.path], `unsafe:${entry.path}`);
        continue;
      }
      const actual = await sha256File(file);
      if (actual !== entry.sha256 && !ignoredDrift.has(entry.path)) {
        changed.push(entry.path);
        reconciled = invalidateArtifacts(reconciled, [entry.path], `drift:${entry.path}`);
      }
    } catch {
      if (ignored.has(entry.path)) continue;
      missing.push(entry.path);
      reconciled = invalidateArtifacts(reconciled, [entry.path], `missing:${entry.path}`);
    }
  }

  const evaluated = evaluateArtifactLedger(reconciled);
  const blockers = [...new Set([...unsafe.map((item) => `unsafe-path:${item}`), ...missing.map((item) => `missing-file:${item}`), ...evaluated.blockers])];
  return { ledger: reconciled, changed, missing, blockers, passed: blockers.length === 0 && evaluated.passed };
}

export function evaluateArtifactLedger(value: unknown) {
  const ledger = ArtifactLedgerSchema.parse(value); const blockers: string[] = [];
  for (const entry of ledger.entries) if (entry.status === 'INVALIDATED') blockers.push(`invalidated:${entry.path}`);
  for (const entry of ledger.entries) for (const [dependency, expected] of Object.entries(entry.inputHashes)) {
    const source = ledger.entries.find((candidate) => candidate.path === dependency);
    if (!source) blockers.push(`missing-dependency:${dependency}`);
    else if (source.sha256 !== expected) blockers.push(`stale-dependency:${entry.path}:${dependency}`);
  }
  return { passed: blockers.length === 0, blockers: [...new Set(blockers)], ledger };
}
