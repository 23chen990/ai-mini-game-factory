/** Only framebuffer colors/shape, never item coordinates or racer state. */
export function needsVisibleItemPickup(goal) {
  const count = goal.match(/已拾取道具 (\d+)\/(\d+)/u);
  return !!count && Number(count[1]) < Number(count[2]);
}
export function earnedResumeOrigin(report, storage, buildHash) {
  if (report.buildHash !== buildHash) throw Error('Cannot resume another build');
  const saved = report.races.at(-1)?.saved;
  const exact = storage.origins.filter(origin => origin.localStorage.some(entry => entry.name === 'h5-mobile:qq-speed:career:v1' && entry.value === saved));
  if (!saved || exact.length !== 1 || !/^http:\/\/127\.0\.0\.1:\d+$/u.test(exact[0].origin)) throw Error('Resume requires one exact earned local origin');
  return exact[0].origin;
}
export function warningVisible(element) {
  return !!element && !element.hidden && !element.classList.contains('hidden') && element.getClientRects().length > 0;
}
export function qualifiedVisibleFinish(terminal, savedStars) {
  return terminal.finished === true && savedStars > 0 && terminal.heading.startsWith('挑战成功！');
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
    if (queue.length < 12 || width < 4 || height < 4 || width > 45 || height > 45 || width / height >= 2.5 || height / width >= 2.5) continue;
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
