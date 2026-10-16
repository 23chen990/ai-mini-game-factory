export const CAREER_KEY = 'h5-mobile:qq-speed:career:v1';
const make = (id, chapter, name, map, laps, diff, kind, mode, rank, goal, extra = {}) => Object.freeze({ id, chapter, name, map, course: 'race-' + id, laps, diff, kind, mode, rank, goal, ...extra });
/** Four original locations, one driving model. Content is configuration, not 16 new tracks. */
export const STAGES = Object.freeze([
  make('01', 1, '城市起航', 'city', 1, 0, 'race', 'speed', 6, '完成首次比赛'),
  make('02', 1, '沙漠加速', 'egypt', 2, 0, 'speed', 'speed', 4, '经过测速点时达到 150 km/h', { target: 150 }),
  make('03', 1, '内线超车', 'city', 2, 1, 'overtake', 'speed', 4, '弯道或出弯时真正超过对手 1 次', { target: 1 }),
  make('04', 1, '海湾连漂', 'aegean', 2, 0, 'drift', 'speed', 4, '完成 3 次有效漂移', { target: 3 }),
  make('05', 2, '沙漠道具箱', 'egypt', 2, 0, 'item', 'item', 4, '拾取 1 个道具', { target: 1 }),
  make('06', 2, '城市道具战', 'city', 2, 1, 'item', 'item', 3, '拾取 2 个道具并冲线', { target: 2 }),
  make('07', 2, '海湾限时赛', 'aegean', 2, 1, 'time', 'speed', 5, '在 115 秒内完成', { target: 115 }),
  make('08', 2, '雪地夺旗', 'snow', 2, 1, 'race', 'speed', 3, '进入前三名'),
  make('09', 3, '沙漠补时赛', 'egypt', 2, 1, 'relay', 'speed', 5, '通过加速带补时，完成比赛', { baseTime: 90, bonus: 12, maxTime: 210 }),
  make('10', 3, '城市逆转战', 'city', 3, 1, 'item', 'item', 3, '拾取 2 个道具并进入前四', { target: 2 }),
  make('11', 3, '海岛穿插战', 'aegean', 2, 2, 'overtake', 'speed', 3, '弯道或出弯时真正超过对手 2 次', { target: 2 }),
  make('12', 3, '雪地淘汰赛', 'snow', 2, 1, 'elimination', 'speed', 3, '避开 2 次末位淘汰并冲线'),
  make('13', 4, '都市车神', 'city', 3, 2, 'boss', 'speed', 5, '跑赢指定车神并进入前五名'),
  make('14', 4, '沙丘测速', 'egypt', 2, 2, 'speed', 'speed', 3, '经过测速点时达到 185 km/h', { target: 185 }),
  make('15', 4, '雪地混战', 'snow', 3, 2, 'item', 'item', 3, '拾取 3 个道具并进入前三', { target: 3 }),
  make('16', 4, '终极车神', 'aegean', 3, 2, 'boss', 'speed', 3, '超过指定车神，夺得前三'),
]);
export const SKIN_STARS = Object.freeze([0, 3, 6, 10, 14, 19, 25, 34]);
export const SKIN_NAMES = Object.freeze(['烈焰红', '冰蓝', '紫电', '黄金', '珍珠白', '樱粉', '翡翠', '暗夜']);
export const newCareer = () => ({ version: 1, stars: {}, times: {}, skin: 0, rounds: 0,
  daily: { date: '', best: 0, stars: 0, streak: 0, lastWonDate: '' } });
export function localDayKey(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
}
export function dailyStage(date = new Date()) {
  const key = localDayKey(date);
  const pool = [STAGES[2], STAGES[4], STAGES[6], STAGES[8], STAGES[11], STAGES[12], STAGES[14]];
  const index = Number(key.replaceAll('-','')) % pool.length;
  const original = pool[index];
  return Object.freeze({ ...original, id: 'daily-' + key, chapter: 5, name: '每日挑战 · ' + original.name });
}
export const careerStars = career => STAGES.reduce((n, stage) => n + (career?.stars?.[stage.id] ?? 0), 0);
export function stageUnlocked(career, index) {
  return index === 0 || (index > 0 && index < STAGES.length && (career?.stars?.[STAGES[index - 1].id] ?? 0) > 0);
}
export const skinUnlocked = (career, skinIndex) => Number.isInteger(skinIndex) && skinIndex >= 0 && skinIndex < SKIN_STARS.length && careerStars(career) >= SKIN_STARS[skinIndex];
export function loadCareer(raw, legacyBest) {
  try {
    if (!raw) {
      const state = newCareer();
      if (legacyBest && typeof legacyBest === 'object') {
        for (const stage of STAGES) {
          const t = legacyBest[stage.map];
          if (typeof t === 'number' && Number.isFinite(t) && t > 0 && t < 100000 && stage.id === '01') state.times[stage.id] = t;
        }
      }
      return state;
    }
    if (typeof raw !== 'string' || raw.length > 8192) return newCareer();
    const v = JSON.parse(raw);
    if (v?.version !== 1 || !v.stars || typeof v.stars !== 'object' || !v.times || typeof v.times !== 'object') return newCareer();
    const state = newCareer();
    for (const stage of STAGES) {
      const star = v.stars[stage.id]; if (Number.isInteger(star) && star >= 0 && star <= 3) state.stars[stage.id] = star;
      const t = v.times[stage.id]; if (typeof t === 'number' && Number.isFinite(t) && t > 0 && t < 100000) state.times[stage.id] = t;
    }
    state.rounds = Number.isSafeInteger(v.rounds) && v.rounds >= 0 ? Math.min(v.rounds, 1_000_000) : 0;
    state.skin = skinUnlocked(state, v.skin) ? v.skin : 0;
    const d = v.daily;
    const day = x => typeof x === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(x) ? x : '';
    if (d && typeof d === 'object') {
      state.daily.date = day(d.date);
      state.daily.lastWonDate = day(d.lastWonDate);
      state.daily.stars = Number.isInteger(d.stars) && d.stars >= 0 && d.stars <= 3 ? d.stars : 0;
      state.daily.best = typeof d.best === 'number' && Number.isFinite(d.best) && d.best > 0 && d.best < 100000 ? d.best : 0;
      state.daily.streak = Number.isSafeInteger(d.streak) && d.streak >= 0 && d.streak <= 9999 ? d.streak : 0;
    }
    return state;
  } catch { return newCareer(); }
}
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : 0;
/** A qualified drift is the *end*, not the native 'driftStart' counter. */
export const validDrift = event => event?.type === 'driftEnd' && event.data?.clean === true && finite(event.data?.time ?? event.time) > .22;
export function stageMetric(stage, stats = {}) {
  switch (stage.kind) {
    case 'speed': return finite(stats.gateSpeed);
    case 'drift': return finite(stats.cleanDrifts);
    case 'overtake': return finite(stats.cleanPasses);
    case 'item': return finite(stats.pickups);
    case 'relay': return finite(stats.padCount);
    default: return 0;
  }
}
/** A pass should unlock the next challenge only when its actual stage objective is met. */
export function gradeStage(stage, result, stats = {}) {
  const metric = stageMetric(stage, stats), time = finite(result?.time), place = finite(result?.place);
  const ordinary = result?.finished === true && place > 0 && place <= stage.rank;
  const extra = stage.kind === 'boss' ? stats.beatBoss === true :
    stage.kind === 'elimination' ? stats.eliminated !== true && finite(stats.survived) >= 2 :
    stage.kind === 'time' ? time > 0 && time <= stage.target :
    stage.kind === 'relay' ? stats.timedOut !== true && metric >= 1 :
    ['speed', 'drift', 'overtake', 'item'].includes(stage.kind) ? metric >= stage.target : true;
  if (!ordinary || !extra || stats.timedOut || stats.eliminated) return 0;
  let stars = 1;
  if (place <= Math.max(1, stage.rank - 1)) stars++;
  const clean = finite(result?.stats?.crash) <= (stage.laps === 1 ? 2 : 4) && finite(stats.rescues) === 0;
  const mastery = stage.kind === 'time' ? time <= stage.target * .87 :
    stage.kind === 'speed' ? metric >= stage.target + 20 :
    stage.kind === 'drift' ? metric >= Math.max(6,stage.target + 1) :
    stage.kind === 'overtake' ? metric >= stage.target + 1 :
    stage.kind === 'item' ? metric >= stage.target + 1 :
    stage.kind === 'relay' ? metric >= 2 : true;
  if (place === 1 && clean && mastery) stars++;
  return stars;
}
/** Player-facing diagnosis after an actual graded defeat.
 * Pure presentation: never affects rank, stage metrics, fuel, stars or unlocks.
 */
export function stageFailureFeedback(stage, result, stats = {}) {
  const n = value => Number.isFinite(value) ? value : 0;
  const count = (value, target, label) => `${label} ${n(value)}/${target}`;
  const tips = {
    race: '先把赛车开稳、少碰墙，争取进入目标名次',
    speed: '测速点前尽量保持直线，减少转向和撞墙失速',
    drift: '在连续弯稳定漂移，干净出弯才计有效漂移',
    overtake: '先跟住车群，选择弯道或刚出弯时真正超过对手',
    item: '提前按左右选择道具车道，必须实际碰到道具箱才计数',
    time: '减少撞墙和逆行耗时，同时保持目标排名',
    relay: '选择加速带车道取得补时，减少撞墙浪费时间',
    elimination: '接近淘汰点前离开最后一名，先求稳再超车',
    boss: '留意指定车神的位置，减少碰撞并在终点前真正超过他',
  };
  const tip = tips[stage.kind] ?? '保持车速，留意赛前目标并完成比赛';
  if (stats.eliminated) return { reason: '在淘汰点处于最后一名', tip };
  if (stats.timedOut) return { reason: '比赛计时耗尽', tip };
  if (!result?.finished) {
    const percent = Math.round(Math.max(0, Math.min(1, n(result?.completion))) * 100);
    return { reason: `尚未完成比赛（进度 ${percent}%）`, tip };
  }
  const reasons = [];
  const place = n(result.place);
  if (place < 1 || place > stage.rank)
    reasons.push(`第${place || '?'}名，要求前${stage.rank}名`);
  switch (stage.kind) {
    case 'speed':
      if (n(stats.gateSpeed) < stage.target) reasons.push(count(stats.gateSpeed, stage.target, '最佳测速 km/h'));
      break;
    case 'drift':
      if (n(stats.cleanDrifts) < stage.target) reasons.push(count(stats.cleanDrifts, stage.target, '有效漂移'));
      break;
    case 'overtake':
      if (n(stats.cleanPasses) < stage.target) reasons.push(count(stats.cleanPasses, stage.target, '有效弯道超车'));
      break;
    case 'item':
      if (n(stats.pickups) < stage.target) reasons.push(count(stats.pickups, stage.target, '实际拾取道具'));
      break;
    case 'time':
      if (!(n(result.time) > 0 && result.time <= stage.target))
        reasons.push(`用时 ${n(result.time).toFixed(1)} 秒，限时 ${stage.target} 秒`);
      break;
    case 'relay':
      if (n(stats.padCount) < 1) reasons.push('未经过加速带取得补时');
      break;
    case 'elimination':
      if (n(stats.survived) < 2) reasons.push(count(stats.survived, 2, '成功避开淘汰'));
      break;
    case 'boss':
      if (stats.beatBoss !== true) reasons.push('未超过指定车神');
      break;
    default: break;
  }
  return { reason: reasons.join('；') || '该场未达到目标', tip };
}

export function recordStage(career, stage, result, stats) {
  const stars = gradeStage(stage, result, stats);
  const next = { ...career, stars: { ...career.stars }, times: { ...career.times }, rounds: career.rounds + 1 };
  if (stars > (next.stars[stage.id] ?? 0)) next.stars[stage.id] = stars;
  if (result.finished && result.time > 0 && (!next.times[stage.id] || result.time < next.times[stage.id])) next.times[stage.id] = result.time;
  return { stars, career: next, total: careerStars(next) };
}
/** Pick a checkpoint without relying on absolute three.js coordinates. */
export const fractionPassed = (oldProgress, newProgress, totalDistance, threshold) =>
  totalDistance > 0 && oldProgress < totalDistance * threshold && newProgress >= totalDistance * threshold;
