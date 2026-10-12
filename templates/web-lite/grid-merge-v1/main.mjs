/* global document, window, localStorage, crypto, location, performance, setTimeout, requestAnimationFrame, URLSearchParams */
import { initialState, move, continueGame, decodeSave, encodeSave, swipeDirection, RULE_VERSION } from './engine.mjs';
import { THEMES, resolveTheme } from './themes.mjs';

const themeId = resolveTheme(new URLSearchParams(location.search).get('theme') ?? document.body.dataset.initialTheme);
const theme = THEMES[themeId]; const storageKey = `${RULE_VERSION}:${themeId}`;
const element = id => document.getElementById(id);
const board = element('board'); const tiles = element('tiles');
const dialog = /** @type {HTMLDialogElement} */ (element('dialog'));
const progress = /** @type {HTMLProgressElement} */ (element('progress'));
const feedback = element('feedback');
let stored = null;
try { stored = decodeSave(localStorage.getItem(storageKey), themeId); } catch { /* storage can be unavailable */ }
const freshSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] || 1;
let state = stored?.state ?? initialState(freshSeed()); let best = stored?.best ?? 0;
let busy = false; let pending = null; let pointer = null;
let dialogMode = ''; let primaryAction = () => {}; let secondaryAction = () => {};
let startedAt = performance.now(); let firstMergeMs = null;
const inputTrace = []; const eventTrace = []; let maxTile = Math.max(...state.cells);
const announce = text => { feedback.textContent = text; };
const trace = (array, value) => { array.push(value); if (array.length > 300) array.shift(); };

function save() {
  best = Math.max(best, state.score);
  try { localStorage.setItem(storageKey, encodeSave(state, best, themeId)); }
  catch { element('storage-warning').textContent = 'Saving is unavailable. This game will be lost when you close the page.'; }
}
function render(events = []) {
  tiles.replaceChildren();
  state.cells.forEach((value, i) => {
    const tile = document.createElement('div'); tile.setAttribute('role','gridcell');
    tile.setAttribute('aria-label', `Row ${Math.floor(i/4)+1}, column ${i%4+1}: ${value || 'empty'}`);
    if (!value) { tile.className = 'empty-cell'; tile.hidden = true; tiles.append(tile); return; }
    tile.className = 'tile'; tile.dataset.index = String(i); tile.dataset.rank = String(Math.min(11,Math.log2(value)));
    tile.dataset.large = String(value >= 1024); tile.textContent = String(value);
    tile.style.setProperty('--x', String(i % 4)); tile.style.setProperty('--y', String(Math.floor(i / 4)));
    if (events.some(e => e.type === 'merge' && e.to === i)) tile.classList.add('merge');
    else if (events.some(e => e.type === 'spawn' && e.to === i)) tile.classList.add('spawn');
    tiles.append(tile);
  });
  element('score').textContent = String(state.score); element('best').textContent = String(best);
  element('moves').textContent = `${state.moves} ${state.moves === 1 ? 'move' : 'moves'}`;
  const highest = Math.max(...state.cells); const target = [32,64,128,256,512,1024,2048].find(n => n > highest) ?? 2048;
  element('milestone-value').textContent = String(target); progress.max = Math.log2(target); progress.value = Math.min(Math.log2(highest), progress.max);
  element('board-state').textContent = state.status === 'lost' ? 'NO MOVES LEFT' : state.status === 'won' ? 'YOU MADE IT' : state.cells.filter(v => v === 0).length <= 3 ? 'MAKE A LITTLE ROOM' : 'YOUR NEXT MOVE';
}
function showDialog(mode, title, copy, primaryLabel, primary, secondaryLabel, secondary) {
  dialogMode = mode; primaryAction = primary; secondaryAction = secondary;
  element('dialog-title').textContent = title; element('dialog-copy').textContent = copy;
  element('dialog-primary').textContent = primaryLabel; element('dialog-secondary').textContent = secondaryLabel;
  element('dialog-eyebrow').textContent = mode === 'won' ? 'A BRIGHT LITTLE VICTORY' : mode === 'lost' ? 'ANOTHER WAY TO GROW' : 'A FRESH PERSPECTIVE';
  if (!dialog.open) dialog.showModal();
}
function closeDialog() { dialog.close(); dialogMode = ''; board.focus({preventScroll:true}); }
function restart() {
  closeDialog(); state = initialState(freshSeed()); pending = null; firstMergeMs = null; startedAt = performance.now();
  inputTrace.length = 0; eventTrace.length = 0; maxTile = Math.max(...state.cells); save(); render();
  element('gain').textContent = ''; announce('A fresh board. Find your first match.');
}
function terminal() {
  if (state.status === 'lost') showDialog('lost', 'A little room next time.',
    `No empty spaces or matching neighbours remain. You scored ${state.score}. A different direction can change everything.`, 'Play again', restart, 'See my board', closeDialog);
  if (state.status === 'won') showDialog('won', 'You found your light.',
    `2048, one small move at a time. Your score is ${state.score}. Keep exploring or start fresh.`, 'Keep going', () => { state = continueGame(state); save(); closeDialog(); render(); terminal(); }, 'Start fresh', restart);
}
async function act(direction, source) {
  if (dialog.open) return;
  if (busy) { pending = { direction, source }; return; }
  if (state.status !== 'playing') { terminal(); return; }
  trace(inputTrace, { direction, source, atMs: Math.round(performance.now() - startedAt) });
  const result = move(state, direction);
  if (!result.changed) {
    state = result.state; board.classList.remove('nudge'); requestAnimationFrame(() => board.classList.add('nudge'));
    announce('That direction is full. Try another.'); render(); terminal(); return;
  }
  busy = true; const merges = result.events.filter(e => e.type === 'merge');
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 115;
  try {
    const pitch = (tiles.clientWidth + parseFloat(window.getComputedStyle(board).getPropertyValue('--gap'))) / 4;
    for (const event of result.events.filter(e => e.type === 'slide')) {
      const tile = tiles.querySelector(`[data-index="${event.from}"]`);
      if (tile) tile.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${(event.to%4-event.from%4)*pitch}px,${(Math.floor(event.to/4)-Math.floor(event.from/4))*pitch}px)` }], { duration, fill: 'forwards', easing: 'ease-out' });
    }
    state = result.state; save();
    trace(eventTrace, { turn: state.moves, events: result.events });
    if (merges.length && firstMergeMs === null) firstMergeMs = Math.round(performance.now() - startedAt);
    if (duration) await new Promise(resolve => setTimeout(resolve, duration));
    render(result.events); element('gain').textContent = result.scoreDelta ? `+${result.scoreDelta}` : '';
    const highest = Math.max(...state.cells);
    if (highest > maxTile && highest >= 32) announce(`${highest}! A new ${theme.unit}. Keep making room.`);
    else if (merges.length > 1) announce(`${merges.length} matches. +${result.scoreDelta}. Nicely connected.`);
    else if (merges.length) announce(`A little brighter. +${result.scoreDelta}.`);
    else announce('Make room, then bring equal numbers together.');
    maxTile = Math.max(maxTile, highest); terminal();
  } finally {
    busy = false; const queued = pending; pending = null;
    if (queued && !dialog.open) void act(queued.direction, queued.source);
  }
}

board.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0 || dialog.open) return;
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, type: event.pointerType };
  board.setPointerCapture(event.pointerId);
});
board.addEventListener('pointerup', event => {
  if (!pointer || pointer.id !== event.pointerId) return;
  const start = pointer; pointer = null;
  const direction = swipeDirection(event.clientX-start.x, event.clientY-start.y, board.clientWidth);
  if (direction) void act(direction, start.type === 'touch' ? 'touch' : 'pointer');
});
board.addEventListener('pointercancel', () => { pointer = null; });
board.addEventListener('lostpointercapture', () => { pointer = null; });
window.addEventListener('blur', () => { pointer = null; pending = null; });
const keyDirections = { ArrowUp:'up',ArrowRight:'right',ArrowDown:'down',ArrowLeft:'left',w:'up',d:'right',s:'down',a:'left' };
document.addEventListener('keydown', event => {
  const direction = keyDirections[event.key];
  if (!direction || dialog.open || event.altKey || event.ctrlKey || event.metaKey || event.repeat ||
    /** @type {HTMLElement} */ (event.target)?.closest('input,textarea,select,[contenteditable="true"]')) return;
  event.preventDefault(); void act(direction, 'keyboard');
});
document.querySelectorAll('[data-direction]').forEach(button => button.addEventListener('click', () => void act(/** @type {HTMLElement} */ (button).dataset.direction, 'direction-button')));
element('new-game').addEventListener('click', () => {
  if (busy) return;
  if (state.moves === 0 || state.status === 'lost') restart();
  else showDialog('reset', 'Start a new game?', 'This replaces your current board. Your best score stays.', 'Start fresh', restart, 'Keep this game', closeDialog);
});
element('dialog-primary').addEventListener('click', () => primaryAction());
element('dialog-secondary').addEventListener('click', () => secondaryAction());
dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
document.querySelectorAll('[data-theme-id]').forEach(button => {
  const value = /** @type {HTMLElement} */ (button).dataset.themeId;
  button.setAttribute('aria-pressed', String(value === themeId));
  button.addEventListener('click', () => { if (!busy && value !== themeId) { save(); location.search = `?theme=${value}`; } });
});
document.body.dataset.theme = themeId; document.title = `${theme.name} - Play Lab`;
element('title').textContent = theme.name; element('subtitle').textContent = theme.subtitle; element('eyebrow').textContent = theme.eyebrow;
element('milestone-label').textContent = themeId === 'orchard' ? 'NEXT GROWTH' : 'NEXT LIGHT';
for (let i=0;i<16;i++) { const slot = document.createElement('div'); slot.className='slot'; element('slots').append(slot); }
// Read-only instrumentation: no reset, seed setter, teleport or state injection API.
Object.defineProperty(window, '__GRID_MERGE__', { value: Object.freeze({ getSnapshot: () => JSON.parse(JSON.stringify({ ruleVersion:RULE_VERSION, theme:themeId, state, best, busy, firstMergeMs, inputTrace, eventTrace, dialogMode })) }), writable:false, configurable:false });
save(); render(); terminal();
