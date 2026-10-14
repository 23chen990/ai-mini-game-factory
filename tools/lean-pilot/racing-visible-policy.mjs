/** Only framebuffer colors/shape, never item coordinates or racer state. */
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
    const target = memory.forward ?? [-h[0], -h[1]];
    const angle = angleTo(target);
    memory.recovery = { target, started: now, direction: angle >= 0 ? 'left' : 'right' };
  }
  memory.heading = h; memory.at = now;
  if (memory.recovery) {
    const { target, started, direction } = memory.recovery, angle = angleTo(target);
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
  const y0 = Math.floor(H * .34), y1 = Math.floor(H * .53);
  for (let y = y0; y < y1; y++) for (let x = Math.floor(W * .2); x < W * .8; x++) {
    const i = y * W + x, j = i * 4;
    mask[i] = data[j] < 170 && data[j + 1] > 130 && data[j + 1] < 246 && data[j + 2] > 236 && data[j + 2] - data[j] > 70 ? 1 : 0;
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
    if (queue.length >= 12 && width >= 4 && height >= 4 && width <= 45 && height <= 45 && width / height < 2.5 && height / width < 2.5)
      candidates.push({ x: (x0 + x1) / 2, y: (ya + yb) / 2, width, height, pixels: queue.length });
  }
  const target = candidates.sort((a, b) => b.y - a.y || b.pixels - a.pixels)[0];
  if (!target) return null;
  return { direction: target.x < W / 2 - 14 ? 'left' : target.x > W / 2 + 14 ? 'right' : null, target, source: 'visible-cyan-cube-pixels' };
}
