export const CAREER_KEY = 'h5-mobile:qq-speed:career:v1';
const make = (id, chapter, name, map, laps, diff, kind, mode, rank, goal, extra = {}) => Object.freeze({ id, chapter, name, map, laps, diff, kind, mode, rank, goal, ...extra });
/** Four original locations, one driving model. Content is configuration, not 16 new tracks. */
export const STAGES = Object.freeze([
  make('01', 1, '城市起航', 'city', 1, 0, 'race', 'speed', 6, '完成首次比赛'),
  make('02', 1, '沙漠加速', 'egypt', 2, 0, 'speed', 'speed', 6, '经过测速点时达到 150 km/h', { target: 150 }),
  make('03', 1, '内线超车', 'city', 2, 1, 'overtake', 'speed', 5, '完成 1 次有效弯道超车', { target: 1 }),
  make('04', 1, '海湾连漂', 'aegean', 2, 0, 'drift', 'speed', 5, '完成 3 次有效漂移', { target: 3 }),
  make('05', 2, '沙漠道具箱', 'egypt', 2, 0, 'item', 'item', 5, '拾取 1 个道具', { target: 1 }),
  make('06', 2, '城市道具战', 'city', 2, 1, 'item', 'item', 4, '拾取 2 个道具并冲线', { target: 2 }),
  make('07', 2, '海湾限时赛', 'aegean', 2, 1, 'time', 'speed', 5, '在 130 秒内完成', { target: 130 }),
  make('08', 2, '雪地夺旗', 'snow', 2, 1, 'race', 'speed', 3, '进入前三名'),
  make('09', 3, '沙漠补时赛', 'egypt', 2, 1, 'relay', 'speed', 5, '通过加速带补时，完成比赛', { baseTime: 90, bonus: 12, maxTime: 210 }),
  make('10', 3, '城市逆转战', 'city', 3, 1, 'item', 'item', 4, '拾取 2 个道具并进入前四', { target: 2 }),
  make('11', 3, '海岛穿插战', 'aegean', 2, 2, 'overtake', 'speed', 4, '完成 2 次有效弯道超车', { target: 2 }),
  make('12', 3, '雪地淘汰赛', 'snow', 2, 1, 'elimination', 'speed', 3, '避开 2 次末位淘汰并冲线'),
  make('13', 4, '都市车神', 'city', 3, 2, 'boss', 'speed', 5, '跑赢指定车神对手'),
  make('14', 4, '沙丘测速', 'egypt', 2, 2, 'speed', 'speed', 4, '经过测速点时达到 185 km/h', { target: 185 }),
  make('15', 4, '雪地混战', 'snow', 3, 2, 'item', 'item', 3, '拾取 3 个道具并进入前三', { target: 3 }),
  make('16', 4, '终极车神', 'aegean', 3, 2, 'boss', 'speed', 3, '超过指定车神，夺得前三'),
]);
export const SKIN_STARS = Object.freeze([0, 3, 6, 10, 14, 19, 25, 34]);
export const SKIN_NAMES = Object.freeze(['烈焰红', '冰蓝', '紫电', '黄金', '珍珠白', '樱粉', '翡翠', '暗夜']);
export const newCareer = () => ({ version: 1, stars: {}, times: {}, skin: 0, rounds: 0 });
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
    return state;
  } catch { return newCareer(); }
}
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : 0;
/** A qualified drift is the *end*, not the native 'driftStart' counter. */
export const validDrift = event => event?.type === 'driftEnd' && finite(event.data?.time ?? event.time) > .22;
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
  const clean = finite(result?.stats?.crash) <= (stage.laps === 1 ? 2 : 4);
  const mastery = stage.kind === 'time' ? time <= stage.target * .87 :
    stage.kind === 'speed' ? metric >= stage.target + 20 :
    stage.kind === 'drift' || stage.kind === 'overtake' ? metric >= stage.target + 1 :
    stage.kind === 'item' ? metric >= stage.target + 1 :
    stage.kind === 'relay' ? metric >= 2 : true;
  if (place === 1 && clean && mastery) stars++;
  return stars;
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
