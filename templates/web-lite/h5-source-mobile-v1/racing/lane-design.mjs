/**
 * Deliberate "inside line vs reward lane" choices using existing native pads.
 * All original pad locations/counts are retained; only lateral placement changes.
 * No extra mesh types, collisions, currency or server features are introduced.
 */
export const PAD_LANES = Object.freeze({
  city: Object.freeze([
    { at: [-120,-151], lat: 6 }, { at: [205,-8], lat:-6 },
    { at: [-262,8],lat:-4 }, {at:[-262,8],lat:4},
  ]),
  aegean: Object.freeze([
    {at:[-60,-178],lat:5},{at:[120,115],lat:-5},
  ]),
  egypt: Object.freeze([
    {at:[2,-60],lat:0},{at:[300,20],lat:-6},
  ]),
  snow: Object.freeze([
    {at:[-60,-200],lat:5},{at:[-20,120],lat:-5},
  ]),
});
export const MAX_SAFE_LATERAL = Object.freeze({city:8.5,aegean:7.5,egypt:8.5,snow:8});
const equalAnchor = (a,b) => Array.isArray(a) && Array.isArray(b) && a.length===b.length && a.every((v,i)=>v===b[i]);
export function applyLaneDesign(maps) {
  if(!Array.isArray(maps))throw Error('Pinned MAPS array missing');
  let changed=0;
  for(const [mapId, placements] of Object.entries(PAD_LANES)) {
    const map=maps.find(x=>x.id===mapId);
    if(!map?.track?.boostPads || map.track.boostPads.length!==placements.length)
      throw Error(mapId+': original native boost pad list changed');
    if(map.__racingV31Lanes===true){changed++;continue;}
    for(const [i,plan] of placements.entries()) {
      const pad=map.track.boostPads[i];
      if(!equalAnchor(pad.at,plan.at))throw Error(mapId+': boost pad world anchor changed');
      if(Math.abs(plan.lat)>MAX_SAFE_LATERAL[mapId])
        throw Error(mapId+': requested pad outside safe road width');
      pad.lat=plan.lat;
    }
    Object.defineProperty(map,'__racingV31Lanes',{value:true,enumerable:false});
    changed++;
  }
  return changed;
}
