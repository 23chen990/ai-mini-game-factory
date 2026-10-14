import { CAREER_KEY, STAGES, newCareer, loadCareer, careerStars, stageUnlocked, skinUnlocked, recordStage, validDrift, fractionPassed } from './career.mjs';
import { AutoItems, OvertakeTracker, ITEM_LABELS, thinItemBoxes, awardCornerPass, removeEliminatedAi } from './items.mjs';
import { FUEL_KEY, FUEL_RULES, newFuelState, loadFuel, saveFuel, syncFuel, spendRaceFuel, fuelTimeLeft, fuelAdEligible, fuelPlatformReady, grantAdvertFuel } from '../fuel.mjs';
import { requestRewardedVideo } from '../themes.mjs';

export class RacingCareer {
  constructor(storage, legacyBest = {}) {
    this.storage = storage;
    this.storageOK = true;
    try {
      this.progress = loadCareer(storage.getItem(CAREER_KEY), legacyBest);
      this.fuel = loadFuel(storage.getItem(FUEL_KEY)) ?? newFuelState();
    } catch {
      this.progress = newCareer();this.fuel = newFuelState();this.storageOK = false;
    }
    this.index = STAGES.findIndex((_, i) => !stageUnlocked(this.progress, i));
    this.index = this.index < 0 ? STAGES.length - 1 : Math.max(0, this.index - 1);
    this.auto = new AutoItems();this.passes = new OvertakeTracker();
    this.config = null;this.tap = null;this.fuelEnabled = false;this.adBusy = false;this.attempt = 0;
    this.startedAt = Date.now();this.active = false;this.notice = [];this.boss = null;
    this.metrics = this.freshMetrics();
  }
  get stage() { return STAGES[this.index]; }
  freshMetrics() { return { pickups: 0, cleanDrifts: 0, cleanPasses: 0, padCount: 0, gateSpeed: 0, survived: 0, eliminated: false, timedOut: false, beatBoss: false, lastPadAt: -100, previousProgress: 0, checkedSpeed: false, checkpoints: 0, timeAllowance: 0 }; }
  save() {
    try {
      this.storage.setItem(CAREER_KEY, JSON.stringify(this.progress));
      this.storage.setItem(FUEL_KEY, saveFuel(this.fuel));
      return true;
    } catch { this.storageOK = false;this.fuelEnabled = false;return false; }
  }
  setStage(index) { if (!stageUnlocked(this.progress, index)) return false;this.index = index;return true; }
  setSkin(index) { if (!skinUnlocked(this.progress, index)) return false;this.progress.skin = index;this.save();return true; }
  nextStage() { return this.index + 1 < STAGES.length && stageUnlocked(this.progress, this.index + 1) ? this.index + 1 : this.index; }
  configure(game) {
    const s = this.stage;
    Object.assign(game.settings, { map: s.map, mode: s.mode, laps: s.laps, diff: s.diff, skin: this.progress.skin });
    game.save();
  }
  setupAd(config, tap) { this.config = config;this.tap = tap;this.fuelEnabled = this.storageOK && fuelPlatformReady(config, tap);return this.fuelEnabled; }
  canStart() {
    if (this.adBusy || !stageUnlocked(this.progress, this.index)) return false;
    if (!this.fuelEnabled) return true;
    this.fuel = syncFuel(this.fuel);
    return this.fuel.amount >= FUEL_RULES.raceCost;
  }
  begin(game) {
    this.active = true;this.boss = null;this.notice = [];this.metrics = this.freshMetrics();
    this.metrics.timeAllowance = this.stage.kind === 'relay' ? this.stage.baseTime : this.stage.kind === 'time' ? this.stage.target : 0;
    this.auto.reset();this.passes.reset();
    this.passes.previous = game.standings.indexOf(game.player) + 1;
    this.passes.lastCrashes = game.player?.stats?.crash ?? 0;
    if (this.stage.kind === 'overtake') {
      // A visible rival survives beyond the first straight without scripted teleportation.
      const challengers = game.racers.filter(r => !r.isPlayer).slice(0, 2);
      for (const rival of challengers) rival.skill = Math.max(rival.skill, 1.12);
    }
    if (game.itemMode && game.items) thinItemBoxes(game.items);
    if (this.stage.kind === 'boss') {
      this.boss = game.racers.find(r => !r.isPlayer) ?? null;
      if (this.boss) { this.boss.name = '疾风车神';this.boss.skill = Math.max(this.boss.skill, 1.48); }
    }
    if (this.fuelEnabled) {
      const spent = spendRaceFuel(this.fuel);
      if (spent.ok) { this.fuel = spent.state;this.save(); }
      else { this.fuelEnabled = false;this.notice.push('油量同步异常，当前比赛不扣油'); }
    }
  }
  onItemGet(item) {
    if (!this.active) return;
    this.metrics.pickups++;
    this.notice.push('获得' + (ITEM_LABELS[item] ?? '道具') + ' · 自动使用');
  }
  onEvent(event, game) {
    if (!this.active) return;
    if (validDrift(event)) this.metrics.cleanDrifts++;
    if (event?.type === 'pad' && game.raceTime - this.metrics.lastPadAt >= 3) {
      this.metrics.padCount++;this.metrics.lastPadAt = game.raceTime;
      if (this.stage.kind === 'relay') {
        this.metrics.timeAllowance = Math.min(this.stage.maxTime, this.metrics.timeAllowance + this.stage.bonus);
        this.notice.push('经过加速带，补时 +' + this.stage.bonus + '秒');
      }
    }
  }
  /** Native keyboard still works; this only adds auto-use for two-button touch. */
  itemInput(game, canStep = true) { return this.active && this.auto.frame(game, canStep); }
  /** Native AI-first 10-second DNF was unfair when races exceed one lap. */
  patchNative(game) {
    if (game.__RACE_CAREER_PATCHED__) return;
    const nativeEnd = game.checkRaceEnd.bind(game);
    game.checkRaceEnd = dt => {
      if (game.firstFinish < 0) game.__RACE_FIRST_FINISH_NOTIFIED__ = false;
      if (game.state === 'race' && game.firstFinish >= 0 && game.player && !game.player.finished) {
        if (!game.__RACE_FIRST_FINISH_NOTIFIED__) {
          game.hud.finalCount('对手已冲线，继续完成自己的比赛');
          game.__RACE_FIRST_FINISH_NOTIFIED__ = true;
        }
        const cap = Math.max(210, game.settings.laps * 150);
        if (game.raceTime > cap) game.showResults();
        return;
      }
      nativeEnd(dt);
    };
    const itemGet = game.onItemGet.bind(game);
    game.onItemGet = item => { itemGet(item);this.onItemGet(item); };
    game.__RACE_CAREER_PATCHED__ = true;
  }
  frame(game) {
    if (!this.active || game.state !== 'race' || !game.player) return null;
    const p = game.player, m = this.metrics, track = game.track;
    const distance = track.length * this.stage.laps;
    if (this.passes.frame(game)) {
      m.cleanPasses++;
      const bonus = awardCornerPass(game);
      this.notice.push(bonus === 'item' ? '弯道超车！奖励道具' : bonus === 'boost' ? '弯道超车！额外加速' : '漂亮超车！');
    }
    if (this.stage.kind === 'speed' && !m.checkedSpeed && fractionPassed(m.previousProgress, p.progress, distance, .45)) {
      m.gateSpeed = Math.round(p.speedKmh ?? Math.abs(p.s) * 3.6);
      m.checkedSpeed = true;
      this.notice.push('测速点 ' + m.gateSpeed + ' km/h');
    }
    if (this.stage.kind === 'elimination' && m.checkpoints < 2) {
      const thresholds = [.35, .70];
      const leader = Math.max(...game.racers.map(r => r.progress));
      if (leader >= distance * thresholds[m.checkpoints]) {
        const last = game.standings.at(-1);
        m.checkpoints++;
        if (last === p) { m.eliminated = true;return '淘汰：处于末位'; }
        if (removeEliminatedAi(game, last)) { m.survived++;this.notice.push('末位车手出局 · 剩余 ' + game.racers.length + ' 人'); }
      }
    }
    m.previousProgress = p.progress;
    if ((this.stage.kind === 'time' || this.stage.kind === 'relay') && game.raceTime >= m.timeAllowance) {
      m.timedOut = true;return '时间耗尽';
    }
    return null;
  }
  timerLabel(game) {
    if (!this.active || !['time', 'relay'].includes(this.stage.kind) || !game) return '';
    return '剩余 ' + Math.max(0, Math.ceil(this.metrics.timeAllowance - game.raceTime)) + ' 秒';
  }
  drainNotices() { return this.notice.splice(0, this.notice.length); }
  finalize(game, result) {
    if (!this.active) return null;
    this.active = false;
    if (this.boss) this.metrics.beatBoss = game.standings.indexOf(game.player) < game.standings.indexOf(this.boss);
    const outcome = recordStage(this.progress, this.stage, result, this.metrics);
    this.progress = outcome.career;
    this.save();
    return { ...outcome, best: this.progress.times[this.stage.id], metric: { ...this.metrics } };
  }
  fuelText() {
    if (!this.fuelEnabled) return '油量系统未开通 · 当前不限油试玩';
    this.fuel = syncFuel(this.fuel);
    const left = fuelTimeLeft(this.fuel);
    const mm = left ? ' · 下次恢复 ' + Math.ceil(left / 60000) + ' 分钟' : '';
    return '⛽ ' + this.fuel.amount + '/' + FUEL_RULES.max + ' · 每场 -1' + mm;
  }
  canOfferAd() {
    return this.fuelEnabled && !this.adBusy && fuelAdEligible(this.fuel, {
      rounds: this.progress.rounds, sessionMs: Date.now() - this.startedAt, adReady: true,
    });
  }
  async watchFuelAd() {
    if (!this.canOfferAd()) return { status: 'unavailable' };
    this.adBusy = true;
    const ticket = 'racing-ad-' + Date.now() + '-' + (++this.attempt);
    try {
      const outcome = await requestRewardedVideo({ tap: this.tap, config: this.config });
      const granted = grantAdvertFuel(this.fuel, outcome.status, ticket);
      if (granted.ok) { this.fuel = granted.state;this.save();return { status: 'completed', fuel: this.fuel.amount }; }
      return { status: outcome.status };
    } catch { return { status: 'failed' }; }
    finally { this.adBusy = false; }
  }
}
