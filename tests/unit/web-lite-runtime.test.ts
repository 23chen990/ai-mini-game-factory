import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { WebLiteRuntimeAdapter } from '../../src/adapters/web-lite.js';
import type { AssetManifest, GameBlueprint, StyleLock } from '../../src/schemas/index.js';

const blueprint: GameBlueprint = { schemaVersion: 1, gameId: 'real-assets', title: 'Real Assets', theme: 'night market', runtime: 'web-lite', template: 'idle-shop-v1', designMode: 'prototype_tournament', targetPlatforms: ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'], concept: 'test', coreLoop: ['arrive', 'produce', 'deliver', 'reward'], content: { productName: 'dango', customerName: 'spirit', currencyName: 'lamp' }, balance: { startingCurrency: 0, orderReward: 1, baseUpgradeCost: 2 }, preferences: {} };
const direction = { id: 'direction_c' as const, name: 'Woodcut', summary: 'bold woodcut', visualKeywords: ['woodcut'], palette: ['#111827', '#E8DEC8'], characterStyle: 'angular', environmentStyle: 'diagonal', uiStyle: 'notched', iconConcept: 'carved', forbiddenElements: ['logos'], productionComplexity: 'low' as const, previewPrompt: 'original woodcut market' };
const styleLock: StyleLock = { schemaVersion: 1, directionId: direction.id, direction, kept: [], changes: [], notes: [], lockedAt: new Date().toISOString() };

async function archivedWorkspaces(root: string, workspace = 'game') {
  const prefix = `${workspace}.archive-`;
  return (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix)).map((entry) => entry.name).sort();
}

describe('WebLiteRuntimeAdapter real assets', () => {
  it('creates a clean workspace without an archive on first create', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'web-lite-preserve-clean-'));
    const workspace = path.join(root, 'game');
    const adapter = new WebLiteRuntimeAdapter(process.cwd());

    await adapter.createProject(workspace, 'idle-shop-v1');

    await expect(readFile(path.join(workspace, 'package.json'), 'utf8')).resolves.toContain('idle-shop');
    await expect(archivedWorkspaces(root)).resolves.toEqual([]);
  });

  it('archives an existing workspace with files, partial work and symlinks before regeneration', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'web-lite-preserve-first-'));
    const workspace = path.join(root, 'game');
    const outside = path.join(root, 'preserved-target.txt');
    const adapter = new WebLiteRuntimeAdapter(process.cwd());
    await adapter.createProject(workspace, 'idle-shop-v1');
    await writeFile(path.join(workspace, 'failed-partial.txt'), 'partial work');
    await writeFile(outside, 'linked content');
    await symlink(outside, path.join(workspace, 'preserved-link.txt'));

    await adapter.createProject(workspace, 'idle-shop-v1');

    const [archiveName] = await archivedWorkspaces(root);
    expect(archiveName).toMatch(/^game\.archive-\d{8}T\d{6}Z-[0-9a-f-]{36}$/u);
    const archive = path.join(root, archiveName!);
    await expect(readFile(path.join(archive, 'failed-partial.txt'), 'utf8')).resolves.toBe('partial work');
    await expect(lstat(path.join(archive, 'preserved-link.txt'))).resolves.toMatchObject({ isSymbolicLink: expect.any(Function) });
    await expect(readlink(path.join(archive, 'preserved-link.txt'))).resolves.toBe(outside);
    await expect(readFile(path.join(workspace, 'failed-partial.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    const evidence = JSON.parse(await readFile(`${archive}.manifest.json`, 'utf8')) as Record<string, unknown>;
    expect(evidence).toMatchObject({ schemaVersion: 1, artifactType: 'web-lite-workspace-archive', sourceWorkspace: workspace, archiveWorkspace: archive, template: 'idle-shop-v1', preservation: 'rename', links: 'preserved' });
  });

  it('uses a unique archive for each regeneration and never overwrites the first archive', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'web-lite-preserve-repeat-'));
    const workspace = path.join(root, 'game');
    const adapter = new WebLiteRuntimeAdapter(process.cwd());
    await adapter.createProject(workspace, 'idle-shop-v1');
    await writeFile(path.join(workspace, 'first-generation.txt'), 'first');
    await adapter.createProject(workspace, 'idle-shop-v1');
    await writeFile(path.join(workspace, 'second-generation.txt'), 'second');

    await adapter.createProject(workspace, 'idle-shop-v1');

    const archives = await archivedWorkspaces(root);
    expect(archives).toHaveLength(2);
    expect(new Set(archives).size).toBe(2);
    const archiveFor = async (file: string, expected: string) => {
      const matches = await Promise.all(archives.map(async (name) => {
        try { return (await readFile(path.join(root, name, file), 'utf8')) === expected ? name : undefined; }
        catch { return undefined; }
      }));
      return matches.find((name): name is string => name !== undefined);
    };
    const firstArchive = await archiveFor('first-generation.txt', 'first');
    const secondArchive = await archiveFor('second-generation.txt', 'second');
    expect(firstArchive).toBeDefined();
    expect(secondArchive).toBeDefined();
    expect(firstArchive).not.toBe(secondArchive);
    await expect(readFile(path.join(root, firstArchive!, 'first-generation.txt'), 'utf8')).resolves.toBe('first');
    await expect(readFile(path.join(root, secondArchive!, 'second-generation.txt'), 'utf8')).resolves.toBe('second');
    await expect(readFile(path.join(root, firstArchive!, 'second-generation.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(path.join(root, secondArchive!, 'first-generation.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects an existing workspace symlink without touching its foreign target', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'web-lite-preserve-link-'));
    const foreign = await mkdtemp(path.join(tmpdir(), 'web-lite-preserve-foreign-'));
    const workspace = path.join(root, 'game');
    const sentinel = path.join(foreign, 'sentinel.txt');
    await writeFile(sentinel, 'untouched');
    await symlink(foreign, workspace);
    const adapter = new WebLiteRuntimeAdapter(process.cwd());

    await expect(adapter.createProject(workspace, 'idle-shop-v1')).rejects.toThrow(/workspace|symlink|path/i);

    await expect(readFile(sentinel, 'utf8')).resolves.toBe('untouched');
    await expect(lstat(path.join(foreign, 'package.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(archivedWorkspaces(root)).resolves.toEqual([]);
  });

  it('rejects a workspace parent symlink before creating a missing game directory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'web-lite-preserve-parent-link-'));
    const foreign = await mkdtemp(path.join(tmpdir(), 'web-lite-preserve-parent-foreign-'));
    const workspaceParent = path.join(root, 'workspace');
    const workspace = path.join(workspaceParent, 'game');
    const sentinel = path.join(foreign, 'sentinel.txt');
    await writeFile(sentinel, 'untouched');
    await symlink(foreign, workspaceParent);
    const adapter = new WebLiteRuntimeAdapter(process.cwd());

    await expect(adapter.createProject(workspace, 'idle-shop-v1')).rejects.toThrow(/workspace|symlink|path/i);

    await expect(readFile(sentinel, 'utf8')).resolves.toBe('untouched');
    await expect(lstat(path.join(foreign, 'game'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(archivedWorkspaces(root, 'game')).resolves.toEqual([]);
  });

  it('creates the cut-stack-dodge mother template without applying the idle test contract', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'web-lite-cut-contract-'));
    const workspace = path.join(root, 'game');
    const adapter = new WebLiteRuntimeAdapter(process.cwd());
    await adapter.createProject(workspace, 'cut-stack-dodge-v1');

    await expect(adapter.verifyProject(workspace, { requireScripts: false })).resolves.toEqual(expect.arrayContaining([
      'contract:cut-stack-dodge-v1',
      'contract:test-api-read-observe',
      'save:versioned',
    ]));
  });

  it('supports full Builder verification on the cut-stack-dodge production template', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'web-lite-cut-full-'));
    const workspace = path.join(root, 'game');
    const adapter = new WebLiteRuntimeAdapter(process.cwd());
    const cutBlueprint: GameBlueprint = { ...blueprint, gameId: 'cut-full', template: 'cut-stack-dodge-v1' };
    await adapter.createProject(workspace, 'cut-stack-dodge-v1');
    await adapter.applyBlueprint(workspace, cutBlueprint, styleLock);

    await expect(adapter.verifyProject(workspace, { requireScripts: true })).resolves.toEqual([
      'contract:cut-stack-dodge-v1',
      'contract:test-api-read-observe',
      'save:versioned',
      'test:passed',
      'typecheck:passed',
    ]);
  });


  it('keeps the idle mother template naturally repeatable after a settlement', async () => {
    const source = await readFile(path.join(process.cwd(), 'templates/web-lite/idle-shop-v1/src/main.ts'), 'utf8');
    expect(source).toMatch(/scheduleNextCustomer/);
    expect(source).toMatch(/setTimeout/);
  });

  it('writes the manifest PNG paths into generated game config', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'web-lite-real-assets-'));
    const workspace = path.join(root, 'game'); const sourceDir = path.join(root, 'source');
    const adapter = new WebLiteRuntimeAdapter(process.cwd());
    await adapter.createProject(workspace, 'idle-shop-v1');
    await adapter.applyBlueprint(workspace, blueprint, styleLock);
    await mkdir(sourceDir, { recursive: true });
    const definitions = [['customer', 'character'], ['product', 'product'], ['background', 'background'], ['upgrade', 'ui'], ['promo', 'marketing']] as const;
    await Promise.all(definitions.map(([id]) => writeFile(path.join(sourceDir, `${id}.png`), Buffer.from(`png-${id}`))));
    const manifest: AssetManifest = { schemaVersion: 1, provider: 'codex-imagegen', assets: definitions.map(([id, kind]) => ({ id, kind, path: `assets/${id}.png`, prompt: id, status: 'generated' as const, sha256: 'hash' })) };

    await adapter.importAssets(workspace, manifest, sourceDir);

    const config = JSON.parse(await readFile(path.join(workspace, 'src/generated/game-config.json'), 'utf8')) as { assets: Record<string, string> };
    expect(config.assets).toMatchObject({ customer: './assets/customer.png', product: './assets/product.png', background: './assets/background.png', upgrade: './assets/upgrade.png', promo: './assets/promo.png' });
    await expect(readFile(path.join(workspace, 'public/assets/customer.png'), 'utf8')).resolves.toBe('png-customer');
  });

  it('verifies the generated-game contract without requiring Codex-only scripts in Mock mode', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'web-lite-contract-'));
    const workspace = path.join(root, 'game');
    const adapter = new WebLiteRuntimeAdapter(process.cwd());
    await adapter.createProject(workspace, 'idle-shop-v1');

    await expect(adapter.verifyProject(workspace, { requireScripts: false })).resolves.toEqual(expect.arrayContaining([
      'contract:test-api-7',
      'save:versioned',
    ]));
  });

  it('supports full Builder verification on the idle production template', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'web-lite-full-verification-'));
    const workspace = path.join(root, 'game');
    const adapter = new WebLiteRuntimeAdapter(process.cwd());
    await adapter.createProject(workspace, 'idle-shop-v1');

    await expect(adapter.verifyProject(workspace, { requireScripts: true })).resolves.toEqual([
      'contract:test-api-7',
      'save:versioned',
      'test:passed',
      'typecheck:passed',
    ]);
  });

  it('accepts a versioned save implemented in a module imported by main', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'web-lite-modular-save-'));
    const workspace = path.join(root, 'game');
    const adapter = new WebLiteRuntimeAdapter(process.cwd());
    await adapter.createProject(workspace, 'idle-shop-v1');
    const mainFile = path.join(workspace, 'src/main.ts');
    const main = await readFile(mainFile, 'utf8');
    await writeFile(mainFile, main.replace("type State = { version: 1;", "import { CURRENT_SAVE_VERSION } from './game-state.ts';\ntype State = { version: number;").replace('version: 1,', 'version: CURRENT_SAVE_VERSION,'));
    await writeFile(path.join(workspace, 'src/game-state.ts'), 'export const CURRENT_SAVE_VERSION = 2;\n');

    await expect(adapter.verifyProject(workspace, { requireScripts: false })).resolves.toContain('save:versioned');
  });

  it('packages the production entrypoint for direct Finder and Safari opening', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'web-lite-finder-build-'));
    const workspace = path.join(root, 'game');
    const sourceDir = path.join(root, 'source');
    const adapter = new WebLiteRuntimeAdapter(process.cwd());
    await adapter.createProject(workspace, 'idle-shop-v1');
    await adapter.applyBlueprint(workspace, blueprint, styleLock);
    await mkdir(sourceDir, { recursive: true });
    const definitions = [['customer', 'character'], ['product', 'product'], ['background', 'background'], ['upgrade', 'ui'], ['promo', 'marketing']] as const;
    await Promise.all(definitions.map(([id]) => writeFile(path.join(sourceDir, `${id}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red"/></svg>`)));
    const manifest: AssetManifest = { schemaVersion: 1, provider: 'test', assets: definitions.map(([id, kind]) => ({ id, kind, path: `assets/${id}.svg`, prompt: id, status: 'generated' as const, sha256: 'hash' })) };
    await adapter.importAssets(workspace, manifest, sourceDir);

    await adapter.buildWeb(workspace);

    const html = await readFile(path.join(workspace, 'dist/index.html'), 'utf8');
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<script[^>]+type="module"/);
    expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/);
    expect(html).toContain('data:image/svg+xml;base64,');
    expect(html.indexOf('<script>')).toBeGreaterThan(html.indexOf('</main>'));
  });
});
