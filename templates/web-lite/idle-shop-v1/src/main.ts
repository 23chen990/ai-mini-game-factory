import Phaser from 'phaser';
import config from './generated/game-config.json';
import {
  completeOrder as resolveOrder,
  createInitialState,
  getUpgradeCost,
  grantCurrency as addCurrency,
  produce as produceItem,
  setRandomSeed as applyRandomSeed,
  spawnCustomer as addCustomer,
  upgradeStation as purchaseUpgrade,
  type IdleState,
} from './simulation.js';
import './style.css';

type State = IdleState;
const saveKey = `ai-game-factory:${config.title}`;
const economy = { startingCurrency: config.balance.startingCurrency, orderReward: config.balance.orderReward, baseUpgradeCost: config.balance.baseUpgradeCost };
const initial = (): State => createInitialState(economy);
let state: State = load();
let customerTimer: ReturnType<typeof setTimeout> | undefined;
function load(): State { try { const value = JSON.parse(localStorage.getItem(saveKey) ?? 'null'); return value?.version === 1 ? value : initial(); } catch { return initial(); } }
function save() { localStorage.setItem(saveKey, JSON.stringify(state)); renderHud(); }
function renderHud() {
  document.querySelector('#title')!.textContent = config.title;
  document.querySelector('#coins')!.textContent = `${config.content.currencyName}: ${state.currency}`;
  document.querySelector('#level')!.textContent = `摊位等级: ${state.level}`;
  document.querySelector('#status')!.textContent = state.customerWaiting ? `${config.content.customerName}正在等待${config.content.productName}` : '摊位暂时清闲';
  (document.querySelector('#deliver') as HTMLButtonElement).disabled = !state.customerWaiting || state.inventory < 1;
  (document.querySelector('#upgrade') as HTMLButtonElement).disabled = state.currency < upgradeCost();
}
function upgradeCost() { return getUpgradeCost(economy, state); }
function scheduleNextCustomer() {
  if (customerTimer) clearTimeout(customerTimer);
  customerTimer = setTimeout(() => {
    if (!state.customerWaiting) { state.customerWaiting = true; save(); }
  }, 250);
}
function resetGame() { if (customerTimer) clearTimeout(customerTimer); customerTimer = undefined; localStorage.removeItem(saveKey); state = initial(); save(); return getState(); }
function getState() { return structuredClone(state); }
function spawnCustomer() { state = addCustomer(state); save(); return getState(); }
function produce() { state = produceItem(state); save(); return getState(); }
function completeOrder() { const wasWaiting = state.customerWaiting; state = resolveOrder(economy, state); if (wasWaiting && !state.customerWaiting) { save(); scheduleNextCustomer(); } return getState(); }
function grantCurrency(amount = 10) { state = addCurrency(state, amount); save(); return getState(); }
function upgradeStation() { state = purchaseUpgrade(economy, state); save(); return getState(); }
function setRandomSeed(seed: number) { state = applyRandomSeed(state, seed); save(); return getState(); }

declare global { interface Window { __GAME_TEST__: { resetGame: typeof resetGame; getState: typeof getState; spawnCustomer: typeof spawnCustomer; completeOrder: typeof completeOrder; grantCurrency: typeof grantCurrency; upgradeStation: typeof upgradeStation; setRandomSeed: typeof setRandomSeed } } }
window.__GAME_TEST__ = { resetGame, getState, spawnCustomer, completeOrder, grantCurrency, upgradeStation, setRandomSeed };
document.querySelector('#produce')!.addEventListener('click', produce); document.querySelector('#deliver')!.addEventListener('click', completeOrder); document.querySelector('#upgrade')!.addEventListener('click', upgradeStation);

class MarketScene extends Phaser.Scene {
  constructor() { super('market'); }
  preload() { this.load.image('background', config.assets.background); this.load.image('customer', config.assets.customer); this.load.image('product', config.assets.product); }
  create() {
    this.add.image(480, 270, 'background').setDisplaySize(960, 540).setAlpha(0.55);
    this.add.rectangle(480, 390, 700, 170, Number.parseInt((config.palette[1] ?? '#F6C768').slice(1), 16), 0.9).setStrokeStyle(4, 0xffffff, 0.4);
    this.add.image(270, 270, 'customer').setDisplaySize(190, 190); this.add.image(680, 340, 'product').setDisplaySize(120, 120);
    this.add.text(480, 86, config.theme, { fontFamily: 'sans-serif', fontSize: '32px', color: '#ffffff', stroke: '#000000', strokeThickness: 5 }).setOrigin(0.5);
  }
}
new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: 960, height: 540, backgroundColor: config.palette[0] ?? '#151225', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [MarketScene] });
renderHud();
