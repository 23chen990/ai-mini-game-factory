/* global process, console */
/**
 * Isolated study helper. Does not execute a reference game, download URLs,
 * launch REA or grant a gameplay/build/release gate. Uses only Node built-ins.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SOURCE_COMMIT = '54adc1fb64155f9dd7c1c90ecae7b8185ac540b8';
export const TARGETS = Object.freeze({
  'qq-speed': 'https://lf3-static.bytednsdoc.com/obj/eden-cn/nulojnulwlo/qqfeiche3d/index.html',
  'cf-transport-ship': 'https://lf3-static.bytednsdoc.com/obj/eden-cn/nulojnulwlo/cf-transport-ship/transport-ship.html',
  'pelican-bike': 'https://lf3-static.bytednsdoc.com/obj/eden-cn/nulojnulwlo/pelican-bike/index.html',
});
const MB = 1024 * 1024;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const assertTarget = id => { if (!Object.hasOwn(TARGETS, id)) throw new Error('unknown-target:' + id); };
const checked = (value, label) => { if (!value) throw new Error('invalid:' + label); return value; };

// Short literal anchors: never store or distribute third-party source files.
export const SOURCE_RULES = Object.freeze([
  { id: 'RACE_01', game: 'qq-speed', file: 'qq-speed/src/vehicle.js', text: 'driftMinSpeed: 13,', meaning: '漂移须达到最低车速' },
  { id: 'RACE_02', game: 'qq-speed', file: 'qq-speed/src/vehicle.js', text: 'smallWindow: 0.5,', meaning: '出弯小喷输入窗口为0.5秒' },
  { id: 'RACE_03', game: 'qq-speed', file: 'qq-speed/src/vehicle.js', text: 'const perfect = elapsed < 0.2;', meaning: '小喷输入窗口前0.2秒是精准判定' },
  { id: 'RACE_04', game: 'qq-speed', file: 'qq-speed/src/vehicle.js', text: 'nitroTime: 2.8,', meaning: '氮气基础持续2.8秒' },
  { id: 'RACE_05', game: 'qq-speed', file: 'qq-speed/src/items.js', text: 'rank === 1 ? WEIGHTS.lead : rank >= total - 1 ? WEIGHTS.back : WEIGHTS.mid', meaning: '道具概率分为领先/中游/后排' },
  { id: 'RACE_06', game: 'qq-speed', file: 'qq-speed/src/main.js', text: 'r.lastD > 0.75 * L && d < 0.25 * L', meaning: '圈数使用起终点跨越校验' },
  { id: 'FPS_01', game: 'cf-transport-ship', file: 'cf-transport-ship/src/bots.js', text: 'easy: { react: [0.55, 0.9]', meaning: '简单Bot反应区间为0.55至0.90秒' },
  { id: 'FPS_02', game: 'cf-transport-ship', file: 'cf-transport-ship/src/bots.js', text: 'hell: { react: [0.12, 0.2]', meaning: '最高难度Bot反应区间为0.12至0.20秒' },
  { id: 'FPS_03', game: 'cf-transport-ship', file: 'cf-transport-ship/src/bots.js', text: 'if (ang > this.diff.fov / 2 && dist > 6) return false;', meaning: '感知采用视场角判断，6米内另处理' },
  { id: 'FPS_04', game: 'cf-transport-ship', file: 'cf-transport-ship/src/weapons.js', text: 'dmg: 36, headMul: 4.0, limbMul: 0.78, rpm: 600', meaning: 'AK基础伤害、部位倍率、射速有显式定义' },
  { id: 'FPS_05', game: 'cf-transport-ship', file: 'cf-transport-ship/src/game.js', text: 'v.respawnT = 4.0;', meaning: '死亡后复活延迟为4秒' },
  { id: 'BIKE_01', game: 'pelican-bike', file: 'pelican-bike/src/main.js', text: 'S.speed = clamp(S.speed + acc * dt, 0, 15.5);', meaning: '骑行速度限制至15.5米每秒' },
  { id: 'BIKE_02', game: 'pelican-bike', file: 'pelican-bike/src/main.js', text: 'settings.autopilot && S.time - S.lastSteer > 4', meaning: '4秒无主动转向后可执行自动追鱼' },
  { id: 'BIKE_03', game: 'pelican-bike', file: 'pelican-bike/src/main.js', text: 'f.golden = rnd() < 0.12;', meaning: '金鱼出生判定阈值12%' },
  { id: 'BIKE_04', game: 'pelican-bike', file: 'pelican-bike/src/main.js', text: 'S.nextFishAt = S.distance + 16 + rnd() * 18;', meaning: '下一条鱼与当前距离间隔16至34米' },
  { id: 'BIKE_05', game: 'pelican-bike', file: 'pelican-bike/src/main.js', text: 'S.fish += f.golden ? 5 : 1;', meaning: '金鱼加5，普通鱼加1' },
]);

export function extractInlineGameBundle(html) {
  if (typeof html !== 'string' || Buffer.byteLength(html) > 6 * MB) throw new Error('html-too-large-or-not-text');
  const scripts = Array.from(html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi))
    .filter(m => !/\bsrc\s*=/.test(m[1]))
    .map(m => m[2]);
  if (!scripts.length) throw new Error('no-inline-script');
  const script = scripts.reduce((a, b) => b.length > a.length ? b : a, '');
  if (Buffer.byteLength(script) < 1024 || Buffer.byteLength(script) > 5 * MB) throw new Error('bundle-not-found-or-too-large');
  return { script, scriptBlocks: scripts.length, selectedByteLength: Buffer.byteLength(script) };
}

export function locateAnchors(text, rules, filename) {
  const lines = text.split(/\r?\n/);
  return rules.map(rule => {
    const index = lines.findIndex(line => line.includes(rule.text));
    if (index < 0) throw new Error('SOURCE_ANCHOR_MISSING:' + rule.id + ':' + filename);
    return {
      id: rule.id, game: rule.game, file: filename, line: index + 1,
      lineSha256: digest(lines[index]), meaning: rule.meaning,
      sourceLink: 'https://github.com/riba2534/claude-opus-5-5-demo/blob/' +
        SOURCE_COMMIT + '/' + filename + '#L' + (index + 1),
    };
  });
}

export async function auditPinnedSource(root) {
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (revision !== SOURCE_COMMIT) throw new Error('SOURCE_REVISION_MISMATCH:' + revision);
  const files = [...new Set(SOURCE_RULES.map(r => r.file))];
  const anchors = [], sourceFiles = [];
  for (const file of files) {
    const bytes = await readFile(path.join(root, file));
    if (bytes.length > 3 * MB) throw new Error('source-too-large:' + file);
    sourceFiles.push({ file, bytes: bytes.length, sha256: digest(bytes) });
    anchors.push(...locateAnchors(bytes.toString('utf8'), SOURCE_RULES.filter(r => r.file === file), file));
  }
  return {
    schemaVersion: 1, evidenceType: 'DIRECT_PINNED_SOURCE_AUDIT',
    sourceRepo: 'riba2534/claude-opus-5-5-demo', revision,
    files: sourceFiles, anchors, count: anchors.length,
    claimLimit: 'Static source anchors only: no REA invocation, no runtime observation, no license grant.',
  };
}

export async function stageHtml(game, htmlPath, targetDir) {
  assertTarget(game);
  const bytes = await readFile(htmlPath);
  if (bytes.length > 6 * MB) throw new Error('html-too-large');
  const { script, scriptBlocks, selectedByteLength } = extractInlineGameBundle(bytes.toString('utf8'));
  await mkdir(targetDir, { recursive: true, mode: 0o700 });
  await writeFile(path.join(targetDir, 'bundle.js'), script, { flag: 'wx', mode: 0o600 });
  await writeFile(path.join(targetDir, 'package.json'), JSON.stringify({
    name: 'rea-study-' + game, version: '1.0.0', private: true, type: 'commonjs',
  }) + '\n', { flag: 'wx', mode: 0o600 });
  return {
    schemaVersion: 1, game, sourceUrl: TARGETS[game],
    htmlBytes: bytes.length, htmlSha256: digest(bytes), inlineScriptBlocks: scriptBlocks,
    bundleBytes: selectedByteLength, bundleSha256: digest(script),
    analysisTarget: 'Ephemeral extracted inline JavaScript + generated package.json',
    claimLimit: 'Stage preparation does NOT mean REA executed or webpage ran in a browser.',
  };
}

export function createReaReceipt(game, reportBytes, commandExitCode, stage) {
  assertTarget(game);
  let result = null;
  try { result = JSON.parse(reportBytes.toString('utf8')); } catch { /* recorded as incomplete */ }
  const normalized = result?.normalized_result;
  const validEvidence = commandExitCode === 0 && result !== null &&
    typeof normalized === 'object' && normalized !== null && !Array.isArray(normalized) &&
    typeof result.evidence_id === 'string' && result.evidence_id.length > 0;
  return {
    schemaVersion: 1, game, stage, reaVersionRequested: '6.4.0',
    commandExitCode, outputBytes: reportBytes.length, outputSha256: digest(reportBytes),
    status: validEvidence ? 'REAL_REA_STATIC_EVIDENCE_RECEIVED' : 'REA_FAILED_OR_UNRECOGNIZED',
    evidenceId: validEvidence ? result.evidence_id : null,
    normalizedKeys: validEvidence ? Object.keys(normalized).slice(0, 25) : [],
    outputTopLevelKeys: result && typeof result === 'object' ? Object.keys(result).slice(0, 25) : [],
    reaExecutedVerified: validEvidence,
    browserPlayed: false, sourceMatched: false, releaseAllowed: false,
    claimLimit: 'An actual tool receipt, NOT a gameplay reconstruction accuracy score or approval.',
  };
}

async function cli(args) {
  const [mode, ...rest] = args;
  if (mode === 'stage' && rest.length === 4) {
    const [game, html, dir, receipt] = rest;
    const info = await stageHtml(game, html, dir);
    await writeFile(receipt, JSON.stringify(info, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ game, bundleSha256: info.bundleSha256, htmlSha256: info.htmlSha256 }));
  } else if (mode === 'anchors' && rest.length === 2) {
    const [sourceRoot, output] = rest;
    const report = await auditPinnedSource(sourceRoot);
    await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ revision: report.revision, anchors: report.count }));
  } else if (mode === 'receipt' && rest.length === 5) {
    const [game, raw, exit, stageFile, output] = rest;
    const result = createReaReceipt(game, await readFile(raw), Number(exit), JSON.parse(await readFile(stageFile, 'utf8')));
    await writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ game, status: result.status, exitCode: result.commandExitCode }));
    if (!result.reaExecutedVerified) process.exitCode = 2;
  } else {
    throw new Error('usage: stage ID input.html targetDir receipt.json | anchors pinnedSourceDir output.json | receipt ID raw.json exitCode stage.json output.json');
  }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  cli(process.argv.slice(2)).catch(err => { console.error(err.message); process.exitCode = 1; });
}
