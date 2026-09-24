import { lstat, realpath, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ReferenceLevelRuntimeDataSchema, type ReferenceLevelRuntimeData } from '../schemas/reference-level-runtime.js';
import { ReferenceLevelImplementationContractSchema } from '../schemas/reference-recording.js';
import { referenceLevelRuntimeDataPath, verifyReferenceLevelRuntimeData } from './reference-level-runtime.js';
import { loadReferenceLevelLayout } from './reference-level-layout.js';

const FRAME_MANIFEST_PATH = 'artifacts/reference-frame-manifest.json';
const IMPLEMENTATION_CONTRACT_PATH = 'artifacts/reference-level-implementation-contract.json';
const RUNTIME_DATA_ARTIFACT_PATH = 'artifacts/reference-level-runtime-data.json';
const RESOLUTION_PATH = 'artifacts/production-line-resolution.json';

type RuntimeExpectation = {
  targetGame?: string;
  template: string;
  runtime: 'web-lite' | 'cocos-3d';
};

type FileCheck = { path: string; present: boolean };

function resolvedInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative.length > 0 && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function resolvedWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative.length === 0 || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function inspectRunFile(runRoot: string, relativePath: string): Promise<FileCheck> {
  const root = path.resolve(runRoot);
  const file = path.resolve(root, relativePath);
  if (!resolvedInside(root, file)) throw new Error(`reference-level-runtime: artifact path escapes run: ${relativePath}`);
  let fileStat;
  try {
    fileStat = await lstat(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { path: file, present: false };
    throw error;
  }
  if (fileStat.isSymbolicLink()) throw new Error(`reference-level-runtime: artifact must not be a symlink: ${relativePath}`);
  if (!fileStat.isFile()) throw new Error(`reference-level-runtime: artifact must be a regular file: ${relativePath}`);
  const [rootReal, fileReal] = await Promise.all([realpath(root), realpath(file)]);
  if (!resolvedInside(rootReal, fileReal)) throw new Error(`reference-level-runtime: artifact resolves outside run: ${relativePath}`);
  return { path: file, present: true };
}

/**
 * Walk every existing directory component without following symlinks. A
 * missing suffix is safe because writeJsonAtomic may create those in-run
 * directories later; an existing component must resolve inside the base.
 */
async function inspectDirectoryChain(base: string, target: string, label: string): Promise<boolean> {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  if (!resolvedWithin(resolvedBase, resolvedTarget)) throw new Error(`reference-level-runtime: ${label} path escapes its owner`);
  let baseStat;
  try {
    baseStat = await lstat(resolvedBase);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
  if (baseStat.isSymbolicLink()) throw new Error(`reference-level-runtime: ${label} base must not be a symlink`);
  if (!baseStat.isDirectory()) throw new Error(`reference-level-runtime: ${label} base must be a directory`);
  const baseReal = await realpath(resolvedBase);
  const relative = path.relative(resolvedBase, resolvedTarget);
  if (relative.length === 0) return true;
  let current = resolvedBase;
  for (const component of relative.split(path.sep)) {
    if (!component || component === '.') continue;
    current = path.join(current, component);
    let componentStat;
    try {
      componentStat = await lstat(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
    if (componentStat.isSymbolicLink()) throw new Error(`reference-level-runtime: ${label} component must not be a symlink: ${path.relative(resolvedBase, current)}`);
    if (!componentStat.isDirectory()) throw new Error(`reference-level-runtime: ${label} component must be a directory: ${path.relative(resolvedBase, current)}`);
    const componentReal = await realpath(current);
    if (!resolvedInside(baseReal, componentReal)) throw new Error(`reference-level-runtime: ${label} component resolves outside its owner: ${path.relative(resolvedBase, current)}`);
  }
  return true;
}

/**
 * Recording-bound reads happen before Builder creates a project, so a missing
 * workspace is valid at this point. An existing workspace must be a real
 * directory owned by this run; otherwise a workspace/game symlink could make
 * the lexical identity checks point at another run's project.
 */
async function inspectExistingWorkspace(runRoot: string, workspace: string): Promise<void> {
  const root = path.resolve(runRoot);
  const resolvedWorkspace = path.resolve(workspace);
  const present = await inspectDirectoryChain(root, resolvedWorkspace, 'workspace');
  if (!present) return;
  const runWorkspace = path.join(root, 'workspace');
  const [rootReal, runWorkspaceReal, workspaceReal] = await Promise.all([
    realpath(root),
    realpath(runWorkspace),
    realpath(resolvedWorkspace),
  ]);
  if (!resolvedInside(rootReal, runWorkspaceReal) || !resolvedInside(rootReal, workspaceReal) || !resolvedInside(runWorkspaceReal, workspaceReal)) {
    throw new Error('reference-level-runtime: workspace resolves outside owning run workspace');
  }
}

async function requiredRunFile(runRoot: string, relativePath: string): Promise<string> {
  const checked = await inspectRunFile(runRoot, relativePath);
  if (!checked.present) throw new Error(`reference-level-runtime: required artifact missing: ${relativePath}`);
  return checked.path;
}

async function parseJsonFile(file: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`reference-level-runtime: ${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function runtimeForTemplate(template: string): 'web-lite' | 'cocos-3d' {
  return template === 'spatial-shop-3d-v1' ? 'cocos-3d' : 'web-lite';
}

/**
 * Read the canonical, run-scoped runtime projection. Recording-level inputs
 * are opt-in: a run with none of the recording markers keeps the legacy build
 * path. Once any marker exists, all semantic inputs are required and verified.
 */
export async function readReferenceLevelRuntimeData(
  runRoot: string,
  workspace: string,
  expected?: RuntimeExpectation,
): Promise<ReferenceLevelRuntimeData | undefined> {
  const root = path.resolve(runRoot);
  const resolvedWorkspace = path.resolve(workspace);
  if (!resolvedInside(root, resolvedWorkspace)) throw new Error('reference-level-runtime: workspace must remain inside run');
  const markers = await Promise.all([
    inspectRunFile(root, FRAME_MANIFEST_PATH),
    inspectRunFile(root, IMPLEMENTATION_CONTRACT_PATH),
    inspectRunFile(root, RUNTIME_DATA_ARTIFACT_PATH),
  ]);
  if (!markers.some((marker) => marker.present)) return undefined;
  await inspectExistingWorkspace(root, resolvedWorkspace);

  const contractFile = await requiredRunFile(root, IMPLEMENTATION_CONTRACT_PATH);
  const runtimeDataFile = await requiredRunFile(root, RUNTIME_DATA_ARTIFACT_PATH);
  const resolutionFile = await requiredRunFile(root, RESOLUTION_PATH);
  const contractValue = await parseJsonFile(contractFile, 'implementation contract');
  const runtimeDataValue = await parseJsonFile(runtimeDataFile, 'runtime data');
  const resolutionValue = await parseJsonFile(resolutionFile, 'production line resolution');
  const contract = ReferenceLevelImplementationContractSchema.parse(contractValue);
  const identity = {
    targetRunId: path.basename(root),
    targetGame: expected?.targetGame ?? contract.targetGame,
    workspace: resolvedWorkspace,
  };
  const verification = verifyReferenceLevelRuntimeData(runtimeDataValue, contract, resolutionValue, identity);
  if (!verification.passed) throw new Error(`reference-level-runtime: canonical data rejected: ${verification.blockers.join(', ')}`);
  const data = ReferenceLevelRuntimeDataSchema.parse(runtimeDataValue);
  if (expected && data.production.template !== expected.template) throw new Error(`reference-level-runtime: template mismatch: ${data.production.template} !== ${expected.template}`);
  if (expected && data.production.runtime !== expected.runtime) throw new Error(`reference-level-runtime: runtime mismatch: ${data.production.runtime} !== ${expected.runtime}`);
  if (path.resolve(data.workspace) !== resolvedWorkspace) throw new Error('reference-level-runtime: workspace mismatch');
  return data;
}

async function inspectWorkspaceFile(workspace: string, relativePath: string): Promise<string> {
  const resolvedWorkspace = path.resolve(workspace);
  const file = path.resolve(resolvedWorkspace, relativePath);
  if (!resolvedInside(resolvedWorkspace, file)) throw new Error(`reference-level-runtime: staged data path escapes workspace: ${relativePath}`);
  await inspectDirectoryChain(resolvedWorkspace, resolvedWorkspace, 'workspace');
  await inspectDirectoryChain(resolvedWorkspace, path.dirname(file), 'staged data');
  let fileStat;
  try {
    fileStat = await lstat(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`reference-level-runtime: staged data missing: ${relativePath}`);
    throw error;
  }
  if (fileStat.isSymbolicLink()) throw new Error(`reference-level-runtime: staged data must not be a symlink: ${relativePath}`);
  if (!fileStat.isFile()) throw new Error(`reference-level-runtime: staged data must be a regular file: ${relativePath}`);
  const [workspaceReal, fileReal] = await Promise.all([realpath(resolvedWorkspace), realpath(file)]);
  if (!resolvedInside(workspaceReal, fileReal)) throw new Error(`reference-level-runtime: staged data resolves outside workspace: ${relativePath}`);
  return file;
}

/** Validate the runtime projection's parent directories before atomic write. */
export async function assertReferenceLevelRuntimeDataWritePath(workspace: string, runtime: 'web-lite' | 'cocos-3d'): Promise<void> {
  const resolvedWorkspace = path.resolve(workspace);
  const relativePath = referenceLevelRuntimeDataPath(runtime);
  const workspacePresent = await inspectDirectoryChain(resolvedWorkspace, resolvedWorkspace, 'workspace');
  if (!workspacePresent) return;
  await inspectDirectoryChain(resolvedWorkspace, path.join(resolvedWorkspace, path.dirname(relativePath)), 'staged data');
}

/** Verify the immutable runtime projection copied into the generated game. */
export async function verifyReferenceLevelRuntimeDataFile(workspace: string, dataValue: unknown): Promise<string> {
  const data = ReferenceLevelRuntimeDataSchema.parse(dataValue);
  const resolvedWorkspace = path.resolve(workspace);
  if (path.resolve(data.workspace) !== resolvedWorkspace) throw new Error('reference-level-runtime: staged data workspace mismatch');
  const relativePath = referenceLevelRuntimeDataPath(data.production.runtime);
  const file = await inspectWorkspaceFile(resolvedWorkspace, relativePath);
  const stagedValue = await parseJsonFile(file, 'staged runtime data');
  const staged = ReferenceLevelRuntimeDataSchema.parse(stagedValue);
  if (JSON.stringify(staged) !== JSON.stringify(data)) throw new Error('reference-level-runtime: staged data edited');
  return `reference-level-runtime-data:verified:${relativePath}:${data.runtimeDataHash}`;
}

/** The cut production line separates immutable semantics from Builder-authored
 * original tuning. Both inputs must be present before accepting its build. */
export async function verifyReferenceLevelLayoutFile(workspace: string, dataValue: unknown): Promise<string | undefined> {
  const data = ReferenceLevelRuntimeDataSchema.parse(dataValue);
  if (data.production.template !== 'cut-stack-dodge-v1' || data.production.runtime !== 'web-lite') return undefined;
  if (path.resolve(data.workspace) !== path.resolve(workspace)) throw new Error('reference-level-layout: workspace mismatch');
  const relativePath = 'src/generated/reference-level-layout.json';
  const file = await inspectWorkspaceFile(workspace, relativePath);
  const loaded = loadReferenceLevelLayout(await parseJsonFile(file, 'authored layout'), data);
  return `reference-level-layout:verified:${relativePath}:${loaded.layoutHash}`;
}

export type { RuntimeExpectation as ReferenceLevelRuntimeExpectation };
export { runtimeForTemplate };
