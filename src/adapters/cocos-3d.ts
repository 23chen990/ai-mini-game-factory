import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RuntimeAdapter } from './runtime.js';
import type { AssetManifest, GameBlueprint, StyleLock } from '../schemas/index.js';
import { Hybrid3dAssetResearchArtifactSchema, type Hybrid3dAssetResearchArtifact } from '../schemas/hybrid-3d-assets.js';
import { clearDir, copyTree, exists } from '../core/files.js';

export type RuntimeCommandResult = { code: number; output: string };
export type RuntimeCommandRunner = (bin: string, args: string[], cwd: string) => Promise<RuntimeCommandResult>;

const defaultCommandRunner: RuntimeCommandRunner = (bin, args, cwd) => new Promise((resolve, reject) => {
  const child = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (data) => output += data);
  child.stderr.on('data', (data) => output += data);
  child.on('error', reject);
  child.on('exit', (code) => resolve({ code: code ?? -1, output }));
});

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
};

export class Cocos3dRuntimeAdapter implements RuntimeAdapter {
  private previewServer?: Server;
  private readonly creatorExecutable: string;
  private readonly commandRunner: RuntimeCommandRunner;

  constructor(private readonly repositoryRoot: string, options: { creatorExecutable?: string; commandRunner?: RuntimeCommandRunner } = {}) {
    this.creatorExecutable = options.creatorExecutable ?? '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator';
    this.commandRunner = options.commandRunner ?? defaultCommandRunner;
  }

  async createProject(workspace: string, template: string) {
    if (template !== 'spatial-shop-3d-v1') throw new Error(`Unsupported cocos-3d template: ${template}`);
    await clearDir(workspace);
    await copyTree(path.join(this.repositoryRoot, 'templates/cocos/spatial-shop-3d-v1'), workspace);
    await rm(path.join(workspace, 'build'), { recursive: true, force: true });
    await rm(path.join(workspace, 'library'), { recursive: true, force: true });
    await rm(path.join(workspace, 'temp'), { recursive: true, force: true });
    await rm(path.join(workspace, 'node_modules'), { recursive: true, force: true });
    await symlink(path.join(this.repositoryRoot, 'node_modules'), path.join(workspace, 'node_modules'), 'dir');
  }

  async applyBlueprint(workspace: string, blueprint: GameBlueprint, styleLock: StyleLock) {
    if (blueprint.runtime !== 'cocos-3d' || blueprint.template !== 'spatial-shop-3d-v1' || !blueprint.spatialShop) {
      throw new Error('Cocos 3D spatial shop requires a cocos-3d spatial-shop-3d-v1 blueprint');
    }
    const output = path.join(workspace, 'assets/resources/generated');
    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, 'game-config.json'), `${JSON.stringify({
      schemaVersion: 1,
      runtime: blueprint.runtime,
      template: blueprint.template,
      title: blueprint.title,
      theme: blueprint.theme,
      content: blueprint.content,
      balance: blueprint.balance,
      preferences: blueprint.preferences,
      palette: styleLock.direction.palette,
      spatialShop: blueprint.spatialShop,
    }, null, 2)}\n`);
    await writeFile(path.join(output, 'style-lock.json'), `${JSON.stringify(styleLock, null, 2)}\n`);
  }

  async importAssets(workspace: string, manifest: AssetManifest, sourceDir: string) {
    const output = path.join(workspace, 'assets/resources/generated/cutouts');
    await mkdir(output, { recursive: true });
    const copied = new Set<string>();
    for (const asset of manifest.assets) {
      const basename = path.basename(asset.path);
      if (copied.has(basename)) continue;
      const source = path.join(sourceDir, basename);
      await writeFile(path.join(output, basename), await readFile(source));
      copied.add(basename);
    }
    await writeFile(path.join(workspace, 'assets/resources/generated/asset-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  }

  async importApproved3dAssets(workspace: string, inputResearch: Hybrid3dAssetResearchArtifact, sourceRoot: string) {
    const research = Hybrid3dAssetResearchArtifactSchema.parse(inputResearch);
    const selectedIds = new Set(research.selectedSourceIds);
    const outputRoot = path.join(workspace, 'assets/resources/third-party');
    await mkdir(outputRoot, { recursive: true });

    for (const source of research.sources) {
      if (!selectedIds.has(source.id)) continue;
      if (path.basename(source.id) !== source.id) throw new Error(`Invalid approved source id: ${source.id}`);
      const sourceDirectory = path.resolve(sourceRoot, source.id);
      if (sourceDirectory !== path.resolve(sourceRoot, source.id) || !sourceDirectory.startsWith(`${path.resolve(sourceRoot)}${path.sep}`)) {
        throw new Error(`Approved source escapes its curated root: ${source.id}`);
      }
      const output = path.join(outputRoot, source.id);
      await mkdir(output, { recursive: true });
      const selectedFiles = new Set([
        path.basename(source.embeddedLicensePath),
        ...source.selectedFilePatterns.map((selectedPath) => path.basename(selectedPath)),
      ]);
      for (const filename of selectedFiles) {
        await writeFile(path.join(output, filename), await readFile(path.join(sourceDirectory, filename)));
      }
    }

    await writeFile(path.join(outputRoot, 'approved-assets.json'), `${JSON.stringify({
      schemaVersion: 1,
      researchId: research.researchId,
      selectedSourceIds: research.selectedSourceIds,
      sourceResearchPath: 'artifacts/hybrid-3d-asset-research.json',
    }, null, 2)}\n`);
  }

  async verifyProject(workspace: string, options: { requireScripts: boolean }) {
    const required = [
      'package.json',
      'tsconfig.core.json',
      'assets/scenes/main.scene',
      'assets/scripts/GameBootstrap.ts',
      'assets/scripts/core/carry-sway.ts',
      'platforms/wechat-minigame/build-config.json',
      'platforms/douyin-minigame/build-config.json',
      'platforms/taptap-minigame/README.md',
    ];
    const missing = [];
    for (const relative of required) if (!await exists(path.join(workspace, relative))) missing.push(relative);
    if (missing.length > 0) throw new Error(`Cocos project is missing: ${missing.join(', ')}`);

    const bootstrap = await readFile(path.join(workspace, 'assets/scripts/GameBootstrap.ts'), 'utf8');
    const checks = ['cocos-project:3.8', 'targets:wechat-douyin-taptap-isolated'];
    if (!options.requireScripts) return checks;
    const sessionPath = path.join(workspace, 'assets/scripts/core/game-session.ts');
    const sessionSource = await exists(sessionPath) ? await readFile(sessionPath, 'utf8') : '';
    const contractSource = `${bootstrap}\n${sessionSource}`;
    const requiredMarkers = ['__GAME_TEST__', 'localStorage', 'CarryStackSway'];
    const missingMarkers = requiredMarkers.filter((marker) => !contractSource.includes(marker));
    if (!/save-v\d+/i.test(contractSource)) missingMarkers.push('save-vN');
    if (missingMarkers.length > 0) throw new Error(`Cocos Builder contract is missing: ${missingMarkers.join(', ')}`);

    const packageJson = JSON.parse(await readFile(path.join(workspace, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    for (const script of ['test', 'typecheck']) if (!packageJson.scripts?.[script]) throw new Error(`Cocos project is missing package script: ${script}`);
    // Generated workspaces symlink the factory's node_modules; invoking pnpm
    // there would let verify-deps-before-run prune the factory's dependencies.
    // Call the factory's pinned binaries directly instead.
    await this.runChecked(path.join(this.repositoryRoot, 'node_modules/.bin/vitest'), ['run', 'tests'], workspace, [0]);
    checks.push('test:passed');
    await this.runChecked(path.join(this.repositoryRoot, 'node_modules/.bin/tsc'), ['--noEmit', '-p', 'tsconfig.core.json'], workspace, [0]);
    checks.push('typecheck:passed');
    return checks;
  }

  async buildWeb(workspace: string) {
    return this.buildCocosTarget(workspace, 'web-mobile', 'web-mobile');
  }

  async buildTarget(workspace: string, target: string) {
    if (target === 'web') return this.buildWeb(workspace);
    if (target === 'wechat-minigame') return this.buildCocosTarget(workspace, 'wechatgame', 'wechat-minigame');
    if (target === 'douyin-minigame') return this.buildCocosTarget(workspace, 'bytedance-mini-game', 'douyin-minigame');
    if (target === 'taptap-minigame') throw new Error('The official TapTap Cocos 3.8.x plugin must be installed and verified before creating a TapTap package');
    throw new Error(`cocos-3d does not support target ${target}`);
  }

  async startPreview(workspace: string) {
    const output = await this.buildWeb(workspace);
    const server = createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
        const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
        const candidate = path.resolve(output, relative);
        if (candidate !== output && !candidate.startsWith(`${output}${path.sep}`)) throw new Error('invalid path');
        const info = await stat(candidate);
        const file = info.isDirectory() ? path.join(candidate, 'index.html') : candidate;
        response.statusCode = 200;
        response.setHeader('Content-Type', MIME_TYPES[path.extname(file)] ?? 'application/octet-stream');
        response.end(await readFile(file));
      } catch {
        response.statusCode = 404;
        response.end('Not found');
      }
    });
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    this.previewServer = server;
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Cocos preview server did not expose a TCP port');
    const stop = async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); };
    return { url: `http://127.0.0.1:${address.port}/`, stop };
  }

  async stopPreview() {
    if (!this.previewServer) return;
    const server = this.previewServer;
    this.previewServer = undefined;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  private async buildCocosTarget(workspace: string, platform: string, outputName: string) {
    const buildOptions = `platform=${platform};debug=true;buildPath=project://build;outputName=${outputName};replaceSplashScreen=false`;
    await this.runChecked(this.creatorExecutable, ['--project', workspace, '--build', buildOptions], workspace, [0, 36]);
    const output = path.join(workspace, 'build', outputName);
    if (!await exists(output)) throw new Error(`Cocos did not produce ${path.relative(workspace, output)}`);
    if (platform === 'web-mobile' && !await exists(path.join(output, 'index.html'))) throw new Error('Cocos web-mobile build did not produce index.html');
    return output;
  }

  private async runChecked(bin: string, args: string[], cwd: string, successCodes: number[]) {
    const result = await this.commandRunner(bin, args, cwd);
    if (!successCodes.includes(result.code)) throw new Error(`${path.basename(bin)} failed (${result.code}): ${result.output}`);
  }
}
