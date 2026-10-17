/**
 * V8 prototype: authored elevation signatures and meaningful extra road length.
 * This module is deliberately independent of THREE. Existing V7 layouts and
 * historical records remain byte-identical unless a build opts in to V8.
 *
 * All elevations are ROAD elevations in metres; the profile is sampled along
 * planar arclength, not by vertex index. Road mesh and driving physics are
 * subsequently created by the original native Track from these coordinates.
 * Smooth interpolation avoids sudden Z-grade cliffs at authored spline knots.
 */
const CONFIG = [
  ['01',1.42,[[0,0],[.16,0],[.29,13],[.39,17],[.52,17],[.64,3],[.82,0],[1,0]],'street overpass'],
  ['02',1.29,[[0,0],[.12,6],[.22,24],[.32,7],[.43,30],[.54,8],[.64,31],[.77,5],[.91,2],[1,0]],'dune crests'],
  ['03',1.22,[[0,0],[.13,1],[.29,30],[.43,31],[.55,3],[.69,32],[.81,5],[1,0]],'split-level flyover'],
  ['04',1.16,[[0,0],[.17,25],[.31,38],[.47,21],[.62,39],[.78,12],[.9,4],[1,0]],'coastal switchbacks'],
  ['05',1.20,[[0,0],[.17,7],[.32,29],[.47,27],[.56,9],[.72,23],[.84,0],[1,0]],'temple bridge'],
  ['06',1.15,[[0,0],[.12,0],[.26,26],[.39,25],[.55,3],[.68,27],[.81,5],[1,0]],'city tunnels'],
  ['07',2.0,[[0,68],[.08,68],[.17,53],[.24,53],[.31,36],[.38,36],[.45,20],[.52,20],[.59,4],[.70,4],[.82,2],[.91,38],[1,68]],'cliff descent'],
  ['08',1.17,[[0,0],[.14,24],[.29,35],[.42,11],[.57,37],[.68,26],[.84,5],[1,0]],'glacial ridge'],
  ['09',1.16,[[0,0],[.19,6],[.30,22],[.41,5],[.53,27],[.63,3],[.75,18],[.9,0],[1,0]],'dune timing'],
  ['10',1.09,[[0,0],[.19,5],[.32,24],[.45,26],[.54,6],[.70,4],[.79,25],[.92,1],[1,0]],'urban vertical shortcut'],
  ['11',1.12,[[0,0],[.19,21],[.33,39],[.44,37],[.53,25],[.68,36],[.83,4],[1,0]],'serpent mountain'],
  ['12',1.11,[[0,0],[.17,32],[.29,33],[.45,5],[.59,35],[.76,4],[.87,9],[1,0]],'ice bridge'],
  ['13',1.09,[[0,0],[.16,5],[.3,36],[.4,38],[.53,16],[.64,7],[.77,32],[.93,0],[1,0]],'boss flyover'],
  ['14',1.12,[[0,0],[.15,12],[.27,36],[.39,7],[.53,41],[.64,10],[.79,26],[.93,1],[1,0]],'twin crests'],
  ['15',1.11,[[0,0],[.16,7],[.28,35],[.39,29],[.55,11],[.69,37],[.8,17],[.93,1],[1,0]],'polar hairpins'],
  ['16',1.09,[[0,0],[.18,27],[.3,46],[.42,47],[.54,39],[.69,18],[.81,25],[.94,0],[1,0]],'crown cliffs'],
  ['17',1.12,[[0,0],[.15,2],[.27,19],[.37,20],[.51,2],[.64,27],[.78,1],[.9,10],[1,0]],'neon elevation'],
  ['18',1.12,[[0,0],[.13,4],[.25,29],[.36,11],[.51,4],[.65,37],[.76,34],[.9,2],[1,0]],'dual ravines'],
  ['19',1.10,[[0,0],[.12,17],[.27,40],[.38,12],[.5,4],[.64,34],[.73,27],[.87,3],[1,0]],'tidal crossways'],
  ['20',1.11,[[0,0],[.14,12],[.29,31],[.4,9],[.55,41],[.68,11],[.82,25],[.94,0],[1,0]],'crystal summit'],
  ['21',1.08,[[0,0],[.14,0],[.29,2],[.39,14],[.53,15],[.65,0],[.81,0],[1,0]],'flat speedway'],
  ['22',1.8,[[0,50],[.13,41],[.24,29],[.36,29],[.44,15],[.57,7],[.69,3],[.84,0],[.9,35],[1,50]],'serrated canyon'],
  ['23',1.08,[[0,0],[.12,13],[.28,25],[.4,7],[.5,32],[.62,2],[.75,38],[.86,12],[1,0]],'island ramps'],
  ['24',1.08,[[0,0],[.19,2],[.32,8],[.43,2],[.57,22],[.7,8],[.83,0],[1,0]],'snow hook'],
  ['25',1.08,[[0,0],[.13,17],[.24,31],[.38,6],[.54,34],[.65,34],[.79,5],[.92,1],[1,0]],'urban split tracks'],
  ['26',1.08,[[0,0],[.16,8],[.29,43],[.39,39],[.5,11],[.64,32],[.75,12],[.89,0],[1,0]],'sunset stone ring'],
  ['27',1.07,[[0,0],[.13,23],[.23,8],[.34,38],[.45,9],[.56,49],[.67,21],[.79,40],[.9,3],[1,0]],'cloud waves'],
  ['28',1.07,[[0,0],[.12,16],[.25,44],[.36,10],[.51,37],[.66,16],[.78,47],[.9,3],[1,0]],'aurora triple forks'],
  ['29',1.07,[[0,0],[.17,4],[.29,23],[.41,25],[.52,2],[.66,31],[.81,5],[.91,18],[1,0]],'night interchange'],
  ['30',1.07,[[0,0],[.13,25],[.24,47],[.36,50],[.48,22],[.59,9],[.72,43],[.82,32],[.92,5],[1,0]],'skyline final'],
];
export const V8_COURSES = Object.freeze(Object.fromEntries(CONFIG.map(([id,stretch,knots,feature]) =>
  [id,Object.freeze({id,stretch,knots:Object.freeze(knots.map(p=>Object.freeze(p))),feature})]
)));
const smooth = t => t*t*(3-2*t);
export function sampleElevation(knots, fraction) {
  if (!Array.isArray(knots) || knots.length<2 || !Number.isFinite(fraction)) throw Error('Invalid V8 elevation request');
  const t=Math.min(1,Math.max(0,fraction));
  for(let i=1;i<knots.length;i++) {
    const a=knots[i-1],b=knots[i];
    if(t<=b[0]){
      const s=smooth((t-a[0])/(b[0]-a[0]));
      return a[1]+(b[1]-a[1])*s;
    }
  }
  return knots.at(-1)[1];
}
/** Preserve the control-point XY topology, add authored relief and longer
 * genuinely physical kilometres without changing collision/score directly.
 */
export function applyV8CourseGeometry(local,id,baseScale) {
  const cfg=V8_COURSES[id];
  if(!cfg || !Number.isFinite(baseScale) || baseScale<=0 ||
     !Array.isArray(local) || local.length<12) throw Error('Invalid V8 course');
  const n=local.length;
  const ds=local.map((a,i)=>Math.hypot(local[(i+1)%n][0]-a[0],local[(i+1)%n][1]-a[1]));
  const perimeter=ds.reduce((a,b)=>a+b,0);
  if(perimeter<1000)throw Error('V8 road has too little real length');
  let along=0;
  const points=local.map((p,i)=>{
    if(p.length!==3 || !p.every(Number.isFinite))throw Error('Invalid V8 road vertex');
    const h=sampleElevation(cfg.knots,along/perimeter);
    along+=ds[i];
    return [p[0],p[1],+h.toFixed(4)];
  });
  // The unchanged native Catmull-Rom loop owns all driving interpolation.
  const totalScale=baseScale*cfg.stretch;
  const maxHeight=Math.max(...points.map(p=>p[2]));
  const maxSegmentGrade=points.reduce((m,a,i)=>{
    const b=points[(i+1)%n],dist=Math.hypot(b[0]-a[0],b[1]-a[1])*totalScale;
    return Math.max(m,Math.abs(a[2]-b[2])/Math.max(.1,dist));
  },0);
  if(maxHeight>70 || maxSegmentGrade>.21)
    throw Error('V8 course elevation requires re-authoring '+id+': '+maxSegmentGrade.toFixed(3));
  return {points,scale:totalScale,feature:cfg.feature,maxSegmentGrade,perimeterM:perimeter*totalScale};
}
export function validateV8CourseProfiles() {
  if(CONFIG.length!==30)throw Error('V8 requires all 30 courses');
  const ids=new Set(),shapes=new Set();
  for(const [id,stretch,knots,feature] of CONFIG) {
    if(ids.has(id)||!/^\d{2}$/.test(id)||!feature||stretch<1||stretch>(['07','22'].includes(id)?2.1:1.5)||
       knots[0][0]!==0||knots.at(-1)[0]!==1||
       knots[0][1]!==knots.at(-1)[1]||
       knots.some(([t,h],i)=>t<0||t>1||h<0||h>70||
         (i>0 && t<=knots[i-1][0])))throw Error('Invalid V8 profile '+id);
    const signature=knots.map(x=>x.join(':')).join('/');
    if(shapes.has(signature))throw Error('Duplicated V8 height profile '+id);
    ids.add(id);shapes.add(signature);
  }
  return ids.size;
}
validateV8CourseProfiles();
