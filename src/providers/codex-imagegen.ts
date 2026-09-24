import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, sha256File } from '../core/files.js';
import { deriveAssetDefinitions } from '../core/asset-definitions.js';
import { ArtPreviewManifestSchema, AssetManifestSchema, type ArtDirections, type GameBlueprint, type StyleLock } from '../schemas/index.js';
import type { ImageProvider } from './interfaces.js';

export type CodexImagegenCapability = {
  available: boolean;
  automatic: boolean;
  mode: 'automatic' | 'manual-conversation' | 'unavailable';
  reason: string;
};

/** Codex CLI currently accepts input images, but has no documented non-interactive image output contract. */
export function probeCodexImagegen(execHelp: string): CodexImagegenCapability {
  if (!execHelp.trim()) return { available: false, automatic: false, mode: 'unavailable', reason: 'codex exec is unavailable' };
  return {
    available: true,
    automatic: false,
    mode: 'manual-conversation',
    reason: 'Use the logged-in Codex conversation $imagegen capability and verify the resulting files before resuming.',
  };
}

export class CodexImagegenPendingError extends Error {
  constructor(
    message: string,
    public readonly taskPath: string,
    public readonly missingFiles: string[],
    public readonly command: string,
  ) {
    super(message);
    this.name = 'CodexImagegenPendingError';
  }
}

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function isValidPng(file: string) {
  try {
    if ((await stat(file)).size <= pngSignature.length) return false;
    const bytes = (await readFile(file)).subarray(0, pngSignature.length);
    return bytes.equals(pngSignature);
  } catch {
    return false;
  }
}

function runRootFromOutput(outputDir: string) {
  const parent = path.dirname(outputDir);
  if (path.basename(parent) === 'art-review' || path.basename(parent) === 'workspace') return path.dirname(parent);
  return parent;
}

async function requireGeneratedPngs(input: { outputDir: string; filenames: string[]; taskPath: string }) {
  const missing: string[] = [];
  for (const filename of input.filenames) {
    const file = path.join(input.outputDir, filename);
    if (!await isValidPng(file)) missing.push(file);
  }
  if (missing.length) {
    throw new CodexImagegenPendingError(
      `Codex image generation is waiting for ${missing.length} valid PNG file(s).`,
      input.taskPath,
      missing,
      `请在当前 Codex 对话中执行 ${path.basename(input.taskPath)}，保存全部图片后运行 factory resume。`,
    );
  }
}

function previewTask(directions: ArtDirections, outputDir: string) {
  const blocks = directions.directions.map((item, index) => `## ${index + 1}. ${item.name} (${item.id})

$imagegen

- 用途：小游戏工厂人工美术审批用方向预览，不是正式游戏素材
- 构图：16:10 横向关键视觉，按该方向的生成提示呈现核心主体、环境语言和 UI/交互语言；不要凭空添加方向字段未定义的环境、角色或经营元素
- 风格：${item.summary}；${item.characterStyle}；${item.environmentStyle}；${item.uiStyle}
- 色彩：${item.palette.join(', ')}
- 禁止项：${item.forbiddenElements.join('；') || '第三方角色、品牌和水印'}
- 生成提示：${item.previewPrompt}
- 输出文件名：${item.id}.png
- 输出目录：${outputDir}
`).join('\n');
  return `# Codex imagegen：四个美术方向预览

下面四段任务可以粘贴到当前 Codex 对话逐段执行。每段都已经包含图片生成技能指令，并将最终 PNG 保存到指定的绝对路径。不要创建 SVG、色块或其他占位图。

${blocks}
完成后确认四个 PNG 均存在，再运行 \`pnpm factory resume <run-id>\`。
`;
}

function assetTask(blueprint: GameBlueprint, styleLock: StyleLock, outputDir: string) {
  const assetDefinitions = deriveAssetDefinitions(blueprint);
  const referencePresentation = blueprint.designMode === 'reference_reskin' && blueprint.referenceMechanics
    ? `
- 参考机制边界：仅保留该游戏已锁定的核心流程和输入/状态关系（${blueprint.referenceMechanics.coreLoop.join(' → ')}）；所有表达、资产、名称、UI、文字和数值必须原创
` : '';
  const blocks = assetDefinitions.map(([id, kind, purpose]) => `## ${id}.png

$imagegen

- 用途：${purpose}
- 类型：${kind}
- 游戏：${blueprint.title}；${blueprint.theme}
- 生命周期与运行角色：该素材必须在默认核心流程中以可辨识的 ${id} 角色出现，并支持其 ready、接触、解决或终点状态（按角色适用）
- 锁定风格：${styleLock.direction.summary}；${styleLock.direction.visualKeywords.join(', ')}
- 锁定角色与镜头：${styleLock.direction.characterStyle}
- 锁定环境与材质：${styleLock.direction.environmentStyle}
- 锁定 UI 语言：${styleLock.direction.uiStyle}
- 审批保留项：${styleLock.kept.join('；') || '无额外保留项'}
- 色彩：${styleLock.direction.palette.join(', ')}
- 修改意见：${[...styleLock.changes, ...styleLock.notes].join('；') || '无'}
- 禁止项：${styleLock.direction.forbiddenElements.join('；') || '第三方角色、品牌和水印'}
- ${kind === 'background'
    ? '背景处理：保留适合该方向的完整背景画布，不要强制透明，也不要加入棋盘格预览'
    : '透明度要求：输出真正带 alpha 通道的 PNG，必须包含可验证的透明像素；禁止棋盘格预览或将棋盘格烘焙到图像背景'}
${referencePresentation}
- 输出文件名：${id}.png
- 输出目录：${outputDir}
`).join('\n');
  return `# Codex imagegen：正式素材接力任务

请把每段任务粘贴到当前 Codex 对话，使用 \`$imagegen\` 生成原创 PNG，并保存到指定绝对路径。工厂只接受实际存在且通过 PNG 文件检查的结果。

${blocks}`;
}

export class CodexImagegenProvider implements ImageProvider {
  async producePreviews({ outputDir, directions }: { outputDir: string; directions: ArtDirections }) {
    await ensureDir(outputDir);
    const runRoot = runRootFromOutput(outputDir);
    const taskPath = path.join(runRoot, 'art-review/art-imagegen-task.md');
    await ensureDir(path.dirname(taskPath));
    await writeFile(taskPath, previewTask(directions, outputDir));
    const filenames = directions.directions.map((item) => `${item.id}.png`);
    await requireGeneratedPngs({ outputDir, filenames, taskPath });
    const now = new Date().toISOString();
    return ArtPreviewManifestSchema.parse({
      schemaVersion: 1,
      provider: 'codex-imagegen',
      callCount: 0,
      previews: directions.directions.map((item) => ({
        directionId: item.id,
        provider: 'codex-imagegen',
        model: 'built-in-imagegen',
        prompt: item.previewPrompt,
        size: 'conversation-generated',
        quality: 'preview',
        outputPath: `previews/${item.id}.png`,
        startedAt: now,
        finishedAt: now,
        attempts: 1,
        status: 'generated',
        error: null,
      })),
    });
  }

  async produce({ outputDir, blueprint, styleLock }: { outputDir: string; blueprint: GameBlueprint; styleLock: StyleLock }) {
    await ensureDir(outputDir);
    const runRoot = runRootFromOutput(outputDir);
    const taskPath = path.join(runRoot, 'art-review/asset-imagegen-task.md');
    await ensureDir(path.dirname(taskPath));
    await writeFile(taskPath, assetTask(blueprint, styleLock, outputDir));
    const assetDefinitions = deriveAssetDefinitions(blueprint);
    const filenames = assetDefinitions.map(([id]) => `${id}.png`);
    await requireGeneratedPngs({ outputDir, filenames, taskPath });
    const assets = await Promise.all(assetDefinitions.map(async ([id, kind, purpose]) => {
      const file = path.join(outputDir, `${id}.png`);
      return { id, kind, path: `assets/${id}.png`, prompt: `${styleLock.direction.previewPrompt}; ${purpose}`, status: 'generated' as const, generationMethod: 'imagegen' as const, sourceEvidence: ['codex-imagegen:task'] as string[], sha256: await sha256File(file) };
    }));
    return AssetManifestSchema.parse({ schemaVersion: 1, assets, provider: 'codex-imagegen' });
  }
}
