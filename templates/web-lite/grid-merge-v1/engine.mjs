/* global structuredClone */
/** A small deterministic rule core. No DOM, clocks, storage, network or model calls. */
export const RULE_VERSION = 'grid-merge-v1.0.0';
const MAX_TILE = 2 ** 30;
const DIRECTIONS = ['up', 'right', 'down', 'left'];
/** @typedef {{version:1,cells:number[],score:number,moves:number,seed:number,won:boolean,keepPlaying:boolean,status:'playing'|'won'|'lost'}} State */
/** @typedef {{type:string,from?:number,to?:number,value?:number}} GameEvent */

function random(seed) {
  let x = seed >>> 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  return { seed: x >>> 0, value: (x >>> 0) / 4294967296 };
}
function spawn(cells, seed) {
  const empty = cells.flatMap((value, i) => value === 0 ? [i] : []);
  if (!empty.length) return { cells: [...cells], seed, spawned: null };
  const position = random(seed); const draw = random(position.seed);
  const index = empty[Math.floor(position.value * empty.length)];
  const value = draw.value < 0.9 ? 2 : 4; const next = [...cells]; next[index] = value;
  return { cells: next, seed: draw.seed, spawned: { index, value } };
}
export function canMove(cells) {
  if (cells.includes(0)) return true;
  return cells.some((value, i) => value < MAX_TILE &&
    ((i % 4 < 3 && cells[i + 1] === value) || (i < 12 && cells[i + 4] === value)));
}
/** @returns {State} */
export function initialState(seed) {
  if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff) throw new Error('Invalid seed');
  const first = spawn(Array(16).fill(0), seed); const second = spawn(first.cells, first.seed);
  return { version: 1, cells: second.cells, seed: second.seed, score: 0, moves: 0,
    won: false, keepPlaying: false, status: 'playing' };
}
/** @param {unknown} value @returns {State} */
export function validateState(value) {
  if (!value || typeof value !== 'object') throw new Error('Invalid state');
  const s = /** @type {State} */ (value);
  if (s.version !== 1 || !Array.isArray(s.cells) || s.cells.length !== 16 || s.cells.some(v =>
    !Number.isInteger(v) || v < 0 || v > MAX_TILE || (v !== 0 && (v < 2 || !Number.isInteger(Math.log2(v)))))) throw new Error('Invalid board');
  if (![s.score,s.moves].every(n => Number.isSafeInteger(n) && n >= 0) ||
    !Number.isInteger(s.seed) || s.seed < 1 || s.seed > 0xffffffff) throw new Error('Invalid counters');
  if (typeof s.won !== 'boolean' || typeof s.keepPlaying !== 'boolean' ||
    !['playing','won','lost'].includes(s.status)) throw new Error('Invalid flags');
  const reached = s.cells.some(v => v >= 2048);
  if (s.won !== reached || (s.keepPlaying && !s.won) ||
    (s.status === 'won' && (!s.won || s.keepPlaying)) ||
    (s.status === 'playing' && s.won && !s.keepPlaying) ||
    (s.status === 'lost' && canMove(s.cells))) throw new Error('Contradictory state');
  return s;
}
function lineIndices(direction, line) {
  return Array.from({ length: 4 }, (_, j) => {
    if (direction === 'left') return line * 4 + j;
    if (direction === 'right') return line * 4 + 3 - j;
    if (direction === 'up') return j * 4 + line;
    return (3 - j) * 4 + line;
  });
}
/** @param {State} input @param {string} direction */
export function move(input, direction) {
  validateState(input);
  if (!DIRECTIONS.includes(direction)) throw new Error('Invalid direction');
  const state = structuredClone(input); const beforeSpawn = [...state.cells];
  /** @type {GameEvent[]} */ const events = [];
  const unchanged = () => ({ state, beforeSpawn, changed: false, scoreDelta: 0, events, spawned: null });
  if (state.status !== 'playing') return unchanged();
  if (!canMove(state.cells)) { state.status = 'lost'; return unchanged(); }
  let scoreDelta = 0;
  for (let line = 0; line < 4; line++) {
    const indices = lineIndices(direction, line);
    const source = indices.filter(i => state.cells[i]).map(i => ({ from: i, value: state.cells[i] }));
    const out = []; let cursor = 0;
    while (cursor < source.length) {
      const first = source[cursor]; const second = source[cursor + 1]; const to = indices[out.length];
      if (second && first.value === second.value && first.value < MAX_TILE) {
        const value = first.value * 2; out.push(value); scoreDelta += value;
        events.push({ type: 'slide', from: first.from, to, value: first.value },
          { type: 'slide', from: second.from, to, value: second.value }, { type: 'merge', to, value });
        cursor += 2;
      } else {
        out.push(first.value);
        if (first.from !== to) events.push({ type: 'slide', from: first.from, to, value: first.value });
        cursor++;
      }
    }
    indices.forEach((index, i) => { beforeSpawn[index] = out[i] ?? 0; });
  }
  if (beforeSpawn.every((value, i) => value === input.cells[i])) return unchanged();
  const next = spawn(beforeSpawn, state.seed); state.cells = next.cells; state.seed = next.seed;
  state.score += scoreDelta; state.moves++; state.won = state.won || state.cells.some(v => v >= 2048);
  if (next.spawned) events.push({ type: 'spawn', to: next.spawned.index, value: next.spawned.value });
  state.status = state.won && !state.keepPlaying ? 'won' : canMove(state.cells) ? 'playing' : 'lost';
  validateState(state);
  return { state, beforeSpawn, changed: true, scoreDelta, events, spawned: next.spawned };
}
/** @param {State} input @returns {State} */
export function continueGame(input) {
  validateState(input); const state = structuredClone(input);
  if (state.status === 'won') { state.keepPlaying = true; state.status = canMove(state.cells) ? 'playing' : 'lost'; }
  return state;
}
/** @param {State} state @param {number} best @param {string} theme */
export function encodeSave(state, best, theme) {
  validateState(state);
  if (!Number.isSafeInteger(best) || best < state.score || !['observatory','orchard'].includes(theme)) throw new Error('Invalid save metadata');
  return JSON.stringify({ ruleVersion: RULE_VERSION, theme, state, best });
}
/** @param {string|null} raw @param {string} theme @returns {{state:State,best:number}|null} */
export function decodeSave(raw, theme) {
  if (typeof raw !== 'string' || raw.length > 10000) return null;
  try {
    const value = JSON.parse(raw);
    if (value.ruleVersion !== RULE_VERSION || value.theme !== theme) return null;
    const state = validateState(value.state);
    if (state.cells.filter(Boolean).length < 2 || !Number.isSafeInteger(value.best) || value.best < state.score) return null;
    return { state: structuredClone(state), best: value.best };
  } catch { return null; }
}
/** Touch and pointer use the same bounded, testable gesture classifier. */
export function swipeDirection(dx, dy, width) {
  if (![dx,dy,width].every(Number.isFinite) || width <= 0) return null;
  const x = Math.abs(dx); const y = Math.abs(dy);
  if (Math.max(x,y) < Math.max(18, width * 0.045) || Math.max(x,y) < Math.min(x,y) * 1.15) return null;
  return x > y ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
}
