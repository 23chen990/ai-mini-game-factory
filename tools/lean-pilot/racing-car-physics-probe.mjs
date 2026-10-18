/* global window */
/**
 * Pass this self-contained, synchronous function directly to page.evaluate.
 * Run after a visible native start, when game.player exists. It borrows the
 * actual constructor, track and model, but updates only a new PlayerCar.
 *
 * This is synthetic engineering evidence. It does not run the world loop,
 * sync visuals, consume fuel, award a result, or establish natural playability.
 * Compare protocol, track, columns, trace and events across the six real cars;
 * carId/assetIdentity intentionally differ. No tolerance or pass is fabricated.
 */
export function probeNativeCarPhysics({ expectedCarId } = {}) {
  const game = window.game, live = game?.player;
  if (!live || live.isPlayer !== true || typeof live.constructor !== 'function') {
    throw Error('A real native player is required; the homepage demo has no game.player');
  }
  const NativePlayerCar = live.constructor, track = game.track, model = live.model;
  if (typeof NativePlayerCar.prototype.reset !== 'function' ||
      typeof NativePlayerCar.prototype.update !== 'function' ||
      !track || live.track !== track || typeof track.sample !== 'function' ||
      typeof track.project !== 'function' || !model ||
      !Number.isFinite(track.length) || track.length <= 0) {
    throw Error('Native PlayerCar/Track API does not match the isolated physics probe');
  }
  const carId = model.userData?.carId;
  if (!['starter', 'custom-01', 'custom-02', 'custom-03', 'custom-04', 'custom-05'].includes(carId) ||
      carId !== game.settings?.car || model.userData?.assetIdentity?.carId !== carId ||
      (expectedCarId !== undefined && expectedCarId !== carId)) {
    throw Error('Native car identity differs from the equipped/requested car');
  }
  if (typeof track.__RACE_COURSE_ID !== 'string' || track.__RACE_COURSE_ID !== game.settings.course) {
    throw Error('Native track identity differs from the current course');
  }
  for (const name of ['slope', 'hd', 'vcurv', 'sslope']) {
    if (!track[name]?.length) throw Error('Native Track is missing physics field ' + name);
  }

  // Observe existing objects without wrapping, freezing or replacing them.
  // Synchronous evaluation prevents the animation loop from racing this guard.
  const guards = [], watched = new Set();
  function watch(object, label) {
    if (!object || typeof object !== 'object' || watched.has(object)) return;
    watched.add(object);
    const keys = Reflect.ownKeys(object);
    guards.push({ object, label, keys, descriptors: keys.map(key => Object.getOwnPropertyDescriptor(object, key)) });
  }
  watch(game, 'game');
  watch(game.settings, 'settings');
  watch(game.racers, 'racers');
  for (const [index, racer] of (game.racers ?? [live]).entries()) {
    watch(racer, 'racer-' + index);
    for (const key of ['events', 'proj', 'stats', 'items', 'lapTimes']) watch(racer[key], 'racer-' + index + '.' + key);
  }
  watch(live, 'player');
  watch(track, 'track');
  for (const key of ['px', 'py', 'pz', 'hd', 'tx', 'tz', 'rx', 'rz', 'curv', 'bank', 'slope', 'vcurv', 'sslope', '_tmp', 'boostPads']) {
    watch(track[key], 'track.' + key);
  }
  for (const [index, pad] of (track.boostPads ?? []).entries()) watch(pad, 'track.pad-' + index);
  const pending = [model], nodes = new Set();
  while (pending.length) {
    const node = pending.pop();
    if (!node || nodes.has(node)) continue;
    nodes.add(node);
    const label = 'model-node-' + nodes.size;
    watch(node, label);
    for (const key of ['position', 'rotation', 'quaternion', 'scale', 'children', 'userData']) watch(node[key], label + '.' + key);
    for (const key of ['matrix', 'matrixWorld']) {
      watch(node[key], label + '.' + key);
      watch(node[key]?.elements, label + '.' + key + '.elements');
    }
    for (const value of Object.values(node.userData ?? {})) watch(value, label + '.userData-value');
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      watch(material, label + '.material');
      watch(material?.color, label + '.material.color');
      watch(material?.emissive, label + '.material.emissive');
    }
    pending.push(...(node.children ?? []));
  }
  function verifyReadOnly() {
    for (const guard of guards) {
      const keys = Reflect.ownKeys(guard.object);
      if (keys.length !== guard.keys.length || keys.some((key, index) => key !== guard.keys[index])) {
        throw Error('Read-only invariant changed: ' + guard.label + ' properties');
      }
      for (let index = 0; index < keys.length; index++) {
        const before = guard.descriptors[index], after = Object.getOwnPropertyDescriptor(guard.object, keys[index]);
        for (const field of ['value', 'get', 'set', 'writable', 'enumerable', 'configurable']) {
          if (!Object.is(before[field], after[field])) {
            throw Error('Read-only invariant changed: ' + guard.label + '.' + String(keys[index]));
          }
        }
      }
    }
  }

  const dt = 1 / 60;
  const neutral = { up: false, down: false, left: false, right: false, shift: false,
    upPressed: false, wPressed: false, nitroPressed: false, manualNitroPressed: false, steerAxis: 0 };
  const segments = [
    { name: 'accelerate', frames: 180, input: { up: true } },
    { name: 'held-drift', frames: 60, input: { up: true, left: true, shift: true, steerAxis: .55 } },
    { name: 'countersteer', frames: 60, input: { up: true, right: true, shift: true, steerAxis: -.55 } },
    { name: 'release-drift', frames: 60, input: { up: true } },
    { name: 'boost-input', frames: 1, input: { up: true, upPressed: true } },
    { name: 'accelerate-again', frames: 59, input: { up: true } },
    { name: 'coast', frames: 60, input: {} },
    { name: 'brake-and-reverse', frames: 120, input: { down: true } },
  ].map(segment => ({ ...segment, input: Object.freeze({ ...neutral, ...segment.input }) }));
  const fields = ['x', 'y', 'z', 'h', 'm', 's', 'd', 'lat', 'steer', 'vy', 'airTime',
    'driftTime', 'driftAngle', 'gauge', 'nitroCount', 'nitroTime', 'smallBoost',
    'smallBoostPower', 'smallWindow', 'padTime', 'startBoost', 'spin', 'shield',
    'slowTime', 'magnet', 'impact', 'wrongWay', 'throttle', 'vmaxNow', 'driftDir', 'hint'];
  const trace = [], events = [];
  let maxSpeed = 0, maxImpact = 0, frame = 0;
  try {
    const isolated = new NativePlayerCar(track, model, 'isolated-car-physics-probe');
    if (isolated === live || isolated.model !== model || isolated.track !== track ||
        isolated.proj === live.proj || isolated.events === live.events || game.racers?.includes(isolated)) {
      throw Error('Native constructor did not create an isolated PlayerCar');
    }
    isolated.reset(0, 0);
    for (const segment of segments) {
      for (let step = 0; step < segment.frames; step++) {
        const eventStart = isolated.events.length;
        isolated.update(dt, segment.input, true, game.itemMode === true);
        frame++;
        const values = fields.map(key => isolated[key]);
        if (!values.every(Number.isFinite)) throw Error('Non-finite native physics state at frame ' + frame);
        trace.push([frame, ...values, isolated.airborne, isolated.drifting]);
        for (const event of isolated.events.slice(eventStart)) events.push({ frame, ...event });
        maxSpeed = Math.max(maxSpeed, Math.abs(isolated.s));
        maxImpact = Math.max(maxImpact, isolated.impact);
      }
    }
  } finally {
    verifyReadOnly();
  }
  return {
    schemaVersion: 1, kind: 'isolated-native-physics-probe', synthetic: true,
    naturalJourney: 'NOT_RUN', carId,
    assetIdentity: { carId, sha256: model.userData.assetIdentity.sha256 ?? null },
    constructorName: NativePlayerCar.name, observedNativeState: game.state,
    protocol: { dt, frames: frame, reset: { distance: 0, lateral: 0 }, active: true,
      itemMode: game.itemMode === true, segments },
    track: { courseId: track.__RACE_COURSE_ID, length: track.length, segments: track.N,
      ds: track.ds, halfWidth: track.halfW,
      // PlayerCar.update consumes exactly these pad fields. The material's
      // animated texture offset/version belongs to rendering, not physics.
      boostPads: (track.boostPads ?? []).map(({ d, lat, len, halfW }) => ({ d, lat, len, halfW })) },
    columns: ['frame', ...fields, 'airborne', 'drifting'], trace, events,
    summary: { maxSpeed, maxImpact, crashes: events.filter(event => event.type === 'crash').length,
      driftStarts: events.filter(event => event.type === 'driftStart').length,
      driftEnds: events.filter(event => event.type === 'driftEnd').length },
    readOnlyVerified: true,
    readOnlyScope: ['game/settings references and values', 'racer fields and queues',
      'track physics arrays and boost pads', 'borrowed model tree/transforms/materials'],
    exclusions: ['world progress/laps/finish', 'other racers and item collisions',
      'visual synchronization/rendering', 'natural driving', 'fuel/ad/save writes'],
  };
}
