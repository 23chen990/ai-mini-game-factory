/** V4.1: deliberately visible native-on-track competitors.
 * A novice race still teaches two-key controls. From race 02 onward, the
 * middle of the field stays catchable while the fastest opponent can contest
 * the lead. AICar.update remains the only source of physical movement,
 * cornering, nitro use and actual results: no position/progress edits.
 *
 * Don't confuse this model change with proof of human difficulty. Compare
 * native lap times and real mobile races before changing bosses/timed goals.
 */
export const OPPONENT_PACE_V41 = Object.freeze({
  '02':{from:[.55,.75],to:[.86,1.22],ace:.17},
  '04':{from:[.55,.75],to:[.84,1.23],ace:.17},
  '05':{from:[.55,.75],to:[.83,1.20],ace:.15},
  '03':{from:[.85,1.05],to:[1.04,1.44],ace:.14},
  '06':{from:[.85,1.05],to:[1.00,1.42],ace:.12},
  '07':{from:[.85,1.05],to:[1.18,1.34],ace:0},
  '08':{from:[.85,1.05],to:[1.07,1.45],ace:.16},
  '09':{from:[.85,1.05],to:[1.18,1.34],ace:0},
  '10':{from:[.85,1.05],to:[1.06,1.45],ace:.13},
  '12':{from:[.85,1.05],to:[1.18,1.34],ace:0},
  '11':{from:[1.20,1.38],to:[1.20,1.50],ace:.12},
  '14':{from:[1.20,1.38],to:[1.21,1.53],ace:.13},
});
// Older test fixtures and downstream imports continue to resolve.
export const OPPONENT_PACE_V39 = OPPONENT_PACE_V41;
const nativeSkillByCar=new WeakMap();
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

export function tuneOpponentField(racers,stage) {
  const id=typeof stage?.course==='string'&&/^race-\d{2}$/.test(stage.course)
    ? stage.course.slice(5)
    : typeof stage?.id==='string'&&/^\d{2}$/.test(stage.id) ? stage.id : null;
  if(!id||id==='01'||stage.kind==='boss'||(stage.kind==='item'&&stage.diff===2)||
     !Array.isArray(racers))return {adjusted:0,ace:false};
  const config=OPPONENT_PACE_V41[id];
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
    // One track-bound ace per race, never five identically overpowered cars.
    // Native AICar still applies actual corners, starting delay and braking.
    leader.skill=+Math.min(dstHigh+.17,leader.skill+config.ace).toFixed(4);
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
