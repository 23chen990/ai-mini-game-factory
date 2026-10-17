/**
 * Small on-device playtest ledger for racing. Never uploads telemetry, stores
 * user identifiers, alters driving physics, or claims a rewarded-video callback
 * is proof of paid ad revenue.
 *
 * Counts real start/finish/replay actions separately. Scripted CI runs can
 * exercise this module, but do not become evidence of human playtest results.
 */
export const RACE_TRIAL_KEY = 'h5-mobile:qq-speed:playtest:v1';
const MAX_RECENT = 40;
const MAX_RAW_LENGTH = 16000;
const safeCourse = value => typeof value === 'string' &&
  /^race-(0[1-9]|[12][0-9]|30)$/.test(value);
const safeCount = value => Number.isSafeInteger(value) && value >= 0
  ? Math.min(value, 1000000) : 0;
const safeSeconds = value => typeof value === 'number' &&
  Number.isFinite(value) && value >= 0 && value < 100000
    ? Math.round(value * 10) / 10 : null;
const fresh = () => ({
  v: 1, starts: 0, finishes: 0, wins: 0, rankLosses: 0,
  objectiveLosses: 0, didNotFinish: 0, closeRankLosses: 0,
  replayAfterLoss: 0, replayAfterWin: 0,
  rewardedRequests: 0, rewardedCompletedSignals: 0,
  rewardedNoCredit: 0, recent: []
});

/** Rank gaps in *native finish times*, never progress meters after finishing.
 * Return null for unfinished rivals, mission-only failure and ambiguous data.
 */
export function rankFinishGapSeconds(stage, result) {
  if (!safeCourse(stage?.course) || !Number.isInteger(stage.rank) ||
      stage.rank < 1 || stage.rank > 6 ||
      result?.finished !== true || !Number.isInteger(result.place) ||
      result.place <= stage.rank || !Array.isArray(result.rows)) return null;
  const ahead = result.rows.find(row => row?.place === stage.rank);
  const myTime = safeSeconds(result.time);
  const theirTime = safeSeconds(ahead?.time);
  if (myTime === null || theirTime === null || theirTime <= 0 ||
      myTime <= theirTime) return null;
  return Math.round((myTime - theirTime) * 10) / 10;
}

function read(storage) {
  let raw;
  try { raw = storage?.getItem(RACE_TRIAL_KEY); } catch { return fresh(); }
  if (typeof raw !== 'string' || raw.length > MAX_RAW_LENGTH) return fresh();
  try {
    const data = JSON.parse(raw);
    if (data?.v !== 1 || !Array.isArray(data.recent)) return fresh();
    const output = fresh();
    for (const key of Object.keys(output)) {
      if (key !== 'v' && key !== 'recent') output[key] = safeCount(data[key]);
    }
    // Only retain a bounded, allowlisted summary. Never load arbitrary fields.
    output.recent = data.recent.slice(-MAX_RECENT).flatMap(item => {
      if (!safeCourse(item?.stage) || !['win','rank','objective','dnf'].includes(item.outcome) ||
          !Number.isInteger(item.place) || item.place < 1 || item.place > 6) return [];
      return [{
        stage: item.stage, outcome: item.outcome, place: item.place,
        raceSeconds: safeSeconds(item.raceSeconds),
        rankGapSeconds: safeSeconds(item.rankGapSeconds),
        crashes: safeCount(item.crashes),
        gainedPositions: safeCount(item.gainedPositions),
        lostPositions: safeCount(item.lostPositions)
      }];
    });
    return output;
  } catch { return fresh(); }
}

export class RaceTrialMetrics {
  constructor(storage) {
    this.storage = storage;
    this.data = read(storage);
    this.activeCourse = null;
  }
  persist() {
    try { this.storage?.setItem(RACE_TRIAL_KEY, JSON.stringify(this.data)); return true; }
    catch { return false; } // Private browsing must never block racing.
  }
  start(stage) {
    if (!safeCourse(stage?.course)) return false;
    this.activeCourse = stage.course;
    this.data.starts++;
    this.persist();
    return true;
  }
  /** This only records replays AFTER the real native countdown has started. */
  replay(stage, previousPassed) {
    if (!safeCourse(stage?.course) || this.activeCourse !== stage.course ||
        typeof previousPassed !== 'boolean') return false;
    this.data[previousPassed ? 'replayAfterWin' : 'replayAfterLoss']++;
    this.persist();
    return true;
  }
  finish(stage, result, stars, raceSeconds, duel = {}) {
    if (!safeCourse(stage?.course) || this.activeCourse !== stage.course ||
        result?.finished !== true && result?.finished !== false ||
        !Number.isInteger(result.place) || result.place < 1 || result.place > 6 ||
        !Number.isInteger(stars) || stars < 0 || stars > 3) return false;
    this.activeCourse = null; // Re-entrant finish() must not double count.
    const won = stars > 0, rankLost = result.finished && result.place > stage.rank;
    const outcome = won ? 'win' : !result.finished ? 'dnf' :
      rankLost ? 'rank' : 'objective';
    const rankGapSeconds = rankLost ? rankFinishGapSeconds(stage, result) : null;
    this.data.finishes++;
    this.data[won ? 'wins' : outcome === 'dnf' ? 'didNotFinish' :
      outcome === 'rank' ? 'rankLosses' : 'objectiveLosses']++;
    if (outcome === 'rank' && rankGapSeconds !== null && rankGapSeconds <= 3)
      this.data.closeRankLosses++;
    this.data.recent.push({
      stage: stage.course, outcome, place: result.place,
      raceSeconds: safeSeconds(raceSeconds),
      rankGapSeconds,
      crashes: safeCount(result.stats?.crash),
      gainedPositions: safeCount(duel.gainedPositions),
      lostPositions: safeCount(duel.lostPositions)
    });
    if (this.data.recent.length > MAX_RECENT)
      this.data.recent.splice(0, this.data.recent.length - MAX_RECENT);
    this.persist();
    return true;
  }
  /** These are video callback signals, NOT confirmed billable impressions. */
  rewardedOutcome(status) {
    this.data.rewardedRequests++;
    if (status === 'completed' || status === 'session-credit')
      this.data.rewardedCompletedSignals++;
    else this.data.rewardedNoCredit++;
    this.persist();
  }
  /** Explicit player-initiated export. No upload, user ID, browser fingerprint,
   * full gameplay trace or claimed ad revenue. A snapshot can include QA runs. */
  exportJSON() {
    return JSON.stringify({
      schemaVersion:1,game:'racing-h5',build:'V5.3',
      verifiedHumanPlay:false,containsPersonalIdentifiers:false,
      generatedOnDevice:true,
      explanation:'本地试玩摘要（可能包含自动化 QA）；广告完成信号不是结算收入',
      metrics:this.snapshot()
    },null,2);
  }
  snapshot() {
    const { recent, ...counts } = this.data;
    return {
      ...counts,
      completedAttemptRate: counts.starts > 0
        ? +(counts.finishes / counts.starts).toFixed(3) : null,
      passRate: counts.finishes > 0
        ? +(counts.wins / counts.finishes).toFixed(3) : null,
      recent: recent.map(entry => ({ ...entry })),
      notes: '本机运行记录，可能包含自动化测试；不得冒充真人留存或广告收入'
    };
  }
}
