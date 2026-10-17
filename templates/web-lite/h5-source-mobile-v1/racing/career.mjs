import { EXTRA_STAGES } from './career-expansion.mjs';
import { PAINT_NAMES, LEGACY_PAINT_STARS, freshCosmetics, restoreCosmetics, skinOwned, carOwned } from './cosmetics.mjs';
export const CAREER_KEY = 'h5-mobile:qq-speed:career:v1';
/** Only genuine finished podium placement determines the three visible medals. */
export const PODIUM_GOAL='前三名通关 · 第1名三星 / 第2名二星 / 第3名一星';
export const rankStars=(finished,place)=>finished===true&&Number.isInteger(place)&&place>=1&&place<=3?4-place:0;
const make=(id,chapter,name,map,laps,diff,kind,mode,rank,goal,extra={})=>
  Object.freeze({id,chapter,name,map,course:'race-'+id,laps,diff,kind,mode,
    rank:Math.max(3,rank),goal:PODIUM_GOAL,mission:goal,...extra});
/** Every stage demands real rank/technique; 17-30 add eight-chapter progression. */
export const STAGES = Object.freeze([
  make('01', 1, '城市攻防环', 'city', 2, 1, 'race', 'speed', 3, '跑满两圈并争取前三名'),
  make('02', 1, '沙漠疾速考核', 'egypt', 2, 0, 'speed', 'speed', 3, '三个测速点至少一次达到 175 km/h', {'target':175}),
  make('03', 1, '内线双反超', 'city', 2, 1, 'overtake', 'speed', 3, '争取前三名，弯道超车 2 次挑战三星', {'target':2}),
  make('04', 1, '海湾高压连漂', 'aegean', 2, 0, 'drift', 'speed', 3, '完成 5 次有效漂移', {'target':5}),
  make('05', 2, '神殿道具争夺', 'egypt', 2, 0, 'item', 'item', 3, '争取前三名，拾取 2 个道具挑战三星', {'target':2}),
  make('06', 2, '城市道具混战', 'city', 2, 1, 'item', 'item', 3, '争取前三名，拾取 3 个道具挑战三星', {'target':3}),
  make('07', 2, '海崖极限限时', 'aegean', 1, 1, 'time', 'speed', 3, '在 158 秒内完成并进入前三', {'target':158}),
  make('08', 2, '雪地决胜', 'snow', 2, 1, 'race', 'speed', 2, '进入前二名'),
  make('09', 3, '沙丘极限补时', 'egypt', 2, 1, 'relay', 'speed', 3, '抢加速带补时并冲进前三', {'baseTime':115,'bonus':14,'maxTime':240}),
  make('10', 3, '城市逆转争冠', 'city', 3, 1, 'item', 'item', 2, '争取前二名，拾取 3 个道具挑战三星', {'target':3}),
  make('11', 3, '海蛇三次超越', 'aegean', 2, 2, 'overtake', 'speed', 2, '争取前二名，弯道超车 3 次挑战三星', {'target':3}),
  make('12', 3, '雪地末位猎杀', 'snow', 2, 1, 'elimination', 'speed', 2, '避开 2 次末位淘汰并进入前二'),
  make('13', 4, '都市终极车神', 'city', 3, 2, 'boss', 'speed', 2, '跑赢指定车神并进入前二名'),
  make('14', 4, '沙丘极速冲顶', 'egypt', 2, 2, 'speed', 'speed', 2, '测速点至少一次达到 190 km/h', {'target':190}),
  make('15', 4, '极地道具冠军战', 'snow', 3, 2, 'item', 'item', 2, '争取前二名，拾取 4 个道具挑战三星', {'target':4}),
  make('16', 4, '悬崖冠军决战', 'aegean', 3, 2, 'boss', 'speed', 1, '超过指定车神，夺得第一名'),
  ...EXTRA_STAGES.map(stage=>Object.freeze({...stage,rank:3,mission:stage.goal,goal:PODIUM_GOAL})),
]);
/** First five races have no extra star gate. Every checkpoint still requires
 * a real podium finish in the immediately preceding stage. */
export const STAR_CHECKPOINTS=Object.freeze({'06':8,'11':18,'16':29,'21':40,'26':51,'30':60});
export const starGateRequirement=index=>
  Number.isInteger(index)&&index>=0&&index<STAGES.length ?
    (STAR_CHECKPOINTS[STAGES[index].id]??0) : 0;
export function starGateStatus(career,index) {
  const stage=STAGES[index], required=starGateRequirement(index);
  const earned=careerStars(career);
  const previousCleared=index===0||!!(stage && (career?.stars?.[STAGES[index-1]?.id]??0)>0);
  const pass=stage && required ? career?.gatePasses?.[stage.id] : null;
  // Preserve a previous player's already-earned medal on the gated stage,
  // even if their save predates the rollout.
  const alreadyCompleted=!!(stage && required && STAGES.slice(index)
    .some(s=>(career?.stars?.[s.id]??0)>0));
  const gateSatisfied=!required||earned>=required||pass==='ad'||pass==='legacy'||alreadyCompleted;
  return {
    index, stageId:stage?.id??null, required, earned,
    missing:Math.max(0,required-earned),
    previousCleared, gateSatisfied,
    adUnlocked:pass==='ad',legacyUnlocked:pass==='legacy'||alreadyCompleted,
    unlocked:!!stage && previousCleared && gateSatisfied,
    starLocked:!!stage && previousCleared && !gateSatisfied,
  };
}
// Historical thresholds remain ONLY for one-time save migration, never new unlocks.
export const SKIN_STARS = LEGACY_PAINT_STARS;
export const SKIN_NAMES = PAINT_NAMES;
export const newCareer = () => ({ version: 1, stars: {}, times: {}, gatePasses: {}, skin: 0, rounds: 0,
  ...freshCosmetics(), daily: { date: '', best: 0, stars: 0, streak: 0, lastWonDate: '' } });
export function localDayKey(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
}
export function dailyStage(date = new Date()) {
  const key = localDayKey(date);
  const pool = [STAGES[2], STAGES[4], STAGES[6], STAGES[8], STAGES[11], STAGES[12], STAGES[14]];
  const index = Number(key.replaceAll('-','')) % pool.length;
  const original = pool[index];
  return Object.freeze({ ...original, id: 'daily-' + key, chapter: 9, name: '每日挑战 · ' + original.name });
}
export const careerStars = career => STAGES.reduce((n, stage) => n + (career?.stars?.[stage.id] ?? 0), 0);
export function stageUnlocked(career,index) {
  return starGateStatus(career,index).unlocked;
}
export const skinUnlocked = skinOwned;
export const carUnlocked = carOwned;
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
    // Old V1 saves did not contain gatePasses. Grandfather ONLY those actual
    // stages they could already enter before the star-gate update, including
    // a checkpoint they opened but never won. New V1 saves always have {}.
    if(!Object.hasOwn(v,'gatePasses')){
      for(const id of Object.keys(STAR_CHECKPOINTS)) {
        const index=STAGES.findIndex(s=>s.id===id);
        if((state.stars[STAGES[index-1].id]??0)>0)state.gatePasses[id]='legacy';
      }
    }else if(v.gatePasses && typeof v.gatePasses==='object' && !Array.isArray(v.gatePasses)){
      for(const id of Object.keys(STAR_CHECKPOINTS)){
        if(v.gatePasses[id]==='ad'||v.gatePasses[id]==='legacy')
          state.gatePasses[id]=v.gatePasses[id];
      }
    }
    state.rounds = Number.isSafeInteger(v.rounds) && v.rounds >= 0 ? Math.min(v.rounds, 1_000_000) : 0;
    // Preserve colors already earned by older star-only saves, then freeze ownership.
    // Winning more stars after this migration does not grant additional paints.
    Object.assign(state, restoreCosmetics(v, careerStars(state)));
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
/** Timing, driving tasks and clean turns remain authentic challenges, but
 * they cannot inflate or revoke stars earned from an actual finishing rank. */
export function gradeStage(_stage,result) {
  return rankStars(result?.finished,result?.place);
}
/** Player-facing diagnosis after an actual graded defeat.
 * Pure presentation: never affects rank, stage metrics, fuel, stars or unlocks.
 */
export function stageFailureFeedback(stage, result, stats = {}) {
  const n = value => Number.isFinite(value) ? value : 0;
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
  return {reason:`第${n(result.place)||'?'}名，要求前三名`,tip};
}

export function recordStage(career, stage, result, stats) {
  const stars = gradeStage(stage, result, stats);
  const next = { ...career, stars: { ...career.stars }, times: { ...career.times }, rounds: career.rounds + 1 };
  const previousStars=next.stars[stage.id]??0,bestStars=Math.max(stars,previousStars);
  if(bestStars>previousStars)next.stars[stage.id]=bestStars;
  if (result.finished && result.time > 0 && (!next.times[stage.id] || result.time < next.times[stage.id])) next.times[stage.id] = result.time;
  return { stars, previousStars, bestStars, improvement:bestStars-previousStars, career:next, total:careerStars(next) };
}
/** Pick a checkpoint without relying on absolute three.js coordinates. */
export const fractionPassed = (oldProgress, newProgress, totalDistance, threshold) =>
  totalDistance > 0 && oldProgress < totalDistance * threshold && newProgress >= totalDistance * threshold;
