/**
 * Offline native-road time proxy, not a PlayerCar run and not a human lap.
 * Compare the SAME original Catmull-Rom road versus its physical apex fork
 * under identical corner-acceleration and braking assumptions.
 * No scoring, AI cheats, UI assists or game speed alterations.
 */
const wrap=v=>Math.atan2(Math.sin(v),Math.cos(v));
const safe=n=>Number.isFinite(n);
const round=(x,d=2)=>+x.toFixed(d);
function timeOnPath(points,{cruise,cornerAcceleration,brake,accel}){
  if(points.length<8||points.some(p=>!safe(p.d)||!safe(p.hd)))throw Error('Invalid sampled native fork path');
  const at=position=>{
    let lo=0,hi=points.length-1;
    while(lo+1<hi){const mid=(lo+hi)>>1;if(points[mid].d<position)lo=mid;else hi=mid;}
    return Math.abs(points[hi].d-position)<Math.abs(points[lo].d-position)?points[hi]:points[lo];
  };
  // Look across a true physical 14m window, not adjacent 1m Catmull samples,
  // or the result would exaggerate tiny numerical heading ripples.
  const limit=points.map(p=>{
    const left=at(Math.max(points[0].d,p.d-7));
    const right=at(Math.min(points.at(-1).d,p.d+7));
    const span=Math.max(1,right.d-left.d);
    const curvature=Math.abs(wrap(right.hd-left.hd))/span;
    return {curve:curvature,speed:Math.min(cruise,Math.sqrt(cornerAcceleration/Math.max(curvature,.00005)))};
  });
  const v=limit.map(x=>Math.max(8,x.speed));
  // A correct line must brake before the apex, then physically accelerate
  // out. The approach starts with a shared assumed cruising speed.
  for(let i=v.length-2;i>=0;i--){
    const ds=points[i+1].d-points[i].d;
    if(!(ds>0))throw Error('Nonmonotone native road distances');
    v[i]=Math.min(v[i],Math.sqrt(v[i+1]*v[i+1]+2*brake*ds));
  }
  v[0]=Math.min(v[0],cruise);
  for(let i=1;i<v.length;i++){
    const ds=points[i].d-points[i-1].d;
    v[i]=Math.min(v[i],Math.sqrt(v[i-1]*v[i-1]+2*accel*ds));
  }
  let total=0,maxCurve=0,belowCruise=0;
  for(let i=1;i<points.length;i++){
    const ds=points[i].d-points[i-1].d;
    total+=2*ds/(v[i]+v[i-1]);
    maxCurve=Math.max(maxCurve,limit[i].curve);
    if(v[i]<cruise*.8)belowCruise+=ds;
  }
  return {seconds:round(total),maxCurvature:round(maxCurve,4),
    slowedMeters:round(belowCruise,1),minCornerSpeed:round(Math.min(...v),1)};
}
function pointsOnMain(track,start,end){
  const count=Math.ceil((end-start)/2.75),points=[];
  for(let i=0;i<=count;i++){
    const d=start+(end-start)*i/count,s=track.sample(d,{});
    points.push({d:d-start,hd:s.hd});
  }
  return points;
}
function pointsOnFork(fork){
  // Keep true physical arc lengths; sample the last one even when stride
  // does not land exactly at the branch endpoint.
  const selected=fork.samples.filter((_,i)=>i%3===0);
  if(selected.at(-1)!==fork.samples.at(-1))selected.push(fork.samples.at(-1));
  return selected.map(s=>({d:s.arc,hd:s.hd}));
}
export function benchmarkV9Fork(track,fork){
  if(!track||!fork||!fork.v9||!(fork.end>fork.start)||fork.samples.length<20)
    throw Error('V9 native shortcut required for time comparison');
  const main=pointsOnMain(track,fork.start,fork.end),branch=pointsOnFork(fork);
  const skilled={cruise:43,cornerAcceleration:43,brake:30,accel:21};
  const novice={cruise:38,cornerAcceleration:25,brake:25,accel:18};
  const s0=timeOnPath(main,skilled),s1=timeOnPath(branch,skilled);
  const n0=timeOnPath(main,novice),n1=timeOnPath(branch,novice);
  return {
    mainMeters:round(fork.end-fork.start,1),
    branchMeters:round(fork.length,1),
    physicalSavingMeters:round(fork.gain,1),
    widthRatio:round(fork.neckWidth/(track.halfW*2),3),
    skilled:{mainSeconds:s0.seconds,branchSeconds:s1.seconds,
      estimatedGainSeconds:round(s0.seconds-s1.seconds),
      mainApexCurvature:s0.maxCurvature,branchApexCurvature:s1.maxCurvature,
      branchCornerMinMps:s1.minCornerSpeed},
    novice:{mainSeconds:n0.seconds,branchSeconds:n1.seconds,
      estimatedGainSeconds:round(n0.seconds-n1.seconds),
      branchCornerMinMps:n1.minCornerSpeed},
    model:'Native physical centerline curvature + speed limit + finite braking/acceleration; NOT timed PlayerCar/AI and NOT evidence of natural human success',
  };
}
