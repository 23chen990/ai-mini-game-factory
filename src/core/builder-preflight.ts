import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

export interface BuilderPreflightInput {
  runRoot: string;
  workspace: string;
  targetGameId: string;
  targetWorkspaceRelative: string;
  requiredArtifacts: readonly string[];
}

export interface BuilderPreflightResult {
  passed: boolean;
  blockers: string[];
  checkedArtifacts: string[];
}

function normalizeRelative(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//u, '');
}

function safeRelative(value: string): boolean {
  return value.length > 0
    && !path.isAbsolute(value)
    && !path.win32.isAbsolute(value)
    && !value.split('/').some((part) => part === '..')
    && !/^(?:[a-z]+:)?\/\//iu.test(value);
}

/**
 * Fail closed before a workspace writer runs. This is intentionally separate
 * from provider verification: it catches wrong-run/wrong-workspace handoffs
 * and missing design contracts before any generated code is touched.
 */
export async function verifyBuilderPreflight(input: BuilderPreflightInput): Promise<BuilderPreflightResult> {
  const blockers: string[] = [];
  const checkedArtifacts: string[] = [];
  const runRoot = path.resolve(input.runRoot);
  const workspace = path.resolve(input.workspace);
  const expectedWorkspace = normalizeRelative(input.targetWorkspaceRelative);
  const actualWorkspace = normalizeRelative(path.relative(runRoot, workspace));

  if (!path.isAbsolute(input.runRoot) || path.parse(runRoot).root === runRoot) blockers.push('run-root-invalid');
  if (!path.isAbsolute(input.workspace)) blockers.push('workspace-invalid');
  if (!input.targetGameId.trim()) blockers.push('target-game-missing');
  if (!safeRelative(expectedWorkspace)) blockers.push('target-workspace-invalid');
  if (actualWorkspace !== expectedWorkspace) blockers.push(`workspace-mismatch:${actualWorkspace || '<root>'}`);

  try {
    const rootReal = await realpath(runRoot);
    const workspaceStat = await lstat(workspace);
    if (!workspaceStat.isDirectory()) blockers.push('workspace-not-directory');
    if (workspaceStat.isSymbolicLink()) blockers.push('workspace-symlink');
    const workspaceReal = await realpath(workspace);
    const relative = path.relative(rootReal, workspaceReal);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) blockers.push('workspace-outside-run');
  } catch {
    blockers.push('workspace-missing');
  }

  const seen = new Set<string>();
  for (const raw of input.requiredArtifacts) {
    const artifact = normalizeRelative(String(raw).trim());
    if (!safeRelative(artifact)) {
      blockers.push(`unsafe-artifact:${artifact || '<empty>'}`);
      continue;
    }
    if (seen.has(artifact)) {
      blockers.push(`duplicate-artifact:${artifact}`);
      continue;
    }
    seen.add(artifact);
    try {
      const stat = await lstat(path.join(runRoot, artifact));
      if (stat.isSymbolicLink()) blockers.push(`artifact-symlink:${artifact}`);
      else if (!stat.isFile()) blockers.push(`artifact-not-file:${artifact}`);
      else checkedArtifacts.push(artifact);
    } catch {
      blockers.push(`missing-artifact:${artifact}`);
    }
  }

  return { passed: blockers.length === 0, blockers, checkedArtifacts };
}
