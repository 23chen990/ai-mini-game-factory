import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodexImagegenPendingError, CodexImagegenProvider, probeCodexImagegen } from '../../src/providers/codex-imagegen.js';
import type { ArtDirections, GameBlueprint, StyleLock } from '../../src/schemas/index.js';

const direction = { id: 'direction_a' as const, name: 'Ink', summary: 'ink direction', visualKeywords: ['ink'], palette: ['#112233'], characterStyle: 'ink figures', environmentStyle: 'ink market', uiStyle: 'paper cards', iconConcept: 'seal', forbiddenElements: ['logos'], productionComplexity: 'low' as const, previewPrompt: 'original ink market' };
const directions: ArtDirections = { directions: [direction, { ...direction, id: 'direction_b', name: 'Clay', summary: 'clay direction', previewPrompt: 'original clay market' }, { ...direction, id: 'direction_c', name: 'Neon', summary: 'neon direction', previewPrompt: 'original neon market' }, { ...direction, id: 'direction_d', name: 'Wood', summary: 'wood direction', previewPrompt: 'original wood market' }] };
const blueprint: GameBlueprint = { schemaVersion: 1, gameId: 'test', title: 'Test', theme: 'spirits', runtime: 'web-lite', template: 'idle-shop-v1', designMode: 'prototype_tournament', targetPlatforms: ['wechat-minigame', 'douyin-minigame', 'taptap-minigame'], concept: 'test', coreLoop: ['a', 'b', 'c', 'd'], content: { productName: 'tea', customerName: 'spirit', currencyName: 'coin' }, balance: { startingCurrency: 0, orderReward: 1, baseUpgradeCost: 2 }, preferences: {} };
const styleLock: StyleLock = { schemaVersion: 1, directionId: 'direction_a', direction, kept: [], changes: [], notes: [], lockedAt: new Date().toISOString() };
const cutBlueprint: GameBlueprint = { ...blueprint, gameId: 'blade', title: 'Blade', theme: 'one-touch blade course', template: 'cut-stack-dodge-v1', designMode: 'reference_reskin', referenceMechanics: {
  schemaVersion: 1, lockedBy: 'human', source: { name: 'recording', url: 'https://example.com/reference', researchFiles: [] },
  coreLoop: ['ready', 'tap', 'contact', 'terminal'], playerActions: ['tap'], progressionSystems: ['course'], unlockRules: ['ordered checkpoints'],
  feedbackCadence: { immediateSeconds: 0.1, microGoalMinSeconds: 1, microGoalMaxSeconds: 12 }, mustPreserveMechanics: ['tap-to-flip'], adaptableMechanics: ['original expression'],
  fidelityPolicy: { level: 'maximum_core_mechanics', preserveInputStateTransitions: true, preserveCoreLoopOrder: true, preserveProgressionTopology: true, preserveUnlockDependencies: true, preserveFailureAndRecoveryRules: true, preserveFeedbackTimingBands: true },
  expressionIsolation: { originalCode: true, originalAssets: true, originalNamesAndText: true, originalUiLayout: true, originalAudio: true, originalTuningValues: true },
} };
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

describe('Codex imagegen bridge', () => {
  it('reports manual mode when codex exec has no image output contract', () => {
    expect(probeCodexImagegen('Options:\n  -i, --image <FILE> input only')).toEqual(expect.objectContaining({ available: true, automatic: false, mode: 'manual-conversation' }));
  });

  it('writes four $imagegen tasks and pauses instead of creating placeholders', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'codex-imagegen-'));
    const outputDir = path.join(runRoot, 'art-review/previews');
    const provider = new CodexImagegenProvider();

    const error = await provider.producePreviews({ outputDir, directions }).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(CodexImagegenPendingError);
    const task = await readFile(path.join(runRoot, 'art-review/art-imagegen-task.md'), 'utf8');
    expect(task.match(/\$imagegen/g)).toHaveLength(4);
    for (const item of directions.directions) {
      expect(task).toContain(item.id);
      expect(task).toContain(`${item.id}.png`);
      expect(task).toContain(item.previewPrompt);
    }
    expect(task).toContain('可以粘贴到当前 Codex 对话');
    await expect(readFile(path.join(outputDir, 'direction_a.svg'))).rejects.toThrow();
    expect((error as CodexImagegenPendingError).command).toContain('art-imagegen-task.md');
  });

  it('continues only after all four real PNG files pass validation', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'codex-imagegen-'));
    const outputDir = path.join(runRoot, 'art-review/previews');
    const provider = new CodexImagegenProvider();
    await expect(provider.producePreviews({ outputDir, directions })).rejects.toBeInstanceOf(CodexImagegenPendingError);
    await Promise.all(directions.directions.map((item) => writeFile(path.join(outputDir, `${item.id}.png`), png)));

    const manifest = await provider.producePreviews({ outputDir, directions });

    expect(manifest.previews).toHaveLength(4);
    expect(manifest.previews.every((item) => item.status === 'generated')).toBe(true);
    expect(manifest.previews.map((item) => item.outputPath)).toEqual(['previews/direction_a.png', 'previews/direction_b.png', 'previews/direction_c.png', 'previews/direction_d.png']);
  });

  it('uses the same manual gate for formal assets', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'codex-assets-'));
    const outputDir = path.join(runRoot, 'workspace/generated-assets');
    const provider = new CodexImagegenProvider();

    await expect(provider.produce({ outputDir, blueprint, styleLock })).rejects.toBeInstanceOf(CodexImagegenPendingError);

    const task = await readFile(path.join(runRoot, 'art-review/asset-imagegen-task.md'), 'utf8');
    expect(task).toContain('$imagegen');
    expect(task).toContain('customer.png');
    expect(task).toContain('background.png');
  });

  it('derives action-game asset slots from the locked template instead of the idle-shop vocabulary', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'codex-cut-assets-'));
    const outputDir = path.join(runRoot, 'workspace/generated-assets');
    const provider = new CodexImagegenProvider();

    const error = await provider.produce({ outputDir, blueprint: cutBlueprint, styleLock }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(CodexImagegenPendingError);

    const task = await readFile(path.join(runRoot, 'art-review/asset-imagegen-task.md'), 'utf8');
    for (const id of ['blade', 'cuttable', 'support', 'hazard', 'finish', 'background']) expect(task).toContain(`${id}.png`);
    for (const stale of ['customer.png', 'product.png', 'upgrade.png', 'promo.png']) expect(task).not.toContain(stale);
  });

  it('anchors reference-reskin prompts to the blueprint mechanics without injecting a shared aesthetic', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'codex-cut-presentation-'));
    const outputDir = path.join(runRoot, 'workspace/generated-assets');
    const provider = new CodexImagegenProvider();

    await expect(provider.produce({ outputDir, blueprint: cutBlueprint, styleLock })).rejects.toBeInstanceOf(CodexImagegenPendingError);

    const task = await readFile(path.join(runRoot, 'art-review/asset-imagegen-task.md'), 'utf8');
    expect(task).toContain('参考机制边界');
    expect(task).toContain('ready → tap → contact → terminal');
    expect(task).toContain('所有表达、资产、名称、UI、文字和数值必须原创');
    expect(task).not.toContain('明亮粉彩');
    expect(task).not.toContain('不要深色哥特');
    expect(task).not.toContain('不要卷轴');
  });

  it('does not force a shop composition into art-direction previews', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'codex-preview-direction-'));
    const outputDir = path.join(runRoot, 'art-review/previews');
    const provider = new CodexImagegenProvider();
    const nonShopDirections: ArtDirections = {
      directions: directions.directions.map((item, index) => ({
        ...item,
        environmentStyle: index === 0 ? 'crystal caverns' : item.environmentStyle,
        previewPrompt: index === 0 ? 'original crystal cavern traversal key art' : item.previewPrompt,
      })),
    };

    await expect(provider.producePreviews({ outputDir, directions: nonShopDirections })).rejects.toBeInstanceOf(CodexImagegenPendingError);

    const task = await readFile(path.join(runRoot, 'art-review/art-imagegen-task.md'), 'utf8');
    expect(task).toContain('crystal caverns');
    expect(task).not.toMatch(/摊位|商店/);
    expect(task).toContain('不是正式游戏素材');
  });

  it('keeps reference-reskin asset prompts bound to each style lock without a shared aesthetic', async () => {
    const firstRun = await mkdtemp(path.join(tmpdir(), 'codex-style-lock-a-'));
    const secondRun = await mkdtemp(path.join(tmpdir(), 'codex-style-lock-b-'));
    const provider = new CodexImagegenProvider();
    const firstStyleDirection = {
      ...direction,
      summary: 'charcoal silhouettes',
      visualKeywords: ['charcoal', 'high-contrast'],
      palette: ['#111111', '#EEE8D5'],
      characterStyle: 'perspective camera with angular paper silhouettes',
      environmentStyle: 'brushed paper canyon planes',
      uiStyle: 'monochrome route markers',
      previewPrompt: 'original charcoal canyon key art',
    };
    const secondStyleDirection = {
      ...direction,
      summary: 'sunlit textile collage',
      visualKeywords: ['woven', 'sunlit'],
      palette: ['#F2C14E', '#2E86AB'],
      characterStyle: 'orthographic camera with soft woven figures',
      environmentStyle: 'woven matte coastal terraces',
      uiStyle: 'stitched progress tabs',
      previewPrompt: 'original woven coastal key art',
    };
    const firstStyleLock: StyleLock = { schemaVersion: 1, directionId: 'direction_a', direction: firstStyleDirection, kept: ['perspective camera', 'brushed paper material'], changes: [], notes: [], lockedAt: new Date().toISOString() };
    const secondStyleLock: StyleLock = { schemaVersion: 1, directionId: 'direction_a', direction: secondStyleDirection, kept: ['orthographic camera', 'woven matte material'], changes: [], notes: [], lockedAt: new Date().toISOString() };
    const firstBlueprint = { ...cutBlueprint, gameId: 'charcoal-run', title: 'Charcoal Run', theme: 'layered canyon' };
    const secondBlueprint = { ...cutBlueprint, gameId: 'coastal-run', title: 'Coastal Run', theme: 'woven coast' };

    await expect(provider.produce({ outputDir: path.join(firstRun, 'workspace/generated-assets'), blueprint: firstBlueprint, styleLock: firstStyleLock })).rejects.toBeInstanceOf(CodexImagegenPendingError);
    await expect(provider.produce({ outputDir: path.join(secondRun, 'workspace/generated-assets'), blueprint: secondBlueprint, styleLock: secondStyleLock })).rejects.toBeInstanceOf(CodexImagegenPendingError);

    const firstTask = await readFile(path.join(firstRun, 'art-review/asset-imagegen-task.md'), 'utf8');
    const secondTask = await readFile(path.join(secondRun, 'art-review/asset-imagegen-task.md'), 'utf8');
    expect(firstTask).toContain('charcoal silhouettes');
    expect(firstTask).toContain('#111111');
    expect(firstTask).toContain('perspective camera with angular paper silhouettes');
    expect(firstTask).toContain('brushed paper canyon planes');
    expect(firstTask).toContain('monochrome route markers');
    expect(firstTask).toContain('perspective camera');
    expect(firstTask).toContain('brushed paper material');
    expect(firstTask).not.toContain('orthographic camera');
    expect(firstTask).not.toContain('侧视');
    expect(firstTask).not.toContain('首关');
    expect(firstTask).not.toContain('明亮粉彩');
    expect(firstTask).not.toContain('不要深色哥特');
    expect(firstTask).not.toContain('符刃');
    expect(firstTask).not.toContain('雾夜');
    expect(secondTask).toContain('sunlit textile collage');
    expect(secondTask).toContain('#F2C14E');
    expect(secondTask).toContain('orthographic camera with soft woven figures');
    expect(secondTask).toContain('woven matte coastal terraces');
    expect(secondTask).toContain('stitched progress tabs');
    expect(secondTask).toContain('orthographic camera');
    expect(secondTask).toContain('woven matte material');
    expect(secondTask).not.toContain('perspective camera');
    expect(secondTask).not.toContain('侧视');
    expect(secondTask).not.toContain('首关');
    expect(secondTask).not.toContain('明亮粉彩');
    expect(secondTask).not.toContain('不要深色哥特');
    expect(secondTask).not.toContain('符刃');
    expect(secondTask).not.toContain('雾夜');
  });

  it('states genuine alpha requirements for cutouts while keeping backgrounds non-transparent by default', async () => {
    const runRoot = await mkdtemp(path.join(tmpdir(), 'codex-alpha-instructions-'));
    const outputDir = path.join(runRoot, 'workspace/generated-assets');
    const provider = new CodexImagegenProvider();

    await expect(provider.produce({ outputDir, blueprint: cutBlueprint, styleLock })).rejects.toBeInstanceOf(CodexImagegenPendingError);

    const task = await readFile(path.join(runRoot, 'art-review/asset-imagegen-task.md'), 'utf8');
    const backgroundSection = task.slice(task.indexOf('## background.png'));
    expect(task).toContain('真正带 alpha 通道的 PNG');
    expect(task).toContain('禁止棋盘格预览');
    expect(backgroundSection).toContain('不要强制透明');
    expect(backgroundSection).not.toContain('真正带 alpha 通道');
  });
});
