import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeWorldMethods, simulateNativeRace, auditStatus, assertNativeAiBuildMetadata } from '../racing-ai-pace-audit.mjs';

for (const version of ['V11.5', 'V11.6']) {
  test(version + ' metadata supports the explicitly shared native PlayerCar AI mode', () => {
    const receipt = Object.freeze({ version, aiMode: 'native-playercar-physics',
      buildHash: 'a'.repeat(64), generatedVehicleSha256: 'b'.repeat(64) });
    assert.doesNotThrow(() => assertNativeAiBuildMetadata(receipt));
    assert.equal(receipt.version, version, 'validation cannot relabel the build');
  });
}

test('recognized versions still reject every wrong or missing native AI mode', () => {
  for (const version of ['V11.5', 'V11.6']) {
    for (const aiMode of [undefined, null, '', 'spline', 'native-playercar-physics-legacy'])
      assert.throws(() => assertNativeAiBuildMetadata({ version, aiMode }), /physical-AI/u);
  }
});

test('native AI mode never permits unrecognized or missing build versions', () => {
  for (const version of [undefined, null, '', 'V11.4', 'V11.7', 'V12.0', 'V11.6-dev', '11.6'])
    assert.throws(() => assertNativeAiBuildMetadata({ version, aiMode: 'native-playercar-physics' }), /physical-AI/u);
});

// A small pinned-World contract fixture. These tests exercise the audit's
// accounting, not vehicle handling or natural player completion.
const worldSource = `class World {
  updateProgress(r, init = false) {
    const L = this.track.length;
    if (r.isPlayer || r.__V11_PHYSICAL_AI__) {
      const d = r.d;
      if (!init) {
        if (r.lastD > .75 * L && d < .25 * L) {
          if (r.owed) { r.lapsDone++; r.owed = false; }
          else if (r.half) { r.lapsDone++; r.half = false; this.onLap(r); }
        } else if (r.lastD < .25 * L && d > .75 * L) {
          r.lapsDone--; r.owed = true;
        }
        if (d > .4 * L && d < .6 * L) r.half = true;
      }
      r.lastD = d;
      r.progress = r.lapsDone * L + d;
    } else { r.progress = r.dist; }
    const finishAt = this.settings.course === 'race-07' ? .82 :
      this.settings.course === 'race-22' ? .84 : null;
    if (!init && finishAt !== null && !r.finished &&
        (this.state === 'race' || this.state === 'finish') && r.progress >= L * finishAt) {
      r.lapsDone = 1; this.onLap(r);
    }
  }
  onLap(r) {
    r.lapTimes.push(this.raceTime - (r.lapStart || 0));
    r.lapStart = this.raceTime;
    if (r.lapsDone >= this.settings.laps && !r.finished) {
      r.finished = true; r.finishTime = this.raceTime;
      if (this.firstFinish < 0) this.firstFinish = this.raceTime;
    }
  }
  collide() {
  }
  vel(r) {
    if (r.isPlayer || r.__V11_PHYSICAL_AI__) return [0, r.s];
    throw Error('legacy branch');
  }
  pushRacer(r, px, pz) {
    if (r.isPlayer || r.__V11_PHYSICAL_AI__) { r.x += px; r.z += pz; return; }
    throw Error('legacy branch');
  }
  kick(r, vx, vz) {
    if (r.isPlayer || r.__V11_PHYSICAL_AI__) { r.s += vz; return; }
    throw Error('legacy branch');
  }
}`;

function fixture(id = '01', laps = 2, speed = 20) {
  const stage = { id, course: 'race-' + id, laps, mode: 'speed' };
  const track = { length: 100 };
  let travel = -25;
  const car = {
    isPlayer: false, __V11_PHYSICAL_AI__: true, slot: 0, skill: 1.6,
    lapsDone: -1, owed: true, half: false, lastD: 75, progress: -25,
    finished: false, finishTime: 0, lapTimes: [], events: [], proj: {},
    get x() { return travel; }, get y() { return 0; }, get z() { return 0; },
    get h() { return 0; }, get m() { return 0; }, get s() { return speed; },
    get d() { return ((travel % 100) + 100) % 100; },
    get dist() { return this.lapsDone * 100 + this.d; },
    get speedKmh() { return speed * 3.6; },
    update(dt) { travel += speed * dt; this.events.length = 0; },
  };
  const world = { ...nativeWorldMethods(worldSource), track, settings: stage,
    state: 'race', raceTime: 0, firstFinish: -1, racers: [car], player: null };
  world.updateProgress(car, true);
  return { stage, track, racers: [car], world };
}

test('audit refuses legacy on-rail World accounting instead of silently using it', () => {
  assert.throws(() => nativeWorldMethods(worldSource.replaceAll(' || r.__V11_PHYSICAL_AI__', '')), /physical/i);
  assert.throws(() => nativeWorldMethods(worldSource.replace("'race-22' ? .84", "'race-22' ? .90")), /finish/i);
});

test('read-only physical position and dist finish through actual half-lap/onLap accounting', () => {
  const result = simulateNativeRace(fixture(), { maxSeconds: 20 });
  assert.equal(result.status, 'PASS');
  assert.equal(result.racers[0].finished, true);
  assert.equal(result.racers[0].lapEvents.length, 2);
  assert.equal(result.racers[0].lapsDone, 2);
  assert.ok(result.racers[0].finishTimeSec > 11.2);
  assert.equal(result.racers[0].wallCrashEvents, 0);
});

for (const [id, fraction] of [['07', .82], ['22', .84]]) {
  test('stage ' + id + ' stops at the actual fractional finish before a complete loop', () => {
    const result = simulateNativeRace(fixture(id, 1), { maxSeconds: 10 });
    const racer = result.racers[0];
    assert.equal(result.status, 'PASS');
    assert.equal(racer.lapEvents.length, 1);
    assert.ok(racer.projectedFinishD >= 100 * fraction);
    assert.ok(racer.projectedFinishD < 100 * fraction + .18);
    assert.ok(racer.finishTimeSec < 6);
  });
}

test('an unfinished or motionless car is preserved as DNF, never advanced to satisfy the gate', () => {
  const f = fixture('01', 2, 0);
  const result = simulateNativeRace(f, { maxSeconds: .1 });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.racers[0].finished, false);
  assert.equal(result.racers[0].failure, 'OBSERVATION_LIMIT');
  assert.equal(f.racers[0].d, 75);
  assert.equal(f.racers[0].lapsDone, -1);
});

test('collision observers call the native handlers and distinguish repeated impulses from contact episodes', () => {
  const f = fixture('07', 1);
  let pushes = 0, kicks = 0;
  const push = () => { pushes++; }, kick = () => { kicks++; };
  f.world.pushRacer = push;
  f.world.kick = kick;
  f.world.collide = function() {
    this.pushRacer(this.racers[0], 0, 0);
    this.kick(this.racers[0], 0, .01);
  };
  const result = simulateNativeRace(f, { maxSeconds: 10 });
  const racer = result.racers[0];
  assert.equal(result.status, 'PASS');
  assert.equal(racer.trafficSeparations, pushes);
  assert.equal(racer.trafficImpulseEvents, kicks);
  assert.ok(kicks > 100);
  assert.equal(racer.trafficContactEpisodes, 1);
  assert.equal(racer.trafficImpulsesAbove3Mps, 0);
  assert.equal(f.world.pushRacer, push);
  assert.equal(f.world.kick, kick);
});

test('a successful subset cannot claim that all thirty stages passed', () => {
  const one = [{ id: '01', status: 'PASS' }];
  assert.equal(auditStatus(one).status, 'PARTIAL');
  const all = Array.from({ length: 30 }, (_, i) => ({ id: String(i + 1).padStart(2, '0'), status: 'PASS' }));
  assert.equal(auditStatus(all).status, 'PASS');
  all[6].status = 'FAIL';
  assert.equal(auditStatus(all).status, 'FAIL');
  all[6] = { id: '01', status: 'PASS' };
  assert.equal(auditStatus(all).status, 'PARTIAL');
});
