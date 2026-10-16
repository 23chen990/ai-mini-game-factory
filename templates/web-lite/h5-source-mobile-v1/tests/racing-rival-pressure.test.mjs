import test from 'node:test';
import assert from 'node:assert/strict';
import { configureRivalTactics, applyRivalTactics, tuneOpponentField } from '../racing/rival-pressure.mjs';

function rival(overrides = {}) {
  return {
    isPlayer: false, personal: 0, skill: .8, startDelay: .4, nitroCd: 5,
    progress: 70, dist: 500, s: 40, lat: 0, name: '测试对手',
    ...overrides,
  };
}

test('rivals receive distinct stable personalities without changing native physics fields', () => {
  const field = Array.from({ length: 6 }, (_, i) => rival({ personal: i % 2 ? .1 : -.1 }));
  const before = field.map(r => ({ skill: r.skill, personal: r.personal }));
  const result = configureRivalTactics(field, { diff: 1 });
  assert.equal(result.configured, 6);
  assert.equal(new Set(field.map(r => r.__RACE_TACTIC__.role)).size, 6);
  assert.equal(field[0].startDelay, .1);
  assert.equal(field[1].startDelay, .16);
  assert.equal(field[0].skill, before[0].skill);
  assert.ok(field.some((r, i) => r.personal !== before[i].personal));
});

test('a chasing rival moves toward an available passing side only on a readable straight', () => {
  const player = { isPlayer: true, progress: 100, lat: 2.8, s: 42 };
  const chaser = rival({ progress: 55, lat: 0 });
  const game = { state: 'race', player, racers: [player, chaser], track: {
    length: 1000, curvAhead: () => 0,
  }};
  configureRivalTactics([chaser], { diff: 1 });
  const base = chaser.personal;
  const changed = applyRivalTactics(game, { diff: 1 });
  assert.equal(changed, 1);
  assert.ok(chaser.personal < base, 'player on right should invite a left-side attack');
  assert.ok(Math.abs(chaser.personal - chaser.__RACE_TACTIC__.basePersonal) <= .42);
});

test('rival does not weave toward a pass through a sharp corner', () => {
  const player = { isPlayer: true, progress: 100, lat: 0, s: 40 };
  const chaser = rival({ progress: 55, lat: 0 });
  const game = { state: 'race', player, racers: [player, chaser], track: {
    length: 1000, curvAhead: () => .03,
  }};
  configureRivalTactics([chaser], { diff: 1 });
  const base = chaser.personal;
  const changed = applyRivalTactics(game, { diff: 1 });
  assert.equal(changed, 0);
  assert.equal(chaser.personal, base);
});

test('an ahead rival gets only a light inside-line defense, not a speed or progress change', () => {
  const player = { isPlayer: true, progress: 100, lat: 0, s: 40 };
  const leader = rival({ progress: 135, lat: 0, skill: 1.2, s: 40 });
  const game = { state: 'race', player, racers: [player, leader], track: {
    length: 1000, curvAhead: () => -.01,
  }};
  configureRivalTactics([leader], { diff: 1 });
  const before = { skill: leader.skill, progress: leader.progress, s: leader.s };
  const changed = applyRivalTactics(game, { diff: 1 });
  assert.equal(changed, 1);
  assert.ok(leader.personal > leader.__RACE_TACTIC__.basePersonal);
  assert.deepEqual({ skill: leader.skill, progress: leader.progress, s: leader.s }, before);
});

test('pace tuning remains bounded and never touches bosses or final item race', () => {
  const ordinary = Array.from({ length: 6 }, () => rival({ skill: .75 }));
  const tuned = tuneOpponentField(ordinary, { id: '02', course: 'race-02', diff: 0, kind: 'speed' });
  assert.equal(tuned.adjusted, 6);
  assert.ok(Math.max(...ordinary.map(r => r.skill)) <= .975);
  const boss = Array.from({ length: 6 }, () => rival({ skill: 1.3 }));
  assert.equal(tuneOpponentField(boss, { id: '13', course: 'race-13', diff: 2, kind: 'boss' }).adjusted, 0);
  const finalItem = Array.from({ length: 6 }, () => rival({ skill: 1.3 }));
  assert.equal(tuneOpponentField(finalItem, { id: '15', course: 'race-15', diff: 2, kind: 'item' }).adjusted, 0);
});
