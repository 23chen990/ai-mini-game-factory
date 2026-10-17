/* global process, console */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { z } from 'zod';
import { buildHash } from './runner.mjs';
import { RACING_OWNED_NAMES } from './racing-mobile-build.mjs';
import { STAGES } from '../../templates/web-lite/h5-source-mobile-v1/racing/career.mjs';
import { qualifiedVisibleFinish } from './racing-visible-policy.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const Sha = z.string().regex(/^[a-f0-9]{64}$/u);
const Status = z.enum(['PASS', 'BLOCKED', 'FAIL']);
const Artifact = z.object({ path: z.string().min(1), sha256: Sha, bytes: z.number().int().nonnegative(), role: z.string().min(1) }).strict();
export const DeliverySchema = z.object({
  schemaVersion: z.literal(1), runId: z.literal('h5-qq-mobile-20261013'), gameId: z.literal('qq-speed'),
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/u), inputHash: Sha, buildHash: Sha,
  draft: z.literal(true), publishable: z.literal(false), artifacts: z.array(Artifact).min(5),
  naturalReport: z.string().min(1), gates: z.object({ natural: Status, perceptual: Status, engineering: Status,
    physicalAndroid: z.literal('BLOCKED'), physicalIphone: z.literal('BLOCKED'), liveAds: z.literal('BLOCKED'), commercial: z.literal('BLOCKED') }).strict(),
  checkedAt: z.string().datetime(),
}).strict();
export const NaturalSchema = z.object({
  schemaVersion: z.literal(1), gameId: z.literal('qq-speed'), buildHash: Sha,
  naturalInputsOnly: z.literal(true), seededCampaign: z.literal(false),
  races: z.array(z.object({ stage: z.enum([...STAGES.map(s => s.id), 'daily']), map: z.enum(['city', 'aegean', 'egypt', 'snow']),
    laps: z.number().int().min(1).max(3), diff: z.number().int().min(0).max(2), mode: z.enum(['speed', 'item']),
    finished: z.boolean(), finishTime: z.number().nonnegative().nullable(), progress: z.number().finite(),
    place: z.number().int().min(1).max(6), earnedStars: z.number().int().min(0).max(3),
    heading: z.string(), resultStats: z.string(), goal: z.string(), status: z.enum(['PASS', 'BLOCKED']),
    actionsFit: z.boolean(), forbiddenOperations: z.array(z.never()), input: z.string().min(1),
  }).passthrough()), errors: z.array(z.string()), passed: z.boolean(),
}).passthrough().superRefine((report, ctx) => {
  for (const [i, race] of report.races.entries()) if (race.status === 'PASS' && (!qualifiedVisibleFinish(race, race.earnedStars) || !(race.finishTime > 0) || !(race.progress > 0)))
    ctx.addIssue({ code: 'custom', path: ['races', i], message: 'PASS requires an actual qualified visible player finish, not old stars' });
  if (report.passed && (report.errors.length || report.races.length !== STAGES.length+1 || new Set(report.races.map(r => r.stage)).size !== STAGES.length+1 || report.races.some(r => r.status !== 'PASS' || !r.actionsFit)))
    ctx.addIssue({ code: 'custom', message: 'Full natural PASS requires all '+STAGES.length+' unique stages + daily and visible terminal actions' });
});
const decodeJson = bytes => JSON.parse(bytes.toString('utf8'));
export async function currentRacingInputHash() {
  const owned = 'templates/web-lite/h5-source-mobile-v1';
  const inputs = await Promise.all(RACING_OWNED_NAMES.map(name => readFile(path.join(owned, 'racing', name), 'utf8')));
  inputs.push(...await Promise.all(['fuel.mjs', 'themes.mjs'].map(name => readFile(path.join(owned, name), 'utf8'))));
  inputs.push(await readFile('tools/lean-pilot/racing-mobile-build.mjs', 'utf8'));
  return hash(inputs.join('\n'));
}
export async function verifyDelivery(manifestPath) {
  const manifest = DeliverySchema.parse(decodeJson(await readFile(manifestPath)));
  const run = path.resolve('runs/h5-qq-mobile-20261013'), game = path.join(run, 'workspace/game');
  const build = decodeJson(await readFile(path.join(run, 'artifacts/build-racing.json')));
  if (manifest.buildHash !== build.buildHash || await buildHash(game) !== build.buildHash) throw Error('Current actual H5 build hash differs');
  if (await currentRacingInputHash() !== build.inputHash || build.inputHash !== manifest.inputHash)
    throw Error('Playable does not match current owned source inputs');
  for (const artifact of manifest.artifacts) {
    const file = path.resolve(artifact.path);
    if (!file.startsWith(path.resolve('docs/race-career-20261014') + path.sep) && !file.startsWith(run + path.sep)) throw Error('Evidence belongs outside target game scope');
    const bytes = await readFile(file);
    if (hash(bytes) !== artifact.sha256 || bytes.length !== artifact.bytes) throw Error('Artifact integrity failed: ' + artifact.path);
  }
  const zip = manifest.artifacts.find(a => a.role === 'h5-zip'), standalone = manifest.artifacts.find(a => a.role === 'standalone-html');
  if (!zip || !standalone || standalone.sha256 !== build.trialSha256) throw Error('Latest H5 ZIP/standalone pair missing or stale');
  const exec = promisify(execFile);
  for (const name of ['index.html', 'style.css', 'platform.json', 'LICENSE.three.txt']) {
    const { stdout } = await exec('unzip', ['-p', path.resolve(zip.path), name], { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 });
    if (hash(stdout) !== hash(await readFile(path.join(game, name)))) throw Error('ZIP payload differs from tested current H5: ' + name);
  }
  const bytes = await readFile(manifest.naturalReport);
  const natural = NaturalSchema.parse(decodeJson(manifest.naturalReport.endsWith('.gz') ? gunzipSync(bytes) : bytes));
  if (natural.buildHash !== manifest.buildHash || (manifest.gates.natural === 'PASS') !== natural.passed) throw Error('Natural gate contradicts current-build evidence');
  const victories = natural.races.filter(r => r.status === 'PASS');
  for (const race of victories.filter(r => r.stage !== 'daily')) {
    const stage = STAGES.find(s => s.id === race.stage);
    if (!stage || stage.map !== race.map || stage.laps !== race.laps || stage.diff !== race.diff || stage.mode !== race.mode || race.place > stage.rank) throw Error('Career race configuration or rank gate differs: ' + race.stage);
    const count = label => Number(race.resultStats.match(new RegExp('(\\d+)' + label, 'u'))?.[1] ?? 0);
    if (stage.kind === 'item' && count('拾取道具') < stage.target) throw Error('Physical pickups missing: ' + stage.id);
    if (stage.kind === 'overtake' && count('弯道超车') < stage.target) throw Error('Real corner passes missing: ' + stage.id);
    if (stage.kind === 'drift' && count('有效漂移') < stage.target) throw Error('Clean drifts missing');
    if (stage.kind === 'time' && race.finishTime > stage.target) throw Error('Time objective missed');
    if (stage.kind === 'speed' && Number(race.goal.match(/测速 (\d+)\//u)?.[1] ?? 0) < stage.target) throw Error('Speed gate missed');
    if (stage.kind === 'elimination' && !race.goal.includes('已存活 2/2')) throw Error('Elimination survival missing');
  }
  if (natural.passed) for (const map of ['city', 'egypt', 'aegean', 'snow']) {
    if (!victories.some(r => r.map === map && r.laps >= 2) || !victories.some(r => r.map === map && r.diff === 2)) throw Error('Multi-lap/expert map coverage missing: ' + map);
  }
  const html = await readFile(path.join(game, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gu)];
  if (scripts.length !== 2 || /<script[^>]*src=/u.test(html) || !html.includes('Permission is hereby granted')) throw Error('Unexpected default runtime entry or missing Three.js notice');
  const temp = path.join(run, 'artifacts/delivery-script-check'); await mkdir(temp, { recursive: true });
  for (const [i, script] of scripts.entries()) { const file = path.join(temp, 'inline-' + i + '.js'); await writeFile(file, script[1]); await exec(process.execPath, ['--check', file]); }
  return { passed: true, buildHash: manifest.buildHash, artifacts: manifest.artifacts.length, naturalVictories: victories.length,
    all16AndDaily: natural.passed, scriptSyntax: '2/2', publishable: false, remaining: Object.entries(manifest.gates).filter(([, status]) => status !== 'PASS').map(([gate]) => gate) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('tools/lean-pilot/racing-delivery-verify.mjs')) {
  verifyDelivery(process.argv[2]).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
}
