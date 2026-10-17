/* Pure, independently authored cargo-depot arena definition.
 * Neutral dimensions are metres, X is travel axis, Z is cross-lane.
 * It is not a replica/derivative of any commercial game map. No dependencies. */
export const DEPOT_MAP_ID='depot';
const box=(id,material,x,y,z,w,h,d,collision=true)=>({
  id,material,x,y,z,w,h,d,collision
});
const pieces=[
  // Solid pedestrian slab top Y=0, interior -35.7..35.7 / -11.1..11.1
  box('ground','floor',0,-.3,0,74,.6,24),
  box('north-boundary','boundary',0,1.7,-11.8,74,3.4,.55),
  box('south-boundary','boundary',0,1.7,11.8,74,3.4,.55),
  box('west-boundary','boundary',-36.8,1.7,0,.65,3.4,24),
  box('east-boundary','boundary',36.8,1.7,0,.65,3.4,24),
  // Central depot building blocks all long straight centreline shots.
  // Walk completely around it via a quiet north bypass or a tight south dock.
  box('depot-hub','structure',0,2.35,0,9.5,4.7,4.8),
  box('depot-entry-west','steel',-8,1.9,-2.9,4.3,3.8,1.2),
  box('depot-entry-east','steel',8,1.9,3.0,4.3,3.8,1.2),
  box('gate-west','structure',-14,1.65,1.2,1.25,3.3,4.5),
  box('gate-east','structure',14,1.65,-1.2,1.25,3.3,4.5),
  // Low centre cover encourages short peek / retreat, not aim-bot duels.
  box('shelter-west','concrete',-22,0.8,.3,2.7,1.6,2.1),
  box('shelter-east','concrete',22,0.8,-.3,2.7,1.6,2.1),
  box('low-cover-left','amber',-17,0.65,-3.1,2.8,1.3,1.4),
  box('low-cover-right','amber',17,0.65,3.1,2.8,1.3,1.4),
  // North service lane: long sight distance but exposed cross angles.
  box('north-cover-west','blue',-23,1.05,-9,2.0,2.1,1.35),
  box('north-cover-mid','blue',-12,1.15,-9,2.2,2.3,1.5),
  box('north-cover-east','blue',13,1.05,-9,2.0,2.1,1.35),
  box('north-cover-far','blue',25,.7,-9,1.8,1.4,1.2),
  // South dock: staggered cargo gives intermittent close-range LOS.
  box('south-cargo-1','orange',-20,1.15,8.9,2.5,2.3,1.65),
  box('south-cargo-2','orange',-9,.8,8.9,3,1.6,1.7),
  box('south-cargo-3','orange',4,1.15,8.9,2.8,2.3,1.65),
  box('south-cargo-4','orange',20,.8,9.1,2.6,1.6,1.65),
  box('south-turn-west','steel',-4,1.6,5.0,1.5,3.2,1.8),
  box('south-turn-east','steel',10,1.6,5.1,1.5,3.2,1.8),
  // Spawn shelters: broad clear exits, never a one-way dead end.
  box('west-shelter-n','concrete',-28,1.0,-8.3,2.3,2,1.4),
  box('west-shelter-s','concrete',-27.5,.7,8.5,2.2,1.4,1.5),
  box('east-shelter-n','concrete',28,.7,-8.5,2.2,1.4,1.5),
  box('east-shelter-s','concrete',27.5,1.0,8.3,2.3,2,1.4),
  // Upper weather hood/gantries are deliberately NON-walkable;
  // the engine has 2D floor nav and no multi-floor AI support.
  box('hood-n','roof',0,5.0,-9.7,45,.3,2.1,false),
  box('hood-s','roof',0,4.9,9.7,45,.3,2.1,false),
  box('hood-cross','roof',0,5.1,0,11,.3,18,false),
  box('signal-west','red',-32,3.3,-9.8,.7,1.1,.4,false),
  box('signal-east','red',32,3.3,9.8,.7,1.1,.4,false),
  // High-contrast floor lane markings are visuals, not nav blockers.
  ...[-26,-13,0,13,26].map((x,i)=>box('stripe-n-'+i,'stripe',x,.017,-6.4,3,.02,.12,false)),
  ...[-26,-13,0,13,26].map((x,i)=>box('stripe-s-'+i,'stripe',x,.017,6.4,3,.02,.12,false))
];
export const DEPOT_PIECES=Object.freeze(pieces.map(p=>Object.freeze(p)));
const spawn=(x,z,team)=>({x,z,yaw:team==='BL'?-Math.PI/2:Math.PI/2});
export const DEPOT_SPAWNS=Object.freeze({
  BL:Object.freeze([-6,-3,0,3,6].map((z,i)=>Object.freeze(spawn(-32+(i%2)*.8,z,'BL')))),
  GR:Object.freeze([6,3,0,-3,-6].map((z,i)=>Object.freeze(spawn(32-(i%2)*.8,z,'GR'))))
});
export const DEPOT_OBJECTIVE_CANDIDATES=Object.freeze({
  BL:Object.freeze([{x:-22,z:-6.8},{x:-8,z:6.8}]),
  GR:Object.freeze([{x:22,z:6.8},{x:8,z:-6.8}])
});
/** Independent cheap geometric check only; final truth belongs to original
 * World / NavGrid, tested in a real Three.js browser build. */
export function depotWalkable(x,z,r=.42) {
  if(![x,z,r].every(Number.isFinite)||r<0||Math.abs(x)>35.8-r||Math.abs(z)>11.1-r)
    return false;
  for(const p of DEPOT_PIECES){
    if(!p.collision||p.id==='ground'||p.y-p.h/2>1.7||p.y+p.h/2<.35)continue;
    const dx=Math.max(Math.abs(x-p.x)-p.w/2,0);
    const dz=Math.max(Math.abs(z-p.z)-p.d/2,0);
    if(Math.hypot(dx,dz)<=r)return false;
  }
  return true;
}
export function depotReachable(start,end,step=.75) {
  if(!start||!end||!depotWalkable(start.x,start.z)||
     !depotWalkable(end.x,end.z)||!Number.isFinite(step)||step<=0)return false;
  const key=(x,z)=>x+','+z,n=95,m=31,x0=-35.625,z0=-11.625;
  const at=(x,z)=>({x:x0+x*step,z:z0+z*step});
  const nearest=p=>[Math.max(0,Math.min(n-1,Math.round((p.x-x0)/step))),
    Math.max(0,Math.min(m-1,Math.round((p.z-z0)/step)))];
  const [sx,sz]=nearest(start),[tx,tz]=nearest(end);
  const q=[[sx,sz]],seen=new Set([key(sx,sz)]);
  for(let i=0;i<q.length;i++){
    const [x,z]=q[i];
    if(x===tx&&z===tz)return true;
    for(const [dx,dz] of [[0,1],[0,-1],[1,0],[-1,0]]){
      const xx=x+dx,zz=z+dz,k=key(xx,zz);
      if(xx<0||zz<0||xx>=n||zz>=m||seen.has(k))continue;
      const p=at(xx,zz);
      if(!depotWalkable(p.x,p.z))continue;
      seen.add(k);q.push([xx,zz]);
    }
  }
  return false;
}
