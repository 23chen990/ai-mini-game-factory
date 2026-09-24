import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, readlink, rename } from 'node:fs/promises';
import path from 'node:path';
import { sha256File, sha256Text, writeJsonAtomic } from './files.js';

export const RunArchiveManifestSchema = z.object({
  schemaVersion: z.literal(1),
  targetRunId: z.string().min(1),
  reason: z.string().min(1),
  manifestPath: z.string().min(1),
  status: z.enum(['prepared', 'archived']),
  movedPaths: z.array(z.string().min(1)),
  entries: z.array(z.object({
    sourcePath: z.string().min(1),
    archivedPath: z.string().min(1),
    kind: z.enum(['file', 'directory', 'symlink']),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  }).strict()),
  archivedAt: z.iso.datetime(),
}).strict();

async function statIfPresent(file: string) {
  try { return await lstat(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}

function relativeRunPath(value: string): string {
  if (!value || path.isAbsolute(value) || value.includes('\\') || value.split('/').some((part) => part === '..' || part === '.')) {
    throw new Error(`Archive path must be a strict run-relative path: ${value}`);
  }
  return value.replace(/\/+$/u, '');
}

async function verifyParents(root: string, relative: string) {
  let current = root;
  for (const component of ['', ...relative.split('/').slice(0, -1)]) {
    current = path.join(current, component);
    const stat = await statIfPresent(current);
    if (!stat) return;
    if (stat.isSymbolicLink()) throw new Error(`Archive parent must not be a symlink: ${current}`);
    if (!stat.isDirectory()) throw new Error(`Archive parent must be a directory: ${current}`);
  }
}

/** Preserve superseded files before a stage regenerates them. No symlink is
 * followed, and a prepared manifest remains available if a move is interrupted. */
export async function archiveRunPaths(runRoot: string, paths: string[], reason: string): Promise<z.infer<typeof RunArchiveManifestSchema> | undefined> {
  const root = path.resolve(runRoot);
  if (!/^[a-z0-9-]+$/u.test(reason)) throw new Error('Archive reason must be a lowercase path-safe identifier');
  const requested = [...new Set(paths.map(relativeRunPath))];
  if (requested.some((item) => item === 'history' || item.startsWith('history/'))) throw new Error('An archive cannot archive its own history');
  const selected = requested.filter((item) => !requested.some((parent) => item.startsWith(`${parent}/`)));
  const archiveDirectory = `history/factory-migrations/${reason}-${randomUUID()}`;
  const manifestPath = `${archiveDirectory}/manifest.json`;
  await verifyParents(root, manifestPath);
  for (const relative of selected) await verifyParents(root, relative);
  const present: string[] = [];
  const entries: z.infer<typeof RunArchiveManifestSchema>['entries'] = [];
  async function inspect(relative: string): Promise<void> {
    const file = path.join(root, relative);
    const stat = await lstat(file);
    const base = { sourcePath: relative, archivedPath: `${archiveDirectory}/files/${relative}` };
    if (stat.isSymbolicLink()) {
      entries.push({ ...base, kind: 'symlink', sha256: sha256Text(await readlink(file)) });
    } else if (stat.isDirectory()) {
      entries.push({ ...base, kind: 'directory' });
      for (const child of (await readdir(file)).sort()) await inspect(`${relative}/${child}`);
    } else if (stat.isFile()) {
      entries.push({ ...base, kind: 'file', sha256: await sha256File(file) });
    } else throw new Error(`Unsupported archive input type: ${relative}`);
  }
  for (const relative of selected) {
    if (!await statIfPresent(path.join(root, relative))) continue;
    await inspect(relative);
    present.push(relative);
  }
  if (present.length === 0) return undefined;
  const manifest = RunArchiveManifestSchema.parse({
    schemaVersion: 1, targetRunId: path.basename(root), reason, manifestPath,
    status: 'prepared', movedPaths: [], entries, archivedAt: new Date().toISOString(),
  });
  await writeJsonAtomic(path.join(root, manifestPath), manifest);
  for (const relative of present) {
    const destination = path.join(root, archiveDirectory, 'files', relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await rename(path.join(root, relative), destination);
    manifest.movedPaths.push(relative);
    await writeJsonAtomic(path.join(root, manifestPath), manifest);
  }
  manifest.status = 'archived';
  await writeJsonAtomic(path.join(root, manifestPath), manifest);
  return manifest;
}
