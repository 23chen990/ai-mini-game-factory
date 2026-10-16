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
        !stage || stage.mode!=='speed' || stage.kind==='boss' || stage.id==='01') return null;
    const {player,track}=game;
    if (!Array.isArray(game.racers) || !Array.isArray(game.standings) ||
        game.standings.indexOf(player)<0 || game.standings.indexOf(player)>2 ||
        game.standings.at(-1)===player ||
        !Number.isFinite(game.raceTime) ||
        game.raceTime<18 || game.raceTime-this.lastAt<22 ||
        player.finished || player.spin>0 || player.wrongWay>.4 ||
        player.s<27 || !Number.isFinite(track.length) || track.length<=0 ||
        typeof track.curvAhead!=='function') return null;
    let chosen=null;
    for(const rival of game.racers) {
      if (!rival || rival.isPlayer || rival.finished ||
          !Number.isFinite(rival.progress) || !Number.isFinite(rival.dist) ||
          !Number.isFinite(rival.nitroCd) || rival.nitroCd<2 || rival.nitroCd>6 ||
          (rival.nitroTime??0)>0 || (rival.spin??0)>0 || rival.s<30) continue;
      const gap=player.progress-rival.progress;
      if(!Number.isFinite(gap) || gap<10 || gap>95) continue;
      const lap=Math.floor(Math.max(0,rival.progress)/track.length);
      if(this.lastLap.get(rival)===lap)continue;
      if(Math.abs(track.curvAhead(rival.dist,120))>.0065)continue;
      if(!chosen || gap<chosen.gap)chosen={rival,gap,lap};
    }
    if(!chosen)return null;
    chosen.rival.nitroCd=1; // Native AICar must still find a proper straight.
    this.lastLap.set(chosen.rival,chosen.lap);this.lastAt=game.raceTime;
    return {name:chosen.rival.name||'对手',gap:Math.round(chosen.gap)};
  }
}
