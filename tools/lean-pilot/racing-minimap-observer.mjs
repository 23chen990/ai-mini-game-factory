/* global document */
// QA-only framebuffer observer. No native state, track, or progression reads.
export function minimapPolicy(radius) {
  // Recover from an item spin using the same visible wrong-way warning a player sees.
  // The former QA policy blindly followed its arrow backwards around the whole track.
  const warning = document.querySelector('#warn');
  const wrongWay = !!warning?.getClientRects().length && !warning.classList.contains('hidden') && warning.textContent.includes('方向错误');
  const c = document.querySelector('#mm');
  const W = c.width, H = c.height, rgba = c.getContext('2d').getImageData(0, 0, W, H).data;
  const yellow = new Uint8Array(W * H), seen = new Uint8Array(W * H), components = [];
  for (let i = 0; i < yellow.length; i++) yellow[i] = rgba[i * 4] > 235 && rgba[i * 4 + 1] > 175 && rgba[i * 4 + 1] < 235 && rgba[i * 4 + 2] < 95 ? 1 : 0;
  for (let i = 0; i < yellow.length; i++) {
    if (!yellow[i] || seen[i]) continue;
    const queue = [i], points = []; seen[i] = 1;
    for (let j = 0; j < queue.length; j++) {
      const p = queue[j], x = p % W, y = Math.floor(p / W); points.push({ x, y });
      for (const n of [p - W, p + W, x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1]) if (n >= 0 && n < yellow.length && yellow[n] && !seen[n]) { seen[n] = 1; queue.push(n); }
    }
    if (points.length > 70) components.push(points);
  }
  // The stroked arrow has only a 15-pixel extent at cardinal/diagonal raster
  // angles. An axis-aligned >15 gate loses it exactly on common road headings.
  // Elongation is rotation-invariant and rejects round yellow opponent markers.
  const arrows = components.filter(points => {
    const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    const xx = points.reduce((sum, p) => sum + (p.x - x) ** 2, 0);
    const yy = points.reduce((sum, p) => sum + (p.y - y) ** 2, 0);
    const xy = points.reduce((sum, p) => sum + (p.x - x) * (p.y - y), 0);
    return Math.hypot(xx - yy, 2 * xy) / (xx + yy) > .18;
  });
  const points = arrows.sort((a, b) => b.length - a.length)[0];
  if (!points) return { direction: null, reason: 'player-arrow-not-visible' };
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length, cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  const xx = points.reduce((s, p) => s + (p.x - cx) ** 2, 0), yy = points.reduce((s, p) => s + (p.y - cy) ** 2, 0), xy = points.reduce((s, p) => s + (p.x - cx) * (p.y - cy), 0);
  const axis = .5 * Math.atan2(2 * xy, xx - yy); let hx = Math.cos(axis), hy = Math.sin(axis);
  if (points.reduce((s, p) => s + ((p.x - cx) * hx + (p.y - cy) * hy) ** 3, 0) < 0) { hx *= -1; hy *= -1; }
  const targets = [], roadPoints = [];
  for (let y = Math.max(0, Math.floor(cy - radius - 2)); y < Math.min(H, cy + radius + 2); y++) for (let x = Math.max(0, Math.floor(cx - radius - 2)); x < Math.min(W, cx + radius + 2); x++) {
    const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy), i = (y * W + x) * 4;
    const white = rgba[i] > 205 && rgba[i + 1] > 205 && rgba[i + 2] > 205;
    const bridge = rgba[i] < 110 && rgba[i + 1] > 145 && rgba[i + 2] > 190;
    if (Math.abs(r - radius) < 1.5 && (white || bridge)) {
      roadPoints.push([dx, dy]);
      if ((hx * dx + hy * dy) / r > .35) targets.push({ x: dx, y: dy });
    }
  }
  if (!targets.length) return { direction: null, reason: 'ahead-road-not-visible', heading: [hx, hy], wrongWay, roadPoints };
  const tx = targets.reduce((s, p) => s + p.x, 0) / targets.length, ty = targets.reduce((s, p) => s + p.y, 0) / targets.length;
  const angle = Math.atan2(hx * ty - hy * tx, hx * tx + hy * ty);
  return { direction: angle > .10 ? 'left' : angle < -.10 ? 'right' : null, angle, position: [cx, cy], target: [tx, ty], heading: [hx, hy], wrongWay, roadPoints };
}
