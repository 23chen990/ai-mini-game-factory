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
export const RACING_OWNED_NAMES = Object.freeze(['driver.mjs', 'session.mjs', 'mobile.mjs', 'mobile.css', 'career.mjs', 'items.mjs', 'runtime.mjs', 'recovery.mjs', 'road-coach.mjs', 'rival-pressure.mjs', 'corner-speed.mjs', 'speed-hud.mjs', 'corner-signs.mjs', 'presentation.mjs', 'track-design.mjs', 'lane-design.mjs', 'item-visuals.mjs', 'shortcut-network.mjs', 'joystick.mjs', 'trial-metrics.mjs', 'duel-loop.mjs']);

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
  // The native engine owns Three.js. Share its already loaded namespace with
  // the tiny mobile sign adapter rather than bundling a SECOND Three.js copy.
  const threeAnchor = "import * as THREE from 'three';";
  const sharedThree = 'window.__RACE_THREE__ = THREE;';
  if (!output.includes(sharedThree)) {
    if (output.split(threeAnchor).length !== 2) throw Error('Native Three.js entry anchor changed');
    output = output.replace(threeAnchor, () => threeAnchor + '\n' + sharedThree);
  }
  return output;
}

/** Pin a course identity to the ACTUAL Track created by the native scene.
 * Do not change physics, lap math or race outcomes. Unknown stage IDs must
 * fail closed instead of silently replaying one of the old four tracks.
 */
export function patchCareerRouteSource(source) {
  const original = 'const track = new Track(LAYOUTS[map.layout], { isBridge: map.isBridge });';
  const marker = 'track.__RACE_COURSE_ID = requestedCourse;';
  if (source.includes(marker)) return source;
  if (source.split(original).length !== 2) throw Error('Pinned native Track constructor changed');
  const updated = [
    'const requestedCourse = this.settings.course || map.layout;',
    'if (!Object.prototype.hasOwnProperty.call(LAYOUTS, requestedCourse))',
    "  throw Error('Unknown career course: ' + requestedCourse);",
    'const track = new Track(LAYOUTS[requestedCourse], { isBridge: map.isBridge });',
    marker,
  ].join('\n    ');
  return source.replace(original, updated);
}


/** Strict adapter for native Road/Player world; only the generated copy changes.
 * The native PlayerCar retains its steering, acceleration, AI and checkpoint
 * algorithms. Collision uses the actual width of the chosen physical branch.
 */
export function patchShortcutNativeTrack(source) {
  const marker='this.__RACE_SHORTCUT__?.opening((r + .5) * this.ds, side)';
  if(source.includes(marker))return source;
  const anchor='const a = startW + r * 3, b = a + 3;';
  if(source.split(anchor).length!==2 || !source.includes('export class Track'))
    throw Error('Pinned native guardrail construction changed');
  return source.replace(anchor, anchor+'\n          if ('+marker+') continue;');
}
export function patchShortcutNativeCar(source) {
  const expected='const lim = tr.halfW - 1.1;';
  const changed='const lim = (p.__RACE_SHORTCUT_ACTIVE ? p.__RACE_SHORTCUT_HALF_WIDTH : tr.halfW) - 1.1;';
  if(source.includes(changed))return source;
  if(source.split(expected).length!==2 || !source.includes('export class PlayerCar'))
    throw Error('Pinned native collision-width anchor changed');
  return source.replace(expected,changed);
}
export function patchShortcutNativeWorld(source) {
  const imported="import { installPhysicalShortcut } from './race-shortcut-network.mjs';";
  const marker='installPhysicalShortcut(track, requestedCourse);';
  const themeImport="import { createRaceTrackTheme, buildRaceLandmarks } from './race-track-design.mjs';";
  const themeCall='createRaceTrackTheme(map.track,track,requestedCourse)';
  const landmarkCall='root.add(buildRaceLandmarks(THREE, track, requestedCourse));';
  if(source.includes(imported) && source.includes(marker) &&
     source.includes(themeImport) && source.includes(themeCall) && source.includes(landmarkCall))return source;
  if(source.includes(imported) || source.includes(marker) ||
     source.includes(themeImport) || source.includes(themeCall) || source.includes(landmarkCall))
     throw Error('Partial shortcut/course-theme world adapter');
  const anchors=[
    'track.__RACE_COURSE_ID = requestedCourse;',
    'const ground = buildGround(track, { base:',
    'root.add(track.build(map.track, ground.heightAt));',
    'this.hud.setupMinimap(track);',
    "  resetPlayer() {\n    const P = this.player;",
  ];
  for(const a of anchors)if(source.split(a).length!==2)
    throw Error('Pinned native shortcut world anchor changed: '+a.slice(0,35));
  return imported+'\n'+themeImport+'\n'+source
    .replace(anchors[0], anchors[0]+'\n    '+marker)
    .replace(anchors[1], 'const ground = buildGround(track.__RACE_SHORTCUT__?.terrainProxy(track) || track, { base:')
    .replace(anchors[2], 'root.add(track.build('+themeCall+', ground.heightAt));'+'\n    '+landmarkCall+'\n    if (track.__RACE_SHORTCUT__) root.add(track.__RACE_SHORTCUT__.buildMesh(THREE, ground.heightAt));')
    .replace(anchors[3], anchors[3]+'\n    track.__RACE_SHORTCUT__?.drawMinimap(this.hud);')
    .replace(anchors[4], "  resetPlayer() {\n    const P = this.player;\n    if (this.track?.__RACE_SHORTCUT__?.recover(P)) return;");
}


/** Only light, fog and roadside prop placement change with the course ID.
 * PlayerCar physics, map collision, track progression and AI are untouched.
 */
export function patchCourseSkyAndScenery(source) {
  const imported="import { createRaceSky } from './race-track-design.mjs';";
  const marker='const courseSky = createRaceSky(map.sky,requestedCourse);';
  if(source.includes(imported)&&source.includes(marker))return source;
  if(source.includes(imported)||source.includes(marker))
    throw Error('Partial stage scenery transformation');
  const mutations=[
    ['const rnd = mulberry32(id.length * 997 + 13);',
      "const stageSeed = Number(this.settings.course?.slice(5)) || 0;\n    const rnd = mulberry32(id.length * 997 + 13 + stageSeed * 9176);"],
    ['const { sky, sunDir } = buildSky(map.sky);',
      marker+'\n    const { sky, sunDir } = buildSky(courseSky);'],
    ['this.scene.fog = new THREE.Fog(map.fog[0], map.fog[1], map.fog[2]);',
      'this.scene.fog = new THREE.Fog(courseSky.horizon, map.fog[1], map.fog[2]);'],
    ['this.scene.background = new THREE.Color(map.sky.horizon);',
      'this.scene.background = new THREE.Color(courseSky.horizon);'],
  ];
  for(const [from] of mutations)
    if(source.split(from).length!==2)throw Error('Pinned course-light anchor drifted: '+from);
  let result=imported+'\n'+source;
  for(const [from,to] of mutations)result=result.replace(from,to);
  return result;
}

/** Only the procedural DESERT ground away from the road gets stronger dune relief.
 * The pinned buildGround function independently carves a safe corridor around
 * the track; no road, car, AI or collisions are patched by this transform.
 */
export function patchRaceDesertRelief(source) {
  const original = 'let h = 2 + noise.fbm(x * 0.0045, z * 0.0045, 4) * 18 + Math.max(0, Math.hypot(x - cx, z - cz) - 900) * 0.1;';
  const revised = 'let h = 2 + noise.fbm(x * 0.0045, z * 0.0045, 4) * 26 + Math.max(0, Math.hypot(x - cx, z - cz) - 900) * 0.1;';
  if (source.includes(revised)) return source;
  if (typeof source !== 'string' || source.split(original).length !== 2)
    throw Error('Pinned desert relief anchor changed; refusing unsafe terrain patch');
  return source.replace(original, revised);
}

/** Event-only instrumentation; do not alter car dynamics from licensed original. */
export function annotateDriftResult(source) {
  const original = "this.emit('driftEnd', { time: this.driftTime });";
  const annotated = "this.emit('driftEnd', { time: this.driftTime, clean });";
  if (source.includes(annotated)) return source;
  if (source.split(original).length !== 2) throw Error('Native driftEnd event anchor changed');
  return source.replace(original, annotated);
}
/** Add continuous steering and normalized drift starts to generated native car. */
export function patchAnalogSteer(source) {
  const changes = [
    ["const steerT = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);",
     "const steerT = Number.isFinite(inp.steerAxis) ? Math.max(-1, Math.min(1, inp.steerAxis)) : (inp.left ? 1 : 0) - (inp.right ? 1 : 0);"],
    ["if (!this.drifting && inp.shift && steerT !== 0 && this.s > T.driftMinSpeed && onGround && !spinning) {",
     "if (!inp.shift && !spinning) this.__RACE_DRIFT_REARMED__ = true;\n    if (!this.drifting && inp.shift && this.__RACE_DRIFT_REARMED__ !== false && Math.abs(steerT) >= 0.28 && this.s > T.driftMinSpeed && onGround && !spinning) {"],
    ["this.driftDir = steerT;", "this.driftDir = Math.sign(steerT);"],
  ];
  const already = changes.map(([, target]) => source.includes(target));
  if (already.every(Boolean)) return source;
  if (already.some(Boolean)) throw Error('Partially applied analog steering patch');
  for (const [original] of changes) if (source.split(original).length !== 2) throw Error('Native analog steering anchor changed');
  let result = source;
  for (const [original, revised] of changes) result = result.replace(original, revised);
  return result;
}

/** A drift cannot immediately re-trigger on the same still-held drift key.
 * Both graceful exit and wall impact pass through the native endDrift method.
 * Re-arm only when the player has actually released the drift key. */
export function patchDriftRearm(source) {
  const original = "endDrift(clean = true) {\n    if (!this.drifting) return;\n    this.drifting = false;";
  const updated = original + "\n    this.__RACE_DRIFT_REARMED__ = false;";
  if (source.includes(updated)) return source;
  if (source.split(original).length !== 2) throw Error('Native drift rearm anchor changed');
  return source.replace(original, updated);
}

/** Countersteer follows actual opposite stick input; centring ends active yaw.
 * Generated native source only. Fail on unrecognized physical vehicle code. */
export function patchCounterSteer(source) {
  const originalYaw = "const yaw = held ? T.driftYaw + T.driftYawAlign * align : (0.45 + 0.9 * align) * Math.exp(-2.2 * this.releaseTime);";
  const previousYaw = "const yaw = held ? (align < 0 ? -T.driftYawAlign * 1.35 : T.driftYaw + T.driftYawAlign * align) : (align < 0 ? -1.35 : 0.45 + 0.9 * align) * Math.exp(-2.2 * this.releaseTime);";
  const modernYaw = "const yaw = held ? (align < -0.08 ? -T.driftYawAlign * 1.45 * Math.min(1, -align) : T.driftYaw * Math.max(0, align) + T.driftYawAlign * align) : (align < -0.08 ? -1.25 * Math.min(1, -align) : 0.45 + 0.9 * align) * Math.exp(-2.2 * this.releaseTime);";
  const originalHeld = 'const held = inp.shift;';
  const modernHeld = 'const held = inp.shift && Math.abs(steerT) > 0.12;';
  const originalEnd = 'if ((!held && (Math.abs(a) < 0.1 || (align < 0 && Math.abs(a) < 0.26))) || this.s < 7) this.endDrift(this.s >= 7);';
  const modernEnd = 'if ((!held && (Math.abs(a) < 0.1 || (align < 0 && Math.abs(a) < 0.26))) || (align < -0.35 && Math.abs(a) < 0.16 && this.driftTime >= 0.22) || this.s < 7) this.endDrift(this.s >= 7);';
  if (source.includes(modernYaw) && source.includes(modernHeld) && source.includes(modernEnd)) return source;
  if (![originalHeld, originalEnd].every(a => source.split(a).length === 2) ||
      !(source.split(originalYaw).length === 2 || source.split(previousYaw).length === 2) ||
      !source.includes('this.driftDir * yaw')) throw Error('Countersteer vehicle anchor changed');
  return source.replace(source.includes(originalYaw) ? originalYaw : previousYaw, modernYaw)
    .replace(originalHeld, modernHeld).replace(originalEnd, modernEnd);
}
/** New one-shot touch edge must never repeat inside the 120Hz native step loop. */
export function patchManualNitroEdge(source) {
  const original = "const noEdge = { ...pin, upPressed: false, wPressed: false, nitroPressed: false };";
  const revised = "const noEdge = { ...pin, upPressed: false, wPressed: false, nitroPressed: false, manualNitroPressed: false };";
  if (source.includes(revised)) return source;
  if (source.split(original).length !== 2) throw Error('Native manual nitro edge anchor changed');
  return source.replace(original,revised);
}
/** Separate earned drift nitro from native item-box use; both require real stock. */
export function patchItemModeNitro(source) {
  const original = "if (inp.nitroPressed && !itemMode) this.triggerNitro();";
  const revised = "if (inp.nitroPressed && !itemMode || inp.manualNitroPressed && itemMode) this.triggerNitro();";
  const gaugeOriginal = "if (!itemMode && onGround) {";
  const gaugeRevised = "if (onGround) {";
  if (source.includes(revised) && !source.includes(gaugeOriginal)) return source;
  if (source.split(original).length !== 2 || source.split(gaugeOriginal).length !== 2) throw Error('Native nitro/item mode anchor changed');
  return source.replace(original,revised).replace(gaugeOriginal,gaugeRevised);
}
/** Strict, idempotent extensions to the GENERATED copy only, never the pinned source. */
export function patchRaceLayouts(source) {
  const imported = "import { applyTrackDesign } from './race-track-design.mjs';";
  const invoke = "applyTrackDesign(LAYOUTS);";
  if (source.includes(imported) && source.includes(invoke)) return source;
  if (!source.includes('export const LAYOUTS = {')) throw Error('Pinned track layout export changed');
  if (source.includes(imported) || source.includes(invoke)) throw Error('Partial track patch');
  return imported+'\n'+source+'\n'+invoke+'\n';
}
export function patchRaceMaps(source) {
  const imported = "import { applyLaneDesign } from './race-lane-design.mjs';";
  const invoke = 'applyLaneDesign(MAPS);';
  if (source.includes(imported) && source.includes(invoke)) return source;
  if (!source.includes('export const MAPS = [')) throw Error('Pinned native MAPS export changed');
  if (source.includes(imported) || source.includes(invoke)) throw Error('Partial lane patch');
  return imported+'\n'+source+'\n'+invoke+'\n';
}
export function patchRaceItems(source) {
  const imported = "import { upgradeItemBoxes } from './race-item-visuals.mjs';";
  const hook = "this.applyMobileVisuals = () => upgradeItemBoxes(this, THREE);";
  if (source.includes(imported) && source.includes(hook)) return source;
  if (source.includes(imported) || source.includes(hook)) throw Error('Partial item visual patch');
  const anchor = "  }\n\n  reset() {";
  if (source.split(anchor).length !== 2 || !source.includes('export class ItemSystem'))
    throw Error('Pinned item constructor changed; cannot attach safe visual patch');
  return imported+'\n'+source.replace(anchor, "    "+hook+"\n"+anchor);
}


/** The pinned desert scenery includes six fixed gigantic pyramids, which
 * were clear of the ORIGINAL route but overlap newly authored stages 05/14.
 * Prevent those visual sculptures from intersecting a real drivable road.
 * No physical vehicle collision or race progress rules are changed.
 */
export function patchFixedDesertLandmarks(source) {
  const original='for (const [x, z, h] of pyramids) {';
  const guard='if (!isFree(track, x, z, h * .58 + 10)) continue;';
  if(source.includes(guard))return source;
  if(source.split(original).length!==2 || !source.includes('function egyptProps(ctx)'))
    throw Error('Pinned Egyptian landmark placement changed');
  return source.replace(original,original+'\n    '+guard);
}

/** Insert the generated IIFE without replacement-string token expansion. */
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
    .replaceAll('QQ飞车', '极速赛车')
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
export async function buildRacingMobile({ base = path.join(ROOT, 'runs'), sourceRoot = process.env.H5_PINNED_SOURCE_ROOT, hypothesis = process.env.RACE_REPAIR_HYPOTHESIS ?? 'One manual analogue steering control with explicit drift, spray, nitro, and item actions; preserve native vehicle physics and race semantics.' } = {}) {
  const root = path.resolve(base, RUN);
  try { await access(path.join(root, 'source-build.json')); }
  catch { await buildSourceMobile(base, RUN, 'qq-speed', { sourceRoot }); }
  const { run, game } = await loadRun(base, RUN);
  if (run.theme !== 'qq-speed' || run.templateId !== 'h5-source-mobile-v1') throw Error('Wrong target racing run');
  const project = path.join(root, 'workspace/source/qq-speed');
  const owned = path.join(ROOT, 'templates/web-lite/h5-source-mobile-v1/racing');
  const ownedNames = RACING_OWNED_NAMES;
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
  // Distinct new desert roads may intersect giant fixed pyramid sculptures.
  const nativePropsPath = path.join(project, 'src/props.js');
  await writeFile(nativePropsPath,
    patchFixedDesertLandmarks(await readFile(nativePropsPath,'utf8')));
  // Keep the original four bridges/tunnels and all the native physics/checkpoints/AI.
  for (const [nativeName, adapterName, ownedName, transform] of [
    ['layouts.js', 'race-track-design.mjs', 'track-design.mjs', patchRaceLayouts],
    ['maps.js', 'race-lane-design.mjs', 'lane-design.mjs', patchRaceMaps],
    ['items.js', 'race-item-visuals.mjs', 'item-visuals.mjs', patchRaceItems],
  ]) {
    const nativePath = path.join(project, 'src', nativeName);
    await writeFile(nativePath, transform(await readFile(nativePath, 'utf8')));
    await writeFile(path.join(project, 'src', adapterName),
      await readFile(path.join(owned, ownedName), 'utf8'));
  }
  const nativeVehiclePath = path.join(project, 'src/vehicle.js');
  const originalVehicle = await readFile(nativeVehiclePath, 'utf8');
  const annotatedVehicle = patchItemModeNitro(patchCounterSteer(patchAnalogSteer(patchDriftRearm(patchShortcutNativeCar(annotateDriftResult(originalVehicle))))));
  if (annotatedVehicle !== originalVehicle) await writeFile(nativeVehiclePath, annotatedVehicle);
  const nativeTrackPath = path.join(project, 'src/track.js');
  const originalTrack = await readFile(nativeTrackPath, 'utf8');
  const adaptedTrack = patchShortcutNativeTrack(originalTrack);
  if (adaptedTrack !== originalTrack) await writeFile(nativeTrackPath, adaptedTrack);
  await writeFile(path.join(project, 'src/race-shortcut-network.mjs'),
    await readFile(path.join(owned, 'shortcut-network.mjs'), 'utf8'));
  const canonicalVehicle = originalVehicle.replace(
    "this.emit('driftEnd', { time: this.driftTime, clean });",
    "this.emit('driftEnd', { time: this.driftTime });",
  );
  const beforeMain = await readFile(path.join(project, 'src/main.js'), 'utf8');
  await writeFile(path.join(project, 'src/main.js'), patchRaceDesertRelief(patchCourseSkyAndScenery(patchShortcutNativeWorld(patchCareerRouteSource(patchManualNitroEdge(patchRacingSource(beforeMain)))))));
  await writeFile(path.join(project, 'src/race-session.mjs'), inputFiles[1]);
  const { stdout } = await exec(process.execPath, ['build.mjs'], { cwd: project, timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
  const esbuild = await import(pathToFileURL(path.join(project, 'node_modules/esbuild/lib/main.js')).href);
  const bundle = await esbuild.build({ entryPoints: [path.join(owned, 'mobile.mjs')], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false, legalComments: 'inline' });
  let html = await readFile(path.join(project, 'dist/index.html'), 'utf8');
  html = html.replace('<html lang="zh-CN">', '<html lang="zh-CN" data-reference-game="qq-speed" data-race-mobile="true">')
    .replace('user-scalable=no', 'user-scalable=no,viewport-fit=cover')
    .replace(/<title>[^<]*<\/title>/u, '<title>极速飞驰 · 3D 赛车</title><link rel="icon" href="data:,">')
    .replace(/<meta name="description"[^>]*>/u, '<meta name="description" content="左手连续方向轮盘，右手手动漂移、小喷、氮气和道具。" />');
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
  const report = { schemaVersion: 1, runId: RUN, gameId: 'qq-speed', route: 'formal-fixer', attempt, inputHash, buildHash: hash, sourceRevision: '54adc1fb64155f9dd7c1c90ecae7b8185ac540b8', originalPhysicsSha256: sha256(canonicalVehicle), driftEventVehicleSha256: sha256(annotatedVehicle), originalAiSha256: sha256(await readFile(path.join(project, 'src/ai.js'))), generatedVehicleSha256: sha256(annotatedVehicle), generatedTrackSha256: sha256(adaptedTrack), genuinePhysicalShortcutStages: ['05','10','12','13','16'], trackGeometrySha256: sha256(await readFile(path.join(project, 'src/layouts.js'))), itemVisualSourceSha256: sha256(await readFile(path.join(project, 'src/items.js'))), buildLog: stdout.trim(), runtimeEntrypoints: ['workspace/source/qq-speed/src/main.js (Three.js racing)', 'templates/web-lite/h5-source-mobile-v1/racing/mobile.mjs', 'templates/web-lite/h5-source-mobile-v1/racing/driver.mjs', 'templates/web-lite/h5-source-mobile-v1/racing/joystick.mjs', 'templates/web-lite/h5-source-mobile-v1/racing/session.mjs', 'templates/web-lite/h5-source-mobile-v1/racing/career.mjs', 'templates/web-lite/h5-source-mobile-v1/racing/items.mjs', 'templates/web-lite/h5-source-mobile-v1/racing/runtime.mjs', 'templates/web-lite/h5-source-mobile-v1/racing/recovery.mjs', 'templates/web-lite/h5-source-mobile-v1/racing/road-coach.mjs', 'templates/web-lite/h5-source-mobile-v1/racing/corner-speed.mjs', 'templates/web-lite/h5-source-mobile-v1/racing/speed-hud.mjs', 'templates/web-lite/h5-source-mobile-v1/racing/corner-signs.mjs', 'templates/web-lite/h5-source-mobile-v1/racing/track-design.mjs', 'templates/web-lite/h5-source-mobile-v1/racing/lane-design.mjs', 'templates/web-lite/h5-source-mobile-v1/racing/item-visuals.mjs', 'templates/web-lite/h5-source-mobile-v1/racing/shortcut-network.mjs', 'templates/web-lite/h5-source-mobile-v1/fuel.mjs', 'templates/web-lite/h5-source-mobile-v1/racing/mobile.css'], compatibilityOnly: ['workspace/game/main.mjs', 'workspace/game/engine.mjs', 'workspace/game/themes.mjs (PR10 copies; absent from the new default HTML entry)'], trialName, trialSha256: sha256(standalone), builtAt: new Date().toISOString(), publishable: false };
  history.attempts.at(-1).status = 'AWAITING_PLAYWRIGHT_QA';
  history.attempts.at(-1).buildHash = hash;
  await writeFile(path.join(root, 'artifacts/repair-history.json'), JSON.stringify(history, null, 2) + '\n');
  await writeFile(path.join(root, 'artifacts/build-racing.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  buildRacingMobile().then(report => console.log(JSON.stringify(report, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
}
