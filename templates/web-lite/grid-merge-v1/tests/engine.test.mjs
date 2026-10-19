/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, move, canMove, continueGame, validateState, decodeSave, encodeSave, swipeDirection } from '../engine.mjs';

const board = (row) => [...row, ...Array(12).fill(0)];
const fixture = (cells, extra = {}) => ({ version: 1, cells, score: 0, moves: 0, seed: 7, won: false, keepPlaying: false, status: 'playing', ...extra });

test('a fresh game has exactly two tiles and deterministic independent state', () => {
  const a = initialState(42); const b = initialState(42);
  assert.deepEqual(a, b); assert.notEqual(a.cells, b.cells);
  assert.equal(a.cells.filter(Boolean).length, 2);
  assert.notDeepEqual(a, initialState(43)); validateState(a);
});

test('four equal tiles merge pairwise, not into one chain', () => {
  const result = move(fixture(board([2, 2, 2, 2])), 'left');
  assert.deepEqual(result.beforeSpawn.slice(0, 4), [4, 4, 0, 0]);
  assert.equal(result.scoreDelta, 8); assert.equal(result.events.filter(e => e.type === 'merge').length, 2);
});

test('a new merged tile cannot merge again in the same move', () => {
  assert.deepEqual(move(fixture(board([2, 2, 4, 0])), 'left').beforeSpawn.slice(0, 4), [4, 4, 0, 0]);
  assert.deepEqual(move(fixture(board([4, 2, 2, 0])), 'right').beforeSpawn.slice(0, 4), [0, 0, 4, 4]);
});

test('vertical movement respects direction and score', () => {
  const cells = Array(16).fill(0); cells[0] = 2; cells[4] = 2; cells[8] = 4;
  const up = move(fixture(cells), 'up'); const down = move(fixture(cells), 'down');
  assert.deepEqual([0,4,8,12].map(i => up.beforeSpawn[i]), [4,4,0,0]);
  assert.deepEqual([0,4,8,12].map(i => down.beforeSpawn[i]), [0,0,4,4]);
});

test('invalid movement does not consume randomness, create a tile or count a move', () => {
  const state = fixture(board([2,4,8,16])); const saved = structuredClone(state);
  const result = move(state, 'left'); assert.equal(result.changed, false);
  assert.deepEqual(result.state, saved); assert.deepEqual(state, saved); assert.equal(result.events.length, 0);
});

test('full board with a legal adjacent pair is not lost', () => {
  assert.equal(canMove([2,2,4,8, 4,8,16,32, 8,16,32,64, 16,32,64,128]), true);
});

test('full checkerboard is lost, even when loaded at the boundary', () => {
  const cells = [2,4,2,4, 4,2,4,2, 2,4,2,4, 4,2,4,2];
  assert.equal(canMove(cells), false);
  assert.equal(move(fixture(cells), 'left').state.status, 'lost');
});

test('winning freezes movement until continue; it is not repeatedly granted', () => {
  const result = move(fixture(board([1024,1024,0,0])), 'left');
  assert.equal(result.state.status, 'won'); assert.equal(result.state.won, true);
  assert.equal(move(result.state, 'right').changed, false);
  const resumed = continueGame(result.state); assert.equal(resumed.status, 'playing');
  assert.equal(resumed.keepPlaying, true); assert.equal(move(resumed, 'right').state.status, 'playing');
});

test('move never mutates the caller state', () => {
  const state = initialState(9); const saved = structuredClone(state);
  Object.freeze(state.cells); Object.freeze(state); move(state, 'up'); assert.deepEqual(state, saved);
});

test('save roundtrip is theme bound, bounded and rejects corrupt data', () => {
  const state = initialState(91); const text = encodeSave(state, 400, 'observatory');
  assert.deepEqual(decodeSave(text, 'observatory'), { state, best: 400 });
  for (const raw of [null, '', '{}', '[1]', 'x'.repeat(20000), text.replace('observatory', 'unknown')]) {
    assert.equal(decodeSave(raw, 'observatory'), null);
  }
  assert.equal(decodeSave(text, 'orchard'), null);
});

test('invalid state is rejected, including forged terminal flags and infinite scores', () => {
  for (const bad of [null, {}, fixture([2]), fixture(board([3,2,0,0])), fixture(board([2,0,0,0]), {seed:0}),
    fixture(board([2,0,0,0]), {score:Infinity}), fixture(board([2,0,0,0]), {status:'lost'}),
    fixture(board([2,0,0,0]), {won:true}), fixture(board([2,0,0,0]), {moves:-1})]) {
    assert.throws(() => validateState(bad));
  }
});

test('touch gesture classification rejects taps and ambiguous diagonals', () => {
  assert.equal(swipeDirection(60, 2, 320), 'right'); assert.equal(swipeDirection(-60, 2, 320), 'left');
  assert.equal(swipeDirection(2, -60, 320), 'up'); assert.equal(swipeDirection(2, 60, 320), 'down');
  assert.equal(swipeDirection(10, 2, 320), null); assert.equal(swipeDirection(40, 40, 320), null);
  assert.equal(swipeDirection(NaN, 0, 320), null);
});

// This oracle is intentionally a compact list implementation, independent of cell traversal.
function oracle(row) {
  const values = row.filter(Boolean); const out = []; let score = 0;
  while (values.length) { const value = values.shift();
    if (values[0] === value) { values.shift(); out.push(value * 2); score += value * 2; }
    else out.push(value);
  }
  return { row: [...out, ...Array(4 - out.length).fill(0)], score };
}

test('all 625 four-cell rows agree with an independent merge oracle', () => {
  const values = [0,2,4,8,16];
  for (const a of values) for (const b of values) for (const c of values) for (const d of values) {
    const row = [a,b,c,d]; const expected = oracle(row); const actual = move(fixture(board(row)), 'left');
    assert.deepEqual(actual.beforeSpawn.slice(0,4), expected.row); assert.equal(actual.scoreDelta, expected.score);
  }
});

test('20,000 seeded moves preserve mass, deterministic state and valid transitions', () => {
  const directions = ['left','down','right','up'];
  for (let seed = 1; seed <= 100; seed++) {
    let state = initialState(seed);
    for (let turn = 0; turn < 200; turn++) {
      if (state.status === 'won') state = continueGame(state);
      const direction = directions[(turn * 7 + seed) % 4]; const before = structuredClone(state);
      const a = move(state, direction); const b = move(state, direction);
      assert.deepEqual(a, b); assert.deepEqual(state, before); validateState(a.state);
      const sum = cells => cells.reduce((x,y) => x+y, 0);
      assert.equal(sum(a.beforeSpawn), sum(state.cells));
      assert.equal(sum(a.state.cells)-sum(state.cells), a.spawned?.value ?? 0);
      assert.equal(a.state.score - state.score, a.scoreDelta);
      assert.equal(a.state.moves - state.moves, a.changed ? 1 : 0);
      state = a.state;
    }
  }
});
