/* global console */
// Package only the exact current-build H5 candidate and manifest-bound JSON
// reports. This does not publish a native platform package or release the game.
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { tsImport } from 'tsx/esm/api';
import { z } from 'zod';
import { BASE, REPO, RUN, RUN_ID, WORKSPACE } from './prepare.mjs';

const GAME = '鹈鹕海岸冒险';
const SHA256 = z.string().regex(/^[a-f0-9]{64}$/u);
const Candidate = path.join(REPO, 'docs/lean-pilot/pelican-feel-v3-20261014/release-candidate');
const BuildReceiptSchema = z.object({ attempt: z.number().int().positive(), route: z.literal('formal-fixer'), buildHash: SHA256, workspace: z.literal(WORKSPACE), buildExit: z.literal(0), threadId: z.string().min(1) }).passthrough();
const SummarySchema = z.object({
  schemaVersion: z.literal(1), targetGame: z.literal(GAME), runId: z.literal(RUN_ID), workspace: z.literal(WORKSPACE),
  attempt: z.number().int().positive(), buildHash: SHA256, route: z.literal('formal-fixer'),
  scriptedCoreJourneyPassed: z.boolean(), independentPerceptualPassed: z.boolean(), runtimeProductJourneyPassed: z.boolean(),
  releaseReady: z.literal(false), productionReady: z.literal(false),
  readiness: z.object({ h5DevicePlaytestCandidate: z.boolean(), physicalDevice: z.literal(false), liveAds: z.literal(false), nativePackages: z.literal(false), production: z.literal(false) }).passthrough(),
  reports: z.array(z.object({ kind: z.string().min(1), engine: z.string().nullable(), path: z.string().min(1), sha256: SHA256, status: z.enum(['PASS', 'BLOCKED', 'FAIL']), blockers: z.array(z.string()) }).passthrough()),
  safetyEvidence: z.array(z.object({
    engine: z.enum(['webkit', 'chromium']), status: z.enum(['PASS', 'BLOCKED', 'FAIL']), path: z.string().min(1),
    checks: z.array(z.object({ name: z.string().min(1), status: z.enum(['PASS', 'BLOCKED', 'FAIL']) }).strict()),
    environmentBlockedChecks: z.array(z.string()),
    environmentalEvidence: z.object({ diagnosticName: z.string().min(1), path: z.string().min(1), passed: z.boolean(), classification: z.string().nullable() }).strict().nullable(),
  }).strict()).length(2),
  naturalFlows: z.array(z.object({ kind: z.string().min(1), path: z.string().min(1), sha256: SHA256, status: z.enum(['PASS', 'BLOCKED', 'FAIL']), blockers: z.array(z.string()) }).passthrough()),
  levels: z.array(z.object({ level: z.number().int().positive(), distance: z.number().optional(), fish: z.number().optional(), gold: z.number().optional(), elapsedSeconds: z.number().optional(), result: z.string().optional(), unlocked: z.number().optional() }).passthrough()),
  blockers: z.array(z.string()), evidenceManifestPath: z.string().min(1),
}).passthrough();
const EvidenceManifestSchema = z.object({
  schemaVersion: z.literal(1), targetGame: z.literal(GAME), targetRunId: z.literal(RUN_ID), workspace: z.literal(WORKSPACE),
  attempt: z.number().int().positive(), buildHash: SHA256,
  reports: z.array(z.object({ kind: z.string(), engine: z.string().nullable(), path: z.string(), sha256: SHA256, status: z.enum(['PASS', 'BLOCKED', 'FAIL']) }).strict()),
  naturalTraces: z.array(z.object({ kind: z.string(), path: z.string(), sha256: SHA256, status: z.enum(['PASS', 'BLOCKED', 'FAIL']) }).strict()),
  screenshots: z.array(z.object({ path: z.string(), sha256: SHA256, sourceReport: z.string() }).strict()),
  copyFiles: z.array(z.object({ kind: z.string(), path: z.string(), sha256: SHA256 }).strict()),
}).passthrough();
const { QaReportSchema, BuildReportSchema } = await tsImport('../../../src/schemas/index.ts', import.meta.url);

const normalizeRelative = (value) => {
  const normalized = String(value ?? '').replaceAll('\\', '/').trim();
  if (!normalized || path.posix.isAbsolute(normalized) || path.win32.isAbsolute(normalized) || normalized.split('/').some((part) => part === '..') || /^(?:[a-z]+:)?\/\//iu.test(normalized)) throw new Error(`Unsafe run-relative path: ${value}`);
  return normalized;
};
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function readRunBytes(relative) {
  const normalized = normalizeRelative(relative);
  let current = path.resolve(RUN);
  const rootStat = await lstat(current);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Run root is not a regular directory');
  for (const component of normalized.split('/')) {
    current = path.join(current, component);
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) throw new Error(`Symlink evidence is forbidden: ${normalized}`);
  }
  const stat = await lstat(current);
  if (!stat.isFile()) throw new Error(`Evidence is not a regular file: ${normalized}`);
  return readFile(current);
}

async function readRunJson(relative) {
  return JSON.parse((await readRunBytes(relative)).toString('utf8'));
}

async function writeCandidateFile(name, bytes) {
  const safe = normalizeRelative(name);
  const destination = path.resolve(Candidate, safe);
  const relative = path.relative(Candidate, destination);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`Candidate path escapes release directory: ${name}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  return { path: safe, sha256: sha(bytes), bytes: bytes.byteLength };
}

const receipt = BuildReceiptSchema.parse(await readRunJson('build-receipt.json'));
const summary = SummarySchema.parse(await readRunJson('qa-summary-v3.json'));
const qaReport = QaReportSchema.parse(await readRunJson('qa-report-v3.json'));
const buildReport = BuildReportSchema.parse(await readRunJson('build-report-v3.json'));
const evidenceManifest = EvidenceManifestSchema.parse(await readRunJson(summary.evidenceManifestPath));

if (receipt.workspace !== WORKSPACE || summary.workspace !== WORKSPACE || evidenceManifest.workspace !== WORKSPACE) throw new Error('Run/workspace identity mismatch');
if (receipt.attempt !== summary.attempt || receipt.buildHash !== summary.buildHash || evidenceManifest.attempt !== receipt.attempt || evidenceManifest.buildHash !== receipt.buildHash) throw new Error('Build receipt, summary, and evidence manifest do not describe one build');
if (!summary.scriptedCoreJourneyPassed || !summary.independentPerceptualPassed || !summary.runtimeProductJourneyPassed || !summary.readiness.h5DevicePlaytestCandidate) throw new Error('Desktop H5 candidate gates are incomplete; no ZIP was written');
if (summary.releaseReady || summary.productionReady || qaReport.passed || buildReport.completion?.status !== 'RELEASE_BLOCKED') throw new Error('Refusing to package a report that claims production/release readiness or omits release blockers');
if (!summary.blockers.some((item) => /Physical iPhone|Android playtest/iu.test(item)) || !summary.blockers.some((item) => /background|lock-screen/iu.test(item)) || !summary.blockers.some((item) => /TapTap advertising/iu.test(item)) || !summary.blockers.some((item) => /WeChat and Douyin/iu.test(item))) throw new Error('Required physical-device, background, advertising, or native-package BLOCKED status is missing');

const requiredReports = [
  ['campaign', 'webkit'], ['campaign', 'chromium'], ['collision', 'webkit'], ['collision', 'chromium'],
  ['experience', 'webkit'], ['experience', 'chromium'], ['head', 'webkit'], ['head', 'chromium'], ['visual', 'webkit'],
];
for (const [kind, engine] of requiredReports) {
  if (!summary.reports.some((report) => report.kind === kind && report.engine === engine && report.status === 'PASS')) throw new Error(`Current-build ${kind}/${engine} report is not PASS`);
}
const safetyCheckNames = [
  'van-target-distance-reached', 'van-ends-round', 'car-not-jumpable',
  'distance-and-fish-jointly-required', 'tab-blur-pauses', 'background-manual-resume',
  'replay-resources-plateau',
];
const lifecycleManifestReport = evidenceManifest.reports.find((item) => item.kind === 'lifecycle');
const lifecycleEvidence = lifecycleManifestReport ? await readRunJson(lifecycleManifestReport.path) : null;
const verifiedNoSignalDiagnostic = (engine, evidence) => {
  const diagnosticName = engine === 'webkit' ? 'headless-webkit-tab-capability' : 'headless-chromium-tab-capability';
  const diagnostic = evidence?.diagnostics?.find((item) => item.name === diagnosticName);
  const away = diagnostic?.observation?.away;
  const events = away?.events;
  const hasSignal = Array.isArray(events) && events.some((event) => event.type === 'blur' || event.type === 'pagehide' || event.hidden === true);
  return Boolean(diagnostic && Array.isArray(events) && events.length === 0 && !hasSignal
    && away?.state?.phase !== 'paused' && away?.state?.pausedBySystem !== true
    && away?.visibility !== 'hidden' && events.every((event) => event.hidden !== true)
    && diagnostic.classification === 'NO_BACKGROUND_SIGNAL_FROM_HEADLESS_TABS');
};
for (const engine of ['webkit', 'chromium']) {
  const safety = summary.safetyEvidence.find((item) => item.engine === engine);
  const manifestReport = evidenceManifest.reports.find((item) => item.kind === 'safety' && item.engine === engine);
  const safetyReport = summary.reports.find((item) => item.kind === 'safety' && item.engine === engine);
  if (!safety || !manifestReport || !safetyReport || safety.path !== safetyReport.path || safety.status !== safetyReport.status || manifestReport.status !== safety.status) throw new Error(`Current-build safety/${engine} evidence binding is incomplete`);
  const checks = new Map(safety.checks.map((check) => [check.name, check.status]));
  const expected = safetyCheckNames;
  if (checks.size !== expected.length || expected.some((name) => !checks.has(name))) throw new Error(`Current-build safety/${engine} check set is incomplete`);
  for (const name of expected.filter((item) => !['tab-blur-pauses', 'background-manual-resume'].includes(item))) if (checks.get(name) !== 'PASS') throw new Error(`Current-build safety/${engine} check failed: ${name}`);
  const safetyBytes = await readRunBytes(safety.path);
  if (sha(safetyBytes) !== manifestReport.sha256 || !evidenceManifest.copyFiles.some((item) => item.path === safety.path && item.sha256 === manifestReport.sha256)) throw new Error(`Current-build safety/${engine} report is not bound by the current-run manifest`);
  const rawSafety = JSON.parse(safetyBytes.toString('utf8'));
  if (rawSafety.targetGame !== GAME || rawSafety.workspace !== WORKSPACE || rawSafety.buildHash !== receipt.buildHash || rawSafety.attempt !== receipt.attempt || rawSafety.mode !== 'safety' || rawSafety.engine !== engine || rawSafety.errors?.length) throw new Error(`Current-build safety/${engine} report identity or error state is invalid`);
  for (const name of expected) {
    const rawCheck = rawSafety.checks?.find((item) => item.name === name);
    if (!rawCheck || (rawCheck.passed === true) !== (checks.get(name) === 'PASS')) throw new Error(`Safety summary/raw-check mismatch: ${engine}/${name}`);
  }
  const blockedBackground = expected.filter((name) => ['tab-blur-pauses', 'background-manual-resume'].includes(name) && checks.get(name) === 'BLOCKED');
  if (expected.some((name) => ['tab-blur-pauses', 'background-manual-resume'].includes(name) && checks.get(name) === 'FAIL')) throw new Error(`Current-build safety/${engine} background check failed with an observed signal`);
  if (blockedBackground.length) {
    if (safety.status !== 'BLOCKED' || safety.environmentBlockedChecks.length !== blockedBackground.length || blockedBackground.some((name) => !safety.environmentBlockedChecks.includes(name))) throw new Error(`Current-build safety/${engine} BLOCKED classification is inconsistent`);
    const diagnosticName = engine === 'webkit' ? 'headless-webkit-tab-capability' : 'headless-chromium-tab-capability';
    if (!safety.environmentalEvidence?.passed || safety.environmentalEvidence.diagnosticName !== diagnosticName || safety.environmentalEvidence.path !== lifecycleManifestReport?.path || !verifiedNoSignalDiagnostic(engine, lifecycleEvidence)) throw new Error(`Current-build safety/${engine} lacks matching lifecycle environment evidence`);
    if (rawSafety.passed !== false) throw new Error(`Current-build safety/${engine} BLOCKED checks were incorrectly projected as passing`);
  } else if (safety.status !== 'PASS' || safety.environmentBlockedChecks.length) throw new Error(`Current-build safety/${engine} status is inconsistent with its checks`);
  if (safety.status === 'FAIL' || safetyReport.status === 'FAIL') throw new Error(`Current-build safety/${engine} failed; no ZIP was written`);
}
const headFlows = summary.naturalFlows.filter((flow) => flow.kind.startsWith('v3-head-natural-flow-'));
if (headFlows.length !== 8 || headFlows.some((flow) => flow.status !== 'PASS')) throw new Error('All eight current-build natural head traces must pass before packaging');
for (const flow of headFlows) {
  const manifestTrace = evidenceManifest.naturalTraces.find((entry) => entry.kind === flow.kind && entry.path === flow.path && entry.sha256 === flow.sha256 && entry.status === 'PASS');
  if (!manifestTrace) throw new Error(`Natural head trace is not manifest-bound: ${flow.kind}`);
}

const platformBytes = await readFile(path.join(WORKSPACE, 'game/platform.json'));
const platform = JSON.parse(platformBytes.toString('utf8'));
const platformStatusSchema = z.object({
  wechatMiniGame: z.object({ status: z.literal('NOT_PACKAGED') }).passthrough(),
  douyinMiniGame: z.object({ status: z.literal('NOT_PACKAGED') }).passthrough(),
  tapTapH5: z.object({ status: z.literal('NOT_INTEGRATED'), liveAds: z.literal(false) }).passthrough(),
  production: z.literal(false),
}).passthrough();
platformStatusSchema.parse(platform);

const htmlBytes = await readFile(path.join(WORKSPACE, 'game/index.html'));
if (sha(htmlBytes) !== receipt.buildHash) throw new Error('Built HTML no longer matches the current build receipt');
const licenseBytes = await readFile(path.join(WORKSPACE, 'game/LICENSE.three.txt'));
if (!licenseBytes.length) throw new Error('Three.js license file is empty');

// Re-parse the validated inputs against the shared schemas; this import also
// keeps the script's file references resolvable when merged into the main tree.
QaReportSchema.parse(qaReport);
BuildReportSchema.parse(buildReport);

await mkdir(Candidate, { recursive: true });
const reportCopies = [
  { name: 'qa-report-v3.json', source: 'qa-report-v3.json' },
  { name: 'build-report-v3.json', source: 'build-report-v3.json' },
  { name: 'qa-summary-v3.json', source: 'qa-summary-v3.json' },
  { name: 'qa-evidence-manifest-v3.json', source: summary.evidenceManifestPath },
  { name: 'build-receipt-v3.json', source: 'build-receipt.json' },
];
const written = [];
for (const copy of reportCopies) written.push(await writeCandidateFile(copy.name, await readRunBytes(copy.source)));
written.push(await writeCandidateFile('index.html', htmlBytes));
written.push(await writeCandidateFile('LICENSE.three.txt', licenseBytes));
written.push(await writeCandidateFile('platform.json', platformBytes));

// Copy only the JSON sources named by the current-run manifest. Screenshots
// and videos stay in their attempt folder and never enter the H5 archive.
const copiedEvidence = [];
for (const entry of evidenceManifest.copyFiles) {
  const relative = normalizeRelative(entry.path);
  if (!relative.endsWith('.json')) throw new Error(`Non-JSON evidence is not eligible for delivery copy: ${relative}`);
  const bytes = await readRunBytes(relative);
  if (sha(bytes) !== entry.sha256) throw new Error(`Current-run manifest hash mismatch: ${relative}`);
  const destination = `evidence/attempt-${receipt.attempt}/${relative}`;
  copiedEvidence.push(await writeCandidateFile(destination, bytes));
}
written.push(...copiedEvidence);

const levels = summary.levels.length ? summary.levels.map((level) => `| ${level.level} | ${level.distance ?? '—'} m | ${level.fish ?? '—'} 条 / 金鱼 ${level.gold ?? '—'} | ${Number.isFinite(level.elapsedSeconds) ? `${level.elapsedSeconds.toFixed(1)} 秒` : '—'} | ${level.result ?? '—'} |`).join('\n') : '| — | 当前 attempt 报告未提供五关结果 | — | — | BLOCKED |';
const reportTable = evidenceManifest.reports.map((item) => `| ${item.kind} | ${item.engine ?? '—'} | ${item.status} | \`${item.path}\` |`).join('\n');
const readme = `# ${GAME} V3 · H5 开发试玩候选\n\n状态：**BLOCKED，未通过 release gate**。此包只用于本地/设备 H5 试玩，不是 WeChat、Douyin 或 TapTap 原生发布包，也不代表生产放行。\n\n- 目标游戏：${GAME}\n- 工作区：\`${WORKSPACE}\`\n- Run：\`${RUN_ID}\` · attempt ${receipt.attempt}\n- 已测试 HTML SHA-256：\`${receipt.buildHash}\`\n- 基线提交：\`${BASE}\`\n\n解压后用静态 HTTP 服务打开 \`index.html\`。包内包含实际通过本轮 build receipt 绑定的单文件 H5、Three.js license、平台状态和机器报告副本。\n\n## 当前构建的桌面浏览器证据\n\n| QA 类别 | 浏览器 | 状态 | 当前 attempt 报告 |\n|---|---|---|---|\n${reportTable}\n\n## 五关自然流程\n\n| 关卡 | 路程 | 捕鱼 | 用时 | 结果 |\n|---|---:|---:|---:|---|\n${levels}\n\n## 仍为 BLOCKED 的发布条件\n\n- iPhone/Android 真机操作、低端设备性能、发热和长局稳定性尚未验证。\n- 手机真实切后台、锁屏、来电中断与恢复尚未验证；桌面浏览器或注入事件不能替代真机证据。\n- TapTap 实际广告尚未接入，不存在模拟广告奖励。\n- WeChat Mini Game 与 Douyin Mini Game 原生包未打包。\n- 人类玩家的乐趣/留存测试和生产发布仍未完成。\n\n平台状态：WeChat=${platform.wechatMiniGame.status}，Douyin=${platform.douyinMiniGame.status}，TapTap Ads=${platform.tapTapH5.status}，production=${platform.production}。\n\n包内 \`qa-report-v3.json\`、\`build-report-v3.json\`、\`qa-summary-v3.json\` 和 \`qa-evidence-manifest-v3.json\` 可机器复核。\n`;
written.push(await writeCandidateFile('README.zh-CN.md', Buffer.from(readme, 'utf8')));

const payloadNames = [
  'index.html', 'LICENSE.three.txt', 'platform.json', 'README.zh-CN.md',
  'build-receipt-v3.json', 'build-report-v3.json', 'qa-report-v3.json',
  'qa-summary-v3.json', 'qa-evidence-manifest-v3.json',
];
const payload = [];
for (const name of payloadNames) {
  const bytes = await readFile(path.join(Candidate, name));
  payload.push({ path: name, sha256: sha(bytes), bytes: bytes.byteLength });
}
const packageManifest = {
  schemaVersion: 1, targetGame: GAME, runId: RUN_ID, attempt: receipt.attempt,
  buildHash: receipt.buildHash, releaseReady: false, archiveKind: 'h5-device-playtest-candidate',
  includedFiles: payload, createdAt: new Date().toISOString(),
};
written.push(await writeCandidateFile('package-manifest-v3.json', Buffer.from(JSON.stringify(packageManifest, null, 2) + '\n', 'utf8')));

const zipName = 'pelican-coast-v3-h5-candidate.zip';
const zipPath = path.join(Candidate, zipName);
const pythonZip = [
  'import pathlib,sys,zipfile',
  'root=pathlib.Path(sys.argv[1])',
  'dest=pathlib.Path(sys.argv[2])',
  'names=sys.argv[3:]',
  'with zipfile.ZipFile(dest,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:',
  '  for name in names:',
  '    p=root/name',
  '    if not p.is_file(): raise SystemExit("missing archive input: "+name)',
  '    z.write(p,arcname=name)',
].join('\n');
execFileSync('python3', ['-c', pythonZip, Candidate, zipPath, ...payloadNames, 'package-manifest-v3.json'], { stdio: 'inherit' });
const zipBytes = await readFile(zipPath);
const zipHash = sha(zipBytes);

const sidecarRows = [
  { path: zipName, sha256: zipHash, bytes: zipBytes.byteLength },
  ...written.filter((item) => !item.path.startsWith('evidence/')),
].filter((item, index, rows) => rows.findIndex((row) => row.path === item.path) === index);
const shaText = sidecarRows.map((item) => `${item.sha256}  ${item.path}`).join('\n') + '\n';
const checksumFile = await writeCandidateFile('sha256-v3.txt', Buffer.from(shaText, 'utf8'));
const downloadManifest = {
  schemaVersion: 1, targetGame: GAME, runId: RUN_ID, attempt: receipt.attempt,
  workspace: WORKSPACE, buildHash: receipt.buildHash, releaseReady: false,
  archive: { path: zipName, sha256: zipHash, bytes: zipBytes.byteLength },
  packageManifest: { path: 'package-manifest-v3.json', sha256: sha(await readFile(path.join(Candidate, 'package-manifest-v3.json'))) },
  checksums: checksumFile,
  copiedEvidenceCount: copiedEvidence.length,
  copiedEvidenceRoot: `evidence/attempt-${receipt.attempt}/`,
  files: [...sidecarRows, { path: 'sha256-v3.txt', sha256: checksumFile.sha256, bytes: checksumFile.bytes }],
  createdAt: new Date().toISOString(),
};
await writeFile(path.join(Candidate, 'download-manifest-v3.json'), JSON.stringify(downloadManifest, null, 2) + '\n');

console.log(JSON.stringify({
  targetGame: GAME, workspace: WORKSPACE, attempt: receipt.attempt, buildHash: receipt.buildHash,
  archive: path.join(Candidate, zipName), sha256: zipHash, bytes: zipBytes.byteLength,
  reportCopies: reportCopies.map((item) => path.join(Candidate, item.name)),
  copiedEvidenceCount: copiedEvidence.length, releaseReady: false,
  remainingGaps: summary.blockers,
}, null, 2));
