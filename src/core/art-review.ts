import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ArtDirections, ArtPreviewManifest, GameBlueprint } from '../schemas/index.js';
import { ensureDir } from './files.js';

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export async function createArtReview(runRoot: string, blueprint: GameBlueprint, artifact: ArtDirections, manifest: ArtPreviewManifest) {
  await ensureDir(path.join(runRoot, 'art-review'));
  await ensureDir(path.join(runRoot, 'human'));
  const previewByDirection = new Map(manifest.previews.map((preview) => [preview.directionId, preview]));
  const cards = artifact.directions.map((direction) => {
    const preview = previewByDirection.get(direction.id);
    const visual = preview?.status === 'generated'
      ? `<img src="${escapeHtml(preview.outputPath)}" alt="${escapeHtml(direction.name)} preview">`
      : `<div class="preview-failed" role="status">预览生成失败：${escapeHtml(preview?.error ?? '未返回预览元数据')}</div>`;
    return `<article data-direction="${escapeHtml(direction.id)}" data-status="${preview?.status ?? 'missing'}">${visual}<h2>${escapeHtml(direction.name)}</h2><code>${escapeHtml(direction.id)}</code><p>${escapeHtml(direction.summary)}</p><p>${direction.visualKeywords.map(escapeHtml).join(' · ')}</p><dl><dt>角色风格</dt><dd>${escapeHtml(direction.characterStyle)}</dd><dt>环境风格</dt><dd>${escapeHtml(direction.environmentStyle)}</dd><dt>UI</dt><dd>${escapeHtml(direction.uiStyle)}</dd><dt>图标概念</dt><dd>${escapeHtml(direction.iconConcept)}</dd><dt>复杂度</dt><dd>${escapeHtml(direction.productionComplexity)}</dd><dt>禁止项</dt><dd>${direction.forbiddenElements.map(escapeHtml).join('、')}</dd></dl></article>`;
  }).join('');
  await writeFile(path.join(runRoot, 'art-review/index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(blueprint.title)} · 美术审批</title><style>body{font-family:system-ui;margin:0;background:#11101a;color:#fff;padding:32px}header{max-width:1100px;margin:auto}.grid{max-width:1100px;margin:24px auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}article{background:#201d2c;border:1px solid #ffffff20;border-radius:20px;padding:16px}img,.preview-failed{width:100%;aspect-ratio:8/5;border-radius:12px;object-fit:cover}.preview-failed{display:grid;place-items:center;background:#401f2a;color:#ffd6de;text-align:center}dt{color:#aaa;margin-top:8px}dd{margin:2px 0}code{color:#f6c768}</style><header><h1>${escapeHtml(blueprint.title)}：选择一个美术方向</h1><p>使用 <code>pnpm factory approve &lt;run-id&gt; --direction &lt;direction-id&gt; --notes "意见"</code> 保存审批，再运行 resume。这里只审批方向，不逐张审批素材。</p></header><main class="grid">${cards}</main></html>`);
  await writeFile(path.join(runRoot, 'art-review/art-directions.json'), `${JSON.stringify(artifact, null, 2)}\n`);
  await writeFile(path.join(runRoot, 'human/art-approval.example.yaml'), `selected_direction: direction_b\n\nkeep:\n  - character_style\n  - overall_palette\n  - ui_shape\n\nchange:\n  - reduce_saturation\n  - simplify_background\n\nnotes:\n  - 不要太像儿童游戏\n  - UI要简洁\n  - 图标要醒目\n`);
}
