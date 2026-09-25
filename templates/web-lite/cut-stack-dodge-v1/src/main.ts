import generatedConfig from './generated/game-config.json';
import generatedReferenceLevel from './generated/reference-level.json';
import generatedReferenceLevelLayout from './generated/reference-level-layout.json';
import {
  MOTHER_TEMPLATE_ID,
  advanceFrame,
  advanceTicks as simulateTicks,
  createInitialState,
  replay as restartRun,
  setRandomSeed as applyRandomSeed,
  tap as applyTap,
  type CourseObjectState,
  type CutStackLevelConfig,
  type CutStackState,
} from './simulation.js';
import { loadCutStackRuntime, type LoadedCutStackRuntime } from './runtime-loader.js';
import './style.css';

type GeneratedConfig = {
  title: string;
  theme: string;
  palette: string[];
};

const config = generatedConfig as GeneratedConfig;
export const CURRENT_SAVE_VERSION = 1;
const SAVE_KEY = `ai-game-factory:cut-stack-dodge:save-v${CURRENT_SAVE_VERSION}:${config.title}`;
const WORLD = { width: 1_000, height: 600 };
const LEGACY_LEVEL: CutStackLevelConfig = {
  fixedStepSeconds: 1 / 60,
  gravity: 760,
  tapImpulse: -430,
  forwardSpeed: 260,
  angularImpulse: Math.PI * 2,
  failY: 650,
  finishX: 920,
  player: { x: 80, y: 420, radius: 18, angle: Math.PI / 2 },
  objects: [
    { id: 'start-support', role: 'support', x: 12, y: 455, width: 145, height: 54 },
    { id: 'cuttable-1', role: 'cuttable', x: 220, y: 150, width: 46, height: 380 },
    { id: 'cuttable-2', role: 'cuttable', x: 350, y: 105, width: 52, height: 340 },
    { id: 'hazard-1', role: 'hazard', x: 470, y: 430, width: 72, height: 170 },
    { id: 'landing-support', role: 'support', x: 590, y: 500, width: 150, height: 46 },
    { id: 'cuttable-3', role: 'cuttable', x: 690, y: 130, width: 56, height: 360 },
    { id: 'finish-1', role: 'finish', x: 915, y: 80, width: 26, height: 440 },
  ],
};

const LOADED_RUNTIME: LoadedCutStackRuntime = loadCutStackRuntime(generatedReferenceLevel, generatedReferenceLevelLayout, LEGACY_LEVEL);
const LEVEL: CutStackLevelConfig = LOADED_RUNTIME.level;

type PersistedGame = {
  version: typeof CURRENT_SAVE_VERSION;
  runtimeDataHash: string | null;
  layoutHash: string;
  playerObjectId: string;
  objectIds: string[];
  state: CutStackState;
};

function saveIdentity() {
  return {
    runtimeDataHash: LOADED_RUNTIME.runtimeBinding?.runtimeDataHash ?? null,
    layoutHash: LOADED_RUNTIME.layoutHash,
    playerObjectId: LOADED_RUNTIME.playerObjectId,
    objectIds: [...LOADED_RUNTIME.objectIds],
  };
}

function hasCurrentObjectList(value: CutStackState): boolean {
  if (!Array.isArray(value.objects)) return false;
  const ids = value.objects.map((object) => object.id);
  if (JSON.stringify(ids) !== JSON.stringify(LOADED_RUNTIME.objectIds)) return false;
  const roles = new Map(LEVEL.objects.map((object) => [object.id, object.role]));
  return value.objects.every((object) => roles.get(object.id) === object.role);
}

function loadState(): CutStackState {
  try {
    const value = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as PersistedGame | null;
    if (value?.version === CURRENT_SAVE_VERSION
      && value.runtimeDataHash === saveIdentity().runtimeDataHash
      && value.layoutHash === saveIdentity().layoutHash
      && value.playerObjectId === saveIdentity().playerObjectId
      && JSON.stringify(value.objectIds) === JSON.stringify(saveIdentity().objectIds)
      && value.state?.version === 1
      && typeof value.state.phase === 'string'
      && hasCurrentObjectList(value.state)) return value.state;
  } catch { /* a malformed or unavailable save starts a clean run */ }
  return createInitialState(LEVEL);
}

let state = loadState();
let lastFrameMs = performance.now();
let lastRenderedEventSeq = state.events.at(-1)?.seq ?? 0;
let impactUntil = 0;
let shakeUntil = 0;
let replayFeedbackUntil = 0;

function requireElement<T extends Element>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error(`cut-stack-dodge template DOM contract is missing ${selector}`);
  return value;
}

const canvas = requireElement<HTMLCanvasElement>('#game-canvas');
const drawingContext = canvas.getContext('2d');
if (!drawingContext) throw new Error('cut-stack-dodge template requires a 2D canvas context');
const context = drawingContext;
const title = requireElement<HTMLElement>('#title');
const status = requireElement<HTMLElement>('#status');
const cuts = requireElement<HTMLElement>('#cuts');
const attempt = requireElement<HTMLElement>('#attempt');
const progress = requireElement<HTMLElement>('#progress-fill');
const impact = requireElement<HTMLElement>('#impact-label');
const primary = requireElement<HTMLButtonElement>('#primary-action');
const replayControl = requireElement<HTMLButtonElement>('#replay-button');

function saveState(): void {
  try {
    const identity = saveIdentity();
    const value: PersistedGame = { version: CURRENT_SAVE_VERSION, ...identity, state };
    localStorage.setItem(SAVE_KEY, JSON.stringify(value));
  } catch { /* gameplay remains available without persistence */ }
}

function publicState(): CutStackState {
  return structuredClone(state);
}

function resetGame(): CutStackState {
  state = createInitialState(LEVEL);
  replayFeedbackUntil = 0;
  clearImpactFeedback();
  try { localStorage.removeItem(SAVE_KEY); } catch { /* state is already reset in memory */ }
  renderHud();
  return publicState();
}

function getState(): CutStackState {
  return publicState();
}

function setRandomSeed(seed: number): CutStackState {
  state = applyRandomSeed(state, seed);
  saveState();
  return publicState();
}

function advanceTicks(count: number): CutStackState {
  state = simulateTicks(LEVEL, state, count);
  saveState();
  renderHud();
  return publicState();
}

function tap(): CutStackState {
  state = applyTap(state);
  saveState();
  renderHud();
  return publicState();
}

function replay(): CutStackState {
  state = restartRun(LEVEL, state);
  replayFeedbackUntil = performance.now() + 180;
  lastRenderedEventSeq = 0;
  clearImpactFeedback();
  saveState();
  renderHud();
  return publicState();
}

function getEvents(sinceSeq = 0) {
  return structuredClone(state.events.filter((event) => event.seq > sinceSeq));
}

type GameTestApi = {
  templateId: typeof MOTHER_TEMPLATE_ID;
  resetGame: typeof resetGame;
  getState: typeof getState;
  setRandomSeed: typeof setRandomSeed;
  advanceTicks: typeof advanceTicks;
  tap: typeof tap;
  replay: typeof replay;
  getEvents: typeof getEvents;
};

function placement(object: { x: number; y: number; width: number; height: number }, role?: CourseObjectState['role'] | 'player' | 'replay-control') {
  const centerX = (object.x + object.width / 2) / WORLD.width;
  const centerY = (object.y + object.height / 2) / WORLD.height;
  const horizontalBand = centerX < 0.2 ? 'far-left' : centerX < 0.4 ? 'left' : centerX < 0.6 ? 'center' : centerX < 0.8 ? 'right' : 'far-right';
  const verticalBand = centerY < 0.2 ? 'top' : centerY < 0.4 ? 'upper' : centerY < 0.6 ? 'middle' : centerY < 0.8 ? 'lower' : 'bottom';
  const extent = (value: number) => value < 0.06 ? 'tiny' : value < 0.16 ? 'small' : value < 0.32 ? 'medium' : value < 0.62 ? 'large' : 'span';
  // Recording contracts describe the interaction-facing orientation of each
  // semantic object. Preserve the authored extent bands while keeping this
  // projection stable for circular players and vertical finish markers.
  const orientationBand = role === 'player' || role === 'finish' || role === 'hazard' || role === 'replay-control'
    ? 'horizontal'
    : object.width > object.height ? 'horizontal' : 'vertical';
  return { horizontalBand, verticalBand, widthBand: extent(object.width / WORLD.width), heightBand: extent(object.height / WORLD.height), orientationBand };
}

function normalizedVisibleBounds(object: { x: number; y: number; width: number; height: number; fallOffset?: number; lifecycle?: CourseObjectState['lifecycle'] }, cameraX = 0) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || window.innerWidth <= 0 || window.innerHeight <= 0) return undefined;
  if (object.lifecycle === 'settled') return undefined;
  let x = object.x - cameraX;
  let y = object.y + (object.fallOffset ?? 0);
  let width = object.width;
  let height = object.height;
  if (object.lifecycle === 'falling') {
    const angle = (object.fallOffset ?? 0) * 0.018;
    const halfWidth = (object.width + 16) / 2;
    const halfHeight = object.height / 2;
    const extentX = Math.abs(Math.cos(angle)) * halfWidth + Math.abs(Math.sin(angle)) * halfHeight;
    const extentY = Math.abs(Math.sin(angle)) * halfWidth + Math.abs(Math.cos(angle)) * halfHeight;
    x += object.width / 2 - extentX;
    y += object.height / 2 - extentY;
    width = extentX * 2;
    height = extentY * 2;
  }
  const scale = Math.min(rect.width / WORLD.width, rect.height / WORLD.height);
  const offsetX = (rect.width - WORLD.width * scale) / 2;
  const offsetY = (rect.height - WORLD.height * scale) / 2;
  const left = Math.max(0, Math.min(window.innerWidth, rect.left + offsetX + x * scale));
  const top = Math.max(0, Math.min(window.innerHeight, rect.top + offsetY + y * scale));
  const right = Math.max(0, Math.min(window.innerWidth, rect.left + offsetX + (x + width) * scale));
  const bottom = Math.max(0, Math.min(window.innerHeight, rect.top + offsetY + (y + height) * scale));
  if (right <= left || bottom <= top) return undefined;
  return { x: left / window.innerWidth, y: top / window.innerHeight, width: (right - left) / window.innerWidth, height: (bottom - top) / window.innerHeight };
}

function normalizedDomBounds(element: Element) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || window.innerWidth <= 0 || window.innerHeight <= 0) return undefined;
  const left = Math.max(0, Math.min(window.innerWidth, rect.left));
  const top = Math.max(0, Math.min(window.innerHeight, rect.top));
  const right = Math.max(0, Math.min(window.innerWidth, rect.right));
  const bottom = Math.max(0, Math.min(window.innerHeight, rect.bottom));
  if (right <= left || bottom <= top) return undefined;
  return { x: left / window.innerWidth, y: top / window.innerHeight, width: (right - left) / window.innerWidth, height: (bottom - top) / window.innerHeight };
}

function checkpointId(): string {
  const prefix = LOADED_RUNTIME.runtimeBinding ? 'reference' : 'checkpoint';
  if (state.phase === 'failed' || state.phase === 'won') return `${prefix}-terminal`;
  if (state.phase === 'ready') {
    if (LOADED_RUNTIME.runtimeBinding) return performance.now() < replayFeedbackUntil ? 'reference-replay' : 'reference-ready';
    return state.attempt > 1 ? 'checkpoint-replay' : 'checkpoint-ready';
  }
  if (state.cuts > 0) return LOADED_RUNTIME.runtimeBinding ? 'reference-interaction' : 'checkpoint-aftermath';
  return LOADED_RUNTIME.runtimeBinding ? 'reference-input' : 'checkpoint-input';
}

function lifecycleForPlayer() {
  if (state.phase === 'failed' || state.phase === 'won') return LOADED_RUNTIME.runtimeBinding ? 'settled' : 'terminal';
  return state.phase === 'ready' ? 'ready' : 'moving';
}

function roleFor(object: CourseObjectState) {
  return object.role;
}

function cameraOffset(): number {
  return Math.max(0, Math.min(LEVEL.finishX - 300, state.player.x - 260));
}

function getSnapshot() {
  const terminal = state.phase === 'failed' || state.phase === 'won';
  const recording = Boolean(LOADED_RUNTIME.runtimeBinding);
  const replayFeedback = recording && state.phase === 'ready' && performance.now() < replayFeedbackUntil;
  const phase = terminal ? 'terminal' : replayFeedback ? 'replay' : state.cuts > 0 ? 'interaction' : state.phase === 'playing' ? 'input' : 'ready';
  const cameraX = cameraOffset();
  const lifecycleForObject = (object: CourseObjectState) => {
    if (!recording) return object.lifecycle === 'ready' ? 'ready' : object.lifecycle;
    if (terminal) {
      if (object.role === 'finish') return 'resolved';
      if (object.role === 'hazard' || object.role === 'cuttable') return 'hidden';
    }
    if (phase === 'replay') return object.role === 'finish' || object.role === 'hazard' || object.role === 'cuttable' ? 'hidden' : 'ready';
    if (object.role === 'cuttable' && state.cuts > 0) return 'resolved';
    return 'ready';
  };
  const visibleForObject = (object: CourseObjectState) => recording
    ? !(phase === 'replay' && object.role !== 'support') && !(terminal && (object.role === 'hazard' || object.role === 'cuttable'))
    : object.lifecycle !== 'settled';
  const feedbackId = recording ? `feedback-${phase}` : undefined;
  return {
    checkpointId: checkpointId(),
    phase,
    objectStates: [
      {
        semanticId: LOADED_RUNTIME.playerObjectId,
        role: 'player',
        lifecycle: lifecycleForPlayer(),
        visible: true,
        placement: placement({ x: state.player.x - cameraX - state.player.radius, y: state.player.y - state.player.radius, width: state.player.radius * 2, height: state.player.radius * 2 }, 'player'),
        boundsNormalized: normalizedVisibleBounds({ x: state.player.x - state.player.radius, y: state.player.y - state.player.radius, width: state.player.radius * 2, height: state.player.radius * 2 }, cameraX),
        coordinateSpace: 'screen-normalized',
      },
      ...state.objects.map((object) => ({
        semanticId: object.id,
        role: roleFor(object),
        lifecycle: lifecycleForObject(object),
        visible: visibleForObject(object),
        placement: placement({ ...object, x: object.x - cameraX }, object.role),
        boundsNormalized: normalizedVisibleBounds(object, cameraX),
        coordinateSpace: 'screen-normalized',
        ...(object.role === 'cuttable' ? { renderColor: objectRenderColor(object) } : {}),
      })),
      {
        semanticId: 'replay-control',
        role: 'replay-control',
        lifecycle: terminal ? 'ready' : phase === 'replay' ? 'resolved' : 'hidden',
        visible: terminal || phase === 'replay',
        placement: placement({ x: WORLD.width * 0.4, y: WORLD.height * 0.78, width: WORLD.width * 0.2, height: WORLD.height * 0.1 }, 'replay-control'),
        boundsNormalized: normalizedDomBounds(replayControl),
        coordinateSpace: 'screen-normalized',
      },
    ],
    observedRelationIds: recording
      ? (state.objects.some((object) => object.role === 'cuttable') && state.objects.some((object) => object.role === 'support') ? ['target-supported'] : [])
      : state.objects.filter((object) => object.lifecycle === 'falling').map((object) => `${object.id}:resolved-after-player`),
    cameraMode: recording ? 'follow' : state.player.x > 320 ? 'follow' : 'static',
    visibleFeedbackIds: recording ? [feedbackId!] : state.events.slice(-4).map((event) => `${event.type}:${event.objectId ?? 'player'}`),
    ...(LOADED_RUNTIME.runtimeBinding ? { runtimeBinding: LOADED_RUNTIME.runtimeBinding } : {}),
    layoutHash: LOADED_RUNTIME.layoutHash,
    terminal: {
      reached: terminal,
      result: recording && state.phase === 'won' ? 'level-complete' : state.phase,
      causeVisible: state.phase !== 'failed' || state.failureCause !== null,
      settlementVisible: terminal,
    },
  };
}

function normalizedControlCenter(control: HTMLElement) {
  const bounds = control.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (bounds.left + bounds.width / 2) / window.innerWidth)),
    y: Math.min(1, Math.max(0, (bounds.top + bounds.height / 2) / window.innerHeight)),
  };
}

function getNaturalInputTarget(actionId: string) {
  return normalizedControlCenter(/replay|retry|restart/iu.test(actionId) ? replayControl : primary);
}

declare global {
  interface Window {
    __GAME_TEST__: GameTestApi;
    __REFERENCE_LEVEL_TEST__: {
      getSnapshot: typeof getSnapshot;
      getNaturalInputTarget: typeof getNaturalInputTarget;
    };
  }
}

window.__GAME_TEST__ = { templateId: MOTHER_TEMPLATE_ID, resetGame, getState, setRandomSeed, advanceTicks, tap, replay, getEvents };
window.__REFERENCE_LEVEL_TEST__ = { getSnapshot, getNaturalInputTarget };

function failureCauseText(cause: string | null): string {
  return cause === 'fall' ? '坠落出界' : '撞上粉色尖刺';
}

function clearImpactFeedback(): void {
  impactUntil = 0;
  shakeUntil = 0;
  impact.textContent = '';
  impact.classList.remove('visible');
}

function phaseText(): string {
  if (state.phase === 'failed') return `挑战失败 · ${failureCauseText(state.failureCause)}`;
  if (state.phase === 'won') return `完成训练 · 共切开 ${state.cuts} 个目标`;
  if (state.phase === 'ready') return state.attempt > 1 ? '调整节奏，再来一次' : '点击起步，观察刀刃方向';
  return state.cuts > 0 ? '保持节奏，避开红色危险区' : '刀刃飞行中';
}

function renderHud(): void {
  title.textContent = config.title;
  status.textContent = phaseText();
  cuts.textContent = `切开 ${state.cuts}`;
  attempt.textContent = `第 ${state.attempt} 次`;
  const completion = Math.min(1, Math.max(0, (state.player.x - LEVEL.player.x) / (LEVEL.finishX - LEVEL.player.x)));
  progress.style.width = `${Math.round(completion * 100)}%`;
  const terminal = state.phase === 'failed' || state.phase === 'won';
  replayControl.hidden = !terminal;
  primary.hidden = terminal;
}

function roundedRect(x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function objectRenderColor(object: CourseObjectState): string {
  const palette = config.palette.length > 1 ? config.palette.slice(1) : ['#ffb38a', '#7ec8ff', '#ffd36e', '#a7d8bc'];
  return palette[Math.abs(object.id.length) % palette.length] ?? '#ffb38a';
}

function drawObject(object: CourseObjectState, cameraX: number): void {
  if (object.lifecycle === 'settled') return;
  const x = object.x - cameraX;
  const y = object.y + object.fallOffset;
  if (x + object.width < -80 || x > WORLD.width + 80) return;
  if (object.role === 'support') {
    roundedRect(x, y, object.width, object.height, 14);
    // 参考呈现：白色支撑面、明亮粉彩和简单低多边形几何。
    context.fillStyle = '#fffdf7';
    context.fill();
    context.strokeStyle = '#c7d9df';
    context.lineWidth = 3;
    context.stroke();
    context.fillStyle = '#dff2ff';
    context.fillRect(x + 8, y + Math.min(12, object.height * 0.25), Math.max(0, object.width - 16), 5);
    return;
  }
  if (object.role === 'hazard') {
    const pulse = 0.72 + Math.sin(performance.now() / 110) * 0.12;
    context.save();
    context.shadowColor = '#ff6f8f';
    context.shadowBlur = 20;
    context.fillStyle = `rgba(255, 111, 143, ${pulse})`;
    context.beginPath();
    const teeth = Math.max(2, Math.floor(object.width / 22));
    context.moveTo(x, y + object.height);
    for (let index = 0; index < teeth; index += 1) {
      const left = x + index * object.width / teeth;
      const right = x + (index + 1) * object.width / teeth;
      context.lineTo((left + right) / 2, y + 8);
      context.lineTo(right, y + object.height);
    }
    context.closePath();
    context.fill();
    context.strokeStyle = '#e85e7f';
    context.lineWidth = 3;
    context.stroke();
    context.restore();
    return;
  }
  if (object.role === 'finish') {
    context.fillStyle = '#8bcbd8';
    context.fillRect(x, y, 8, object.height);
    context.fillStyle = '#fffdf7';
    context.beginPath();
    context.moveTo(x + 8, y + 12);
    context.lineTo(x + 58, y + 34);
    context.lineTo(x + 8, y + 56);
    context.closePath();
    context.fill();
    context.strokeStyle = '#8bcbd8';
    context.stroke();
    return;
  }

  const color = objectRenderColor(object);
  context.save();
  context.shadowColor = color;
  context.shadowBlur = object.lifecycle === 'falling' ? 22 : 10;
  if (object.lifecycle === 'falling') {
    context.translate(x + object.width / 2, y + object.height / 2);
    context.rotate(object.fallOffset * 0.018);
    context.fillStyle = color;
    roundedRect(-object.width / 2 - 8, -object.height / 2, object.width / 2, object.height, 9);
    context.fill();
    roundedRect(8, -object.height / 2, object.width / 2, object.height, 9);
    context.fill();
  } else {
    roundedRect(x, y, object.width, object.height, 12);
    context.fillStyle = color;
    context.fill();
    context.fillStyle = '#ffffffaa';
    context.fillRect(x + 8, y + 10, Math.max(4, object.width - 16), 5);
  }
  context.restore();
}

function drawBlade(cameraX: number): void {
  const { x, y, angle } = state.player;
  context.save();
  context.translate(x - cameraX, y);
  context.rotate(angle);
  context.shadowColor = '#7ec8ff';
  context.shadowBlur = 16;
  const gradient = context.createLinearGradient(-38, 0, 38, 0);
  gradient.addColorStop(0, '#74b8e8');
  gradient.addColorStop(0.56, '#fffdf7');
  gradient.addColorStop(1, '#7ec8ff');
  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(-38, -9);
  context.lineTo(28, -9);
  context.lineTo(43, 0);
  context.lineTo(28, 9);
  context.lineTo(-38, 9);
  context.closePath();
  context.fill();
  context.fillStyle = '#ff8ca8';
  roundedRect(-49, -14, 13, 28, 5);
  context.fill();
  context.restore();
}

function drawScene(now: number): void {
  const cameraX = cameraOffset();
  const shake = now < shakeUntil ? Math.sin(now * 0.17) * 6 : 0;
  context.save();
  context.translate(shake, 0);
  const background = context.createLinearGradient(0, 0, 0, WORLD.height);
  background.addColorStop(0, '#bde5ff');
  background.addColorStop(0.62, '#eaf8ff');
  background.addColorStop(1, '#fffaf0');
  context.fillStyle = background;
  context.fillRect(-12, 0, WORLD.width + 24, WORLD.height);
  context.fillStyle = '#9fd5b8';
  context.beginPath();
  context.moveTo(0, 210);
  context.quadraticCurveTo(170, 120, 360, 210);
  context.quadraticCurveTo(540, 305, 760, 196);
  context.quadraticCurveTo(900, 125, WORLD.width, 205);
  context.lineTo(WORLD.width, WORLD.height);
  context.lineTo(0, WORLD.height);
  context.closePath();
  context.fill();
  context.fillStyle = '#bfe7c8';
  context.beginPath();
  context.moveTo(0, 300);
  context.quadraticCurveTo(190, 220, 420, 320);
  context.quadraticCurveTo(670, 390, WORLD.width, 280);
  context.lineTo(WORLD.width, WORLD.height);
  context.lineTo(0, WORLD.height);
  context.closePath();
  context.fill();
  for (const object of state.objects) drawObject(object, cameraX);
  drawBlade(cameraX);
  context.restore();

  const freshEvents = state.events.filter((event) => event.seq > lastRenderedEventSeq);
  for (const event of freshEvents) {
    if (event.type === 'cut') {
      impact.textContent = '利落切开';
      impactUntil = now + 520;
      shakeUntil = now + 120;
    } else if (event.type === 'hazard' || event.type === 'fall') {
      impact.textContent = '危险命中';
      impactUntil = now + 780;
      shakeUntil = now + 260;
    } else if (event.type === 'finish') {
      impact.textContent = '到达终点';
      impactUntil = now + 900;
    }
  }
  lastRenderedEventSeq = state.events.at(-1)?.seq ?? lastRenderedEventSeq;
  impact.classList.toggle('visible', now < impactUntil);
}

function frame(now: number): void {
  const frameSeconds = Math.max(0, (now - lastFrameMs) / 1_000);
  lastFrameMs = now;
  const beforeTick = state.tick;
  state = advanceFrame(LEVEL, state, frameSeconds);
  if (state.tick !== beforeTick && (state.tick % 30 === 0 || state.phase === 'failed' || state.phase === 'won')) saveState();
  renderHud();
  drawScene(now);
  requestAnimationFrame(frame);
}

function naturalTap(event?: Event): void {
  event?.preventDefault();
  tap();
}

canvas.addEventListener('pointerdown', naturalTap);
primary.addEventListener('pointerdown', (event) => { event.stopPropagation(); naturalTap(event); });
replayControl.addEventListener('pointerdown', (event) => { event.stopPropagation(); event.preventDefault(); replay(); });
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || event.repeat) return;
  event.preventDefault();
  if (state.phase === 'failed' || state.phase === 'won') replay();
  else tap();
});

renderHud();
requestAnimationFrame(frame);
