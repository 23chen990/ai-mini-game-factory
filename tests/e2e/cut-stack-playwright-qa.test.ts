import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WebLiteRuntimeAdapter } from '../../src/adapters/web-lite.js';
import { sha256File } from '../../src/core/files.js';
import { lockProductionLine } from '../../src/core/production-lines.js';
import { runCutStackDodgePlaywrightQa } from '../../src/qa/cut-stack-playwright-qa.js';
import { runPlaywrightQa } from '../../src/qa/playwright-qa.js';
import type { GameBlueprint, StyleLock } from '../../src/schemas/index.js';

const roots: string[] = [];
const diagnosticRoot = '/tmp/r1-next-02-cut-stack-evidence';
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function preserveCutStackDiagnostics(runRoot: string, report: unknown): Promise<void> {
  await mkdir(diagnosticRoot, { recursive: true });
  await writeFile(path.join(diagnosticRoot, 'qa-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await cp(path.join(runRoot, 'screenshots'), path.join(diagnosticRoot, 'screenshots'), { recursive: true, force: true }).catch(() => undefined);
  await cp(path.join(runRoot, 'logs'), path.join(diagnosticRoot, 'logs'), { recursive: true, force: true }).catch(() => undefined);
  const reportValue = report as { visualStatus?: string; checks?: Array<{ name?: string; passed?: boolean; evidence?: string }>; issues?: Array<{ id?: string; message?: string; evidence?: string }>; screenshots?: string[] };
  const sourceFiles = ['src/qa/cut-stack-playwright-qa.ts', 'tests/e2e/cut-stack-playwright-qa.test.ts'];
  const sourceIdentity = await Promise.all(sourceFiles.map(async (relativePath) => ({ path: relativePath, sha256: await sha256File(path.resolve(process.cwd(), relativePath)) })));
  const distRoot = path.join(runRoot, 'workspace/game/dist');
  const buildFiles = await readdir(distRoot, { withFileTypes: true }).catch(() => []);
  const buildIdentity = await Promise.all(buildFiles.filter((entry) => entry.isFile()).map(async (entry) => ({ path: path.join('workspace/game/dist', entry.name), sha256: await sha256File(path.join(distRoot, entry.name)) })));
  const manifest = {
    schemaVersion: 1,
    sourceRunRoot: runRoot,
    sourceWorkspace: path.join(runRoot, 'workspace/game'),
    capturedBy: 'tests/e2e/cut-stack-playwright-qa.test.ts',
    testName: 'cut-stack-dodge natural runtime QA / palette identity diagnostic',
    viewport: { width: 390, height: 844 },
    sourceIdentity,
    buildIdentity,
    visualStatus: reportValue.visualStatus ?? 'MISSING',
    checks: reportValue.checks ?? [],
    issues: reportValue.issues ?? [],
    screenshots: reportValue.screenshots ?? [],
    originalFailure: { status: 'not-reproduced-in-this-diagnostic-run', interpretation: 'preserved historical failure evidence is required for any original failure claim' },
    missingEvidence: ['git commit identity is intentionally omitted; source and build SHA-256 identify the tested files/artifact instead'],
  };
  await writeFile(path.join(diagnosticRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

const blueprint: GameBlueprint = {
  schemaVersion: 1,
  gameId: 'cut-stack-runtime-test',
  title: '符刃训练',
  theme: '原创夜色训练场',
  runtime: 'web-lite',
  template: 'cut-stack-dodge-v1',
  designMode: 'prototype_tournament',
  targetPlatforms: ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'],
  concept: 'single-finger cut course',
  coreLoop: ['tap', 'flip', 'cut or avoid', 'settle and replay'],
  content: { productName: '符印', customerName: '训练目标', currencyName: '切割数' },
  balance: { startingCurrency: 0, orderReward: 1, baseUpgradeCost: 2 },
  preferences: {},
};

const direction = {
  id: 'direction_a' as const,
  name: 'Night course',
  summary: 'original geometric course',
  visualKeywords: ['night', 'geometric'],
  palette: ['#101827', '#68D8FF', '#73F4C4'],
  characterStyle: 'geometric blade',
  environmentStyle: 'training course',
  uiStyle: 'compact',
  iconConcept: 'rune',
  forbiddenElements: ['third-party marks'],
  productionComplexity: 'low' as const,
  previewPrompt: 'original geometric night course',
};
const styleLock: StyleLock = { schemaVersion: 1, directionId: 'direction_a', direction, kept: [], changes: [], notes: [], lockedAt: new Date().toISOString() };

describe('cut-stack-dodge natural runtime QA', () => {
  it('proves cut, drop, attributable hazard failure, natural retry, finish, and replay on the packaged mother template', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'cut-stack-qa-'));
    roots.push(runRoot);
    const workspace = path.join(runRoot, 'workspace/game');
    const adapter = new WebLiteRuntimeAdapter(process.cwd());
    await mkdir(path.join(runRoot, 'artifacts'), { recursive: true });
    await adapter.createProject(workspace, 'cut-stack-dodge-v1');
    await adapter.applyBlueprint(workspace, blueprint, styleLock);
    await adapter.buildWeb(workspace);
    await writeFile(path.join(runRoot, 'artifacts/production-line-contract.json'), `${JSON.stringify(lockProductionLine('cut-stack-dodge'), null, 2)}\n`);

    const report = await runPlaywrightQa(adapter, workspace, runRoot);

    expect(report.passed, JSON.stringify({ checks: report.checks, issues: report.issues, naturalFlow: report.naturalFlow }, null, 2)).toBe(true);
    expect(report.visualStatus).toBe('CONFORMING');
    expect(report.naturalFlow).toMatchObject({ line: 'cut-stack-dodge', completion: 'terminal', replayObserved: true, forbiddenOperations: [], passed: true });
    expect(report.naturalFlow?.transitions.map(({ name }) => name)).toEqual(expect.arrayContaining(['cut', 'drop', 'obstacle-failure', 'retry', 'finish']));
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'cut-stack-natural-failure', passed: true }),
      expect.objectContaining({ name: 'cut-stack-player-facing-failure-cause', passed: true }),
      expect.objectContaining({ name: 'cut-stack-natural-finish', passed: true }),
      expect.objectContaining({ name: 'cut-stack-replay-clears-terminal-feedback', passed: true }),
      expect.objectContaining({ name: 'packaged-webkit-load', passed: true }),
    ]));
  }, 60_000);

  it('keeps the rendered falling bounds aligned at the wider phone viewport', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'cut-stack-viewport-qa-'));
    roots.push(runRoot);
    const workspace = path.join(runRoot, 'workspace/game');
    const adapter = new WebLiteRuntimeAdapter(process.cwd());
    await mkdir(path.join(runRoot, 'artifacts'), { recursive: true });
    await adapter.createProject(workspace, 'cut-stack-dodge-v1');
    await adapter.applyBlueprint(workspace, blueprint, styleLock);
    await adapter.buildWeb(workspace);
    await writeFile(path.join(runRoot, 'artifacts/production-line-contract.json'), `${JSON.stringify(lockProductionLine('cut-stack-dodge'), null, 2)}\n`);

    const report = await runCutStackDodgePlaywrightQa(adapter, workspace, runRoot, { width: 430, height: 932 });

    expect(report.passed, JSON.stringify({ checks: report.checks, issues: report.issues }, null, 2)).toBe(true);
    expect(report.visualStatus).toBe('CONFORMING');
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'cut-stack-rendered-falling-bounds', passed: true }),
    ]));
  }, 60_000);

  it('does not use the mother palette as the rendered geometry identity', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'cut-stack-palette-qa-'));
    roots.push(runRoot);
    const workspace = path.join(runRoot, 'workspace/game');
    const adapter = new WebLiteRuntimeAdapter(process.cwd());
    const alternateStyleLock = { ...styleLock, direction: { ...styleLock.direction, palette: ['#fefefe', '#ff00aa', '#00aa44'] } };
    await mkdir(path.join(runRoot, 'artifacts'), { recursive: true });
    await adapter.createProject(workspace, 'cut-stack-dodge-v1');
    await adapter.applyBlueprint(workspace, blueprint, alternateStyleLock);
    await adapter.buildWeb(workspace);
    await writeFile(path.join(runRoot, 'artifacts/production-line-contract.json'), `${JSON.stringify(lockProductionLine('cut-stack-dodge'), null, 2)}\n`);

    const report = await runCutStackDodgePlaywrightQa(adapter, workspace, runRoot);
    await preserveCutStackDiagnostics(runRoot, report);
    const manifest = JSON.parse(await readFile(path.join(diagnosticRoot, 'manifest.json'), 'utf8')) as { sourceCommit?: unknown; sourceIdentity?: unknown[]; buildIdentity?: unknown[]; visualStatus?: string; viewport?: { width?: number; height?: number } };
    expect(manifest.sourceCommit).toBeUndefined();
    expect(manifest.sourceIdentity?.length).toBe(2);
    expect(manifest.buildIdentity?.length).toBeGreaterThan(0);
    expect(manifest.viewport).toEqual({ width: 390, height: 844 });
    expect(manifest.visualStatus).toBe('CONFORMING');

    expect(report.passed, JSON.stringify({ checks: report.checks, issues: report.issues }, null, 2)).toBe(true);
    expect(report.visualStatus).toBe('CONFORMING');
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'cut-stack-rendered-falling-bounds', passed: true }),
    ]));
  }, 60_000);

});
