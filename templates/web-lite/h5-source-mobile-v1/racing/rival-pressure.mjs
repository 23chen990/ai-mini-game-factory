/** V3.9: one measured increase to the pace of ACTUAL native AI cars.
 * Unlike teleporting/rubber-band hacks, this only configures the existing
 * AICar.skill once per race. Native AICar.update still drives each vehicle:
 * it respects corner curvature, acceleration, items, nitro and real finish.
 *
 * Stage policy is intentionally asymmetric:
 * - Stage 01 teaches controls; novices 02/04 and item 05 were too passive.
 * - Mid regular races get a slight front-rival improvement.
 * - 07 time / 09 relay / 12 elimination retain their previous pace.
 * - The difficult 13/16 bosses and 15 item race never receive a buff.
 * - Daily inherits the difficulty of its ORIGINAL career course.
 */
export const OPPONENT_PACE_V39=Object.freeze({
  '02':{from:[.55,.75],to:[.67,.86],ace:.03},
  '04':{from:[.55,.75],to:[.67,.86],ace:.03},
  '05':{from:[.55,.75],to:[.62,.81],ace:.02},
  '03':{from:[.85,1.05],to:[1.20,1.36],ace:.025},
  '06':{from:[.85,1.05],to:[1.05,1.20],ace:.015},
  '07':{from:[.85,1.05],to:[1.18,1.34],ace:0},
  '08':{from:[.85,1.05],to:[1.20,1.36],ace:.025},
  '09':{from:[.85,1.05],to:[1.18,1.34],ace:0},
  '10':{from:[.85,1.05],to:[1.05,1.20],ace:.02},
  '12':{from:[.85,1.05],to:[1.18,1.34],ace:0},
  '11':{from:[1.20,1.38],to:[1.20,1.38],ace:.025},
  '14':{from:[1.20,1.38],to:[1.20,1.38],ace:.03},
});
const nativeSkillByCar=new WeakMap();
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

export function tuneOpponentField(racers,stage) {
  const id=typeof stage?.course==='string'&&/^race-\d{2}$/.test(stage.course)
    ? stage.course.slice(5)
    : typeof stage?.id==='string'&&/^\d{2}$/.test(stage.id) ? stage.id : null;
  if(!id||id==='01'||stage.kind==='boss'||(stage.kind==='item'&&stage.diff===2)||
     !Array.isArray(racers))return {adjusted:0,ace:false};
  const config=OPPONENT_PACE_V39[id];
  if(!config||!Number.isInteger(stage.diff)||
    (stage.diff===0&&config.from[0]!==.55)||
    (stage.diff===1&&config.from[0]!==.85)||
    (stage.diff===2&&config.from[0]!==1.20))
    return {adjusted:0,ace:false};
  const field=racers.filter(r=>r&&!r.isPlayer&&Number.isFinite(r.skill));
  if(!field.length)return {adjusted:0,ace:false};
  const [srcLow,srcHigh]=config.from,[dstLow,dstHigh]=config.to;
  let leader=null,leaderBase=-Infinity;
  for(const rival of field) {
    if(!nativeSkillByCar.has(rival))nativeSkillByCar.set(rival,rival.skill);
    const base=nativeSkillByCar.get(rival);
    const q=clamp((base-srcLow)/(srcHigh-srcLow),0,1);
    rival.skill=+(dstLow+(dstHigh-dstLow)*q).toFixed(4);
    if(base>leaderBase){leader=rival;leaderBase=base;}
  }
  if(leader&&config.ace>0){
    // One visible ace, NOT five identically overpowered racers.
    // Allow no more than ~3% skill lift beyond the stage's highest normal AI.
    leader.skill=+Math.min(dstHigh+.032,leader.skill+config.ace).toFixed(4);
  }
  return {adjusted:field.length,ace:!!leader&&config.ace>0,
    maximum:Math.max(...field.map(r=>r.skill))};
}

/** Close-race native nitro: keeps fast rivals engaged, not rubber-band teleports.
 * Only nudges an AI's existing nitro cooldown; actual boost still requires
 * the pinned AICar.update straightaway/speed rules. Never modifies progress,
 * AI skill, speed, lap, placement, collisions or any player result.
 */
export class RivalPressure {
  constructor() { this.reset(); }
  reset() { this.lastAt=-Infinity; this.lastLap=new WeakMap(); }
  frame(game,stage) {
    if (!game || game.state!=='race' || !game.player || !game.track ||
        !stage || stage.mode!=='speed' || ['boss','elimination','relay'].includes(stage.kind) ||
        stage.course==='race-01' || stage.id==='01') return null;
    const {player,track}=game;
    if (!Array.isArray(game.racers) || !Array.isArray(game.standings) ||
        game.standings.indexOf(player)<0 || game.standings.indexOf(player)>2 ||
        game.standings.at(-1)===player ||
        !Number.isFinite(game.raceTime) ||
        game.raceTime<17 || game.raceTime-this.lastAt<19 ||
        player.finished || player.spin>0 || player.wrongWay>.4 ||
        player.s<27 || !Number.isFinite(track.length) || track.length<=0 ||
        typeof track.curvAhead!=='function') return null;
    let chosen=null;
    for(const rival of game.racers) {
      if (!rival || rival.isPlayer || rival.finished ||
          !Number.isFinite(rival.progress) || !Number.isFinite(rival.dist) ||
          !Number.isFinite(rival.nitroCd) || rival.nitroCd<2.5 || rival.nitroCd>10 ||
          (rival.nitroTime??0)>0 || (rival.spin??0)>0 || rival.s<30) continue;
      const gap=player.progress-rival.progress;
      if(!Number.isFinite(gap) || gap<9 || gap>115) continue;
      const lap=Math.floor(Math.max(0,rival.progress)/track.length);
      if(this.lastLap.get(rival)===lap)continue;
      if(Math.abs(track.curvAhead(rival.dist,120))>.006)continue;
      if(!chosen || gap<chosen.gap)chosen={rival,gap,lap};
    }
    if(!chosen)return null;
    chosen.rival.nitroCd=.65; // Native AICar still needs its own straight/speed conditions.
    this.lastLap.set(chosen.rival,chosen.lap);this.lastAt=game.raceTime;
    return {name:chosen.rival.name||'对手',gap:Math.round(chosen.gap)};
  }
}
