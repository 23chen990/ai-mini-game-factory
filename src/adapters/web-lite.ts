import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RuntimeAdapter } from './runtime.js';
import type { AssetManifest, GameBlueprint, StyleLock } from '../schemas/index.js';
import { copyTree, exists, listFiles, writeJsonAtomic } from '../core/files.js';

function command(bin: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const env = (() => {
      const cleanEnv = { ...process.env };
      // A parent `pnpm` process may export this switch globally. It is only
      // meaningful for package-manager invocations and must not leak into
      // factory-pinned test/typecheck/build binaries.
      delete cleanEnv.pnpm_config_verify_deps_before_run;
      return bin === 'pnpm' || bin === 'corepack'
      // pnpm 11 verifies dependency state before every run and rebuilds
      // node_modules when it disagrees (verifyDepsBeforeRun defaults to
      // "install"). Generated workspaces share the factory's node_modules
      // through a symlink, so that check would wipe the factory's own
      // dependency tree mid-run. pnpm reads this toggle from the
      // pnpm_config_* env namespace, not npm_config_*. Disable it for spawned
      // package-manager commands only; interactive pnpm keeps its defaults.
        ? { ...cleanEnv, pnpm_config_verify_deps_before_run: 'false' }
        : cleanEnv;
    })();
    const child = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env });
    let output = '';
    let settled = false;
    child.stdout.on('data', (d) => output += d);
    child.stderr.on('data', (d) => output += d);
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' && bin === 'pnpm') {
        // pnpm is not on PATH: fall back to corepack, which resolves the
        // packageManager version declared in package.json (pnpm@11.19.0).
        void command('corepack', ['pnpm', ...args], cwd).then(resolve, reject);
        return;
      }
      reject(new Error(`${bin} could not be started: ${code === 'ENOENT' ? `${bin} was not found on PATH` : error.message}`));
    });
    child.on('exit', (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) resolve();
      else reject(new Error(`${bin} failed (${code}): ${output}`));
    });
  });
}

const playableMimeTypes: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function archiveTimestamp() {
  return new Date().toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z');
}

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
async function assertSafeWorkspacePath(workspace: string): Promise<{ workspace: string; parent: string }> {
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

/**
 * Move a prior generated workspace aside atomically. Rename preserves failed
 * partial files and symlinks without traversing or dereferencing them.
 */
async function archiveExistingWorkspace(workspace: string, parent: string, template: string): Promise<void> {
  let workspaceEntry;
  try {
    workspaceEntry = await lstat(workspace);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  if (workspaceEntry.isSymbolicLink()) throw new Error('web-lite workspace must not be a symlink');
  if (!workspaceEntry.isDirectory()) throw new Error('web-lite workspace must be a directory');

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const archive = path.join(parent, `${path.basename(workspace)}.archive-${archiveTimestamp()}-${randomUUID()}`);
    try {
      await lstat(archive);
      continue;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    try {
      await rename(workspace, archive);
      await writeJsonAtomic(`${archive}.manifest.json`, {
        schemaVersion: 1,
        artifactType: 'web-lite-workspace-archive',
        sourceWorkspace: workspace,
        archiveWorkspace: archive,
        template,
        preservation: 'rename',
        links: 'preserved',
        archivedAt: new Date().toISOString(),
      });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST' && code !== 'ENOTEMPTY') throw error;
    }
  }
  throw new Error(`web-lite could not allocate a unique archive for ${workspace}`);
}

async function packageFinderPlayable(output: string): Promise<void> {
  const indexFile = path.join(output, 'index.html');
  let html = await readFile(indexFile, 'utf8');
  const scriptMatch = html.match(/<script[^>]*src="([^"]+)"[^>]*><\/script>/);
  const styleMatch = html.match(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
  if (!scriptMatch?.[1] || !styleMatch?.[1]) throw new Error('Production build must contain one script and stylesheet entrypoint');
  const resolveOutputReference = (reference: string) => path.join(output, reference.replace(/^(?:\.\/|\/)/, ''));
  let script = await readFile(resolveOutputReference(scriptMatch[1]), 'utf8');
  let style = await readFile(resolveOutputReference(styleMatch[1]), 'utf8');
  for (const file of await listFiles(output)) {
    const mime = playableMimeTypes[path.extname(file).toLowerCase()];
    if (!mime) continue;
    const data = await readFile(path.join(output, file));
    const dataUrl = `data:${mime};base64,${data.toString('base64')}`;
    for (const reference of [`./${file}`, `/${file}`, file]) {
      script = script.replaceAll(reference, dataUrl);
      style = style.replaceAll(reference, dataUrl);
    }
  }
  script = script.replaceAll('</script', '<\\/script');
  style = style.replaceAll('</style', '<\\/style');
  html = html.replace(scriptMatch[0], '').replace(styleMatch[0], `<style>${style}</style>`);
  html = html.replace('</body>', `<script>${script}</script></body>`);
  await writeFile(indexFile, html);
}

export class WebLiteRuntimeAdapter implements RuntimeAdapter {
  private preview?: { stop: () => Promise<void> };
  constructor(private readonly repositoryRoot: string) {}
  // Generated workspaces reuse the factory's node_modules through a symlink.
  // Never run the package manager inside such a workspace: pnpm 11's
  // verify-deps-before-run would reconcile the symlinked tree against the
  // workspace manifest and prune the factory's own dependencies. Invoke the
  // factory's pinned binaries directly instead (same approach as buildWeb).
  private factoryBin(name: string) { return path.join(this.repositoryRoot, 'node_modules/.bin', name); }
  async createProject(workspace: string, template: string) {
    const templateDirectories: Record<string, string> = {
      'idle-shop-v1': 'idle-shop-v1',
      'spatial-shop-v1': 'spatial-shop-v1',
      'cut-stack-dodge-v1': 'cut-stack-dodge-v1',
    };
    const templateDirectory = templateDirectories[template];
    if (!templateDirectory) throw new Error(`Unsupported web-lite template: ${template}`);
    const safeWorkspace = await assertSafeWorkspacePath(workspace);
    await archiveExistingWorkspace(safeWorkspace.workspace, safeWorkspace.parent, template);
    await copyTree(path.join(this.repositoryRoot, 'templates/web-lite', templateDirectory), safeWorkspace.workspace);
    await rm(path.join(safeWorkspace.workspace, 'node_modules'), { recursive: true, force: true });
    await rm(path.join(safeWorkspace.workspace, 'dist'), { recursive: true, force: true });
    // Generated projects reuse the factory's pinned dependency store; the release build is self-contained.
    await symlink(path.join(this.repositoryRoot, 'node_modules'), path.join(safeWorkspace.workspace, 'node_modules'), 'dir');
  }
  async applyBlueprint(workspace: string, blueprint: GameBlueprint, styleLock: StyleLock) {
    await mkdir(path.join(workspace, 'src/generated'), { recursive: true });
    await writeFile(path.join(workspace, 'src/generated/game-config.json'), `${JSON.stringify({ title: blueprint.title, theme: blueprint.theme, content: blueprint.content, balance: blueprint.balance, palette: styleLock.direction.palette, uiStyle: styleLock.direction.uiStyle, assets: { customer: './assets/customer.svg', product: './assets/product.svg', background: './assets/background.svg', upgrade: './assets/upgrade.svg' }, ...(blueprint.spatialShop ? { spatialShop: blueprint.spatialShop } : {}) }, null, 2)}\n`);
  }
  async importAssets(workspace: string, manifest: AssetManifest, sourceDir: string) {
    const publicAssets = path.join(workspace, 'public/assets'); await mkdir(publicAssets, { recursive: true });
    for (const asset of manifest.assets) await writeFile(path.join(publicAssets, path.basename(asset.path)), await readFile(path.join(sourceDir, path.basename(asset.path))));
    const configFile = path.join(workspace, 'src/generated/game-config.json');
    const config = JSON.parse(await readFile(configFile, 'utf8')) as Record<string, unknown>;
    config.assets = Object.fromEntries(manifest.assets.map((asset) => [asset.id, `./assets/${path.basename(asset.path)}`]));
    await writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`);
  }
  async verifyProject(workspace: string, options: { requireScripts: boolean }) {
    const sourceRoot = path.join(workspace, 'src');
    const sourceFiles = (await listFiles(sourceRoot)).filter((file) => file.endsWith('.ts'));
    const sources = await Promise.all(sourceFiles.map((file) => readFile(path.join(sourceRoot, file), 'utf8')));
    const source = sources.join('\n');
    const cutStackDodge = source.includes("MOTHER_TEMPLATE_ID = 'cut-stack-dodge-v1'");
    const testApi = cutStackDodge
      ? ['resetGame', 'getState', 'setRandomSeed', 'advanceTicks', 'tap', 'replay', 'getEvents']
      : ['resetGame', 'getState', 'spawnCustomer', 'completeOrder', 'grantCurrency', 'upgradeStation', 'setRandomSeed'];
    const missingApi = testApi.filter((name) => !source.includes(name));
    if (missingApi.length > 0) throw new Error(`Builder test API is missing: ${missingApi.join(', ')}`);
    if (cutStackDodge && !/window\.__REFERENCE_LEVEL_TEST__\s*=\s*\{\s*getSnapshot\s*,\s*getNaturalInputTarget\s*\}/su.test(source)) {
      throw new Error('Cut-stack-dodge Builder must expose the read-only reference-level probe with exactly two methods');
    }
    if (!source.includes('localStorage') || !/(?:CURRENT_SAVE_VERSION\s*=\s*\d+|version\s*:\s*\d+|save-v\d+)/.test(source)) throw new Error('Builder must implement a versioned local save');
    const checks = cutStackDodge
      ? ['contract:cut-stack-dodge-v1', 'contract:test-api-read-observe', 'save:versioned']
      : ['contract:test-api-7', 'save:versioned'];
    if (!options.requireScripts) return checks;

    const packageJson = JSON.parse(await readFile(path.join(workspace, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    const missingScripts = ['test', 'typecheck'].filter((name) => !packageJson.scripts?.[name]);
    if (missingScripts.length > 0) throw new Error(`Builder verification requires package scripts: test, typecheck; missing ${missingScripts.join(', ')}`);
    await command(this.factoryBin('vitest'), ['run'], workspace);
    checks.push('test:passed');
    await command(this.factoryBin('tsc'), ['--noEmit'], workspace);
    checks.push('typecheck:passed');
    return checks;
  }
  async verifyFormalProject(workspace: string) {
    const packageJson = JSON.parse(await readFile(path.join(workspace, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    const missingScripts = ['lint', 'typecheck', 'test', 'build'].filter((name) => !packageJson.scripts?.[name]);
    if (missingScripts.length > 0) throw new Error(`Formal prototype verification requires package scripts: lint, typecheck, test, build; missing ${missingScripts.join(', ')}`);
    const sourceRoot = path.join(workspace, 'src');
    const sourceFiles = (await listFiles(sourceRoot)).filter((file) => file.endsWith('.ts'));
    const source = (await Promise.all(sourceFiles.map((file) => readFile(path.join(sourceRoot, file), 'utf8')))).join('\n');
    const requiredMarkers = ['__FORMAL_TEST__', 'contractVersion', 'safe-tutorial', 'first-pursuit', 'route-alternation', 'gate-climax'];
    const missingMarkers = requiredMarkers.filter((marker) => !source.includes(marker));
    if (missingMarkers.length > 0) throw new Error(`Formal prototype test contract is missing: ${missingMarkers.join(', ')}`);
    await command(this.factoryBin('eslint'), ['.'], workspace);
    await command(this.factoryBin('tsc'), ['--noEmit'], workspace);
    await command(this.factoryBin('vitest'), ['run'], workspace);
    return ['lint:passed', 'typecheck:passed', 'test:passed', 'formal-test-contract:v1'];
  }
  async buildWeb(workspace: string) {
    await command(path.join(this.repositoryRoot, 'node_modules/.bin/vite'), ['build'], workspace);
    const output = path.join(workspace, 'dist');
    if (!await exists(path.join(output, 'index.html'))) throw new Error('Vite did not produce dist/index.html');
    await packageFinderPlayable(output);
    return output;
  }
  async buildTarget(workspace: string, target: string) { if (target !== 'web') throw new Error(`web-lite does not support target ${target}`); return this.buildWeb(workspace); }
  async startPreview(workspace: string) {
    const child = spawn(path.join(this.repositoryRoot, 'node_modules/.bin/vite'), ['preview', '--host', '127.0.0.1', '--port', '0'], { cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'] });
    const url = await new Promise<string>((resolve, reject) => { let output = ''; const onData = (data: Buffer) => { output += data.toString(); const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)\//); if (match) resolve(match[0]); }; child.stdout.on('data', onData); child.stderr.on('data', onData); child.on('exit', (code) => reject(new Error(`preview exited early (${code}): ${output}`))); setTimeout(() => reject(new Error('preview start timeout')), 15_000); });
    const stop = async () => { if (!child.killed) child.kill('SIGTERM'); }; this.preview = { stop }; return { url, stop };
  }
  async stopPreview() { await this.preview?.stop(); this.preview = undefined; }
}
