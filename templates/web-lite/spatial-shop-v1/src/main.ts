/* global document, localStorage, structuredClone, window */
import Phaser from 'phaser';
import generatedConfig from './generated/game-config.json';
import { joystickMove, keyboardMove, mergeMoveActions } from './input.js';
import {
  advanceGame,
  createInitialState,
  getCustomerSpawnInterval,
  grantCurrency as addCurrency,
  setPlayerPosition as placePlayer,
  setRandomSeed as applyRandomSeed,
  spawnCustomer as addCustomer,
  type GameState,
  type MoveInput,
  type Position,
  type SpatialShopConfig,
  type StationDefinition,
} from './simulation.js';
import './style.css';

type GeneratedConfig = {
  title: string;
  theme: string;
  content: { productName: string; customerName: string; currencyName: string };
  palette: string[];
  spatialShop: SpatialShopConfig;
};

const config = generatedConfig as GeneratedConfig;
const shop = config.spatialShop;
const SAVE_VERSION = 1;
const SAVE_KEY = `ai-game-factory:spatial-shop:${config.title}`;

function loadState(): GameState {
  try {
    const value = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as GameState | null;
    if (value?.version === SAVE_VERSION && value.player && value.stations && value.checkout) return value;
  } catch { return createInitialState(shop); }
  return createInitialState(shop);
}

let state = loadState();
let nextCustomerSpawnMs = state.elapsedMs + getCustomerSpawnInterval(shop, state);
let lastSavedMs = state.elapsedMs;

function saveState(): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { return; }
}

function publicState(): GameState { return structuredClone(state); }
function resetGame(): GameState {
  state = createInitialState(shop);
  nextCustomerSpawnMs = getCustomerSpawnInterval(shop, state);
  lastSavedMs = 0;
  try { localStorage.removeItem(SAVE_KEY); } catch { return publicState(); }
  return publicState();
}
function getState(): GameState { return publicState(); }
function spawnCustomer(): GameState { state = addCustomer(shop, state); saveState(); return publicState(); }
function grantCurrency(amount = 10): GameState { state = addCurrency(state, amount); saveState(); return publicState(); }
function setRandomSeed(seed: number): GameState { state = applyRandomSeed(state, seed); saveState(); return publicState(); }
function setPlayerPosition(position: Position): GameState { state = placePlayer(state, position); return publicState(); }
function advanceTime(durationMs: number): GameState { state = advanceGame(shop, state, durationMs); saveState(); return publicState(); }

function completeOrder(): GameState {
  if (!state.customers.some((customer) => customer.phase === 'queued')) {
    state = addCustomer(shop, state);
    const customer = state.customers.at(-1);
    if (customer) {
      const shelf = state.stations[customer.targetShelfId];
      if (shelf) shelf.stock[customer.productId] = (shelf.stock[customer.productId] ?? 0) + 1;
      state = advanceGame(shop, state, 10_000);
    }
  }
  const checkout = shop.stations.find((station) => station.kind === 'checkout');
  if (checkout) {
    state = placePlayer(state, checkout.position);
    state = advanceGame(shop, state, checkout.serviceMs + 100);
  }
  saveState();
  return publicState();
}

function upgradeStation(): GameState {
  const upgrade = shop.stations.find((station) => station.kind === 'upgrade');
  if (upgrade) {
    state = placePlayer(state, upgrade.position);
    state = advanceGame(shop, state, upgrade.purchaseIntervalMs + 50);
  }
  saveState();
  return publicState();
}

declare global {
  interface Window {
    __GAME_TEST__: {
      resetGame: typeof resetGame;
      getState: typeof getState;
      spawnCustomer: typeof spawnCustomer;
      completeOrder: typeof completeOrder;
      grantCurrency: typeof grantCurrency;
      upgradeStation: typeof upgradeStation;
      setRandomSeed: typeof setRandomSeed;
      setPlayerPosition: typeof setPlayerPosition;
      advanceTime: typeof advanceTime;
    };
  }
}

window.__GAME_TEST__ = { resetGame, getState, spawnCustomer, completeOrder, grantCurrency, upgradeStation, setRandomSeed, setPlayerPosition, advanceTime };

type KeySet = { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };

function colorAt(index: number, fallback: string): number {
  const value = config.palette[index] ?? fallback;
  return Number.parseInt(value.slice(1), 16);
}

class SpatialShopScene extends Phaser.Scene {
  private keys!: { cursors: Phaser.Types.Input.Keyboard.CursorKeys; wasd: KeySet };
  private worldGraphics!: Phaser.GameObjects.Graphics;
  private entityGraphics!: Phaser.GameObjects.Graphics;
  private playerGraphics!: Phaser.GameObjects.Graphics;
  private stationLabels = new Map<string, Phaser.GameObjects.Text>();
  private joystickBase!: Phaser.GameObjects.Arc;
  private joystickThumb!: Phaser.GameObjects.Arc;
  private joystickOrigin: Position | null = null;
  private joystickInput: MoveInput = { x: 0, y: 0 };
  private joystickPointerId: number | null = null;

  constructor() { super('spatial-shop'); }

  create(): void {
    this.cameras.main.setBackgroundColor(config.palette[0] ?? '#16324F');
    this.worldGraphics = this.add.graphics();
    this.entityGraphics = this.add.graphics();
    this.playerGraphics = this.add.graphics();
    this.keys = {
      cursors: this.input.keyboard!.createCursorKeys(),
      wasd: this.input.keyboard!.addKeys('W,A,S,D') as KeySet,
    };
    this.joystickBase = this.add.circle(0, 0, 54, colorAt(1, '#62B6CB'), 0.16).setStrokeStyle(3, colorAt(1, '#62B6CB'), 0.7).setVisible(false).setDepth(20);
    this.joystickThumb = this.add.circle(0, 0, 24, 0xffffff, 0.58).setVisible(false).setDepth(21);
    this.input.on('pointerdown', this.startJoystick, this);
    this.input.on('pointermove', this.moveJoystick, this);
    this.input.on('pointerup', this.stopJoystick, this);
    this.input.on('pointerupoutside', this.stopJoystick, this);
    for (const station of shop.stations) this.createStationLabel(station);
    this.renderState();
  }

  private createStationLabel(station: StationDefinition): void {
    const label = this.add.text(station.position.x, station.position.y + 48, station.label, {
      fontFamily: 'sans-serif', fontSize: '18px', color: '#ffffff', stroke: '#07131c', strokeThickness: 5, align: 'center',
    }).setOrigin(0.5).setDepth(5);
    this.stationLabels.set(station.id, label);
  }

  private startJoystick(pointer: Phaser.Input.Pointer): void {
    if (this.joystickPointerId !== null) return;
    this.joystickPointerId = pointer.id;
    this.joystickOrigin = { x: pointer.x, y: pointer.y };
    this.joystickInput = { x: 0, y: 0 };
    this.joystickBase.setPosition(pointer.x, pointer.y).setVisible(true);
    this.joystickThumb.setPosition(pointer.x, pointer.y).setVisible(true);
  }

  private moveJoystick(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.joystickPointerId || !this.joystickOrigin) return;
    this.joystickInput = joystickMove(this.joystickOrigin, pointer, 10, 54);
    this.joystickThumb.setPosition(this.joystickOrigin.x + this.joystickInput.x * 42, this.joystickOrigin.y + this.joystickInput.y * 42);
  }

  private stopJoystick(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.joystickPointerId) return;
    this.joystickPointerId = null;
    this.joystickOrigin = null;
    this.joystickInput = { x: 0, y: 0 };
    this.joystickBase.setVisible(false);
    this.joystickThumb.setVisible(false);
  }

  private readMoveAction(): MoveInput {
    const keyboard = keyboardMove({
      left: this.keys.cursors.left.isDown || this.keys.wasd.A.isDown,
      right: this.keys.cursors.right.isDown || this.keys.wasd.D.isDown,
      up: this.keys.cursors.up.isDown || this.keys.wasd.W.isDown,
      down: this.keys.cursors.down.isDown || this.keys.wasd.S.isDown,
    });
    return mergeMoveActions(keyboard, this.joystickInput);
  }

  update(_time: number, delta: number): void {
    state = advanceGame(shop, state, Math.min(delta, 100), this.readMoveAction());
    if (state.elapsedMs >= nextCustomerSpawnMs) {
      state = addCustomer(shop, state);
      nextCustomerSpawnMs = state.elapsedMs + getCustomerSpawnInterval(shop, state);
    }
    if (state.elapsedMs - lastSavedMs >= 1_000) {
      saveState();
      lastSavedMs = state.elapsedMs;
    }
    this.renderState();
  }

  private renderState(): void {
    this.worldGraphics.clear();
    this.worldGraphics.fillStyle(colorAt(0, '#16324F'), 1).fillRoundedRect(8, 8, shop.world.width - 16, shop.world.height - 16, 28);
    this.worldGraphics.lineStyle(2, 0xffffff, 0.06);
    for (let y = 100; y < shop.world.height; y += 100) this.worldGraphics.lineBetween(20, y, shop.world.width - 20, y);
    for (const station of shop.stations) this.drawStation(station);

    this.entityGraphics.clear();
    for (const customer of state.customers) {
      if (customer.phase === 'left') continue;
      this.entityGraphics.fillStyle(colorAt(2, '#F4D35E'), 0.95).fillCircle(customer.x, customer.y, 17);
      this.entityGraphics.fillStyle(0x0b1720, 0.85).fillCircle(customer.x - 5, customer.y - 3, 2).fillCircle(customer.x + 5, customer.y - 3, 2);
    }

    this.playerGraphics.clear();
    this.playerGraphics.fillStyle(colorAt(1, '#62B6CB'), 1).fillCircle(state.player.x, state.player.y, 22);
    let stackIndex = 0;
    for (const product of shop.products) {
      const count = state.player.inventory[product.id] ?? 0;
      for (let index = 0; index < count; index += 1) {
        const color = Number.parseInt(product.color.slice(1), 16);
        this.playerGraphics.fillStyle(color, 1).fillRoundedRect(state.player.x - 11, state.player.y - 34 - stackIndex * 10, 22, 8, 3);
        stackIndex += 1;
      }
    }
    this.renderHud();
  }

  private drawStation(station: StationDefinition): void {
    const unlocked = state.unlockedStationIds.includes(station.id);
    const kindColors: Record<StationDefinition['kind'], number> = {
      producer: 0x34d399,
      shelf: 0xfbbf24,
      checkout: 0x38bdf8,
      construction: 0xfb7185,
      upgrade: 0xa78bfa,
    };
    this.worldGraphics.fillStyle(unlocked ? kindColors[station.kind] : 0x64748b, unlocked ? 0.22 : 0.1).fillCircle(station.position.x, station.position.y, shop.player.interactionRadius);
    this.worldGraphics.lineStyle(3, unlocked ? kindColors[station.kind] : 0x64748b, unlocked ? 0.9 : 0.35).strokeCircle(station.position.x, station.position.y, shop.player.interactionRadius);
    this.stationLabels.get(station.id)?.setAlpha(unlocked ? 1 : 0.45).setText(unlocked ? station.label : `🔒 ${station.label}`);
  }

  private renderHud(): void {
    const activeEvent = shop.flowEvents.find((event) => state.elapsedMs >= event.startsAtMs && (state.elapsedMs - event.startsAtMs) % event.repeatEveryMs < event.durationMs);
    document.querySelector('#title')!.textContent = config.title;
    document.querySelector('#coins')!.textContent = `${config.content.currencyName} ${state.currency}`;
    document.querySelector('#level')!.textContent = `等级 ${state.level}`;
    document.querySelector('#status')!.textContent = activeEvent ? `当前节奏：${activeEvent.label}` : config.theme;
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: shop.world.width,
  height: shop.world.height,
  backgroundColor: config.palette[0] ?? '#16324F',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [SpatialShopScene],
});
