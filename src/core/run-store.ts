import { appendFile, copyFile, lstat, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { exists, readJson, sha256File, sha256Text, writeJsonAtomic } from './files.js';
import { redactValue } from './redaction.js';
import { RunStateSchema, SeedSchema, type RunState, type Seed, type StageName, type StageRecord } from '../schemas/index.js';
import { GameRunIdentityManifestSchema, type GameRunIdentityManifest } from '../schemas/game-identity.js';
import { buildGameRunIdentityManifest, GAME_RUN_IDENTITY_ARTIFACT, validateGameRunIdentityImmutability } from './game-identity.js';
import { normalizeRunReadiness } from './run-readiness.js';

function assertSafeRunId(runId: string): void {
  if (typeof runId !== 'string' || runId.length === 0 || path.isAbsolute(runId) || path.win32.isAbsolute(runId) || runId === '.' || runId === '..' || runId.includes('/') || runId.includes('\\')) {
    throw new Error('Invalid run id: expected a single path segment');
  }
}

function assertSafeArtifactName(name: string): void {
  if (typeof name !== 'string' || name.trim().length === 0 || path.isAbsolute(name) || path.win32.isAbsolute(name)) throw new Error('Invalid artifact name: expected a relative path');
  const normalized = name.replaceAll('\\', '/');
  if (normalized === '.' || normalized.startsWith('../') || normalized.includes('/../') || normalized.split('/').some((part) => part === '')) throw new Error('Invalid artifact name: path traversal or empty segment');
}

async function assertNoSymlinkInPath(root: string, target: string): Promise<void> {
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Artifact path escapes the artifacts directory');
  try {
    const rootStat = await lstat(root);
    if (rootStat.isSymbolicLink()) throw new Error('Artifact path root contains a symlink: artifacts');
    if (!rootStat.isDirectory()) throw new Error('Artifact path root must be a directory');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    // The atomic writer may create a missing artifacts directory on first use.
  }
  let current = root;
  for (const segment of relative.split(path.sep)) {
    if (!segment) continue;
    current = path.join(current, segment);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`Artifact path contains a symlink: ${path.relative(root, current)}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
      throw error;
    }
  }
}

export class FileRunStore {
  constructor(readonly root: string) {}
  runsRoot() { return path.join(this.root, 'runs'); }
  runRoot(runId: string) { assertSafeRunId(runId); return path.join(this.runsRoot(), runId); }
  artifact(runId: string, name: string) { assertSafeArtifactName(name); return path.join(this.runRoot(runId), 'artifacts', name); }
  async readSeedFile(file: string): Promise<Seed> { return SeedSchema.parse(parse(await readFile(file, 'utf8'))); }
  async create(runId: string, seedFile: string, mode: 'mock' | 'live-art' | 'codex-account') {
    const root = this.runRoot(runId);
    for (const name of ['input', 'artifacts', 'art-review/previews', 'human', 'workspace/game', 'logs', 'logs/handoffs', 'screenshots', 'release-candidate']) await mkdir(path.join(root, name), { recursive: true });
    await copyFile(seedFile, path.join(root, 'input/seed.yaml'));
    const now = new Date().toISOString();
    // Keep FileRunStore.create backwards compatible for low-level callers that
    // intentionally persist an incomplete legacy seed. Factory.newRun already
    // performs full SeedSchema validation; the manifest only needs the stable
    // identity fields available in the copied input.
    const rawSeed = parse(await readFile(seedFile, 'utf8')) as { title?: unknown; template?: unknown; runtime?: unknown; identity?: { canonicalGameId?: unknown; aliases?: unknown; variantId?: unknown; variantOf?: unknown } };
    const identitySeed = {
      title: typeof rawSeed.title === 'string' && rawSeed.title.trim() ? rawSeed.title : `run-${runId}`,
      template: typeof rawSeed.template === 'string' && rawSeed.template.trim() ? rawSeed.template : 'unknown-template',
      // SeedSchema supplies web-lite as the runtime default; mirror that
      // default here so low-level legacy callers get the same bound context.
      runtime: typeof rawSeed.runtime === 'string' && rawSeed.runtime.trim() ? rawSeed.runtime : 'web-lite',
    } as Pick<Seed, 'title' | 'template' | 'runtime'>;
    const explicit = rawSeed.identity;
    const manifest = await this.writeImmutableGameRunIdentity(runId, buildGameRunIdentityManifest({
      runId,
      seed: identitySeed,
      seedSha256: await sha256File(seedFile),
      createdAt: now,
      ...(typeof explicit?.canonicalGameId === 'string' ? { canonicalGameId: explicit.canonicalGameId } : {}),
      ...(Array.isArray(explicit?.aliases) && explicit.aliases.every((value): value is string => typeof value === 'string') ? { aliases: explicit.aliases } : {}),
      ...(typeof explicit?.variantId === 'string' ? { variantId: explicit.variantId } : {}),
      ...(typeof explicit?.variantOf === 'string' ? { variantOf: explicit.variantOf } : {}),
    }));
    const state: RunState = { schemaVersion: 1, runId, runKind: 'game', stage: 'CREATED', status: 'pending', readiness: 'IN_PROGRESS', createdAt: now, updatedAt: now, fixAttempts: 0, prototypeBatch: 1, providerMode: mode, canonicalGameId: manifest.canonicalGameId, ...(manifest.variantId ? { variantId: manifest.variantId } : {}), identityManifestHash: sha256Text(JSON.stringify(manifest)), stages: {}, transitionHistory: [] };
    await this.save(state); await this.log(runId, 'run.created', { seedFile }); return state;
  }
  async createActionExperiment(runId: string, specFile: string, mode: 'mock' | 'live-art' | 'codex-account') {
    const root = this.runRoot(runId);
    for (const name of ['input', 'artifacts', 'human', 'workspace/action-a', 'workspace/action-b', 'workspace/action-c', 'logs', 'logs/handoffs', 'screenshots']) await mkdir(path.join(root, name), { recursive: true });
    await copyFile(specFile, path.join(root, 'input/action-experiment.json'));
    const now = new Date().toISOString();
    const state: RunState = { schemaVersion: 1, runId, runKind: 'action-experiment', stage: 'CREATED', status: 'pending', readiness: 'IN_PROGRESS', createdAt: now, updatedAt: now, fixAttempts: 0, prototypeBatch: 1, providerMode: mode, stages: {}, transitionHistory: [] };
    await this.save(state); await this.log(runId, 'action-experiment.created', { specFile }); return state;
  }
  async load(runId: string) { return RunStateSchema.parse(await readJson(path.join(this.runRoot(runId), 'state.json'))); }
  async save(state: RunState) {
    const file = path.join(this.runRoot(state.runId), 'state.json');
    let previous: RunState | undefined;
    try { previous = RunStateSchema.parse(await readJson(file)); } catch { /* first save or an interrupted legacy write */ }
    const history = [...(state.transitionHistory ?? previous?.transitionHistory ?? [])];
    if (previous && previous.stage !== state.stage) {
      const last = history.at(-1);
      if (!last || last.from !== previous.stage || last.to !== state.stage) history.push({ from: previous.stage, to: state.stage, reason: 'state-save', at: new Date().toISOString(), runId: state.runId });
    }
    state.transitionHistory = history;
    state.updatedAt = new Date().toISOString();
    normalizeRunReadiness(state);
    const parsed = RunStateSchema.parse(state);
    await writeJsonAtomic(file, parsed);
  }
  async log(runId: string, event: string, data: unknown) { await appendFile(path.join(this.runRoot(runId), 'logs/factory.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), event, data: redactValue(data) })}\n`); }
  async hasArtifact(runId: string, name: string) { return exists(this.artifact(runId, name)); }
  async writeArtifact(runId: string, name: string, value: unknown) {
    const file = this.artifact(runId, name);
    const artifactsRoot = path.join(this.runRoot(runId), 'artifacts');
    await assertNoSymlinkInPath(artifactsRoot, file);
    await writeJsonAtomic(file, value);
  }
  async writeImmutableGameRunIdentity(runId: string, value: GameRunIdentityManifest): Promise<GameRunIdentityManifest> {
    const manifest = GameRunIdentityManifestSchema.parse(value);
    const file = this.artifact(runId, GAME_RUN_IDENTITY_ARTIFACT);
    if (await exists(file)) {
      const previous = GameRunIdentityManifestSchema.parse(await this.readArtifact(runId, GAME_RUN_IDENTITY_ARTIFACT));
      const validation = validateGameRunIdentityImmutability(previous, manifest);
      if (!validation.passed) throw new Error(`game/run identity manifest is immutable: ${validation.blockers.join(', ')}`);
      return previous;
    }
    await this.writeArtifact(runId, GAME_RUN_IDENTITY_ARTIFACT, manifest);
    return manifest;
  }
  async readArtifact(runId: string, name: string) {
    const file = this.artifact(runId, name);
    await assertNoSymlinkInPath(path.join(this.runRoot(runId), 'artifacts'), file);
    return readJson(file);
  }
  record(stage: StageName, previous?: StageRecord): StageRecord { return { stage, status: 'running', startedAt: new Date().toISOString(), finishedAt: null, attempts: (previous?.attempts ?? 0) + 1, inputArtifacts: [], outputArtifacts: [], errors: previous?.errors ?? [], evidence: [], providerCalls: previous?.providerCalls ?? { agent: 0, image: 0 }, tokenUsage: previous?.tokenUsage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 } }; }
}
