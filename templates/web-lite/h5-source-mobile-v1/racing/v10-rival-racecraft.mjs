/** Actual AI driving lines for V10:
 * AI vehicles still move by original fixed-dt acceleration, lateral
 * acceleration, tire grip and collisions. No rank edits, speed teleports or
 * user-specific rubber-banding. Rival position influences LANE CHOICE only.
 */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function v10AiCornerBudget(skill,track,d){
  const ability=Number.isFinite(skill)?clamp(skill,.65,2):1;
  const fraction=Number.isFinite(d)?d/Math.max(track?.length??1,1):0;
  const half=typeof track?.v9WidthAt==='function'?
    track.v9WidthAt((fraction%1)*track.length) : track?.halfW??9;
  const ratio=clamp(half/Math.max(1,track?.halfW??9),.83,1.08);
  // Narrow approaches genuinely cost lateral grip; faster AI must earn
  // overtakes from speed retained through CORNERS, not arbitrary bonuses.
  return (20+34*ability)*Math.min(1,ratio+.08);
}
export function v10AiRacingLine(ai,track,natural,hw){
  if(!Number.isFinite(hw)||hw<3||!Number.isFinite(natural))return natural;
  const other=ai?.__V10_RIVAL_PLAYER__;
  if(!track?.__V10_STAGE_IDENTITY__||!other||other.finished||
     !Number.isFinite(other.progress)||!Number.isFinite(ai?.dist)||
     !!ai.__V8_FORK_STATE__)return natural;
  const gap=other.progress-ai.dist;
  if(gap< -38||gap>70)return natural;
  const side=clamp(Number.isFinite(other.lat)?other.lat:0,-hw,hw);
  const curv=typeof track.curvAhead==='function'?
    track.curvAhead(ai.dist,Math.min(100,24+Math.max(0,ai.s??0))):0;
  // Occupied side -> choose a free, real lateral lane. At the next
  // physical corner prefer the exit inside line; never overlap rival.
  const free=side>=0?-1:1,defense=-Math.sign(curv||free);
  const intent=gap>5 ? .70*free+.30*defense : .45*free+.55*defense;
  const desired=clamp(intent*hw*.54,-hw+.8,hw-.8);
  const weight=gap>45?.13:.26;
  return clamp(natural*(1-weight)+desired*weight,-hw+.5,hw-.5);
}
export function v10AiNitroAllowed(ai,track,d){
  if(!track?.__V10_STAGE_IDENTITY__||!track.__RACE_SHORTCUT__)return true;
  if(ai?.__V8_FORK_STATE__)return false;
  const f=track.__RACE_SHORTCUT__,d0=((d%track.length)+track.length)%track.length;
  // Don't blow nitro into a short apex: player skill can beat an AI which
  // intelligently conserves its existing, legitimately earned stock.
  return d0<f.start-105||d0>f.end+30;
}
