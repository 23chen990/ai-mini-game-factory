/** One native straight-line nitro response per rival/lap when a skilled player leads.
 * Never changes position, lap, standings, speed, physics or finish status.
 */
export class RivalPressure {
  constructor() { this.reset(); }
  reset() { this.lastAt=-Infinity; this.lastLap=new WeakMap(); }
  frame(game,stage) {
    if (!game || game.state!=='race' || !game.player || !game.track ||
        !stage || stage.diff<1 || stage.mode!=='speed' ||
        !['city','egypt'].includes(stage.map)) return null;
    const {player,track}=game;
    if (!Array.isArray(game.racers) || !Array.isArray(game.standings) ||
        game.standings[0]!==player || !Number.isFinite(game.raceTime) ||
        game.raceTime<15 || game.raceTime-this.lastAt<18 ||
        player.finished || player.spin>0 || player.wrongWay>.4 ||
        player.s<24 || !Number.isFinite(track.length) || track.length<=0 ||
        typeof track.curvAhead!=='function') return null;
    let chosen=null;
    for(const rival of game.racers) {
      if (!rival || rival.isPlayer || rival.finished ||
          !Number.isFinite(rival.progress) || !Number.isFinite(rival.dist) ||
          !Number.isFinite(rival.nitroCd) || rival.nitroCd<2 || rival.nitroCd>6 ||
          (rival.nitroTime??0)>0 || (rival.spin??0)>0 || rival.s<30) continue;
      const gap=player.progress-rival.progress;
      if(!Number.isFinite(gap) || gap<15 || gap>135) continue;
      const lap=Math.floor(Math.max(0,rival.progress)/track.length);
      if(this.lastLap.get(rival)===lap)continue;
      if(Math.abs(track.curvAhead(rival.dist,120))>.0065)continue;
      if(!chosen || gap<chosen.gap)chosen={rival,gap,lap};
    }
    if(!chosen)return null;
    chosen.rival.nitroCd=1; // Let native AICar use nitro normally after this cooldown.
    this.lastLap.set(chosen.rival,chosen.lap);this.lastAt=game.raceTime;
    return {name:chosen.rival.name||'对手',gap:Math.round(chosen.gap)};
  }
}
