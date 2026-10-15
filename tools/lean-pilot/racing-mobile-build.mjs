/* global process, console, URL */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSourceMobile } from './h5-mobile-build.mjs';
import { buildHash, loadRun } from './runner.mjs';
import { sha256 } from './policy.mjs';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RUN = 'h5-qq-mobile-20261013';
const exec = promisify(execFile);

export function patchRacingSource(source) {
  const fov = 'const fovT = 66 + Math.abs(P.s) * 0.12 + (P.nitroTime > 0 ? 9 : 0) + (P.smallBoost > 0 ? 4 : 0);';
  const jitter = 'if (P.nitroTime > 0) {\n      cam.position.x';
  const shake = 'const k = this.shake * this.shake;';
  let output = source;
  if (!output.includes("from './race-session.mjs'")) {
    for (const anchor of [fov, jitter, shake]) if (output.split(anchor).length !== 2) throw Error('Racing source anchor changed');
    output = "import { raceCameraFov } from './race-session.mjs';\n" + output
      .replace(fov, 'const fovT = this.mobileMode ? raceCameraFov(P.s, P.nitroTime > 0, P.smallBoost > 0) : 66 + Math.abs(P.s) * 0.12 + (P.nitroTime > 0 ? 9 : 0) + (P.smallBoost > 0 ? 4 : 0);')
      .replace(jitter, 'if (P.nitroTime > 0 && !this.mobileMode) {\n      cam.position.x')
      .replace(shake, 'const k = this.shake * this.shake * (this.mobileMode ? 0.25 : 1);');
  }
  if (!output.includes('this.mobileMode ? raceBloomStrength(')) {
    const bloom = "if (this.bloom) this.bloom.strength = (this.settings.quality === 'high' ? 0.75 : 0.6) + (P && P.nitroTime > 0 ? 0.3 : 0);";
    if (output.split(bloom).length !== 2) throw Error('Racing bloom anchor changed');
    output = output.replace("import { raceCameraFov } from './race-session.mjs';", "import { raceCameraFov, raceBloomStrength } from './race-session.mjs';")
      .replace(bloom, "if (this.bloom) this.bloom.strength = this.mobileMode ? raceBloomStrength(P && P.nitroTime > 0) : (this.settings.quality === 'high' ? 0.75 : 0.6) + (P && P.nitroTime > 0 ? 0.3 : 0);");
  }
  return output;
}

/** Event-only instrumentation; do not alter car dynamics from licensed original. */
export function annotateDriftResult(source) {
  const original = "this.emit('driftEnd', { time: this.driftTime });";
  const annotated = "this.emit('driftEnd', { time: this.driftTime, clean });";
  if (source.includes(annotated)) return source;
  if (source.split(original).length !== 2) throw Error('Native driftEnd event anchor changed');
  return source.replace(original, annotated);
}
/** Only label geometry; native item centers, collision, cooldown and drops stay intact. */
export function patchRacingItemVisuals(source) {
  const position = 'q.position.set(Math.sin(r) * .91, 0, Math.cos(r) * .91);';
  if (source.includes(position) && source.includes('cube.add(q);')) return source;
  const angles = 'for (const r of [0, Math.PI / 2]) {';
  for (const anchor of [angles, 'q.rotation.y = r;', 'g.add(q);']) if (source.split(anchor).length !== 2) throw Error('Native item label anchor changed');
  return source.replace(angles, 'for (const r of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {')
    .replace('q.rotation.y = r;', 'q.rotation.y = r;\n          ' + position)
    .replace('g.add(q);', 'cube.add(q);');
}
export function canonicalItemInteractions(source) {
  return source.replace('for (const r of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {', 'for (const r of [0, Math.PI / 2]) {')
    .replace('\n          q.position.set(Math.sin(r) * .91, 0, Math.cos(r) * .91);', '')
    .replace('cube.add(q);', 'g.add(q);');
}
/** Insert the generated IIFE without applying String.replace's $& substitutions. */
export function injectRaceBundle(html, bundleText) {
  if (typeof bundleText !== 'string' || typeof html !== 'string' || html.split('</body>').length !== 2)
    throw Error('Expected exactly one HTML body closing tag and a JavaScript bundle');
  const escaped = bundleText.replaceAll('</script', '<\\/script');
  return html.replace('</body>', () => '<script>' + escaped + '</script></body>');
}

/** Only neutral names / text textures: no claim that artwork and map shapes are licensed. */
export function neutralizeRaceBranding(text) {
  return text
    .replaceAll('SPEEDQQ.COM', 'RACEWAY.GAME')
    .replaceAll('QQ飞车', '双键赛车')
    .replaceAll('11城', '滨海都市')
    .replaceAll('情迷爱琴海', '海湾山路')
    .replaceAll('法老金字塔', '沙丘古城')
    .replaceAll('雪地大冒险', '雪岭环线')
    .replaceAll('小橘子', '闪电选手')
    .replaceAll('秋名山车神', '山路高手')
    // Replace the recognizable character-head mascot with the already authored generic balloon.
    .replaceAll("buildMascotBalloon(bcols[i % bcols.length])",
                "buildHotAirBalloon(i % 2 ? '#61c9ff' : '#ffc96c', '#ffffff')");
}
/** A qq-speed-only extension of PR10. No other game's source or adapter is written. */
export async function buildRacingMobile({ base = path.join(ROOT, 'runs'), sourceRoot = process.env.H5_PINNED_SOURCE_ROOT, hypothesis = process.env.RACE_REPAIR_HYPOTHESIS ?? 'Reuse native vehicle physics and edge inputs; gate two-button assists by track/state, and replace the stacked HUD with one mobile presentation.' } = {}) {
  const root = path.resolve(base, RUN);
  try { await access(path.join(root, 'source-build.json')); }
  catch { await buildSourceMobile(base, RUN, 'qq-speed', { sourceRoot }); }
  const { run, game } = await loadRun(base, RUN);
  if (run.theme !== 'qq-speed' || run.templateId !== 'h5-source-mobile-v1') throw Error('Wrong target racing run');
  const project = path.join(root, 'workspace/source/qq-speed');
  const owned = path.join(ROOT, 'templates/web-lite/h5-source-mobile-v1/racing');
  const ownedNames = ['driver.mjs', 'session.mjs', 'mobile.mjs', 'mobile.css', 'career.mjs', 'items.mjs', 'runtime.mjs'];
  const inputFiles = await Promise.all(ownedNames.map(name => readFile(path.join(owned, name), 'utf8')));
  const sharedDeps = await Promise.all(['fuel.mjs', 'themes.mjs'].map(name => readFile(path.join(ROOT, 'templates/web-lite/h5-source-mobile-v1', name), 'utf8')));
  const inputHash = sha256([...inputFiles, ...sharedDeps, await readFile(fileURLToPath(import.meta.url), 'utf8')].join('\n'));
  let previous;
  try { previous = JSON.parse(await readFile(path.join(root, 'artifacts/build-racing.json'), 'utf8')); } catch { /* Initial build. */ }
  if (previous?.inputHash === inputHash && previous.buildHash === await buildHash(game)) return { ...previous, reused: true };
  await mkdir(path.join(root, 'artifacts'), { recursive: true });
  let history;
  try { history = JSON.parse(await readFile(path.join(root, 'artifacts/repair-history.json'), 'utf8')); }
  catch { history = { schemaVersion: 1, route: 'formal-fixer', repairAttempt: 2, priorRepairAttempt: 2, attempts: [], replacementThreadId: process.env.CODEX_THREAD_ID ?? null }; }
  history.repairAttempt++;
  const attempt = history.repairAttempt;
  history.attempts.push({ attempt, inputHash, hypothesis, status: 'BUILDING' });
  await writeFile(path.join(root, 'artifacts/repair-history.json'), JSON.stringify(history, null, 2) + '\n');
  // This takes place in a generated worktree, never in the pinned upstream source.
  for (const name of ['maps.js', 'props.js', 'textures.js', 'ai.js', 'index.html']) {
    const original = await readFile(path.join(project, 'src', name), 'utf8');
    const neutral = neutralizeRaceBranding(original);
    if (neutral !== original) await writeFile(path.join(project, 'src', name), neutral);
  }
  const nativeVehiclePath = path.join(project, 'src/vehicle.js');
  const originalVehicle = await readFile(nativeVehiclePath, 'utf8');
  const annotatedVehicle = annotateDriftResult(originalVehicle);
  if (annotatedVehicle !== originalVehicle) await writeFile(nativeVehiclePath, annotatedVehicle);
  const canonicalVehicle = originalVehicle.replace(
    "this.emit('driftEnd', { time: this.driftTime, clean });",
    "this.emit('driftEnd', { time: this.driftTime });",
  );
  const nativeItemsPath = path.join(project, 'src/items.js');
  const nativeItems = await readFile(nativeItemsPath, 'utf8');
  const visibleItems = patchRacingItemVisuals(nativeItems);
  if (visibleItems !== nativeItems) await writeFile(nativeItemsPath, visibleItems);
  const beforeMain = await readFile(path.join(project, 'src/main.js'), 'utf8');
  await writeFile(path.join(project, 'src/main.js'), patchRacingSource(beforeMain));
  await writeFile(path.join(project, 'src/race-session.mjs'), inputFiles[1]);
  const { stdout } = await exec(process.execPath, ['build.mjs'], { cwd: project, timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
  const esbuild = await import(pathToFileURL(path.join(project, 'node_modules/esbuild/lib/main.js')).href);
  const bundle = await esbuild.build({ entryPoints: [path.join(owned, 'mobile.mjs')], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false, legalComments: 'inline' });
  let html = await readFile(path.join(project, 'dist/index.html'), 'utf8');
  html = html.replace('<html lang="zh-CN">', '<html lang="zh-CN" data-reference-game="qq-speed" data-race-mobile="true">')
    .replace('user-scalable=no', 'user-scalable=no,viewport-fit=cover')
    .replace(/<title>[^<]*<\/title>/u, '<title>双键飞驰 · 3D 赛车</title><link rel="icon" href="data:,">')
    .replace(/<meta name="description"[^>]*>/u, '<meta name="description" content="左右双键驾驶，原生赛车物理，漂移与加速自动触发。" />');
  const license = await readFile(path.join(game, 'LICENSE.three.txt'), 'utf8');
  if (license.length < 100) throw Error('Missing pinned Three.js license');
  html = html.replace('</head>', () => '<!-- Three.js MIT license\n' + license.replaceAll('--', '—') + '\n--><link rel="stylesheet" href="style.css"></head>');
  html = injectRaceBundle(html, bundle.outputFiles[0].text);
  await writeFile(path.join(game, 'index.html'), html);
  await writeFile(path.join(game, 'style.css'), inputFiles[3]);
  const hash = await buildHash(game);
  const standalone = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + inputFiles[3] + '</style>');
  const trialName = 'racing-two-button-' + hash.slice(0, 12) + '.html';
  await writeFile(path.join(root, trialName), standalone);
  const report = { schemaVersion: 1, runId: RUN, gameId: 'qq-speed', route: 'formal-fixer', attempt, inputHash, buildHash: hash, sourceRevision: '54adc1fb64155f9dd7c1c90ecae7b8185ac540b8', originalPhysicsSha256: sha256(canonicalVehicle), driftEventVehicleSha256: sha256(annotatedVehicle), originalAiSha256: sha256(await readFile(path.join(project, 'src/ai.js'))), originalItemInteractionsSha256: sha256(canonicalItemInteractions(visibleItems)), visibleItemSourceSha256: sha256(visibleItems), buildLog: stdout.trim(), runtimeEntrypoints: ['workspace/source/qq-speed/src/main.js (Three.js racing)', 'templates/web-lite/h5-source-mobile-v1/racing/mobile.mjs', 'templates/web-lite/h5-source-mobile-v1/racing/driver.mjs', 'templates/web-lite/h5-source-mobile-v1/racing/session.mjs', 'templates/web-lite/h5-source-mobile-v1/racing/career.mjs', 'templates/web-lite/h5-source-mobile-v1/racing/items.mjs', 'templates/web-lite/h5-source-mobile-v1/racing/runtime.mjs', 'templates/web-lite/h5-source-mobile-v1/fuel.mjs', 'templates/web-lite/h5-source-mobile-v1/racing/mobile.css'], compatibilityOnly: ['workspace/game/main.mjs', 'workspace/game/engine.mjs', 'workspace/game/themes.mjs (PR10 copies; absent from the new default HTML entry)'], trialName, trialSha256: sha256(standalone), builtAt: new Date().toISOString(), publishable: false };
  history.attempts.at(-1).status = 'AWAITING_PLAYWRIGHT_QA';
  history.attempts.at(-1).buildHash = hash;
  await writeFile(path.join(root, 'artifacts/repair-history.json'), JSON.stringify(history, null, 2) + '\n');
  await writeFile(path.join(root, 'artifacts/build-racing.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  buildRacingMobile().then(report => console.log(JSON.stringify(report, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
}
