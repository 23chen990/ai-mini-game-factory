/** Pure arcade presentation. Never mutates native driving, result or save state. */
import { V11_COURSES,createV11CourseGeometry,v11RaceFraction } from './v11-course-director.mjs';
import { raceDistanceM } from './session.mjs';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = value => typeof value === 'number' && Number.isFinite(value);

/** Bring a selected stage into the same home rail without changing progress. */
export function stageRailScrollLeft(viewportWidth,scrollWidth,itemLeft,itemWidth) {
  if(![viewportWidth,scrollWidth,itemLeft,itemWidth].every(finite)||
     viewportWidth<=0||scrollWidth<=0||itemWidth<=0)return 0;
  return clamp(itemLeft+itemWidth/2-viewportWidth/2,0,Math.max(0,scrollWidth-viewportWidth));
}

/** Same V11 road controls as runtime, clipped at the single-run finish by length. */
export function raceCoursePreview(course) {
  const id = typeof course === 'string' ? course.replace(/^race-/, '') : '';
  if(!Object.hasOwn(V11_COURSES,id))return null;
  const {planPoints,perimeterM,identity}=createV11CourseGeometry(id);
  const fraction=v11RaceFraction(course);
  if(fraction===1)return {id,points:planPoints,closed:true,fraction,identity};
  const finish=perimeterM*fraction,points=[planPoints[0].slice()];
  let along=0;
  for(let i=0;i<planPoints.length;i++){
    const a=planPoints[i],b=planPoints[(i+1)%planPoints.length];
    const segment=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(along+segment>=finish){
      const t=segment>0?(finish-along)/segment:0;
      points.push(a.map((value,axis)=>value+(b[axis]-value)*t));
      break;
    }
    points.push(b.slice());along+=segment;
  }
  return {id,points,closed:false,fraction,identity};
}

/** Sketch the exact drivable course prefix; omit the hidden uphill connector. */
export function careerCourseSvg(course) {
  const preview=raceCoursePreview(course);
  if(!preview)return '';
  const {id,points,closed}=preview;
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), dx = Math.max(1, Math.max(...xs) - x0), dy = Math.max(1, Math.max(...ys) - y0);
  const scale = Math.min(206 / dx, 106 / dy);
  const left = (240 - dx * scale) / 2, top = (134 - dy * scale) / 2;
  const position = point => [+(left + (point[0] - x0) * scale).toFixed(1), +(top + (point[1] - y0) * scale).toFixed(1)];
  const path = points.map((p, index) => (index ? 'L' : 'M') + position(p).join(' ')).join(' ') + (closed?' Z':'');
  const [sx, sy] = position(points[0]);
  const [fx,fy]=position(points.at(-1));
  return '<svg class="race-track-diagram" viewBox="0 0 240 134" role="img" aria-label="第' + id + '关原创赛道轮廓">' +
    '<path class="race-track-halo" d="' + path + '"/>' +
    '<path class="race-track-road" d="' + path + '"/>' +
    '<circle class="race-track-start-ring" cx="' + sx + '" cy="' + sy + '" r="6"/>' +
    '<circle class="race-track-start" cx="' + sx + '" cy="' + sy + '" r="3"/>' +
    (closed?'':'<rect class="race-track-finish" x="'+(fx-4)+'" y="'+(fy-4)+'" width="8" height="8" rx="1"/>')+
    '</svg>';
}

/** Real native race distance; presentation-only, without completing any objective. */
export function raceProgressPercent(player, track, stage) {
  if(!finite(track?.length)||track.length<=0||!Number.isInteger(stage?.laps)||stage.laps<1||
     !finite(player?.progress))return 0;
  const distance=raceDistanceM(track.length,stage);
  return clamp(Math.round(player.progress / distance * 100), 0, 100);
}

/** Preserve the provider outcome instead of calling every error a cancelled ad. */
export function rewardedStageStatus(status) {
  return ({
    cancelled:'广告已取消，下一关未解锁',
    failed:'广告加载失败，下一关未解锁',
    'timed-out':'广告请求超时，下一关未解锁',
    stale:'比赛状态已变化，未解锁下一关',
    'save-failed':'广告已完成，但解锁未能保存',
    unavailable:'当前没有可用广告',
    busy:'正在处理另一条广告',
  })[status]??'未确认广告完成，下一关未解锁';
}

/** Podium placement is the medal rule for every stage. Keep only actual
 * timed failure conditions here; elimination has its own physical meter.
 * Optional drift/pass/pickup counts belong in results, not as a false gate. */
export function compactRaceObjective(stage,stats={},raceTime=0) {
  if(!stage||typeof stage.kind!=='string')return '';
  const n=value=>finite(value)?Math.max(0,value):0;
  switch(stage.kind) {
    case 'time':
    case 'relay':
      return '剩余 '+Math.max(0,Math.ceil(n(stats.timeAllowance)-n(raceTime)))+'s';
    default:return '';
  }
}
