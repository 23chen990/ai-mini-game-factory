/** Pure arcade presentation. Never mutates native driving, result or save state. */
import { COURSE_BLUEPRINTS, injectTechnicalSectors } from './track-design.mjs';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = value => typeof value === 'number' && Number.isFinite(value);

/** Sketches the actual stage blueprint; no stock art or made-up circuit outline. */
export function careerCourseSvg(course) {
  const id = typeof course === 'string' ? course.replace(/^race-/, '') : '';
  const blueprint = COURSE_BLUEPRINTS[id];
  if (!blueprint) return '';
  // Mirror the precise authored spline control points, not the old pre-S-turn
  // lobby outline. Real native Track Catmull-Rom remains authoritative on road.
  const points = injectTechnicalSectors(
    blueprint[4].split(' ').map(point => point.split(',').map(Number)),
    id, blueprint[3]);
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

/** Minimal race fact, not a gameplay coach. Native rank, timer, lap and
 * minimap already occupy the regular HUD. Only unusual stage gates get a
 * single short number (e.g. 2/5); elimination has its own physical meter.
 */
export function compactRaceObjective(stage,stats={},raceTime=0) {
  if(!stage||typeof stage.kind!=='string')return '';
  const n=value=>finite(value)?Math.max(0,value):0;
  const progress=(value,target)=>Math.min(n(target),Math.floor(n(value)))+'/'+Math.floor(n(target));
  switch(stage.kind) {
    case 'drift':return '漂移 '+progress(stats.cleanDrifts,stage.target);
    case 'overtake':return '超车 '+progress(stats.cleanPasses,stage.target);
    case 'item':return '道具 '+progress(stats.pickups,stage.target);
    case 'speed':return '测速 '+Math.floor(n(stats.gateSpeed))+'/'+Math.floor(n(stage.target));
    case 'time':
    case 'relay':
      return '剩余 '+Math.max(0,Math.ceil(n(stats.timeAllowance)-n(raceTime)))+'s';
    default:return '';
  }
}
