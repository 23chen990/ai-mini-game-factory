// Owned small lifecycle module around existing games, not a replacement game engine.
export function racePhase(state) { return state === 'finish' ? 'finished' : state === 'paused' ? 'paused' : ['race', 'countdown'].includes(state) ? 'running' : 'ready'; }
export function newProgress() { return { version: 1, best: 0, bank: 0, rounds: 0, nextRoundId: 1, lastRewardedRound: 0, assistTokens: 0 }; }
export function purchaseAssist(progress) {
  if (progress.bank < 10 || progress.assistTokens >= 1) return false;
  progress.bank -= 10; progress.assistTokens = 1; return true;
}
export function startRound(progress, limitMs = null) {
  return { id: progress.nextRoundId++, phase: 'running', elapsedMs: 0, limitMs, score: 0, settled: false, rewardClaimed: false };
}
export function tickRound(round, ms, score) {
  if (round.phase !== 'running') return;
  if (Number.isFinite(score) && score >= 0) round.score = Math.floor(score);
  if (Number.isFinite(ms) && ms > 0) round.elapsedMs += ms;
  if (round.limitMs !== null && round.elapsedMs >= round.limitMs) { round.elapsedMs = round.limitMs; round.phase = 'finished'; }
}
export function pauseRound(round) { if (round.phase === 'running') round.phase = 'paused'; }
export function resumeRound(round) { if (round.phase === 'paused') round.phase = 'running'; }
export function finishRound(round, progress) {
  round.phase = 'finished';
  if (round.settled) return false;
  round.settled = true; progress.rounds++; progress.best = Math.max(progress.best, round.score); progress.bank += round.score;
  return true;
}
export function rewardRound(round, progress, complete) {
  if (complete !== true || round.phase !== 'finished' || !round.settled || round.score <= 0 || round.rewardClaimed || progress.lastRewardedRound === round.id) return false;
  round.rewardClaimed = true; progress.lastRewardedRound = round.id; progress.bank += round.score; return true;
}
export function adAllowed(round, progress, sinceStartupMs) {
  return round.phase === 'finished' && round.settled && round.score > 0 && progress.rounds >= 2 && sinceStartupMs >= 60000 && !round.rewardClaimed;
}
export function saveProgress(progress, gameId) { return JSON.stringify({ version: 1, gameId, progress }); }
export function loadProgress(raw, gameId) {
  try {
    if (typeof raw !== 'string' || raw.length > 2000) return null;
    const data = JSON.parse(raw), p = data.progress;
    if (data.version !== 1 || data.gameId !== gameId || p?.version !== 1 ||
      !['best', 'bank', 'rounds', 'lastRewardedRound'].every(k => Number.isInteger(p[k]) && p[k] >= 0 && p[k] <= 1000000) ||
      !Number.isInteger(p.assistTokens) || p.assistTokens < 0 || p.assistTokens > 1 ||
      !Number.isInteger(p.nextRoundId) || p.nextRoundId < 1 || p.nextRoundId > 1000001 || p.lastRewardedRound >= p.nextRoundId) return null;
    return p;
  } catch { return null; }
}

// Challenge goals observe the existing engines. They do not replace their rules or ads.
const CHALLENGES = {
  'pelican-bike': [
    {id:'coast',title:'海岸抓鱼',instructions:'90秒内抓到8分。金鱼加分，左右追鱼。',limitMs:90000,kind:'fish',target:8},
    {id:'sprint',title:'限时冲刺',instructions:'45秒内抓到5分，尽快对准前方的鱼。',limitMs:45000,kind:'fish',target:5},
    {id:'jump',title:'腾跃追鱼',instructions:'90秒内抓到8分，并完成3次跳跃。',limitMs:90000,kind:'fish',target:8,jumps:3},
  ],
  'qq-speed': [
    {id:'finish',title:'城市完赛',instructions:'城市赛道跑完一圈。左右转向，必要时漂移。',limitMs:150000,kind:'race',target:1,map:'city'},
    {id:'podium',title:'海岛领奖台',instructions:'爱琴海一圈完赛，并进入前三名。',limitMs:150000,kind:'race',target:1,map:'aegean',place:3},
    {id:'drift',title:'漂移练习赛',instructions:'城市一圈完赛，并触发2次有效漂移。',limitMs:150000,kind:'race',target:1,map:'city',drifts:2},
  ],
  'cf-transport-ship': [
    {id:'tags',title:'步枪熟悉',instructions:'M4起手，60秒内累计命中3次。移动、瞄准，再开火。',limitMs:60000,kind:'hits',target:3,weapon:'m4a1'},
    {id:'precision',title:'狙击尝试',instructions:'AWM起手，90秒内完成1次玩家击杀。可以换武器。',limitMs:90000,kind:'kills',target:1,weapon:'awm'},
    {id:'survive',title:'小队生存',instructions:'MP5起手，坚持45秒，死亡不超过2次。',limitMs:45000,kind:'survive',target:2,weapon:'mp5'},
  ],
};
export function challengesFor(gameId) {
  if (!Object.hasOwn(CHALLENGES,gameId)) throw Error('Unknown challenge game');
  return CHALLENGES[gameId].map(c=>({...c}));
}
export function challengeResult(c,m={},terminal=false) {
  let complete=false,failed=false,value=0,label='';
  if(c.kind==='fish') {value=m.points||0;complete=value>=c.target&&(!c.jumps||(m.jumps||0)>=c.jumps);label=`🐟 ${value}/${c.target}`+(c.jumps?` · ⤒ ${m.jumps||0}/${c.jumps}`:'');}
  if(c.kind==='race') {value=m.finished?1:0;complete=!!m.finished&&(!c.place||m.place>0&&m.place<=c.place)&&(!c.drifts||(m.drifts||0)>=c.drifts);label=`🏁 ${m.place>0?'第'+m.place+'名':'等待发车'}`+(c.drifts?` · 漂移 ${m.drifts||0}/${c.drifts}`:'');}
  if(c.kind==='hits'||c.kind==='kills') {value=m[c.kind]||0;complete=value>=c.target;label=`🎯 ${value}/${c.target}${c.kind==='hits'?'命中':'击杀'}`;}
  if(c.kind==='survive') {value=Math.min(c.target+1,m.deaths||0);failed=value>c.target;complete=terminal&&!failed;label=`❤ 死亡 ${value}/${c.target}`;}
  return {outcome:failed?'lost':complete?'won':terminal?'lost':'running',value,label,rewardScore:c.kind==='survive'?(complete?3:0):value};
}
export function newChallengeProgress(gameId) {return {version:1,gameId,selected:challengesFor(gameId)[0].id,records:{}};}
export function recordChallenge(p,c,score,outcome) {
  const previous=p.records[c.id]??{best:0,attempts:0,wins:0};
  p.records[c.id]={best:Math.max(previous.best,Math.max(0,Math.floor(score))),attempts:previous.attempts+1,wins:previous.wins+(outcome==='won'?1:0)};
}
export function saveChallengeProgress(p) {return JSON.stringify(p);}
export function loadChallengeProgress(raw,gameId) {
  try {
    if(typeof raw!=='string'||raw.length>2000)return null;
    const p=JSON.parse(raw),ids=challengesFor(gameId).map(c=>c.id);
    if(p.version!==1||p.gameId!==gameId||!ids.includes(p.selected)||!p.records||typeof p.records!=='object'||Array.isArray(p.records))return null;
    for(const [id,r]of Object.entries(p.records))if(!ids.includes(id)||!r||!['best','attempts','wins'].every(k=>Number.isInteger(r[k])&&r[k]>=0&&r[k]<=1000000)||r.wins>r.attempts)return null;
    return p;
  }catch{return null;}
}
