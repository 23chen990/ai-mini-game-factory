import { STAGES, dailyStage, localDayKey } from '../../templates/web-lite/h5-source-mobile-v1/racing/career.mjs';

/** Only framebuffer colors/shape, never item coordinates or racer state. */
export function needsVisibleItemPickup(goal) {
  const count = goal.match(/已拾取道具 (\d+)\/(\d+)/u);
  return !!count && Number(count[1]) < Number(count[2]);
}
export function visibleItemSteer(policy, box) {
  if (!box?.direction || policy.reason?.includes('recovery') || Math.abs(policy.angle ?? 1) >= .35) return policy;
  return { ...policy, roadDirection: policy.direction, direction: box.direction, box };
}
export function earnedResumeOrigin(report, storage, buildHash) {
  if (report.buildHash !== buildHash) throw Error('Cannot resume another build');
  const saved = report.races.at(-1)?.saved;
  const exact = storage.origins.filter(origin => origin.localStorage.some(entry => entry.name === 'h5-mobile:qq-speed:career:v1' && entry.value === saved));
  if (!saved || exact.length !== 1 || !/^http:\/\/127\.0\.0\.1:\d+$/u.test(exact[0].origin)) throw Error('Resume requires one exact earned local origin');
  return exact[0].origin;
}
/** A separately labelled upgrade test, never proof of new-build earlier wins.
 * The source is an actual previous natural run, not a fabricated campaign fixture. */
export function earnedUpgradeOrigin(report, storage, archivedBuild, nextBuildHash) {
  if (report.buildHash !== archivedBuild.buildHash || report.buildHash === nextBuildHash ||
      report.naturalInputsOnly !== true || report.seededCampaign !== false)
    throw Error('Upgrade requires a matching archived natural build and unmodified earned origin');
  return earnedResumeOrigin(report, storage, archivedBuild.buildHash);
}
export function warningVisible(element) {
  return !!element && !element.hidden && !element.classList.contains('hidden') && element.getClientRects().length > 0;
}
/** Resolve the daily start date from read-only browser clocks and native config. */
export function dailyRaceDayFromStart(evidence) {
  const { before, after } = evidence ?? {};
  if (!before || !after || after.nativeState !== 'race') return null;
  const validStamp = stamp => ['wallMs', 'monotonicMs', 'timeOrigin', 'timezoneOffsetMinutes']
    .every(key => Number.isFinite(stamp[key])) && stamp.monotonicMs >= 0 &&
    Number.isInteger(stamp.timezoneOffsetMinutes) && Math.abs(stamp.timezoneOffsetMinutes) <= 1440;
  if (!validStamp(before) || !validStamp(after) || before.timeOrigin !== after.timeOrigin ||
      before.timezoneOffsetMinutes !== after.timezoneOffsetMinutes) return null;
  const wallElapsed = after.wallMs - before.wallMs, elapsed = after.monotonicMs - before.monotonicMs;
  // This bounds evidence only; the runner's existing entry wait is unchanged.
  // Compare both clocks so a forward wall-clock jump cannot invent another day.
  if (wallElapsed < 0 || elapsed < 0 || wallElapsed > 180000 || elapsed > 180000 ||
      Math.abs(wallElapsed - elapsed) > 100) return null;
  const localTimes = [before, after].map(stamp => stamp.wallMs - stamp.timezoneOffsetMinutes * 60000);
  if (localTimes.some(ms => !Number.isFinite(new Date(ms).getTime()))) return null;
  const days = localTimes.map(ms => Math.floor(ms / 86400000));
  if (days[1] < days[0] || days[1] - days[0] > 1) return null;
  const candidates = [...new Set(localTimes.map(ms => new Date(ms).toISOString().slice(0, 10)))];
  const matching = candidates.filter(day => {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) return false;
    const stage = dailyStage(new Date(day + 'T12:00:00'));
    return ['course', 'map', 'laps', 'diff', 'mode'].every(key => after[key] === stage[key]);
  });
  // A month boundary can assign the same course to both dates. Never guess.
  return matching.length === 1 ? matching[0] : null;
}
export function qualifiedVisibleFinish(terminal, savedStars) {
  if (terminal?.phase !== 'finished' || terminal.finished !== true ||
      !Number.isInteger(terminal.place) || terminal.place < 1 || terminal.place > 3 ||
      !Number.isFinite(terminal.finishTime) || terminal.finishTime <= 0 ||
      !Number.isFinite(terminal.progress) || terminal.progress <= 0 ||
      terminal.heading !== `第 ${terminal.place} 名` ||
      !Number.isInteger(savedStars) || savedStars < 4 - terminal.place || savedStars > 3) return false;

  const daily = terminal.stage === 'daily';
  let stage;
  if (daily) {
    const startDay = dailyRaceDayFromStart(terminal.dailyStart);
    if (!startDay || startDay !== terminal.raceDay || ['course', 'map', 'laps', 'diff', 'mode']
      .some(key => terminal.dailyStart.after[key] !== terminal[key])) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(terminal.raceDay ?? '')) return false;
    const date = new Date(terminal.raceDay + 'T12:00:00');
    if (!Number.isFinite(date.getTime()) || localDayKey(date) !== terminal.raceDay) return false;
    stage = dailyStage(date);
  } else stage = STAGES.find(candidate => candidate.id === terminal.stage);
  if (!stage || ['course', 'map', 'laps', 'diff', 'mode'].some(key => terminal[key] !== stage[key])) return false;

  // The headline alone can be left over from another run. Bind the visible
  // result's place/time to this native finish, then check its actual save key.
  const seconds = terminal.finishTime;
  const visibleTime = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
  const resultPrefix = `${daily ? '每日挑战成功 · ' : ''}第 ${terminal.place} 名 · ${visibleTime} · `;
  if(terminal.resultCard){
    // New product layout renders time/stars in their own visible fields.
    // Keep old report validation intact; neither path accepts stale medals.
    if(terminal.resultCard.time!==visibleTime ||
      !terminal.resultCard.stars?.startsWith(`本场 ${4-terminal.place} 星 · `))return false;
  }else if (typeof terminal.result !== 'string' || !terminal.result.startsWith(resultPrefix)) return false;
  let saved;
  try { saved = JSON.parse(terminal.saved); } catch { return false; }
  if (saved?.version !== 1 || !Number.isInteger(saved.rounds) || saved.rounds < 1) return false;
  if (daily && (saved.daily?.date !== terminal.raceDay || saved.daily?.lastWonDate !== terminal.raceDay)) return false;
  const storedStars = daily ? saved.daily?.stars : saved.stars?.[stage.id];
  const bestTime = daily ? saved.daily?.best : saved.times?.[stage.id];
  // Best medals/time persist across replays. A better historical record is
  // legitimate, but it never substitutes for this run's native podium finish.
  return storedStars === savedStars && Number.isFinite(bestTime) && bestTime > 0 && bestTime <= seconds;
}
/** Remember only the rendered arrow/road. No native car/track/item state is read. */
export function recoverVisibleHeading(policy, memory, now) {
  if (!policy.heading) return policy;
  const h = policy.heading;
  const angleTo = target => Math.atan2(h[0] * target[1] - h[1] * target[0], h[0] * target[0] + h[1] * target[1]);
  const turn = memory.heading ? Math.abs(angleTo(memory.heading)) : 0;
  const abrupt = memory.heading && now - memory.at <= 240 && turn > .85;
  if (!policy.wrongWay) memory.warningHandled = false;
  if (!memory.recovery && (abrupt || (policy.wrongWay && !memory.warningHandled))) {
    // A visible warning is authoritative when the fast spin was not sampled.
    // Do not trust a backward "forward" vector learned before the warning appeared.
    let target = policy.wrongWay ? [-h[0], -h[1]] : memory.forward ?? [-h[0], -h[1]];
    const forwardRoad = policy.roadPoints?.filter(p => (p[0] * target[0] + p[1] * target[1]) / Math.hypot(...p) > .35);
    if (forwardRoad?.length) {
      const average = forwardRoad.reduce((v, p) => [v[0] + p[0], v[1] + p[1]], [0, 0]), length = Math.hypot(...average);
      if (length) target = average.map(v => v / length);
    }
    const angle = angleTo(target);
    const center = policy.roadPoints?.reduce((v, p) => [v[0] + p[0], v[1] + p[1]], [0, 0]);
    const cross = center ? (h[0] * center[1] - h[1] * center[0]) / policy.roadPoints.length : 0;
    memory.recovery = { target, started: now, switched: now, direction: Math.abs(cross) > .7 ? cross > 0 ? 'left' : 'right' : angle >= 0 ? 'left' : 'right' };
  }
  memory.heading = h; memory.at = now;
  if (memory.recovery) {
    const { target, started } = memory.recovery, angle = angleTo(target);
    if (Math.abs(angle) > 1.7 && now - memory.recovery.switched > 2500) {
      memory.recovery.direction = memory.recovery.direction === 'left' ? 'right' : 'left'; memory.recovery.switched = now;
    }
    const direction = memory.recovery.direction;
    if (now - started >= 1200 && Math.abs(angle) < .30) {
      memory.recovery = null; memory.warningHandled = true;
    } else {
      return { ...policy, direction: Math.abs(angle) < .15 ? null : Math.abs(angle) > 1.7 ? direction : angle > 0 ? 'left' : 'right', reason: 'visible-arrow-spin-recovery', angle, recoveryTarget: target };
    }
  }
  if (!policy.wrongWay && policy.target) {
    const length = Math.hypot(...policy.target);
    if (length) memory.forward = policy.target.map(v => v / length);
  }
  return policy;
}
export function itemBoxPolicy({ width: W, height: H, data }) {
  const mask = new Uint8Array(W * H), seen = new Uint8Array(W * H), candidates = [];
  const y0 = Math.floor(H * .34), y1 = Math.floor(H * .60);
  for (let y = y0; y < y1; y++) for (let x = Math.floor(W * .1); x < W * .9; x++) {
    const i = y * W + x, j = i * 4;
    mask[i] = data[j] < 160 && data[j + 1] > 95 && data[j + 1] < 230 && data[j + 2] > 190 && data[j + 2] - data[j] > 65 && data[j + 2] - data[j + 1] > 38 ? 1 : 0;
  }
  for (let i = y0 * W; i < y1 * W; i++) {
    if (!mask[i] || seen[i]) continue;
    const queue = [i]; seen[i] = 1;
    let x0 = W, x1 = 0, ya = H, yb = 0;
    for (let q = 0; q < queue.length; q++) {
      const k = queue[q], x = k % W, y = Math.floor(k / W);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); ya = Math.min(ya, y); yb = Math.max(yb, y);
      for (const n of [k - W, k + W, x ? k - 1 : -1, x < W - 1 ? k + 1 : -1]) if (n >= 0 && n < mask.length && mask[n] && !seen[n]) { seen[n] = 1; queue.push(n); }
    }
    const width = x1 - x0 + 1, height = yb - ya + 1;
    if (queue.length < 12 || width < 4 || height < 4 || width > 45 || height > 45 || width / height >= 2.5 || height / width >= 2.5 || queue.length / (width * height) < .35) continue;
    // The now-visible question hook and detached dot separate boxes from blue
    // rival roofs, windows and billboard patches; use actual framebuffer only.
    const white = new Set(), groups = [];
    for (let y = ya; y <= yb; y++) for (let x = x0; x <= x1; x++) {
      const k = y * W + x, j = k * 4;
      if (data[j] > 180 && data[j + 1] > 180 && data[j + 2] > 180) white.add(k);
    }
    while (white.size) {
      const start = white.values().next().value, q = [start]; white.delete(start); let sumY = 0;
      for (let j = 0; j < q.length; j++) {
        const k = q[j]; sumY += Math.floor(k / W);
        for (const n of [k - W, k + W, k - 1, k + 1]) if (white.delete(n)) q.push(n);
      }
      groups.push({ count: q.length, y: sumY / q.length });
    }
    const mark = groups.some(top => groups.some(dot => top.count >= 3 && dot.count >= 1 && top.count > dot.count && dot.y - top.y >= 2));
    if (mark) candidates.push({ x: (x0 + x1) / 2, y: (ya + yb) / 2, width, height, pixels: queue.length });
  }
  const target = candidates.sort((a, b) => b.y - a.y || b.pixels - a.pixels)[0];
  if (!target) return null;
  return { direction: target.x < W / 2 - 14 ? 'left' : target.x > W / 2 + 14 ? 'right' : null, target, source: 'visible-blue-question-cube-pixels' };
}
