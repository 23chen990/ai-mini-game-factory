import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, symlink, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { NaturalSchema, DeliverySchema, currentRacingInputHash } from './racing-delivery-verify.mjs';
import { buildHash, GAME_FILES } from './runner.mjs';
import { STAGES, newCareer, recordStage } from '../../templates/web-lite/h5-source-mobile-v1/racing/career.mjs';
import { qualifiedVisibleFinish } from './racing-visible-policy.mjs';
const race = { stage: '01', course: 'race-01', phase: 'finished', map: 'city', laps: 2, diff: 1, mode: 'speed', finished: true, finishTime: 142.34,
  progress: 6363.81, place: 1, earnedStars: 3, heading: '第 1 名',
  result: '第 1 名 · 02:22.34 · 最佳 02:22.34 · 累计 3 星',
  saved: JSON.stringify({ version: 1, rounds: 1, stars: { '01': 3 }, times: { '01': 142.34 } }),
  resultStats: '', goal: '', status: 'PASS',
  actionsFit: true, forbiddenOperations: [], input: 'trusted CDP touches from visible minimap' };
const report = value => ({ schemaVersion: 1, gameId: 'qq-speed', buildHash: 'a'.repeat(64), naturalInputsOnly: true,
  seededCampaign: false, races: [value], errors: [], passed: false });
test('delivery evidence rejects seeded victories, old saved stars and forbidden state writes', () => {
  assert.throws(() => NaturalSchema.parse({ ...report(race), seededCampaign: true }));
  assert.throws(() => NaturalSchema.parse(report({ ...race, heading: '再试一次，争取过关' })));
  assert.throws(() => NaturalSchema.parse(report({ ...race, heading: '挑战成功！★★★' })));
  assert.throws(() => NaturalSchema.parse(report({ ...race, finished: false })));
  assert.throws(() => NaturalSchema.parse(report({ ...race, place: 4, heading: '第 4 名' })));
  assert.throws(() => NaturalSchema.parse(report({ ...race, earnedStars: 0 })));
  assert.throws(() => NaturalSchema.parse(report({ ...race, forbiddenOperations: ['player.progress=finish'] })));
  assert.throws(() => NaturalSchema.parse({ ...report(race), passed: true }));
  assert.equal(NaturalSchema.parse(report(race)).races[0].status, 'PASS');
});
test('a visible PASS still requires a real positive finish time/progress and a known career stage', () => {
  assert.throws(() => NaturalSchema.parse(report({ ...race, finishTime: 0 })));
  assert.throws(() => NaturalSchema.parse(report({ ...race, progress: 0 })));
  assert.throws(() => NaturalSchema.parse(report({ ...race, stage: 'unknown' })));
  assert.throws(() => NaturalSchema.parse(report({ ...race, course: 'race-03' })));
  assert.throws(() => NaturalSchema.parse(report({ ...race, saved: JSON.stringify({ version: 1, rounds: 1,
    stars: { '03': 3 }, times: { '03': 142.34 } }) })));
});
test('H5 delivery cannot claim physical, LIVE, commercial or publication approval', () => {
  const manifest = { schemaVersion: 1, runId: 'h5-qq-mobile-20261013', gameId: 'qq-speed', sourceCommit: 'a'.repeat(40),
    inputHash: 'b'.repeat(64), buildHash: 'c'.repeat(64), draft: true, publishable: false,
    artifacts: Array.from({ length: 5 }, (_, i) => ({ path: 'evidence-' + i, sha256: 'd'.repeat(64), bytes: 1, role: 'test' })),
    naturalReport: 'natural.json', gates: { natural: 'PASS', perceptual: 'PASS', engineering: 'PASS',
      physicalAndroid: 'BLOCKED', physicalIphone: 'BLOCKED', liveAds: 'BLOCKED', commercial: 'BLOCKED' }, checkedAt: new Date().toISOString() };
  assert.equal(DeliverySchema.parse(manifest).publishable, false);
  assert.throws(() => DeliverySchema.parse({ ...manifest, publishable: true }));
  assert.throws(() => DeliverySchema.parse({ ...manifest, gates: { ...manifest.gates, liveAds: 'PASS' } }));
});

// Exercise the real verifier, ZIP/HTML/source hashes and child syntax checks in
// an isolated cwd. These synthetic contract fixtures are never natural runs.
const execute = promisify(execFile);
const repository = fileURLToPath(new URL('../../', import.meta.url));
const verifierURL = new URL('./racing-delivery-verify.mjs', import.meta.url).href;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function deliveryFixture(t, races, corrupt = null, inlineBodies = ['const fixtureA=1;', 'const fixtureB=2;'], transformHtml = html => html) {
  const base = await mkdtemp(path.join(tmpdir(), 'racing-delivery-contract-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const run = path.join(base, 'runs/h5-qq-mobile-20261013'), game = path.join(run, 'workspace/game');
  await mkdir(game, { recursive: true });await mkdir(path.join(run, 'artifacts'));
  for (const name of ['templates', 'tools']) await symlink(path.join(repository, name), path.join(base, name), 'dir');
  for (const name of [...GAME_FILES, 'platform.json', 'LICENSE.three.txt'])
    await writeFile(path.join(game, name), name.endsWith('.json') ? '{}' : '/* synthetic contract fixture */');
  await writeFile(path.join(game, 'candidate.json'), JSON.stringify({ templateId: 'h5-source-mobile-v1' }));
  const html = transformHtml('<!doctype html><html><body>Permission is hereby granted' + inlineBodies.map(body => '<script>' + body + '</script>').join('') + '</body></html>');
  await writeFile(path.join(game, 'index.html'), html);
  const build = { buildHash: await buildHash(game), inputHash: await currentRacingInputHash(), trialSha256: digest(html) };
  const receipt = path.join(run, 'artifacts/build-racing.json');await writeFile(receipt, JSON.stringify(build));
  const standalone = path.join(run, 'standalone.html');await writeFile(standalone, html);
  const zip = path.join(run, 'fixture.zip');
  await execute('zip', ['-q', zip, 'index.html', 'style.css', 'platform.json', 'LICENSE.three.txt'], { cwd: game });
  const naturalPath = path.join(run, 'fixture-natural.json');
  await writeFile(naturalPath, JSON.stringify({ ...report(races[0]), buildHash: build.buildHash, races,
    fixtureOnly: true, passed: false }));
  const note = path.join(run, 'fixture-only.txt');await writeFile(note, 'Synthetic QA contract evidence. Not a natural-play report.');
  const artifacts = await Promise.all([[zip, 'h5-zip'], [standalone, 'standalone-html'], [naturalPath, 'natural-report'],
    [receipt, 'receipt'], [note, 'fixture-notice']].map(async ([file, role]) => {
    const bytes = await readFile(file);return { path: file, sha256: digest(bytes), bytes: bytes.length, role };
  }));
  const manifest = { schemaVersion: 1, runId: 'h5-qq-mobile-20261013', gameId: 'qq-speed', sourceCommit: 'a'.repeat(40),
    ...build, draft: true, publishable: false, artifacts, naturalReport: naturalPath,
    gates: { natural: 'BLOCKED', perceptual: 'BLOCKED', engineering: 'PASS', physicalAndroid: 'BLOCKED',
      physicalIphone: 'BLOCKED', liveAds: 'BLOCKED', commercial: 'BLOCKED' }, checkedAt: new Date().toISOString() };
  delete manifest.trialSha256;
  if (corrupt === 'artifact') await writeFile(note, 'tampered after hashing');
  if (corrupt === 'build') manifest.buildHash = 'b'.repeat(64);
  if (corrupt === 'input') manifest.inputHash = 'b'.repeat(64);
  const manifestPath = path.join(run, 'fixture-manifest.json');await writeFile(manifestPath, JSON.stringify(manifest));
  const code = `import {verifyDelivery} from ${JSON.stringify(verifierURL)};try{console.log(JSON.stringify(await verifyDelivery(process.argv[1])));}catch(error){console.error(error.message);process.exitCode=1;}`;
  const { stdout } = await execute(process.execPath, ['--input-type=module', '-e', code, manifestPath], { cwd: base });
  const checkedScripts = await Promise.all(inlineBodies.map((_, i) => readFile(path.join(run, 'artifacts/delivery-script-check', 'inline-' + i + '.js'), 'utf8')));
  return { ...JSON.parse(stdout), checkedScripts };
}
function nativeRankFixture(id, time = 142.34, place = 1) {
  const stage = STAGES.find(item => item.id === id);
  const nativeResult = { finished: true, place, time };
  const graded = recordStage(newCareer(), stage, nativeResult, { pickups: 0, cleanPasses: 0, cleanDrifts: 0, gateSpeed: 0, survived: 0 });
  assert.equal(graded.stars, 4 - place);
  const visibleTime = `${String(Math.floor(time / 60)).padStart(2, '0')}:${(time % 60).toFixed(2).padStart(5, '0')}`;
  const value = { ...race, stage: id, course: stage.course, map: stage.map, laps: stage.laps, diff: stage.diff, mode: stage.mode,
    finishTime: time, place, heading: `第 ${place} 名`, earnedStars: graded.stars, saved: JSON.stringify(graded.career),
    result: `第 ${place} 名 · ${visibleTime} · 最佳 ${visibleTime} · 累计 ${graded.stars} 星`,
    resultStats: '有效漂移0 弯道超车0 拾取道具0 小喷0', goal: '', fixtureOnly: true };
  assert.equal(qualifiedVisibleFinish(value, graded.stars), true);
  return value;
}
test('real verifyDelivery follows native rank awards instead of historical mission counters', async t => {
  for (const [id, kind, time] of [['05', 'item', 142.34], ['03', 'overtake', 142.34], ['04', 'drift', 142.34],
    ['07', 'time', 158.01], ['02', 'speed', 142.34], ['12', 'elimination', 142.34]]) {
    await t.test(`${id} ${kind}: native first place earns three stars with unmet old counters`, async sub => {
      const result = await deliveryFixture(sub, [nativeRankFixture(id, time)]);
      assert.equal(result.passed, true);assert.equal(result.naturalVictories, 1);
      assert.equal(result.all16AndDaily, false);assert.equal(result.publishable, false);
      assert.ok(result.remaining.includes('natural'));
    });
  }
});
test('real verifyDelivery accepts the native third-place one-star threshold', async t => {
  const result = await deliveryFixture(t, [nativeRankFixture('05', 142.34, 3)]);
  assert.equal(result.naturalVictories, 1);assert.equal(result.all16AndDaily, false);
});
test('real verifyDelivery requires bounded daily start identity as well as that date\'s course and save', async t => {
  const wallMs = Date.parse('2026-10-18T23:59:59.990Z'), timeOrigin = wallMs - 1000;
  const value = { ...nativeRankFixture('05'), stage: 'daily', raceDay: '2026-10-18',
    dailyStart: { before: { wallMs, timeOrigin, monotonicMs: 1000, timezoneOffsetMinutes: 0 },
      after: { wallMs: wallMs + 20, timeOrigin, monotonicMs: 1020, timezoneOffsetMinutes: 0,
        nativeState: 'race', course: 'race-05', map: 'egypt', laps: 2, diff: 0, mode: 'item' } },
    result: '每日挑战成功 · 第 1 名 · 02:22.34 · 当日最佳 02:22.34 · 连续挑战 1 天',
    saved: JSON.stringify({ version: 1, rounds: 1, daily: { date: '2026-10-18', lastWonDate: '2026-10-18', stars: 3, best: 142.34 } }) };
  assert.equal((await deliveryFixture(t, [value])).naturalVictories, 1);
  for (const invalid of [{ ...value, dailyStart: undefined }, { ...value, raceDay: '2026-10-19' }])
    await assert.rejects(deliveryFixture(t, [invalid]), /actual qualified visible player finish/u);
});
test('real verifyDelivery keeps native outcome, saved stage and evidence integrity gates', async t => {
  for (const [name, value] of [
    ['unfinished', { ...race, finished: false }],
    ['fourth despite old stars', { ...race, place: 4, heading: '第 4 名' }],
    ['zero stars', { ...race, earnedStars: 0 }],
    ['old result', { ...race, result: '第 1 名 · 02:00.00 · 最佳 02:00.00 · 累计 3 星' }],
    ['wrong course', { ...race, course: 'race-03' }],
    ['wrong saved stage', { ...race, saved: JSON.stringify({ version: 1, rounds: 1, stars: { '03': 3 }, times: { '03': 142.34 } }) }],
  ]) await t.test(name, sub => assert.rejects(deliveryFixture(sub, [value]), /actual qualified visible player finish/u));
  for (const [kind, pattern] of [['artifact', /Artifact integrity failed/u], ['build', /Current actual H5 build hash differs/u],
    ['input', /Playable does not match current owned source inputs/u]])
    await t.test(kind + ' mismatch', sub => assert.rejects(deliveryFixture(sub, [race], kind), pattern));
});

test('real verifyDelivery preserves both script bodies with a 14 MiB inline asset payload', async t => {
  // Localized text reproduces the original whole-body regex stack overflow.
  const inlineBytes = 14 * 1024 * 1024, prefix = '/* 离线赛车资源 fixture: ', suffix = ' */\nconst fixtureA=1;';
  const inlineBodies = [prefix + 'x'.repeat(inlineBytes - Buffer.byteLength(prefix + suffix)) + suffix, 'const fixtureB=2;\n'];
  const result = await deliveryFixture(t, [nativeRankFixture('05')], null, inlineBodies);
  assert.equal(result.passed, true);
  assert.equal(result.scriptSyntax, '2/2');
  assert.deepEqual(result.checkedScripts, inlineBodies);
  assert.equal(Buffer.byteLength(result.checkedScripts[0]), inlineBytes);
});

test('real verifyDelivery enforces HTML script attributes and uppercase entry counts', async t => {
  for (const [name, transformHtml] of [
    ['spaced src assignment', html => html.replace('<script>', '<script src = "external.js">')],
    ['uppercase SRC attribute', html => html.replace('<script>', '<script SRC="external.js">')],
    ['extra uppercase external script', html => html.replace('</body>', '<SCRIPT SRC="external.js"></SCRIPT></body>')],
    ['extra uppercase inline script', html => html.replace('</body>', '<SCRIPT>const fixtureC=3;</SCRIPT></body>')],
  ]) await t.test(name, sub => assert.rejects(deliveryFixture(sub, [nativeRankFixture('05')], null, undefined, transformHtml),
    /Unexpected default runtime entry or missing Three\.js notice/u));
});

test('real verifyDelivery preserves bodies with mixed-case HTML script tags', async t => {
  const inlineBodies = ['const label = "MiXeD 赛车";\r\n', '/* Original Case */\nconst value=2;\n'];
  const transformHtml = html => html.replace(/<script>/gu, '<ScRiPt type="text/javascript">').replace(/<\/script>/gu, '</sCrIpT \t>');
  const result = await deliveryFixture(t, [nativeRankFixture('05')], null, inlineBodies, transformHtml);
  assert.equal(result.passed, true);
  assert.equal(result.scriptSyntax, '2/2');
  assert.deepEqual(result.checkedScripts, inlineBodies);
});
