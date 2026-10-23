import { lstat, mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

/**
 * Validate every existing component of a generated workspace path before any
 * mutation. The nearest run workspace root is the physical ownership anchor;
 * ancestors above it (including platform aliases such as macOS /var) are not
 * writable by this operation. A missing suffix is safe to create inside it.
 */
export async function assertSafeWorkspacePath(workspace: string): Promise<{ workspace: string; parent: string }> {
  const resolvedWorkspace = path.resolve(workspace);
  const parent = path.dirname(resolvedWorkspace);
  const ownerRoot = path.basename(parent) === 'workspace' ? path.dirname(parent) : parent;
  const root = path.parse(ownerRoot).root;
  if (ownerRoot === root) throw new Error('web-lite workspace owner must not be a filesystem root');
  let ownerEntry;
  try {
    ownerEntry = await lstat(ownerRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`web-lite workspace owner is missing: ${ownerRoot}`);
    throw error;
  }
  if (ownerEntry.isSymbolicLink()) throw new Error(`web-lite workspace owner must not be a symlink: ${ownerRoot}`);
  if (!ownerEntry.isDirectory()) throw new Error(`web-lite workspace owner must be a directory: ${ownerRoot}`);
  const ownerReal = await realpath(ownerRoot);
  const relative = path.relative(ownerRoot, resolvedWorkspace);
  if (!isWithin(ownerRoot, resolvedWorkspace)) throw new Error('web-lite workspace must remain inside its owning run');
  let current = ownerRoot;
  for (const component of relative.split(path.sep)) {
    if (!component || component === '.') continue;
    current = path.join(current, component);
    let entry;
    try {
      entry = await lstat(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
      throw error;
    }
    if (entry.isSymbolicLink()) {
      throw new Error(`web-lite workspace path must not contain symlink: ${path.relative(ownerRoot, current)}`);
    }
    if (!entry.isDirectory()) throw new Error(`web-lite workspace path component must be a directory: ${path.relative(ownerRoot, current)}`);
    if (!isWithin(ownerReal, await realpath(current))) throw new Error(`web-lite workspace path resolves outside its owner: ${path.relative(ownerRoot, current)}`);
  }
  await mkdir(parent, { recursive: true });
  return { workspace: resolvedWorkspace, parent };
}
