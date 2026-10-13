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
