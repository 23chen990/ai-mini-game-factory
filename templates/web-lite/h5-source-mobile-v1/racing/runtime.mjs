import { CAREER_KEY, STAGES, newCareer, loadCareer, dailyStage, localDayKey, stageUnlocked, starGateStatus, skinUnlocked, recordStage, validDrift, fractionPassed } from './career.mjs';
import { AutoItems, OvertakeTracker, ITEM_LABELS, thinItemBoxes, installItemCleanup, awardCornerPass, removeEliminatedAi } from './items.mjs';
import { FUEL_KEY, FUEL_RULES, newFuelState, loadFuel, saveFuel, syncFuel, spendRaceFuel, fuelTimeLeft, fuelAdEligible, fuelPlatformReady, grantAdvertFuel } from '../fuel.mjs';
import { requestRewardedVideo } from '../themes.mjs';
import { WrongWayRecovery } from './recovery.mjs';
import { RivalPressure, tuneOpponentField, seedCompetitiveField, configureRivalTactics, careerPaceMultiplier } from './rival-pressure.mjs';

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
    this.dailySnapshot = null;
    this.auto = new AutoItems();this.passes = new OvertakeTracker();this.recovery = new WrongWayRecovery();this.pressure = new RivalPressure();
    this.config = null;this.tap = null;this.fuelEnabled = false;this.adReady = false;this.adBusy = false;this.attempt = 0;
    // One earned free replay per stage/session after an actual failed result.
    // Never mutate native vehicle, rank or reward callbacks.
    this.freeReplayStageId = null;this.usedFreeReplays = new Set();
    // A short-session optional rewarded boost, NOT a paywall or fake in-race revive.
    this.retryOfferRound = -1;this.retryAdAttempts = 0;
    this.retryAdLastAt = 0;this.bonusNitroStageId = null;
    this.rewardedProvider = requestRewardedVideo;
    this.startedAt = Date.now();this.active = false;this.notice = [];this.boss = null;
    this.metrics = this.freshMetrics();
  }
  get stage() { return this.dailySnapshot ?? STAGES[this.index]; }
  canDaily() { return (this.progress.stars['04'] ?? 0) > 0; }
  setDaily(date = new Date()) { if (!this.canDaily()) return false;
    if (this.freeReplayStageId !== dailyStage(date).id) this.freeReplayStageId = null;
    this.dailySnapshot = dailyStage(date);return true; }
  freshMetrics() { return { pickups: 0, bonusItems: 0, rescues: 0, pursuitWarnings: 0, cleanDrifts: 0, cleanPasses: 0, padCount: 0, gateSpeed: 0, survived: 0, eliminated: false, timedOut: false, beatBoss: false, lastPadAt: -100, previousProgress: 0, checkedSpeed: 0, checkpoints: 0, knockoutWarnings: 0, timeAllowance: 0 }; }
  save() {
    try {
      this.storage.setItem(CAREER_KEY, JSON.stringify(this.progress));
      this.storage.setItem(FUEL_KEY, saveFuel(this.fuel));
      return true;
    } catch { this.storageOK = false;this.fuelEnabled = false;this.adReady = false;return false; }
  }
  setStage(index) { if (!stageUnlocked(this.progress, index)) return false;
    if (this.stage.id !== STAGES[index].id) {
      this.freeReplayStageId = null;
      this.retryOfferRound = -1;
    }
    this.index = index;this.dailySnapshot = null;return true; }
  setSkin(index) { if (!skinUnlocked(this.progress, index)) return false;this.progress.skin = index;this.save();return true; }
  nextStage() { return !this.dailySnapshot && this.index + 1 < STAGES.length && stageUnlocked(this.progress, this.index + 1) ? this.index + 1 : this.index; }
  configure(game) {
    const s = this.stage;
    Object.assign(game.settings, { map: s.map, course: s.course, mode: s.mode, laps: s.laps, diff: s.diff, skin: this.progress.skin });
    game.save();
  }
  setupAd(config,tap) {
    this.config=config;this.tap=tap;
    this.adReady=this.storageOK&&fuelPlatformReady(config,tap);
    // Fuel runs identically on mobile and desktop, even if the platform has
    // NO rewarded ad adapter. SDK availability only controls ad buttons.
    this.fuelEnabled=this.storageOK;
    return this.adReady;
  }
  gateStatus(index) { return starGateStatus(this.progress,index); }
  canOfferGateAd(index) {
    const gate=this.gateStatus(index);
    return this.storageOK && this.adReady && !this.adBusy && !this.active &&
      !this.dailySnapshot && gate.starLocked && gate.required>0;
  }
  /** Official completion + synchronous durable local write are both required.
   * An ad cannot mint stars, unlock a skipped prior stage or grant race fuel.
   */
  async watchGateAd(index) {
    if(!this.canOfferGateAd(index))return {status:'unavailable'};
    const gate=this.gateStatus(index),currentId=this.stage.id,rounds=this.progress.rounds;
    this.adBusy=true;
    try{
      const out=await this.rewardedProvider({tap:this.tap,config:this.config});
      if(out?.status!=='completed')return {status:out?.status??'failed'};
      if(this.stage.id!==currentId||this.progress.rounds!==rounds||
        !this.gateStatus(index).starLocked) return {status:'stale'};
      const updated={...this.progress,gatePasses:{
        ...this.progress.gatePasses,[gate.stageId]:'ad'
      }};
      try{
        this.storage.setItem(CAREER_KEY,JSON.stringify(updated));
      }catch{
        // Never claim a permanent rewarded unlock without durable storage.
        return {status:'save-failed'};
      }
      this.progress=updated;
      return {status:'completed',stageId:gate.stageId,required:gate.required};
    }catch{return {status:'failed'};}
    finally{this.adBusy=false;}
  }
  canStart() {
    if (this.adBusy || (this.dailySnapshot ? !this.canDaily() : !stageUnlocked(this.progress, this.index))) return false;
    if (!this.fuelEnabled) return true;
    this.fuel = syncFuel(this.fuel);
    return this.freeReplayStageId === this.stage.id || this.fuel.amount >= FUEL_RULES.raceCost;
  }
  begin(game) {
    this.active = true;this.boss = null;this.bossName = '';this.notice = [];this.metrics = this.freshMetrics();
    this.metrics.timeAllowance = this.stage.kind === 'relay' ? this.stage.baseTime : this.stage.kind === 'time' ? this.stage.target : 0;
    this.auto.reset();this.passes.reset();this.recovery.reset();this.pressure.reset();
    this.passes.previous = game.standings.indexOf(game.player) + 1;
    this.passes.lastCrashes = game.player?.stats?.crash ?? 0;
    // Tune only actual native AI.skill values. AICar.update still handles
    // every car's corner pace, nitro, items and genuine on-road position.
    // All thirty stages, including both early tracks and final bosses, receive fixed competitive fields.
    tuneOpponentField(game.racers,this.stage);
    seedCompetitiveField(game.racers,this.stage);
    configureRivalTactics(game.racers,this.stage);
    if (this.stage.kind === 'overtake') {
      // A visible rival survives beyond the first straight without scripted teleportation.
      const challengers = game.racers.filter(r => !r.isPlayer).slice(0, 2);
      for (const rival of challengers) rival.skill = Math.max(rival.skill, 1.12);
    }
    if (game.itemMode && game.items) {
      thinItemBoxes(game.items);
      game.items.applyMobileVisuals?.();
      installItemCleanup(game.items);
      const use = game.items.use.bind(game.items);
      game.items.use = racer => {
        const item = racer.items?.[0];
        use(racer);
        if (racer.isPlayer && item) this.notice.push('已使用' + (ITEM_LABELS[item] ?? '道具'));
      };
    }
    if (this.stage.kind === 'boss') {
      this.boss = game.racers.find(r => !r.isPlayer) ?? null;
      if (this.boss) {
        this.bossName = this.boss.name;
        // Full-strength named boss alongside a real competitive pack.
        // Native cornering and nitro remain physical; no forced race results.
        this.boss.skill=this.stage.id==='30'?2.18:
          this.stage.id==='16'?2.10:Math.max(this.boss.skill,2.04);
      }
    }
    if (this.fuelEnabled) {
      // Claim only AFTER native countdown has successfully begun. This must
      // never become extra fuel or transfer to a different stage.
      if (this.freeReplayStageId === this.stage.id) {
        this.usedFreeReplays.add(this.stage.id);
        this.freeReplayStageId = null;
      } else {
        const spent = spendRaceFuel(this.fuel);
        if (spent.ok) { this.fuel = spent.state;this.save(); }
        else { this.fuelEnabled = false;this.notice.push('油量同步异常，当前比赛不扣油'); }
      }
    }
    // One *real* manual nitro stock granted at countdown. No changes to
    // race progress, AI skill, rank, vehicle position or ad completion claims.
    if(this.bonusNitroStageId === this.stage.id && game.player &&
       Number.isFinite(game.player.nitroCount)){
      game.player.nitroCount=Math.min(3,Math.max(0,game.player.nitroCount)+1);
      this.bonusNitroStageId=null;
    }
    this.retryOfferRound=-1;
  }
  onItemGet(item, source = 'box') {
    if (!this.active) return;
    if (source === 'box') this.metrics.pickups++;
    else this.metrics.bonusItems++;
    this.notice.push((source === 'box' ? '拾取' : '超车奖励') + (ITEM_LABELS[item] ?? '道具') + ' · 智能择机使用');
  }
  onEvent(event, game) {
    if (!this.active) return;
    if (validDrift(event)) {
      this.metrics.cleanDrifts++;
      if (this.stage.kind === 'drift')
        this.notice.push('有效漂移 ' + Math.min(this.metrics.cleanDrifts, this.stage.target) + '/' + this.stage.target);
    }
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
    if (typeof game.rubber === 'function') {
      const nativeRubber = game.rubber.bind(game);
      game.rubber = rival => {
        const fixed = careerPaceMultiplier(this.active && game.state === 'race' &&
          rival && !rival.isPlayer);
        return fixed ?? nativeRubber(rival);
      };
    }
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
    game.onItemGet = item => { itemGet(item);this.onItemGet(item, game.__RACE_BONUS_DROP__ ? 'overtake' : 'box'); };
    game.__RACE_CAREER_PATCHED__ = true;
  }
  frame(game) {
    if (!this.active || game.state !== 'race' || !game.player) return null;
    const p = game.player, m = this.metrics, track = game.track;
    const rescue = this.recovery.frame(game);
    if (rescue === 'warning') this.notice.push('⚠ 方向反了，即将自动回正');
    if (rescue === 'stuck-warning') this.notice.push('⚠ 赛车卡住了，即将自动脱困');
    if (rescue === 'recovered' || rescue === 'stuck-recovered') {
      m.rescues++;
      this.passes.reset();this.passes.previous = game.standings.indexOf(game.player)+1;
      this.notice.push(rescue === 'recovered' ? '↻ 已自动回正，继续向前！' : '↻ 已脱离护栏，继续向前！');
      return null; // Native reset must never register a synthetic overtake.
    }
    const pursuing = this.pressure.frame(game, this.stage);
    if (pursuing) {
      m.pursuitWarnings++;
      this.notice.push('⚡ '+pursuing.name+' 干净出弯，准备加速');
    }
    const distance = track.length * this.stage.laps;
    if (this.passes.frame(game)) {
      m.cleanPasses++;
      if (this.stage.kind === 'overtake')
        this.notice.push('有效弯道超车 ' + Math.min(m.cleanPasses, this.stage.target) + '/' + this.stage.target);
      const bonus = awardCornerPass(game);
      this.notice.push(bonus === 'item' ? '弯道超车！奖励道具' : bonus === 'boost' ? '弯道超车！额外加速' : '漂亮超车！');
    }
    if (this.stage.kind === 'speed' && m.checkedSpeed < 3 &&
        fractionPassed(m.previousProgress, p.progress, distance, [.22,.55,.83][m.checkedSpeed])) {
      const reading = Math.round(p.speedKmh ?? Math.abs(p.s) * 3.6);
      m.gateSpeed = Math.max(m.gateSpeed, reading);
      m.checkedSpeed++;
      this.notice.push('第 ' + m.checkedSpeed + ' 个测速点 ' + reading + ' km/h · 最佳 ' + m.gateSpeed);
    }
    if (this.stage.kind === 'elimination' && m.checkpoints < 2) {
      const thresholds = [.35, .70];
      const leader = Math.max(...game.racers.map(r => r.progress));
      const nextGate=distance*thresholds[m.checkpoints];
      if (leader >= nextGate-300 && m.knockoutWarnings === m.checkpoints) {
        m.knockoutWarnings++;
        this.notice.push(game.standings.at(-1) === p ? '警告：你在末位，即将淘汰！' : '淘汰点将至，避免跌到末位');
      }
      if (leader >= nextGate) {
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
  eliminationCue(game) {
    if (!this.active || this.stage.kind !== 'elimination' || this.metrics.checkpoints >= 2 || !game?.player) return null;
    const round = this.metrics.checkpoints, distance = game.track.length * this.stage.laps;
    const gate = distance * [.35, .70][round], previous = round ? distance * .35 : 0;
    const leader = Math.max(...game.racers.map(r => r.progress));
    const remaining = Math.max(0, Math.ceil(gate - leader));
    return { fraction: Math.max(0, Math.min(1, (leader - previous) / (gate - previous))), remaining,
      near: remaining <= 400, atRisk: game.standings.at(-1) === game.player,
      place: game.standings.indexOf(game.player) + 1, count: game.racers.length, round: round + 1 };
  }
  objectiveLabel(game) {
    if (!this.active || !game) return '';
    const s = this.stage, m = this.metrics;
    switch (s.kind) {
      case 'time':case 'relay':return '剩余 ' + Math.max(0, Math.ceil(m.timeAllowance - game.raceTime)) + ' 秒' +
        (s.kind === 'relay' ? ' · 加速带 +' + s.bonus + '秒' : '');
      case 'drift':return '有效漂移 ' + Math.min(m.cleanDrifts,s.target) + '/' + s.target;
      case 'overtake':return '弯道超车 ' + Math.min(m.cleanPasses,s.target) + '/' + s.target;
      case 'item':return '已拾取道具 ' + Math.min(m.pickups,s.target) + '/' + s.target;
      case 'speed':return '测速 ' + m.gateSpeed + '/' + s.target + ' km/h · ' + m.checkedSpeed + '/3 次';
      case 'elimination': {
        if (m.checkpoints >= 2) return '淘汰结束 · 已存活 2/2';
        const gate = (game.track?.length ?? 0) * s.laps * [.35,.70][m.checkpoints];
        const leader = Math.max(...game.racers.map(r => r.progress));
        const remaining = Math.max(0,Math.ceil(gate - leader));
        if (remaining <= 400)
          return (game.standings.at(-1) === game.player ? '⚠ 末位！' : '') +
            '距离淘汰 ' + remaining + 'm';
        return '存活淘汰点 ' + m.survived + '/2';
      }
      case 'boss': {
        const place = game.standings.indexOf(game.player) + 1;
        const bossPlace = game.standings.indexOf(this.boss) + 1;
        const ahead = !!this.boss && bossPlace > 0 && place > 0 && place < bossPlace;
        return '车神' + this.bossName + (ahead ? ' 已超越' : ' 未超越') +
          ' · 当前第' + place + '名，须前' + s.rank + '名';
      }
      default:return '';
    }
  }
  timerLabel(game) { return this.objectiveLabel(game); }
  nextNotice() { return this.notice.shift() ?? null; }
  drainNotices() { return this.notice.splice(0, this.notice.length); }
  finalize(game, result) {
    if (!this.active) return null;
    this.active = false;
    if (this.boss) this.metrics.beatBoss = game.standings.indexOf(game.player) < game.standings.indexOf(this.boss);
    const stage = this.stage, outcome = recordStage(this.progress, stage, result, this.metrics);
    let best = outcome.career.times[stage.id] ?? null;
    if (this.dailySnapshot) {
      // A local daily badge/streak is separate from campaign stars and skin unlocks.
      delete outcome.career.stars[stage.id];
      delete outcome.career.times[stage.id];
      const day = stage.id.slice(6), daily = { ...outcome.career.daily };
      if (daily.date !== day) {daily.date = day;daily.best = 0;daily.stars = 0;}
      if (outcome.stars > 0) {
        if (daily.lastWonDate !== day) {
          const yesterday = new Date(day + 'T12:00:00');
          yesterday.setDate(yesterday.getDate() - 1);
          daily.streak = daily.lastWonDate === localDayKey(yesterday) ? daily.streak + 1 : 1;
        }
        daily.lastWonDate = day;
        daily.stars = Math.max(daily.stars, outcome.stars);
        if (result.finished && result.time > 0) daily.best = daily.best ? Math.min(daily.best, result.time) : result.time;
      }
      outcome.career.daily = daily;
      best = daily.best || null;
    }
    this.progress = outcome.career;
    this.retryOfferRound = outcome.stars === 0 ? this.progress.rounds : -1;
    // One free retry after failure only. No resets on subsequent losses;
    // tickets do not persist to the next browser session.
    this.freeReplayStageId = outcome.stars === 0 && this.fuelEnabled &&
      !this.usedFreeReplays.has(stage.id) ? stage.id : null;
    this.save();
    return { ...outcome, best, metric: { ...this.metrics } };
  }
  hasFreeReplay() { return this.fuelEnabled && this.freeReplayStageId === this.stage.id; }
  /**
   * Only after a REAL graded loss; never during a race, before playing,
   * without the official ad slot, or as a condition for the next free retry.
   * A two-offer cap avoids repeated prompts during short IAA sessions.
   */
  canOfferRetryBoost() {
    const elapsed=Date.now()-this.startedAt;
    return this.fuelEnabled && this.adReady && !this.adBusy &&
      this.retryOfferRound === this.progress.rounds &&
      this.retryOfferRound > 0 && this.retryAdAttempts < 2 &&
      elapsed >= 60_000 && this.canStart() &&
      this.bonusNitroStageId !== this.stage.id &&
      (this.retryAdLastAt===0 || Date.now()-this.retryAdLastAt >= 90_000);
  }
  async watchRetryBoostAd() {
    if(!this.canOfferRetryBoost())return {status:'unavailable'};
    const round=this.progress.rounds,stageId=this.stage.id;
    this.retryOfferRound=-1; // At most one offered view per genuine failed result.
    this.retryAdAttempts++;this.retryAdLastAt=Date.now();this.adBusy=true;
    try {
      const out=await this.rewardedProvider({tap:this.tap,config:this.config});
      if(out?.status!=='completed')return {status:out?.status??'failed'};
      if(this.progress.rounds!==round || this.stage.id!==stageId)
        return {status:'stale'};
      this.bonusNitroStageId=stageId;
      return {status:'completed',stageId};
    } catch {return {status:'failed'};}
    finally {this.adBusy=false;}
  }
  fuelText() {
    if (!this.storageOK) return '本地存储不可用 · 试玩不限油，关卡进度可能不会保留';
    if (!this.fuelEnabled) return '本机存档不可用 · 当前不限油试玩';
    this.fuel = syncFuel(this.fuel);
    const left = fuelTimeLeft(this.fuel);
    const mm = left ? ' · 下次恢复 ' + Math.ceil(left / 60000) + ' 分钟' : '';
    return '⛽ ' + this.fuel.amount + '/' + FUEL_RULES.max + ' · 每场 -1' + mm;
  }
  canOfferAd() {
    // With a hard first stage, do not softlock failed players out of voluntary
    // fuel recovery. fuelAdEligible itself requires a real recorded round,
    // session time, low balance and cooldown; ad never changes race outcomes.
    return this.fuelEnabled && this.adReady && !this.adBusy && fuelAdEligible(this.fuel, {
      rounds: this.progress.rounds, sessionMs: Date.now() - this.startedAt, adReady: true,
    });
  }
  async watchFuelAd() {
    if (!this.canOfferAd()) return { status: 'unavailable' };
    this.adBusy = true;
    const ticket = 'racing-ad-' + Date.now() + '-' + (++this.attempt);
    try {
      const outcome = await this.rewardedProvider({ tap: this.tap, config: this.config });
      const granted = grantAdvertFuel(this.fuel, outcome.status, ticket);
      if (granted.ok) {
        this.fuel = granted.state;
        if (!this.save()) return { status: 'session-credit', fuel: this.fuel.amount };
        return { status: 'completed', fuel: this.fuel.amount };
      }
      return { status: outcome.status };
    } catch { return { status: 'failed' }; }
    finally { this.adBusy = false; }
  }
}
