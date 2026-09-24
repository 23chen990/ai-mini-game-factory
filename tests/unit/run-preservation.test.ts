import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { archiveRunPaths, RunArchiveManifestSchema } from '../../src/core/run-preservation.js';
import { sha256Text } from '../../src/core/files.js';

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'factory-preservation-'));
  roots.push(root);
  await mkdir(path.join(root, 'artifacts'));
  await mkdir(path.join(root, 'workspace/generated-assets'), { recursive: true });
  await writeFile(path.join(root, 'artifacts/asset-manifest.json'), 'old-manifest');
  await writeFile(path.join(root, 'workspace/generated-assets/user-note.txt'), 'keep-user-note');
  return root;
}
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('run artifact preservation', () => {
  it('moves superseded artifacts into a hash-recorded archive within the owning run', async () => {
    const root = await fixture();
    const archive = await archiveRunPaths(root, ['artifacts/asset-manifest.json', 'workspace/generated-assets'], 'asset-vocabulary');
    expect(archive).toBeDefined();
    const manifest = RunArchiveManifestSchema.parse(JSON.parse(await readFile(path.join(root, archive!.manifestPath), 'utf8')));
    expect(manifest.targetRunId).toBe(path.basename(root));
    expect(manifest.reason).toBe('asset-vocabulary');
    expect(manifest.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourcePath: 'artifacts/asset-manifest.json', kind: 'file', sha256: sha256Text('old-manifest') }),
      expect.objectContaining({ sourcePath: 'workspace/generated-assets/user-note.txt', kind: 'file', sha256: sha256Text('keep-user-note') }),
    ]));
    const oldNote = manifest.entries.find((entry) => entry.sourcePath.endsWith('user-note.txt'))!;
    expect(await readFile(path.join(root, oldNote.archivedPath), 'utf8')).toBe('keep-user-note');
    await expect(readFile(path.join(root, 'artifacts/asset-manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps separate generations and does nothing when all requested inputs are absent', async () => {
    const root = await fixture();
    const first = await archiveRunPaths(root, ['artifacts/asset-manifest.json'], 'line-change');
    expect(await archiveRunPaths(root, ['artifacts/asset-manifest.json'], 'line-change')).toBeUndefined();
    await writeFile(path.join(root, 'artifacts/asset-manifest.json'), 'next-manifest');
    const second = await archiveRunPaths(root, ['artifacts/asset-manifest.json'], 'line-change');
    expect(second!.manifestPath).not.toBe(first!.manifestPath);
    expect(await readFile(path.join(root, first!.entries[0]!.archivedPath), 'utf8')).toBe('old-manifest');
    expect(await readFile(path.join(root, second!.entries[0]!.archivedPath), 'utf8')).toBe('next-manifest');
  });

  it('validates every requested path before moving any input', async () => {
    const root = await fixture();
    await expect(archiveRunPaths(root, ['artifacts/asset-manifest.json', '../foreign.json'], 'invalid')).rejects.toThrow(/path|outside|escape/i);
    expect(await readFile(path.join(root, 'artifacts/asset-manifest.json'), 'utf8')).toBe('old-manifest');
  });

  it('rejects an external parent symlink without changing either run', async () => {
    const root = await fixture();
    const foreign = await fixture();
    await symlink(path.join(foreign, 'artifacts'), path.join(root, 'linked-artifacts'));
    await expect(archiveRunPaths(root, ['artifacts/asset-manifest.json', 'linked-artifacts/asset-manifest.json'], 'invalid')).rejects.toThrow(/symlink|outside/i);
    expect(await readFile(path.join(root, 'artifacts/asset-manifest.json'), 'utf8')).toBe('old-manifest');
    expect(await readdir(path.join(foreign, 'artifacts'))).toEqual(['asset-manifest.json']);
  });

  it('rejects a redirected archive destination before moving source artifacts', async () => {
    const root = await fixture();
    const foreign = await fixture();
    await symlink(foreign, path.join(root, 'history'));
    await expect(archiveRunPaths(root, ['artifacts/asset-manifest.json'], 'invalid')).rejects.toThrow(/symlink|outside/i);
    expect(await readFile(path.join(root, 'artifacts/asset-manifest.json'), 'utf8')).toBe('old-manifest');
    expect(await readdir(foreign)).toEqual(['artifacts', 'workspace']);
  });
});
