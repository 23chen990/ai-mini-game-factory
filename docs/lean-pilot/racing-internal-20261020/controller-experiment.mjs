/* global process, Buffer, console */
// Read-only controller experiments. No build, source patch, race-state writes,
// natural-play or human-win-rate claim. The native vehicle/world stay unchanged.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const out = root + '/runs/h5-qq-mobile-20261013/artifacts/internal-experience-20261020';
await mkdir(out, { recursive: true });
let audit = await readFile('tools/lean-pilot/racing-ai-pace-audit.mjs', 'utf8');
audit = audit.slice(0, audit.indexOf('if (process.argv[1] &&'));
audit = audit.replace(/from '(\.\.?\/[^']+)'/g, (_, ref) => `from '${pathToFileURL(path.resolve('tools/lean-pilot', ref)).href}'`);
audit += '\nexport {loadNative,stageFixture};';
const api = await import('data:text/javascript;base64,' + Buffer.from(audit).toString('base64'));
const native = await api.loadNative(root);
const { PlayerCar, TUNE } = await import(pathToFileURL(native.src + '/vehicle.js'));
const { STAGES } = await import(pathToFileURL(root + '/templates/web-lite/h5-source-mobile-v1/racing/career.mjs'));
const source = execFileSync('git', ['show', '05e31aa698b3625a7efdc16490cdf05bf69c6351:templates/web-lite/h5-source-mobile-v1/racing/v11-physical-ai.mjs'], { encoding: 'utf8' });
const edit = (code, from, to) => {
  if (!code.includes(from)) throw Error('Experiment source anchor absent: ' + from);
  return code.replace(from, to);
};
const smooth = (code, span) => {
  code = edit(code, 'at(Math.max(0, ahead - 5)), b = at(ahead + 7)', `at(ahead - ${span}), b = at(ahead + ${span})`);
  return edit(code, 'Math.max(5, ahead === 0 ? 7 : 12)', String(2 * span));
};
const yaw = code => code.replaceAll('(tune.turnRate ?? 1.9) * .87', '(tune.turnRate ?? 1.9)');
const brake = code => edit(code, '(tune.brake ?? 45) * .66', '(tune.brake ?? 45) * .9');
const nativeYawOnly = code => edit(code, 'Math.min(cornerLimit, yawLimit)', 'yawLimit');
const usableSpray = code => edit(code,
  'largestCurve < .010 && Math.abs(headingError) < .16 && speed > 21',
  'desired >= speed + 3 && Math.abs(headingError) < .20 && speed > 21');
const driftLine = code => {
  code = edit(code, 'Math.abs(nearCurve) > 0.009 && largestCurve < 0.026',
    'Math.abs(nearCurve) > 0.009 && largestCurve < 0.040');
  code = edit(code, 'speed >= 23 && speed <= 42', 'speed >= 23 && speed <= 55');
  code = edit(code, 'ai.driftTime < 0.34', 'ai.driftTime < 0.50');
  return usableSpray(code);
};
const longLook = code => edit(edit(code, '(route ? .28 : .34)', '(route ? .28 : .65)'), 'route ? 21 : 27', 'route ? 21 : 43');
const noCurveBrake = code => edit(code,
  'desired = Math.min(desired, Math.sqrt(limit * limit + 2 * braking * Math.max(0, ahead - 9)));',
  'if (route) desired = Math.min(desired, Math.sqrt(limit * limit + 2 * braking * Math.max(0, ahead - 9)));');
const shortSpray = code => edit(code,
  'largestCurve < .010 && Math.abs(headingError) < .16 && speed > 21',
  'Math.abs(nearCurve) < .016 && Math.abs(headingError) < .20 && Math.abs(input.steerAxis) < .65 && speed > 21');
const corridor = (code, factor) => edit(code,
  'const absolute = Math.abs(curvature);',
  `const rawCurve = Math.abs(curvature);
    const margin = Math.max(0, (track.v9WidthAt?.(ai.d + ahead) ?? track.halfW) - 3);
    const absolute = route ? rawCurve : rawCurve / (1 + rawCurve * margin * ${factor});`);
const fastDrift = code => edit(edit(code, 'speed >= 23 && speed <= 42', 'speed >= 23 && speed <= 56'),
  'Math.abs(nearCurve) > 0.009 && largestCurve < 0.026',
  'Math.abs(nearCurve) > 0.009 && largestCurve < 0.040');
const exitDrift = code => shortSpray(fastDrift(code));
const variants = {
  baseline: source,
  smooth15: smooth(source, 15),
  smooth25: smooth(source, 25),
  smooth15_yaw_brake: brake(yaw(smooth(source, 15))),
  smooth25_yaw_brake: brake(yaw(smooth(source, 25))),
  yaw_only: nativeYawOnly(source),
  smooth15_yaw_only: nativeYawOnly(brake(yaw(smooth(source, 15)))),
  smooth25_yaw_only: nativeYawOnly(brake(yaw(smooth(source, 25)))),
  release_spray: usableSpray(source),
  drift_line: driftLine(source),
  smooth15_drift_line: driftLine(brake(yaw(smooth(source, 15)))),
  long_look: longLook(source),
  long_look_smooth25: longLook(brake(yaw(smooth(source, 25)))),
  long_look_throttle: longLook(noCurveBrake(source)),
  long_look_throttle_drift: driftLine(longLook(noCurveBrake(source))),
  corridor2: corridor(longLook(brake(yaw(smooth(source, 15)))), 2),
  corridor3: corridor(longLook(brake(yaw(smooth(source, 15)))), 3),
  corridor3_drift: corridor(exitDrift(longLook(brake(yaw(smooth(source, 15))))), 3),
  long_look_exit_spray: exitDrift(longLook(noCurveBrake(source))),
};
const selected = process.env.RACE_EXPERIMENT_VARIANTS?.split(',') ?? Object.keys(variants);
const stages = process.env.RACE_EXPERIMENT_STAGES?.split(',') ?? ['01', '02', '04', '10', '24', '30'];
const digest = code => createHash('sha256').update(code).digest('hex');
for (const name of selected) {
  const controller = await import('data:text/javascript;base64,' + Buffer.from(variants[name]).toString('base64'));
  native.AICar = controller.createV11PhysicalAiClass(PlayerCar, TUNE);
  const results = [];
  for (const stage of STAGES.filter(s => stages.includes(s.id))) {
    const result = api.simulateNativeRace(api.stageFixture(native, stage));
    results.push(result);
    console.log(JSON.stringify({ name, stage: stage.id, status: result.status,
      times: result.racers.map(c => c.finishTimeSec),
      wall: result.racers.reduce((n, c) => n + c.wallCrashEvents, 0),
      contacts: result.racers.reduce((n, c) => n + c.trafficContactEpisodes, 0),
      drift: result.racers.reduce((n, c) => n + c.driftStarts, 0),
      spray: result.racers.reduce((n, c) => n + c.smallBoostEvents, 0) }));
  }
  await writeFile(`${out}/experiment-${name}.json`, JSON.stringify({
    status: 'EXPERIMENT_NOT_BUILD_NOT_NATURAL', name, baselineBuild: native.build.buildHash,
    originalControllerSha256: digest(source), experimentalControllerSha256: digest(variants[name]),
    nativeVehicleSha256: native.hashes['vehicle.js'], results,
  }, null, 2) + '\n');
}
