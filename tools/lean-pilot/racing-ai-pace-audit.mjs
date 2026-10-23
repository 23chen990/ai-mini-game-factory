/* global process, console */
// Fixed-seed native V11 driving, not human QA, a win-rate estimate or a
// comparison with the historical on-rail AI. No post-start recovery writes.
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildHash } from './runner.mjs';
import { STAGES } from '../../templates/web-lite/h5-source-mobile-v1/racing/career.mjs';
import { RacingCareer } from '../../templates/web-lite/h5-source-mobile-v1/racing/runtime.mjs';

const RUN = 'h5-qq-mobile-20261013';
const HZ = 120;
const DT = 1 / HZ;
// Keep the former audit's observation limit. A DNF stays a failed record;
// do not extend this limit or relax a threshold to obtain a passing result.
const MAX_SECONDS = 350;
const SEED = 2026101800;
const GRID_SLOTS = Object.freeze([0, 1, 2, 4, 5]);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const rounded = (number, places = 3) => Number.isFinite(number) ? +number.toFixed(places) : null;
const raceFraction = stage => stage.id === '07' ? .82 : stage.id === '22' ? .84 : 1;

function methodSource(source, name) {
  const matches = [...source.matchAll(new RegExp('^  ' + name + '\\([^\\n]*\\) \\{\\r?$', 'gmu'))];
  if (matches.length !== 1) throw Error('Unknown native World method: ' + name);
  const start = matches[0].index;
  const end = source.indexOf('\n  }', start);
  if (end < 0) throw Error('Unterminated native World method: ' + name);
  return source.slice(start, end + 4);
}

/** Read the actual generated methods unchanged. An obsolete build must fail,
 * never receive a replacement lap implementation inside the audit. */
export function nativeWorldMethods(source) {
  const names = ['updateProgress', 'onLap', 'collide', 'vel', 'pushRacer', 'kick'];
  const methods = Object.fromEntries(names.map(name => [name, methodSource(source, name)]));
  for (const name of ['updateProgress', 'vel', 'pushRacer', 'kick']) {
    if (!methods[name].includes('r.isPlayer || r.__V11_PHYSICAL_AI__'))
      throw Error('Native World lacks physical rival accounting: ' + name);
  }
  if (!methods.updateProgress.includes("this.settings.course === 'race-07' ? .82") ||
      !methods.updateProgress.includes("this.settings.course === 'race-22' ? .84"))
    throw Error('Native World fractional finish rules differ from the audited 07/22 contract');
  return runInNewContext('({' + Object.values(methods).join(',\n') + '})', {},
    { filename: 'generated-native-world-audit.mjs', timeout: 1000 });
}

// Track.build creates the physics pad records alongside meshes. Execute that
// exact generated block with rendering-only stubs, keeping d/lat/len/halfW and
// every native pad effect. No canvas, synthetic pad or speed grant is needed.
function nativePadInstaller(source) {
  const marker = '    this.boostPads = [];';
  const start = source.indexOf(marker), end = source.indexOf('\n    // 隧道', start);
  if (source.split(marker).length !== 2 || end < start ||
      !source.slice(start, end).includes('this.boostPads.push({ d, lat: bp.lat || 0, len: 11, halfW: 2.8, mat });'))
    throw Error('Unknown native Track boost-pad setup');
  const install = runInNewContext('(function(theme) { const group = { add() {} };\n' +
    source.slice(start, end) + '\nreturn this.boostPads; })', {
    THREE: { MeshBasicMaterial: class {}, Color: class {} }, boostPadTexture: () => null,
  }, { filename: 'generated-native-track-pads.mjs', timeout: 1000 });
  return (track, theme) => {
    const headless = Object.create(track);
    headless.roadDecal = () => null;
    track.boostPads = install.call(headless, theme);
  };
}

const metricState = () => ({
  frames: 0, speedTotal: 0, topSpeed: 0, distance: 0, maxStep: 0, maxImpact: 0,
  wallCrashEvents: 0, wallScrapeFrames: 0, trafficSeparations: 0, trafficImpulses: 0,
  trafficContactFrames: 0, trafficContactEpisodes: 0, trafficStrongImpulses: 0,
  maxTrafficImpulse: 0, contact: false, previousContact: false,
  nitros: 0, pads: 0, smallBoosts: 0, landBoosts: 0, driftStarts: 0,
  airborneFrames: 0, reverseFrames: 0, slowFrames: 0,
  shortcutEntries: 0, shortcutExits: 0, onShortcut: false, lapEvents: [], snapshot: null,
});

function captureRacer(car, metric, world, failure = null) {
  return {
    slot: car.slot, skill: car.skill, finished: car.finished === true,
    finishTimeSec: car.finished ? rounded(car.finishTime) : null,
    observedSeconds: rounded(world.raceTime), failure,
    lapsDone: car.lapsDone, lapTimesSec: Array.from(car.lapTimes, value => rounded(value)),
    lapEvents: metric.lapEvents, projectedFinishD: rounded(car.d, 6),
    progressM: rounded(car.progress), distanceTravelledM: rounded(metric.distance),
    averageSpeedKmh: rounded(metric.frames ? metric.speedTotal / metric.frames * 3.6 : 0, 2),
    topSpeedKmh: rounded(metric.topSpeed * 3.6, 2), maxNativeStepM: rounded(metric.maxStep, 6),
    maxWallImpact: rounded(metric.maxImpact), wallCrashEvents: metric.wallCrashEvents,
    wallScrapeFrames: metric.wallScrapeFrames, trafficSeparations: metric.trafficSeparations,
    trafficImpulseEvents: metric.trafficImpulses, trafficContactFrames: metric.trafficContactFrames,
    trafficContactEpisodes: metric.trafficContactEpisodes, trafficImpulsesAbove3Mps: metric.trafficStrongImpulses,
    maxTrafficImpulseMps: rounded(metric.maxTrafficImpulse), nitroEvents: metric.nitros,
    padEvents: metric.pads, smallBoostEvents: metric.smallBoosts, landBoostEvents: metric.landBoosts,
    driftStarts: metric.driftStarts, airborneSeconds: rounded(metric.airborneFrames * DT),
    reverseSeconds: rounded(metric.reverseFrames * DT), belowOneMpsSeconds: rounded(metric.slowFrames * DT),
    shortcutEntries: metric.shortcutEntries, shortcutExits: metric.shortcutExits,
  };
}

/** Only native updates/collisions and the extracted native progress methods
 * move cars or set their laps. The wrappers observe the real calls. */
export function simulateNativeRace({ stage, track, racers, world }, { maxSeconds = MAX_SECONDS } = {}) {
  const metrics = new Map(racers.map(car => [car, metricState()]));
  const nativeLap = world.onLap, nativePush = world.pushRacer, nativeKick = world.kick;
  world.onLap = function(car) {
    const metric = metrics.get(car);
    if (metric && !metric.snapshot) metric.lapEvents.push({
      timeSec: rounded(this.raceTime), lapsDone: car.lapsDone, projectedD: rounded(car.d),
    });
    return nativeLap.call(this, car);
  };
  world.pushRacer = function(car, x, z) {
    const metric = metrics.get(car);
    if (metric && !metric.snapshot) { metric.trafficSeparations++; metric.contact = true; }
    return nativePush.call(this, car, x, z);
  };
  world.kick = function(car, x, z) {
    const metric = metrics.get(car);
    if (metric && !metric.snapshot) {
      metric.trafficImpulses++;
      const impulse = Math.hypot(x, z);
      metric.maxTrafficImpulse = Math.max(metric.maxTrafficImpulse, impulse);
      // The native collide method uses >3 m/s for its player crash effect.
      // This is a reported magnitude category, never a pass/fail threshold.
      if (impulse > 3) metric.trafficStrongImpulses++;
    }
    return nativeKick.call(this, car, x, z);
  };
  let invalid = false;
  try {
    for (let frame = 0; frame < Math.floor(maxSeconds * HZ); frame++) {
      world.raceTime = (frame + 1) * DT;
      const before = racers.map(car => ({ x: car.x, z: car.z }));
      for (const car of racers) {
        metrics.get(car).contact = false;
        // Exactly the generated World loop at a 120 Hz presentation cadence.
        // Finished rivals continue native driving until the field is done.
        car.update(DT, true, world.raceTime, 1);
      }
      world.collide();
      for (const [index, car] of racers.entries()) {
        world.updateProgress(car);
        const metric = metrics.get(car);
        if (metric.snapshot) continue;
        if (![car.x, car.y, car.z, car.h, car.m, car.s, car.d, car.progress].every(Number.isFinite) ||
            !Number.isInteger(car.lapsDone)) {
          metric.snapshot = captureRacer(car, metric, world, 'NONFINITE_NATIVE_STATE');
          invalid = true;
          continue;
        }
        const step = Math.hypot(car.x - before[index].x, car.z - before[index].z);
        metric.frames++; metric.speedTotal += Math.abs(car.s);
        metric.topSpeed = Math.max(metric.topSpeed, Math.abs(car.s));
        metric.distance += step; metric.maxStep = Math.max(metric.maxStep, step);
        metric.maxImpact = Math.max(metric.maxImpact, car.impact ?? 0);
        if (metric.contact) {
          metric.trafficContactFrames++;
          if (!metric.previousContact) metric.trafficContactEpisodes++;
        }
        metric.previousContact = metric.contact;
        if (car.airborne) metric.airborneFrames++;
        if (car.s < 0) metric.reverseFrames++;
        if (Math.abs(car.s) < 1) metric.slowFrames++;
        for (const event of car.events) {
          const key = { crash: 'wallCrashEvents', scrape: 'wallScrapeFrames', nitro: 'nitros',
            pad: 'pads', smallBoost: 'smallBoosts', landBoost: 'landBoosts', driftStart: 'driftStarts' }[event.type];
          if (key) metric[key]++;
        }
        const onShortcut = car.proj?.__RACE_SHORTCUT_ACTIVE === true;
        if (onShortcut && !metric.onShortcut) metric.shortcutEntries++;
        if (!onShortcut && metric.onShortcut) metric.shortcutExits++;
        metric.onShortcut = onShortcut;
        if (car.finished) metric.snapshot = captureRacer(car, metric, world);
      }
      if (invalid || racers.every(car => car.finished)) break;
    }
  } finally {
    world.onLap = nativeLap; world.pushRacer = nativePush; world.kick = nativeKick;
  }
  const results = racers.map(car => metrics.get(car).snapshot ?? captureRacer(car, metrics.get(car), world,
    invalid ? 'RACE_ABORTED_INVALID_NATIVE_STATE' : 'OBSERVATION_LIMIT'));
  const fraction = raceFraction(stage);
  const finished = results.filter(racer => racer.finished && !racer.failure);
  const validFinish = racer => racer.lapEvents.length >= stage.laps &&
    (fraction === 1 || racer.projectedFinishD >= track.length * fraction - .000001);
  const pass = finished.length === racers.length && results.every(validFinish);
  return {
    id: stage.id, course: stage.course, laps: stage.laps, raceFraction: fraction,
    nativeLapLengthM: rounded(track.length), targetProgressM: rounded(track.length * (fraction < 1 ? fraction : stage.laps)),
    status: pass ? 'PASS' : 'FAIL', observedSeconds: rounded(world.raceTime),
    finishedRacers: finished.length, racerCount: racers.length, racers: results,
  };
}

/** Fixed-seed third-place AI pace relative to the archived V11.6 physical
 * opponents on the SAME thirty road lengths. This is NOT a player win-rate
 * estimate; it prevents graphics/UX work from silently slowing the rivals. */
export function compareFixedSeedOpponentPace(cases, baselineCases, maxSlowdownSeconds = 1) {
  if (!Array.isArray(cases) || !Array.isArray(baselineCases) ||
      !Number.isFinite(maxSlowdownSeconds) || maxSlowdownSeconds < 0)
    throw Error('Invalid fixed-seed rival comparison');
  const lookup = new Map(baselineCases.map(row => [row.id, row]));
  if (lookup.size !== 30 || baselineCases.length !== 30)
    throw Error('Archived native-AI pace reference must contain exactly thirty stages');
  const checks = cases.map(now => {
    const before = lookup.get(now.id);
    if (!before || Math.abs(before.targetProgressM - now.targetProgressM) > 0.5)
      throw Error('AI reference geometry differs on ' + now.id + '; rebaseline only with reviewed physical geometry');
    const podium = row => row.racers.filter(car => car.finished && car.failure === null)
      .map(car => car.finishTimeSec).sort((a, b) => a - b)[2];
    const previous = podium(before), current = podium(now);
    const valid = Number.isFinite(previous) && Number.isFinite(current);
    const deltaSec = valid ? Math.round((current - previous) * 1000) / 1000 : null;
    return { stage: now.id, baselinePodiumSeconds: previous ?? null,
      currentPodiumSeconds: current ?? null, deltaSec,
      withinBudget: valid && deltaSec <= maxSlowdownSeconds };
  });
  return { baseline: 'V11.6 archived physical-AI engineering only',
    maxSlowdownSeconds, checkedStages: checks.length,
    status: checks.every(row => row.withinBudget) ? 'PASS' : 'FAIL',
    failedStages: checks.filter(row => !row.withinBudget).map(row => row.stage),
    cases: checks };
}

export function auditStatus(cases) {
  const ids = new Set(cases.map(entry => entry.id));
  const completeCoverage = ids.size === 30 && cases.length === 30 &&
    STAGES.every(stage => ids.has(stage.id));
  const failed = cases.filter(entry => entry.status !== 'PASS').map(entry => entry.id);
  return { status: failed.length ? 'FAIL' : completeCoverage ? 'PASS' : 'PARTIAL',
    completeCoverage, checkedStages: cases.length, failedStages: failed };
}

async function sourceSnapshot(src, root) {
  const names = (await readdir(src)).filter(name => /\.(?:mjs|js)$/u.test(name)).sort();
  const files = names.map(name => [name, path.join(src, name)]);
  for (const name of ['career.mjs', 'career-expansion.mjs', 'runtime.mjs', 'rival-pressure.mjs'])
    files.push(['template/' + name, path.join(root, 'templates/web-lite/h5-source-mobile-v1/racing', name)]);
  return Object.fromEntries(await Promise.all(files.map(async ([name, file]) => [name, sha256(await readFile(file))])));
}

export function assertNativeAiBuildMetadata(build) {
  // V11.6 adds the garage while retaining this exact native physical-AI mode.
  // Hash, inheritance, world-accounting and finish gates below remain required.
  if (build.aiMode !== 'native-playercar-physics' || !['V11.5', 'V11.6'].includes(build.version))
    throw Error('Build a supported V11.5 or V11.6 physical-AI project before running this audit');
}

async function loadNative(root) {
  const run = path.join(root, 'runs', RUN), src = path.join(run, 'workspace/source/qq-speed/src');
  const build = JSON.parse(await readFile(path.join(run, 'artifacts/build-racing.json'), 'utf8'));
  assertNativeAiBuildMetadata(build);
  if (build.buildHash !== await buildHash(path.join(run, 'workspace/game')))
    throw Error('Stale build-racing.json: generated game hash differs');
  const hashes = await sourceSnapshot(src, root);
  for (const [name, field] of Object.entries({ 'ai.js': 'generatedAiSha256',
    'vehicle.js': 'generatedVehicleSha256', 'track.js': 'generatedTrackSha256', 'layouts.js': 'trackGeometrySha256' })) {
    if (hashes[name] !== build[field]) throw Error('Generated native source differs from build receipt: ' + name);
  }
  const [mainSource, trackSource, layoutSource] = await Promise.all(
    ['main.js', 'track.js', 'layouts.js'].map(name => readFile(path.join(src, name), 'utf8')));
  if (!layoutSource.trimEnd().endsWith('applyTrackDesign(LAYOUTS, { v8: true, v9: true, v10: true, v11: true });'))
    throw Error('Generated LAYOUTS are not the final V11 courses');
  for (const anchor of ['const DT = 1 / 120;', 'const d = -14 - Math.floor(k / 2) * 11;',
    'const lat = (k % 2 ? 1 : -1) * 5.5;',
    'installPhysicalShortcut(track, requestedCourse, {v8:true,v9:true,v10:true});']) {
    if (!mainSource.includes(anchor)) throw Error('Native setup contract changed: ' + anchor);
  }
  const diffSource = mainSource.match(/const DIFFS = (\[[\s\S]*?\n\]);/u)?.[1];
  if (!diffSource) throw Error('Generated native difficulty bands missing');
  const diff = runInNewContext(diffSource, {}, { timeout: 1000 });
  const load = name => import(pathToFileURL(path.join(src, name)).href);
  const [{ Track }, { AICar }, { PlayerCar }, { LAYOUTS }, { MAPS }, { mulberry32 },
    { createRaceTrackTheme }, { installPhysicalShortcut }, { V11_COURSES, v11RaceFraction }] =
    await Promise.all(['track.js', 'ai.js', 'vehicle.js', 'layouts.js', 'maps.js', 'util.js',
      'race-track-design.mjs', 'race-shortcut-network.mjs', 'v11-course-director.mjs'].map(load));
  if (!(AICar.prototype instanceof PlayerCar)) throw Error('Generated AICar is not a native PlayerCar subclass');
  const methods = nativeWorldMethods(mainSource), installPads = nativePadInstaller(trackSource);
  return { root, run, src, build, hashes, Track, AICar, LAYOUTS, MAPS, mulberry32,
    createRaceTrackTheme, installPhysicalShortcut, V11_COURSES, v11RaceFraction, methods, installPads, diff };
}

function stageFixture(native, stage) {
  const track = new native.Track(native.LAYOUTS[stage.course]);
  if (track.__V11_COURSE_IDENTITY__ !== native.V11_COURSES[stage.id]?.identity ||
      native.v11RaceFraction(stage.course) !== raceFraction(stage))
    throw Error('Native stage identity/fraction mismatch: ' + stage.id);
  track.__RACE_COURSE_ID = stage.course;
  const shortcut = native.installPhysicalShortcut(track, stage.course, { v8: true, v9: true, v10: true });
  const map = native.MAPS.find(entry => entry.id === stage.map);
  native.installPads(track, native.createRaceTrackTheme(map.track, track, stage.course));
  const seed = SEED + Number(stage.id), rnd = native.mulberry32(seed);
  const [low, high] = native.diff[stage.diff].skill;
  // The five real rival grid slots; slot 3 belongs to the absent human player.
  // Only pre-start resets set a pose. Career.begin configures the real fixed
  // field, personalities and named boss; no pace calibration is done here.
  const racers = GRID_SLOTS.map(slot => {
    const car = new native.AICar(track, null, 'native-audit-' + slot, low + (high - low) * rnd(), rnd);
    car.reset(-14 - Math.floor(slot / 2) * 11, (slot % 2 ? 1 : -1) * 5.5);
    if (!car.__V11_PHYSICAL_AI__ || car.isPlayer) throw Error('Incorrect physical rival constructor');
    Object.assign(car, { slot, lapTimes: [], items: [], finished: false, finishTime: 0,
      __V11_ITEM_MODE__: stage.mode === 'item', __V10_RIVAL_PLAYER__: null });
    return car;
  });
  const world = { ...native.methods, track, racers, player: null, standings: [...racers],
    settings: { course: stage.course, laps: stage.laps, mode: stage.mode },
    itemMode: stage.mode === 'item', items: null, state: 'race', raceTime: 0, firstFinish: -1 };
  for (const car of racers) world.updateProgress(car, true);
  const career = new RacingCareer({ getItem: () => null, setItem() {} });
  career.index = STAGES.indexOf(stage);
  career.begin(world);
  return { stage, track, racers, world, seed, shortcut };
}

export async function runAudit({ root = process.cwd(), stageIds = STAGES.map(stage => stage.id) } = {}) {
  const stages = stageIds.map(id => STAGES.find(stage => stage.id === id));
  if (stages.some(stage => !stage) || new Set(stageIds).size !== stageIds.length || !stages.length)
    throw Error('Audit stages must be distinct stage IDs from 01 to 30');
  const native = await loadNative(root);
  const cases = [];
  const report = { schemaVersion: 2, runId: RUN, mode: 'v11-native-playercar-physics',
    auditedAt: new Date().toISOString(), auditSourceSha256: sha256(await readFile(new URL(import.meta.url))),
    buildHash: native.build.buildHash, inputHash: native.build.inputHash,
    sourceRevision: native.build.sourceRevision, sourceHashes: native.hashes,
    fixedSeedBase: SEED, physicsHz: HZ, observationLimitSeconds: MAX_SECONDS,
    setup: 'Five career rivals in native grid slots 0,1,2,4,5; real Career.begin field and boss setup; no player car.',
    simulation: 'Generated LAYOUTS/Track/AICar, original generated World progress/onLap and car-to-car impulses, native Track.build pad records; 120 Hz presentation and physics.',
    collisions: { roadWalls: true, rivalTraffic: true },
    metricDefinitions: {
      trafficImpulseEvents: 'Per-racer native World.kick calls, including tiny repeated contact impulses; not distinct crashes.',
      trafficContactFrames: 'Per-racer 120 Hz frames with native separation calls; not seconds or distinct collisions.',
      trafficContactEpisodes: 'Per-racer transitions from no contact to any native car separation in the next physics frame.',
      trafficImpulsesAbove3Mps: 'Per-racer impulses above the native player crash-effect boundary; descriptive only.',
      maxNativeStepM: 'Measured x/z displacement including native road correction and native car separation.',
      wallScrapeFrames: 'Native PlayerCar scrape emissions, which may repeat during sustained wall contact.',
    },
    omitted: ['player car/input', 'rendering', 'item pickups and weapon attacks', 'player-dependent tactical pressure', 'career result/medal validation'],
    noPostStartAssistance: true, noRubberBand: true,
    comparison: { historicalOnRail: 'NOT_COMPARABLE', paceUpliftThresholds: 'NOT_APPLICABLE_DIFFERENT_AI_MODEL',
      observationLimit: 'Unchanged 350-second maximum from the historical audit.' },
    humanQA: 'NOT_RUN', naturalGameplayQA: 'NOT_RUN', publishable: false, cases };
  for (const stage of stages) {
    const fixture = stageFixture(native, stage);
    const result = simulateNativeRace(fixture);
    cases.push({ ...result, seed: fixture.seed, v11CourseIdentity: fixture.track.__V11_COURSE_IDENTITY__,
      boostPads: fixture.track.boostPads.map(({ d, lat, len, halfW }) => ({ d: rounded(d), lat, len, halfW })),
      shortcut: fixture.shortcut ? { start: rounded(fixture.shortcut.start), end: rounded(fixture.shortcut.end),
        lengthM: rounded(fixture.shortcut.length) } : null });
    console.log(JSON.stringify({ stage: stage.id, status: result.status, finished: result.finishedRacers,
      racers: result.racerCount, timeSec: result.observedSeconds,
      wallCrashes: result.racers.reduce((sum, racer) => sum + racer.wallCrashEvents, 0),
      trafficImpulseEvents: result.racers.reduce((sum, racer) => sum + racer.trafficImpulseEvents, 0) }));
  }
  const after = await sourceSnapshot(native.src, root);
  const afterBuild = JSON.parse(await readFile(path.join(native.run, 'artifacts/build-racing.json'), 'utf8'));
  report.sourceUnchanged = JSON.stringify(after) === JSON.stringify(native.hashes) &&
    afterBuild.buildHash === native.build.buildHash && afterBuild.inputHash === native.build.inputHash &&
    native.build.buildHash === await buildHash(path.join(native.run, 'workspace/game'));
  Object.assign(report, auditStatus(cases));
  // A real tracked reference: prevent a fixed-seed podium pace regression.
  // Completion remains a separate gate; human win-rate is still NOT_RUN.
  const referencePath = path.join(root, 'docs/lean-pilot/racing-unified-20261018/evidence-v116/ai-150.json');
  const referenceBytes = await readFile(referencePath);
  const reference = JSON.parse(referenceBytes.toString('utf8'));
  if (reference.fixedSeedBase !== SEED || reference.mode !== 'v11-native-playercar-physics')
    throw Error('Historical physical-AI baseline seed or mode changed');
  report.fixedSeedPaceGuard = compareFixedSeedOpponentPace(cases, reference.cases);
  report.fixedSeedPaceGuard.baselineSha256 = sha256(referenceBytes);
  report.fixedSeedPaceGuard.humanSkillCertified = false;
  if (report.fixedSeedPaceGuard.status !== 'PASS') report.status = 'FAIL';
  if (!report.sourceUnchanged) report.status = 'STALE';
  report.finishedRacers = cases.reduce((sum, entry) => sum + entry.finishedRacers, 0);
  report.totalRacers = cases.reduce((sum, entry) => sum + entry.racerCount, 0);
  const out = path.join(native.run, 'artifacts/racing-v3-smoke');
  await mkdir(out, { recursive: true });
  const bytes = JSON.stringify(report, null, 2) + '\n';
  const suffix = report.completeCoverage ? '' : '-subset-' + stageIds.join('-');
  const file = path.join(out, 'ai-pace-v115-' + report.buildHash.slice(0, 12) + suffix + '.json');
  await writeFile(file, bytes);
  if (report.completeCoverage) await writeFile(path.join(out, 'ai-pace-v115.json'), bytes);
  console.log(JSON.stringify({ status: report.status, checkedStages: report.checkedStages,
    finishedRacers: report.finishedRacers, totalRacers: report.totalRacers,
    failedStages: report.failedStages, sourceUnchanged: report.sourceUnchanged, buildHash: report.buildHash, file }));
  return report;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => !/^--stages=\d{2}(?:,\d{2})*$/u.test(arg)))
    throw Error('Usage: node tools/lean-pilot/racing-ai-pace-audit.mjs [--stages=01,07]');
  const report = await runAudit(args.length ? { stageIds: args[0].slice('--stages='.length).split(',') } : {});
  if (report.status !== 'PASS' && report.status !== 'PARTIAL') process.exitCode = 1;
}
