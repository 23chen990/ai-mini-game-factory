/** Pure arcade presentation. Never mutates native driving, result or save state. */
import { COURSE_BLUEPRINTS } from './track-design.mjs';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = value => typeof value === 'number' && Number.isFinite(value);

/** Sketches the actual stage blueprint; no stock art or made-up circuit outline. */
export function careerCourseSvg(course) {
  const id = typeof course === 'string' ? course.replace(/^race-/, '') : '';
  const blueprint = COURSE_BLUEPRINTS[id];
  if (!blueprint) return '';
  const points = blueprint[4].split(' ').map(point => point.split(',').map(Number));
  if (points.length < 6 || !points.every(point => point.length === 3 && point.every(finite))) return '';
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), dx = Math.max(1, Math.max(...xs) - x0), dy = Math.max(1, Math.max(...ys) - y0);
  const scale = Math.min(206 / dx, 106 / dy);
  const left = (240 - dx * scale) / 2, top = (134 - dy * scale) / 2;
  const position = point => [+(left + (point[0] - x0) * scale).toFixed(1), +(top + (point[1] - y0) * scale).toFixed(1)];
  const path = points.map((p, index) => (index ? 'L' : 'M') + position(p).join(' ')).join(' ') + ' Z';
  const [sx, sy] = position(points[0]);
  return '<svg class="race-track-diagram" viewBox="0 0 240 134" role="img" aria-label="第' + id + '关原创赛道轮廓">' +
    '<path class="race-track-halo" d="' + path + '"/>' +
    '<path class="race-track-road" d="' + path + '"/>' +
    '<circle class="race-track-start-ring" cx="' + sx + '" cy="' + sy + '" r="6"/>' +
    '<circle class="race-track-start" cx="' + sx + '" cy="' + sy + '" r="3"/>' +
    '</svg>';
}

/** Real native race distance; presentation-only, without completing any objective. */
export function raceProgressPercent(player, track, stage) {
  const distance = track?.length * stage?.laps;
  if (!finite(distance) || distance <= 0 || !finite(player?.progress)) return 0;
  return clamp(Math.round(player.progress / distance * 100), 0, 100);
}

/** Gap is measured from native completed metres, never manufactured catch-up speed. */
export function nearbyRival(game) {
  const field = game?.standings, player = game?.player;
  if (!Array.isArray(field) || !player || !finite(player.progress)) return null;
  const rank = field.indexOf(player);
  if (rank < 0) return null;
  const opponent = rank > 0 ? field[rank - 1] : field[1];
  if (!opponent || !finite(opponent.progress) || opponent.finished) return null;
  const distance = Math.abs(opponent.progress - player.progress);
  if (distance > 105 || distance < 1) return null;
  return { label: rank > 0 ? '追击前车' : '守住领先', metres: Math.round(distance), threat: rank === 0 && distance < 28 };
}

/** Only real native events can trigger these player-facing micro-rewards. */
export function raceEventMoment(event) {
  switch (event?.type) {
    case 'driftEnd':
      return event.data?.clean === true && Number(event.data?.time ?? event.time) > .22
        ? { title: '漂亮过弯', kind: 'skill' } : null;
    case 'pad':
      return { title: '加速带！', kind: 'boost' };
    case 'small':
    case 'smallBoost':
      return { title: '小喷！', kind: 'boost' };
    case 'itemGet':
      return { title: '道具到手', kind: 'item' };
    default:
      return null;
  }
}
